/* 플랜 티어(#49) — FREE/BASIC/PRO 3단 (TJ 확정 2026-07-19).
   FREE = 구독의 부재(DB 행 없음·0원) — subscription_plan enum 은 BASIC|PRO 그대로.
   구분 원칙(docs/17 §A):
   ① "전화를 없애는" 운영 코어(출결·청구·결제·수납·공지·소통)는 FREE 부터 전부 —
      북극성(학부모 편한 결제 + 원장 한눈 수납)은 가두지 않는다
   ② FREE→BASIC 의 주 구분자 = 규모(원생 상한) + 대량·자동화 도구
   ③ BASIC→PRO = "학원의 격을 올리는 것"(성장·마케팅·뱃지·대회·다부문) + 원가 드는 것
   이 파일이 기능 게이트의 정본 — 화면·서버가 같은 매트릭스를 읽는다. */

export const PLAN_TIERS = ["FREE", "BASIC", "PRO"] as const;
export type PlanTier = (typeof PLAN_TIERS)[number];

export const PLAN_PRICE_KRW: Record<PlanTier, number> = {
  FREE: 0, BASIC: 29_000, PRO: 99_000,
};

export const PLAN_RANK: Record<PlanTier, number> = { FREE: 0, BASIC: 1, PRO: 2 };

/* FREE 원생 상한 — WITHDRAWN(퇴원) 제외 재적 기준 */
export const FREE_PARTICIPANT_LIMIT = 30;

/* v1 게이트 대상(서버에 실재하는 기능만 — 성장판·마케팅·대회·다부문은 구현 시 추가) */
export const GATED_FEATURES = [
  "UNLIMITED_PARTICIPANTS", // 원생 무제한 — FREE 는 30명 상한
  "BULK_BILLING",       // 반 일괄 청구(초안 전수→일괄 발행)
  "AUTO_DUNNING",       // 자동 미납 타임라인(D-3·당일·D+3·D+7) — 수동 리마인드는 FREE 부터
  "PROGRAM_IMPORT",     // 프로그램 CSV 가져오기(스테이징·커밋)
  "PROGRAM_DUPLICATE",  // 프로그램 복제
  "BADGE_SYSTEM",       // 뱃지 정의·발급(스킬·클리어 기본 기록은 전 플랜)
] as const;
export type GatedFeature = (typeof GATED_FEATURES)[number];

export const FEATURE_MIN_PLAN: Record<GatedFeature, PlanTier> = {
  UNLIMITED_PARTICIPANTS: "BASIC",
  BULK_BILLING: "BASIC",
  AUTO_DUNNING: "PRO",
  PROGRAM_IMPORT: "PRO",
  PROGRAM_DUPLICATE: "PRO",
  BADGE_SYSTEM: "PRO",
};

/* 기능 예외(grant) 라벨 — admin 콘솔 표시용(정본은 GATED_FEATURES) */
export const FEATURE_LABEL_KO: Record<GatedFeature, string> = {
  UNLIMITED_PARTICIPANTS: "원생 무제한",
  BULK_BILLING: "반 일괄 청구",
  AUTO_DUNNING: "자동 미납 타임라인",
  PROGRAM_IMPORT: "프로그램 CSV 가져오기",
  PROGRAM_DUPLICATE: "프로그램 복제",
  BADGE_SYSTEM: "뱃지 시스템",
};

export function planAllows(plan: PlanTier, feature: GatedFeature): boolean {
  return PLAN_RANK[plan] >= PLAN_RANK[FEATURE_MIN_PLAN[feature]];
}
