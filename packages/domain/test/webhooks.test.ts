/* PG 웹훅: 중복·역순·재조회 (리뷰 R2 P0-3) */
import { test } from "node:test";
import assert from "node:assert/strict";
import { decidePaymentWebhook, type WebhookEvent, type PaymentSnapshot } from "../webhooks";

const ev = (over: Partial<WebhookEvent>): WebhookEvent => ({
  provider: "tosspay", providerEventId: "e1", targetStatus: "CAPTURED",
  occurredAt: "2026-07-20T10:00:00Z", ...over,
});

test("정상: AUTHORIZED → CAPTURED APPLY", () => {
  const cur: PaymentSnapshot = { status: "AUTHORIZED", lastEventAt: "2026-07-20T09:00:00Z" };
  const d = decidePaymentWebhook(cur, ev({}), new Set());
  assert.equal(d.action, "APPLY");
});

test("CAPTURED 웹훅 중복 → 1회만(IGNORE_DUPLICATE)", () => {
  const cur: PaymentSnapshot = { status: "AUTHORIZED" };
  const d = decidePaymentWebhook(cur, ev({}), new Set(["tosspay:e1"]));
  assert.equal(d.action, "IGNORE_DUPLICATE");
});

test("이미 목표 상태면 재적용 안 함", () => {
  const cur: PaymentSnapshot = { status: "CAPTURED" };
  const d = decidePaymentWebhook(cur, ev({ providerEventId: "e2" }), new Set());
  assert.equal(d.action, "IGNORE_DUPLICATE");
});

test("역순: CAPTURED 반영 후 과거 AUTHORIZED 이벤트 → IGNORE_STALE", () => {
  const cur: PaymentSnapshot = { status: "CAPTURED", lastEventAt: "2026-07-20T10:00:00Z" };
  const d = decidePaymentWebhook(cur, ev({ providerEventId: "e_old", targetStatus: "AUTHORIZED", occurredAt: "2026-07-20T09:00:00Z" }), new Set());
  assert.equal(d.action, "IGNORE_STALE");
});

test("역순: payment.failed 반영 후 늦게 도착한 captured → RECONCILE(PG 재조회)", () => {
  const cur: PaymentSnapshot = { status: "FAILED", lastEventAt: "2026-07-20T09:00:00Z" };
  const d = decidePaymentWebhook(cur, ev({ providerEventId: "e_cap", targetStatus: "CAPTURED", occurredAt: "2026-07-20T10:00:00Z" }), new Set());
  assert.equal(d.action, "RECONCILE"); // FAILED→CAPTURED 는 덮지 않고 재조회
});

test("종결 회귀 금지: REFUNDED 후 CAPTURED → RECONCILE", () => {
  const cur: PaymentSnapshot = { status: "REFUNDED", lastEventAt: "2026-07-25T00:00:00Z" };
  const d = decidePaymentWebhook(cur, ev({ providerEventId: "e_x", targetStatus: "CAPTURED", occurredAt: "2026-07-26T00:00:00Z" }), new Set());
  assert.equal(d.action, "RECONCILE");
});
