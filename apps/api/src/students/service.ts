/* 학생 수명주기 + 반 배정 — 기본선 2단계(#23, docs/15)
   등록(선등록 보호자 연락처 포함) · 상태 전이(체험/재원/휴원/퇴원 상태머신) ·
   반 배정(정원 FOR UPDATE 검증) · 배정 종료. 전부 staff(OWNER·DESK) 전용. */
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { schema as s } from "@pacefolio/db";
import {
  canTransitionParticipantStatus, FREE_PARTICIPANT_LIMIT, type ParticipantStatus,
} from "@pacefolio/domain";
import { newId } from "../crypto";
import { hashPhone, encryptPii } from "../crypto-pii";
import { recordAudit, recordOutbox } from "../audit";
import { checkFeature } from "../billing/plan";
import type { Db } from "../sessions/service";

const isStaff = (roles: readonly string[]) => roles.includes("OWNER") || roles.includes("DESK");

export type StudentResult =
  | { kind: "OK"; participantId: string }
  | { kind: "FORBIDDEN"; reason: string }
  | { kind: "INVALID"; reason: string }
  | { kind: "CONFLICT"; reason: string };
/* 등록 전용 — FREE 원생 상한(#49)은 신규 등록에서만 발생 */
export type CreateStudentResult =
  | StudentResult
  | { kind: "UPGRADE"; reason: string; currentPlan: string; requiredPlan: string };

export async function createParticipant(db: Db, input: {
  actorUserId: string; actorRoles: readonly string[]; academyId: string;
  name: string; birth: string; ageLabel: string;
  status?: Extract<ParticipantStatus, "TRIAL" | "ENROLLED">;
  guardianPhone?: string; // 선등록 보호자 연락처 — OTP 연결 결합 근거
}, nowISO: string): Promise<CreateStudentResult> {
  if (!isStaff(input.actorRoles)) return { kind: "FORBIDDEN", reason: "학생 등록은 원장·데스크만" };
  return db.transaction(async (tx) => {
    /* #49: FREE 원생 상한(퇴원 제외 재적) — 같은 tx 안에서 세어 동시 등록 초과 방지.
       상한 도달 = 402 안내(업그레이드). #50: UNLIMITED_PARTICIPANTS grant 예외 인정. */
    const denied = await checkFeature(tx, input.academyId, "UNLIMITED_PARTICIPANTS", nowISO);
    if (denied) {
      const cnt = (await tx.select({ n: sql<number>`count(*)::int` }).from(s.participants).where(and(
        eq(s.participants.academyId, input.academyId),
        ne(s.participants.status, "WITHDRAWN"),
      )))[0];
      if ((cnt?.n ?? 0) >= FREE_PARTICIPANT_LIMIT) {
        return {
          kind: "UPGRADE" as const,
          reason: `무료 플랜 원생 상한(${FREE_PARTICIPANT_LIMIT}명) — BASIC 부터 무제한`,
          currentPlan: denied.currentPlan, requiredPlan: denied.requiredPlan,
        };
      }
    }
    const participantId = newId("p");
    await tx.insert(s.participants).values({
      id: participantId, academyId: input.academyId,
      name: input.name, birth: input.birth, ageLabel: input.ageLabel,
      status: input.status ?? "ENROLLED", statusChangedAt: nowISO,
      createdAt: nowISO, updatedAt: nowISO,
    });
    if (input.guardianPhone) {
      const digits = input.guardianPhone.replace(/[^0-9]/g, "");
      await tx.insert(s.registeredGuardianContacts).values({
        id: newId("rgc"), academyId: input.academyId, participantId,
        phoneHash: hashPhone(digits), phoneEnc: encryptPii(digits), // #26 원문 미저장
      });
    }
    await recordAudit(tx, {
      academyId: input.academyId, actorUserId: input.actorUserId, actorRole: "ACADEMY",
      action: "participant.created", targetType: "Participant", targetId: participantId,
      detail: { status: input.status ?? "ENROLLED", hasGuardianContact: !!input.guardianPhone },
      success: true,
    }, nowISO);
    return { kind: "OK" as const, participantId };
  });
}

/** 원생 목록(#40) — staff 전용. AudienceFilter 2단계·청구 초안·명단 화면의 기반.
   연락처 등 PII 미포함 — 이름·상태·연령 라벨만.
   #51: 반 이름(ACTIVE 배정)·미납 여부(open 청구 존재) 동봉 — owner 모바일 원생 목록 정본. */
export async function listParticipants(db: Db, input: {
  actorRoles: readonly string[]; academyId: string; status?: ParticipantStatus;
}) {
  if (!isStaff(input.actorRoles)) return null;
  const rows = await db.select({
    participantId: s.participants.id,
    name: s.participants.name,
    ageLabel: s.participants.ageLabel,
    status: s.participants.status,
  }).from(s.participants)
    .where(eq(s.participants.academyId, input.academyId))
    .orderBy(s.participants.name);
  const ids = rows.map((r) => r.participantId);
  const enrolls = ids.length
    ? await db.select({
        participantId: s.dbEnrollments.participantId,
        className: s.dbClasses.name,
      }).from(s.dbEnrollments)
        .innerJoin(s.dbClasses, eq(s.dbClasses.id, s.dbEnrollments.classId))
        .where(and(
          eq(s.dbEnrollments.academyId, input.academyId),
          inArray(s.dbEnrollments.participantId, ids),
          eq(s.dbEnrollments.status, "ACTIVE"),
        ))
    : [];
  const openInv = ids.length
    ? await db.select({ participantId: s.invoices.participantId }).from(s.invoices)
        .where(and(
          eq(s.invoices.academyId, input.academyId),
          inArray(s.invoices.participantId, ids),
          inArray(s.invoices.status, ["ISSUED", "PARTIALLY_PAID", "OVERDUE"]),
        ))
    : [];
  const unpaidSet = new Set(openInv.map((i) => i.participantId));
  const enriched = rows.map((r) => ({
    ...r,
    classNames: enrolls.filter((e) => e.participantId === r.participantId).map((e) => e.className),
    unpaid: unpaidSet.has(r.participantId),
  }));
  return input.status ? enriched.filter((r) => r.status === input.status) : enriched;
}

/** 원생 상세(#52) — staff 전용. owner 모바일·PC 원생 상세의 서버 정본.
   동봉: 반·담당 코치 이름 / 보호자 연결(관계·검증·결제권한 — 이름·연락처 미포함) /
   청구서(금액 포함 — 원장 수납 화면, DRAFT 포함). 없음·타학원 = null(404 은닉). */
export async function getParticipantDetail(db: Db, input: {
  actorRoles: readonly string[]; academyId: string; participantId: string;
}) {
  if (!isStaff(input.actorRoles)) return null;
  const p = (await db.select().from(s.participants).where(and(
    eq(s.participants.id, input.participantId),
    eq(s.participants.academyId, input.academyId),
  )))[0];
  if (!p) return null;
  const enrolls = await db.select({
    classId: s.dbClasses.id,
    className: s.dbClasses.name,
  }).from(s.dbEnrollments)
    .innerJoin(s.dbClasses, eq(s.dbClasses.id, s.dbEnrollments.classId))
    .where(and(
      eq(s.dbEnrollments.academyId, input.academyId),
      eq(s.dbEnrollments.participantId, p.id),
      eq(s.dbEnrollments.status, "ACTIVE"),
    ));
  const classIds = enrolls.map((e) => e.classId);
  const coaches = classIds.length
    ? await db.select({
        classId: s.classAssignments.classId,
        coachName: s.users.name,
      }).from(s.classAssignments)
        .innerJoin(s.users, eq(s.users.id, s.classAssignments.coachUserId))
        .where(and(
          eq(s.classAssignments.academyId, input.academyId),
          inArray(s.classAssignments.classId, classIds),
          eq(s.classAssignments.status, "ACTIVE"),
        ))
    : [];
  const links = await db.select({
    relationshipType: s.guardianParticipantLinks.relationshipType,
    isPrimaryGuardian: s.guardianParticipantLinks.isPrimaryGuardian,
    verificationStatus: s.guardianParticipantLinks.verificationStatus,
    canPay: s.guardianParticipantLinks.canPay,
  }).from(s.guardianParticipantLinks).where(and(
    eq(s.guardianParticipantLinks.participantId, p.id),
    eq(s.guardianParticipantLinks.academyId, input.academyId),
  ));
  /* #53: 출석 집계 — 실제 출결 기록(코치 확정) 기준. 예정 통보와 절대 합치지 않는다.
     출석률 = (PRESENT+LATE+EARLY_LEAVE)/전체 기록 — "왔는데 늦은 아이"는 출석으로 센다 */
  const [att] = await db.select({
    total: sql<number>`count(*)::int`,
    present: sql<number>`count(*) filter (where ${s.attendanceRecords.status} = 'PRESENT')::int`,
    absent: sql<number>`count(*) filter (where ${s.attendanceRecords.status} = 'ABSENT')::int`,
    late: sql<number>`count(*) filter (where ${s.attendanceRecords.status} = 'LATE')::int`,
    earlyLeave: sql<number>`count(*) filter (where ${s.attendanceRecords.status} = 'EARLY_LEAVE')::int`,
    excused: sql<number>`count(*) filter (where ${s.attendanceRecords.status} = 'EXCUSED')::int`,
  }).from(s.attendanceRecords).where(and(
    eq(s.attendanceRecords.academyId, input.academyId),
    eq(s.attendanceRecords.participantId, p.id),
  ));
  const attended = att.present + att.late + att.earlyLeave;
  const invs = await db.select().from(s.invoices).where(and(
    eq(s.invoices.participantId, p.id),
    eq(s.invoices.academyId, input.academyId),
  ));
  const lines = invs.length
    ? await db.select().from(s.invoiceLines)
        .where(inArray(s.invoiceLines.invoiceId, invs.map((i) => i.id)))
    : [];
  return {
    participant: {
      participantId: p.id, name: p.name, birth: p.birth,
      ageLabel: p.ageLabel, status: p.status,
    },
    enrollments: enrolls.map((e) => ({
      classId: e.classId, className: e.className,
      coachNames: coaches.filter((c) => c.classId === e.classId).map((c) => c.coachName),
    })),
    guardians: links,
    attendance: {
      ...att,
      ratePct: att.total > 0 ? Math.round((attended / att.total) * 100) : null,
    },
    invoices: invs.map((inv) => ({
      invoiceId: inv.id, status: inv.status, total: inv.total, dueDate: inv.dueDate,
      lines: lines.filter((l) => l.invoiceId === inv.id)
        .map((l) => ({ type: l.type, label: l.label, amount: l.amount })),
    })),
  };
}

export async function changeParticipantStatus(db: Db, input: {
  actorUserId: string; actorRoles: readonly string[]; academyId: string;
  participantId: string; status: ParticipantStatus; reason?: string;
}, nowISO: string): Promise<StudentResult> {
  if (!isStaff(input.actorRoles)) return { kind: "FORBIDDEN", reason: "상태 변경은 원장·데스크만" };
  return db.transaction(async (tx) => {
    const p = (await tx.select().from(s.participants).where(and(
      eq(s.participants.id, input.participantId), eq(s.participants.academyId, input.academyId),
    )).for("update"))[0];
    if (!p) return { kind: "INVALID" as const, reason: "원생 없음(학원 불일치 포함)" };
    const from = p.status as ParticipantStatus;
    if (from === input.status) return { kind: "OK" as const, participantId: p.id }; // 멱등
    if (!canTransitionParticipantStatus(from, input.status)) {
      return { kind: "CONFLICT" as const, reason: `상태 전이 불가: ${from} → ${input.status}` };
    }
    await tx.update(s.participants).set({
      status: input.status, statusChangedAt: nowISO, updatedAt: nowISO,
      version: sql`${s.participants.version} + 1`,
    }).where(eq(s.participants.id, p.id));
    // 휴원·퇴원 = 진행 중 반 배정 종료(재개 시 재배정 — 이력 보존)
    if (input.status === "ON_BREAK" || input.status === "WITHDRAWN") {
      await tx.update(s.dbEnrollments).set({ status: "ENDED", endDate: nowISO.slice(0, 10) })
        .where(and(
          eq(s.dbEnrollments.participantId, p.id),
          eq(s.dbEnrollments.status, "ACTIVE"),
        ));
    }
    await recordAudit(tx, {
      academyId: input.academyId, actorUserId: input.actorUserId, actorRole: "ACADEMY",
      action: "participant.status_changed", targetType: "Participant", targetId: p.id,
      reason: input.reason, detail: { from, to: input.status }, success: true,
    }, nowISO);
    await recordOutbox(tx, {
      academyId: input.academyId, eventType: "PARTICIPANT_STATUS_CHANGED",
      payload: { participantId: p.id, from, to: input.status },
    }, nowISO);
    return { kind: "OK" as const, participantId: p.id };
  });
}

export type EnrollResult =
  | { kind: "OK"; enrollmentId: string }
  | { kind: "FORBIDDEN"; reason: string }
  | { kind: "INVALID"; reason: string }
  | { kind: "CONFLICT"; reason: string };

export async function enrollParticipant(db: Db, input: {
  actorUserId: string; actorRoles: readonly string[]; academyId: string;
  participantId: string; classId: string;
}, nowISO: string): Promise<EnrollResult> {
  if (!isStaff(input.actorRoles)) return { kind: "FORBIDDEN", reason: "반 배정은 원장·데스크만" };
  return db.transaction(async (tx) => {
    /* 정원 경쟁 직렬화 — class FOR UPDATE 후 ACTIVE 수 계산(동시 배정 초과 방지) */
    const cls = (await tx.select().from(s.dbClasses).where(and(
      eq(s.dbClasses.id, input.classId), eq(s.dbClasses.academyId, input.academyId),
    )).for("update"))[0];
    if (!cls) return { kind: "INVALID" as const, reason: "반 없음(학원 불일치 포함)" };
    const p = (await tx.select().from(s.participants).where(and(
      eq(s.participants.id, input.participantId), eq(s.participants.academyId, input.academyId),
    )))[0];
    if (!p) return { kind: "INVALID" as const, reason: "원생 없음" };
    if (p.status === "WITHDRAWN" || p.status === "ON_BREAK") {
      return { kind: "CONFLICT" as const, reason: `재원 상태가 아님(${p.status}) — 재원 전환 후 배정` };
    }
    const active = await tx.select({ n: sql<number>`count(*)::int` }).from(s.dbEnrollments).where(and(
      eq(s.dbEnrollments.classId, cls.id), eq(s.dbEnrollments.status, "ACTIVE"),
    ));
    if ((active[0]?.n ?? 0) >= cls.capacity) {
      return { kind: "CONFLICT" as const, reason: `정원 초과(${cls.capacity}명) — 대기 등록은 후속 트랙` };
    }
    const dup = (await tx.select().from(s.dbEnrollments).where(and(
      eq(s.dbEnrollments.classId, cls.id),
      eq(s.dbEnrollments.participantId, p.id),
      eq(s.dbEnrollments.status, "ACTIVE"),
    )))[0];
    if (dup) return { kind: "CONFLICT" as const, reason: "이미 이 반에 배정됨" };
    const enrollmentId = newId("en");
    await tx.insert(s.dbEnrollments).values({
      id: enrollmentId, academyId: input.academyId, classId: cls.id,
      participantId: p.id, status: "ACTIVE", startDate: nowISO.slice(0, 10), createdAt: nowISO,
    });
    await recordAudit(tx, {
      academyId: input.academyId, actorUserId: input.actorUserId, actorRole: "ACADEMY",
      action: "enrollment.created", targetType: "Enrollment", targetId: enrollmentId,
      detail: { classId: cls.id, participantId: p.id }, success: true,
    }, nowISO);
    return { kind: "OK" as const, enrollmentId };
  });
}

export async function endEnrollment(db: Db, input: {
  actorUserId: string; actorRoles: readonly string[]; academyId: string; enrollmentId: string;
}, nowISO: string): Promise<EnrollResult> {
  if (!isStaff(input.actorRoles)) return { kind: "FORBIDDEN", reason: "배정 종료는 원장·데스크만" };
  return db.transaction(async (tx) => {
    const en = (await tx.select().from(s.dbEnrollments).where(and(
      eq(s.dbEnrollments.id, input.enrollmentId), eq(s.dbEnrollments.academyId, input.academyId),
    )).for("update"))[0];
    if (!en) return { kind: "INVALID" as const, reason: "배정 없음" };
    if (en.status === "ENDED") return { kind: "OK" as const, enrollmentId: en.id }; // 멱등
    await tx.update(s.dbEnrollments).set({ status: "ENDED", endDate: nowISO.slice(0, 10) })
      .where(eq(s.dbEnrollments.id, en.id));
    await recordAudit(tx, {
      academyId: input.academyId, actorUserId: input.actorUserId, actorRole: "ACADEMY",
      action: "enrollment.ended", targetType: "Enrollment", targetId: en.id,
      detail: { classId: en.classId, participantId: en.participantId }, success: true,
    }, nowISO);
    return { kind: "OK" as const, enrollmentId: en.id };
  });
}
