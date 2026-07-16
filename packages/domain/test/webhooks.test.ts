/* PG 웹훅: 중복·역순·재조회·시간 정규화 (리뷰 R2 P0-3 · R3 P0-8) */
import { test } from "node:test";
import assert from "node:assert/strict";
import { decidePaymentWebhook, toEpochMs, type WebhookEvent, type PaymentSnapshot } from "../webhooks";

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
