/* 학생 수명주기 + 반 배정 — 기본선 2단계(#23, docs/15)
   등록(선등록 보호자 연락처 포함) · 상태 전이(체험/재원/휴원/퇴원 상태머신) ·
   반 배정(정원 FOR UPDATE 검증) · 배정 종료. 전부 staff(OWNER·DESK) 전용. */
import { and, eq, sql } from "drizzle-orm";
import { schema as s } from "@pacefolio/db";
import { canTransitionParticipantStatus, type ParticipantStatus } from "@pacefolio/domain";
import { newId } from "../crypto";
import { hashPhone, encryptPii } from "../crypto-pii";
import { recordAudit, recordOutbox } from "../audit";
import type { Db } from "../sessions/service";

const isStaff = (roles: readonly string[]) => roles.includes("OWNER") || roles.includes("DESK");

export type StudentResult =
  | { kind: "OK"; participantId: string }
  | { kind: "FORBIDDEN"; reason: string }
  | { kind: "INVALID"; reason: string }
  | { kind: "CONFLICT"; reason: string };

export async function createParticipant(db: Db, input: {
  actorUserId: string; actorRoles: readonly string[]; academyId: string;
  name: string; birth: string; ageLabel: string;
  status?: Extract<ParticipantStatus, "TRIAL" | "ENROLLED">;
  guardianPhone?: string; // 선등록 보호자 연락처 — OTP 연결 결합 근거
}, nowISO: string): Promise<StudentResult> {
  if (!isStaff(input.actorRoles)) return { kind: "FORBIDDEN", reason: "학생 등록은 원장·데스크만" };
  return db.transaction(async (tx) => {
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
