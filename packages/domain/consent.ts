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
  PhotoAssetId,
} from "./ids";
import { credentialExpired } from "./time";

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
  // 만료 명시된 동의만 만료 검사(epoch·fail-closed — 형식 불량이면 거부)
  if (c.expiresAt && credentialExpired(c.expiresAt, nowISO)) return false;
  // 정확히 동의한 조합만 — 목적/대상 독립 매칭 금지(교차조합 차단)
  return c.grants.some((g) => g.purpose === purpose && g.audience === audience);
}

/* =========================================================
   자산(개별 사진) 단위 동의 검증 — B4 잔여
   ---------------------------------------------------------
   canSendPhoto 는 동의기록 1건을 본다. 그러나 사진 1장(PhotoAsset)에는
   여러 원생이 등장할 수 있다(단체사진). 발송·공유는 **등장 원생 전원**이
   해당 목적×대상에 유효 동의했을 때만 허용한다.
   근거: docs/02-entity-model.md F(asset/participant별·재검증),
        docs/marketing/SHARE-PRIVACY-SPEC.md 2·3
        (asset별 재검증 · 미동의 타 원생은 제거하거나 추가 동의).
   ========================================================= */

/** 개별 사진 자산. 등장(식별 가능)하는 원생 전원을 명시한다. */
export interface PhotoAsset {
  id: PhotoAssetId;
  academyId: AcademyId;
  /** 이 사진에 등장하는 원생 전원. 단체사진이면 다수. */
  depictedParticipantIds: readonly ParticipantId[];
}

/** 자산 발송 판정 결과. 차단 시 어떤 원생이 막는지 식별해
   파생이미지에서 제거하거나 추가 동의를 유도할 수 있게 한다. */
export interface PhotoAssetSendDecision {
  allowed: boolean;
  /** 유효 동의가 없어 발송을 막는 원생(제거 또는 추가 동의 대상). */
  blockedParticipantIds: readonly ParticipantId[];
}

/** 자산 단위 발송·공유 게이트.
   등장 원생마다 같은 학원의 유효 동의(canSendPhoto)를 재검증한다.
   - 한 명이라도 미동의 → allowed=false, 막는 원생 전원 반환
   - 테넌트 무결성: 다른 학원의 동의기록/참여자는 절대 인정하지 않음
   - 등장 원생이 없으면 게이트할 대상이 없으므로 허용(파생·풍경 등) */
export function canSendPhotoAsset(
  asset: PhotoAsset,
  consents: readonly PhotoConsentRecord[],
  purpose: ConsentPurpose,
  audience: ConsentAudience,
  nowISO: string,
): PhotoAssetSendDecision {
  const blocked: ParticipantId[] = [];
  // 중복 등장 방지(같은 원생 두 번 → 판정·목록 왜곡)
  const uniqueParticipants = [...new Set(asset.depictedParticipantIds)];

  for (const participantId of uniqueParticipants) {
    // 같은 학원 + 같은 원생의 동의기록 중 하나라도 조합을 허용하면 통과.
    const hasValidConsent = consents.some(
      (c) =>
        c.academyId === asset.academyId &&
        c.participantId === participantId &&
        canSendPhoto(c, purpose, audience, nowISO),
    );
    if (!hasValidConsent) blocked.push(participantId);
  }

  return { allowed: blocked.length === 0, blockedParticipantIds: blocked };
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
