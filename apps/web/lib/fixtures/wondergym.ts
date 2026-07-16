/* =========================================================
   PACEFOLIO 단일 데이터 소스 — 원더짐(고객 0번)
   ---------------------------------------------------------
   리뷰 P0-1: 앱마다 다른 _data.ts 대신 "하나의 세계".
   5개 앱이 이 데이터 하나를 공유 → 원생 수·금액·출결이 앱 간 일치.
   모든 관계는 ID로 연결(리뷰 P0-2). 금액=원(KRW) 정수.
   데모 기준일(오늘) = 2025-10-27(월).
   ⚠️ DB 아님. fixture. 승격 시 packages/domain 로.

   B4 전환(2026-07-16): 앱별 _data.ts 캐스트를 이 정본으로 통합.
   원더짐 = 여러 반을 가진 큰 학원 하나. 각 앱은 자기 부분집합만 표시.
   금액 충돌은 정본 1개로 통일(이수아 531,000 · 최이안 243,750 · 한예린 240,000).
   gender·알레르기·휴원 등은 도메인 필드 아님 → 각 앱 어댑터의 뷰 장식으로 유지.
   ========================================================= */
import { asId } from "@pacefolio/domain";
import type * as ID from "@pacefolio/domain";
import type * as E from "@pacefolio/domain";

export const TODAY = "2025-10-27";

/* ---- 자주 쓰는 ID ---- */
const ACA = asId<ID.AcademyId>("a_wondergym");
const U_OWNER = asId<ID.UserId>("u_owner");
const U_COACH = asId<ID.UserId>("u_coach_ksj");      // 김선재(퇴사 예정)
const U_COACH_LCJ = asId<ID.UserId>("u_coach_lcj");  // 이창진(축구)
const U_COACH_PARK = asId<ID.UserId>("u_coach_park");// 박코치(플레이3·인라인)
const U_COACH_LEE = asId<ID.UserId>("u_coach_lee");  // 이코치(플레이2 유아반)

/* 보호자 계정 */
const U_G_PSY = asId<ID.UserId>("u_guardian_psy");   // 박서연 → 도담·서준
const U_G_PMJ = asId<ID.UserId>("u_guardian_pmj");   // 박민준 모
const U_G_HY = asId<ID.UserId>("u_guardian_hy");     // 정하윤 부
const U_G_SUA = asId<ID.UserId>("u_guardian_sua");   // 이수아 모
const U_G_JH = asId<ID.UserId>("u_guardian_jh");     // 최지호 모
const U_G_YR = asId<ID.UserId>("u_guardian_yr");     // 한예린 모
const U_G_IAN = asId<ID.UserId>("u_guardian_ian");   // 최이안 부

const GD_PSY = asId<ID.GuardianId>("gd_psy");
const GD_PMJ = asId<ID.GuardianId>("gd_pmj");
const GD_HY = asId<ID.GuardianId>("gd_hy");
const GD_SUA = asId<ID.GuardianId>("gd_sua");
const GD_JH = asId<ID.GuardianId>("gd_jh");
const GD_YR = asId<ID.GuardianId>("gd_yr");
const GD_IAN = asId<ID.GuardianId>("gd_ian");

/* 원생 */
const P_DODAM = asId<ID.ParticipantId>("p_dodam");
const P_SEOJUN = asId<ID.ParticipantId>("p_seojun");
const P_MINJUN = asId<ID.ParticipantId>("p_minjun");   // 박민준(견과류 알레르기)
const P_HAYUN = asId<ID.ParticipantId>("p_hayun");
const P_SUA = asId<ID.ParticipantId>("p_sua");         // 이수아(축구+인라인)
const P_JIHO = asId<ID.ParticipantId>("p_jiho");
const P_YERIN = asId<ID.ParticipantId>("p_yerin");     // 한예린(퇴원 예정)
const P_IAN = asId<ID.ParticipantId>("p_ian");         // 최이안(일할 신규)

/* 프로그램 */
const PR_PLAY2 = asId<ID.ProgramId>("pr_play2");
const PR_SOCCER = asId<ID.ProgramId>("pr_soccer");
const PR_INLINE = asId<ID.ProgramId>("pr_inline");
const PR_PLAY3 = asId<ID.ProgramId>("pr_play3");
const PR_BASKET = asId<ID.ProgramId>("pr_basket");

/* 반 */
const C_PLAY2_MW = asId<ID.ClassId>("c_play2_mw");   // 플레이2 월수반(김선재) — 코치앱 홈
const C_PLAY2_YA = asId<ID.ClassId>("c_play2_ya");   // 플레이2 유아반(이코치)
const C_SOCCER = asId<ID.ClassId>("c_soccer_tf");    // 축구 화금반(이창진)
const C_PLAY3 = asId<ID.ClassId>("c_play3_th");
const C_INLINE = asId<ID.ClassId>("c_inline_sat");
const C_BASKET = asId<ID.ClassId>("c_basket_sat");   // 농구 토요특강(김선재)

/* 세션(출결 헤드라인) */
const S_PLAY2_1022 = asId<ID.ClassSessionId>("s_play2_1022"); // 지난 수요일(실제 출결)
const S_PLAY2_1027 = asId<ID.ClassSessionId>("s_play2_1027"); // 오늘 월요일(예정 결석)

/* 등록 */
const EN_DODAM = asId<ID.EnrollmentId>("e_dodam_play2");
const EN_SEOJUN = asId<ID.EnrollmentId>("e_seojun_play2");
const EN_MINJUN = asId<ID.EnrollmentId>("e_minjun_play2");
const EN_HAYUN = asId<ID.EnrollmentId>("e_hayun_play2");
const EN_JIHO = asId<ID.EnrollmentId>("e_jiho_play2");
const EN_SUA = asId<ID.EnrollmentId>("e_sua_soccer");
const EN_SUA_INLINE = asId<ID.EnrollmentId>("e_sua_inline");
const EN_YERIN = asId<ID.EnrollmentId>("e_yerin_soccer");
const EN_IAN = asId<ID.EnrollmentId>("e_ian_soccer");

/* 청구 · 결제 */
const BP_Q4 = asId<ID.BillingPeriodId>("bp_2025q4");
const INV_DODAM = asId<ID.InvoiceId>("inv_dodam_q4");
const INV_SEOJUN = asId<ID.InvoiceId>("inv_seojun_q4");
const INV_MINJUN = asId<ID.InvoiceId>("inv_minjun_q4");
const INV_HAYUN = asId<ID.InvoiceId>("inv_hayun_q4");
const INV_SUA = asId<ID.InvoiceId>("inv_sua_q4");
const INV_JIHO = asId<ID.InvoiceId>("inv_jiho_q4");
const INV_YERIN = asId<ID.InvoiceId>("inv_yerin_q4");
const INV_IAN = asId<ID.InvoiceId>("inv_ian_q4");
const PAY_PSY = asId<ID.PaymentId>("pay_psy_q4");
const PAY_HY = asId<ID.PaymentId>("pay_hy_q4");
const PAY_JH = asId<ID.PaymentId>("pay_jh_q4");
const PAY_YR = asId<ID.PaymentId>("pay_yr_q4");

/* ---- 조직 · 계정 ---- */
export const academy: E.Academy = {
  id: ACA, organizationId: asId<ID.OrganizationId>("o_wondergym"),
  name: "원더짐 아카데미", themeColor: "#12B5A5", themeInk: "#087F73",
  logoEmoji: "🐯", ownerName: "김도윤", billingCycleDefault: 3,
};

export const users: E.User[] = [
  { id: U_OWNER, name: "김도윤", phone: "010-1000-0001", email: "owner@wondergym.co.kr" },
  { id: U_COACH, name: "김선재", phone: "010-2000-0002" },
  { id: U_COACH_LCJ, name: "이창진", phone: "010-2000-0003" },
  { id: U_COACH_PARK, name: "박코치", phone: "010-2000-0004" },
  { id: U_COACH_LEE, name: "이코치", phone: "010-2000-0005" },
  { id: U_G_PSY, name: "박서연", phone: "010-3000-1234" },
  { id: U_G_PMJ, name: "박민준 어머니", phone: "010-3000-5678" },
  { id: U_G_HY, name: "정하윤 아버지", phone: "010-3000-2345" },
  { id: U_G_SUA, name: "이수아 어머니", phone: "010-3000-8765" },
  { id: U_G_JH, name: "최지호 어머니", phone: "010-3000-9012" },
  { id: U_G_YR, name: "한예린 어머니", phone: "010-3000-3456" },
  { id: U_G_IAN, name: "최이안 아버지", phone: "010-3000-7890" },
];

export const memberships: E.AcademyMembership[] = [
  { id: asId<ID.AcademyMembershipId>("m_owner"), userId: U_OWNER, academyId: ACA, roles: ["OWNER"], status: "ACTIVE", joinedAt: "2024-03-01" },
  { id: asId<ID.AcademyMembershipId>("m_coach_ksj"), userId: U_COACH, academyId: ACA, roles: ["COACH"], status: "ACTIVE", joinedAt: "2024-09-01" },
  { id: asId<ID.AcademyMembershipId>("m_coach_lcj"), userId: U_COACH_LCJ, academyId: ACA, roles: ["COACH"], status: "ACTIVE", joinedAt: "2024-03-01" },
  { id: asId<ID.AcademyMembershipId>("m_coach_park"), userId: U_COACH_PARK, academyId: ACA, roles: ["COACH"], status: "ACTIVE", joinedAt: "2024-05-01" },
  { id: asId<ID.AcademyMembershipId>("m_coach_lee"), userId: U_COACH_LEE, academyId: ACA, roles: ["COACH"], status: "ACTIVE", joinedAt: "2025-03-01" },
];

/* ---- 사람 · 관계 ---- */
export const guardians: E.Guardian[] = [
  { id: GD_PSY, userId: U_G_PSY },
  { id: GD_PMJ, userId: U_G_PMJ },
  { id: GD_HY, userId: U_G_HY },
  { id: GD_SUA, userId: U_G_SUA },
  { id: GD_JH, userId: U_G_JH },
  { id: GD_YR, userId: U_G_YR },
  { id: GD_IAN, userId: U_G_IAN },
];

export const participants: E.Participant[] = [
  { id: P_DODAM, academyId: ACA, name: "김도담", birth: "2017-04-10", ageLabel: "8세" },
  { id: P_SEOJUN, academyId: ACA, name: "김서준", birth: "2018-08-22", ageLabel: "7세" },
  { id: P_MINJUN, academyId: ACA, name: "박민준", birth: "2017-02-15", ageLabel: "8세" },
  { id: P_HAYUN, academyId: ACA, name: "정하윤", birth: "2017-06-30", ageLabel: "8세" },
  { id: P_SUA, academyId: ACA, name: "이수아", birth: "2016-05-18", ageLabel: "9세" },
  { id: P_JIHO, academyId: ACA, name: "최지호", birth: "2018-03-03", ageLabel: "7세" },
  { id: P_YERIN, academyId: ACA, name: "한예린", birth: "2015-11-09", ageLabel: "10세" },
  { id: P_IAN, academyId: ACA, name: "최이안", birth: "2018-09-25", ageLabel: "7세" },
];

const fullPerms = {
  canViewSchedule: true, canViewAttendance: true, canViewHealthInfo: true,
  canReceivePhotos: true, canPay: true, canRequestRefund: true,
};
type LinkSeed = {
  id: string; guardianId: ID.GuardianId; participantId: ID.ParticipantId;
  rel: E.RelationshipType;
};
const linkSeeds: LinkSeed[] = [
  { id: "gl_dodam", guardianId: GD_PSY, participantId: P_DODAM, rel: "MOTHER" },
  { id: "gl_seojun", guardianId: GD_PSY, participantId: P_SEOJUN, rel: "MOTHER" }, // 도담·서준 형제 = 같은 보호자
  { id: "gl_minjun", guardianId: GD_PMJ, participantId: P_MINJUN, rel: "MOTHER" },
  { id: "gl_hayun", guardianId: GD_HY, participantId: P_HAYUN, rel: "FATHER" },
  { id: "gl_sua", guardianId: GD_SUA, participantId: P_SUA, rel: "MOTHER" },
  { id: "gl_jiho", guardianId: GD_JH, participantId: P_JIHO, rel: "MOTHER" },
  { id: "gl_yerin", guardianId: GD_YR, participantId: P_YERIN, rel: "MOTHER" },
  { id: "gl_ian", guardianId: GD_IAN, participantId: P_IAN, rel: "FATHER" },
];
export const guardianLinks: E.GuardianParticipantLink[] = linkSeeds.map((s) => ({
  id: asId<ID.GuardianParticipantLinkId>(s.id),
  guardianId: s.guardianId, participantId: s.participantId, academyId: ACA,
  relationshipType: s.rel, isPrimaryGuardian: true, verificationStatus: "VERIFIED",
  ...fullPerms,
}));

/* ---- 수업 · 등록 ---- */
export const programs: E.Program[] = [
  { id: PR_PLAY2, academyId: ACA, division: "BRAIN", name: "플레이2", ageLabel: "7~9세" },
  { id: PR_SOCCER, academyId: ACA, division: "ACTIVE", name: "유소년 축구", ageLabel: "7~10세" },
  { id: PR_INLINE, academyId: ACA, division: "ACTIVE", name: "인라인 기초", ageLabel: "7~9세" },
  { id: PR_PLAY3, academyId: ACA, division: "BRAIN", name: "플레이3", ageLabel: "9~11세" },
  { id: PR_BASKET, academyId: ACA, division: "ACTIVE", name: "농구 특강", ageLabel: "8~11세" },
];

export const classes: E.ClassRoom[] = [
  { id: C_PLAY2_MW, academyId: ACA, programId: PR_PLAY2, name: "플레이2 월수반", daysLabel: "월·수", perWeek: 2, time: "14:30", coachUserId: U_COACH, capacity: 12, enrolled: 10 },
  { id: C_PLAY2_YA, academyId: ACA, programId: PR_PLAY2, name: "플레이2 유아반", daysLabel: "화·목", perWeek: 2, time: "10:30", coachUserId: U_COACH_LEE, capacity: 12, enrolled: 12 },
  { id: C_SOCCER, academyId: ACA, programId: PR_SOCCER, name: "축구 화금반", daysLabel: "화·금", perWeek: 2, time: "16:00", coachUserId: U_COACH_LCJ, capacity: 16, enrolled: 16 },
  { id: C_PLAY3, academyId: ACA, programId: PR_PLAY3, name: "플레이3 화목반", daysLabel: "화·목", perWeek: 2, time: "15:00", coachUserId: U_COACH_PARK, capacity: 12, enrolled: 11 },
  { id: C_INLINE, academyId: ACA, programId: PR_INLINE, name: "인라인 토요반", daysLabel: "토", perWeek: 1, time: "11:00", coachUserId: U_COACH_PARK, capacity: 12, enrolled: 5 },
  { id: C_BASKET, academyId: ACA, programId: PR_BASKET, name: "농구 토요특강", daysLabel: "토", perWeek: 1, time: "10:00", coachUserId: U_COACH, capacity: 12, enrolled: 8 },
];

/* 코치 담당 배정(권한 정본) — 조회용 캐시 coachUserId와 별개 */
export const classAssignments: E.ClassAssignment[] = [
  { id: asId<ID.ClassAssignmentId>("ca_play2_ksj"), academyId: ACA, classId: C_PLAY2_MW, coachUserId: U_COACH, role: "PRIMARY", status: "ACTIVE", startedAt: "2024-09-01" },
  { id: asId<ID.ClassAssignmentId>("ca_basket_ksj"), academyId: ACA, classId: C_BASKET, coachUserId: U_COACH, role: "PRIMARY", status: "ACTIVE", startedAt: "2025-03-01" },
  { id: asId<ID.ClassAssignmentId>("ca_soccer_lcj"), academyId: ACA, classId: C_SOCCER, coachUserId: U_COACH_LCJ, role: "PRIMARY", status: "ACTIVE", startedAt: "2024-03-01" },
];

export const sessions: E.ClassSession[] = [
  { id: S_PLAY2_1022, classId: C_PLAY2_MW, academyId: ACA, date: "2025-10-22", status: "SCHEDULED" },
  { id: S_PLAY2_1027, classId: C_PLAY2_MW, academyId: ACA, date: "2025-10-27", status: "SCHEDULED" },
];

export const enrollments: E.Enrollment[] = [
  { id: EN_DODAM, participantId: P_DODAM, classId: C_PLAY2_MW, academyId: ACA, startedAt: "2024-09-02", status: "ACTIVE" },
  { id: EN_SEOJUN, participantId: P_SEOJUN, classId: C_PLAY2_MW, academyId: ACA, startedAt: "2025-10-13", status: "ACTIVE" },
  { id: EN_MINJUN, participantId: P_MINJUN, classId: C_PLAY2_MW, academyId: ACA, startedAt: "2025-01-06", status: "ACTIVE" },
  { id: EN_HAYUN, participantId: P_HAYUN, classId: C_PLAY2_MW, academyId: ACA, startedAt: "2024-10-01", status: "ACTIVE" },
  { id: EN_JIHO, participantId: P_JIHO, classId: C_PLAY2_MW, academyId: ACA, startedAt: "2025-09-01", status: "ACTIVE" },
  { id: EN_SUA, participantId: P_SUA, classId: C_SOCCER, academyId: ACA, startedAt: "2024-03-05", status: "ACTIVE" },
  { id: EN_SUA_INLINE, participantId: P_SUA, classId: C_INLINE, academyId: ACA, startedAt: "2025-09-06", status: "ACTIVE" },
  { id: EN_YERIN, participantId: P_YERIN, classId: C_SOCCER, academyId: ACA, startedAt: "2024-02-10", status: "ACTIVE" },
  { id: EN_IAN, participantId: P_IAN, classId: C_SOCCER, academyId: ACA, startedAt: "2025-10-28", status: "ACTIVE" },
];

/* ---- 출결: 예정(보호자) ≠ 실제(코치) — 헤드라인 흐름 ---- */
// ① 박민준 어머니가 오늘(10/27) 결석을 미리 통보 ("아파요")
export const attendanceNotices: E.AttendanceNotice[] = [
  { id: asId<ID.AttendanceNoticeId>("an_minjun_1027"), academyId: ACA, participantId: P_MINJUN, classSessionId: S_PLAY2_1027, type: "ABSENCE", reason: "아파요", createdByGuardianId: GD_PMJ, createdAt: "2025-10-27" },
];
// ② 코치가 지난 10/22(수) 실제 출결을 확정 (예정과 별개 트랙)
export const attendanceRecords: E.AttendanceRecord[] = [
  { id: asId<ID.AttendanceRecordId>("ar_dodam_1022"), academyId: ACA, participantId: P_DODAM, classSessionId: S_PLAY2_1022, status: "PRESENT", confirmedByUserId: U_COACH, confirmedAt: "2025-10-22" },
];

/* ---- 청구 · 결제 · 배분 (분기제 3·6·9·12, 2025 4분기) ---- */
export const billingPeriods: E.BillingPeriod[] = [
  { id: BP_Q4, academyId: ACA, periodStart: "2025-09-01", periodEnd: "2025-11-30", cycleMonths: 3 },
];

type InvSeed = {
  id: ID.InvoiceId; participantId: ID.ParticipantId; enrollmentId: ID.EnrollmentId;
  status: E.InvoiceStatus; lines: { idp: string; type: E.InvoiceLineType; label: string; amount: number }[];
};
const invSeeds: InvSeed[] = [
  { id: INV_DODAM, participantId: P_DODAM, enrollmentId: EN_DODAM, status: "PAID",
    lines: [
      { idp: "il_dodam_tuition", type: "TUITION", label: "플레이2 월수반 (분기)", amount: 360000 },
      { idp: "il_dodam_vehicle", type: "VEHICLE", label: "차량비", amount: 45000 },
    ] },
  { id: INV_SEOJUN, participantId: P_SEOJUN, enrollmentId: EN_SEOJUN, status: "PAID",
    lines: [
      { idp: "il_seojun_tuition", type: "TUITION", label: "플레이2 월수반 (분기)", amount: 360000 },
      { idp: "il_seojun_sib", type: "DISCOUNT", label: "형제 할인 20%", amount: -72000 },
      { idp: "il_seojun_vehicle", type: "VEHICLE", label: "차량비", amount: 45000 },
    ] },
  { id: INV_MINJUN, participantId: P_MINJUN, enrollmentId: EN_MINJUN, status: "OVERDUE",
    lines: [
      { idp: "il_minjun_tuition", type: "TUITION", label: "플레이2 월수반 (분기)", amount: 330000 },
    ] },
  { id: INV_HAYUN, participantId: P_HAYUN, enrollmentId: EN_HAYUN, status: "PAID",
    lines: [
      { idp: "il_hayun_tuition", type: "TUITION", label: "플레이2 월수반 (분기)", amount: 360000 },
    ] },
  { id: INV_SUA, participantId: P_SUA, enrollmentId: EN_SUA, status: "OVERDUE",
    lines: [
      { idp: "il_sua_tuition", type: "TUITION", label: "축구+인라인 (분기)", amount: 540000 },
      { idp: "il_sua_multi", type: "DISCOUNT", label: "다종목 할인 10%", amount: -54000 },
      { idp: "il_sua_vehicle", type: "VEHICLE", label: "차량비", amount: 45000 },
    ] },
  { id: INV_JIHO, participantId: P_JIHO, enrollmentId: EN_JIHO, status: "PAID",
    lines: [
      { idp: "il_jiho_tuition", type: "TUITION", label: "플레이2 월수반 (승급 반영·분기)", amount: 450000 },
    ] },
  { id: INV_YERIN, participantId: P_YERIN, enrollmentId: EN_YERIN, status: "PAID",
    lines: [
      { idp: "il_yerin_tuition", type: "TUITION", label: "축구 화금반 (부분 청구)", amount: 240000 },
    ] },
  { id: INV_IAN, participantId: P_IAN, enrollmentId: EN_IAN, status: "ISSUED",
    lines: [
      { idp: "il_ian_tuition", type: "TUITION", label: "축구 화금반 (일할 10/24)", amount: 225000 },
      { idp: "il_ian_vehicle", type: "VEHICLE", label: "차량비 (일할·동일 구조)", amount: 18750 },
    ] },
];

export const invoiceLines: E.InvoiceLine[] = invSeeds.flatMap((inv) =>
  inv.lines.map((l) => ({
    id: asId<ID.InvoiceLineId>(l.idp), invoiceId: inv.id, type: l.type, label: l.label, amount: l.amount,
  })),
);
export const invoices: E.Invoice[] = invSeeds.map((inv) => ({
  id: inv.id, academyId: ACA, participantId: inv.participantId, enrollmentId: inv.enrollmentId,
  billingPeriodId: BP_Q4, status: inv.status,
  total: inv.lines.reduce((s, l) => s + l.amount, 0),
  dueDate: "2025-09-10",
}));

// 박서연 님이 도담·서준 두 청구서를 한 번에 결제(합산) → 원생별로 배분
export const payments: E.Payment[] = [
  { id: PAY_PSY, academyId: ACA, guardianId: GD_PSY, amount: 738000, status: "CAPTURED", idempotencyKey: "pay_psy_q4_key", createdAt: "2025-09-05" },
  { id: PAY_HY, academyId: ACA, guardianId: GD_HY, amount: 360000, status: "CAPTURED", idempotencyKey: "pay_hy_q4_key", createdAt: "2025-09-03" },
  { id: PAY_JH, academyId: ACA, guardianId: GD_JH, amount: 450000, status: "CAPTURED", idempotencyKey: "pay_jh_q4_key", createdAt: "2025-09-08" },
  { id: PAY_YR, academyId: ACA, guardianId: GD_YR, amount: 240000, status: "CAPTURED", idempotencyKey: "pay_yr_q4_key", createdAt: "2025-09-04" },
];
export const paymentAllocations: E.PaymentAllocation[] = [
  { id: asId<ID.PaymentAllocationId>("pa_dodam"), paymentId: PAY_PSY, invoiceId: INV_DODAM, amount: 405000 },
  { id: asId<ID.PaymentAllocationId>("pa_seojun"), paymentId: PAY_PSY, invoiceId: INV_SEOJUN, amount: 333000 },
  { id: asId<ID.PaymentAllocationId>("pa_hayun"), paymentId: PAY_HY, invoiceId: INV_HAYUN, amount: 360000 },
  { id: asId<ID.PaymentAllocationId>("pa_jiho"), paymentId: PAY_JH, invoiceId: INV_JIHO, amount: 450000 },
  { id: asId<ID.PaymentAllocationId>("pa_yerin"), paymentId: PAY_YR, invoiceId: INV_YERIN, amount: 240000 },
];

/* ---- 운영 작업 (2축: 발송 ≠ 해결) ---- */
export const operationalTasks: E.OperationalTask[] = [
  // 결석 통보 → 원장 할 일 (코치 반영까지 확인 대기)
  { id: asId<ID.OperationalTaskId>("ot_minjun_absence"), academyId: ACA, title: "박민준 10/27 결석 통보 — 코치 반영 확인", workflowStage: "IN_PROGRESS", actionResult: "ACKNOWLEDGED", relatedParticipantId: P_MINJUN, relatedSessionId: S_PLAY2_1027, assigneeUserId: U_OWNER, dueAt: "2025-10-27" },
  // 이수아 미납 → 리마인드 발송했으나 미해결
  { id: asId<ID.OperationalTaskId>("ot_sua_unpaid"), academyId: ACA, title: "이수아 4분기 미납 — 리마인드 발송함", workflowStage: "IN_PROGRESS", actionResult: "SENT", relatedParticipantId: P_SUA, relatedInvoiceId: INV_SUA, assigneeUserId: U_OWNER, dueAt: "2025-10-30" },
];
