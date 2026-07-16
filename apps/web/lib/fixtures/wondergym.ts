/* =========================================================
   PACEFOLIO 단일 데이터 소스 — 원더짐(고객 0번)
   ---------------------------------------------------------
   리뷰 P0-1: 앱마다 다른 _data.ts 대신 "하나의 세계".
   5개 앱이 이 데이터 하나를 공유 → 원생 수·금액·출결이 앱 간 일치.
   모든 관계는 ID로 연결(리뷰 P0-2). 금액=원(KRW) 정수.
   데모 기준일(오늘) = 2025-10-27(월).
   ⚠️ DB 아님. fixture. 승격 시 packages/domain 로.
   ========================================================= */
import { asId } from "@pacefolio/domain";
import type * as ID from "@pacefolio/domain";
import type * as E from "@pacefolio/domain";

export const TODAY = "2025-10-27";

/* ---- 자주 쓰는 ID ---- */
const ACA = asId<ID.AcademyId>("a_wondergym");
const U_OWNER = asId<ID.UserId>("u_owner");
const U_COACH = asId<ID.UserId>("u_coach_ksj");
const U_GUARDIAN = asId<ID.UserId>("u_guardian_psy");
const GD = asId<ID.GuardianId>("gd_psy");
const P_HAJUN = asId<ID.ParticipantId>("p_hajun");
const P_HAEUN = asId<ID.ParticipantId>("p_haeun");
const P_MINJUN = asId<ID.ParticipantId>("p_minjun");
const P_YUNA = asId<ID.ParticipantId>("p_yuna");
const C_SOCCER = asId<ID.ClassId>("c_soccer_tf");
const C_PLAY = asId<ID.ClassId>("c_play1_mw");
const S_1024 = asId<ID.ClassSessionId>("s_soccer_1024"); // 지난 금요일(실제 출결)
const S_1028 = asId<ID.ClassSessionId>("s_soccer_1028"); // 다음 화요일(예정 결석)
const E_HAJUN = asId<ID.EnrollmentId>("e_hajun_soccer");
const E_HAEUN = asId<ID.EnrollmentId>("e_haeun_play");
const BP_Q4 = asId<ID.BillingPeriodId>("bp_2025q4");
const INV_HAJUN = asId<ID.InvoiceId>("inv_hajun_q4");
const INV_HAEUN = asId<ID.InvoiceId>("inv_haeun_q4");
const PAY = asId<ID.PaymentId>("pay_psy_q4");

/* ---- 조직 · 계정 ---- */
export const academy: E.Academy = {
  id: ACA, organizationId: asId<ID.OrganizationId>("o_wondergym"),
  name: "원더짐 아카데미", themeColor: "#12B5A5", themeInk: "#087F73",
  logoEmoji: "🐯", ownerName: "김도윤", billingCycleDefault: 3,
};

export const users: E.User[] = [
  { id: U_OWNER, name: "김도윤", phone: "010-1000-0001", email: "owner@wondergym.co.kr" },
  { id: U_COACH, name: "김선재", phone: "010-2000-0002" },
  { id: U_GUARDIAN, name: "박서연", phone: "010-3000-0003" },
];

export const memberships: E.AcademyMembership[] = [
  { id: asId<ID.AcademyMembershipId>("m_owner"), userId: U_OWNER, academyId: ACA, roles: ["OWNER"], status: "ACTIVE", joinedAt: "2024-03-01" },
  { id: asId<ID.AcademyMembershipId>("m_coach"), userId: U_COACH, academyId: ACA, roles: ["COACH"], status: "ACTIVE", joinedAt: "2024-09-01" },
  { id: asId<ID.AcademyMembershipId>("m_guardian"), userId: U_GUARDIAN, academyId: ACA, roles: ["GUARDIAN"], status: "ACTIVE", joinedAt: "2025-03-02" },
];

/* ---- 사람 · 관계 (박서연 → 이하준·이하은 형제) ---- */
export const guardians: E.Guardian[] = [{ id: GD, userId: U_GUARDIAN }];

export const participants: E.Participant[] = [
  { id: P_HAJUN, academyId: ACA, name: "이하준", birth: "2019-03-11", ageLabel: "만 6세" },
  { id: P_HAEUN, academyId: ACA, name: "이하은", birth: "2021-06-02", ageLabel: "만 4세" },
  { id: P_MINJUN, academyId: ACA, name: "김민준", birth: "2019-07-20", ageLabel: "만 6세" },
  { id: P_YUNA, academyId: ACA, name: "최유나", birth: "2018-11-05", ageLabel: "만 6세" },
];

const fullPerms = {
  canViewSchedule: true, canViewAttendance: true, canViewHealthInfo: true,
  canReceivePhotos: true, canPay: true, canRequestRefund: true,
};
export const guardianLinks: E.GuardianParticipantLink[] = [
  { id: asId<ID.GuardianParticipantLinkId>("gl_hajun"), guardianId: GD, participantId: P_HAJUN, academyId: ACA, relationshipType: "MOTHER", isPrimaryGuardian: true, verificationStatus: "VERIFIED", ...fullPerms },
  { id: asId<ID.GuardianParticipantLinkId>("gl_haeun"), guardianId: GD, participantId: P_HAEUN, academyId: ACA, relationshipType: "MOTHER", isPrimaryGuardian: true, verificationStatus: "VERIFIED", ...fullPerms },
];

/* ---- 수업 · 등록 ---- */
export const programs: E.Program[] = [
  { id: asId<ID.ProgramId>("pr_soccer"), academyId: ACA, division: "ACTIVE", name: "축구", ageLabel: "6~9세" },
  { id: asId<ID.ProgramId>("pr_play1"), academyId: ACA, division: "BRAIN", name: "플레이1", ageLabel: "4~5세" },
];

export const classes: E.ClassRoom[] = [
  { id: C_SOCCER, academyId: ACA, programId: asId<ID.ProgramId>("pr_soccer"), name: "축구 화·금반", daysLabel: "화·금", perWeek: 2, time: "16:00", coachUserId: U_COACH, capacity: 12, enrolled: 3 },
  { id: C_PLAY, academyId: ACA, programId: asId<ID.ProgramId>("pr_play1"), name: "플레이1 월·수반", daysLabel: "월·수", perWeek: 2, time: "15:00", coachUserId: U_COACH, capacity: 10, enrolled: 6 },
];

export const sessions: E.ClassSession[] = [
  { id: S_1024, classId: C_SOCCER, academyId: ACA, date: "2025-10-24", status: "SCHEDULED" },
  { id: S_1028, classId: C_SOCCER, academyId: ACA, date: "2025-10-28", status: "SCHEDULED" },
];

export const enrollments: E.Enrollment[] = [
  { id: E_HAJUN, participantId: P_HAJUN, classId: C_SOCCER, academyId: ACA, startedAt: "2025-03-02", status: "ACTIVE" },
  { id: E_HAEUN, participantId: P_HAEUN, classId: C_PLAY, academyId: ACA, startedAt: "2025-03-02", status: "ACTIVE" },
  { id: asId<ID.EnrollmentId>("e_minjun_soccer"), participantId: P_MINJUN, classId: C_SOCCER, academyId: ACA, startedAt: "2025-04-01", status: "ACTIVE" },
  { id: asId<ID.EnrollmentId>("e_yuna_soccer"), participantId: P_YUNA, classId: C_SOCCER, academyId: ACA, startedAt: "2025-02-10", status: "ACTIVE" },
];

/* ---- 출결: 예정(보호자) ≠ 실제(코치) — 헤드라인 흐름 ---- */
// ① 박서연 님이 이하준 10/28(화) 결석을 미리 통보
export const attendanceNotices: E.AttendanceNotice[] = [
  { id: asId<ID.AttendanceNoticeId>("an_hajun_1028"), academyId: ACA, participantId: P_HAJUN, classSessionId: S_1028, type: "ABSENCE", reason: "가족 여행", createdByGuardianId: GD, createdAt: "2025-10-27" },
];
// ② 코치가 지난 10/24(금) 실제 출결을 확정 (예정과 별개 트랙)
export const attendanceRecords: E.AttendanceRecord[] = [
  { id: asId<ID.AttendanceRecordId>("ar_hajun_1024"), academyId: ACA, participantId: P_HAJUN, classSessionId: S_1024, status: "PRESENT", confirmedByUserId: U_COACH, confirmedAt: "2025-10-24" },
];

/* ---- 청구 · 결제 · 배분 (형제 = 원생별 청구, 합산 결제 → 배분) ---- */
export const billingPeriods: E.BillingPeriod[] = [
  { id: BP_Q4, academyId: ACA, periodStart: "2025-09-01", periodEnd: "2025-11-30", cycleMonths: 3 },
];

export const invoices: E.Invoice[] = [
  { id: INV_HAJUN, academyId: ACA, participantId: P_HAJUN, enrollmentId: E_HAJUN, billingPeriodId: BP_Q4, status: "PAID", total: 210000, dueDate: "2025-09-10" },
  { id: INV_HAEUN, academyId: ACA, participantId: P_HAEUN, enrollmentId: E_HAEUN, billingPeriodId: BP_Q4, status: "PAID", total: 128000, dueDate: "2025-09-10" },
];

export const invoiceLines: E.InvoiceLine[] = [
  { id: asId<ID.InvoiceLineId>("il_hajun_tuition"), invoiceId: INV_HAJUN, type: "TUITION", label: "축구 화·금반 (24회)", amount: 180000 },
  { id: asId<ID.InvoiceLineId>("il_hajun_vehicle"), invoiceId: INV_HAJUN, type: "VEHICLE", label: "차량비", amount: 30000 },
  { id: asId<ID.InvoiceLineId>("il_haeun_tuition"), invoiceId: INV_HAEUN, type: "TUITION", label: "플레이1 월·수반 (24회)", amount: 160000 },
  { id: asId<ID.InvoiceLineId>("il_haeun_sib"), invoiceId: INV_HAEUN, type: "DISCOUNT", label: "형제 할인 20%", amount: -32000 },
];

// 박서연 님이 두 청구서를 한 번에 결제(합산) → 원생별로 배분
export const payments: E.Payment[] = [
  { id: PAY, academyId: ACA, guardianId: GD, amount: 338000, status: "CAPTURED", idempotencyKey: "pay_psy_q4_key", createdAt: "2025-09-05" },
];
export const paymentAllocations: E.PaymentAllocation[] = [
  { id: asId<ID.PaymentAllocationId>("pa_hajun"), paymentId: PAY, invoiceId: INV_HAJUN, amount: 210000 },
  { id: asId<ID.PaymentAllocationId>("pa_haeun"), paymentId: PAY, invoiceId: INV_HAEUN, amount: 128000 },
];

/* ---- 운영 작업 (2축: 발송 ≠ 해결) ---- */
export const operationalTasks: E.OperationalTask[] = [
  // 결석 통보 → 원장 할 일 (코치 반영까지 확인 대기)
  { id: asId<ID.OperationalTaskId>("ot_hajun_absence"), academyId: ACA, title: "이하준 10/28 결석 통보 — 코치 반영 확인", workflowStage: "IN_PROGRESS", actionResult: "ACKNOWLEDGED", relatedParticipantId: P_HAJUN, relatedSessionId: S_1028, assigneeUserId: U_OWNER, dueAt: "2025-10-28" },
];
