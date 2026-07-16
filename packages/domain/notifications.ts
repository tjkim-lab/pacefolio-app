/* =========================================================
   PACEFOLIO 공유 도메인 — 알림 정책 (F11, 리뷰#2 P0-3)
   카테고리별 등급(필수/선택/홍보). 필수는 사용자가 끌 수 없다.
   ========================================================= */
import type { NotificationCategory, NotificationTier } from "./enums";

/** 카테고리 → 등급. 안전사고·결제(실패/청구/환불)는 REQUIRED = 끌 수 없음. */
const TIER: Record<NotificationCategory, NotificationTier> = {
  SAFETY_INCIDENT: "REQUIRED",
  AUTOPAY_RESULT: "REQUIRED",   // 자동결제 실패 등
  BILLING_DUE: "REQUIRED",
  REFUND: "REQUIRED",
  SCHEDULE: "OPTIONAL",
  ATTENDANCE: "OPTIONAL",
  COACH_MESSAGE: "OPTIONAL",
  ACADEMY_NOTICE: "OPTIONAL",
  PHOTO_REPORT: "OPTIONAL",
  COMPETITION_EVENT: "OPTIONAL",
  PROMOTION: "PROMOTIONAL",
};

export function tierOf(cat: NotificationCategory): NotificationTier {
  return TIER[cat];
}

/** 사용자가 이 카테고리를 끌 수 있나. REQUIRED = 불가(리뷰#2 P0-3). */
export function canMute(cat: NotificationCategory): boolean {
  return TIER[cat] !== "REQUIRED";
}

/** 홍보 알림 여부 — 필수/선택과 반드시 분리 표시. */
export function isPromotional(cat: NotificationCategory): boolean {
  return TIER[cat] === "PROMOTIONAL";
}
