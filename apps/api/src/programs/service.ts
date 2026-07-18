/* 프로그램 스튜디오 vertical slice — PS1 (docs/20·21·22)
   원장이 직접 프로그램·단계·성장영역·활동·커리큘럼을 만들고 게시한다.
   불변식: DRAFT 만 편집 · PUBLISHED 직접 수정 금지(복제로만) ·
   이름은 식별자가 아니다(Activity 불변 ID + Revision 콘텐츠) ·
   ARCHIVED 활동 신규 배치 금지 · 변이 = OWNER 만(PS1) · 전부 academyId 경계. */
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { schema as s } from "@pacefolio/db";
import {
  canTransitionVersion, isVersionEditable, validateModes, validateGrowthTagSet,
  revisionEditAction, canPlaceActivity, type ProgramMode,
} from "@pacefolio/domain";
import { newId } from "../crypto";
import { recordAudit, recordOutbox } from "../audit";
import type { Db } from "../sessions/service";

const isOwner = (roles: readonly string[]) => roles.includes("OWNER");

type Forbidden = { kind: "FORBIDDEN"; reason: string };
type Invalid = { kind: "INVALID"; reason: string };
type NotFound = { kind: "NOT_FOUND" };
const FORBIDDEN_OWNER: Forbidden = { kind: "FORBIDDEN", reason: "프로그램 제작은 원장만(PS1)" };

interface Actor { actorUserId: string; actorRoles: readonly string[]; academyId: string }

/* ── 편집 게이트: DRAFT 버전만 (FOR UPDATE 로 게시와 직렬화) ── */
async function loadEditableVersion(tx: Db, academyId: string, versionId: string) {
  const v = (await tx.select().from(s.programVersions).where(and(
    eq(s.programVersions.id, versionId), eq(s.programVersions.academyId, academyId),
  )).for("update"))[0];
  if (!v) return { error: { kind: "NOT_FOUND" as const } };
  if (!isVersionEditable(v.status)) {
    return { error: { kind: "INVALID" as const, reason: `게시·검토중 버전은 편집 불가(${v.status}) — 복제해 새 DRAFT 로` } };
  }
  return { version: v };
}

/* ══ 1. 프로그램 ══ */

export async function createProgram(db: Db, input: Actor & {
  name: string; description?: string; targetAgeLabel?: string; modes: string[];
}, nowISO: string) {
  if (!isOwner(input.actorRoles)) return FORBIDDEN_OWNER;
  const m = validateModes(input.modes);
  if (!m.ok) return { kind: "INVALID" as const, reason: m.reason };
  return db.transaction(async (tx) => {
    const programId = newId("prog");
    const versionId = newId("pv");
    await tx.insert(s.programs).values({
      id: programId, academyId: input.academyId, name: input.name,
      description: input.description ?? null, targetAgeLabel: input.targetAgeLabel ?? null,
      createdByUserId: input.actorUserId, createdAt: nowISO, updatedAt: nowISO,
    });
    await tx.insert(s.programModes).values(m.modes.map((mode: ProgramMode) => ({
      id: newId("pmode"), programId, academyId: input.academyId, mode,
    })));
    // 첫 DRAFT 버전 자동 생성 — 원장은 바로 편집 시작
    await tx.insert(s.programVersions).values({
      id: versionId, academyId: input.academyId, programId, versionLabel: "v1",
      createdByUserId: input.actorUserId, createdAt: nowISO, updatedAt: nowISO,
    });
    await recordAudit(tx, {
      academyId: input.academyId, actorUserId: input.actorUserId, actorRole: "OWNER",
      action: "program.created", targetType: "Program", targetId: programId,
      detail: { name: input.name, modes: m.modes }, success: true,
    }, nowISO);
    return { kind: "CREATED" as const, programId, versionId };
  });
}

export async function listPrograms(db: Db, academyId: string) {
  const rows = await db.select().from(s.programs)
    .where(eq(s.programs.academyId, academyId)).orderBy(asc(s.programs.createdAt));
  const ids = rows.map((p) => p.id);
  const modes = ids.length
    ? await db.select().from(s.programModes).where(inArray(s.programModes.programId, ids)) : [];
  const versions = ids.length
    ? await db.select().from(s.programVersions).where(inArray(s.programVersions.programId, ids)) : [];
  return rows.map((p) => ({
    programId: p.id, name: p.name, description: p.description ?? undefined,
    targetAgeLabel: p.targetAgeLabel ?? undefined,
    ownershipType: p.ownershipType, visibility: p.visibility,
    archivedAt: p.archivedAt ?? undefined,
    modes: modes.filter((x) => x.programId === p.id).map((x) => x.mode),
    versions: versions.filter((v) => v.programId === p.id).map((v) => ({
      versionId: v.id, versionLabel: v.versionLabel, status: v.status,
      publishedAt: v.publishedAt ?? undefined,
    })),
  }));
}

export async function updateProgram(db: Db, input: Actor & {
  programId: string; name?: string; description?: string; targetAgeLabel?: string; archived?: boolean;
}, nowISO: string) {
  if (!isOwner(input.actorRoles)) return FORBIDDEN_OWNER;
  return db.transaction(async (tx) => {
    const p = (await tx.select().from(s.programs).where(and(
      eq(s.programs.id, input.programId), eq(s.programs.academyId, input.academyId),
    )).for("update"))[0];
    if (!p) return { kind: "NOT_FOUND" as const };
    await tx.update(s.programs).set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.targetAgeLabel !== undefined ? { targetAgeLabel: input.targetAgeLabel } : {}),
      ...(input.archived === true ? { archivedAt: nowISO } : {}),
      ...(input.archived === false ? { archivedAt: null } : {}),
      updatedAt: nowISO, version: p.version + 1,
    }).where(eq(s.programs.id, p.id));
    await recordAudit(tx, {
      academyId: input.academyId, actorUserId: input.actorUserId, actorRole: "OWNER",
      action: "program.updated", targetType: "Program", targetId: p.id,
      detail: { archived: input.archived }, success: true,
    }, nowISO);
    return { kind: "UPDATED" as const };
  });
}

/* ══ 2. 버전 — 복제·게시 ══ */

export async function createVersion(db: Db, input: Actor & {
  programId: string; versionLabel: string; basedOnVersionId?: string;
}, nowISO: string) {
  if (!isOwner(input.actorRoles)) return FORBIDDEN_OWNER;
  return db.transaction(async (tx) => {
    const p = (await tx.select().from(s.programs).where(and(
      eq(s.programs.id, input.programId), eq(s.programs.academyId, input.academyId),
    )))[0];
    if (!p) return { kind: "NOT_FOUND" as const };
    const versionId = newId("pv");
    await tx.insert(s.programVersions).values({
      id: versionId, academyId: input.academyId, programId: p.id,
      versionLabel: input.versionLabel, basedOnVersionId: input.basedOnVersionId ?? null,
      createdByUserId: input.actorUserId, createdAt: nowISO, updatedAt: nowISO,
    });
    if (input.basedOnVersionId) {
      const base = (await tx.select().from(s.programVersions).where(and(
        eq(s.programVersions.id, input.basedOnVersionId),
        eq(s.programVersions.academyId, input.academyId),
        eq(s.programVersions.programId, p.id), // 다른 프로그램 버전 복제 금지
      )))[0];
      if (!base) return { kind: "INVALID" as const, reason: "복제 원본 버전 없음" };
      // 딥카피: 레벨 → 섹션(부모 리매핑) → 회차 → 회차활동(revision 참조는 그대로)
      const levels = await tx.select().from(s.programLevels)
        .where(eq(s.programLevels.programVersionId, base.id));
      if (levels.length) {
        await tx.insert(s.programLevels).values(levels.map((lv) => ({
          ...lv, id: newId("plv"), programVersionId: versionId, createdAt: nowISO, updatedAt: nowISO,
        })));
      }
      const sections = await tx.select().from(s.curriculumSections)
        .where(eq(s.curriculumSections.programVersionId, base.id));
      const secMap = new Map(sections.map((sec) => [sec.id, newId("csec")]));
      if (sections.length) {
        await tx.insert(s.curriculumSections).values(sections.map((sec) => ({
          ...sec, id: secMap.get(sec.id)!, programVersionId: versionId,
          parentSectionId: sec.parentSectionId ? secMap.get(sec.parentSectionId) ?? null : null,
          createdAt: nowISO,
        })));
      }
      const sessions = await tx.select().from(s.curriculumSessions)
        .where(eq(s.curriculumSessions.programVersionId, base.id));
      const sesMap = new Map(sessions.map((se) => [se.id, newId("cses")]));
      if (sessions.length) {
        await tx.insert(s.curriculumSessions).values(sessions.map((se) => ({
          ...se, id: sesMap.get(se.id)!, programVersionId: versionId,
          sectionId: secMap.get(se.sectionId)!, createdAt: nowISO, updatedAt: nowISO,
        })));
        const acts = await tx.select().from(s.curriculumSessionActivities)
          .where(inArray(s.curriculumSessionActivities.curriculumSessionId, sessions.map((x) => x.id)));
        if (acts.length) {
          await tx.insert(s.curriculumSessionActivities).values(acts.map((a) => ({
            ...a, id: newId("csa"), curriculumSessionId: sesMap.get(a.curriculumSessionId)!,
          })));
        }
      }
    }
    await recordAudit(tx, {
      academyId: input.academyId, actorUserId: input.actorUserId, actorRole: "OWNER",
      action: "program_version.created", targetType: "ProgramVersion", targetId: versionId,
      detail: { programId: p.id, basedOn: input.basedOnVersionId }, success: true,
    }, nowISO);
    return { kind: "CREATED" as const, versionId };
  });
}

export async function publishVersion(db: Db, input: Actor & { versionId: string }, nowISO: string) {
  if (!isOwner(input.actorRoles)) return FORBIDDEN_OWNER;
  return db.transaction(async (tx) => {
    const v = (await tx.select().from(s.programVersions).where(and(
      eq(s.programVersions.id, input.versionId), eq(s.programVersions.academyId, input.academyId),
    )).for("update"))[0]; // 동시 게시 직렬화
    if (!v) return { kind: "NOT_FOUND" as const };
    if (v.status === "PUBLISHED") return { kind: "PUBLISHED" as const, versionId: v.id }; // 멱등
    if (!canTransitionVersion(v.status, "PUBLISHED")) {
      return { kind: "INVALID" as const, reason: `${v.status} → PUBLISHED 전이 불가` };
    }
    await tx.update(s.programVersions).set({
      status: "PUBLISHED", publishedAt: nowISO, publishedByUserId: input.actorUserId,
      updatedAt: nowISO, version: v.version + 1,
    }).where(eq(s.programVersions.id, v.id));
    await recordAudit(tx, {
      academyId: input.academyId, actorUserId: input.actorUserId, actorRole: "OWNER",
      action: "program_version.published", targetType: "ProgramVersion", targetId: v.id,
      detail: { programId: v.programId, versionLabel: v.versionLabel }, success: true,
    }, nowISO);
    await recordOutbox(tx, {
      academyId: input.academyId, eventType: "PROGRAM_VERSION_PUBLISHED",
      payload: { versionId: v.id, programId: v.programId },
    }, nowISO);
    return { kind: "PUBLISHED" as const, versionId: v.id };
  });
}

export async function getVersionDetail(db: Db, academyId: string, versionId: string) {
  const v = (await db.select().from(s.programVersions).where(and(
    eq(s.programVersions.id, versionId), eq(s.programVersions.academyId, academyId),
  )))[0];
  if (!v) return null;
  const [levels, sections, sessions] = await Promise.all([
    db.select().from(s.programLevels).where(eq(s.programLevels.programVersionId, v.id))
      .orderBy(asc(s.programLevels.sortOrder)),
    db.select().from(s.curriculumSections).where(eq(s.curriculumSections.programVersionId, v.id))
      .orderBy(asc(s.curriculumSections.sortOrder)),
    db.select().from(s.curriculumSessions).where(eq(s.curriculumSessions.programVersionId, v.id))
      .orderBy(asc(s.curriculumSessions.sequence)),
  ]);
  const sesIds = sessions.map((x) => x.id);
  const acts = sesIds.length
    ? await db.select().from(s.curriculumSessionActivities)
        .where(inArray(s.curriculumSessionActivities.curriculumSessionId, sesIds))
        .orderBy(asc(s.curriculumSessionActivities.sortOrder))
    : [];
  const revIds = [...new Set(acts.map((a) => a.activityRevisionId))];
  const revs = revIds.length
    ? await db.select().from(s.activityRevisions).where(inArray(s.activityRevisions.id, revIds)) : [];
  const revName = new Map(revs.map((r) => [r.id, r.name]));
  return {
    versionId: v.id, programId: v.programId, versionLabel: v.versionLabel, status: v.status,
    basedOnVersionId: v.basedOnVersionId ?? undefined, publishedAt: v.publishedAt ?? undefined,
    levels: levels.map((lv) => ({
      levelId: lv.id, name: lv.name, code: lv.code ?? undefined,
      description: lv.description ?? undefined, targetAgeLabel: lv.targetAgeLabel ?? undefined,
      sortOrder: lv.sortOrder, color: lv.color ?? undefined,
    })),
    sections: sections.map((sec) => ({
      sectionId: sec.id, parentSectionId: sec.parentSectionId ?? undefined,
      sectionType: sec.sectionType, name: sec.name, sortOrder: sec.sortOrder,
    })),
    sessions: sessions.map((se) => ({
      curriculumSessionId: se.id, sectionId: se.sectionId, name: se.name,
      sequence: se.sequence, theme: se.theme ?? undefined, objective: se.objective ?? undefined,
      activities: acts.filter((a) => a.curriculumSessionId === se.id).map((a) => ({
        activityRevisionId: a.activityRevisionId,
        name: revName.get(a.activityRevisionId) ?? "(삭제된 개정판)",
        sortOrder: a.sortOrder, required: a.required,
        recommendedMinutes: a.recommendedMinutes ?? undefined,
      })),
    })),
  };
}

/* ══ 3. 단계(레벨) — DRAFT 에서만 ══ */

export async function createLevel(db: Db, input: Actor & {
  versionId: string; name: string; code?: string; description?: string;
  targetAgeLabel?: string; sortOrder?: number; color?: string;
}, nowISO: string) {
  if (!isOwner(input.actorRoles)) return FORBIDDEN_OWNER;
  return db.transaction(async (tx) => {
    const g = await loadEditableVersion(tx, input.academyId, input.versionId);
    if ("error" in g) return g.error;
    const levelId = newId("plv");
    await tx.insert(s.programLevels).values({
      id: levelId, academyId: input.academyId, programVersionId: input.versionId,
      name: input.name, code: input.code ?? null, description: input.description ?? null,
      targetAgeLabel: input.targetAgeLabel ?? null, sortOrder: input.sortOrder ?? 0,
      color: input.color ?? null, createdAt: nowISO, updatedAt: nowISO,
    }).onConflictDoNothing(); // (versionId, name) UNIQUE
    const inserted = (await tx.select().from(s.programLevels)
      .where(eq(s.programLevels.id, levelId)))[0];
    if (!inserted) return { kind: "INVALID" as const, reason: "같은 이름의 단계가 이미 있어요" };
    return { kind: "CREATED" as const, levelId };
  });
}

export async function updateLevel(db: Db, input: Actor & {
  versionId: string; levelId: string;
  name?: string; code?: string; description?: string; targetAgeLabel?: string;
  sortOrder?: number; color?: string;
}, nowISO: string) {
  if (!isOwner(input.actorRoles)) return FORBIDDEN_OWNER;
  return db.transaction(async (tx) => {
    const g = await loadEditableVersion(tx, input.academyId, input.versionId);
    if ("error" in g) return g.error;
    const lv = (await tx.select().from(s.programLevels).where(and(
      eq(s.programLevels.id, input.levelId),
      eq(s.programLevels.programVersionId, input.versionId),
      eq(s.programLevels.academyId, input.academyId),
    )))[0];
    if (!lv) return { kind: "NOT_FOUND" as const };
    await tx.update(s.programLevels).set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.code !== undefined ? { code: input.code } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.targetAgeLabel !== undefined ? { targetAgeLabel: input.targetAgeLabel } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
      updatedAt: nowISO,
    }).where(eq(s.programLevels.id, lv.id));
    return { kind: "UPDATED" as const };
  });
}

export async function deleteLevel(db: Db, input: Actor & { versionId: string; levelId: string }, nowISO: string) {
  if (!isOwner(input.actorRoles)) return FORBIDDEN_OWNER;
  return db.transaction(async (tx) => {
    const g = await loadEditableVersion(tx, input.academyId, input.versionId);
    if ("error" in g) return g.error;
    const del = await tx.delete(s.programLevels).where(and(
      eq(s.programLevels.id, input.levelId),
      eq(s.programLevels.programVersionId, input.versionId),
      eq(s.programLevels.academyId, input.academyId),
    )).returning({ id: s.programLevels.id });
    if (!del.length) return { kind: "NOT_FOUND" as const };
    return { kind: "DELETED" as const };
  });
}

/* ══ 4. 성장 영역 ══ */

export async function createGrowthDomain(db: Db, input: Actor & {
  name: string; parentId?: string; code?: string; description?: string;
  category?: string; color?: string; icon?: string; reportVisible?: boolean; sortOrder?: number;
}, nowISO: string) {
  if (!isOwner(input.actorRoles)) return FORBIDDEN_OWNER;
  return db.transaction(async (tx) => {
    if (input.parentId) {
      const parent = (await tx.select().from(s.growthDomains).where(and(
        eq(s.growthDomains.id, input.parentId), eq(s.growthDomains.academyId, input.academyId),
      )))[0];
      if (!parent) return { kind: "INVALID" as const, reason: "상위 영역 없음" };
    }
    const domainId = newId("gro");
    await tx.insert(s.growthDomains).values({
      id: domainId, academyId: input.academyId, parentId: input.parentId ?? null,
      code: input.code ?? null, name: input.name, description: input.description ?? null,
      category: input.category ?? null, color: input.color ?? null, icon: input.icon ?? null,
      reportVisible: input.reportVisible ?? true, sortOrder: input.sortOrder ?? 0,
      createdAt: nowISO, updatedAt: nowISO,
    });
    return { kind: "CREATED" as const, domainId };
  });
}

export async function listGrowthDomains(db: Db, academyId: string) {
  const rows = await db.select().from(s.growthDomains)
    .where(eq(s.growthDomains.academyId, academyId))
    .orderBy(asc(s.growthDomains.sortOrder), asc(s.growthDomains.createdAt));
  return rows.map((d) => ({
    domainId: d.id, parentId: d.parentId ?? undefined, code: d.code ?? undefined,
    name: d.name, description: d.description ?? undefined, category: d.category ?? undefined,
    color: d.color ?? undefined, icon: d.icon ?? undefined,
    reportVisible: d.reportVisible, active: d.active, sortOrder: d.sortOrder,
  }));
}

export async function updateGrowthDomain(db: Db, input: Actor & {
  domainId: string; name?: string; description?: string; category?: string;
  color?: string; icon?: string; reportVisible?: boolean; active?: boolean; sortOrder?: number;
}, nowISO: string) {
  if (!isOwner(input.actorRoles)) return FORBIDDEN_OWNER;
  return db.transaction(async (tx) => {
    const d = (await tx.select().from(s.growthDomains).where(and(
      eq(s.growthDomains.id, input.domainId), eq(s.growthDomains.academyId, input.academyId),
    )).for("update"))[0];
    if (!d) return { kind: "NOT_FOUND" as const };
    await tx.update(s.growthDomains).set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
      ...(input.icon !== undefined ? { icon: input.icon } : {}),
      ...(input.reportVisible !== undefined ? { reportVisible: input.reportVisible } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      updatedAt: nowISO, version: d.version + 1,
    }).where(eq(s.growthDomains.id, d.id));
    return { kind: "UPDATED" as const };
  });
}

/* ══ 5. 활동 — 불변 ID + 개정판 ══ */

export interface ActivityContent {
  name: string; description?: string; instructions?: string;
  easyVariation?: string; standardVariation?: string; challengeVariation?: string;
  coachingPoints?: string; safetyNotes?: string; difficultyLabel?: string;
  recommendedAgeLabel?: string; recommendedMinutes?: number;
  participantFormat?: string; spaceRequirement?: string;
}

function revisionValues(content: ActivityContent) {
  return {
    name: content.name, description: content.description ?? null,
    instructions: content.instructions ?? null,
    easyVariation: content.easyVariation ?? null,
    standardVariation: content.standardVariation ?? null,
    challengeVariation: content.challengeVariation ?? null,
    coachingPoints: content.coachingPoints ?? null, safetyNotes: content.safetyNotes ?? null,
    difficultyLabel: content.difficultyLabel ?? null,
    recommendedAgeLabel: content.recommendedAgeLabel ?? null,
    recommendedMinutes: content.recommendedMinutes ?? null,
    participantFormat: content.participantFormat ?? null,
    spaceRequirement: content.spaceRequirement ?? null,
  };
}

export async function createActivity(db: Db, input: Actor & ActivityContent, nowISO: string) {
  if (!isOwner(input.actorRoles)) return FORBIDDEN_OWNER;
  return db.transaction(async (tx) => {
    const activityId = newId("act");
    const revisionId = newId("arv");
    await tx.insert(s.activities).values({
      id: activityId, academyId: input.academyId, currentRevisionId: revisionId,
      createdByUserId: input.actorUserId, createdAt: nowISO, updatedAt: nowISO,
    });
    await tx.insert(s.activityRevisions).values({
      id: revisionId, academyId: input.academyId, activityId, revisionNumber: 1,
      ...revisionValues(input), createdByUserId: input.actorUserId,
      createdAt: nowISO, updatedAt: nowISO,
    });
    await recordAudit(tx, {
      academyId: input.academyId, actorUserId: input.actorUserId, actorRole: "OWNER",
      action: "activity.created", targetType: "Activity", targetId: activityId,
      detail: { name: input.name }, success: true,
    }, nowISO);
    return { kind: "CREATED" as const, activityId, revisionId };
  });
}

export async function listActivities(db: Db, academyId: string) {
  const acts = await db.select().from(s.activities)
    .where(eq(s.activities.academyId, academyId)).orderBy(asc(s.activities.createdAt));
  const revIds = acts.map((a) => a.currentRevisionId).filter((x): x is string => !!x);
  const revs = revIds.length
    ? await db.select().from(s.activityRevisions).where(inArray(s.activityRevisions.id, revIds)) : [];
  const tags = revIds.length
    ? await db.select().from(s.activityRevisionGrowthTags)
        .where(inArray(s.activityRevisionGrowthTags.activityRevisionId, revIds)) : [];
  const revMap = new Map(revs.map((r) => [r.id, r]));
  return acts.map((a) => {
    const r = a.currentRevisionId ? revMap.get(a.currentRevisionId) : undefined;
    return {
      activityId: a.id, status: a.status, currentRevisionId: a.currentRevisionId ?? undefined,
      revisionNumber: r?.revisionNumber, name: r?.name ?? "(개정판 없음)",
      description: r?.description ?? undefined, difficultyLabel: r?.difficultyLabel ?? undefined,
      recommendedAgeLabel: r?.recommendedAgeLabel ?? undefined,
      recommendedMinutes: r?.recommendedMinutes ?? undefined,
      growthTags: tags.filter((t) => t.activityRevisionId === a.currentRevisionId)
        .map((t) => ({ growthDomainId: t.growthDomainId, role: t.role })),
    };
  });
}

/** 개정 정책(docs/21 결정 2): 게시된 커리큘럼이 현재 개정판을 참조하면 새 개정판 */
export async function updateActivity(db: Db, input: Actor & { activityId: string } & Partial<ActivityContent>, nowISO: string) {
  if (!isOwner(input.actorRoles)) return FORBIDDEN_OWNER;
  return db.transaction(async (tx) => {
    const a = (await tx.select().from(s.activities).where(and(
      eq(s.activities.id, input.activityId), eq(s.activities.academyId, input.academyId),
    )).for("update"))[0];
    if (!a || !a.currentRevisionId) return { kind: "NOT_FOUND" as const };
    const cur = (await tx.select().from(s.activityRevisions)
      .where(eq(s.activityRevisions.id, a.currentRevisionId)))[0];
    if (!cur) return { kind: "NOT_FOUND" as const };
    // 게시 참조 검사: csa → cses → pv(PUBLISHED)
    const refd = (await tx.select({ n: sql<number>`count(*)` })
      .from(s.curriculumSessionActivities)
      .innerJoin(s.curriculumSessions,
        eq(s.curriculumSessionActivities.curriculumSessionId, s.curriculumSessions.id))
      .innerJoin(s.programVersions,
        eq(s.curriculumSessions.programVersionId, s.programVersions.id))
      .where(and(
        eq(s.curriculumSessionActivities.activityRevisionId, cur.id),
        eq(s.programVersions.status, "PUBLISHED"),
      )))[0];
    const action = revisionEditAction({ referencedByPublishedCurriculum: Number(refd?.n ?? 0) > 0 });
    const merged: ActivityContent = {
      name: input.name ?? cur.name,
      description: input.description ?? cur.description ?? undefined,
      instructions: input.instructions ?? cur.instructions ?? undefined,
      easyVariation: input.easyVariation ?? cur.easyVariation ?? undefined,
      standardVariation: input.standardVariation ?? cur.standardVariation ?? undefined,
      challengeVariation: input.challengeVariation ?? cur.challengeVariation ?? undefined,
      coachingPoints: input.coachingPoints ?? cur.coachingPoints ?? undefined,
      safetyNotes: input.safetyNotes ?? cur.safetyNotes ?? undefined,
      difficultyLabel: input.difficultyLabel ?? cur.difficultyLabel ?? undefined,
      recommendedAgeLabel: input.recommendedAgeLabel ?? cur.recommendedAgeLabel ?? undefined,
      recommendedMinutes: input.recommendedMinutes ?? cur.recommendedMinutes ?? undefined,
      participantFormat: input.participantFormat ?? cur.participantFormat ?? undefined,
      spaceRequirement: input.spaceRequirement ?? cur.spaceRequirement ?? undefined,
    };
    if (action === "EDIT_IN_PLACE") {
      await tx.update(s.activityRevisions).set({ ...revisionValues(merged), updatedAt: nowISO })
        .where(eq(s.activityRevisions.id, cur.id));
      await tx.update(s.activities).set({ updatedAt: nowISO, version: a.version + 1 })
        .where(eq(s.activities.id, a.id));
      return { kind: "UPDATED" as const, revisionId: cur.id, newRevision: false };
    }
    // 새 개정판 — 태그도 복사(과거 개정판·기록은 그대로 보존)
    const newRevId = newId("arv");
    await tx.insert(s.activityRevisions).values({
      id: newRevId, academyId: input.academyId, activityId: a.id,
      revisionNumber: cur.revisionNumber + 1, ...revisionValues(merged),
      createdByUserId: input.actorUserId, createdAt: nowISO, updatedAt: nowISO,
    });
    const tags = await tx.select().from(s.activityRevisionGrowthTags)
      .where(eq(s.activityRevisionGrowthTags.activityRevisionId, cur.id));
    if (tags.length) {
      await tx.insert(s.activityRevisionGrowthTags).values(tags.map((t) => ({
        id: newId("argt"), academyId: input.academyId,
        activityRevisionId: newRevId, growthDomainId: t.growthDomainId, role: t.role,
      })));
    }
    await tx.update(s.activities).set({
      currentRevisionId: newRevId, updatedAt: nowISO, version: a.version + 1,
    }).where(eq(s.activities.id, a.id));
    await recordAudit(tx, {
      academyId: input.academyId, actorUserId: input.actorUserId, actorRole: "OWNER",
      action: "activity.revised", targetType: "Activity", targetId: a.id,
      detail: { fromRevision: cur.revisionNumber, toRevision: cur.revisionNumber + 1 }, success: true,
    }, nowISO);
    return { kind: "UPDATED" as const, revisionId: newRevId, newRevision: true };
  });
}

export async function archiveActivity(db: Db, input: Actor & { activityId: string }, nowISO: string) {
  if (!isOwner(input.actorRoles)) return FORBIDDEN_OWNER;
  return db.transaction(async (tx) => {
    const a = (await tx.select().from(s.activities).where(and(
      eq(s.activities.id, input.activityId), eq(s.activities.academyId, input.academyId),
    )).for("update"))[0];
    if (!a) return { kind: "NOT_FOUND" as const };
    if (a.status === "ARCHIVED") return { kind: "ARCHIVED" as const }; // 멱등
    await tx.update(s.activities).set({
      status: "ARCHIVED", archivedAt: nowISO, updatedAt: nowISO, version: a.version + 1,
    }).where(eq(s.activities.id, a.id));
    await recordAudit(tx, {
      academyId: input.academyId, actorUserId: input.actorUserId, actorRole: "OWNER",
      action: "activity.archived", targetType: "Activity", targetId: a.id, success: true,
    }, nowISO);
    return { kind: "ARCHIVED" as const };
  });
}

export async function setActivityGrowthTags(db: Db, input: Actor & {
  activityId: string; tags: { growthDomainId: string; role: "PRIMARY" | "SECONDARY" }[];
}, nowISO: string) {
  if (!isOwner(input.actorRoles)) return FORBIDDEN_OWNER;
  const v = validateGrowthTagSet(input.tags);
  if (!v.ok) return { kind: "INVALID" as const, reason: v.reason };
  return db.transaction(async (tx) => {
    const a = (await tx.select().from(s.activities).where(and(
      eq(s.activities.id, input.activityId), eq(s.activities.academyId, input.academyId),
    )).for("update"))[0];
    if (!a || !a.currentRevisionId) return { kind: "NOT_FOUND" as const };
    if (input.tags.length) {
      const domains = await tx.select().from(s.growthDomains).where(and(
        inArray(s.growthDomains.id, input.tags.map((t) => t.growthDomainId)),
        eq(s.growthDomains.academyId, input.academyId),
      ));
      if (domains.length !== new Set(input.tags.map((t) => t.growthDomainId)).size) {
        return { kind: "INVALID" as const, reason: "성장영역 없음(학원 불일치 포함)" };
      }
    }
    await tx.delete(s.activityRevisionGrowthTags)
      .where(eq(s.activityRevisionGrowthTags.activityRevisionId, a.currentRevisionId));
    if (input.tags.length) {
      await tx.insert(s.activityRevisionGrowthTags).values(input.tags.map((t) => ({
        id: newId("argt"), academyId: input.academyId,
        activityRevisionId: a.currentRevisionId!, growthDomainId: t.growthDomainId, role: t.role,
      })));
    }
    return { kind: "UPDATED" as const };
  });
}

/* ══ 6. 커리큘럼 — DRAFT 에서만 ══ */

export async function createSection(db: Db, input: Actor & {
  versionId: string; sectionType: string; name: string; parentSectionId?: string; sortOrder?: number;
}, nowISO: string) {
  if (!isOwner(input.actorRoles)) return FORBIDDEN_OWNER;
  return db.transaction(async (tx) => {
    const g = await loadEditableVersion(tx, input.academyId, input.versionId);
    if ("error" in g) return g.error;
    if (input.parentSectionId) {
      const parent = (await tx.select().from(s.curriculumSections).where(and(
        eq(s.curriculumSections.id, input.parentSectionId),
        eq(s.curriculumSections.programVersionId, input.versionId),
      )))[0];
      if (!parent) return { kind: "INVALID" as const, reason: "상위 구조 없음" };
    }
    const sectionId = newId("csec");
    await tx.insert(s.curriculumSections).values({
      id: sectionId, academyId: input.academyId, programVersionId: input.versionId,
      parentSectionId: input.parentSectionId ?? null, sectionType: input.sectionType,
      name: input.name, sortOrder: input.sortOrder ?? 0, createdAt: nowISO,
    });
    return { kind: "CREATED" as const, sectionId };
  });
}

export async function deleteSection(db: Db, input: Actor & { versionId: string; sectionId: string }, nowISO: string) {
  if (!isOwner(input.actorRoles)) return FORBIDDEN_OWNER;
  return db.transaction(async (tx) => {
    const g = await loadEditableVersion(tx, input.academyId, input.versionId);
    if ("error" in g) return g.error;
    const children = await tx.select().from(s.curriculumSections)
      .where(eq(s.curriculumSections.parentSectionId, input.sectionId));
    if (children.length) return { kind: "INVALID" as const, reason: "하위 구조 먼저 삭제" };
    const sessions = await tx.select().from(s.curriculumSessions)
      .where(eq(s.curriculumSessions.sectionId, input.sectionId));
    if (sessions.length) return { kind: "INVALID" as const, reason: "회차 먼저 삭제" };
    const del = await tx.delete(s.curriculumSections).where(and(
      eq(s.curriculumSections.id, input.sectionId),
      eq(s.curriculumSections.programVersionId, input.versionId),
      eq(s.curriculumSections.academyId, input.academyId),
    )).returning({ id: s.curriculumSections.id });
    if (!del.length) return { kind: "NOT_FOUND" as const };
    return { kind: "DELETED" as const };
  });
}

export async function createCurriculumSession(db: Db, input: Actor & {
  versionId: string; sectionId: string; name: string; sequence: number;
  theme?: string; objective?: string;
}, nowISO: string) {
  if (!isOwner(input.actorRoles)) return FORBIDDEN_OWNER;
  return db.transaction(async (tx) => {
    const g = await loadEditableVersion(tx, input.academyId, input.versionId);
    if ("error" in g) return g.error;
    const sec = (await tx.select().from(s.curriculumSections).where(and(
      eq(s.curriculumSections.id, input.sectionId),
      eq(s.curriculumSections.programVersionId, input.versionId),
    )))[0];
    if (!sec) return { kind: "INVALID" as const, reason: "구조(분기·시즌) 없음" };
    const sessionId = newId("cses");
    await tx.insert(s.curriculumSessions).values({
      id: sessionId, academyId: input.academyId, programVersionId: input.versionId,
      sectionId: input.sectionId, name: input.name, sequence: input.sequence,
      theme: input.theme ?? null, objective: input.objective ?? null,
      createdAt: nowISO, updatedAt: nowISO,
    });
    return { kind: "CREATED" as const, curriculumSessionId: sessionId };
  });
}

export async function deleteCurriculumSession(db: Db, input: Actor & {
  versionId: string; curriculumSessionId: string;
}, nowISO: string) {
  if (!isOwner(input.actorRoles)) return FORBIDDEN_OWNER;
  return db.transaction(async (tx) => {
    const g = await loadEditableVersion(tx, input.academyId, input.versionId);
    if ("error" in g) return g.error;
    await tx.delete(s.curriculumSessionActivities)
      .where(eq(s.curriculumSessionActivities.curriculumSessionId, input.curriculumSessionId));
    const del = await tx.delete(s.curriculumSessions).where(and(
      eq(s.curriculumSessions.id, input.curriculumSessionId),
      eq(s.curriculumSessions.programVersionId, input.versionId),
      eq(s.curriculumSessions.academyId, input.academyId),
    )).returning({ id: s.curriculumSessions.id });
    if (!del.length) return { kind: "NOT_FOUND" as const };
    return { kind: "DELETED" as const };
  });
}

/** 회차 활동 세트 교체 — 활동은 현재 개정판으로 배치(ARCHIVED 활동 배치 금지) */
export async function setSessionActivities(db: Db, input: Actor & {
  curriculumSessionId: string;
  activities: { activityId: string; required?: boolean; recommendedMinutes?: number }[];
}, nowISO: string) {
  if (!isOwner(input.actorRoles)) return FORBIDDEN_OWNER;
  return db.transaction(async (tx) => {
    const ses = (await tx.select().from(s.curriculumSessions).where(and(
      eq(s.curriculumSessions.id, input.curriculumSessionId),
      eq(s.curriculumSessions.academyId, input.academyId),
    )))[0];
    if (!ses) return { kind: "NOT_FOUND" as const };
    const g = await loadEditableVersion(tx, input.academyId, ses.programVersionId);
    if ("error" in g) return g.error;
    const actIds = [...new Set(input.activities.map((a) => a.activityId))];
    if (actIds.length !== input.activities.length) {
      return { kind: "INVALID" as const, reason: "같은 활동을 한 회차에 중복 배치 금지" };
    }
    const acts = actIds.length ? await tx.select().from(s.activities).where(and(
      inArray(s.activities.id, actIds), eq(s.activities.academyId, input.academyId),
    )) : [];
    if (acts.length !== actIds.length) {
      return { kind: "INVALID" as const, reason: "활동 없음(학원 불일치 포함)" };
    }
    for (const a of acts) {
      if (!canPlaceActivity(a.status)) {
        return { kind: "INVALID" as const, reason: "보관(archive)된 활동은 새로 배치할 수 없어요" };
      }
      if (!a.currentRevisionId) return { kind: "INVALID" as const, reason: "개정판 없는 활동" };
    }
    const revByAct = new Map(acts.map((a) => [a.id, a.currentRevisionId!]));
    await tx.delete(s.curriculumSessionActivities)
      .where(eq(s.curriculumSessionActivities.curriculumSessionId, ses.id));
    if (input.activities.length) {
      await tx.insert(s.curriculumSessionActivities).values(input.activities.map((a, i) => ({
        id: newId("csa"), academyId: input.academyId, curriculumSessionId: ses.id,
        activityRevisionId: revByAct.get(a.activityId)!, sortOrder: i,
        required: a.required ?? true, recommendedMinutes: a.recommendedMinutes ?? null,
      })));
    }
    await recordAudit(tx, {
      academyId: input.academyId, actorUserId: input.actorUserId, actorRole: "OWNER",
      action: "curriculum.session_activities_set", targetType: "CurriculumSession", targetId: ses.id,
      detail: { count: input.activities.length }, success: true,
    }, nowISO);
    return { kind: "UPDATED" as const, count: input.activities.length };
  });
}
