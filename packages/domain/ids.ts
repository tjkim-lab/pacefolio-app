/* =========================================================
   PACEFOLIO 공유 도메인 — 엔티티 식별자(ID)
   ---------------------------------------------------------
   리뷰 2026-07-16 P0-2: 상태·관계·API는 항상 ID 기준.
   화면에만 이름 표시. (예: invStatus[childName] ❌ → invoiceStatus[InvoiceId] ✅)

   Branded type으로 서로 다른 ID를 컴파일 단계에서 구분한다.
   (AcademyId 자리에 ParticipantId를 실수로 넣으면 타입 에러)

   ⚠️ 헌법: DB 아님. 프론트 mock과 미래 API가 공유할 "모델 계약"일 뿐.
   장기 목표(B 아키텍처)에서 이 파일은 packages/domain 으로 승격.
   ========================================================= */

export type Brand<T, B extends string> = T & { readonly __brand: B };

/* --- 조직 · 계정 --- */
export type OrganizationId = Brand<string, "OrganizationId">;
export type AcademyId = Brand<string, "AcademyId">;
export type UserId = Brand<string, "UserId">;
export type AcademyMembershipId = Brand<string, "AcademyMembershipId">; // 사용자 × 학원 × 역할
export type UserSessionId = Brand<string, "UserSessionId">;

/* --- 사람 · 관계 --- */
export type ParticipantId = Brand<string, "ParticipantId">; // 원생(아이, 계정 없음)
export type GuardianId = Brand<string, "GuardianId">;       // 보호자(= User의 한 역할)
export type GuardianParticipantLinkId = Brand<string, "GuardianParticipantLinkId">; // 보호자↔자녀 N:M
export type GuardianVerificationId = Brand<string, "GuardianVerificationId">;       // OTP·관계 검증
export type GuardianInviteRedemptionId = Brand<string, "GuardianInviteRedemptionId">; // 초대코드 소비 기록(R4 P0-5)

/* --- 수업 · 등록 --- */
export type ProgramId = Brand<string, "ProgramId">;
export type ClassId = Brand<string, "ClassId">;
export type ClassSessionId = Brand<string, "ClassSessionId">; // 개별 회차(날짜 있는 수업 1회)
export type EnrollmentId = Brand<string, "EnrollmentId">;
export type ClassAssignmentId = Brand<string, "ClassAssignmentId">; // 코치 담당 배정

/* --- 출결 (예정 ≠ 실제, 리뷰 3-4) --- */
export type AttendanceNoticeId = Brand<string, "AttendanceNoticeId">; // 보호자 통보(예정)
export type AttendanceRecordId = Brand<string, "AttendanceRecordId">; // 코치 확정(실제)
export type AttendanceRevisionId = Brand<string, "AttendanceRevisionId">; // 정정 이력

/* --- 청구 · 결제 · 환불 (리뷰 3-5, P0-5) --- */
export type BillingPeriodId = Brand<string, "BillingPeriodId">; // 수납기간(YYYY-MM-DD ~)
export type InvoiceId = Brand<string, "InvoiceId">;            // 원생·등록·수납기간 단위
export type InvoiceLineId = Brand<string, "InvoiceLineId">;    // 수강료·차량비·할인·기타
export type PaymentId = Brand<string, "PaymentId">;           // 보호자 합산 결제 1건
export type PaymentAllocationId = Brand<string, "PaymentAllocationId">; // 결제→원생별 배분
export type RefundId = Brand<string, "RefundId">;
export type RefundAllocationId = Brand<string, "RefundAllocationId">; // 환불→PaymentAllocation 기준 귀속
export type IdempotencyRecordId = Brand<string, "IdempotencyRecordId">; // 멱등 재시도 레코드

/* --- 동의 · 개인정보 (리뷰 P0-7, 4-1) --- */
export type ConsentPolicyId = Brand<string, "ConsentPolicyId">;
export type ConsentRecordId = Brand<string, "ConsentRecordId">;
export type PhotoConsentId = Brand<string, "PhotoConsentId">;
export type PhotoAssetId = Brand<string, "PhotoAssetId">;

/* --- 알림 --- */
export type NotificationId = Brand<string, "NotificationId">;
export type NotificationPreferenceId = Brand<string, "NotificationPreferenceId">;
export type CalendarSubscriptionId = Brand<string, "CalendarSubscriptionId">;

/* --- 운영 · 관리자 --- */
export type OperationalTaskId = Brand<string, "OperationalTaskId">;
export type SupportTicketId = Brand<string, "SupportTicketId">;
export type SupportViewSessionId = Brand<string, "SupportViewSessionId">; // 읽기전용·15분·감사
export type AuditLogId = Brand<string, "AuditLogId">;

/* --- 계정 라이프사이클 (리뷰#2 P0-5) --- */
export type MembershipExitRequestId = Brand<string, "MembershipExitRequestId">; // 학원 나가기
export type AccountDeletionRequestId = Brand<string, "AccountDeletionRequestId">; // 계정 탈퇴

/* --- 온보딩 (리뷰#2 P1-3) --- */
export type OnboardingChecklistId = Brand<string, "OnboardingChecklistId">;
export type OnboardingStepId = Brand<string, "OnboardingStepId">;

/* --- 도메인 이벤트 (리뷰 P0-3) --- */
export type DomainEventId = Brand<string, "DomainEventId">;

/* 문자열을 특정 ID로 캐스팅 (fixture·mock 작성용).
   런타임 검증은 하지 않는다 — 어디까지나 타입 표식. */
export const asId = <T extends Brand<string, string>>(raw: string): T => raw as T;
