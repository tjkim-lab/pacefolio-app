/* 결제·환불 정산 불변식 테스트 (리뷰 R2 §13 매트릭스 일부) */
import { test } from "node:test";
import assert from "node:assert/strict";
import { asId } from "../ids";
import type {
  Invoice, InvoiceLine, Payment, PaymentAllocation, Refund, RefundAllocation,
} from "../entities";
import {
  capturedAmountForInvoice, refundedAmountForInvoice, netPaidForInvoice,
  outstandingForInvoice, checkBillingInvariants, type SettlementInput,
} from "../billing";

const INV_A = asId<Invoice["id"]>("inv_a");
const INV_B = asId<Invoice["id"]>("inv_b");

function invoice(id: Invoice["id"], total: number): Invoice {
  return {
    id, academyId: asId("aca_1"), participantId: asId("p_1"),
    enrollmentId: asId("enr_1"), billingPeriodId: asId("bp_1"),
    status: "ISSUED", total, dueDate: "2026-08-10",
  };
}
function line(invoiceId: Invoice["id"], amount: number): InvoiceLine {
  return { id: asId("il_" + amount), invoiceId, type: "TUITION", label: "수강료", amount };
}
function payment(id: string, amount: number, status: Payment["status"]): Payment {
  return {
    id: asId(id), academyId: asId("aca_1"), guardianId: asId("g_1"),
    amount, status, idempotencyKey: "k_" + id, createdAt: "2026-07-20T00:00:00Z",
  };
}
function palloc(id: string, paymentId: string, invoiceId: Invoice["id"], amount: number): PaymentAllocation {
  return { id: asId(id), paymentId: asId(paymentId), invoiceId, amount };
}
function refund(id: string, status: Refund["status"], amount: number): Refund {
  return {
    id: asId(id), academyId: asId("aca_1"), paymentId: asId("pay_1"),
    participantId: asId("p_1"), status, reasonCode: "PARENT_REQUEST",
    requestedAmount: amount, requestedByUserId: asId("u_1"),
    requestedAt: "2026-07-25T00:00:00Z", idempotencyKey: "rk_" + id,
  };
}
function ralloc(id: string, refundId: string, pallocId: string, invoiceId: Invoice["id"], amount: number): RefundAllocation {
  return {
    id: asId(id), refundId: asId(refundId), paymentAllocationId: asId(pallocId),
    invoiceId, participantId: asId("p_1"), amount,
  };
}
const empty = { payments: [], paymentAllocations: [], refunds: [], refundAllocations: [] };

test("합산결제: 두 Invoice 를 한 Payment 로, 합계·귀속 보존", () => {
  // 338,000 = 210,000(A) + 128,000(B)
  const i: SettlementInput = {
    ...empty,
    payments: [payment("pay_1", 338000, "CAPTURED")],
    paymentAllocations: [
      palloc("pa_a", "pay_1", INV_A, 210000),
      palloc("pa_b", "pay_1", INV_B, 128000),
    ],
  };
  assert.equal(capturedAmountForInvoice(INV_A, i), 210000);
  assert.equal(capturedAmountForInvoice(INV_B, i), 128000);
  assert.equal(outstandingForInvoice(invoice(INV_A, 210000), i), 0);
  assert.equal(outstandingForInvoice(invoice(INV_B, 128000), i), 0);
});

test("FAILED/CANCELLED/PENDING Payment 의 allocation 은 납부액에 미포함", () => {
  const i: SettlementInput = {
    ...empty,
    payments: [
      payment("pay_f", 210000, "FAILED"),
      payment("pay_c", 210000, "CANCELLED"),
      payment("pay_p", 210000, "PENDING"),
    ],
    paymentAllocations: [
      palloc("pa_f", "pay_f", INV_A, 210000),
      palloc("pa_c", "pay_c", INV_A, 210000),
      palloc("pa_p", "pay_p", INV_A, 210000),
    ],
  };
  assert.equal(capturedAmountForInvoice(INV_A, i), 0);
  assert.equal(outstandingForInvoice(invoice(INV_A, 210000), i), 210000);
});

test("형제 중 1명 부분환불: 해당 Invoice 순수납만 감소", () => {
  const i: SettlementInput = {
    payments: [payment("pay_1", 338000, "PARTIALLY_REFUNDED")],
    paymentAllocations: [
      palloc("pa_a", "pay_1", INV_A, 210000),
      palloc("pa_b", "pay_1", INV_B, 128000),
    ],
    refunds: [refund("ref_1", "COMPLETED", 128000)],
    refundAllocations: [ralloc("ra_1", "ref_1", "pa_b", INV_B, 128000)],
  };
  assert.equal(netPaidForInvoice(INV_A, i), 210000); // A 는 그대로
  assert.equal(netPaidForInvoice(INV_B, i), 0);       // B 만 환불
  assert.equal(refundedAmountForInvoice(INV_B, i), 128000);
});

test("REQUESTED 환불은 아직 차감되지 않음(COMPLETED 만 유효)", () => {
  const i: SettlementInput = {
    payments: [payment("pay_1", 210000, "CAPTURED")],
    paymentAllocations: [palloc("pa_a", "pay_1", INV_A, 210000)],
    refunds: [refund("ref_1", "REQUESTED", 210000)],
    refundAllocations: [ralloc("ra_1", "ref_1", "pa_a", INV_A, 210000)],
  };
  assert.equal(netPaidForInvoice(INV_A, i), 210000);
});

test("불변식: 초과수납(미납<0) 탐지", () => {
  const i: SettlementInput = {
    ...empty,
    payments: [payment("pay_1", 300000, "CAPTURED")],
    paymentAllocations: [palloc("pa_a", "pay_1", INV_A, 300000)],
  };
  const v = checkBillingInvariants([invoice(INV_A, 210000)], [line(INV_A, 210000)], i);
  assert.ok(v.some((x) => x.code === "OVERPAYMENT"));
});

test("불변식: 부분환불 2회 누적이 결제배분 초과 시 탐지", () => {
  const i: SettlementInput = {
    payments: [payment("pay_1", 210000, "PARTIALLY_REFUNDED")],
    paymentAllocations: [palloc("pa_a", "pay_1", INV_A, 210000)],
    refunds: [refund("ref_1", "COMPLETED", 150000), refund("ref_2", "COMPLETED", 100000)],
    refundAllocations: [
      ralloc("ra_1", "ref_1", "pa_a", INV_A, 150000),
      ralloc("ra_2", "ref_2", "pa_a", INV_A, 100000), // 합 250,000 > 210,000
    ],
  };
  const v = checkBillingInvariants([invoice(INV_A, 210000)], [line(INV_A, 210000)], i);
  assert.ok(v.some((x) => x.code === "OVER_REFUND_ALLOC"));
});

test("불변식: Invoice.total ≠ Σlines 탐지", () => {
  const v = checkBillingInvariants(
    [invoice(INV_A, 210000)],
    [line(INV_A, 200000)], // 10,000 부족
    empty,
  );
  assert.ok(v.some((x) => x.code === "INVOICE_TOTAL_MISMATCH"));
});

test("정상 케이스: 위반 0", () => {
  const i: SettlementInput = {
    ...empty,
    payments: [payment("pay_1", 210000, "CAPTURED")],
    paymentAllocations: [palloc("pa_a", "pay_1", INV_A, 210000)],
  };
  const v = checkBillingInvariants([invoice(INV_A, 210000)], [line(INV_A, 210000)], i);
  assert.deepEqual(v, []);
});
