/* =========================================================
   추적·마케팅 동의 목적 분리 (마케팅 리뷰 A-9)
   제품 분석과 광고 귀속을 같은 동의로 묶지 않는다.
   consent state 확정 전 마케팅 SDK 실행 금지.
   외부 광고 플랫폼 전송은 별도 법률 검토 필요(개보위 제재 사례 있음).
   ========================================================= */

export const TRACKING_CONSENT_PURPOSE = [
  "ESSENTIAL",               // 서비스 제공·보안 필수 — 거부 불가
  "PRODUCT_ANALYTICS",       // 기능 사용성·제품 개선
  "MARKETING_ATTRIBUTION",   // 캠페인·유입·전환 분석
  "PERSONALIZED_MARKETING",  // 개인 맞춤형 홍보
  "EXTERNAL_AD_PLATFORM",    // 외부 광고 플랫폼 전송 — 별도 opt-in
] as const;
export type TrackingConsentPurpose = (typeof TRACKING_CONSENT_PURPOSE)[number];

export interface TrackingConsentState {
  policyVersion: string;
  grantedPurposes: readonly TrackingConsentPurpose[]; // ESSENTIAL 은 항상 포함
  updatedAt: string;
}

/** 이 목적의 수집이 허용되는가 — 이벤트 발신 전 게이트. */
export function isTrackingAllowed(
  state: TrackingConsentState,
  purpose: TrackingConsentPurpose,
): boolean {
  if (purpose === "ESSENTIAL") return true;
  return state.grantedPurposes.includes(purpose);
}
