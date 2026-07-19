/* 기술·클리어·뱃지 서비스 — PS5 (docs/20 §2 · 지시서 §6.5·§6.9·§9)
   불변식: 반복 횟수만으로 자동 클리어 금지(권한 코치가 기준 확인 후 확정) ·
   클리어 확정+뱃지 발급+감사+outbox+보호자 알림 = 동일 tx ·
   뱃지 중복 발급 = partial UNIQUE 가 DB 차단 · 정정 이력 보존 ·
   같은 반 안에서 아이별 진도 다름(progress = 원생×기술). */
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { schema as s } from "@pacefolio/db";
import {
  isVersionEditable, isPracticeObservation, nextProgressStatus, canClear, validateClearance,
  type SkillProgressStatus, type PracticeObservation,
} from "@pacefolio/domain";
import { newId } from "../crypto";
import { recordAudit, recordOutbox } from "../audit";
import type { Db } from "../sessions/service";

const isOwner = (roles: readonly string[]) => roles.includes("OWNER");
const isStaff = (roles: readonly string[]) => roles.includes("OWNER") || roles.includes("DESK");
interface Actor { actorUserId: string; actorRoles: readonly string[]; academyId: string }

/** 코치가 이 원생을 지도하나 — 원생의 ACTIVE 반 중 코치 담당(ACTIVE) 반 존재.
    코치 권한 종료(assignment ENDED) 시 자동 차단(지시서 보안 테스트). */
async function canCoachParticipant(db: Db, input: Actor & { participantId: string }): Promise<boolean> {
  if (isStaff(input.actorRoles)) return true;
  if (!input.actorRoles.includes("COACH")) return false;
  const enrolls = await db.select().from(s.dbEnrollments).where(and(
    eq(s.dbEnrollments.participantId, input.participantId),
    eq(s.dbEnrollments.academyId, input.academyId),
    eq(s.dbEnrollments.status, "ACTIVE"),
  ));
  if (!enrolls.length) return false;
  const assigns = await db.select().from(s.classAssignments).where(and(
    inArray(s.classAssignments.classId, enrolls.map((e) => e.classId)),
    eq(s.classAssignments.coachUserId, input.actorUserId),
    eq(s.classAssignments.status, "ACTIVE"),
  ));
  return assigns.length > 0;
}

/* ── 1. 기술 편집(버전 콘텐츠 — DRAFT 만·OWNER) ── */
export async function createSkill(db: Db, input: Actor & {
  versionId: string; programLevelId: string; name: string; description?: string;
  sortOrder?: number; recommendedPracticeMin?: number; recommendedPracticeMax?: number;
  previousSkillId?: string;
}, nowISO: string) {
  if (!isOwner(input.actorRoles)) return { kind: "FORBIDDEN" as const, reason: "기술 편집은 원장만(PS5)" };
  return db.transaction(async (tx) => {
    const v = (await tx.select().from(s.programVersions).where(and(
      eq(s.programVersions.id, input.versionId), eq(s.programVersions.academyId, input.academyId),
    )).for("update"))[0];
    if (!v) return { kind: "NOT_FOUND" as const };
    if (!isVersionEditable(v.status)) {
      return { kind: "INVALID" as const, reason: "게시된 버전의 기술은 복제해 새 DRAFT 에서 수정" };
    }
    const lv = (await tx.select().from(s.programLevels).where(and(
      eq(s.programLevels.id, input.programLevelId),
      eq(s.programLevels.programVersionId, v.id),
    )))[0];
    if (!lv) return { kind: "INVALID" as const, reason: "단계가 이 버전에 없어요" };
    if (input.previousSkillId) {
      const prev = (await tx.select().from(s.skills).where(and(
        eq(s.skills.id, input.previousSkillId), eq(s.skills.programVersionId, v.id),
      )))[0];
      if (!prev) return { kind: "INVALID" as const, reason: "선행 기술이 이 버전에 없어요" };
    }
    const skillId = newId("skl");
    await tx.insert(s.skills).values({
      id: skillId, academyId: input.academyId, programVersionId: v.id,
      programLevelId: lv.id, name: input.name, description: input.description ?? null,
      sortOrder: input.sortOrder ?? 0,
      recommendedPracticeMin: input.recommendedPracticeMin ?? null,
      recommendedPracticeMax: input.recommendedPracticeMax ?? null,
      previousSkillId: input.previousSkillId ?? null,
      createdAt: nowISO, updatedAt: nowISO,
    }).onConflictDoNothing(); // (level, name) UNIQUE
    const inserted = (await tx.select().from(s.skills).where(eq(s.skills.id, skillId)))[0];
    if (!inserted) return { kind: "INVALID" as const, reason: "같은 단계에 같은 이름의 기술이 있어요" };
    return { kind: "CREATED" as const, skillId };
  });
}

export async function setSkillCriteria(db: Db, input: Actor & {
  skillId: string; criteria: { label: string; description?: string; required?: boolean }[];
}, nowISO: string) {
  if (!isOwner(input.actorRoles)) return { kind: "FORBIDDEN" as const, reason: "기준 편집은 원장만" };
  return db.transaction(async (tx) => {
    const sk = (await tx.select().from(s.skills).where(and(
      eq(s.skills.id, input.skillId), eq(s.skills.academyId, input.academyId),
    )))[0];
    if (!sk) return { kind: "NOT_FOUND" as const };
    const v = (await tx.select().from(s.programVersions)
      .where(eq(s.programVersions.id, sk.programVersionId)).for("update"))[0];
    if (!v || !isVersionEditable(v.status)) {
      return { kind: "INVALID" as const, reason: "게시된 버전의 기준은 복제해 새 DRAFT 에서 수정" };
    }
    await tx.delete(s.skillClearanceCriteria)
      .where(eq(s.skillClearanceCriteria.skillId, sk.id));
    if (input.criteria.length) {
      await tx.insert(s.skillClearanceCriteria).values(input.criteria.map((c, i) => ({
        id: newId("scc"), academyId: input.academyId, skillId: sk.id,
        label: c.label, description: c.description ?? null,
        required: c.required ?? true, sortOrder: i,
      })));
    }
    return { kind: "UPDATED" as const, count: input.criteria.length };
  });
}

export async function listSkills(db: Db, academyId: string, versionId: string) {
  const rows = await db.select().from(s.skills).where(and(
    eq(s.skills.programVersionId, versionId), eq(s.skills.academyId, academyId),
  )).orderBy(asc(s.skills.sortOrder), asc(s.skills.createdAt));
  const ids = rows.map((x) => x.id);
  const criteria = ids.length ? await db.select().from(s.skillClearanceCriteria)
    .where(inArray(s.skillClearanceCriteria.skillId, ids))
    .orderBy(asc(s.skillClearanceCriteria.sortOrder)) : [];
  const badges = ids.length ? await db.select().from(s.badgeDefinitions).where(and(
    inArray(s.badgeDefinitions.skillId, ids), eq(s.badgeDefinitions.active, true),
  )) : [];
  return rows.map((sk) => ({
    skillId: sk.id, programLevelId: sk.programLevelId, name: sk.name,
    description: sk.description ?? undefined, sortOrder: sk.sortOrder,
    recommendedPracticeMin: sk.recommendedPracticeMin ?? undefined,
    recommendedPracticeMax: sk.recommendedPracticeMax ?? undefined,
    previousSkillId: sk.previousSkillId ?? undefined, active: sk.active,
    criteria: criteria.filter((c) => c.skillId === sk.id).map((c) => ({
      criterionId: c.id, label: c.label, required: c.required,
    })),
    badge: badges.find((b) => b.skillId === sk.id)
      ? { badgeDefinitionId: badges.find((b) => b.skillId === sk.id)!.id, name: badges.find((b) => b.skillId === sk.id)!.name }
      : undefined,
  }));
}

export async function createBadgeDefinition(db: Db, input: Actor & {
  skillId?: string; name: string; description?: string;
}, nowISO: string) {
  if (!isOwner(input.actorRoles)) return { kind: "FORBIDDEN" as const, reason: "뱃지 정의는 원장만" };
  return db.transaction(async (tx) => {
    if (input.skillId) {
      const sk = (await tx.select().from(s.skills).where(and(
        eq(s.skills.id, input.skillId), eq(s.skills.academyId, input.academyId),
      )))[0];
      if (!sk) return { kind: "INVALID" as const, reason: "기술 없음(학원 불일치 포함)" };
    }
    const badgeDefinitionId = newId("bdg");
    await tx.insert(s.badgeDefinitions).values({
      id: badgeDefinitionId, academyId: input.academyId, skillId: input.skillId ?? null,
      name: input.name, description: input.description ?? null,
      createdAt: nowISO, updatedAt: nowISO,
    }).onConflictDoNothing(); // 기술당 활성 뱃지 1개
    const inserted = (await tx.select().from(s.badgeDefinitions)
      .where(eq(s.badgeDefinitions.id, badgeDefinitionId)))[0];
    if (!inserted) return { kind: "INVALID" as const, reason: "이 기술의 활성 뱃지가 이미 있어요" };
    return { kind: "CREATED" as const, badgeDefinitionId };
  });
}

/* ── 2. 연습 기록 — 관찰이 정본·자동 클리어 없음 ── */
export async function recordSkillPractice(db: Db, input: Actor & {
  participantId: string; skillId: string; result: string;
  classSessionId?: string; coachNote?: string;
}, nowISO: string) {
  if (!isPracticeObservation(input.result)) {
    return { kind: "INVALID" as const, reason: "관찰값이 아니에요 — 클리어는 확정 절차로만" };
  }
  if (!(await canCoachParticipant(db, input))) {
    return { kind: "FORBIDDEN" as const, reason: "담당 코치 또는 원장·데스크만" };
  }
  return db.transaction(async (tx) => {
    const sk = (await tx.select().from(s.skills).where(and(
      eq(s.skills.id, input.skillId), eq(s.skills.academyId, input.academyId),
      eq(s.skills.active, true),
    )))[0];
    if (!sk) return { kind: "NOT_FOUND" as const };
    const v = (await tx.select().from(s.programVersions)
      .where(eq(s.programVersions.id, sk.programVersionId)))[0];
    if (v?.status !== "PUBLISHED") {
      return { kind: "INVALID" as const, reason: "게시된 프로그램의 기술만 기록할 수 있어요" };
    }
    const p = (await tx.select().from(s.participants).where(and(
      eq(s.participants.id, input.participantId), eq(s.participants.academyId, input.academyId),
    )))[0];
    if (!p) return { kind: "NOT_FOUND" as const };
    const observed = input.result as PracticeObservation;
    await tx.insert(s.skillPracticeEvents).values({
      id: newId("spe"), academyId: input.academyId, participantId: p.id, skillId: sk.id,
      classSessionId: input.classSessionId ?? null, result: observed,
      coachNote: input.coachNote ?? null,
      recordedByUserId: input.actorUserId, recordedAt: nowISO,
    });
    const cur = (await tx.select().from(s.participantSkillProgress).where(and(
      eq(s.participantSkillProgress.participantId, p.id),
      eq(s.participantSkillProgress.skillId, sk.id),
    )).for("update"))[0];
    let status: SkillProgressStatus;
    if (!cur) {
      status = nextProgressStatus("NOT_STARTED", observed);
      await tx.insert(s.participantSkillProgress).values({
        id: newId("psp"), academyId: input.academyId, participantId: p.id, skillId: sk.id,
        status, practiceCount: 1, firstPracticedAt: nowISO, lastPracticedAt: nowISO,
        clearanceReadyAt: status === "READY_FOR_CLEARANCE" ? nowISO : null,
        createdAt: nowISO, updatedAt: nowISO,
      });
    } else {
      status = nextProgressStatus(cur.status, observed);
      await tx.update(s.participantSkillProgress).set({
        status, practiceCount: cur.practiceCount + 1,
        firstPracticedAt: cur.firstPracticedAt ?? nowISO, lastPracticedAt: nowISO,
        clearanceReadyAt: cur.clearanceReadyAt ?? (status === "READY_FOR_CLEARANCE" ? nowISO : null),
        updatedAt: nowISO, version: cur.version + 1,
      }).where(eq(s.participantSkillProgress.id, cur.id));
    }
    return { kind: "RECORDED" as const, status, practiceCount: (cur?.practiceCount ?? 0) + 1 };
  });
}

/* ── 3. 클리어 확정 — 기준 확인 필수·뱃지 1회·전부 동일 tx ── */
export async function clearSkill(db: Db, input: Actor & {
  participantId: string; skillId: string; checkedCriteriaIds: string[]; classSessionId?: string;
}, nowISO: string) {
  if (!(await canCoachParticipant(db, input))) {
    return { kind: "FORBIDDEN" as const, reason: "담당 코치 또는 원장·데스크만 클리어를 확정해요" };
  }
  return db.transaction(async (tx) => {
    const sk = (await tx.select().from(s.skills).where(and(
      eq(s.skills.id, input.skillId), eq(s.skills.academyId, input.academyId),
      eq(s.skills.active, true),
    )))[0];
    if (!sk) return { kind: "NOT_FOUND" as const };
    const criteria = await tx.select().from(s.skillClearanceCriteria)
      .where(eq(s.skillClearanceCriteria.skillId, sk.id));
    const check = validateClearance(
      criteria.map((c) => ({ id: c.id, required: c.required })), input.checkedCriteriaIds);
    if (!check.ok) {
      return { kind: "INVALID" as const, reason: `필수 기준 미확인(${check.missing.length}개) — 기준을 확인해야 클리어할 수 있어요` };
    }
    const cur = (await tx.select().from(s.participantSkillProgress).where(and(
      eq(s.participantSkillProgress.participantId, input.participantId),
      eq(s.participantSkillProgress.skillId, sk.id),
    )).for("update"))[0]; // 동시 클리어 직렬화
    if (cur && !canClear(cur.status)) {
      return { kind: "CLEARED" as const, alreadyCleared: true, badgeAwarded: false }; // 멱등
    }
    const p = (await tx.select().from(s.participants).where(and(
      eq(s.participants.id, input.participantId), eq(s.participants.academyId, input.academyId),
    )))[0];
    if (!p) return { kind: "NOT_FOUND" as const };
    if (!cur) {
      await tx.insert(s.participantSkillProgress).values({
        id: newId("psp"), academyId: input.academyId, participantId: p.id, skillId: sk.id,
        status: "CLEARED", practiceCount: 0, clearedAt: nowISO, clearedByUserId: input.actorUserId,
        createdAt: nowISO, updatedAt: nowISO,
      });
    } else {
      await tx.update(s.participantSkillProgress).set({
        status: "CLEARED", clearedAt: nowISO, clearedByUserId: input.actorUserId,
        updatedAt: nowISO, version: cur.version + 1,
      }).where(eq(s.participantSkillProgress.id, cur.id));
    }
    // 뱃지 발급 — 활성 정의 있을 때만·중복은 partial UNIQUE 차단
    let badgeAwarded = false;
    const badgeDef = (await tx.select().from(s.badgeDefinitions).where(and(
      eq(s.badgeDefinitions.skillId, sk.id), eq(s.badgeDefinitions.active, true),
    )))[0];
    if (badgeDef) {
      const inserted = await tx.insert(s.badgeAwards).values({
        id: newId("baw"), academyId: input.academyId, participantId: p.id,
        badgeDefinitionId: badgeDef.id, skillId: sk.id,
        awardedAt: nowISO, awardedByUserId: input.actorUserId,
        sourceClassSessionId: input.classSessionId ?? null,
      }).onConflictDoNothing().returning({ id: s.badgeAwards.id });
      badgeAwarded = inserted.length > 0;
      if (badgeAwarded) {
        await recordOutbox(tx, {
          academyId: input.academyId, eventType: "SKILL_BADGE_AWARDED",
          payload: { participantId: p.id, skillId: sk.id, badgeDefinitionId: badgeDef.id, awardId: inserted[0].id },
        }, nowISO);
        // 보호자 인앱 알림(§9) — 검증된 링크만·PII 최소(이름 대신 ref)
        const links = await tx.select().from(s.guardianParticipantLinks).where(and(
          eq(s.guardianParticipantLinks.participantId, p.id),
          eq(s.guardianParticipantLinks.academyId, input.academyId),
          eq(s.guardianParticipantLinks.verificationStatus, "VERIFIED"),
          isNull(s.guardianParticipantLinks.revokedAt),
        ));
        if (links.length) {
          const guardianIds = links.map((l) => l.guardianId);
          const guardians = await tx.select().from(s.guardians)
            .where(inArray(s.guardians.id, guardianIds));
          for (const g of guardians) {
            await tx.insert(s.inAppNotifications).values({
              id: newId("ntf"), academyId: input.academyId, userId: g.userId,
              category: "GROWTH",
              title: "새로운 기술을 해냈어요 👏",
              body: `${sk.name} 기술을 클리어했어요. 뱃지북에서 확인해 보세요.`,
              refType: "PARTICIPANT", refId: p.id, createdAt: nowISO,
            });
          }
        }
      }
    }
    await recordAudit(tx, {
      academyId: input.academyId, actorUserId: input.actorUserId, actorRole: "COACH",
      action: "skill.cleared", targetType: "ParticipantSkillProgress",
      targetId: `${p.id}:${sk.id}`,
      detail: { skillId: sk.id, badgeAwarded, checkedCriteria: input.checkedCriteriaIds.length },
      success: true,
    }, nowISO);
    return { kind: "CLEARED" as const, alreadyCleared: false, badgeAwarded };
  });
}

/* ── 4. 뱃지 정정 — 이력 보존(행 유지·사유 필수) ── */
export async function correctBadgeAward(db: Db, input: Actor & {
  awardId: string; reason: string;
}, nowISO: string) {
  if (!isOwner(input.actorRoles)) return { kind: "FORBIDDEN" as const, reason: "정정은 원장만" };
  return db.transaction(async (tx) => {
    const award = (await tx.select().from(s.badgeAwards).where(and(
      eq(s.badgeAwards.id, input.awardId), eq(s.badgeAwards.academyId, input.academyId),
    )).for("update"))[0];
    if (!award) return { kind: "NOT_FOUND" as const };
    if (award.status === "CORRECTED") return { kind: "CORRECTED" as const }; // 멱등
    await tx.update(s.badgeAwards).set({
      status: "CORRECTED", correctedAt: nowISO, correctedByUserId: input.actorUserId,
      correctionReason: input.reason,
    }).where(eq(s.badgeAwards.id, award.id));
    await recordAudit(tx, {
      academyId: input.academyId, actorUserId: input.actorUserId, actorRole: "OWNER",
      action: "badge.corrected", targetType: "BadgeAward", targetId: award.id,
      reason: input.reason, success: true,
    }, nowISO);
    await recordOutbox(tx, {
      academyId: input.academyId, eventType: "SKILL_BADGE_CORRECTED",
      payload: { awardId: award.id, participantId: award.participantId },
    }, nowISO);
    return { kind: "CORRECTED" as const };
  });
}

/* ── 5. 뱃지북 — 아이별 기술 진행·획득 뱃지(점수·순위 없음) ── */
export async function getSkillBook(db: Db, academyId: string, participantId: string) {
  const p = (await db.select().from(s.participants).where(and(
    eq(s.participants.id, participantId), eq(s.participants.academyId, academyId),
  )))[0];
  if (!p) return null;
  const progress = await db.select().from(s.participantSkillProgress).where(and(
    eq(s.participantSkillProgress.participantId, p.id),
    eq(s.participantSkillProgress.academyId, academyId),
  ));
  const skillIds = progress.map((x) => x.skillId);
  const skillRows = skillIds.length
    ? await db.select().from(s.skills).where(inArray(s.skills.id, skillIds)) : [];
  const skillName = new Map(skillRows.map((x) => [x.id, x.name]));
  const awards = await db.select().from(s.badgeAwards).where(and(
    eq(s.badgeAwards.participantId, p.id), eq(s.badgeAwards.academyId, academyId),
    eq(s.badgeAwards.status, "AWARDED"),
  ));
  const badgeIds = awards.map((a) => a.badgeDefinitionId);
  const badgeDefs = badgeIds.length
    ? await db.select().from(s.badgeDefinitions).where(inArray(s.badgeDefinitions.id, badgeIds)) : [];
  const badgeName = new Map(badgeDefs.map((b) => [b.id, b.name]));
  return {
    participantId: p.id, name: p.name,
    skills: progress.map((x) => ({
      skillId: x.skillId, name: skillName.get(x.skillId) ?? "(삭제됨)",
      status: x.status, practiceCount: x.practiceCount,
      firstPracticedAt: x.firstPracticedAt ?? undefined,
      clearedAt: x.clearedAt ?? undefined,
      clearedByUserId: x.clearedByUserId ?? undefined,
    })),
    badges: awards.map((a) => ({
      awardId: a.id, name: badgeName.get(a.badgeDefinitionId) ?? "(삭제됨)",
      skillId: a.skillId ?? undefined, awardedAt: a.awardedAt,
    })),
  };
}

/* ── 6. 반 기술 현황판 — 같은 반 아이별 다른 진도(코치 그룹화용 §9) ── */
export async function getClassSkillBoard(db: Db, input: Actor & { classId: string }) {
  const staffOk = isStaff(input.actorRoles);
  if (!staffOk) {
    const assign = (await db.select().from(s.classAssignments).where(and(
      eq(s.classAssignments.classId, input.classId),
      eq(s.classAssignments.academyId, input.academyId),
      eq(s.classAssignments.coachUserId, input.actorUserId),
      eq(s.classAssignments.status, "ACTIVE"),
    )))[0];
    if (!assign) return "FORBIDDEN" as const;
  }
  const enrolls = await db.select().from(s.dbEnrollments).where(and(
    eq(s.dbEnrollments.classId, input.classId),
    eq(s.dbEnrollments.academyId, input.academyId),
    eq(s.dbEnrollments.status, "ACTIVE"),
  ));
  const pids = enrolls.map((e) => e.participantId);
  if (!pids.length) return { participants: [] };
  const kids = await db.select().from(s.participants).where(inArray(s.participants.id, pids));
  const progress = await db.select().from(s.participantSkillProgress)
    .where(inArray(s.participantSkillProgress.participantId, pids));
  const skillIds = [...new Set(progress.map((x) => x.skillId))];
  const skillRows = skillIds.length
    ? await db.select().from(s.skills).where(inArray(s.skills.id, skillIds)) : [];
  const skillName = new Map(skillRows.map((x) => [x.id, x.name]));
  return {
    participants: kids.map((k) => ({
      participantId: k.id, name: k.name,
      skills: progress.filter((x) => x.participantId === k.id).map((x) => ({
        skillId: x.skillId, name: skillName.get(x.skillId) ?? "(삭제됨)",
        status: x.status, practiceCount: x.practiceCount,
      })),
    })),
  };
}
