/* =========================================================
   PACEFOLIO 공유 도메인 — PG 웹훅 처리 규칙 (리뷰 R2 P0-3 · R3 P0-8)
   ---------------------------------------------------------
   중복만이 아니라 "역순 도착"까지 계약화. 마지막 이벤트로 무조건 덮지 않는다.
   R3 보완:
   - 시각 비교 = epoch ms 정규화(offset 섞인 ISO 문자열 비교 금지)
   - 파싱 불가 시각 = REJECT_INVALID
   - 결정 이름 세분화: 같은 event ID 재수신(IGNORE_ALREADY_SEEN)
     ≠ 새 이벤트지만 상태 변화 없음(ACK_NO_STATE_CHANGE)

   ⚠️ 서버 처리 원자성 계약(P0-8) — 아래는 하나의 DB 트랜잭션이어야 한다:
     1. WebhookInbox unique insert (provider, providerEventId)
     2. Payment/Refund row lock (또는 version 검사)
     3. decidePaymentWebhook 판단 → 상태 변경
     4. lastEventAt/version 갱신
     5. AuditLog 기록
     6. Domain outbox event 발행
   RECONCILE 판단 시: PG 객체 재조회 → 현재 상태·금액과 대조 후 수렴.
   ========================================================= */
import type { PaymentStatus, RefundStatus } from "./enums";
import { canTransitionPayment, canTransitionRefund } from "./state-machines";
import { toEpochMs } from "./time"; // 시간 정규화 = 공용 time 모듈로 중앙화(R4 P0-9)

export interface WebhookEvent {
  provider: string;
  providerEventId: string;
  targetStatus: PaymentStatus; // eventType 을 매핑한 목표 상태
  occurredAt: string;          // PG 이벤트 발생시각(ISO — offset 허용, epoch 로 정규화)
}

export interface PaymentSnapshot {
  status: PaymentStatus;
  lastEventAt?: string; // 마지막으로 반영된 이벤트 발생시각
}

type WebhookDecisionBase =
  | { action: "IGNORE_ALREADY_SEEN" }               // 같은 event ID 재수신(멱등)
  | { action: "ACK_NO_STATE_CHANGE" }               // 새 이벤트지만 이미 목표 상태
  | { action: "IGNORE_STALE"; reason: string }      // 발생시각 역행 — 되돌리지 않음
  | { action: "RECONCILE"; reason: string }         // 허용 안 되는 전이·동시각 상충 — PG 재조회로 수렴
  | { action: "REJECT_INVALID"; reason: string };   // 파싱 불가 등 — inbox 보존 후 수동/재처리

export type WebhookDecision = WebhookDecisionBase | { action: "APPLY"; to: PaymentStatus };
/** 환불 웹훅 결정 — Payment 와 APPLY 대상 타입이 다름(R6 P0-3) */
export type RefundWebhookDecision = WebhookDecisionBase | { action: "APPLY"; to: RefundStatus };

export function decidePaymentWebhook(
  current: PaymentSnapshot,
  event: WebhookEvent,
  seenEventIds: ReadonlySet<string>,
): WebhookDecision {
  const eid = `${event.provider}:${event.providerEventId}`;

  // 1) 같은 event ID 재수신(멱등)
  if (seenEventIds.has(eid)) return { action: "IGNORE_ALREADY_SEEN" };

  // 2) 시각 정규화 — 파싱 불가면 판단 불가
  const eventMs = toEpochMs(event.occurredAt);
  if (eventMs === null) {
    return { action: "REJECT_INVALID", reason: `occurredAt 파싱 불가: ${event.occurredAt}` };
  }

  // 3) 새 이벤트지만 이미 목표 상태 — 반영할 변화 없음(inbox 에는 기록)
  if (current.status === event.targetStatus) return { action: "ACK_NO_STATE_CHANGE" };

  // 4) 순서 판정 (R6 P0-4 보강)
  //    - 반영분보다 과거 = 되돌리지 않음(IGNORE_STALE)
  //    - 동일 발생시각의 "다른" 상태 = 순서로 우열 확정 불가 → RECONCILE
  //      (PG 가 sequence/version 을 주면 그것이 정본 — provider 어댑터에서 우선 사용)
  //    - 저장된 lastEventAt 파싱 불가 = 순서 판단 불가 → RECONCILE(fail-closed 예외 제거)
  const order = compareToLastEvent(eventMs, current.lastEventAt);
  if (order === "STALE") {
    return { action: "IGNORE_STALE", reason: "이벤트 발생시각이 반영분보다 과거(역순)" };
  }
  if (order === "AMBIGUOUS") {
    return { action: "RECONCILE", reason: "동일 발생시각의 상충 이벤트 또는 저장 시각 파싱 불가 — PG 재조회로 수렴" };
  }

  // 5) 전이 허용성 — 허용 안 되면 덮어쓰지 말고 PG 재조회
  const t = canTransitionPayment(current.status, event.targetStatus);
  if (!t.ok) {
    return { action: "RECONCILE", reason: t.error ?? "허용되지 않는 전이 — PG 재조회 필요" };
  }

  return { action: "APPLY", to: event.targetStatus };
}

/** 순서 판정: OK(진행) | STALE(과거) | AMBIGUOUS(동시각 상충·저장시각 불량 → RECONCILE) */
function compareToLastEvent(eventMs: number, lastEventAt: string | undefined): "OK" | "STALE" | "AMBIGUOUS" {
  if (!lastEventAt) return "OK";
  const lastMs = toEpochMs(lastEventAt);
  if (lastMs === null) return "AMBIGUOUS"; // 저장값 불량 — 순서 판단 불가(fail-closed)
  if (eventMs < lastMs) return "STALE";
  if (eventMs === lastMs) return "AMBIGUOUS"; // 같은 시각·다른 상태 — 도착 순서에 의존 금지
  return "OK";
}

/* ── 환불 웹훅 (R6 P0-3) — Payment 처리기와 분리된 별도 결정 함수 ──
   refund.succeeded/failed 등을 Payment 상태로 오적용하는 것을 차단.
   서버 처리 계약(하나의 트랜잭션): inbox 저장 → Refund lock →
   RefundAllocation 검증 → Refund 상태 반영 → Payment PARTIALLY_REFUNDED/
   REFUNDED 동시 반영 → Invoice 순수납 재계산 → AuditLog → Outbox. */
export interface RefundSnapshot {
  status: RefundStatus;
  lastEventAt?: string;
}
export interface RefundWebhookEvent {
  provider: string;
  providerEventId: string;
  targetStatus: RefundStatus;  // refund.succeeded→COMPLETED / refund.failed→FAILED 매핑
  occurredAt: string;
}

export function decideRefundWebhook(
  current: RefundSnapshot,
  event: RefundWebhookEvent,
  seenEventIds: ReadonlySet<string>,
): RefundWebhookDecision {
  const eid = `${event.provider}:${event.providerEventId}`;
  if (seenEventIds.has(eid)) return { action: "IGNORE_ALREADY_SEEN" };

  const eventMs = toEpochMs(event.occurredAt);
  if (eventMs === null) {
    return { action: "REJECT_INVALID", reason: `occurredAt 파싱 불가: ${event.occurredAt}` };
  }
  if (current.status === event.targetStatus) return { action: "ACK_NO_STATE_CHANGE" };

  const order = compareToLastEvent(eventMs, current.lastEventAt);
  if (order === "STALE") {
    return { action: "IGNORE_STALE", reason: "이벤트 발생시각이 반영분보다 과거(역순)" };
  }
  if (order === "AMBIGUOUS") {
    return { action: "RECONCILE", reason: "동일 발생시각의 상충 이벤트 또는 저장 시각 파싱 불가 — PG 재조회로 수렴" };
  }

  // 환불 웹훅으로 허용되는 전이만 — REQUESTED/MUTUALLY_APPROVED 로의 역행,
  // COMPLETED/REJECTED 이후 변경은 전부 RECONCILE
  const t = canTransitionRefund(current.status, event.targetStatus);
  if (!t.ok) {
    return { action: "RECONCILE", reason: t.error ?? "허용되지 않는 환불 전이 — PG 재조회 필요" };
  }
  return { action: "APPLY", to: event.targetStatus };
}
