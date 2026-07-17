/* PG 웹훅: 중복·역순·재조회·시간 정규화 (리뷰 R2 P0-3 · R3 P0-8 · R6 P0-3/4) */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decidePaymentWebhook, decideRefundWebhook,
  type WebhookEvent, type PaymentSnapshot, type RefundSnapshot,
} from "../webhooks";
import { toEpochMs } from "../time";

const ev = (over: Partial<WebhookEvent>): WebhookEvent => ({
  provider: "tosspay", providerEventId: "e1", targetStatus: "CAPTURED",
  occurredAt: "2026-07-20T10:00:00Z", ...over,
});

test("정상: AUTHORIZED → CAPTURED APPLY", () => {
  const cur: PaymentSnapshot = { status: "AUTHORIZED", lastEventAt: "2026-07-20T09:00:00Z" };
  assert.equal(decidePaymentWebhook(cur, ev({}), new Set()).action, "APPLY");
});

test("같은 event ID 재수신 → IGNORE_ALREADY_SEEN(멱등)", () => {
  const cur: PaymentSnapshot = { status: "AUTHORIZED" };
  assert.equal(decidePaymentWebhook(cur, ev({}), new Set(["tosspay:e1"])).action, "IGNORE_ALREADY_SEEN");
});

test("R3: 새 이벤트지만 이미 목표 상태 → ACK_NO_STATE_CHANGE(ALREADY_SEEN 과 구분)", () => {
  const cur: PaymentSnapshot = { status: "CAPTURED" };
  assert.equal(decidePaymentWebhook(cur, ev({ providerEventId: "e2" }), new Set()).action, "ACK_NO_STATE_CHANGE");
});

test("역순: CAPTURED 반영 후 과거 AUTHORIZED 이벤트 → IGNORE_STALE", () => {
  const cur: PaymentSnapshot = { status: "CAPTURED", lastEventAt: "2026-07-20T10:00:00Z" };
  const d = decidePaymentWebhook(cur, ev({ providerEventId: "e_old", targetStatus: "AUTHORIZED", occurredAt: "2026-07-20T09:00:00Z" }), new Set());
  assert.equal(d.action, "IGNORE_STALE");
});

test("R3: timezone offset 섞여도 실제 시간으로 역순 판정(문자열 비교 금지)", () => {
  // "2026-07-20T18:30:00+09:00" = 09:30Z — 문자열로는 "18:30" > "10:00" 이지만 실제로는 과거
  const cur: PaymentSnapshot = { status: "CAPTURED", lastEventAt: "2026-07-20T10:00:00Z" };
  const d = decidePaymentWebhook(cur, ev({ providerEventId: "e_kst", targetStatus: "AUTHORIZED", occurredAt: "2026-07-20T18:30:00+09:00" }), new Set());
  assert.equal(d.action, "IGNORE_STALE");
  assert.equal(toEpochMs("2026-07-20T18:30:00+09:00"), toEpochMs("2026-07-20T09:30:00Z"));
});

test("R3: 파싱 불가 시각 → REJECT_INVALID(inbox 보존 후 수동/재처리)", () => {
  const cur: PaymentSnapshot = { status: "AUTHORIZED" };
  assert.equal(decidePaymentWebhook(cur, ev({ occurredAt: "not-a-date" }), new Set()).action, "REJECT_INVALID");
});

test("역순: payment.failed 반영 후 늦게 도착한 captured → RECONCILE(PG 재조회)", () => {
  const cur: PaymentSnapshot = { status: "FAILED", lastEventAt: "2026-07-20T09:00:00Z" };
  assert.equal(decidePaymentWebhook(cur, ev({ providerEventId: "e_cap" }), new Set()).action, "RECONCILE");
});

test("종결 회귀 금지: REFUNDED 후 CAPTURED → RECONCILE", () => {
  const cur: PaymentSnapshot = { status: "REFUNDED", lastEventAt: "2026-07-25T00:00:00Z" };
  const d = decidePaymentWebhook(cur, ev({ providerEventId: "e_x", occurredAt: "2026-07-26T00:00:00Z" }), new Set());
  assert.equal(d.action, "RECONCILE");
});

/* ── R6 P0-4: 동일 시각·저장 시각 불량 = 순서 의존 금지 ── */

test("R6: 동일 발생시각의 다른 상태(failed vs captured) → 도착 순서 무관 RECONCILE", () => {
  // failed(10:00) 반영 후 같은 10:00 의 captured — 순서로 우열 확정 불가
  const cur: PaymentSnapshot = { status: "FAILED", lastEventAt: "2026-07-20T10:00:00Z" };
  const d = decidePaymentWebhook(cur, ev({ providerEventId: "e_same", targetStatus: "CAPTURED", occurredAt: "2026-07-20T10:00:00Z" }), new Set());
  assert.equal(d.action, "RECONCILE");
  // 반대 순서(captured 반영 후 같은 시각 failed)도 동일하게 RECONCILE — 순서 독립성
  const cur2: PaymentSnapshot = { status: "CAPTURED", lastEventAt: "2026-07-20T10:00:00Z" };
  const d2 = decidePaymentWebhook(cur2, ev({ providerEventId: "e_same2", targetStatus: "FAILED", occurredAt: "2026-07-20T10:00:00Z" }), new Set());
  assert.equal(d2.action, "RECONCILE");
});

test("R6: 저장된 lastEventAt 파싱 불가 → stale 검사 건너뛰지 않고 RECONCILE(fail-closed)", () => {
  const cur: PaymentSnapshot = { status: "AUTHORIZED", lastEventAt: "corrupted" };
  assert.equal(decidePaymentWebhook(cur, ev({ providerEventId: "e_c" }), new Set()).action, "RECONCILE");
});

/* ── R6 P0-3: 환불 웹훅 별도 처리기 ── */

const rev = (over: Partial<Parameters<typeof decideRefundWebhook>[1]>) => ({
  provider: "tosspay", providerEventId: "r1", targetStatus: "COMPLETED" as const,
  occurredAt: "2026-07-20T10:00:00Z", ...over,
});

test("환불: PROCESSING → COMPLETED APPLY / FAILED APPLY / UNKNOWN APPLY", () => {
  const cur: RefundSnapshot = { status: "PROCESSING", lastEventAt: "2026-07-20T09:00:00Z" };
  assert.equal(decideRefundWebhook(cur, rev({}), new Set()).action, "APPLY");
  assert.equal(decideRefundWebhook(cur, rev({ providerEventId: "r2", targetStatus: "FAILED" }), new Set()).action, "APPLY");
  assert.equal(decideRefundWebhook(cur, rev({ providerEventId: "r3", targetStatus: "UNKNOWN" }), new Set()).action, "APPLY");
});

test("환불: 종결(COMPLETED) 후 다른 상태 이벤트 → RECONCILE (되돌리기 금지)", () => {
  const cur: RefundSnapshot = { status: "COMPLETED", lastEventAt: "2026-07-20T10:00:00Z" };
  const d = decideRefundWebhook(cur, rev({ providerEventId: "r4", targetStatus: "FAILED", occurredAt: "2026-07-20T11:00:00Z" }), new Set());
  assert.equal(d.action, "RECONCILE");
});

test("환불: 중복 event ID·이미 목표 상태·역순·동시각 — Payment 와 동일 규칙", () => {
  const cur: RefundSnapshot = { status: "PROCESSING", lastEventAt: "2026-07-20T10:00:00Z" };
  assert.equal(decideRefundWebhook(cur, rev({}), new Set(["tosspay:r1"])).action, "IGNORE_ALREADY_SEEN");
  assert.equal(decideRefundWebhook({ status: "COMPLETED" }, rev({ providerEventId: "r5" }), new Set()).action, "ACK_NO_STATE_CHANGE");
  assert.equal(decideRefundWebhook(cur, rev({ providerEventId: "r6", occurredAt: "2026-07-20T09:00:00Z" }), new Set()).action, "IGNORE_STALE");
  assert.equal(decideRefundWebhook(cur, rev({ providerEventId: "r7", occurredAt: "2026-07-20T10:00:00Z" }), new Set()).action, "RECONCILE");
});
