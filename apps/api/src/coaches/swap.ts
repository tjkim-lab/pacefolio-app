/* 담당 코치 교체 (#42) — PC 5단계 위저드의 서버 정본.
   원칙: 배정은 행 교체(기존 ENDED + 신규 ACTIVE)로 이력 보존 — 숫자·담당 직접 수정 금지.
   권한 회수는 원장 결정(자동 아님): IMMEDIATE 만 즉시 membership ENDED,
   ON_EFFECTIVE/KEEP 은 감사에 기록(스케줄 집행은 후속 트랙).
   보호자 알림·인수인계 브리핑은 outbox COACH_SWAPPED 로 — tx 밖 부수효과 없음. */
import { and, eq, inArray } from "drizzle-orm";
import { schema as s } from "@pacefolio/db";
import { newId } from "../crypto";
import { recordAudit, recordOutbox } from "../audit";
import type { Db } from "../sessions/service";

const isStaff = (roles: readonly string[]) => roles.includes("OWNER") || roles.includes("DESK");

export const COACH_REVOKE_MODES = ["IMMEDIATE", "ON_EFFECTIVE", "KEEP"] as const;
export type CoachRevokeMode = (typeof COACH_REVOKE_MODES)[number];

export type SwapResult =
  | { kind: "OK"; swapped: number; affectedParticipants: number; revoked: boolean }
  | { kind: "FORBIDDEN"; reason: string }
  | { kind: "INVALID"; reason: string };

export async function swapCoach(db: Db, input: {
  actorUserId: string; actorRoles: readonly string[]; academyId: string;
  fromCoachUserId: string; toCoachUserId: string; classIds: string[];
  effectiveDate: string; revokeMode: CoachRevokeMode;
}, nowISO: string): Promise<SwapResult> {
  if (!isStaff(input.actorRoles)) return { kind: "FORBIDDEN", reason: "코치 교체는 원장·데스크만" };
  if (input.fromCoachUserId === input.toCoachUserId) {
    return { kind: "INVALID", reason: "같은 코치로는 교체할 수 없어요" };
  }
  if (input.classIds.length === 0) return { kind: "INVALID", reason: "교체할 수업을 1개 이상 선택" };
  return db.transaction(async (tx) => {
    // 새 코치 = 이 학원의 ACTIVE COACH 멤버십 필수("새 코치 계정이 먼저")
    const toMs = (await tx.select().from(s.academyMemberships).where(and(
      eq(s.academyMemberships.userId, input.toCoachUserId),
      eq(s.academyMemberships.academyId, input.academyId),
      eq(s.academyMemberships.status, "ACTIVE"),
    )))[0];
    if (!toMs?.roles.includes("COACH")) {
      return { kind: "INVALID" as const, reason: "새 코치가 이 학원의 재직 코치가 아니에요 — 가입·초대가 먼저" };
    }
    const fromMs = (await tx.select().from(s.academyMemberships).where(and(
      eq(s.academyMemberships.userId, input.fromCoachUserId),
      eq(s.academyMemberships.academyId, input.academyId),
    )).for("update"))[0];
    if (!fromMs) return { kind: "INVALID" as const, reason: "기존 코치 멤버십 없음" };
    // 선택한 반 전부가 기존 코치의 ACTIVE 배정인지 — 하나라도 아니면 전체 거부(부분 교체 없음)
    const assigns = await tx.select().from(s.classAssignments).where(and(
      inArray(s.classAssignments.classId, input.classIds),
      eq(s.classAssignments.academyId, input.academyId),
      eq(s.classAssignments.coachUserId, input.fromCoachUserId),
      eq(s.classAssignments.status, "ACTIVE"),
    )).for("update");
    if (assigns.length !== input.classIds.length) {
      return { kind: "INVALID" as const, reason: "선택한 반 중 기존 코치 담당이 아닌 반이 있어요" };
    }
    // 행 교체: 기존 ENDED(적용일 기록) + 신규 ACTIVE(적용일 시작) — 이력 보존
    await tx.update(s.classAssignments)
      .set({ status: "ENDED", endDate: input.effectiveDate })
      .where(inArray(s.classAssignments.id, assigns.map((a) => a.id)));
    await tx.insert(s.classAssignments).values(input.classIds.map((classId) => ({
      id: newId("ca"), classId, academyId: input.academyId,
      coachUserId: input.toCoachUserId, status: "ACTIVE" as const,
      startDate: input.effectiveDate, createdAt: nowISO,
    })));
    const ens = await tx.select({ participantId: s.dbEnrollments.participantId })
      .from(s.dbEnrollments).where(and(
        inArray(s.dbEnrollments.classId, input.classIds),
        eq(s.dbEnrollments.academyId, input.academyId),
        eq(s.dbEnrollments.status, "ACTIVE"),
      ));
    const affectedParticipants = new Set(ens.map((e) => e.participantId)).size;
    // 권한 회수 — IMMEDIATE 만 즉시(멤버십 ENDED). 남은 담당 반이 있으면 회수 거부(고아 반 방지)
    let revoked = false;
    if (input.revokeMode === "IMMEDIATE") {
      const remaining = await tx.select({ id: s.classAssignments.id }).from(s.classAssignments).where(and(
        eq(s.classAssignments.coachUserId, input.fromCoachUserId),
        eq(s.classAssignments.academyId, input.academyId),
        eq(s.classAssignments.status, "ACTIVE"),
      ));
      if (remaining.length > 0) {
        return { kind: "INVALID" as const, reason: `즉시 회수 불가 — 아직 담당 중인 반 ${remaining.length}개가 남아있어요(전부 넘기거나 회수 시점을 바꿔주세요)` };
      }
      await tx.update(s.academyMemberships)
        .set({ status: "ENDED", endedAt: input.effectiveDate, updatedAt: nowISO })
        .where(eq(s.academyMemberships.id, fromMs.id));
      revoked = true;
    }
    await recordAudit(tx, {
      academyId: input.academyId, actorUserId: input.actorUserId, actorRole: "ACADEMY",
      action: "coach.swapped", targetType: "User", targetId: input.fromCoachUserId,
      detail: {
        toCoachUserId: input.toCoachUserId, classIds: input.classIds,
        effectiveDate: input.effectiveDate, revokeMode: input.revokeMode,
        affectedParticipants, revoked,
      },
      success: true,
    }, nowISO);
    await recordOutbox(tx, {
      academyId: input.academyId, eventType: "COACH_SWAPPED",
      payload: {
        fromCoachUserId: input.fromCoachUserId, toCoachUserId: input.toCoachUserId,
        classIds: input.classIds, effectiveDate: input.effectiveDate,
        affectedParticipants,
      },
    }, nowISO);
    return { kind: "OK" as const, swapped: input.classIds.length, affectedParticipants, revoked };
  });
}
