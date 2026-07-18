/* 조회 전용 — 보호자 관점 청구서 목록 (fixture invoicesForGuardian 의 DB 판) */
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { schema as s } from "@pacefolio/db";
import type { Db } from "../sessions/service";

/** 원장 수납 관제 집계(#25) — staff(OWNER·DESK)만. 화면의 "LIVE 수납 현황" 실 데이터 판.
   세션 리뷰 P1 반영: 미납 = open 청구 total − 기수납 배분(부분수납 이중계상 제거),
   수납 = 유효결제(CAPTURED·PARTIALLY_REFUNDED·REFUNDED) − 완료환불(도메인 순수납 정의). */
export async function getBillingSummary(db: Db, input: {
  academyId: string; actorRoles: readonly string[];
}) {
  if (!input.actorRoles.includes("OWNER") && !input.actorRoles.includes("DESK")) return null;
  const [inv] = await db.select({
    unpaidCount: sql<number>`count(*) filter (where ${s.invoices.status} in ('ISSUED','PARTIALLY_PAID','OVERDUE'))::int`,
    openTotalKrw: sql<number>`coalesce(sum(${s.invoices.total}) filter (where ${s.invoices.status} in ('ISSUED','PARTIALLY_PAID','OVERDUE')), 0)::int`,
    paidCount: sql<number>`count(*) filter (where ${s.invoices.status} = 'PAID')::int`,
    paidKrw: sql<number>`coalesce(sum(${s.invoices.total}) filter (where ${s.invoices.status} = 'PAID'), 0)::int`,
    billedKrw: sql<number>`coalesce(sum(${s.invoices.total}) filter (where ${s.invoices.status} not in ('DRAFT','VOID')), 0)::int`,
  }).from(s.invoices).where(eq(s.invoices.academyId, input.academyId));
  // open 청구서에 이미 배분된 유효 수납액 — 부분수납은 미납에서 차감
  const [alloc] = await db.select({
    n: sql<number>`coalesce(sum(${s.paymentAllocations.amount}), 0)::int`,
  }).from(s.paymentAllocations)
    .innerJoin(s.invoices, eq(s.paymentAllocations.invoiceId, s.invoices.id))
    .innerJoin(s.payments, eq(s.paymentAllocations.paymentId, s.payments.id))
    .where(and(
      eq(s.invoices.academyId, input.academyId),
      inArray(s.invoices.status, ["ISSUED", "PARTIALLY_PAID", "OVERDUE"]),
      inArray(s.payments.status, ["CAPTURED", "PARTIALLY_REFUNDED", "REFUNDED"]),
    ));
  const [pay] = await db.select({
    validKrw: sql<number>`coalesce(sum(${s.payments.amount}) filter (where ${s.payments.status} in ('CAPTURED','PARTIALLY_REFUNDED','REFUNDED')), 0)::int`,
  }).from(s.payments).where(eq(s.payments.academyId, input.academyId));
  const [ref] = await db.select({
    refundedKrw: sql<number>`coalesce(sum(${s.refunds.completedAmount}) filter (where ${s.refunds.status} = 'COMPLETED'), 0)::int`,
  }).from(s.refunds).where(eq(s.refunds.academyId, input.academyId));
  return {
    unpaidCount: inv.unpaidCount,
    unpaidKrw: Math.max(0, inv.openTotalKrw - alloc.n),
    paidCount: inv.paidCount,
    paidKrw: inv.paidKrw,
    billedKrw: inv.billedKrw,
    capturedKrw: Math.max(0, pay.validKrw - ref.refundedKrw),
  };
}

export interface GuardianInvoiceRow {
  invoiceId: string;
  participantId: string;
  participantName: string;
  status: string;
  total: number;
  dueDate: string;
  lines: { type: string; label: string; amount: number }[];
}

/** 연결(VERIFIED)된 자녀의 청구서만 — 테넌트 격리 포함. */
export async function listGuardianInvoices(
  db: Db,
  actorUserId: string,
  academyId: string,
): Promise<GuardianInvoiceRow[]> {
  const gd = await db.select().from(s.guardians).where(eq(s.guardians.userId, actorUserId));
  if (!gd[0]) return [];
  const links = await db.select().from(s.guardianParticipantLinks).where(and(
    eq(s.guardianParticipantLinks.guardianId, gd[0].id),
    eq(s.guardianParticipantLinks.academyId, academyId),
    eq(s.guardianParticipantLinks.verificationStatus, "VERIFIED"),
  ));
  const childIds = links.map((l) => l.participantId);
  if (childIds.length === 0) return [];

  const invs = await db.select().from(s.invoices).where(and(
    inArray(s.invoices.participantId, childIds),
    eq(s.invoices.academyId, academyId),
    ne(s.invoices.status, "DRAFT"), // 시나리오 11.6: 확정(ISSUED) 전 청구서는 보호자 비노출
  ));
  if (invs.length === 0) return [];
  const kids = await db.select().from(s.participants).where(inArray(s.participants.id, childIds));
  const lines = await db.select().from(s.invoiceLines)
    .where(inArray(s.invoiceLines.invoiceId, invs.map((i) => i.id)));

  return invs.map((inv) => ({
    invoiceId: inv.id,
    participantId: inv.participantId,
    participantName: kids.find((k) => k.id === inv.participantId)?.name ?? "",
    status: inv.status,
    total: inv.total,
    dueDate: inv.dueDate,
    lines: lines.filter((l) => l.invoiceId === inv.id)
      .map((l) => ({ type: l.type, label: l.label, amount: l.amount })),
  }));
}

/* 13차 B P0-1: 결제 상태 재조회 — "UI 성공 화면 ≠ 결제 확정".
   완료 화면은 이 API 로 서버 진실(Payment 상태 + 연결 청구서 상태)을
   확인한 뒤에만 표시한다(OpenAPI P0-4 계약의 구현).
   권한: 결제자 본인 또는 OWNER/DESK — 그 외는 404(존재 은닉). */
export interface PaymentStatusRow {
  paymentId: string;
  status: string;
  amount: number;
  invoices: { invoiceId: string; status: string }[];
}
export async function getPaymentStatus(
  db: Db,
  input: { actorUserId: string; actorRoles: readonly string[]; academyId: string; paymentId: string },
): Promise<PaymentStatusRow | null> {
  const pay = (await db.select().from(s.payments).where(and(
    eq(s.payments.id, input.paymentId), eq(s.payments.academyId, input.academyId),
  )))[0];
  if (!pay) return null;
  const staff = input.actorRoles.includes("OWNER") || input.actorRoles.includes("DESK");
  if (!staff) {
    const gd = (await db.select().from(s.guardians).where(eq(s.guardians.userId, input.actorUserId)))[0];
    if (!gd || pay.guardianId !== gd.id) return null; // 타인 결제 = 404(정보 비노출)
  }
  const allocs = await db.select().from(s.paymentAllocations)
    .where(eq(s.paymentAllocations.paymentId, pay.id));
  const invs = allocs.length
    ? await db.select().from(s.invoices).where(inArray(s.invoices.id, allocs.map((a) => a.invoiceId)))
    : [];
  return {
    paymentId: pay.id, status: pay.status, amount: pay.amount,
    invoices: invs.map((i) => ({ invoiceId: i.id, status: i.status })),
  };
}
