/* 결제 vertical slice — 준비 + PG 웹훅 처리 (R5 §7 Phase 5)
   트랜잭션 경계는 R5 권고 그대로:
   [결제 준비] Idempotency 확인 → Invoice lock → outstanding 계산(도메인)
              → Payment/Allocation 생성 → (AuditLog·Outbox 는 B5 합류)
   [웹훅]     Inbox unique insert → Payment lock → 전이 guard(도메인)
              → Payment 갱신 → Invoice 재계산 → decision 기록
   금액 판단·상태 도출은 전부 packages/domain 재사용 — 여기는 잠금과 영속만. */
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { schema as s } from "@pacefolio/db";
import {
  resolveIdempotency, outstandingForInvoice, deriveInvoiceStatus,
  decidePaymentWebhook, canGuardianPayInvoices, asId,
  type IdempotencyRecord, type SettlementInput, type Invoice as DInvoice,
  type Payment as DPayment, type PaymentAllocation as DAlloc,
  type AuthorizationContext, type WebhookDecision, type PaymentStatus,
  type GuardianId,
} from "@pacefolio/domain";
import { newId } from "../crypto";
import { recordAudit, recordOutbox } from "../audit";
import type { Db } from "../sessions/service";

const IDEM_TTL_MS = 24 * 3600_000; // 멱등 보관 24h
const OP_PREPARE = "payment.prepare";
/* R7 P0-3: PENDING attempt 유효기간 — 이 안에서는 같은 Invoice 에
   새 attempt 를 만들 수 없다(다른 멱등키여도). 만료 후 재시도 허용. */
export const PAYMENT_ATTEMPT_TTL_MS = 15 * 60_000;

export type PrepareResult =
  | { kind: "CREATED" | "REPLAY"; paymentId: string; amount: number; status: string }
  | { kind: "CONFLICT" | "IN_PROGRESS" }
  | { kind: "ACTIVE_ATTEMPT_EXISTS"; paymentId: string } // R7 P0-3 — 진행 중 결제 존재
  | { kind: "DENIED"; reason: string };

export async function preparePayment(
  db: Db,
  input: {
    actorUserId: string;
    academyId: string;
    invoiceIds: string[];
    idempotencyKey: string;
    requestHash: string; // 서버가 body 정규화 후 계산
  },
  nowISO: string,
): Promise<PrepareResult> {
  return db.transaction(async (tx): Promise<PrepareResult> => {
    /* 1) 멱등 — (academy, actor, operation, key) scope. 도메인이 판단 */
    const idemRows = await tx.select().from(s.idempotencyRecords).where(and(
      eq(s.idempotencyRecords.academyId, input.academyId),
      eq(s.idempotencyRecords.actorId, input.actorUserId),
      eq(s.idempotencyRecords.operation, OP_PREPARE),
      eq(s.idempotencyRecords.idempotencyKey, input.idempotencyKey),
    )).for("update");
    const existing: IdempotencyRecord | null = idemRows[0] ? {
      id: asId(idemRows[0].id), actorId: asId(idemRows[0].actorId), academyId: asId(idemRows[0].academyId),
      operation: idemRows[0].operation, idempotencyKey: idemRows[0].idempotencyKey,
      requestHash: idemRows[0].requestHash,
      status: idemRows[0].status as IdempotencyRecord["status"],
      resourceId: idemRows[0].resourceId ?? undefined,
      createdAt: idemRows[0].createdAt, expiresAt: idemRows[0].expiresAt,
    } : null;
    const decision = resolveIdempotency(existing, {
      actorId: asId(input.actorUserId), academyId: asId(input.academyId),
      operation: OP_PREPARE, idempotencyKey: input.idempotencyKey,
      requestHash: input.requestHash, nowISO,
    });
    if (decision.action === "CONFLICT") return { kind: "CONFLICT" };
    if (decision.action === "IN_PROGRESS") return { kind: "IN_PROGRESS" };
    if (decision.action === "REPLAY") {
      const payRows = await tx.select().from(s.payments)
        .where(eq(s.payments.id, decision.record.resourceId ?? ""));
      const p = payRows[0];
      if (!p) return { kind: "CONFLICT" };
      return { kind: "REPLAY", paymentId: p.id, amount: p.amount, status: p.status };
    }

    /* 2) actor 의 guardian + 검증된 링크 (권한 판단 재료) */
    const gdRows = await tx.select().from(s.guardians).where(eq(s.guardians.userId, input.actorUserId));
    const guardian = gdRows[0];
    if (!guardian) return { kind: "DENIED", reason: "보호자 프로필 없음" };
    const linkRows = await tx.select().from(s.guardianParticipantLinks)
      .where(eq(s.guardianParticipantLinks.guardianId, guardian.id));

    /* 3) Invoice lock — FOR UPDATE (동시 결제 준비 경쟁 직렬화) */
    if (input.invoiceIds.length === 0) return { kind: "DENIED", reason: "청구서 없음" };
    const invRows = await tx.select().from(s.invoices)
      .where(and(
        inArray(s.invoices.id, input.invoiceIds),
        eq(s.invoices.academyId, input.academyId), // 테넌트 격리
      )).for("update");
    if (invRows.length !== input.invoiceIds.length) {
      return { kind: "DENIED", reason: "존재하지 않거나 다른 학원의 청구서" };
    }

    /* 4) 도메인 권한: 전부 연결 자녀 + canPay flag + 단일 학원 (authorization.ts) */
    const dInvoices: DInvoice[] = invRows.map((r) => ({
      id: asId(r.id), academyId: asId(r.academyId), participantId: asId(r.participantId),
      enrollmentId: asId(r.enrollmentId), billingPeriodId: asId(r.billingPeriodId),
      status: r.status, total: r.total, dueDate: r.dueDate,
    }));
    const ctx: AuthorizationContext = {
      actorUserId: asId(input.actorUserId),
      actorGuardianId: asId<GuardianId>(guardian.id),
      memberships: [], assignments: [],
      verifiedLinks: linkRows.map((l) => ({
        id: asId(l.id), guardianId: asId(l.guardianId), participantId: asId(l.participantId),
        academyId: asId(l.academyId), relationshipType: l.relationshipType,
        isPrimaryGuardian: l.isPrimaryGuardian, verificationStatus: l.verificationStatus,
        canViewSchedule: l.canViewSchedule, canViewAttendance: l.canViewAttendance,
        canViewHealthInfo: l.canViewHealthInfo, canReceivePhotos: l.canReceivePhotos,
        canPay: l.canPay, canRequestRefund: l.canRequestRefund,
      })),
      nowISO,
    };
    if (!canGuardianPayInvoices(ctx, dInvoices)) {
      return { kind: "DENIED", reason: "결제 권한 없음(연결·flag·학원 불일치)" };
    }

    /* 5) outstanding 계산 — 기존 유효 결제 반영 (도메인 정산) */
    const allocRows = await tx.select().from(s.paymentAllocations)
      .where(inArray(s.paymentAllocations.invoiceId, input.invoiceIds));
    const payIds = [...new Set(allocRows.map((a) => a.paymentId))];
    const payRows = payIds.length
      ? await tx.select().from(s.payments).where(inArray(s.payments.id, payIds))
      : [];

    /* 5-b) R7 P0-3: 같은 Invoice 에 활성 attempt 가 있으면 새 Payment 금지 —
       다른 멱등키로 와도 차단(이중 결제 방어 1층. 2층 = webhook 이중 CAPTURE guard).
       활성 = AUTHORIZED(웹훅/재조회로만 해소) + 미만료 PENDING. */
    const nowMs = Date.parse(nowISO);
    const activeAttempt = payRows.find((p) =>
      (p.status === "AUTHORIZED" ||
       (p.status === "PENDING" && (!p.attemptExpiresAt || Date.parse(p.attemptExpiresAt) > nowMs))));
    if (activeAttempt) {
      return { kind: "ACTIVE_ATTEMPT_EXISTS", paymentId: activeAttempt.id };
    }
    const settlement: SettlementInput = {
      payments: payRows.map((p): DPayment => ({
        id: asId(p.id), academyId: asId(p.academyId), guardianId: asId(p.guardianId),
        amount: p.amount, status: p.status, idempotencyKey: p.idempotencyKey, createdAt: p.createdAt,
      })),
      paymentAllocations: allocRows.map((a): DAlloc => ({
        id: asId(a.id), paymentId: asId(a.paymentId), invoiceId: asId(a.invoiceId), amount: a.amount,
      })),
      refunds: [], refundAllocations: [], // 환불 slice 는 Phase 5.5
    };
    const parts = dInvoices.map((inv) => ({ inv, due: outstandingForInvoice(inv, settlement) }));
    if (parts.some((p) => p.due <= 0)) {
      return { kind: "DENIED", reason: "이미 결제된 청구서 포함" };
    }
    const amount = parts.reduce((sum, p) => sum + p.due, 0);

    /* 6) Payment(PENDING) + Allocation 생성 — UI 성공 ≠ CAPTURED, 확정은 webhook 만 */
    const paymentId = newId("pay");
    await tx.insert(s.payments).values({
      id: paymentId, academyId: input.academyId, guardianId: guardian.id,
      amount, status: "PENDING", idempotencyKey: input.idempotencyKey,
      attemptExpiresAt: new Date(nowMs + PAYMENT_ATTEMPT_TTL_MS).toISOString(), // R7 P0-3
      createdAt: nowISO, updatedAt: nowISO,
    });
    await tx.insert(s.paymentAllocations).values(parts.map((p) => ({
      id: newId("pa"), paymentId, invoiceId: p.inv.id as string,
      academyId: input.academyId, // R7 P0-6 — 복합 FK 가 교차 테넌트 배분을 DB 에서 차단
      amount: p.due,
    })));

    /* 7) 멱등 기록 COMPLETED — 같은 key+body 재시도는 REPLAY 로 수렴 */
    await tx.insert(s.idempotencyRecords).values({
      id: newId("idem"), actorId: input.actorUserId, academyId: input.academyId,
      operation: OP_PREPARE, idempotencyKey: input.idempotencyKey, requestHash: input.requestHash,
      status: "COMPLETED", resourceId: paymentId, responseStatus: 201,
      createdAt: nowISO, expiresAt: new Date(Date.parse(nowISO) + IDEM_TTL_MS).toISOString(),
    });
    /* 8) AuditLog·Outbox — 같은 트랜잭션 (R7 §26: 결제 요청은 필수 감사 대상) */
    await recordAudit(tx, {
      academyId: input.academyId, actorUserId: input.actorUserId, actorRole: "GUARDIAN",
      action: "payment.prepared", targetType: "Payment", targetId: paymentId,
      detail: { amount, invoiceCount: parts.length }, // 금액은 감사 목적 필수 — 원문 개인정보 아님
      success: true,
    }, nowISO);
    await recordOutbox(tx, {
      academyId: input.academyId, eventType: "PAYMENT_PREPARED",
      payload: { paymentId, amount, invoiceIds: input.invoiceIds },
    }, nowISO);
    return { kind: "CREATED", paymentId, amount, status: "PENDING" };
  });
}

/* ── PG 웹훅 처리 (도메인 decidePaymentWebhook + inbox 원자성) ── */

export interface PgWebhookInput {
  providerEventId: string;
  paymentId: string;
  targetStatus: PaymentStatus;
  occurredAt: string;
  rawPayload: string;
}

export async function processPgWebhook(
  db: Db,
  provider: string,
  evt: PgWebhookInput,
  nowISO: string,
): Promise<WebhookDecision> {
  return db.transaction(async (tx): Promise<WebhookDecision> => {
    /* 1) inbox unique insert — (provider, eventId) 중복은 DB 가 차단 */
    const inserted = await tx.insert(s.webhookInbox).values({
      id: newId("whi"), provider, providerEventId: evt.providerEventId,
      payload: evt.rawPayload, receivedAt: nowISO,
    }).onConflictDoNothing().returning();
    if (!inserted[0]) return { action: "IGNORE_ALREADY_SEEN" };

    /* 2) Payment lock + 도메인 판단(중복·역순·전이 guard) */
    const payRows = await tx.select().from(s.payments)
      .where(eq(s.payments.id, evt.paymentId)).for("update");
    const pay = payRows[0];
    let decision: WebhookDecision;
    if (!pay) {
      decision = { action: "REJECT_INVALID", reason: "존재하지 않는 Payment" };
    } else {
      decision = decidePaymentWebhook(
        { status: pay.status, lastEventAt: pay.lastEventAt ?? undefined },
        { provider, providerEventId: evt.providerEventId, targetStatus: evt.targetStatus, occurredAt: evt.occurredAt },
        new Set(), // 같은 event ID 재수신은 inbox unique 가 이미 차단
      );
    }

    /* 2-b) R8 C8-01 수정: 이중 CAPTURE 방어(2층)의 TOCTOU 제거.
       기존 결함: Invoice 를 잠금 없이 사전 조회 → Payment 를 CAPTURED 로
       변경 → 그 후에야 Invoice 잠금(decision 재판정 없음) — 동시 웹훅 둘 다
       APPLY 가능. 수정: **Payment 상태 변경 전에** 관련 Invoice 전부를
       FOR UPDATE 로 잠그고(ID 정렬 = 데드락 방지 잠금 순서 고정), 잠금
       획득 후의 최신 상태로 최종 판정한다. 두 번째 트랜잭션은 잠금 대기
       후 PAID 를 보고 RECONCILE 로 전환된다. */
    let lockedInvoices: (typeof s.invoices.$inferSelect)[] = [];
    if (decision.action === "APPLY" && pay) {
      const allocPre = await tx.select().from(s.paymentAllocations)
        .where(eq(s.paymentAllocations.paymentId, pay.id));
      const invIds = [...new Set(allocPre.map((a) => a.invoiceId))].sort(); // 잠금 순서 고정
      if (invIds.length) {
        lockedInvoices = await tx.select().from(s.invoices)
          .where(inArray(s.invoices.id, invIds))
          .orderBy(asc(s.invoices.id))   // deterministic — 모든 웹훅 경로 공통
          .for("update");                // ← 잠금 후의 최신 상태가 판정 근거
      }
      if (decision.to === "CAPTURED" &&
          lockedInvoices.some((i) => i.status === "PAID" || i.status === "REFUNDED")) {
        decision = { action: "RECONCILE", reason: "대상 청구서가 이미 종결(PAID/REFUNDED) — 이중 결제 의심, PG 재조회·취소/환불 절차 필요" };
      }
    }

    /* 3) APPLY — Invoice 잠금·최종 판정 이후에만 Payment 갱신 + 재계산 */
    if (decision.action === "APPLY" && pay) {
      await tx.update(s.payments)
        .set({ status: decision.to, lastEventAt: evt.occurredAt, updatedAt: nowISO,
               version: sql`${s.payments.version} + 1` })
        .where(eq(s.payments.id, pay.id));

      const invIds = lockedInvoices.map((i) => i.id);
      if (invIds.length) {
        const invRows = lockedInvoices; // 이미 잠근 최신 행 재사용
        // 이 invoice 들의 전체 정산 재료(다른 결제 포함) 재조회
        const allAllocs = await tx.select().from(s.paymentAllocations)
          .where(inArray(s.paymentAllocations.invoiceId, invIds));
        const allPayIds = [...new Set(allAllocs.map((a) => a.paymentId))];
        const allPays = await tx.select().from(s.payments).where(inArray(s.payments.id, allPayIds));
        const settlement: SettlementInput = {
          payments: allPays.map((p): DPayment => ({
            id: asId(p.id), academyId: asId(p.academyId), guardianId: asId(p.guardianId),
            amount: p.amount,
            status: p.id === pay.id ? decision.to : p.status, // 방금 갱신분 반영
            idempotencyKey: p.idempotencyKey, createdAt: p.createdAt,
          })),
          paymentAllocations: allAllocs.map((a): DAlloc => ({
            id: asId(a.id), paymentId: asId(a.paymentId), invoiceId: asId(a.invoiceId), amount: a.amount,
          })),
          refunds: [], refundAllocations: [],
        };
        for (const r of invRows) {
          const dInv: DInvoice = {
            id: asId(r.id), academyId: asId(r.academyId), participantId: asId(r.participantId),
            enrollmentId: asId(r.enrollmentId), billingPeriodId: asId(r.billingPeriodId),
            status: r.status, total: r.total, dueDate: r.dueDate,
          };
          const derived = deriveInvoiceStatus(dInv, settlement);
          if (derived !== r.status) {
            await tx.update(s.invoices)
              .set({ status: derived, updatedAt: nowISO, version: sql`${s.invoices.version} + 1` })
              .where(eq(s.invoices.id, r.id));
          }
        }
      }
    }

    /* 4) inbox 상태 모델 기록 (R7 P0-2: RECONCILE = "처리됨"이 아니라 재조회 대기 큐)
       RECEIVED → APPLIED | IGNORED | RECONCILE_REQUIRED(+nextRetryAt) | DEAD_LETTER */
    const inboxStatus =
      decision.action === "APPLY" ? "APPLIED" :
      decision.action === "RECONCILE" ? "RECONCILE_REQUIRED" :
      decision.action === "REJECT_INVALID" ? "DEAD_LETTER" :
      "IGNORED";
    await tx.update(s.webhookInbox)
      .set({
        processedAt: nowISO, decision: decision.action, status: inboxStatus,
        // RECONCILE worker(실 PG 연동 후)가 이 큐를 폴링 — 5분 backoff 시작점
        nextRetryAt: inboxStatus === "RECONCILE_REQUIRED"
          ? new Date(Date.parse(nowISO) + 5 * 60_000).toISOString()
          : null,
      })
      .where(eq(s.webhookInbox.id, inserted[0].id));

    /* 5) AuditLog·Outbox — 상태 전이·RECONCILE 요구는 감사 대상 (같은 tx) */
    if (decision.action === "APPLY" && pay) {
      await recordAudit(tx, {
        academyId: pay.academyId, action: "payment.status_changed",
        targetType: "Payment", targetId: pay.id,
        detail: { from: pay.status, to: decision.to, providerEventId: evt.providerEventId },
        success: true,
      }, nowISO);
      if (decision.to === "CAPTURED") {
        await recordOutbox(tx, {
          academyId: pay.academyId, eventType: "PAYMENT_CAPTURED", // domain DOMAIN_EVENT_TYPE
          payload: { paymentId: pay.id, providerEventId: evt.providerEventId },
        }, nowISO);
      }
    } else if (decision.action === "RECONCILE" && pay) {
      await recordAudit(tx, {
        academyId: pay.academyId, action: "payment.reconcile_required",
        targetType: "Payment", targetId: pay.id,
        reason: decision.reason, success: true,
      }, nowISO);
    }
    return decision;
  });
}
