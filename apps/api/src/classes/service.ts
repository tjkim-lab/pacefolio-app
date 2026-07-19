/* 반·수업 일정 vertical slice — 기본선 1단계(#22, docs/15)
   반 생성(유형 3종) → 반복 일정 전개(세션 인스턴스) → 휴강.
   권한: 생성·전개·휴강 = OWNER/DESK. 조회 = 학원 멤버.
   전개는 멱등: 구간 내 SCHEDULED 만 삭제 후 재삽입(CANCELED·COMPLETED 보존). */
import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { schema as s } from "@pacefolio/db";
import {
  validateScheduleSlots, expandWeeklySchedule,
  type ClassScheduleType, type WeeklySlot,
} from "@pacefolio/domain";
import { newId } from "../crypto";
import { recordAudit, recordOutbox } from "../audit";
import type { Db } from "../sessions/service";

const isStaff = (roles: readonly string[]) => roles.includes("OWNER") || roles.includes("DESK");

export type CreateClassResult =
  | { kind: "CREATED"; classId: string }
  | { kind: "FORBIDDEN"; reason: string }
  | { kind: "INVALID"; reason: string };

export async function createClass(db: Db, input: {
  actorUserId: string;
  actorRoles: readonly string[];
  academyId: string;
  name: string;
  scheduleType: ClassScheduleType;
  capacity: number;
  room?: string;
  coachUserId?: string;
  slots: WeeklySlot[];
}, nowISO: string): Promise<CreateClassResult> {
  if (!isStaff(input.actorRoles)) {
    return { kind: "FORBIDDEN", reason: "반 생성은 원장·데스크만" };
  }
  const v = validateScheduleSlots(input.scheduleType, input.slots);
  if (!v.ok) return { kind: "INVALID", reason: v.reason };
  if (!Number.isInteger(input.capacity) || input.capacity < 1 || input.capacity > 200) {
    return { kind: "INVALID", reason: "정원은 1~200" };
  }
  return db.transaction(async (tx) => {
    if (input.coachUserId) {
      const ms = (await tx.select().from(s.academyMemberships).where(and(
        eq(s.academyMemberships.userId, input.coachUserId),
        eq(s.academyMemberships.academyId, input.academyId),
        eq(s.academyMemberships.status, "ACTIVE"),
      )))[0];
      if (!ms?.roles.includes("COACH")) {
        return { kind: "INVALID" as const, reason: "담당 코치가 이 학원의 재직 코치가 아니에요" };
      }
    }
    // PARTICIPANT_SPECIFIC: 슬롯 원생이 이 학원 소속인지 (복합 FK 가 최종 방어)
    const classId = newId("cls");
    await tx.insert(s.dbClasses).values({
      id: classId, academyId: input.academyId, name: input.name,
      scheduleType: input.scheduleType, capacity: input.capacity,
      room: input.room ?? null, createdAt: nowISO, updatedAt: nowISO,
    });
    await tx.insert(s.classScheduleSlots).values(input.slots.map((sl) => ({
      id: newId("slot"), classId, academyId: input.academyId,
      weekday: sl.weekday, startTime: sl.startTime, endTime: sl.endTime,
      participantId: sl.participantId ?? null,
    })));
    if (input.coachUserId) {
      await tx.insert(s.classAssignments).values({
        id: newId("ca"), classId, academyId: input.academyId,
        coachUserId: input.coachUserId, status: "ACTIVE",
        startDate: nowISO.slice(0, 10), createdAt: nowISO,
      });
    }
    await recordAudit(tx, {
      academyId: input.academyId, actorUserId: input.actorUserId, actorRole: "ACADEMY",
      action: "class.created", targetType: "Class", targetId: classId,
      detail: { name: input.name, scheduleType: input.scheduleType, slots: input.slots.length,
        coachUserId: input.coachUserId ?? undefined },
      success: true,
    }, nowISO);
    return { kind: "CREATED" as const, classId };
  });
}

export type GenerateResult =
  | { kind: "GENERATED"; created: number; keptCanceled: number }
  | { kind: "FORBIDDEN"; reason: string }
  | { kind: "INVALID"; reason: string };

export async function generateSessions(db: Db, input: {
  actorUserId: string;
  actorRoles: readonly string[];
  academyId: string;
  classId: string;
  rangeStart: string;
  rangeEnd: string;
}, nowISO: string): Promise<GenerateResult> {
  if (!isStaff(input.actorRoles)) return { kind: "FORBIDDEN", reason: "일정 전개는 원장·데스크만" };
  return db.transaction(async (tx) => {
    const cls = (await tx.select().from(s.dbClasses).where(and(
      eq(s.dbClasses.id, input.classId), eq(s.dbClasses.academyId, input.academyId),
    )).for("update"))[0]; // 동시 전개 직렬화
    if (!cls) return { kind: "INVALID" as const, reason: "반 없음(학원 불일치 포함)" };
    const slots = await tx.select().from(s.classScheduleSlots)
      .where(eq(s.classScheduleSlots.classId, cls.id));
    const expanded = expandWeeklySchedule({
      slots: slots.map((sl) => ({
        weekday: sl.weekday, startTime: sl.startTime, endTime: sl.endTime,
        ...(sl.participantId ? { participantId: sl.participantId } : {}),
      })),
      rangeStart: input.rangeStart, rangeEnd: input.rangeEnd,
    });
    if (expanded.length === 0) return { kind: "INVALID" as const, reason: "전개 결과 0회 — 범위·슬롯 확인" };

    // 멱등 재전개: 구간 내 SCHEDULED 만 교체 — 휴강(CANCELED)·완료는 보존
    const existing = await tx.select().from(s.classSessions).where(and(
      eq(s.classSessions.classId, cls.id),
      gte(s.classSessions.date, input.rangeStart),
      lte(s.classSessions.date, input.rangeEnd),
    ));
    const keep = existing.filter((e) => e.status !== "SCHEDULED");
    const scheduledIds = existing.filter((e) => e.status === "SCHEDULED").map((e) => e.id);
    if (scheduledIds.length) {
      await tx.delete(s.classSessions).where(inArray(s.classSessions.id, scheduledIds));
    }
    const keepKey = new Set(keep.map((k) => `${k.date}|${k.startTime}|${k.participantId ?? ""}`));
    const rows = expanded
      .filter((e) => !keepKey.has(`${e.date}|${e.startTime}|${e.participantId ?? ""}`))
      .map((e) => ({
        id: newId("sess"), classId: cls.id, academyId: input.academyId,
        date: e.date, startTime: e.startTime, endTime: e.endTime,
        participantId: e.participantId ?? null,
        createdAt: nowISO, updatedAt: nowISO,
      }));
    if (rows.length) await tx.insert(s.classSessions).values(rows);
    await recordAudit(tx, {
      academyId: input.academyId, actorUserId: input.actorUserId, actorRole: "ACADEMY",
      action: "class.sessions_generated", targetType: "Class", targetId: cls.id,
      detail: { rangeStart: input.rangeStart, rangeEnd: input.rangeEnd, created: rows.length },
      success: true,
    }, nowISO);
    return { kind: "GENERATED" as const, created: rows.length, keptCanceled: keep.length };
  });
}

export type CancelSessionResult =
  | { kind: "CANCELED"; sessionId: string }
  | { kind: "FORBIDDEN"; reason: string }
  | { kind: "CONFLICT"; reason: string }
  | { kind: "NOT_FOUND" };

export async function cancelSession(db: Db, input: {
  actorUserId: string;
  actorRoles: readonly string[];
  academyId: string;
  sessionId: string;
  reason: string;
}, nowISO: string): Promise<CancelSessionResult> {
  if (!isStaff(input.actorRoles)) return { kind: "FORBIDDEN", reason: "휴강 처리는 원장·데스크만" };
  return db.transaction(async (tx) => {
    const sess = (await tx.select().from(s.classSessions).where(and(
      eq(s.classSessions.id, input.sessionId), eq(s.classSessions.academyId, input.academyId),
    )).for("update"))[0];
    if (!sess) return { kind: "NOT_FOUND" as const };
    if (sess.status === "CANCELED") return { kind: "CANCELED" as const, sessionId: sess.id }; // 멱등
    if (sess.status === "COMPLETED") return { kind: "CONFLICT" as const, reason: "완료된 수업은 휴강 처리 불가" };
    await tx.update(s.classSessions).set({
      status: "CANCELED", canceledReason: input.reason, updatedAt: nowISO,
    }).where(eq(s.classSessions.id, sess.id));
    await recordAudit(tx, {
      academyId: input.academyId, actorUserId: input.actorUserId, actorRole: "ACADEMY",
      action: "class.session_canceled", targetType: "ClassSession", targetId: sess.id,
      reason: input.reason, detail: { date: sess.date, classId: sess.classId }, success: true,
    }, nowISO);
    // 회차 차감·보강 생성·보호자 공지는 청구·알림 트랙 소비(docs/13 휴무 event 계약)
    await recordOutbox(tx, {
      academyId: input.academyId, eventType: "CLASS_SESSION_CANCELED",
      payload: { sessionId: sess.id, classId: sess.classId, date: sess.date, reason: input.reason },
    }, nowISO);
    return { kind: "CANCELED" as const, sessionId: sess.id };
  });
}

export async function listClasses(db: Db, academyId: string) {
  const classes = await db.select().from(s.dbClasses)
    .where(eq(s.dbClasses.academyId, academyId)).orderBy(asc(s.dbClasses.createdAt));
  const ids = classes.map((c) => c.id);
  const slots = ids.length
    ? await db.select().from(s.classScheduleSlots).where(inArray(s.classScheduleSlots.classId, ids))
    : [];
  const assigns = ids.length
    ? await db.select().from(s.classAssignments).where(and(
        inArray(s.classAssignments.classId, ids), eq(s.classAssignments.status, "ACTIVE")))
    : [];
  // 반별 재원 = ACTIVE 등록 수 — 원장 홈 "반별 정원 현황"(#49)의 서버 정본
  const enrolled = ids.length
    ? await db.select({
        classId: s.dbEnrollments.classId,
        n: sql<number>`count(*)::int`,
      }).from(s.dbEnrollments).where(and(
        inArray(s.dbEnrollments.classId, ids),
        eq(s.dbEnrollments.status, "ACTIVE"),
      )).groupBy(s.dbEnrollments.classId)
    : [];
  const enrolledBy = new Map(enrolled.map((e) => [e.classId, e.n]));
  return classes.map((c) => ({
    classId: c.id, name: c.name, scheduleType: c.scheduleType,
    capacity: c.capacity, room: c.room, status: c.status,
    enrolled: enrolledBy.get(c.id) ?? 0,
    slots: slots.filter((sl) => sl.classId === c.id).map((sl) => ({
      weekday: sl.weekday, startTime: sl.startTime, endTime: sl.endTime,
      participantId: sl.participantId ?? undefined,
    })),
    coachUserIds: assigns.filter((a) => a.classId === c.id).map((a) => a.coachUserId),
  }));
}

export async function listSessions(db: Db, input: {
  academyId: string; classId: string; from?: string; to?: string;
}) {
  const conds = [
    eq(s.classSessions.classId, input.classId),
    eq(s.classSessions.academyId, input.academyId),
  ];
  if (input.from) conds.push(gte(s.classSessions.date, input.from));
  if (input.to) conds.push(lte(s.classSessions.date, input.to));
  const rows = await db.select().from(s.classSessions).where(and(...conds))
    .orderBy(asc(s.classSessions.date), asc(s.classSessions.startTime));
  return rows.map((r) => ({
    sessionId: r.id, date: r.date, startTime: r.startTime, endTime: r.endTime,
    status: r.status, participantId: r.participantId ?? undefined,
    canceledReason: r.canceledReason ?? undefined,
  }));
}

/** 반 명단 — 담당 코치(ACTIVE assignment) 또는 staff. 화면 실연결(#22~24 후속)용 */
export async function listClassRoster(db: Db, input: {
  actorUserId: string; actorRoles: readonly string[]; academyId: string; classId: string;
}) {
  const staff = isStaff(input.actorRoles);
  if (!staff) {
    const assign = (await db.select().from(s.classAssignments).where(and(
      eq(s.classAssignments.classId, input.classId),
      eq(s.classAssignments.academyId, input.academyId),
      eq(s.classAssignments.coachUserId, input.actorUserId),
      eq(s.classAssignments.status, "ACTIVE"),
    )))[0];
    if (!assign) return null;
  }
  const enrolls = await db.select().from(s.dbEnrollments).where(and(
    eq(s.dbEnrollments.classId, input.classId),
    eq(s.dbEnrollments.academyId, input.academyId),
    eq(s.dbEnrollments.status, "ACTIVE"),
  ));
  const pids = enrolls.map((e) => e.participantId);
  const kids = pids.length
    ? await db.select().from(s.participants).where(inArray(s.participants.id, pids))
    : [];
  return kids.map((p) => ({
    participantId: p.id, name: p.name, birth: p.birth, ageLabel: p.ageLabel, status: p.status,
  }));
}
