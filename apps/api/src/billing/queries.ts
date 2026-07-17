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
