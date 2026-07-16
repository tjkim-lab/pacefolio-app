/* =========================================================
   PACEFOLIO 공유 도메인 — 동의 · 개인정보 (F12, 리뷰 R2 P0-9)
   ---------------------------------------------------------
   ⚠️ 이전 취약점: allowedPurpose[]·allowedAudience[] 독립 저장 →
      동의하지 않은 목적×대상 교차조합까지 허용됨.
   수정: 허용 "조합"을 grant 로 저장(purpose × audience 쌍). + 정책버전·증적.
   ========================================================= */
import type { ConsentPurpose, ConsentAudience, PrivacyVisibility } from "./enums";
import type {
  ConsentRecordId, ConsentPolicyId, GuardianId, ParticipantId, AcademyId,
} from "./ids";

/** 허용된 목적×대상 조합 하나. */
export interface ConsentGrant {
  purpose: ConsentPurpose;
  audience: ConsentAudience;
}

/** 사진 동의 기록(증적 포함). 목적/대상은 grants 쌍으로만 허용. */
export interface PhotoConsentRecord {
  id: ConsentRecordId;
  policyId: ConsentPolicyId;
  policyVersion: string;
  academyId: AcademyId;
  guardianId: GuardianId;
  participantId: ParticipantId;
  grants: readonly ConsentGrant[];
  consentedAt: string;         // ISO
  channel: string;             // 동의 획득 채널(앱/서면 등)
  revokedAt?: string | null;   // 철회 시각
  revokedByGuardianId?: GuardianId;
  expiresAt?: string | null;   // 만료 시각
}

/** 사진 발송·공개 시점 재검증(리뷰 R2 P0-9).
   철회·만료 + 정확한 목적×대상 조합(grant)을 매 발송마다 서버가 확인. */
export function canSendPhoto(
  c: PhotoConsentRecord,
  purpose: ConsentPurpose,
  audience: ConsentAudience,
  nowISO: string,
): boolean {
  if (c.revokedAt) return false;
  if (c.expiresAt && c.expiresAt <= nowISO) return false;
  // 정확히 동의한 조합만 — 목적/대상 독립 매칭 금지(교차조합 차단)
  return c.grants.some((g) => g.purpose === purpose && g.audience === audience);
}

/** 민감 필드의 고정 공개범위(리뷰 4-2). 사용자가 "전체공개"로 확대 불가. */
export const SENSITIVE_FIELD_VISIBILITY: Record<string, PrivacyVisibility> = {
  coachPhone: "ACADEMY_ADMIN",
  guardianPhone: "ACADEMY_ADMIN",
  participantBirth: "LINKED_GUARDIANS",
  healthInfo: "ASSIGNED_COACH",
  paymentAmount: "LINKED_GUARDIANS",
  photoConsent: "ACADEMY_ADMIN",
};

/** 이 필드를 사용자가 임의 공개범위로 바꿀 수 있나 → 민감필드는 불가. */
export function isUserOverridable(field: string): boolean {
  return !(field in SENSITIVE_FIELD_VISIBILITY);
}
