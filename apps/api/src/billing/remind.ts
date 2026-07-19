/* 미납 리마인드(#45) — 원장 홈 "오늘 처리할 일"의 서버 정본.
   대상 = open 청구(ISSUED·PARTIALLY_PAID·OVERDUE) 원생의 VERIFIED·canPay 보호자.
   금액은 알림 본문에 싣지 않는다(헌법: 금액은 개인정보 — 채팅방·잠금화면 미표시).
   실 발송은 Outbox(BILLING_REMINDER) — 디스패처가 인앱 알림, 알림톡은 사업자 연동 트랙. */
import { and, eq, gte, inArray } from "drizzle-orm";
import { schema as s } from "@pacefolio/db";
import { recordAudit, recordOutbox } from "../audit";
import type { Db } from "../sessions/service";

const OPEN_STATUSES = ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] as const;

export type UnpaidRemindResult =
  | { kind: "OK"; invoices: number; guardians: number; cooldown?: boolean }
  | { kind: "FORBIDDEN"; reason: string };

export async function remindUnpaid(db: Db, input: {
  actorUserId: string; actorRoles: readonly string[]; academyId: string;
}, nowISO: string): Promise<UnpaidRemindResult> {
  if (!input.actorRoles.includes("OWNER") && !input.actorRoles.includes("DESK")) {
    return { kind: "FORBIDDEN", reason: "미납 리마인드는 원장·데스크만" };
  }
  return db.transaction(async (tx) => {
    /* 리뷰 P2: 연타·중복 재발송 방지. academy 행 FOR UPDATE 로 같은 학원의 동시
       리마인드를 직렬화한 뒤, 당일(UTC) 이미 발송했으면 재발송하지 않는다
       (알림톡 연동 시 비용·스팸 직결). 재발송 신호 = 기존 billing.reminded 감사. */
    await tx.select({ id: s.academies.id }).from(s.academies)
      .where(eq(s.academies.id, input.academyId)).for("update");
    const open = await tx.select({
      id: s.invoices.id, participantId: s.invoices.participantId,
    }).from(s.invoices).where(and(
      eq(s.invoices.academyId, input.academyId),
      inArray(s.invoices.status, [...OPEN_STATUSES]),
    ));
    if (open.length === 0) return { kind: "OK" as const, invoices: 0, guardians: 0 };
    const dayStartUtc = `${nowISO.slice(0, 10)}T00:00:00.000Z`;
    const priorToday = (await tx.select({ id: s.auditLogs.id }).from(s.auditLogs).where(and(
      eq(s.auditLogs.academyId, input.academyId),
      eq(s.auditLogs.action, "billing.reminded"),
      gte(s.auditLogs.at, dayStartUtc),
    )).limit(1))[0];
    if (priorToday) {
      // 당일 이미 발송 — 재발송·감사·outbox 없음(멱등한 no-op, 스팸 차단)
      return { kind: "OK" as const, invoices: open.length, guardians: 0, cooldown: true };
    }
    /* 수신자 = 그 원생들의 VERIFIED + canPay 보호자 — 소통 재인가 정합(canPay 회수 시 제외) */
    const participantIds = [...new Set(open.map((i) => i.participantId))];
    const rows = await tx.select({ userId: s.guardians.userId })
      .from(s.guardianParticipantLinks)
      .innerJoin(s.guardians, eq(s.guardians.id, s.guardianParticipantLinks.guardianId))
      .where(and(
        eq(s.guardianParticipantLinks.academyId, input.academyId),
        inArray(s.guardianParticipantLinks.participantId, participantIds),
        eq(s.guardianParticipantLinks.verificationStatus, "VERIFIED"),
        eq(s.guardianParticipantLinks.canPay, true),
      ));
    const userIds = [...new Set(rows.map((r) => r.userId))];
    await recordAudit(tx, {
      academyId: input.academyId, actorUserId: input.actorUserId, actorRole: "ACADEMY",
      action: "billing.reminded", targetType: "Academy", targetId: input.academyId,
      detail: { invoices: open.length, guardians: userIds.length }, // 금액 미포함
      success: true,
    }, nowISO);
    if (userIds.length) {
      await recordOutbox(tx, {
        academyId: input.academyId, eventType: "BILLING_REMINDER",
        payload: { invoiceCount: open.length, userIds },
      }, nowISO);
    }
    return { kind: "OK" as const, invoices: open.length, guardians: userIds.length };
  });
}
