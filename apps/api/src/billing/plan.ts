/* 학원 플랜 판정(#49) — 기능 게이트의 서버 진입점.
   FREE = 구독 행 없음 또는 CANCELED. PAST_DUE 는 플랜 유지(유예 — 운영을 인질로
   잡지 않는다, 전환·독촉은 구독 수납 트랙에서). 게이트 응답 = 402 PLAN_UPGRADE_REQUIRED.
   #50: 기능 예외 grant — 플랜이 부족해도 유효한 grant(미철회·미만료)가 있으면 허용.
   만료는 판정 시점 lazy(워커 불요) — 영업 "한두 달 열어주기" 패턴의 정본. */
import { and, eq, isNull } from "drizzle-orm";
import { schema as s } from "@pacefolio/db";
import {
  planAllows, FEATURE_MIN_PLAN, type PlanTier, type GatedFeature,
} from "@pacefolio/domain";
import type { Db } from "../sessions/service";

export async function getAcademyPlan(db: Db, academyId: string): Promise<PlanTier> {
  const sub = (await db.select({
    plan: s.academySubscriptions.plan, status: s.academySubscriptions.status,
  }).from(s.academySubscriptions)
    .where(eq(s.academySubscriptions.academyId, academyId)))[0];
  if (!sub) return "FREE";
  if (sub.status === "CANCELED") return "FREE";
  return sub.plan as PlanTier; // TRIAL·ACTIVE·PAST_DUE(유예) = 플랜 유지
}

export interface PlanDenied {
  error: "PLAN_UPGRADE_REQUIRED";
  feature: GatedFeature;
  currentPlan: PlanTier;
  requiredPlan: PlanTier;
}

/** 유효 grant 존재 여부 — 미철회 + (무기한 또는 미만료) */
export async function hasActiveGrant(
  db: Db, academyId: string, feature: GatedFeature, nowISO: string,
): Promise<boolean> {
  const rows = await db.select({
    id: s.academyFeatureGrants.id, expiresAt: s.academyFeatureGrants.expiresAt,
  }).from(s.academyFeatureGrants).where(and(
    eq(s.academyFeatureGrants.academyId, academyId),
    eq(s.academyFeatureGrants.feature, feature),
    isNull(s.academyFeatureGrants.revokedAt),
  ));
  return rows.some((g) => g.expiresAt == null || g.expiresAt > nowISO);
}

/** null = 허용. PlanDenied = 402 body 로 그대로 반환 가능. */
export async function checkFeature(
  db: Db, academyId: string, feature: GatedFeature, nowISO: string,
): Promise<PlanDenied | null> {
  const plan = await getAcademyPlan(db, academyId);
  if (planAllows(plan, feature)) return null;
  if (await hasActiveGrant(db, academyId, feature, nowISO)) return null; // #50 예외
  return {
    error: "PLAN_UPGRADE_REQUIRED", feature,
    currentPlan: plan, requiredPlan: FEATURE_MIN_PLAN[feature],
  };
}
