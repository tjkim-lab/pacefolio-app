/* 프로그램 실행 서비스 — PS4 (docs/20 §2 · 지시서 §6.6~6.8 · §9)
   반 적용(PUBLISHED 만) → 오늘 수업 계획(session_plans) → 코치 결과 확정
   (완료/부분/미진행/대체) → 참석자 기본 반영 + 예외 원생 수정 → 경험 이벤트.
   원칙: 경험 ≠ 숙련(점수 없음) · 이벤트 append-only + UNIQUE 중복 차단 ·
   게시 버전 참조 = 불변 스냅샷(과거 수업 내용 불변). */
import { and, asc, eq, inArray } from "drizzle-orm";
import { schema as s } from "@pacefolio/db";
import { newId } from "../crypto";
import { recordAudit, recordOutbox } from "../audit";
import type { Db } from "../sessions/service";

const isStaff = (roles: readonly string[]) => roles.includes("OWNER") || roles.includes("DESK");
interface Actor { actorUserId: string; actorRoles: readonly string[]; academyId: string }

/** 담당 코치(ACTIVE assignment) 또는 staff — 수업 실행 권한의 정본 */
async function canRunClass(db: Db, input: Actor & { classId: string }): Promise<boolean> {
  if (isStaff(input.actorRoles)) return true;
  if (!input.actorRoles.includes("COACH")) return false;
  const assign = (await db.select().from(s.classAssignments).where(and(
    eq(s.classAssignments.classId, input.classId),
    eq(s.classAssignments.academyId, input.academyId),
    eq(s.classAssignments.coachUserId, input.actorUserId),
    eq(s.classAssignments.status, "ACTIVE"),
  )))[0];
  return !!assign;
}

/* ── 1. 반 적용 — PUBLISHED 버전만 ── */
export async function assignProgramToClass(db: Db, input: Actor & {
  classId: string; programVersionId: string; programLevelId?: string; effectiveFrom: string;
}, nowISO: string) {
  if (!isStaff(input.actorRoles)) return { kind: "FORBIDDEN" as const, reason: "반 적용은 원장·데스크만" };
  return db.transaction(async (tx) => {
    const v = (await tx.select().from(s.programVersions).where(and(
      eq(s.programVersions.id, input.programVersionId),
      eq(s.programVersions.academyId, input.academyId),
    )))[0];
    if (!v) return { kind: "NOT_FOUND" as const };
    if (v.status !== "PUBLISHED") {
      return { kind: "INVALID" as const, reason: "게시된 버전만 반에 적용할 수 있어요" };
    }
    const cls = (await tx.select().from(s.dbClasses).where(and(
      eq(s.dbClasses.id, input.classId), eq(s.dbClasses.academyId, input.academyId),
    )))[0];
    if (!cls) return { kind: "INVALID" as const, reason: "반 없음(학원 불일치 포함)" };
    if (input.programLevelId) {
      const lv = (await tx.select().from(s.programLevels).where(and(
        eq(s.programLevels.id, input.programLevelId),
        eq(s.programLevels.programVersionId, v.id),
      )))[0];
      if (!lv) return { kind: "INVALID" as const, reason: "단계가 이 버전에 없어요" };
    }
    const assignmentId = newId("cpa");
    await tx.insert(s.classProgramAssignments).values({
      id: assignmentId, academyId: input.academyId, classId: cls.id,
      programVersionId: v.id, programLevelId: input.programLevelId ?? null,
      effectiveFrom: input.effectiveFrom, createdByUserId: input.actorUserId, createdAt: nowISO,
    }).onConflictDoNothing(); // (classId, versionId) ACTIVE 중복
    const inserted = (await tx.select().from(s.classProgramAssignments)
      .where(eq(s.classProgramAssignments.id, assignmentId)))[0];
    if (!inserted) return { kind: "INVALID" as const, reason: "이미 이 반에 적용된 버전이에요" };
    await recordAudit(tx, {
      academyId: input.academyId, actorUserId: input.actorUserId, actorRole: "ACADEMY",
      action: "class_program.assigned", targetType: "ClassProgramAssignment", targetId: assignmentId,
      detail: { classId: cls.id, programVersionId: v.id }, success: true,
    }, nowISO);
    await recordOutbox(tx, {
      academyId: input.academyId, eventType: "CLASS_PROGRAM_ASSIGNED",
      payload: { assignmentId, classId: cls.id, programVersionId: v.id },
    }, nowISO);
    return { kind: "ASSIGNED" as const, assignmentId };
  });
}

export async function endProgramAssignment(db: Db, input: Actor & {
  assignmentId: string; effectiveTo: string;
}, nowISO: string) {
  if (!isStaff(input.actorRoles)) return { kind: "FORBIDDEN" as const, reason: "종료는 원장·데스크만" };
  return db.transaction(async (tx) => {
    const a = (await tx.select().from(s.classProgramAssignments).where(and(
      eq(s.classProgramAssignments.id, input.assignmentId),
      eq(s.classProgramAssignments.academyId, input.academyId),
    )).for("update"))[0];
    if (!a) return { kind: "NOT_FOUND" as const };
    if (a.status === "ENDED") return { kind: "ENDED" as const }; // 멱등
    await tx.update(s.classProgramAssignments).set({
      status: "ENDED", effectiveTo: input.effectiveTo,
    }).where(eq(s.classProgramAssignments.id, a.id));
    return { kind: "ENDED" as const };
  });
}

/* ── 2. 오늘 수업 계획 조회 — 코치 모바일의 정본 ── */
export async function getSessionPlan(db: Db, input: Actor & { classSessionId: string }) {
  const sess = (await db.select().from(s.classSessions).where(and(
    eq(s.classSessions.id, input.classSessionId), eq(s.classSessions.academyId, input.academyId),
  )))[0];
  if (!sess) return null;
  if (!(await canRunClass(db, { ...input, classId: sess.classId }))) return "FORBIDDEN" as const;
  const assignments = await db.select().from(s.classProgramAssignments).where(and(
    eq(s.classProgramAssignments.classId, sess.classId),
    eq(s.classProgramAssignments.academyId, input.academyId),
    eq(s.classProgramAssignments.status, "ACTIVE"),
  ));
  const out = [];
  for (const a of assignments) {
    const plan = (await db.select().from(s.sessionPlans).where(and(
      eq(s.sessionPlans.classSessionId, sess.id),
      eq(s.sessionPlans.classProgramAssignmentId, a.id),
    )))[0];
    // 다음 회차 제안: 이 assignment 로 이미 계획된 회차들 다음 sequence
    const planned = await db.select().from(s.sessionPlans)
      .where(eq(s.sessionPlans.classProgramAssignmentId, a.id));
    const usedCurriculum = new Set(planned.map((p) => p.curriculumSessionId).filter(Boolean));
    const curriculum = await db.select().from(s.curriculumSessions)
      .where(eq(s.curriculumSessions.programVersionId, a.programVersionId))
      .orderBy(asc(s.curriculumSessions.sequence));
    const target = plan?.curriculumSessionId
      ? curriculum.find((c) => c.id === plan.curriculumSessionId)
      : curriculum.find((c) => !usedCurriculum.has(c.id));
    let activities: { activityRevisionId: string; name: string; recommendedMinutes?: number; result?: string }[] = [];
    if (target) {
      const acts = await db.select().from(s.curriculumSessionActivities)
        .where(eq(s.curriculumSessionActivities.curriculumSessionId, target.id))
        .orderBy(asc(s.curriculumSessionActivities.sortOrder));
      const revIds = acts.map((x) => x.activityRevisionId);
      const revs = revIds.length
        ? await db.select().from(s.activityRevisions).where(inArray(s.activityRevisions.id, revIds)) : [];
      const revName = new Map(revs.map((r) => [r.id, r.name]));
      const results = plan
        ? await db.select().from(s.sessionActivityResults)
            .where(eq(s.sessionActivityResults.sessionPlanId, plan.id))
        : [];
      const resultBy = new Map(results.map((r) => [r.activityRevisionId, r.result]));
      activities = acts.map((x) => ({
        activityRevisionId: x.activityRevisionId,
        name: revName.get(x.activityRevisionId) ?? "(알 수 없음)",
        recommendedMinutes: x.recommendedMinutes ?? undefined,
        result: resultBy.get(x.activityRevisionId),
      }));
    }
    out.push({
      assignmentId: a.id, programVersionId: a.programVersionId,
      planId: plan?.id, planned: !!plan,
      curriculumSession: target
        ? { curriculumSessionId: target.id, name: target.name, sequence: target.sequence }
        : undefined,
      activities,
    });
  }
  return { classSessionId: sess.id, date: sess.date, plans: out };
}

/* ── 3. 계획 확정(수업↔회차 연결) — 기본 = 다음 회차 ── */
export async function createSessionPlan(db: Db, input: Actor & {
  classSessionId: string; assignmentId: string; curriculumSessionId?: string;
}, nowISO: string) {
  return db.transaction(async (tx) => {
    const sess = (await tx.select().from(s.classSessions).where(and(
      eq(s.classSessions.id, input.classSessionId), eq(s.classSessions.academyId, input.academyId),
    )))[0];
    if (!sess) return { kind: "NOT_FOUND" as const };
    if (!(await canRunClass(tx, { ...input, classId: sess.classId }))) {
      return { kind: "FORBIDDEN" as const, reason: "담당 코치 또는 원장·데스크만" };
    }
    const a = (await tx.select().from(s.classProgramAssignments).where(and(
      eq(s.classProgramAssignments.id, input.assignmentId),
      eq(s.classProgramAssignments.academyId, input.academyId),
      eq(s.classProgramAssignments.status, "ACTIVE"),
    )).for("update"))[0]; // 동시 계획 직렬화(다음 회차 계산 보호)
    if (!a) return { kind: "INVALID" as const, reason: "적용(assignment) 없음·종료됨" };
    if (a.classId !== sess.classId) return { kind: "INVALID" as const, reason: "이 수업의 반에 적용된 프로그램이 아니에요" };
    let curriculumSessionId = input.curriculumSessionId ?? null;
    if (curriculumSessionId) {
      const cs = (await tx.select().from(s.curriculumSessions).where(and(
        eq(s.curriculumSessions.id, curriculumSessionId),
        eq(s.curriculumSessions.programVersionId, a.programVersionId),
      )))[0];
      if (!cs) return { kind: "INVALID" as const, reason: "회차가 이 프로그램 버전에 없어요" };
    } else {
      const planned = await tx.select().from(s.sessionPlans)
        .where(eq(s.sessionPlans.classProgramAssignmentId, a.id));
      const used = new Set(planned.map((p) => p.curriculumSessionId).filter(Boolean));
      const next = (await tx.select().from(s.curriculumSessions)
        .where(eq(s.curriculumSessions.programVersionId, a.programVersionId))
        .orderBy(asc(s.curriculumSessions.sequence))).find((c) => !used.has(c.id));
      curriculumSessionId = next?.id ?? null; // 회차 소진 = 자유 수업
    }
    const planId = newId("spl");
    await tx.insert(s.sessionPlans).values({
      id: planId, academyId: input.academyId, classSessionId: sess.id,
      classProgramAssignmentId: a.id, curriculumSessionId,
      sourceProgramVersionId: a.programVersionId,
      createdByUserId: input.actorUserId, createdAt: nowISO,
    }).onConflictDoNothing(); // (session, assignment) UNIQUE — 멱등
    const plan = (await tx.select().from(s.sessionPlans).where(and(
      eq(s.sessionPlans.classSessionId, sess.id),
      eq(s.sessionPlans.classProgramAssignmentId, a.id),
    )))[0];
    return { kind: "PLANNED" as const, planId: plan.id, curriculumSessionId: plan.curriculumSessionId ?? undefined };
  });
}

/* ── 4. 결과 확정 → 경험 이벤트 (지시서 §6.8 흐름 그대로) ──
   참석자 기본 반영: 출결 PRESENT=FULL · LATE/EARLY_LEAVE=PARTIAL · 결석 제외.
   코치는 예외 원생만 수정(participantOverrides). NOT_DONE 은 경험 미생성.
   REPLACED 는 대체 활동의 성장영역으로 경험 생성. */
export async function confirmSessionResults(db: Db, input: Actor & {
  sessionPlanId: string;
  results: {
    activityRevisionId: string;
    result: "COMPLETED" | "PARTIAL" | "NOT_DONE" | "REPLACED";
    replacementActivityRevisionId?: string;
    coachNote?: string;
  }[];
  participantOverrides?: { participantId: string; participation: "FULL" | "PARTIAL" | "OBSERVED" | "NOT_PARTICIPATED" }[];
}, nowISO: string) {
  return db.transaction(async (tx) => {
    const plan = (await tx.select().from(s.sessionPlans).where(and(
      eq(s.sessionPlans.id, input.sessionPlanId), eq(s.sessionPlans.academyId, input.academyId),
    )).for("update"))[0];
    if (!plan) return { kind: "NOT_FOUND" as const };
    const sess = (await tx.select().from(s.classSessions)
      .where(eq(s.classSessions.id, plan.classSessionId)))[0];
    if (!sess) return { kind: "NOT_FOUND" as const };
    if (!(await canRunClass(tx, { ...input, classId: sess.classId }))) {
      return { kind: "FORBIDDEN" as const, reason: "담당 코치 또는 원장·데스크만" };
    }
    // 개정판 검증(테넌트 + REPLACED 대체 필수)
    const revIds = [
      ...input.results.map((r) => r.activityRevisionId),
      ...input.results.map((r) => r.replacementActivityRevisionId).filter((x): x is string => !!x),
    ];
    const revs = revIds.length ? await tx.select().from(s.activityRevisions).where(and(
      inArray(s.activityRevisions.id, [...new Set(revIds)]),
      eq(s.activityRevisions.academyId, input.academyId),
    )) : [];
    const revSet = new Set(revs.map((r) => r.id));
    for (const r of input.results) {
      if (!revSet.has(r.activityRevisionId)) return { kind: "INVALID" as const, reason: "활동 개정판 없음(학원 불일치 포함)" };
      if (r.result === "REPLACED" && (!r.replacementActivityRevisionId || !revSet.has(r.replacementActivityRevisionId))) {
        return { kind: "INVALID" as const, reason: "대체(REPLACED)는 대체 활동이 필요해요" };
      }
    }
    // 결과 upsert(재확정 = 같은 행 갱신)
    for (const r of input.results) {
      await tx.insert(s.sessionActivityResults).values({
        id: newId("sar"), academyId: input.academyId, sessionPlanId: plan.id,
        activityRevisionId: r.activityRevisionId, result: r.result,
        replacementActivityRevisionId: r.replacementActivityRevisionId ?? null,
        coachNote: r.coachNote ?? null,
        confirmedByUserId: input.actorUserId, confirmedAt: nowISO, updatedAt: nowISO,
      }).onConflictDoUpdate({
        target: [s.sessionActivityResults.sessionPlanId, s.sessionActivityResults.activityRevisionId],
        set: {
          result: r.result, replacementActivityRevisionId: r.replacementActivityRevisionId ?? null,
          coachNote: r.coachNote ?? null, confirmedByUserId: input.actorUserId,
          confirmedAt: nowISO, updatedAt: nowISO,
        },
      });
    }
    // 참석자 기본 반영(출결 정본) + 예외 수정
    const attendance = await tx.select().from(s.attendanceRecords).where(and(
      eq(s.attendanceRecords.sessionId, plan.classSessionId),
      eq(s.attendanceRecords.academyId, input.academyId),
    ));
    const base = new Map<string, "FULL" | "PARTIAL">();
    for (const a of attendance) {
      if (a.status === "PRESENT") base.set(a.participantId, "FULL");
      else if (a.status === "LATE" || a.status === "EARLY_LEAVE") base.set(a.participantId, "PARTIAL");
      // ABSENT · EXCUSED = 경험 없음
    }
    const overrides = new Map((input.participantOverrides ?? []).map((o) => [o.participantId, o.participation]));
    const finalBy = new Map<string, "FULL" | "PARTIAL" | "OBSERVED">();
    for (const [pid, part] of base) {
      const ov = overrides.get(pid);
      if (ov === "NOT_PARTICIPATED") continue;
      finalBy.set(pid, ov ?? part);
    }
    for (const [pid, ov] of overrides) { // 출결 밖 원생도 코치가 명시하면 반영
      if (ov === "NOT_PARTICIPATED") { finalBy.delete(pid); continue; }
      if (!finalBy.has(pid)) finalBy.set(pid, ov);
    }
    // 경험 생성: 실행된 활동(NOT_DONE 제외)의 유효 개정판 성장영역 × 참여 원생
    let events = 0;
    const executed = input.results.filter((r) => r.result !== "NOT_DONE");
    for (const r of executed) {
      const effectiveRev = r.result === "REPLACED" ? r.replacementActivityRevisionId! : r.activityRevisionId;
      const tags = await tx.select().from(s.activityRevisionGrowthTags)
        .where(eq(s.activityRevisionGrowthTags.activityRevisionId, effectiveRev));
      if (!tags.length) continue; // 영역 태그 없는 활동 = 경험지도 반영 없음(내용은 결과로 남음)
      for (const [pid, participation] of finalBy) {
        for (const t of tags) {
          const inserted = await tx.insert(s.participantExperienceEvents).values({
            id: newId("pxe"), academyId: input.academyId, participantId: pid,
            classSessionId: plan.classSessionId, activityRevisionId: effectiveRev,
            growthDomainId: t.growthDomainId, participation,
            occurredAt: nowISO, recordedByUserId: input.actorUserId,
          }).onConflictDoNothing().returning({ id: s.participantExperienceEvents.id });
          events += inserted.length; // UNIQUE 중복 차단(append-only)
        }
      }
    }
    await recordAudit(tx, {
      academyId: input.academyId, actorUserId: input.actorUserId, actorRole: "COACH",
      action: "session.results_confirmed", targetType: "SessionPlan", targetId: plan.id,
      detail: { results: input.results.length, participants: finalBy.size, events }, success: true,
    }, nowISO);
    return { kind: "CONFIRMED" as const, resultsSaved: input.results.length, participants: finalBy.size, experienceEvents: events };
  });
}

/* ── 5. 경험지도 — 점수 아님: 경험 횟수·다양성·최근성만 (docs/20 §2) ── */
export async function getExperienceMap(db: Db, input: Actor & { participantId: string }) {
  const p = (await db.select().from(s.participants).where(and(
    eq(s.participants.id, input.participantId), eq(s.participants.academyId, input.academyId),
  )))[0];
  if (!p) return null;
  const events = await db.select().from(s.participantExperienceEvents)
    .where(and(
      eq(s.participantExperienceEvents.participantId, p.id),
      eq(s.participantExperienceEvents.academyId, input.academyId),
    ));
  const revIds = [...new Set(events.map((e) => e.activityRevisionId))];
  const revs = revIds.length
    ? await db.select().from(s.activityRevisions).where(inArray(s.activityRevisions.id, revIds)) : [];
  const revToActivity = new Map(revs.map((r) => [r.id, r.activityId]));
  const domains = await db.select().from(s.growthDomains)
    .where(eq(s.growthDomains.academyId, input.academyId));
  const domainName = new Map(domains.map((d) => [d.id, d.name]));
  const byDomain = new Map<string, { count: number; activities: Set<string>; lastAt: string }>();
  for (const e of events) {
    const cur = byDomain.get(e.growthDomainId) ?? { count: 0, activities: new Set<string>(), lastAt: e.occurredAt };
    cur.count += 1;
    cur.activities.add(revToActivity.get(e.activityRevisionId) ?? e.activityRevisionId);
    if (e.occurredAt > cur.lastAt) cur.lastAt = e.occurredAt;
    byDomain.set(e.growthDomainId, cur);
  }
  return {
    participantId: p.id, name: p.name,
    totalSessions: new Set(events.map((e) => e.classSessionId)).size,
    domains: [...byDomain.entries()].map(([domainId, v]) => ({
      growthDomainId: domainId, name: domainName.get(domainId) ?? "(삭제됨)",
      experienceCount: v.count,          // "균형 활동 18회 경험"
      distinctActivities: v.activities.size, // "서로 다른 7종"
      lastExperiencedAt: v.lastAt,
    })),
  };
}
