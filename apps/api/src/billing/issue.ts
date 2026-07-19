/* 청구서 발행 + 오프라인 수납 — 기본선 3단계(#24, docs/15)
   C10-01 확장 완료 조건(13차 A): 라인 부호 정책(type 별)·할인 후 총액
   음수 금지(총액 양수 검증이 강제)·정률 100% 초과 금지(동일)·수동 조정 감사.
   오프라인 수납(경쟁 반면교사): 화면에서 상태만 바꾸지 않는다 — 수납
   "이벤트"(Payment 행 + 채널·증빙)를 만들고 정산이 상태를 도출한다. */
import { and, eq, inArray, sql } from "drizzle-orm";
import { schema as s } from "@pacefolio/db";
import {
  isValidLineAmountForType, isValidInvoiceTotal, isValidMoneyAmount,
  outstandingForInvoice, deriveInvoiceStatus, asId,
  type InvoiceLineKind, type SettlementInput, type Invoice as DInvoice,
  type Payment as DPayment, type PaymentAllocation as DAlloc,
  type PaymentChannel,
} from "@pacefolio/domain";
import { newId } from "../crypto";
import { recordAudit, recordOutbox } from "../audit";
import type { Db } from "../sessions/service";

const isStaff = (roles: readonly string[]) => roles.includes("OWNER") || roles.includes("DESK");

export type IssueResult =
  | { kind: "OK"; invoiceId: string; total: number }
  | { kind: "FORBIDDEN"; reason: string }
  | { kind: "INVALID"; reason: string }
  | { kind: "CONFLICT"; reason: string };

export async function createBillingPeriod(db: Db, input: {
  actorUserId: string; actorRoles: readonly string[]; academyId: string;
  periodStart: string; periodEnd: string; cycleMonths: number;
}, nowISO: string): Promise<{ kind: "OK"; billingPeriodId: string } | { kind: "FORBIDDEN"; reason: string } | { kind: "INVALID"; reason: string }> {
  if (!isStaff(input.actorRoles)) return { kind: "FORBIDDEN", reason: "수납 기간 생성은 원장·데스크만" };
  if (input.periodStart >= input.periodEnd) return { kind: "INVALID", reason: "기간 역전" };
  /* #40: find-or-create 멱등 — 같은 (시작,끝) 기간 재요청은 기존 행 반환
     (중간입회 draft 저장이 분기 기간을 반복 참조 — 중복 기간 행 방지) */
  const existing = (await db.select().from(s.billingPeriods).where(and(
    eq(s.billingPeriods.academyId, input.academyId),
    eq(s.billingPeriods.periodStart, input.periodStart),
    eq(s.billingPeriods.periodEnd, input.periodEnd),
  )))[0];
  if (existing) return { kind: "OK", billingPeriodId: existing.id };
  const billingPeriodId = newId("bp");
  await db.insert(s.billingPeriods).values({
    id: billingPeriodId, academyId: input.academyId,
    periodStart: input.periodStart, periodEnd: input.periodEnd, cycleMonths: input.cycleMonths,
  });
  await recordAudit(db, {
    academyId: input.academyId, actorUserId: input.actorUserId, actorRole: "ACADEMY",
    action: "billing_period.created", targetType: "BillingPeriod", targetId: billingPeriodId,
    detail: { periodStart: input.periodStart, periodEnd: input.periodEnd }, success: true,
  }, nowISO);
  return { kind: "OK", billingPeriodId };
}

/** 청구서 생성(DRAFT) — 총액은 서버 합산·라인 부호는 type 이 강제 */
export async function createInvoice(db: Db, input: {
  actorUserId: string; actorRoles: readonly string[]; academyId: string;
  participantId: string; billingPeriodId: string; dueDate: string;
  lines: { type: InvoiceLineKind; label: string; amount: number }[];
}, nowISO: string): Promise<IssueResult> {
  if (!isStaff(input.actorRoles)) return { kind: "FORBIDDEN", reason: "청구서 생성은 원장·데스크만" };
  for (const l of input.lines) {
    if (!isValidLineAmountForType(l.type, l.amount)) {
      return { kind: "INVALID", reason: `라인 금액 정책 위반(${l.type}: ${l.amount}) — 할인=음수만·그 외=양수만·0 금지·|n|≤1억` };
    }
  }
  const total = input.lines.reduce((sum, l) => sum + l.amount, 0);
  if (!isValidInvoiceTotal(total)) {
    // 할인 후 음수·0·상한 초과·정률 100% 초과 전부 여기서 차단(13차 A P1-⑤ 완료 조건)
    return { kind: "INVALID", reason: `청구 총액 검증 실패(${total}) — 할인 후 음수·0·1억 초과 금지` };
  }
  return db.transaction(async (tx) => {
    /* 리뷰 P2: 동일 원생·기간 청구서 동시 생성 경쟁 방지 — academy 행 FOR UPDATE 로
       같은 학원 청구 생성을 직렬화(다른 학원 무관). 잠금 뒤 dup 체크가 경쟁에도 신뢰 가능.
       (#1·#7 과 동일 패턴 — bulkCreateClassDrafts 도 동일 잠금) */
    await tx.select({ id: s.academies.id }).from(s.academies)
      .where(eq(s.academies.id, input.academyId)).for("update");
    /* 14차 A 잔여 권고: participant·billingPeriod 의 학원 귀속을 서비스가 명시 검증 —
       DB 복합 FK 위반이 일반 500 으로 새는 대신 422 로 응답 */
    const p = (await tx.select({ id: s.participants.id }).from(s.participants).where(and(
      eq(s.participants.id, input.participantId), eq(s.participants.academyId, input.academyId),
    )))[0];
    if (!p) return { kind: "INVALID" as const, reason: "원생 없음(학원 불일치 포함)" };
    const bp = (await tx.select({ id: s.billingPeriods.id }).from(s.billingPeriods).where(and(
      eq(s.billingPeriods.id, input.billingPeriodId), eq(s.billingPeriods.academyId, input.academyId),
    )))[0];
    if (!bp) return { kind: "INVALID" as const, reason: "수납 기간 없음(학원 불일치 포함)" };
    // 중복 발행 방지: 같은 (원생, 기간)의 VOID 아닌 청구서 존재 = 409 (재발행은 VOID 후).
    // 위 FOR UPDATE 직렬화로 동시 생성 경쟁에도 이 체크가 유효.
    const dup = (await tx.select().from(s.invoices).where(and(
      eq(s.invoices.participantId, input.participantId),
      eq(s.invoices.billingPeriodId, input.billingPeriodId),
      sql`${s.invoices.status} <> 'VOID'`,
    )))[0];
    if (dup) return { kind: "CONFLICT" as const, reason: "같은 원생·기간의 청구서가 이미 존재 — 수정은 VOID 후 재발행(감사 보존)" };
    const invoiceId = newId("inv");
    await tx.insert(s.invoices).values({
      id: invoiceId, academyId: input.academyId, participantId: input.participantId,
      enrollmentId: "e_issue", // 발행 시점 배정 참조는 후속(Phase 5.5 enrollment FK 승격 시 정리)
      billingPeriodId: input.billingPeriodId, status: "DRAFT",
      total, dueDate: input.dueDate,
    });
    await tx.insert(s.invoiceLines).values(input.lines.map((l) => ({
      id: newId("il"), invoiceId, type: l.type, label: l.label, amount: l.amount,
    })));
    await recordAudit(tx, {
      academyId: input.academyId, actorUserId: input.actorUserId, actorRole: "ACADEMY",
      action: "invoice.created", targetType: "Invoice", targetId: invoiceId,
      detail: { participantId: input.participantId, total, lines: input.lines.length },
      success: true,
    }, nowISO);
    return { kind: "OK" as const, invoiceId, total };
  });
}

/** #41: 반 단위 일괄 초안 — ACTIVE 배정 전수. 같은 기간에 비-VOID 청구가 이미
    있는 원생은 건너뜀("이미 발송된 원생 자동 제외"의 서버 정본). 할인·일할 등
    개별 조정은 초안 상태에서 원생별 청구서로(일괄은 기본 수강료 1라인만). */
export async function bulkCreateClassDrafts(db: Db, input: {
  actorUserId: string; actorRoles: readonly string[]; academyId: string;
  classId: string; billingPeriodId: string; dueDate: string; baseFee: number;
}, nowISO: string): Promise<
  | { kind: "OK"; created: number; skipped: number; invoiceIds: string[] }
  | { kind: "FORBIDDEN"; reason: string } | { kind: "INVALID"; reason: string }> {
  if (!isStaff(input.actorRoles)) return { kind: "FORBIDDEN", reason: "일괄 청구는 원장·데스크만" };
  if (!isValidLineAmountForType("TUITION", input.baseFee)) {
    return { kind: "INVALID", reason: `수강료 금액 정책 위반(${input.baseFee})` };
  }
  return db.transaction(async (tx) => {
    /* 리뷰 P2: 동시 일괄 생성 경쟁 방지 — academy 행 FOR UPDATE 로 직렬화해
       existing 스킵 판정을 신뢰 가능하게(partial unique 위반으로 배치 전체가
       롤백되는 것도 예방). 다른 학원은 다른 행이라 무관. */
    await tx.select({ id: s.academies.id }).from(s.academies)
      .where(eq(s.academies.id, input.academyId)).for("update");
    const cls = (await tx.select({ id: s.dbClasses.id }).from(s.dbClasses).where(and(
      eq(s.dbClasses.id, input.classId), eq(s.dbClasses.academyId, input.academyId),
    )))[0];
    if (!cls) return { kind: "INVALID" as const, reason: "반 없음(학원 불일치 포함)" };
    const bp = (await tx.select({ id: s.billingPeriods.id }).from(s.billingPeriods).where(and(
      eq(s.billingPeriods.id, input.billingPeriodId), eq(s.billingPeriods.academyId, input.academyId),
    )))[0];
    if (!bp) return { kind: "INVALID" as const, reason: "수납 기간 없음(학원 불일치 포함)" };
    const ens = await tx.select().from(s.dbEnrollments).where(and(
      eq(s.dbEnrollments.classId, input.classId),
      eq(s.dbEnrollments.academyId, input.academyId),
      eq(s.dbEnrollments.status, "ACTIVE"),
    ));
    if (ens.length === 0) return { kind: "OK" as const, created: 0, skipped: 0, invoiceIds: [] };
    const existing = await tx.select({ participantId: s.invoices.participantId }).from(s.invoices).where(and(
      eq(s.invoices.billingPeriodId, input.billingPeriodId),
      inArray(s.invoices.participantId, ens.map((e) => e.participantId)),
      sql`${s.invoices.status} <> 'VOID'`,
    ));
    const has = new Set(existing.map((x) => x.participantId));
    const invoiceIds: string[] = [];
    for (const en of ens) {
      if (has.has(en.participantId)) continue;
      const invoiceId = newId("inv");
      await tx.insert(s.invoices).values({
        id: invoiceId, academyId: input.academyId, participantId: en.participantId,
        enrollmentId: en.id, billingPeriodId: input.billingPeriodId,
        status: "DRAFT", total: input.baseFee, dueDate: input.dueDate,
      });
      await tx.insert(s.invoiceLines).values({
        id: newId("il"), invoiceId, type: "TUITION", label: "수강료", amount: input.baseFee,
      });
      invoiceIds.push(invoiceId);
    }
    await recordAudit(tx, {
      academyId: input.academyId, actorUserId: input.actorUserId, actorRole: "ACADEMY",
      action: "invoice.bulk_drafted", targetType: "Class", targetId: input.classId,
      detail: { billingPeriodId: input.billingPeriodId, created: invoiceIds.length, skipped: has.size, baseFee: input.baseFee },
      success: true,
    }, nowISO);
    return { kind: "OK" as const, created: invoiceIds.length, skipped: has.size, invoiceIds };
  });
}

/** #41: 일괄 발행 — 이 반 ACTIVE 배정 원생의 해당 기간 DRAFT 전부 ISSUED.
    원생별 outbox INVOICE_ISSUED(알림 트랙) 유지 — 단건 발행과 같은 계약. */
export async function bulkIssueClassDrafts(db: Db, input: {
  actorUserId: string; actorRoles: readonly string[]; academyId: string;
  classId: string; billingPeriodId: string;
}, nowISO: string): Promise<
  | { kind: "OK"; issued: number }
  | { kind: "FORBIDDEN"; reason: string } | { kind: "INVALID"; reason: string }> {
  if (!isStaff(input.actorRoles)) return { kind: "FORBIDDEN", reason: "일괄 발행은 원장·데스크만" };
  return db.transaction(async (tx) => {
    const ens = await tx.select().from(s.dbEnrollments).where(and(
      eq(s.dbEnrollments.classId, input.classId),
      eq(s.dbEnrollments.academyId, input.academyId),
      eq(s.dbEnrollments.status, "ACTIVE"),
    ));
    if (ens.length === 0) return { kind: "OK" as const, issued: 0 };
    const drafts = await tx.select().from(s.invoices).where(and(
      eq(s.invoices.academyId, input.academyId),
      eq(s.invoices.billingPeriodId, input.billingPeriodId),
      inArray(s.invoices.participantId, ens.map((e) => e.participantId)),
      eq(s.invoices.status, "DRAFT"),
    )).for("update");
    if (drafts.length === 0) return { kind: "OK" as const, issued: 0 }; // 멱등 — 이미 전부 발행됨
    await tx.update(s.invoices).set({ status: "ISSUED" })
      .where(inArray(s.invoices.id, drafts.map((d) => d.id)));
    for (const d of drafts) {
      await recordOutbox(tx, {
        academyId: input.academyId, eventType: "INVOICE_ISSUED",
        payload: { invoiceId: d.id, participantId: d.participantId, total: d.total, dueDate: d.dueDate },
      }, nowISO);
    }
    await recordAudit(tx, {
      academyId: input.academyId, actorUserId: input.actorUserId, actorRole: "ACADEMY",
      action: "invoice.bulk_issued", targetType: "Class", targetId: input.classId,
      detail: { billingPeriodId: input.billingPeriodId, issued: drafts.length },
      success: true,
    }, nowISO);
    return { kind: "OK" as const, issued: drafts.length };
  });
}

/** 발행(DRAFT→ISSUED) — 이때부터 보호자에게 보인다(11.6 DRAFT 비노출과 짝) */
export async function issueInvoice(db: Db, input: {
  actorUserId: string; actorRoles: readonly string[]; academyId: string; invoiceId: string;
}, nowISO: string): Promise<IssueResult> {
  if (!isStaff(input.actorRoles)) return { kind: "FORBIDDEN", reason: "발행은 원장·데스크만" };
  return db.transaction(async (tx) => {
    const inv = (await tx.select().from(s.invoices).where(and(
      eq(s.invoices.id, input.invoiceId), eq(s.invoices.academyId, input.academyId),
    )).for("update"))[0];
    if (!inv) return { kind: "INVALID" as const, reason: "청구서 없음" };
    if (inv.status === "ISSUED") return { kind: "OK" as const, invoiceId: inv.id, total: inv.total }; // 멱등
    if (inv.status !== "DRAFT") return { kind: "CONFLICT" as const, reason: `발행 불가 상태: ${inv.status}` };
    await tx.update(s.invoices).set({ status: "ISSUED" }).where(eq(s.invoices.id, inv.id));
    await recordAudit(tx, {
      academyId: input.academyId, actorUserId: input.actorUserId, actorRole: "ACADEMY",
      action: "invoice.issued", targetType: "Invoice", targetId: inv.id,
      detail: { total: inv.total }, success: true,
    }, nowISO);
    await recordOutbox(tx, { // 알림 트랙(발송 publisher 는 사업자 연동 시)
      academyId: input.academyId, eventType: "INVOICE_ISSUED",
      payload: { invoiceId: inv.id, participantId: inv.participantId, total: inv.total, dueDate: inv.dueDate },
    }, nowISO);
    return { kind: "OK" as const, invoiceId: inv.id, total: inv.total };
  });
}

/** 무효화 — 유효 결제가 붙은 청구서는 VOID 금지(수정 청구 경로) */
export async function voidInvoice(db: Db, input: {
  actorUserId: string; actorRoles: readonly string[]; academyId: string;
  invoiceId: string; reason: string;
}, nowISO: string): Promise<IssueResult> {
  if (!isStaff(input.actorRoles)) return { kind: "FORBIDDEN", reason: "무효화는 원장·데스크만" };
  return db.transaction(async (tx) => {
    const inv = (await tx.select().from(s.invoices).where(and(
      eq(s.invoices.id, input.invoiceId), eq(s.invoices.academyId, input.academyId),
    )).for("update"))[0];
    if (!inv) return { kind: "INVALID" as const, reason: "청구서 없음" };
    if (inv.status === "VOID") return { kind: "OK" as const, invoiceId: inv.id, total: inv.total }; // 멱등
    const allocs = await tx.select().from(s.paymentAllocations)
      .where(eq(s.paymentAllocations.invoiceId, inv.id));
    if (allocs.length > 0) {
      const pays = await tx.select().from(s.payments)
        .where(inArray(s.payments.id, allocs.map((a) => a.paymentId)));
      if (pays.some((p) => ["CAPTURED", "PARTIALLY_REFUNDED", "REFUNDED", "PENDING", "AUTHORIZED"].includes(p.status))) {
        return { kind: "CONFLICT" as const, reason: "결제(진행 중 포함)가 붙은 청구서는 VOID 불가 — 환불·수정 청구 경로" };
      }
    }
    await tx.update(s.invoices).set({ status: "VOID" }).where(eq(s.invoices.id, inv.id));
    await recordAudit(tx, {
      academyId: input.academyId, actorUserId: input.actorUserId, actorRole: "ACADEMY",
      action: "invoice.voided", targetType: "Invoice", targetId: inv.id,
      reason: input.reason, detail: { total: inv.total }, success: true, // 수동 조정 = 사유 필수 감사
    }, nowISO);
    return { kind: "OK" as const, invoiceId: inv.id, total: inv.total };
  });
}

/** 오프라인 수납 — 수납 이벤트(Payment 행) 생성 · 상태는 정산이 도출 */
export async function recordOfflinePayment(db: Db, input: {
  actorUserId: string; actorRoles: readonly string[]; academyId: string;
  invoiceId: string; channel: Exclude<PaymentChannel, "ONLINE_PG">;
  amount?: number;          // 생략 = 미납 전액
  evidenceNote: string;     // 증빙(입금자명·전표 등) 필수
  idempotencyKey: string;
}, nowISO: string): Promise<IssueResult & { paymentId?: string }> {
  if (!isStaff(input.actorRoles)) return { kind: "FORBIDDEN", reason: "오프라인 수납은 원장·데스크만" };
  return db.transaction(async (tx) => {
    const inv = (await tx.select().from(s.invoices).where(and(
      eq(s.invoices.id, input.invoiceId), eq(s.invoices.academyId, input.academyId),
    )).for("update"))[0];
    if (!inv) return { kind: "INVALID" as const, reason: "청구서 없음" };
    if (inv.status === "DRAFT" || inv.status === "VOID") {
      return { kind: "CONFLICT" as const, reason: `수납 불가 상태: ${inv.status}` };
    }
    // 멱등 — 같은 키 재시도는 기존 수납 반환
    const dupPay = (await tx.select().from(s.payments).where(and(
      eq(s.payments.academyId, input.academyId),
      eq(s.payments.idempotencyKey, input.idempotencyKey),
    )))[0];
    if (dupPay) return { kind: "OK" as const, invoiceId: inv.id, total: dupPay.amount, paymentId: dupPay.id };

    // 정산 정본으로 미납액 계산 — 초과 수납 차단
    const allocRows = await tx.select().from(s.paymentAllocations)
      .where(eq(s.paymentAllocations.invoiceId, inv.id));
    const payRows = allocRows.length
      ? await tx.select().from(s.payments).where(inArray(s.payments.id, allocRows.map((a) => a.paymentId)))
      : [];
    const settlement: SettlementInput = {
      payments: payRows.map((p): DPayment => ({
        id: asId(p.id), academyId: asId(p.academyId), guardianId: asId(p.guardianId),
        amount: p.amount, status: p.status, idempotencyKey: p.idempotencyKey, createdAt: p.createdAt,
      })),
      paymentAllocations: allocRows.map((a): DAlloc => ({
        id: asId(a.id), paymentId: asId(a.paymentId), invoiceId: asId(a.invoiceId), amount: a.amount,
      })),
      refunds: [], refundAllocations: [],
    };
    const dInv: DInvoice = {
      id: asId(inv.id), academyId: asId(inv.academyId), participantId: asId(inv.participantId),
      enrollmentId: asId(inv.enrollmentId), billingPeriodId: asId(inv.billingPeriodId),
      status: inv.status, total: inv.total, dueDate: inv.dueDate,
    };
    const outstanding = outstandingForInvoice(dInv, settlement);
    const amount = input.amount ?? outstanding;
    if (!isValidMoneyAmount(amount) || amount > outstanding) {
      return { kind: "INVALID" as const, reason: `수납액 범위 밖(미납 ${outstanding}원 이하 양수)` };
    }
    // 수납 이벤트 — 원장(수납자)의 guardian 개념이 없으므로 결제 보호자는 청구 원생의
    // primary 보호자로 귀속(없으면 시스템 보류 — v1: primary 필수)
    const link = (await tx.select().from(s.guardianParticipantLinks).where(and(
      eq(s.guardianParticipantLinks.participantId, inv.participantId),
      eq(s.guardianParticipantLinks.academyId, input.academyId),
      eq(s.guardianParticipantLinks.isPrimaryGuardian, true),
    )))[0];
    if (!link) return { kind: "INVALID" as const, reason: "Primary 보호자 없음 — 보호자 연결 후 수납" };
    const paymentId = newId("pay");
    await tx.insert(s.payments).values({
      id: paymentId, academyId: input.academyId, guardianId: link.guardianId,
      amount, status: "CAPTURED", idempotencyKey: input.idempotencyKey,
      provider: `offline:${input.channel}`, providerPaymentId: paymentId,
      createdAt: nowISO, updatedAt: nowISO,
    });
    await tx.insert(s.paymentAllocations).values({
      id: newId("pa"), paymentId, invoiceId: inv.id, academyId: input.academyId, amount,
    });
    const nextStatus = deriveInvoiceStatus(dInv, {
      ...settlement,
      payments: [...settlement.payments, {
        id: asId(paymentId), academyId: asId(input.academyId), guardianId: asId(link.guardianId),
        amount, status: "CAPTURED", idempotencyKey: input.idempotencyKey, createdAt: nowISO,
      }],
      paymentAllocations: [...settlement.paymentAllocations, {
        id: asId("pa_new"), paymentId: asId(paymentId), invoiceId: asId(inv.id), amount,
      }],
    });
    await tx.update(s.invoices).set({ status: nextStatus }).where(eq(s.invoices.id, inv.id));
    await recordAudit(tx, {
      academyId: input.academyId, actorUserId: input.actorUserId, actorRole: "ACADEMY",
      action: "payment.offline_recorded", targetType: "Payment", targetId: paymentId,
      reason: input.channel,
      detail: { invoiceId: inv.id, amount, channel: input.channel, evidenceNote: input.evidenceNote },
      success: true,
    }, nowISO);
    await recordOutbox(tx, {
      academyId: input.academyId, eventType: "OFFLINE_PAYMENT_RECORDED",
      payload: { paymentId, invoiceId: inv.id, amount, channel: input.channel },
    }, nowISO);
    return { kind: "OK" as const, invoiceId: inv.id, total: amount, paymentId };
  });
}
