/* 조회 전용 — 보호자 관점 청구서 목록 (fixture invoicesForGuardian 의 DB 판) */
import { and, eq, inArray, ne } from "drizzle-orm";
import { schema as s } from "@pacefolio/db";
import type { Db } from "../sessions/service";

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
