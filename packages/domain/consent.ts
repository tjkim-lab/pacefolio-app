/* =========================================================
   PACEFOLIO 공유 도메인 — 동의 · 개인정보 (F12, 리뷰 P0-7·4-1·4-2)
   사진 발송 재검증 + 민감필드 공개범위(사용자 임의 확대 불가).
   ========================================================= */
import type { ConsentPurpose, ConsentAudience, PrivacyVisibility } from "./enums";

export interface PhotoConsentState {
  allowedPurpose: readonly ConsentPurpose[];
  allowedAudience: readonly ConsentAudience[];
  revokedAt?: string | null;   // 철회 시각(ISO) — 있으면 차단
  expiresAt?: string | null;   // 만료 시각(ISO)
}

/** 사진 발송·공개 시점 재검증(리뷰 P0-7).
   철회·만료·목적/대상 범위를 매 발송·범위확대마다 서버가 확인. */
export function canSendPhoto(
  c: PhotoConsentState,
  purpose: ConsentPurpose,
  audience: ConsentAudience,
  nowISO: string,
): boolean {
  if (c.revokedAt) return false;
  if (c.expiresAt && c.expiresAt <= nowISO) return false;
  return c.allowedPurpose.includes(purpose) && c.allowedAudience.includes(audience);
}

/** 민감 필드의 고정 공개범위(리뷰 4-2). 사용자가 "전체공개"로 확대 불가. */
export const SENSITIVE_FIELD_VISIBILITY: Record<string, PrivacyVisibility> = {
  coachPhone: "ACADEMY_ADMIN",        // 원장·승인 관리자만(그 외 중계전화)
  guardianPhone: "ACADEMY_ADMIN",
  participantBirth: "LINKED_GUARDIANS",
  healthInfo: "ASSIGNED_COACH",       // 담당코치·원장·안전담당 최소인원(+조회기록)
  paymentAmount: "LINKED_GUARDIANS",  // 보호자(본인)·원장·수납담당
  photoConsent: "ACADEMY_ADMIN",
};

/** 이 필드를 사용자가 임의 공개범위로 바꿀 수 있나 → 민감필드는 불가. */
export function isUserOverridable(field: string): boolean {
  return !(field in SENSITIVE_FIELD_VISIBILITY);
}
