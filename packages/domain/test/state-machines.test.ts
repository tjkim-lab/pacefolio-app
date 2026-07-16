/* 상태전이 부정 테스트 (리뷰 R2 P0-8 — 금지 전이를 코드로 고정) */
import { test } from "node:test";
import assert from "node:assert/strict";
import { asId } from "../ids";
import type { UserId } from "../ids";
import type { Refund } from "../entities";

const uid = (s: string) => asId<UserId>(s);
import {
  canTransitionPayment, canTransitionInvoice, canTransitionRefund,
  isRefundMutuallyApproved, canApplyRefundApproval,
} from "../state-machines";

test("Payment: 정상 전이 허용", () => {
  assert.ok(canTransitionPayment("PENDING", "AUTHORIZED").ok);
  assert.ok(canTransitionPayment("AUTHORIZED", "CAPTURED").ok);
  assert.ok(canTransitionPayment("CAPTURED", "PARTIALLY_REFUNDED").ok);
});

test("Payment: REFUNDED→CAPTURED 금지", () => {
  assert.equal(canTransitionPayment("REFUNDED", "CAPTURED").ok, false);
});

test("Payment: FAILED→CAPTURED 는 PG 재조회에서만", () => {
  assert.equal(canTransitionPayment("FAILED", "CAPTURED").ok, false);
  assert.ok(canTransitionPayment("FAILED", "CAPTURED", { viaReconciliation: true }).ok);
});

test("Invoice: VOID→PAID 금지", () => {
  assert.equal(canTransitionInvoice("VOID", "PAID").ok, false);
});

test("Invoice: PAID→PARTIALLY_PAID(환불로 되돌림) 허용", () => {
  assert.ok(canTransitionInvoice("PAID", "PARTIALLY_PAID").ok);
});

test("Refund: 금지 전이(REJECTED→PROCESSING, PROCESSING→REJECTED, COMPLETED→PROCESSING)", () => {
  assert.equal(canTransitionRefund("REJECTED", "PROCESSING").ok, false);
  assert.equal(canTransitionRefund("PROCESSING", "REJECTED").ok, false);
  assert.equal(canTransitionRefund("COMPLETED", "PROCESSING").ok, false);
});

test("Refund: 정상 경로 REQUESTED→MUTUALLY_APPROVED→PROCESSING→COMPLETED", () => {
  assert.ok(canTransitionRefund("REQUESTED", "MUTUALLY_APPROVED").ok);
  assert.ok(canTransitionRefund("MUTUALLY_APPROVED", "PROCESSING").ok);
  assert.ok(canTransitionRefund("PROCESSING", "COMPLETED").ok);
});

function baseRefund(over: Partial<Refund>): Refund {
  return {
    id: asId("ref_1"), academyId: asId("aca_1"), paymentId: asId("pay_1"),
    participantId: asId("p_1"), status: "REQUESTED", reasonCode: "PARENT_REQUEST",
    requestedAmount: 100000, requestedByUserId: uid("u_guardian"),
    requestedAt: "2026-07-25T00:00:00Z", idempotencyKey: "rk_1", ...over,
  };
}

test("상호 승인: 양측 모두 있어야 완결", () => {
  assert.equal(isRefundMutuallyApproved(baseRefund({ guardianApprovedByUserId: uid("u_g") })).ok, false);
  assert.ok(isRefundMutuallyApproved(baseRefund({
    guardianApprovedByUserId: uid("u_g"),
    academyApprovedByUserId: uid("u_owner"),
  })).ok);
});

test("상호 승인: 동일인이 양측 승인 불가", () => {
  const r = baseRefund({
    guardianApprovedByUserId: uid("u_same"),
    academyApprovedByUserId: uid("u_same"),
  });
  assert.equal(isRefundMutuallyApproved(r).ok, false);
});

test("승인 기록 시: 반대편이 이미 같은 사람이면 거절", () => {
  const r = baseRefund({ academyApprovedByUserId: uid("u_x") });
  assert.equal(canApplyRefundApproval(r, "GUARDIAN", uid("u_x")).ok, false);
  assert.ok(canApplyRefundApproval(r, "GUARDIAN", uid("u_y")).ok);
});
