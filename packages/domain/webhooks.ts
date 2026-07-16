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
import type { PaymentStatus } from "./enums";
import { canTransitionPayment } from "./state-machines";
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

export type WebhookDecision =
  | { action: "APPLY"; to: PaymentStatus }
  | { action: "IGNORE_ALREADY_SEEN" }               // 같은 event ID 재수신(멱등)
  | { action: "ACK_NO_STATE_CHANGE" }               // 새 이벤트지만 이미 목표 상태
  | { action: "IGNORE_STALE"; reason: string }      // 발생시각 역행 — 되돌리지 않음
  | { action: "RECONCILE"; reason: string }         // 허용 안 되는 전이 — PG 재조회로 수렴
  | { action: "REJECT_INVALID"; reason: string };   // 파싱 불가 등 — inbox 보존 후 수동/재처리

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

  // 4) 역순 도착 — 반영분보다 과거 이벤트는 최종 상태를 되돌리지 않음(epoch 비교)
  if (current.lastEventAt) {
    const lastMs = toEpochMs(current.lastEventAt);
    if (lastMs !== null && eventMs < lastMs) {
      return { action: "IGNORE_STALE", reason: "이벤트 발생시각이 반영분보다 과거(역순)" };
    }
  }

  // 5) 전이 허용성 — 허용 안 되면 덮어쓰지 말고 PG 재조회
  const t = canTransitionPayment(current.status, event.targetStatus);
  if (!t.ok) {
    return { action: "RECONCILE", reason: t.error ?? "허용되지 않는 전이 — PG 재조회 필요" };
  }

  return { action: "APPLY", to: event.targetStatus };
}
