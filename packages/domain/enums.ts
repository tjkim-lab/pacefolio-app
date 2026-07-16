/* =========================================================
   PACEFOLIO 공유 도메인 — 열거값 · 상태
   두 리뷰(2026-07-16)가 요구한 상태 정의를 한 곳에.
   패턴: `as const` 배열 + 파생 union 타입 (런타임 순회 + 컴파일 안전 동시).
   ⚠️ DB 아님. 프론트·미래 API 공유 계약.
   ========================================================= */

/* --- 역할 (리뷰#2 4-4: Owner·Manager·Coach·Desk·Driver + 보호자 + 플랫폼) --- */
export const ROLES = [
  "OWNER", "MANAGER", "COACH", "DESK", "DRIVER", "GUARDIAN", "PLATFORM_ADMIN",
] as const;
export type Role = (typeof ROLES)[number];

/* --- 학원 멤버십 상태 (리뷰#2 P0-1·6: User 하나에 여러 학원 소속) --- */
export const MEMBERSHIP_STATUS = ["INVITED", "ACTIVE", "SUSPENDED", "ENDED"] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUS)[number];

/* --- 운영 작업 흐름 (리뷰 3-3: "행동 완료" ≠ "문제 해결") --- */
export const WORKFLOW_STAGE = ["NEEDS_ACTION", "IN_PROGRESS", "RESOLVED"] as const;
export type WorkflowStage = (typeof WORKFLOW_STAGE)[number];

export const ACTION_RESULT = ["NOT_STARTED", "SENT", "ACKNOWLEDGED", "FAILED"] as const;
export type ActionResult = (typeof ACTION_RESULT)[number];
// 예: 결제 리마인드 = { stage: IN_PROGRESS, result: SENT } (발송했으나 미납 미해결)

/* --- 출결: 예정(보호자 통보) --- */
export const ATTENDANCE_NOTICE_TYPE = ["ABSENCE", "LATE", "EARLY_LEAVE"] as const;
export type AttendanceNoticeType = (typeof ATTENDANCE_NOTICE_TYPE)[number];

/* --- 출결: 실제(코치 확정) — 예정과 절대 합치지 않는다 (리뷰 3-4) --- */
export const ATTENDANCE_RECORD_STATUS = [
  "PRESENT", "ABSENT", "LATE", "EARLY_LEAVE", "EXCUSED",
] as const;
export type AttendanceRecordStatus = (typeof ATTENDANCE_RECORD_STATUS)[number];

/* --- 청구서 상태머신 (리뷰 P0-5) --- */
export const INVOICE_STATUS = [
  "DRAFT", "ISSUED", "PARTIALLY_PAID", "PAID", "OVERDUE", "VOID", "REFUNDED",
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUS)[number];

/* --- 결제 상태머신 (UI 성공 ≠ PG 최종승인, 리뷰 P0-5) --- */
export const PAYMENT_STATUS = [
  "PENDING", "AUTHORIZED", "CAPTURED", "FAILED", "CANCELLED",
  "PARTIALLY_REFUNDED", "REFUNDED",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUS)[number];

/* --- 환불 상태머신 (학부모+원장 상호 승인, 헌법) --- */
export const REFUND_STATUS = [
  "REQUESTED", "MUTUALLY_APPROVED", "PROCESSING", "COMPLETED", "REJECTED",
] as const;
export type RefundStatus = (typeof REFUND_STATUS)[number];

/* --- 보호자-자녀 관계 · 검증 (리뷰#2 P0-2) --- */
export const RELATIONSHIP_TYPE = [
  "MOTHER", "FATHER", "GRANDPARENT", "LEGAL_GUARDIAN", "OTHER",
] as const;
export type RelationshipType = (typeof RELATIONSHIP_TYPE)[number];

export const VERIFICATION_METHOD = ["PHONE_OTP", "ACADEMY_INVITE_CODE", "ACADEMY_MANUAL"] as const;
export type VerificationMethod = (typeof VERIFICATION_METHOD)[number];

export const VERIFICATION_STATUS = ["UNVERIFIED", "PENDING", "VERIFIED", "REJECTED"] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUS)[number];

/* --- 개인정보 공개 범위 (리뷰#2 4-2: SNS식 Everyone 금지, 시스템 정책으로 제한) --- */
export const PRIVACY_VISIBILITY = [
  "SELF",
  "ACADEMY_ADMIN",
  "ASSIGNED_COACH",
  "CLASS_GUARDIANS",
  "LINKED_GUARDIANS",
  "PLATFORM_SUPPORT_SESSION_ONLY", // 지원 세션 중에만
] as const;
export type PrivacyVisibility = (typeof PRIVACY_VISIBILITY)[number];

/* --- 사진 동의: 목적 · 대상 (리뷰 P0-7) --- */
export const CONSENT_PURPOSE = [
  "INDIVIDUAL_DELIVERY", "CLASS_SHARE", "INTERNAL_RECORD",
  "ACADEMY_PROMOTION", "EXTERNAL_AD", "SNS_POST",
] as const;
export type ConsentPurpose = (typeof CONSENT_PURPOSE)[number];

export const CONSENT_AUDIENCE = [
  "GUARDIAN_ONLY", "CLASS_MEMBERS", "ACADEMY_INTERNAL", "PUBLIC",
] as const;
export type ConsentAudience = (typeof CONSENT_AUDIENCE)[number];

/* --- 알림 카테고리 (리뷰#2 P0-3) --- */
export const NOTIFICATION_CATEGORY = [
  "SCHEDULE", "ATTENDANCE", "BILLING_DUE", "AUTOPAY_RESULT", "REFUND",
  "COACH_MESSAGE", "ACADEMY_NOTICE", "PHOTO_REPORT", "SAFETY_INCIDENT",
  "COMPETITION_EVENT", "PROMOTION",
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORY)[number];

export const NOTIFICATION_CHANNEL = ["PUSH", "KAKAO_ALIMTALK", "SMS", "EMAIL", "IN_APP"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNEL)[number];

/* 필수/선택/홍보 — 절대 섞지 않는다. 필수(안전사고·결제실패)는 사용자가 끌 수 없음. */
export const NOTIFICATION_TIER = ["REQUIRED", "OPTIONAL", "PROMOTIONAL"] as const;
export type NotificationTier = (typeof NOTIFICATION_TIER)[number];

/* --- 부문 (헌법: 브레인/액티브) --- */
export const DIVISION = ["BRAIN", "ACTIVE"] as const;
export type Division = (typeof DIVISION)[number];

/* --- 도메인 이벤트 타입 (리뷰 P0-3: 앱 간 흐름) --- */
export const DOMAIN_EVENT_TYPE = [
  "ATTENDANCE_NOTICE_CREATED",
  "OWNER_TASK_CREATED",
  "COACH_ROSTER_UPDATED",
  "ACTUAL_ATTENDANCE_RECORDED",
  "OWNER_TASK_RESOLVED",
  "GUARDIAN_NOTIFIED",
  "INVOICE_ISSUED",
  "PAYMENT_CAPTURED",
  "REFUND_COMPLETED",
] as const;
export type DomainEventType = (typeof DOMAIN_EVENT_TYPE)[number];

/* --- 수납 주기(개월). 헌법 기본 = 분기(3). --- */
export const BILLING_CYCLE_MONTHS = [1, 3] as const;
export type BillingCycleMonths = (typeof BILLING_CYCLE_MONTHS)[number];
