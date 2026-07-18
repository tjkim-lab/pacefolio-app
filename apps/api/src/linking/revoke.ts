/* 보호자-원생 연결 철회 — 13차 D P0-1 (raw SQL 테스트 → 실제 제품 기능)

   ⚠️ 전역 잠금 순서(13차 D P0-4 — deadlock 방지 계약):
   ┌─────────────────────────────────────────────────────────────┐
   │  Refund → GuardianParticipantLink → (Payment) → (Invoice)   │
   └─────────────────────────────────────────────────────────────┘
   - approveRefund: Refund FOR UPDATE → Link FOR UPDATE (이 순서의 기준)
   - 이 철회 서비스는 **Link 행만 잠근다** — 진행 중 환불은 무잠금 SELECT
     (조회만·개수 집계)로 확인해 Outbox/감사에 싣는다. Refund 를 잠가야
     한다면 반드시 Refund 먼저 잠근 뒤 Link 를 잠가야 한다(교차 금지).

   철회 의미론(P0-2): REVOKED = 검증됐던 관계의 사후 종료
   (REJECTED = 검증 신청 거절 — 별개). 철회 시 모든 권한 flag 를 끄고
   revokedAt·revokedByUserId·revocationReasonCode 를 기록한다. */
import { and, eq, inArray, sql } from "drizzle-orm";
import { schema as s } from "@pacefolio/db";
import { recordAudit, recordOutbox } from "../audit";
import type { Db } from "../sessions/service";

export type RevokeLinkResult =
  | { kind: "REVOKED"; linkId: string; pendingRefunds: number }
  | { kind: "ALREADY_REVOKED"; linkId: string }   // 멱등 — 재시도 안전
  | { kind: "FORBIDDEN"; reason: string }
  | { kind: "NOT_FOUND" };

const ACTIVE_REFUND_STATUSES = ["REQUESTED", "MUTUALLY_APPROVED", "PROCESSING"] as const;

export async function revokeGuardianLink(db: Db, input: {
  actorUserId: string;
  actorRoles: readonly string[];
  academyId: string;
  linkId: string;
  reasonCode: string;
  reasonText?: string;
}, nowISO: string): Promise<RevokeLinkResult> {
  return db.transaction(async (tx): Promise<RevokeLinkResult> => {
    /* 1) Link 행 잠금 — 승인(approveRefund)의 Link FOR UPDATE 와 같은 행에서
       직렬화된다. 철회가 먼저 잠그면 승인은 대기 후 REVOKED 를 읽고 거부. */
    const link = (await tx.select().from(s.guardianParticipantLinks).where(and(
      eq(s.guardianParticipantLinks.id, input.linkId),
      eq(s.guardianParticipantLinks.academyId, input.academyId),
    )).for("update"))[0];
    if (!link) return { kind: "NOT_FOUND" };

    /* 2) 권한 — 학원(OWNER·DESK) 또는 링크의 보호자 본인(스스로 연결 해제) */
    const staff = input.actorRoles.includes("OWNER") || input.actorRoles.includes("DESK");
    let actorRole = staff ? "ACADEMY" : "";
    if (!staff) {
      const gd = (await tx.select().from(s.guardians)
        .where(eq(s.guardians.userId, input.actorUserId)))[0];
      if (!gd || gd.id !== link.guardianId) {
        return { kind: "FORBIDDEN", reason: "학원 또는 링크 당사자만 철회할 수 있어요" };
      }
      actorRole = "GUARDIAN";
    }

    /* 3) 멱등 — 이미 철회됐으면 재시도 안전 */
    if (link.verificationStatus === "REVOKED") {
      return { kind: "ALREADY_REVOKED", linkId: link.id };
    }

    /* 4) 진행 중 환불 — 무잠금 조회(잠금 순서 계약: Link 보유 중 Refund 잠금 금지).
       개수만 집계해 운영 심사 신호로 감사·Outbox 에 싣는다. */
    const pending = await tx.select({ n: sql<number>`count(*)::int` }).from(s.refunds).where(and(
      eq(s.refunds.participantId, link.participantId),
      eq(s.refunds.academyId, input.academyId),
      inArray(s.refunds.status, [...ACTIVE_REFUND_STATUSES]),
    ));
    const pendingRefunds = pending[0]?.n ?? 0;

    /* 5) REVOKED 전환 — 권한 flag 전부 회수(다층 방어: 상태만 보는 코드가
       있어도 flag 가 이미 꺼져 있게) + 이력 기록 + version 증가 */
    await tx.update(s.guardianParticipantLinks).set({
      verificationStatus: "REVOKED",
      canViewSchedule: false, canViewAttendance: false, canViewHealthInfo: false,
      canReceivePhotos: false, canPay: false, canRequestRefund: false,
      revokedAt: nowISO, revokedByUserId: input.actorUserId,
      revocationReasonCode: input.reasonCode,
      updatedAt: nowISO, version: sql`${s.guardianParticipantLinks.version} + 1`,
    }).where(eq(s.guardianParticipantLinks.id, link.id));

    /* 6) 감사 + Outbox — 같은 tx. 진행 중 환불이 있으면 운영 심사 신호 */
    await recordAudit(tx, {
      academyId: input.academyId, actorUserId: input.actorUserId, actorRole,
      action: "guardian_link.revoked", targetType: "GuardianParticipantLink", targetId: link.id,
      reason: input.reasonCode,
      detail: { participantId: link.participantId, pendingRefunds,
        reasonText: input.reasonText ?? undefined },
      success: true,
    }, nowISO);
    await recordOutbox(tx, {
      academyId: input.academyId, eventType: "GUARDIAN_LINK_REVOKED",
      payload: { linkId: link.id, participantId: link.participantId, pendingRefunds },
    }, nowISO);

    return { kind: "REVOKED", linkId: link.id, pendingRefunds };
  });
}
