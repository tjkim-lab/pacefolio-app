/* 참조·테넌트 무결성 + Refund 금액 합계 + 상태↔환불 일관성 (R3 P0-6·P0-7·P1-1·P1-3) */
import { test } from "node:test";
import assert from "node:assert/strict";
import { asId } from "../ids";
import type {
  Invoice, Payment, PaymentAllocation, Refund, RefundAllocation,
} from "../entities";
import {
  checkReferenceIntegrity, checkBillingInvariants, deriveInvoiceStatus,
  type SettlementInput,
} from "../billing";

const INV_A = asId<Invoice["id"]>("inv_a");

function invoice(over: Partial<Invoice>): Invoice {
  return {
    id: INV_A, academyId: asId("aca_1"), participantId: asId("p_1"),
    enrollmentId: asId("enr_1"), billingPeriodId: asId("bp_1"),
    status: "ISSUED", total: 210000, dueDate: "2026-08-10", ...over,
  };
}
function payment(over: Partial<Payment>): Payment {
  return {
    id: asId("pay_1"), academyId: asId("aca_1"), guardianId: asId("g_1"),
    amount: 210000, status: "CAPTURED", idempotencyKey: "k1",
    createdAt: "2026-07-20T00:00:00Z", ...over,
  };
}
function palloc(over: Partial<PaymentAllocation>): PaymentAllocation {
  return { id: asId("pa_1"), paymentId: asId("pay_1"), invoiceId: INV_A, amount: 210000, ...over };
}
function refund(over: Partial<Refund>): Refund {
  return {
    id: asId("ref_1"), academyId: asId("aca_1"), paymentId: asId("pay_1"),
    participantId: asId("p_1"), status: "COMPLETED", reasonCode: "PARENT_REQUEST",
    requestedAmount: 100000, completedAmount: 100000,
    requestedByUserId: asId("u_1"), requestedAt: "2026-07-25T00:00:00Z",
    idempotencyKey: "rk_1", ...over,
  };
}
function ralloc(over: Partial<RefundAllocation>): RefundAllocation {
  return {
    id: asId("ra_1"), refundId: asId("ref_1"), paymentAllocationId: asId("pa_1"),
    invoiceId: INV_A, participantId: asId("p_1"), amount: 100000, ...over,
  };
}
const input = (over: Partial<SettlementInput>): SettlementInput => ({
  payments: [payment({})], paymentAllocations: [palloc({})],
  refunds: [], refundAllocations: [], ...over,
});

test("정상 케이스: 무결성 위반 0", () => {
  const i = input({ payments: [payment({ status: "PARTIALLY_REFUNDED" })], refunds: [refund({})], refundAllocations: [ralloc({})] });
  assert.deepEqual(checkReferenceIntegrity([invoice({})], i), []);
});

test("R3: 음수·0 금액 차단(음수 환불배분이 순수납을 늘리는 공격)", () => {
  const i = input({ refunds: [refund({ requestedAmount: -100000, completedAmount: -100000 })], refundAllocations: [ralloc({ amount: -100000 })] });
  const v = checkReferenceIntegrity([invoice({})], i);
  assert.ok(v.some((x) => x.code === "INVALID_MONEY_AMOUNT"));
});

test("R3: orphan 참조 탐지(없는 Payment/Refund/PaymentAllocation)", () => {
  const orphanPa = input({ paymentAllocations: [palloc({ paymentId: asId<Payment["id"]>("pay_ghost") })] });
  assert.ok(checkReferenceIntegrity([invoice({})], orphanPa).some((x) => x.code === "PAYMENT_ALLOCATION_ORPHAN"));
  const orphanRa = input({ refunds: [refund({})], refundAllocations: [ralloc({ paymentAllocationId: asId<PaymentAllocation["id"]>("pa_ghost") })] });
  assert.ok(checkReferenceIntegrity([invoice({})], orphanRa).some((x) => x.code === "REFUND_ALLOCATION_ORPHAN"));
});

test("R3: Refund.paymentId ≠ allocation 의 payment → REFUND_PAYMENT_MISMATCH", () => {
  const i = input({
    payments: [payment({}), payment({ id: asId<Payment["id"]>("pay_2"), idempotencyKey: "k2" })],
    refunds: [refund({ paymentId: asId<Payment["id"]>("pay_2") })],
    refundAllocations: [ralloc({})], // pa_1 은 pay_1 소속
  });
  assert.ok(checkReferenceIntegrity([invoice({})], i).some((x) => x.code === "REFUND_PAYMENT_MISMATCH"));
});

test("R3: participant 불일치 → REFUND_PARTICIPANT_MISMATCH", () => {
  const i = input({ refunds: [refund({})], refundAllocations: [ralloc({ participantId: asId<Invoice["participantId"]>("p_other") })] });
  assert.ok(checkReferenceIntegrity([invoice({})], i).some((x) => x.code === "REFUND_PARTICIPANT_MISMATCH"));
});

test("R3: 같은 (refund, allocation) 쌍 중복 → REFUND_ALLOCATION_DUPLICATE", () => {
  const i = input({
    refunds: [refund({ requestedAmount: 200000, completedAmount: 200000 })],
    refundAllocations: [ralloc({}), ralloc({ id: asId<RefundAllocation["id"]>("ra_2") })],
  });
  assert.ok(checkReferenceIntegrity([invoice({})], i).some((x) => x.code === "REFUND_ALLOCATION_DUPLICATE"));
});

test("R3 P0-6: Refund.completedAmount ≠ Σ allocation → 장부 이중차감 탐지", () => {
  // 실제 환불 50,000 인데 allocation 은 100,000 차감 시도
  const i = input({
    payments: [payment({ status: "PARTIALLY_REFUNDED" })],
    refunds: [refund({ requestedAmount: 100000, completedAmount: 50000 })],
    refundAllocations: [ralloc({})], // 100,000
  });
  assert.ok(checkReferenceIntegrity([invoice({})], i).some((x) => x.code === "REFUND_AMOUNT_MISMATCH"));
});

test("R3 P1-1: Payment 상태 ↔ 환불합 모순 탐지", () => {
  // REFUNDED 인데 환불합 = 절반뿐
  const i = input({
    payments: [payment({ status: "REFUNDED" })],
    refunds: [refund({})],
    refundAllocations: [ralloc({})], // 100,000 < 210,000
  });
  const v = checkBillingInvariants([invoice({})], [{ id: asId("il_1"), invoiceId: INV_A, type: "TUITION", label: "수강료", amount: 210000 }], i);
  assert.ok(v.some((x) => x.code === "PAYMENT_STATUS_REFUND_MISMATCH"));
});

test("R3 P1-3: REFUNDED Invoice 는 종결 — 새 결제가 와도 되살아나지 않음", () => {
  const inv = invoice({ status: "REFUNDED" });
  const i = input({}); // 21만원 CAPTURED 결제 존재
  assert.equal(deriveInvoiceStatus(inv, i), "REFUNDED"); // PAID 로 재활성화 금지
});
