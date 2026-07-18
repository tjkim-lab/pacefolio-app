/* 안전사고 기록(#32 — E 리뷰 C2) — 코치 현장 기록의 서버 정본
   - 기록 권한: 대상 원생의 담당 코치(ACTIVE assignment × ACTIVE enrollment) 또는 staff
   - 발생 시각 = 서버 now (클라이언트 고정 시각 금지)
   - 전 기록 감사(detail 은 유형·심각도만 — 상황 원문은 감사에 미포함, 마스킹 원칙)
   - Outbox SAFETY_INCIDENT_REPORTED — 원장 알림(REQUIRED tier) 트랙
   - 조회: staff = 전체, 코치 = 본인 보고분(민감 열람도 감사) */
import { and, desc, eq } from "drizzle-orm";
import { schema as s } from "@pacefolio/db";
import type { IncidentType, IncidentSeverity, GuardianContactStatus } from "@pacefolio/domain";
import { newId } from "../crypto";
import { recordAudit, recordOutbox } from "../audit";
import type { Db } from "../sessions/service";

const isStaff = (roles: readonly string[]) =>
  roles.includes("OWNER") || roles.includes("MANAGER") || roles.includes("DESK");

export type IncidentResult =
  | { kind: "OK"; incidentId: string; occurredAt: string }
  | { kind: "FORBIDDEN"; reason: string }
  | { kind: "INVALID"; reason: string };

export async function reportIncident(db: Db, input: {
  actorUserId: string; actorRoles: readonly string[]; academyId: string;
  participantId: string; sessionId?: string;
  type: IncidentType; severity: IncidentSeverity;
  situation: string; location?: string; firstAid?: string;
  classContinued: boolean; followUpNeeded: boolean;
  guardianContact: GuardianContactStatus;
}, nowISO: string): Promise<IncidentResult> {
  return db.transaction(async (tx) => {
    const p = (await tx.select().from(s.participants).where(and(
      eq(s.participants.id, input.participantId), eq(s.participants.academyId, input.academyId),
    )))[0];
    if (!p) return { kind: "INVALID" as const, reason: "원생 없음(학원 불일치 포함)" };

    if (!isStaff(input.actorRoles)) {
      if (!input.actorRoles.includes("COACH")) {
        return { kind: "FORBIDDEN" as const, reason: "안전 기록은 담당 코치·staff 만" };
      }
      /* 담당 검증 — 코치의 ACTIVE 배정 반에 원생의 ACTIVE 등록이 있어야 */
      const link = (await tx.select({ id: s.classAssignments.id })
        .from(s.classAssignments)
        .innerJoin(s.dbEnrollments, eq(s.dbEnrollments.classId, s.classAssignments.classId))
        .where(and(
          eq(s.classAssignments.academyId, input.academyId),
          eq(s.classAssignments.coachUserId, input.actorUserId),
          eq(s.classAssignments.status, "ACTIVE"),
          eq(s.dbEnrollments.participantId, input.participantId),
          eq(s.dbEnrollments.status, "ACTIVE"),
        )))[0];
      if (!link) return { kind: "FORBIDDEN" as const, reason: "담당 원생이 아니에요" };
    }
    if (input.sessionId) {
      const sess = (await tx.select({ id: s.classSessions.id }).from(s.classSessions).where(and(
        eq(s.classSessions.id, input.sessionId), eq(s.classSessions.academyId, input.academyId),
      )))[0];
      if (!sess) return { kind: "INVALID" as const, reason: "세션 없음" };
    }

    const incidentId = newId("inc");
    await tx.insert(s.safetyIncidents).values({
      id: incidentId, academyId: input.academyId,
      participantId: input.participantId, sessionId: input.sessionId,
      reportedByUserId: input.actorUserId,
      type: input.type, severity: input.severity,
      situation: input.situation.trim(),
      location: input.location?.trim() || undefined,
      firstAid: input.firstAid?.trim() || undefined,
      classContinued: input.classContinued, followUpNeeded: input.followUpNeeded,
      guardianContact: input.guardianContact,
      occurredAt: nowISO, createdAt: nowISO,
    });
    await recordAudit(tx, {
      academyId: input.academyId, actorUserId: input.actorUserId, actorRole: "ACADEMY",
      action: "safety_incident.reported", targetType: "SafetyIncident", targetId: incidentId,
      detail: { participantId: input.participantId, type: input.type, severity: input.severity },
      success: true,
    }, nowISO);
    await recordOutbox(tx, {
      academyId: input.academyId, eventType: "SAFETY_INCIDENT_REPORTED",
      payload: { incidentId, participantId: input.participantId, severity: input.severity }, // ID 참조만
    }, nowISO);
    return { kind: "OK" as const, incidentId, occurredAt: nowISO };
  });
}

export async function listIncidents(db: Db, input: {
  actorUserId: string; actorRoles: readonly string[]; academyId: string;
}, nowISO: string) {
  const staff = isStaff(input.actorRoles);
  if (!staff && !input.actorRoles.includes("COACH")) return null; // 보호자 표면 없음(v1)
  const rows = await db.select({
    incidentId: s.safetyIncidents.id,
    participantId: s.safetyIncidents.participantId,
    participantName: s.participants.name,
    reportedByUserId: s.safetyIncidents.reportedByUserId,
    type: s.safetyIncidents.type,
    severity: s.safetyIncidents.severity,
    situation: s.safetyIncidents.situation,
    location: s.safetyIncidents.location,
    firstAid: s.safetyIncidents.firstAid,
    classContinued: s.safetyIncidents.classContinued,
    followUpNeeded: s.safetyIncidents.followUpNeeded,
    guardianContact: s.safetyIncidents.guardianContact,
    occurredAt: s.safetyIncidents.occurredAt,
  }).from(s.safetyIncidents)
    .innerJoin(s.participants, eq(s.participants.id, s.safetyIncidents.participantId))
    .where(eq(s.safetyIncidents.academyId, input.academyId))
    .orderBy(desc(s.safetyIncidents.occurredAt));
  const visible = staff ? rows : rows.filter((r) => r.reportedByUserId === input.actorUserId);
  /* 민감(건강·안전) 기록 열람 = 감사 — chat 민감 열람과 같은 원칙 */
  if (visible.length > 0) {
    await recordAudit(db, {
      academyId: input.academyId, actorUserId: input.actorUserId,
      actorRole: staff ? "ACADEMY" : "COACH",
      action: "safety_incident.viewed", targetType: "SafetyIncident", targetId: "list",
      detail: { count: visible.length }, success: true,
    }, nowISO);
  }
  return visible;
}
