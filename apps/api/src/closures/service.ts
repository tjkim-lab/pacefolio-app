/* 휴무 이벤트 → 회차 재계산 (#38 — PC draft 정본화 1, docs/13 휴무 event 계약)
   원칙: "숫자 직접 수정 금지" — 휴무는 event 로 등록하고, 세션 취소·회차·일할은
   서버가 재계산한다. 철회 시 이 이벤트가 취소한 세션만 복원(closureId 추적).
   일할 정본 = domain proration(payment-engine 이식, 정합 테스트 고정). */
import { and, asc, desc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { schema as s } from "@pacefolio/db";
import { enrollmentSessions, prorate } from "@pacefolio/domain";
import { newId } from "../crypto";
import { recordAudit, recordOutbox } from "../audit";
import type { Db } from "../sessions/service";

const isStaff = (roles: readonly string[]) => roles.includes("OWNER") || roles.includes("DESK");

export type ClosureResult =
  | { kind: "OK"; closureId: string; canceledSessions: number }
  | { kind: "FORBIDDEN"; reason: string }
  | { kind: "INVALID"; reason: string };

export async function createClosure(db: Db, input: {
  actorUserId: string; actorRoles: readonly string[]; academyId: string;
  scope: "ACADEMY" | "CLASS"; classId?: string;
  dateStart: string; dateEnd: string;
  closureType: string; reason: string; deductSessions: boolean;
}, nowISO: string): Promise<ClosureResult> {
  if (!isStaff(input.actorRoles)) return { kind: "FORBIDDEN", reason: "휴무 등록은 원장·데스크만" };
  if (input.dateEnd < input.dateStart) return { kind: "INVALID", reason: "종료일이 시작일보다 빠름" };
  if (input.scope === "CLASS" && !input.classId) return { kind: "INVALID", reason: "반 휴강은 classId 필수" };
  return db.transaction(async (tx) => {
    if (input.scope === "CLASS") {
      const cls = (await tx.select({ id: s.dbClasses.id }).from(s.dbClasses).where(and(
        eq(s.dbClasses.id, input.classId!), eq(s.dbClasses.academyId, input.academyId),
      )))[0];
      if (!cls) return { kind: "INVALID" as const, reason: "반 없음(학원 불일치 포함)" };
    }
    const closureId = newId("ce");
    await tx.insert(s.closureEvents).values({
      id: closureId, academyId: input.academyId,
      scope: input.scope, classId: input.scope === "CLASS" ? input.classId : null,
      dateStart: input.dateStart, dateEnd: input.dateEnd,
      closureType: input.closureType, reason: input.reason,
      deductSessions: input.deductSessions,
      createdByUserId: input.actorUserId, createdAt: nowISO,
    });
    /* 범위 내 SCHEDULED 세션 취소 — COMPLETED 는 불변(과거 실적 보호),
       deductSessions=false(보강 전제)도 세션은 취소하되 이벤트가 구분자.
       회차 집계·일할은 CANCELED 세션을 모수에서 제외한다. */
    const targets = await tx.select().from(s.classSessions).where(and(
      eq(s.classSessions.academyId, input.academyId),
      gte(s.classSessions.date, input.dateStart),
      lte(s.classSessions.date, input.dateEnd),
      eq(s.classSessions.status, "SCHEDULED"),
      ...(input.scope === "CLASS" ? [eq(s.classSessions.classId, input.classId!)] : []),
    )).for("update");
    if (targets.length) {
      await tx.update(s.classSessions).set({
        status: "CANCELED",
        canceledReason: `휴무: ${input.reason}`,
        closureId, updatedAt: nowISO,
      }).where(inArray(s.classSessions.id, targets.map((t) => t.id)));
    }
    await recordAudit(tx, {
      academyId: input.academyId, actorUserId: input.actorUserId, actorRole: "ACADEMY",
      action: "closure.created", targetType: "ClosureEvent", targetId: closureId,
      reason: input.reason,
      detail: {
        scope: input.scope, classId: input.classId ?? null,
        dateStart: input.dateStart, dateEnd: input.dateEnd,
        deductSessions: input.deductSessions, canceledSessions: targets.length,
      },
      success: true,
    }, nowISO);
    await recordOutbox(tx, {
      academyId: input.academyId, eventType: "CLOSURE_CREATED",
      payload: { closureId, canceledSessions: targets.length, dateStart: input.dateStart, dateEnd: input.dateEnd },
    }, nowISO);
    return { kind: "OK" as const, closureId, canceledSessions: targets.length };
  });
}

export async function revokeClosure(db: Db, input: {
  actorUserId: string; actorRoles: readonly string[]; academyId: string; closureId: string;
}, nowISO: string): Promise<ClosureResult> {
  if (!isStaff(input.actorRoles)) return { kind: "FORBIDDEN", reason: "휴무 철회는 원장·데스크만" };
  return db.transaction(async (tx) => {
    const ce = (await tx.select().from(s.closureEvents).where(and(
      eq(s.closureEvents.id, input.closureId), eq(s.closureEvents.academyId, input.academyId),
    )).for("update"))[0];
    if (!ce) return { kind: "INVALID" as const, reason: "휴무 이벤트 없음" };
    if (ce.revokedAt) return { kind: "OK" as const, closureId: ce.id, canceledSessions: 0 }; // 멱등
    /* 이 이벤트가 취소한 세션 — 단, 다른 유효(미철회) 휴무가 아직 그 날짜·범위를 덮으면
       복원하지 않고 그 휴무로 소유권을 넘긴다(겹친 휴무 복원 갭 수정). 어느 휴무도
       덮지 않을 때만 SCHEDULED 로 복원. 다른 사유의 취소(closureId 불일치)는 불변. */
    const mine = await tx.select().from(s.classSessions).where(and(
      eq(s.classSessions.academyId, input.academyId),
      eq(s.classSessions.closureId, ce.id),
      eq(s.classSessions.status, "CANCELED"),
    )).for("update");
    const others = (await tx.select().from(s.closureEvents).where(and(
      eq(s.closureEvents.academyId, input.academyId),
      isNull(s.closureEvents.revokedAt),
    ))).filter((o) => o.id !== ce.id);
    const stillCovering = (sess: { date: string; classId: string }) =>
      others.find((o) =>
        o.dateStart <= sess.date && sess.date <= o.dateEnd &&
        (o.scope === "ACADEMY" || o.classId === sess.classId));
    const toRestore: string[] = [];
    let reassigned = 0;
    for (const sess of mine) {
      const other = stillCovering(sess);
      if (other) {
        await tx.update(s.classSessions).set({
          closureId: other.id, canceledReason: `휴무: ${other.reason}`, updatedAt: nowISO,
        }).where(eq(s.classSessions.id, sess.id)); // CANCELED 유지 — 아직 휴무일
        reassigned += 1;
      } else {
        toRestore.push(sess.id);
      }
    }
    if (toRestore.length) {
      await tx.update(s.classSessions).set({
        status: "SCHEDULED", canceledReason: null, closureId: null, updatedAt: nowISO,
      }).where(inArray(s.classSessions.id, toRestore));
    }
    await tx.update(s.closureEvents).set({ revokedAt: nowISO }).where(eq(s.closureEvents.id, ce.id));
    await recordAudit(tx, {
      academyId: input.academyId, actorUserId: input.actorUserId, actorRole: "ACADEMY",
      action: "closure.revoked", targetType: "ClosureEvent", targetId: ce.id,
      detail: { restoredSessions: toRestore.length, reassignedSessions: reassigned }, success: true,
    }, nowISO);
    return { kind: "OK" as const, closureId: ce.id, canceledSessions: toRestore.length };
  });
}

export async function listClosures(db: Db, academyId: string) {
  return db.select().from(s.closureEvents)
    .where(eq(s.closureEvents.academyId, academyId))
    .orderBy(desc(s.closureEvents.dateStart))
    .limit(100);
}

/** 회차 집계 — DB 세션 행이 정본(견적용 countSessions 와 구분).
   total = 기간 내 CANCELED 제외 전 세션, remaining = 오늘(asOf) 이후 SCHEDULED. */
export async function getSessionStats(db: Db, input: {
  academyId: string; classId: string; from: string; to: string; asOf: string;
}) {
  const rows = await db.select().from(s.classSessions).where(and(
    eq(s.classSessions.academyId, input.academyId),
    eq(s.classSessions.classId, input.classId),
    gte(s.classSessions.date, input.from),
    lte(s.classSessions.date, input.to),
  )).orderBy(asc(s.classSessions.date));
  const active = rows.filter((r) => r.status !== "CANCELED");
  return {
    total: active.length,
    completed: rows.filter((r) => r.status === "COMPLETED").length,
    canceled: rows.filter((r) => r.status === "CANCELED").length,
    remaining: active.filter((r) => r.date >= input.asOf && r.status === "SCHEDULED").length,
  };
}

export type QuoteResult =
  | { kind: "OK"; totalSessions: number; remainingSessions: number; amount: number; basis: "DB_SESSIONS" | "SLOT_CALENDAR" }
  | { kind: "INVALID"; reason: string };

/** 중간입회 일할 견적 — 헌법: 일할 = 남은회차/전체회차 × 요금.
   세션이 전개돼 있으면 DB 세션 정본으로, 없으면 반 시간표(요일)+휴무 달력으로 계산. */
export async function prorationQuote(db: Db, input: {
  academyId: string; classId: string;
  periodStart: string; periodEnd: string; joinDate: string; baseFee: number;
}): Promise<QuoteResult> {
  if (input.baseFee <= 0 || input.baseFee > 100_000_000) return { kind: "INVALID", reason: "요금 범위 밖" };
  if (input.periodEnd < input.periodStart) return { kind: "INVALID", reason: "기간 역전" };
  const cls = (await db.select().from(s.dbClasses).where(and(
    eq(s.dbClasses.id, input.classId), eq(s.dbClasses.academyId, input.academyId),
  )))[0];
  if (!cls) return { kind: "INVALID", reason: "반 없음(학원 불일치 포함)" };

  const sessions = await db.select().from(s.classSessions).where(and(
    eq(s.classSessions.academyId, input.academyId),
    eq(s.classSessions.classId, input.classId),
    gte(s.classSessions.date, input.periodStart),
    lte(s.classSessions.date, input.periodEnd),
  ));
  if (sessions.length > 0) {
    const active = sessions.filter((r) => r.status !== "CANCELED");
    const total = active.length;
    const remaining = active.filter((r) => r.date >= input.joinDate).length;
    if (total === 0) return { kind: "INVALID", reason: "기간 내 유효 회차 0 — 휴무 확인" };
    return {
      kind: "OK", totalSessions: total, remainingSessions: remaining,
      amount: prorate(input.baseFee, remaining, total), basis: "DB_SESSIONS",
    };
  }
  /* 세션 미전개 — 시간표(요일) + 유효 휴무 달력으로 견적(payment-engine 정합 경로) */
  const slots = await db.select().from(s.classScheduleSlots)
    .where(eq(s.classScheduleSlots.classId, input.classId));
  const weekdays = [...new Set(slots.map((sl) => sl.weekday))];
  if (weekdays.length === 0) return { kind: "INVALID", reason: "시간표 없음 — 요일 등록 후 견적 가능" };
  const closures = await db.select().from(s.closureEvents).where(and(
    eq(s.closureEvents.academyId, input.academyId),
    isNull(s.closureEvents.revokedAt),
    eq(s.closureEvents.deductSessions, true),
    lte(s.closureEvents.dateStart, input.periodEnd),
    gte(s.closureEvents.dateEnd, input.periodStart),
  ));
  const holidays: string[] = [];
  for (const ce of closures) {
    if (ce.scope === "CLASS" && ce.classId !== input.classId) continue;
    for (let t = Date.parse(ce.dateStart); t <= Date.parse(ce.dateEnd); t += 86400000) {
      holidays.push(new Date(t).toISOString().slice(0, 10));
    }
  }
  const { total, remaining } = enrollmentSessions(
    { startDate: input.periodStart, endDate: input.periodEnd }, weekdays, input.joinDate, holidays,
  );
  if (total === 0) return { kind: "INVALID", reason: "기간 내 유효 회차 0 — 시간표·휴무 확인" };
  return {
    kind: "OK", totalSessions: total, remainingSessions: remaining,
    amount: prorate(input.baseFee, remaining, total), basis: "SLOT_CALENDAR",
  };
}
