/* 환불 vertical slice (R7 P1-4 · 체크리스트 §9 공백 마감)
   정책은 전부 도메인 재사용:
   - 요청자 = 실제 결제자: canGuardianRequestRefundForPayment (R4 P0-3)
   - Refund 1건 = 원생 1명 · 부분승인 금지: checkReferenceIntegrity 불변식
   - 양측 승인·동일인 금지: canApplyRefundApproval + isRefundMutuallyApproved
   - 웹훅 판정: decideRefundWebhook (R6 P0-3)
   이 파일은 잠금·영속·원자성만 담당. */
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { schema as s } from "@pacefolio/db";
import {
  canGuardianRequestRefundForPayment, canApplyRefundApproval, isRefundMutuallyApproved,
  decideRefundWebhook, deriveInvoiceStatus, canTransitionRefund,
  asId, isValidMoneyAmount,
  type AuthorizationContext, type GuardianId, type UserId,
  type Payment as DPayment,
  type PaymentAllocation as DAlloc, type Invoice as DInvoice, type Refund as DRefund,
  type SettlementInput, type RefundWebhookDecision, type RefundStatus,
} from "@pacefolio/domain";
import { newId } from "../crypto";
import { recordAudit, recordOutbox } from "../audit";
import type { Db } from "../sessions/service";

/* row → 도메인 Refund (권한·상태머신 함수 입력용) */
function toDomainRefund(r: typeof s.refunds.$inferSelect): DRefund {
  return {
    id: asId(r.id), academyId: asId(r.academyId), paymentId: asId(r.paymentId),
    participantId: asId(r.participantId), status: r.status,
    reasonCode: r.reasonCode, reasonText: r.reasonText ?? undefined,
    requestedAmount: r.requestedAmount,
    approvedAmount: r.approvedAmount ?? undefined,
    completedAmount: r.completedAmount ?? undefined,
    requestedByUserId: asId(r.requestedByUserId), requestedAt: r.requestedAt,
    guardianApprovedByUserId: r.guardianApprovedByUserId ? asId<UserId>(r.guardianApprovedByUserId) : undefined,
    guardianApprovedAt: r.guardianApprovedAt ?? undefined,
    academyApprovedByUserId: r.academyApprovedByUserId ? asId<UserId>(r.academyApprovedByUserId) : undefined,
    academyApprovedAt: r.academyApprovedAt ?? undefined,
    idempotencyKey: r.idempotencyKey,
  };
}

export type RefundRequestResult =
  | { kind: "CREATED"; refundId: string; requestedAmount: number }
  | { kind: "DENIED"; reason: string };

/** 환불 요청 — 전액 환불(부분승인 미지원 정책과 정합: 요청=배분합=완료액).
   대상 = 해당 원생의 CAPTURED 결제 배분 전액. */
export async function requestRefund(
  db: Db,
  input: {
    actorUserId: string;
    academyId: string;
    paymentId: string;
    participantId: string;   // Refund 1건 = 원생 1명
    reasonCode: string;
    reasonText?: string;
    idempotencyKey: string;
  },
  nowISO: string,
): Promise<RefundRequestResult> {
  return db.transaction(async (tx): Promise<RefundRequestResult> => {
    /* 1) Payment lock + 재료 조회 */
    const payRows = await tx.select().from(s.payments)
      .where(and(eq(s.payments.id, input.paymentId), eq(s.payments.academyId, input.academyId)))
      .for("update");
    const pay = payRows[0];
    if (!pay) return { kind: "DENIED", reason: "결제 없음(또는 다른 학원)" };

    const gd = await tx.select().from(s.guardians).where(eq(s.guardians.userId, input.actorUserId));
    if (!gd[0]) return { kind: "DENIED", reason: "보호자 프로필 없음" };
    const links = await tx.select().from(s.guardianParticipantLinks)
      .where(eq(s.guardianParticipantLinks.guardianId, gd[0].id));

    const allocRows = await tx.select().from(s.paymentAllocations)
      .where(eq(s.paymentAllocations.paymentId, pay.id));
    // 원생 1명 귀속: 이 원생의 청구서 배분만 대상
    const invRows = allocRows.length
      ? await tx.select().from(s.invoices).where(inArray(s.invoices.id, allocRows.map((a) => a.invoiceId)))
      : [];
    const targetAllocs = allocRows.filter((a) =>
      invRows.find((i) => i.id === a.invoiceId)?.participantId === input.participantId);
    if (targetAllocs.length === 0) return { kind: "DENIED", reason: "해당 원생의 결제 배분 없음" };

    const existingRefunds = await tx.select().from(s.refunds)
      .where(eq(s.refunds.paymentId, pay.id)).for("update"); // 동시 요청 직렬화

    /* 2) 도메인 권한 — 실제 결제자·상태·링크 flag·진행 중 중복(R4 P0-3) */
    const ctx: AuthorizationContext = {
      actorUserId: asId(input.actorUserId), actorGuardianId: asId<GuardianId>(gd[0].id),
      memberships: [], assignments: [],
      verifiedLinks: links.map((l) => ({
        id: asId(l.id), guardianId: asId(l.guardianId), participantId: asId(l.participantId),
        academyId: asId(l.academyId), relationshipType: l.relationshipType,
        isPrimaryGuardian: l.isPrimaryGuardian, verificationStatus: l.verificationStatus,
        canViewSchedule: l.canViewSchedule, canViewAttendance: l.canViewAttendance,
        canViewHealthInfo: l.canViewHealthInfo, canReceivePhotos: l.canReceivePhotos,
        canPay: l.canPay, canRequestRefund: l.canRequestRefund,
      })),
      nowISO,
    };
    const dPay: DPayment = {
      id: asId(pay.id), academyId: asId(pay.academyId), guardianId: asId(pay.guardianId),
      amount: pay.amount, status: pay.status, idempotencyKey: pay.idempotencyKey, createdAt: pay.createdAt,
    };
    const dAllocs: DAlloc[] = targetAllocs.map((a) => ({
      id: asId(a.id), paymentId: asId(a.paymentId), invoiceId: asId(a.invoiceId), amount: a.amount,
    }));
    const dInvoices: DInvoice[] = invRows.map((r) => ({
      id: asId(r.id), academyId: asId(r.academyId), participantId: asId(r.participantId),
      enrollmentId: asId(r.enrollmentId), billingPeriodId: asId(r.billingPeriodId),
      status: r.status, total: r.total, dueDate: r.dueDate,
    }));
    if (!canGuardianRequestRefundForPayment(ctx, dPay, dAllocs, dInvoices, existingRefunds.map(toDomainRefund))) {
      return { kind: "DENIED", reason: "환불 요청 권한 없음(결제자 아님·상태·중복·링크)" };
    }

    /* 3) 과다 환불 차단: 완료 환불 누적 + 이번 요청 ≤ 배분액 (allocation 별) */
    const completedIds = existingRefunds.filter((r) => r.status === "COMPLETED").map((r) => r.id);
    const priorRas = completedIds.length
      ? await tx.select().from(s.refundAllocations).where(inArray(s.refundAllocations.refundId, completedIds))
      : [];
    for (const a of targetAllocs) {
      const prior = priorRas.filter((ra) => ra.paymentAllocationId === a.id)
        .reduce((sum, ra) => sum + ra.amount, 0);
      if (prior + a.amount > a.amount) {
        return { kind: "DENIED", reason: "이미 환불 완료된 배분" };
      }
    }

    /* 4) Refund + RefundAllocation 생성 — 전액(요청=Σ배분) */
    const requestedAmount = targetAllocs.reduce((sum, a) => sum + a.amount, 0);
    /* C10-01: 서버 계산 금액 상한 검증 (DB CHECK ck_refund_requested_max 와 2중) */
    if (!isValidMoneyAmount(requestedAmount)) {
      return { kind: "DENIED", reason: "환불 금액이 허용 범위 밖(상한 초과)" };
    }
    const refundId = newId("ref");
    await tx.insert(s.refunds).values({
      id: refundId, academyId: input.academyId, paymentId: pay.id,
      participantId: input.participantId, status: "REQUESTED",
      reasonCode: input.reasonCode, reasonText: input.reasonText,
      requestedAmount, requestedByUserId: input.actorUserId, requestedAt: nowISO,
      idempotencyKey: input.idempotencyKey, createdAt: nowISO, updatedAt: nowISO,
    });
    await tx.insert(s.refundAllocations).values(targetAllocs.map((a) => ({
      id: newId("ra"), refundId, paymentAllocationId: a.id,
      paymentId: pay.id, // R9-P0-02: 연쇄 FK(RA↔PA↔Refund 의 payment 일치를 DB 가 강제)
      invoiceId: a.invoiceId,
      participantId: input.participantId, academyId: input.academyId, amount: a.amount,
    })));

    /* 5) Audit·Outbox — 같은 tx */
    await recordAudit(tx, {
      academyId: input.academyId, actorUserId: input.actorUserId, actorRole: "GUARDIAN",
      action: "refund.requested", targetType: "Refund", targetId: refundId,
      reason: input.reasonCode, detail: { requestedAmount, participantId: input.participantId },
      success: true,
    }, nowISO);
    return { kind: "CREATED", refundId, requestedAmount };
  });
}

export type ApprovalResult =
  | { kind: "APPROVED"; refundId: string; status: string }
  | { kind: "DENIED"; reason: string };

/** 양측 승인 — side 는 서버가 역할로 검증(GUARDIAN=요청 보호자 측 / ACADEMY=원장).
   양측 완료 시 MUTUALLY_APPROVED + approvedAmount=requestedAmount(부분승인 금지). */
export async function approveRefund(
  db: Db,
  input: { actorUserId: string; academyId: string; refundId: string; side: "GUARDIAN" | "ACADEMY" },
  nowISO: string,
): Promise<ApprovalResult> {
  return db.transaction(async (tx): Promise<ApprovalResult> => {
    const rows = await tx.select().from(s.refunds)
      .where(and(eq(s.refunds.id, input.refundId), eq(s.refunds.academyId, input.academyId)))
      .for("update"); // 동시 승인 직렬화 — 승인자 정확 기록
    const row = rows[0];
    if (!row) return { kind: "DENIED", reason: "환불 없음" };

    const verdict = canApplyRefundApproval(toDomainRefund(row), input.side, asId(input.actorUserId));
    if (!verdict.ok) return { kind: "DENIED", reason: verdict.error ?? "승인 불가" };

    /* R9-P0-01 수정: 보호자 측 승인 = **실제 결제자**만 — 역할(GUARDIAN)만으로는
       같은 학원의 관계없는 보호자도 승인 가능했음. 승인 시점에 소유권 재검증. */
    if (input.side === "GUARDIAN") {
      const payRows = await tx.select().from(s.payments)
        .where(eq(s.payments.id, row.paymentId));
      const gd = await tx.select().from(s.guardians)
        .where(eq(s.guardians.userId, input.actorUserId));
      if (!payRows[0] || !gd[0] || payRows[0].guardianId !== gd[0].id) {
        return { kind: "DENIED", reason: "보호자 측 승인은 실제 결제자만 가능" };
      }
      /* LCV1-P0-03: 요청 후 승인 전에 보호자-원생 링크가 철회·미검증 상태가
         됐을 수 있음 — 승인 시점에 링크 유효성(VERIFIED + canRequestRefund)을
         재검증. 철회됐으면 승인 거부(운영 심사 경로). */
      const link = await tx.select().from(s.guardianParticipantLinks).where(and(
        eq(s.guardianParticipantLinks.guardianId, gd[0].id),
        eq(s.guardianParticipantLinks.participantId, row.participantId),
        eq(s.guardianParticipantLinks.academyId, input.academyId),
      ));
      if (!link[0] || link[0].verificationStatus !== "VERIFIED" || !link[0].canRequestRefund) {
        return { kind: "DENIED", reason: "보호자-원생 연결이 유효하지 않음(철회·미검증) — 운영 심사 필요" };
      }
    }

    const patch: Partial<typeof s.refunds.$inferInsert> =
      input.side === "GUARDIAN"
        ? { guardianApprovedByUserId: input.actorUserId, guardianApprovedAt: nowISO }
        : { academyApprovedByUserId: input.actorUserId, academyApprovedAt: nowISO };
    const merged = { ...row, ...patch };
    const mutual = isRefundMutuallyApproved(toDomainRefund(merged as typeof row));
    const nextStatus: RefundStatus = mutual.ok ? "MUTUALLY_APPROVED" : row.status;
    if (mutual.ok && !canTransitionRefund(row.status, "MUTUALLY_APPROVED").ok) {
      return { kind: "DENIED", reason: "상태 전이 불가" };
    }
    await tx.update(s.refunds).set({
      ...patch, status: nextStatus,
      approvedAmount: mutual.ok ? row.requestedAmount : row.approvedAmount, // 전액(부분승인 금지)
      updatedAt: nowISO, version: sql`${s.refunds.version} + 1`,
    }).where(eq(s.refunds.id, row.id));

    await recordAudit(tx, {
      academyId: input.academyId, actorUserId: input.actorUserId,
      actorRole: input.side, action: `refund.approved_${input.side.toLowerCase()}`,
      targetType: "Refund", targetId: row.id,
      detail: { mutuallyApproved: mutual.ok }, success: true,
    }, nowISO);
    return { kind: "APPROVED", refundId: row.id, status: nextStatus };
  });
}

/** 환불 웹훅 — decideRefundWebhook 판정 → COMPLETED 시 Payment·Invoice 동시 반영(원자). */
export async function processRefundWebhook(
  db: Db,
  provider: string,
  evt: { providerEventId: string; refundId: string; targetStatus: RefundStatus; occurredAt: string; rawPayload: string },
  nowISO: string,
): Promise<RefundWebhookDecision> {
  return db.transaction(async (tx): Promise<RefundWebhookDecision> => {
    const inserted = await tx.insert(s.webhookInbox).values({
      id: newId("whi"), provider, providerEventId: evt.providerEventId,
      payload: evt.rawPayload, receivedAt: nowISO,
    }).onConflictDoNothing().returning();
    if (!inserted[0]) return { action: "IGNORE_ALREADY_SEEN" };

    const rows = await tx.select().from(s.refunds).where(eq(s.refunds.id, evt.refundId)).for("update");
    const row = rows[0];
    let decision: RefundWebhookDecision;
    if (!row) {
      decision = { action: "REJECT_INVALID", reason: "존재하지 않는 Refund" };
    } else {
      decision = decideRefundWebhook(
        { status: row.status, lastEventAt: row.lastEventAt ?? undefined },
        { provider, providerEventId: evt.providerEventId, targetStatus: evt.targetStatus, occurredAt: evt.occurredAt },
        new Set(),
      );
    }

    if (decision.action === "APPLY" && row) {
      const completing = decision.to === "COMPLETED";
      await tx.update(s.refunds).set({
        status: decision.to, lastEventAt: evt.occurredAt, updatedAt: nowISO,
        completedAmount: completing ? row.requestedAmount : row.completedAmount, // =requested(부분승인 금지)
        completedAt: completing ? nowISO : row.completedAt,
        version: sql`${s.refunds.version} + 1`,
      }).where(eq(s.refunds.id, row.id));

      if (completing) {
        /* Payment PARTIALLY_REFUNDED/REFUNDED + Invoice 순수납 재계산 — 같은 tx (R6 P0-3 계약) */
        const payRows = await tx.select().from(s.payments)
          .where(eq(s.payments.id, row.paymentId)).for("update");
        const pay = payRows[0];
        if (pay) {
          // 이 결제의 완료 환불 총액(이번 건 포함)
          const doneRefunds = await tx.select().from(s.refunds)
            .where(and(eq(s.refunds.paymentId, pay.id), eq(s.refunds.status, "COMPLETED")));
          const refundedTotal = doneRefunds.reduce((sum, r) => sum + (r.completedAmount ?? 0), 0)
            + row.requestedAmount; // 방금 갱신분(트랜잭션 내 재조회 값에 아직 미반영일 수 있어 명시 합산)
          const dedup = doneRefunds.some((r) => r.id === row.id) ? row.requestedAmount : 0;
          const total = refundedTotal - dedup;
          const nextPayStatus = total >= pay.amount ? "REFUNDED" : "PARTIALLY_REFUNDED";
          await tx.update(s.payments).set({
            status: nextPayStatus, updatedAt: nowISO, version: sql`${s.payments.version} + 1`,
          }).where(eq(s.payments.id, pay.id));

          // 영향 Invoice 재계산 — 도메인 도출
          const ras = await tx.select().from(s.refundAllocations)
            .where(eq(s.refundAllocations.refundId, row.id));
          const invIds = ras.map((ra) => ra.invoiceId);
          if (invIds.length) {
            const invRows = await tx.select().from(s.invoices)
              .where(inArray(s.invoices.id, [...invIds].sort()))
              .orderBy(asc(s.invoices.id)).for("update"); // 잠금 순서 고정(C8-01 보강)
            const allAllocs = await tx.select().from(s.paymentAllocations)
              .where(inArray(s.paymentAllocations.invoiceId, invIds));
            const allRas = await tx.select().from(s.refundAllocations)
              .where(inArray(s.refundAllocations.invoiceId, invIds));
            const allRefundIds = [...new Set(allRas.map((ra) => ra.refundId))];
            const allRefunds = allRefundIds.length
              ? await tx.select().from(s.refunds).where(inArray(s.refunds.id, allRefundIds))
              : [];
            /* R9-P0-03 수정: 이 Invoice 들에 배분된 **모든** Payment 를 정산에
               포함 — 환불 대상 1건만 넣으면 다른 CAPTURED Payment 의 납부액이
               누락돼 순수납 과소계산 → Invoice 가 잘못 REFUNDED 될 수 있음
               (예: 50k+50k 결제 중 50k 환불 → 기대 PARTIALLY_PAID). */
            const allPayIds = [...new Set(allAllocs.map((a) => a.paymentId))];
            const allPays = allPayIds.length
              ? await tx.select().from(s.payments).where(inArray(s.payments.id, allPayIds))
              : [];
            const settlement: SettlementInput = {
              payments: allPays.map((p) =>
                p.id === pay.id
                  ? { ...toPaymentDomain(p), status: nextPayStatus } // 방금 갱신분 반영
                  : toPaymentDomain(p)),
              paymentAllocations: allAllocs.map((a) => ({
                id: asId(a.id), paymentId: asId(a.paymentId), invoiceId: asId(a.invoiceId), amount: a.amount,
              })),
              refunds: allRefunds.map((r) => r.id === row.id
                ? { ...toDomainRefund(r), status: "COMPLETED" as const, completedAmount: row.requestedAmount }
                : toDomainRefund(r)),
              refundAllocations: allRas.map((ra) => ({
                id: asId(ra.id), refundId: asId(ra.refundId),
                paymentAllocationId: asId(ra.paymentAllocationId),
                invoiceId: asId(ra.invoiceId), participantId: asId(ra.participantId), amount: ra.amount,
              })),
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
          await recordOutbox(tx, {
            academyId: row.academyId, eventType: "REFUND_COMPLETED", // domain DOMAIN_EVENT_TYPE
            payload: { refundId: row.id, paymentId: pay.id, amount: row.requestedAmount },
          }, nowISO);
        }
      }
      await recordAudit(tx, {
        academyId: row.academyId, action: "refund.status_changed",
        targetType: "Refund", targetId: row.id,
        detail: { from: row.status, to: decision.to, providerEventId: evt.providerEventId },
        success: true,
      }, nowISO);
    }

    const inboxStatus =
      decision.action === "APPLY" ? "APPLIED" :
      decision.action === "RECONCILE" ? "RECONCILE_REQUIRED" :
      decision.action === "REJECT_INVALID" ? "DEAD_LETTER" : "IGNORED";
    await tx.update(s.webhookInbox).set({
      processedAt: nowISO, decision: decision.action, status: inboxStatus,
      nextRetryAt: inboxStatus === "RECONCILE_REQUIRED"
        ? new Date(Date.parse(nowISO) + 5 * 60_000).toISOString() : null,
    }).where(eq(s.webhookInbox.id, inserted[0].id));
    return decision;
  });
}

function toPaymentDomain(p: typeof s.payments.$inferSelect): DPayment {
  return {
    id: asId(p.id), academyId: asId(p.academyId), guardianId: asId(p.guardianId),
    amount: p.amount, status: p.status, idempotencyKey: p.idempotencyKey, createdAt: p.createdAt,
  };
}
