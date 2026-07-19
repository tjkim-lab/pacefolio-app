/* AudienceFilter 2단계 (docs/13 §C) — 대상 산정 공용 정본.
   원생 조회·공지 대상·청구 대상·대회 초대·CSV 가 이 리졸버 하나를 재사용한다 —
   화면·기능마다 대상 계산을 따로 만들지 않는다.
   의미론 = 웹 _audience.tsx 와 동일: 축 내 복수 선택 = OR, 축 간 = AND.
   staff(OWNER·DESK) 전용 · PII 미포함(이름·연령라벨·상태·반·미납 여부만).
   미납 정의 = open 청구(ISSUED·PARTIALLY_PAID·OVERDUE) 보유 — billing summary 와 동일. */
import { and, eq, inArray } from "drizzle-orm";
import { schema as s } from "@pacefolio/db";
import { recordAudit } from "../audit";
import type { Db } from "../sessions/service";

const isStaff = (roles: readonly string[]) => roles.includes("OWNER") || roles.includes("DESK");
const OPEN_INVOICE = ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] as const;

export interface AudienceFilterInput {
  classIds?: string[];      // 반 — ACTIVE 배정 기준
  coachUserIds?: string[];  // 담당 코치 — ACTIVE classAssignment 기준
  weekdays?: number[];      // 요일 0=일 … 6=토 — 배정 반의 시간표 slot 기준
  statuses?: string[];      // 재원 상태(TRIAL·ENROLLED·ON_BREAK·WITHDRAWN)
  unpaidOnly?: boolean;     // 미납 원생만
}

export interface AudienceMember {
  participantId: string;
  name: string;
  ageLabel: string;
  status: string;
  classNames: string[];
  unpaid: boolean;
}

export interface AudienceResult {
  members: AudienceMember[];
  guardianUserIds: string[]; // 매칭 원생의 VERIFIED 보호자(중복 제거) — 공지·알림 수신자 정본
}

export async function resolveAudience(db: Db, input: {
  actorRoles: readonly string[]; academyId: string; filter: AudienceFilterInput;
}): Promise<AudienceResult | null> {
  if (!isStaff(input.actorRoles)) return null;
  const f = input.filter;

  const parts = await db.select({
    id: s.participants.id, name: s.participants.name,
    ageLabel: s.participants.ageLabel, status: s.participants.status,
  }).from(s.participants)
    .where(eq(s.participants.academyId, input.academyId))
    .orderBy(s.participants.name);

  /* 배정·담당·시간표·미납 — 전부 테넌트 축으로만 조회 후 메모리 결합(v1: 학원당 수백 명 규모) */
  const enrollRows = await db.select({
    participantId: s.dbEnrollments.participantId,
    classId: s.dbEnrollments.classId,
    className: s.dbClasses.name,
  }).from(s.dbEnrollments)
    .innerJoin(s.dbClasses, and(
      eq(s.dbClasses.id, s.dbEnrollments.classId),
      eq(s.dbClasses.academyId, input.academyId),
    ))
    .where(and(
      eq(s.dbEnrollments.academyId, input.academyId),
      eq(s.dbEnrollments.status, "ACTIVE"),
    ));
  const enrolled = new Map<string, { classId: string; className: string }[]>();
  for (const r of enrollRows) {
    const list = enrolled.get(r.participantId) ?? [];
    list.push({ classId: r.classId, className: r.className });
    enrolled.set(r.participantId, list);
  }

  const assignRows = await db.select({
    classId: s.classAssignments.classId, coachUserId: s.classAssignments.coachUserId,
  }).from(s.classAssignments).where(and(
    eq(s.classAssignments.academyId, input.academyId),
    eq(s.classAssignments.status, "ACTIVE"),
  ));
  const classCoaches = new Map<string, Set<string>>();
  for (const r of assignRows) {
    const set = classCoaches.get(r.classId) ?? new Set<string>();
    set.add(r.coachUserId);
    classCoaches.set(r.classId, set);
  }

  const slotRows = await db.select({
    classId: s.classScheduleSlots.classId,
    weekday: s.classScheduleSlots.weekday,
    participantId: s.classScheduleSlots.participantId,
  }).from(s.classScheduleSlots).where(eq(s.classScheduleSlots.academyId, input.academyId));
  const classSlots = new Map<string, { weekday: number; participantId: string | null }[]>();
  for (const r of slotRows) {
    const list = classSlots.get(r.classId) ?? [];
    list.push({ weekday: r.weekday, participantId: r.participantId });
    classSlots.set(r.classId, list);
  }

  const unpaidRows = await db.select({ participantId: s.invoices.participantId })
    .from(s.invoices).where(and(
      eq(s.invoices.academyId, input.academyId),
      inArray(s.invoices.status, [...OPEN_INVOICE]),
    ));
  const unpaidSet = new Set(unpaidRows.map((r) => r.participantId));

  const members: AudienceMember[] = [];
  for (const p of parts) {
    const en = enrolled.get(p.id) ?? [];
    if (f.classIds?.length && !en.some((e) => f.classIds!.includes(e.classId))) continue;
    if (f.coachUserIds?.length && !en.some((e) =>
      [...(classCoaches.get(e.classId) ?? [])].some((cid) => f.coachUserIds!.includes(cid)))) continue;
    /* PARTICIPANT_SPECIFIC slot 은 그 원생에게만 해당 요일로 친다 */
    if (f.weekdays?.length && !en.some((e) =>
      (classSlots.get(e.classId) ?? []).some((sl) =>
        (sl.participantId == null || sl.participantId === p.id) && f.weekdays!.includes(sl.weekday)))) continue;
    if (f.statuses?.length && !f.statuses.includes(p.status)) continue;
    if (f.unpaidOnly && !unpaidSet.has(p.id)) continue;
    members.push({
      participantId: p.id, name: p.name, ageLabel: p.ageLabel, status: p.status,
      classNames: en.map((e) => e.className), unpaid: unpaidSet.has(p.id),
    });
  }

  const matchedIds = members.map((m) => m.participantId);
  const guardianRows = matchedIds.length
    ? await db.select({ userId: s.guardians.userId })
        .from(s.guardianParticipantLinks)
        .innerJoin(s.guardians, eq(s.guardians.id, s.guardianParticipantLinks.guardianId))
        .where(and(
          eq(s.guardianParticipantLinks.academyId, input.academyId),
          inArray(s.guardianParticipantLinks.participantId, matchedIds),
          eq(s.guardianParticipantLinks.verificationStatus, "VERIFIED"),
        ))
    : [];
  return { members, guardianUserIds: [...new Set(guardianRows.map((r) => r.userId))] };
}

/** CSV 내보내기 — 명단 반출은 감사 대상 행위(행 수·필터만 기록, 명단 원문 미포함).
   BOM 포함 = 엑셀 한글 호환. PII 최소: 연락처·생년월일 미포함. */
export async function exportAudienceCsv(db: Db, input: {
  actorUserId: string; actorRoles: readonly string[]; academyId: string;
  filter: AudienceFilterInput;
}, nowISO: string): Promise<{ csv: string; filename: string; rowCount: number } | null> {
  const r = await resolveAudience(db, input);
  if (!r) return null;
  const esc = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const STATUS_KO: Record<string, string> = {
    TRIAL: "체험", ENROLLED: "재원", ON_BREAK: "휴원", WITHDRAWN: "퇴원",
  };
  const lines = [
    "이름,연령,상태,반,미납",
    ...r.members.map((m) => [
      m.name, m.ageLabel, STATUS_KO[m.status] ?? m.status,
      m.classNames.join(" / "), m.unpaid ? "미납" : "-",
    ].map(esc).join(",")),
  ];
  await db.transaction(async (tx) => {
    await recordAudit(tx, {
      academyId: input.academyId, actorUserId: input.actorUserId, actorRole: "ACADEMY",
      action: "audience.exported", targetType: "Academy", targetId: input.academyId,
      detail: { rowCount: r.members.length, filter: input.filter }, // ID·플래그만 — PII 없음
      success: true,
    }, nowISO);
  });
  return {
    csv: "\uFEFF" + lines.join("\r\n"),
    filename: `pacefolio-audience-${nowISO.slice(0, 10)}.csv`,
    rowCount: r.members.length,
  };
}
