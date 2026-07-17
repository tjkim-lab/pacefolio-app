/* =========================================================
   PACEFOLIO 공유 도메인 — 엔티티 인터페이스 (docs/02 코드화)
   fixture와 미래 API가 공유하는 타입. 모든 관계는 ID로.
   ⚠️ DB 아님. 백본 위주 — 나머지 엔티티는 같은 패턴으로 점증.
   ========================================================= */
import type * as ID from "./ids";
import type {
  Role, MembershipStatus, Division, AttendanceNoticeType, AttendanceRecordStatus,
  InvoiceStatus, PaymentStatus, RefundStatus, WorkflowStage, ActionResult, RelationshipType,
  VerificationStatus, BillingCycleMonths,
} from "./enums";

/* --- 조직 · 계정 --- */
export interface Academy {
  id: ID.AcademyId;
  organizationId: ID.OrganizationId;
  name: string;
  themeColor: string;
  themeInk: string;
  logoEmoji: string;
  ownerName: string;
  billingCycleDefault: BillingCycleMonths;
}
export interface User {
  id: ID.UserId;
  name: string;
  phone: string;   // 인증된 연락처
  email?: string;
}
/* 멀티역할 모델 A (리뷰 6.3, 2026-07-16 유저 확정):
   사용자×학원 = membership 1건, 여러 역할은 roles 배열.
   예: 원장이 직접 수업 → roles: ["OWNER","COACH"]. 순서의존성 없음. */
export interface AcademyMembership {
  id: ID.AcademyMembershipId;
  userId: ID.UserId;
  academyId: ID.AcademyId;
  roles: Role[];
  status: MembershipStatus;
  joinedAt: string;      // YYYY-MM-DD
  endedAt?: string;
}

/* --- 사람 · 관계 --- */
export interface Participant {
  id: ID.ParticipantId;
  academyId: ID.AcademyId;
  name: string;
  birth: string;         // YYYY-MM-DD
  ageLabel: string;
}
export interface Guardian {
  id: ID.GuardianId;
  userId: ID.UserId;     // Guardian = User의 GUARDIAN 역할
}
export interface GuardianParticipantLink {
  id: ID.GuardianParticipantLinkId;
  guardianId: ID.GuardianId;
  participantId: ID.ParticipantId;
  academyId: ID.AcademyId;
  relationshipType: RelationshipType;
  isPrimaryGuardian: boolean;
  verificationStatus: VerificationStatus;
  canViewSchedule: boolean;
  canViewAttendance: boolean;
  canViewHealthInfo: boolean;
  canReceivePhotos: boolean;
  canPay: boolean;
  canRequestRefund: boolean;
}

/* --- 수업 · 등록 --- */
export interface Program {
  id: ID.ProgramId;
  academyId: ID.AcademyId;
  division: Division;
  name: string;
  ageLabel: string;
}
export interface ClassRoom {
  id: ID.ClassId;
  academyId: ID.AcademyId;
  programId: ID.ProgramId;
  name: string;
  daysLabel: string;     // "화·금"
  perWeek: number;       // 주N회 (필수)
  time: string;
  coachUserId: ID.UserId;  // ⚠️ 조회용 primary coach 캐시 — 권한 기준 아님(ClassAssignment 가 정본)
  capacity: number;
  enrolled: number;
}
export interface ClassSession {
  id: ID.ClassSessionId;
  classId: ID.ClassId;
  academyId: ID.AcademyId;
  date: string;          // YYYY-MM-DD
  status: "SCHEDULED" | "HOLIDAY" | "CANCELLED";
}

/* 코치 담당 배정 = 권한 판단의 정본(리뷰 R2 6.2).
   ⚠️ ClassRoom.coachUserId 는 조회용 primary 캐시일 뿐, 권한 기준 아님.
   기간·주담당/보조/대체를 표현. 담당 스코프(건강정보·실출결)는 이 배정으로 판단. */
export interface ClassAssignment {
  id: ID.ClassAssignmentId;
  academyId: ID.AcademyId;
  classId: ID.ClassId;
  coachUserId: ID.UserId;
  role: "PRIMARY" | "ASSISTANT" | "SUBSTITUTE";
  status: "ACTIVE" | "ENDED";
  startedAt: string;
  endedAt?: string;
}
export interface Enrollment {
  id: ID.EnrollmentId;
  participantId: ID.ParticipantId;
  classId: ID.ClassId;
  academyId: ID.AcademyId;
  startedAt: string;
  status: "ACTIVE" | "ENDED";
}

/* --- 출결 (예정 ≠ 실제) --- */
export interface AttendanceNotice {   // 보호자 통보 = 예정
  id: ID.AttendanceNoticeId;
  academyId: ID.AcademyId;
  participantId: ID.ParticipantId;
  classSessionId: ID.ClassSessionId;
  type: AttendanceNoticeType;
  reason?: string;
  createdByGuardianId: ID.GuardianId;
  createdAt: string;
}
export interface AttendanceRecord {   // 코치 확정 = 실제
  id: ID.AttendanceRecordId;
  academyId: ID.AcademyId;
  participantId: ID.ParticipantId;
  classSessionId: ID.ClassSessionId;
  status: AttendanceRecordStatus;
  confirmedByUserId: ID.UserId;       // 코치
  confirmedAt: string;
}

/* --- 청구 · 결제 --- */
export interface BillingPeriod {
  id: ID.BillingPeriodId;
  academyId: ID.AcademyId;
  periodStart: string;   // YYYY-MM-DD
  periodEnd: string;
  cycleMonths: BillingCycleMonths;
}
export type InvoiceLineType = "TUITION" | "VEHICLE" | "DISCOUNT" | "OTHER";
export interface InvoiceLine {
  id: ID.InvoiceLineId;
  invoiceId: ID.InvoiceId;
  type: InvoiceLineType;
  label: string;
  amount: number;        // KRW. DISCOUNT는 음수
}
export interface Invoice {
  id: ID.InvoiceId;
  academyId: ID.AcademyId;
  participantId: ID.ParticipantId;
  enrollmentId: ID.EnrollmentId;
  billingPeriodId: ID.BillingPeriodId;
  status: InvoiceStatus;
  total: number;         // = Σ lines
  dueDate: string;
}
export interface Payment {           // 보호자 합산 결제 1건
  id: ID.PaymentId;
  academyId: ID.AcademyId;
  guardianId: ID.GuardianId;
  amount: number;
  status: PaymentStatus;
  idempotencyKey: string;
  createdAt: string;
  /* PG 거래 추적 식별자(R6 5.6 — 대사·분쟁 대응의 축. 카드 원문은 절대 저장 금지) */
  provider?: string;                 // 예: "tosspay"
  providerPaymentId?: string;        // PG 측 거래 ID — 내부↔PG 대사 결합축
  providerRawStatus?: string;        // PG 원문 상태(참고용 — 정본은 status)
  approvedAt?: string;               // PG 승인 확정 시각(ISO)
}
export interface PaymentAllocation { // 결제 → 원생별 배분
  id: ID.PaymentAllocationId;
  paymentId: ID.PaymentId;
  invoiceId: ID.InvoiceId;
  amount: number;
}

/* 환불 (리뷰 R2 P0-2). 합산결제 후 특정 원생만 환불 가능 → 귀속은 PaymentAllocation 기준.
   헌법: 학부모+원장 상호 승인 필수 → 양측 승인 필드 분리(동일인 양측 승인 금지는 state-machine에서). */
export interface Refund {
  id: ID.RefundId;
  academyId: ID.AcademyId;
  paymentId: ID.PaymentId;
  participantId: ID.ParticipantId;
  status: RefundStatus;
  reasonCode: string;
  reasonText?: string;
  requestedAmount: number;
  approvedAmount?: number;
  completedAmount?: number;
  requestedByUserId: ID.UserId;
  requestedAt: string;
  guardianApprovedByUserId?: ID.UserId;   // 상호 승인 — 보호자 측
  guardianApprovedAt?: string;
  academyApprovedByUserId?: ID.UserId;     // 상호 승인 — 원장 측
  academyApprovedAt?: string;
  idempotencyKey: string;
  providerRefundId?: string;               // PG 환불 ID
  processingStartedAt?: string;
  completedAt?: string;
  failedAt?: string;
  failureCode?: string;
}
export interface RefundAllocation { // 환불 → 특정 PaymentAllocation 에 귀속(원생별 부분환불)
  id: ID.RefundAllocationId;
  refundId: ID.RefundId;
  paymentAllocationId: ID.PaymentAllocationId;
  invoiceId: ID.InvoiceId;
  participantId: ID.ParticipantId;
  amount: number;
}

/* --- 운영 작업 (2축: 행동완료 ≠ 문제해결) --- */
export interface OperationalTask {
  id: ID.OperationalTaskId;
  academyId: ID.AcademyId;
  title: string;
  workflowStage: WorkflowStage;
  actionResult: ActionResult;
  relatedParticipantId?: ID.ParticipantId;
  relatedSessionId?: ID.ClassSessionId;
  relatedInvoiceId?: ID.InvoiceId;
  assigneeUserId?: ID.UserId;
  dueAt?: string;
}
