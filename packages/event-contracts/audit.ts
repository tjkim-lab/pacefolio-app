/* =========================================================
   PACEFOLIO 이벤트 계약 — 감사/보안 이벤트 (마케팅 리뷰 A-2)
   목적·보관·접근권한이 분석 이벤트와 다르다(OWASP 로그 분리 원칙).
   분석 파이프라인으로 보내지 않는다 — 감사 저장소 전용, 감사 정본.
   ========================================================= */

export const AUDIT_EVENT_TYPE = [
  "SUPPORT_VIEW_STARTED",
  "SUPPORT_VIEW_ENDED",
  "SENSITIVE_FIELD_UNMASKED",
  "CONSENT_GRANTED",
  "CONSENT_REVOKED",
  "PERMISSION_DENIED",
  "SESSION_REVOKED_ALL",
  "ACCOUNT_DELETION_REQUESTED",
  "ADMIN_MFA_VERIFIED",
] as const;
export type AuditEventType = (typeof AUDIT_EVENT_TYPE)[number];

export interface AuditEvent {
  eventId: string;
  type: AuditEventType;
  actorUserId: string;
  academyId?: string;
  targetType?: string;   // 예: participant / invoice / supportViewSession
  targetId?: string;
  reasonCode?: string;   // Support View 등 사유 필수 작업
  occurredAt: string;    // ISO
  requestId?: string;
  metadata?: Record<string, string>; // 최소한으로 — 민감 원문 금지
}
