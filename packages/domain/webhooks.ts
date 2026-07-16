/* =========================================================
   PACEFOLIO 공유 도메인 — PG 웹훅 처리 규칙 (리뷰 R2 P0-3)
   ---------------------------------------------------------
   중복만이 아니라 "역순 도착"까지 계약화. 마지막 이벤트로 무조건 덮지 않는다.
   - (provider, providerEventId) 중복 → 무시
   - 발생시각 역행(현재보다 과거) → stale 무시(monotonic guard)
   - 허용되지 않는 전이(FAILED→CAPTURED, 종결 회귀 등) → PG 재조회(RECONCILE)
   실제 상태 변경은 재조회 결과와 reconcile 후 트랜잭션으로.
   ========================================================= */
import type { PaymentStatus } from "./enums";
import { canTransitionPayment } from "./state-machines";

export interface WebhookEvent {
  provider: string;
  providerEventId: string;
  targetStatus: PaymentStatus; // eventType 을 매핑한 목표 상태
  occurredAt: string;          // PG 이벤트 발생시각(ISO)
}

export interface PaymentSnapshot {
  status: PaymentStatus;
  lastEventAt?: string; // 마지막으로 반영된 이벤트 발생시각
}

export type WebhookDecision =
  | { action: "APPLY"; to: PaymentStatus }
  | { action: "IGNORE_DUPLICATE" }
  | { action: "IGNORE_STALE"; reason: string }
  | { action: "RECONCILE"; reason: string }; // PG 재조회 후 수렴

export function decidePaymentWebhook(
  current: PaymentSnapshot,
  event: WebhookEvent,
  seenEventIds: ReadonlySet<string>,
): WebhookDecision {
  const eid = `${event.provider}:${event.providerEventId}`;

  // 1) 중복(멱등)
  if (seenEventIds.has(eid)) return { action: "IGNORE_DUPLICATE" };

  // 2) 이미 목표 상태면 재적용 불필요
  if (current.status === event.targetStatus) return { action: "IGNORE_DUPLICATE" };

  // 3) 역순 도착 — 현재 반영시각보다 과거 이벤트는 최종 상태를 되돌리지 않음
  if (current.lastEventAt && event.occurredAt < current.lastEventAt) {
    return { action: "IGNORE_STALE", reason: "이벤트 발생시각이 반영분보다 과거(역순)" };
  }

  // 4) 전이 허용성 — 허용 안 되면 덮어쓰지 말고 PG 재조회
  const t = canTransitionPayment(current.status, event.targetStatus);
  if (!t.ok) {
    return { action: "RECONCILE", reason: t.error ?? "허용되지 않는 전이 — PG 재조회 필요" };
  }

  return { action: "APPLY", to: event.targetStatus };
}
