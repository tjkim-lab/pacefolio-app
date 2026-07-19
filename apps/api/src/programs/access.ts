/* 성장 기록(경험지도·뱃지북) 접근 경계 — PS6 (docs/20 §7 · 지시서 §10·§12)
   - 스태프(OWNER/DESK)·코치: 학원 운영 범위에서 조회(지시서 §12 COACH 기본 조회)
   - 보호자(GUARDIAN): "해당 아이와 유효하게 연결된" 경우만 —
     GuardianParticipantLink VERIFIED + 미철회(revokedAt null) 재검증.
   불허 = 404(존재 은닉 — 기존 패턴과 동일). 명시적 canViewGrowthReport 권한
   컬럼은 후속(지시서: 필요 시 마이그레이션·정책 문서화 후 추가). */
import { and, eq, isNull } from "drizzle-orm";
import { schema as s } from "@pacefolio/db";
import type { Db } from "../sessions/service";

export async function canViewGrowth(db: Db, input: {
  userId: string; roles: readonly string[]; academyId: string; participantId: string;
}): Promise<boolean> {
  if (input.roles.includes("OWNER") || input.roles.includes("DESK") || input.roles.includes("COACH")) {
    return true; // 테넌트 경계는 라우트의 academyCtx + 서비스 where 가 이미 강제
  }
  if (!input.roles.includes("GUARDIAN")) return false;
  const g = (await db.select().from(s.guardians)
    .where(eq(s.guardians.userId, input.userId)))[0];
  if (!g) return false;
  const link = (await db.select().from(s.guardianParticipantLinks).where(and(
    eq(s.guardianParticipantLinks.guardianId, g.id),
    eq(s.guardianParticipantLinks.participantId, input.participantId),
    eq(s.guardianParticipantLinks.academyId, input.academyId),
    eq(s.guardianParticipantLinks.verificationStatus, "VERIFIED"),
    isNull(s.guardianParticipantLinks.revokedAt),
  )))[0];
  return !!link;
}

/** 보호자의 자녀 목록 — VERIFIED·미철회 링크의 원생만 */
export async function listMyChildren(db: Db, input: { userId: string; academyId: string }) {
  const g = (await db.select().from(s.guardians)
    .where(eq(s.guardians.userId, input.userId)))[0];
  if (!g) return [];
  const links = await db.select().from(s.guardianParticipantLinks).where(and(
    eq(s.guardianParticipantLinks.guardianId, g.id),
    eq(s.guardianParticipantLinks.academyId, input.academyId),
    eq(s.guardianParticipantLinks.verificationStatus, "VERIFIED"),
    isNull(s.guardianParticipantLinks.revokedAt),
  ));
  if (!links.length) return [];
  const kids = await db.select().from(s.participants).where(and(
    eq(s.participants.academyId, input.academyId),
  ));
  const linked = new Set(links.map((l) => l.participantId));
  return kids.filter((k) => linked.has(k.id)).map((k) => ({
    participantId: k.id, name: k.name, ageLabel: k.ageLabel,
  }));
}

/** 반의 ACTIVE 프로그램 적용 목록 — 코치 기술 화면의 진입점 */
export async function listClassAssignments(db: Db, academyId: string, classId: string) {
  const rows = await db.select().from(s.classProgramAssignments).where(and(
    eq(s.classProgramAssignments.classId, classId),
    eq(s.classProgramAssignments.academyId, academyId),
    eq(s.classProgramAssignments.status, "ACTIVE"),
  ));
  return rows.map((a) => ({
    assignmentId: a.id, programVersionId: a.programVersionId,
    programLevelId: a.programLevelId ?? undefined, effectiveFrom: a.effectiveFrom,
  }));
}
