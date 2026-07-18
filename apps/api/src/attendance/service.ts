/* 출결 — 기본선 2단계(#23, docs/15)
   원칙(도메인 재현): 예정(보호자 통보) ≠ 실제(코치 확정) — 절대 합치지 않는다.
   권한: 기록 = 담당 코치(ACTIVE assignment) 또는 staff / 통보 = VERIFIED 보호자.
   수정 = 같은 행 갱신 + version + 감사(이전 값 포함 — 출결 변경 이력). */
import { and, eq, inArray, sql } from "drizzle-orm";
import { schema as s } from "@pacefolio/db";
import type { AttendanceRecordStatus, AttendanceNoticeType } from "@pacefolio/domain";
import { newId } from "../crypto";
import { recordAudit, recordOutbox } from "../audit";
import type { Db } from "../sessions/service";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
const isStaff = (roles: readonly string[]) => roles.includes("OWNER") || roles.includes("DESK");

async function canManageSession(
  tx: Tx, input: { actorUserId: string; actorRoles: readonly string[]; academyId: string },
  classId: string,
): Promise<boolean> {
  if (isStaff(input.actorRoles)) return true;
  if (!input.actorRoles.includes("COACH")) return false;
  const assign = (await tx.select().from(s.classAssignments).where(and(
    eq(s.classAssignments.classId, classId),
    eq(s.classAssignments.academyId, input.academyId),
    eq(s.classAssignments.coachUserId, input.actorUserId),
    eq(s.classAssignments.status, "ACTIVE"),
  )))[0];
  return !!assign;
}

export type AttendanceResult =
  | { kind: "OK"; recorded: number; updated: number }
  | { kind: "FORBIDDEN"; reason: string }
  | { kind: "INVALID"; reason: string };

export async function recordAttendance(db: Db, input: {
  actorUserId: string; actorRoles: readonly string[]; academyId: string;
  sessionId: string;
  records: { participantId: string; status: AttendanceRecordStatus; reason?: string }[];
}, nowISO: string): Promise<AttendanceResult> {
  return db.transaction(async (tx) => {
    const sess = (await tx.select().from(s.classSessions).where(and(
      eq(s.classSessions.id, input.sessionId), eq(s.classSessions.academyId, input.academyId),
    )).for("update"))[0];
    if (!sess) return { kind: "INVALID" as const, reason: "세션 없음(학원 불일치 포함)" };
    if (sess.status === "CANCELED") return { kind: "INVALID" as const, reason: "휴강 세션에는 출결 기록 불가" };
    if (!(await canManageSession(tx, input, sess.classId))) {
      return { kind: "FORBIDDEN" as const, reason: "담당 코치(ACTIVE 배정) 또는 학원만 기록 가능" };
    }
    // 대상 검증: 반의 ACTIVE 배정 원생(원생별 세션은 그 원생만)
    const enrolled = await tx.select().from(s.dbEnrollments).where(and(
      eq(s.dbEnrollments.classId, sess.classId), eq(s.dbEnrollments.status, "ACTIVE"),
    ));
    const allowed = new Set(
      sess.participantId ? [sess.participantId] : enrolled.map((e) => e.participantId),
    );
    for (const r of input.records) {
      if (!allowed.has(r.participantId)) {
        return { kind: "INVALID" as const, reason: `이 세션 대상 원생이 아님: ${r.participantId}` };
      }
    }
    let recorded = 0, updated = 0;
    for (const r of input.records) {
      const existing = (await tx.select().from(s.attendanceRecords).where(and(
        eq(s.attendanceRecords.sessionId, sess.id),
        eq(s.attendanceRecords.participantId, r.participantId),
      )))[0];
      if (existing) {
        if (existing.status === r.status && (existing.reason ?? null) === (r.reason ?? null)) continue;
        await tx.update(s.attendanceRecords).set({
          status: r.status, reason: r.reason ?? null,
          recordedByUserId: input.actorUserId, updatedAt: nowISO,
          version: sql`${s.attendanceRecords.version} + 1`,
        }).where(eq(s.attendanceRecords.id, existing.id));
        await recordAudit(tx, { // 출결 변경 이력 — 이전 값 보존
          academyId: input.academyId, actorUserId: input.actorUserId, actorRole: "COACH",
          action: "attendance.updated", targetType: "AttendanceRecord", targetId: existing.id,
          detail: { participantId: r.participantId, from: existing.status, to: r.status },
          success: true,
        }, nowISO);
        updated++;
      } else {
        const id = newId("ar");
        await tx.insert(s.attendanceRecords).values({
          id, academyId: input.academyId, sessionId: sess.id,
          participantId: r.participantId, status: r.status, reason: r.reason ?? null,
          recordedByUserId: input.actorUserId, createdAt: nowISO, updatedAt: nowISO,
        });
        recorded++;
      }
    }
    if (recorded > 0) {
      await recordAudit(tx, {
        academyId: input.academyId, actorUserId: input.actorUserId,
        actorRole: isStaff(input.actorRoles) ? "ACADEMY" : "COACH",
        action: "attendance.recorded", targetType: "ClassSession", targetId: sess.id,
        detail: { recorded, updated }, success: true,
      }, nowISO);
    }
    return { kind: "OK" as const, recorded, updated };
  });
}

export type CompleteResult =
  | { kind: "COMPLETED"; sessionId: string }
  | { kind: "FORBIDDEN"; reason: string }
  | { kind: "INVALID"; reason: string }
  | { kind: "CONFLICT"; reason: string; missing: number };

/** 수업 완료 — 대상 전원 출결 지정 없이는 완료 불가(코치 앱 C2 검증의 서버판) */
export async function completeSession(db: Db, input: {
  actorUserId: string; actorRoles: readonly string[]; academyId: string; sessionId: string;
}, nowISO: string): Promise<CompleteResult> {
  return db.transaction(async (tx) => {
    const sess = (await tx.select().from(s.classSessions).where(and(
      eq(s.classSessions.id, input.sessionId), eq(s.classSessions.academyId, input.academyId),
    )).for("update"))[0];
    if (!sess) return { kind: "INVALID" as const, reason: "세션 없음" };
    if (sess.status === "COMPLETED") return { kind: "COMPLETED" as const, sessionId: sess.id }; // 멱등
    if (sess.status === "CANCELED") return { kind: "INVALID" as const, reason: "휴강 세션은 완료 불가" };
    if (!(await canManageSession(tx, input, sess.classId))) {
      return { kind: "FORBIDDEN" as const, reason: "담당 코치 또는 학원만" };
    }
    const enrolled = await tx.select().from(s.dbEnrollments).where(and(
      eq(s.dbEnrollments.classId, sess.classId), eq(s.dbEnrollments.status, "ACTIVE"),
    ));
    const targets = sess.participantId ? [sess.participantId] : enrolled.map((e) => e.participantId);
    const recs = targets.length
      ? await tx.select().from(s.attendanceRecords).where(and(
          eq(s.attendanceRecords.sessionId, sess.id),
          inArray(s.attendanceRecords.participantId, targets),
        ))
      : [];
    const missing = targets.filter((t) => !recs.some((r) => r.participantId === t)).length;
    if (missing > 0) {
      return { kind: "CONFLICT" as const, reason: `미체크 원생 ${missing}명 — 전원 지정 후 완료`, missing };
    }
    await tx.update(s.classSessions).set({ status: "COMPLETED", updatedAt: nowISO })
      .where(eq(s.classSessions.id, sess.id));
    await recordAudit(tx, {
      academyId: input.academyId, actorUserId: input.actorUserId,
      actorRole: isStaff(input.actorRoles) ? "ACADEMY" : "COACH",
      action: "session.completed", targetType: "ClassSession", targetId: sess.id,
      detail: { targets: targets.length }, success: true,
    }, nowISO);
    await recordOutbox(tx, {
      academyId: input.academyId, eventType: "ACTUAL_ATTENDANCE_RECORDED",
      payload: { sessionId: sess.id, classId: sess.classId, date: sess.date },
    }, nowISO);
    return { kind: "COMPLETED" as const, sessionId: sess.id };
  });
}

export async function listSessionAttendance(db: Db, input: {
  actorUserId: string; actorRoles: readonly string[]; academyId: string; sessionId: string;
}) {
  return db.transaction(async (tx) => {
    const sess = (await tx.select().from(s.classSessions).where(and(
      eq(s.classSessions.id, input.sessionId), eq(s.classSessions.academyId, input.academyId),
    )))[0];
    if (!sess) return null;
    if (!(await canManageSession(tx, input, sess.classId))) return null;
    const rows = await tx.select().from(s.attendanceRecords)
      .where(eq(s.attendanceRecords.sessionId, sess.id));
    return rows.map((r) => ({
      participantId: r.participantId, status: r.status, reason: r.reason ?? undefined,
      recordedByUserId: r.recordedByUserId, updatedAt: r.updatedAt, version: r.version,
    }));
  });
}

export type NoticeResult =
  | { kind: "CREATED"; noticeId: string }
  | { kind: "FORBIDDEN"; reason: string };

/** 보호자 예정 통보 — "전화를 없앤다"의 서버판. VERIFIED 링크 보호자만. */
export async function createAttendanceNotice(db: Db, input: {
  actorUserId: string; academyId: string; participantId: string;
  date: string; noticeType: AttendanceNoticeType; reason: string;
}, nowISO: string): Promise<NoticeResult> {
  return db.transaction(async (tx) => {
    const gd = (await tx.select().from(s.guardians).where(eq(s.guardians.userId, input.actorUserId)))[0];
    const link = gd && (await tx.select().from(s.guardianParticipantLinks).where(and(
      eq(s.guardianParticipantLinks.guardianId, gd.id),
      eq(s.guardianParticipantLinks.participantId, input.participantId),
      eq(s.guardianParticipantLinks.academyId, input.academyId),
      eq(s.guardianParticipantLinks.verificationStatus, "VERIFIED"),
    )))[0];
    if (!link) return { kind: "FORBIDDEN" as const, reason: "이 원생과 검증된 보호자 연결이 없어요" };
    const noticeId = newId("an");
    await tx.insert(s.dbAttendanceNotices).values({
      id: noticeId, academyId: input.academyId, participantId: input.participantId,
      date: input.date, type: input.noticeType, reason: input.reason,
      createdByUserId: input.actorUserId, createdAt: nowISO,
    });
    await recordAudit(tx, {
      academyId: input.academyId, actorUserId: input.actorUserId, actorRole: "GUARDIAN",
      action: "attendance_notice.created", targetType: "AttendanceNotice", targetId: noticeId,
      detail: { participantId: input.participantId, date: input.date, type: input.noticeType },
      success: true,
    }, nowISO);
    await recordOutbox(tx, { // 코치·원장 알림 트랙 소비
      academyId: input.academyId, eventType: "ATTENDANCE_NOTICE_CREATED",
      payload: { noticeId, participantId: input.participantId, date: input.date, type: input.noticeType },
    }, nowISO);
    return { kind: "CREATED" as const, noticeId };
  });
}
