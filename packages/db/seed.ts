/* =========================================================
   dev seed — 원더짐 정본 캐스트를 DB 로 (웹 fixture 와 같은 세계)
   ---------------------------------------------------------
   대상: dev 서버·통합 테스트. 프로덕션 실행 금지(호출부 게이트).
   박서연 → 김도담·김서준, 플레이2 월수반, 2025 4분기 청구.
   ⚠️ 결제 데모를 위해 도담·서준 청구서를 ISSUED(미납)로 심는다 —
      웹 fixture 정본(PAID)과 이 지점만 다름(결제 플로우 시연 목적, 주석 명시).
   ========================================================= */
import { eq } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import * as s from "./schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = PgDatabase<any, any, any>;

export async function seedWondergym(db: Db, nowISO: string): Promise<void> {
  const exists = await db.select().from(s.academies).where(eq(s.academies.id, "a_wondergym"));
  if (exists[0]) return; // 멱등 — 이미 심어져 있으면 no-op

  await db.insert(s.academies).values({
    id: "a_wondergym", organizationId: "o_wondergym", name: "원더짐 아카데미",
    themeColor: "#12B5A5", themeInk: "#087F73", logoEmoji: "🐯",
    ownerName: "김도윤", billingCycleDefault: 3,
  });
  await db.insert(s.users).values([
    { id: "u_guardian_psy", name: "박서연", phone: "010-3000-1234", createdAt: nowISO, updatedAt: nowISO },
    { id: "u_owner", name: "김도윤", phone: "010-1000-0001", email: "owner@wondergym.co.kr", createdAt: nowISO, updatedAt: nowISO },
  ]);
  await db.insert(s.academyMemberships).values([
    { id: "m_guardian_psy", userId: "u_guardian_psy", academyId: "a_wondergym", roles: ["GUARDIAN"], status: "ACTIVE", joinedAt: "2025-03-02" },
    { id: "m_owner", userId: "u_owner", academyId: "a_wondergym", roles: ["OWNER"], status: "ACTIVE", joinedAt: "2024-03-01" },
  ]);
  await db.insert(s.participants).values([
    { id: "p_dodam", academyId: "a_wondergym", name: "김도담", birth: "2017-04-10", ageLabel: "8세" },
    { id: "p_seojun", academyId: "a_wondergym", name: "김서준", birth: "2018-08-22", ageLabel: "7세" },
  ]);
  await db.insert(s.guardians).values({ id: "gd_psy", userId: "u_guardian_psy" });
  const perms = {
    relationshipType: "MOTHER" as const, isPrimaryGuardian: true, verificationStatus: "VERIFIED" as const,
    canViewSchedule: true, canViewAttendance: true, canViewHealthInfo: true,
    canReceivePhotos: true, canPay: true, canRequestRefund: true,
  };
  await db.insert(s.guardianParticipantLinks).values([
    { id: "gl_dodam", guardianId: "gd_psy", participantId: "p_dodam", academyId: "a_wondergym", ...perms },
    { id: "gl_seojun", guardianId: "gd_psy", participantId: "p_seojun", academyId: "a_wondergym", ...perms },
  ]);
  await db.insert(s.billingPeriods).values({
    id: "bp_2025q4", academyId: "a_wondergym", periodStart: "2025-09-01", periodEnd: "2025-11-30", cycleMonths: 3,
  });
  // 결제 데모용 ISSUED — 정본 fixture 는 PAID(위 주석 참조)
  await db.insert(s.invoices).values([
    { id: "inv_dodam_q4", academyId: "a_wondergym", participantId: "p_dodam", enrollmentId: "e_dodam_play2", billingPeriodId: "bp_2025q4", status: "ISSUED", total: 405000, dueDate: "2025-09-10" },
    { id: "inv_seojun_q4", academyId: "a_wondergym", participantId: "p_seojun", enrollmentId: "e_seojun_play2", billingPeriodId: "bp_2025q4", status: "ISSUED", total: 333000, dueDate: "2025-09-10" },
  ]);
  await db.insert(s.invoiceLines).values([
    { id: "il_dodam_tuition", invoiceId: "inv_dodam_q4", type: "TUITION", label: "플레이2 월수반 (분기)", amount: 360000 },
    { id: "il_dodam_vehicle", invoiceId: "inv_dodam_q4", type: "VEHICLE", label: "차량비", amount: 45000 },
    { id: "il_seojun_tuition", invoiceId: "inv_seojun_q4", type: "TUITION", label: "플레이2 월수반 (분기)", amount: 360000 },
    { id: "il_seojun_sib", invoiceId: "inv_seojun_q4", type: "DISCOUNT", label: "형제 할인 20%", amount: -72000 },
    { id: "il_seojun_vehicle", invoiceId: "inv_seojun_q4", type: "VEHICLE", label: "차량비", amount: 45000 },
  ]);

  /* ── 기본선 화면 실연결(코치 출결) 데모 — 김선재 코치·플레이2 월수반·오늘 세션 ── */
  await db.insert(s.users).values({
    id: "u_coach_ksj", name: "김선재", phone: "010-7000-7712", createdAt: nowISO, updatedAt: nowISO,
  });
  await db.insert(s.academyMemberships).values({
    id: "m_coach_ksj", userId: "u_coach_ksj", academyId: "a_wondergym",
    roles: ["COACH"], status: "ACTIVE", joinedAt: "2024-08-01",
  });
  await db.insert(s.dbClasses).values({
    id: "cls_play2_mw", academyId: "a_wondergym", name: "플레이2 월수반",
    scheduleType: "FIXED_WEEKLY", capacity: 12, room: "본관 2층",
    createdAt: nowISO, updatedAt: nowISO,
  });
  await db.insert(s.classScheduleSlots).values([
    { id: "slot_mw_mon", classId: "cls_play2_mw", academyId: "a_wondergym", weekday: 1, startTime: "14:30", endTime: "15:30" },
    { id: "slot_mw_wed", classId: "cls_play2_mw", academyId: "a_wondergym", weekday: 3, startTime: "14:30", endTime: "15:30" },
  ]);
  await db.insert(s.classAssignments).values({
    id: "ca_ksj_play2", classId: "cls_play2_mw", academyId: "a_wondergym",
    coachUserId: "u_coach_ksj", status: "ACTIVE", startDate: "2024-08-01", createdAt: nowISO,
  });
  await db.insert(s.dbEnrollments).values([
    { id: "en_dodam", academyId: "a_wondergym", classId: "cls_play2_mw", participantId: "p_dodam", status: "ACTIVE", startDate: "2025-03-02", createdAt: nowISO },
    { id: "en_seojun", academyId: "a_wondergym", classId: "cls_play2_mw", participantId: "p_seojun", status: "ACTIVE", startDate: "2025-03-02", createdAt: nowISO },
  ]);
  // 오늘 세션 — 코치 앱 실연결 데모가 바로 찾도록 seed 시각 기준 오늘 날짜
  await db.insert(s.classSessions).values({
    id: "sess_today", classId: "cls_play2_mw", academyId: "a_wondergym",
    date: nowISO.slice(0, 10), startTime: "14:30", endTime: "15:30",
    createdAt: nowISO, updatedAt: nowISO,
  });
}
