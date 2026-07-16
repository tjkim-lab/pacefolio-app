/* =========================================================
   PACEFOLIO 공유 도메인 — 정산 계산 · 불변식 (리뷰 R2 P0-1)
   ---------------------------------------------------------
   "PaymentAllocation 합 = Invoice.total 이면 PAID" 는 불충분.
   유효 납부액 = CAPTURED/PARTIALLY_REFUNDED Payment 의 allocation 합
              − COMPLETED Refund 의 allocation 합.
   순수 함수 — 배열을 받아 계산. 서버·fixture·테스트 공유 진실.
   ⚠️ DB 아님. 금액 단위 = KRW 정수.
   ========================================================= */
import type {
  Invoice, InvoiceLine, Payment, PaymentAllocation, Refund, RefundAllocation,
} from "./entities";
import type { InvoiceId, PaymentId, PaymentAllocationId } from "./ids";
import type { PaymentStatus, InvoiceStatus } from "./enums";

/** 납부액으로 인정되는 Payment 상태(리뷰 R2 P0-1).
   PENDING·AUTHORIZED·FAILED·CANCELLED 는 미포함. */
export function isEffectivePayment(status: PaymentStatus): boolean {
  return status === "CAPTURED" || status === "PARTIALLY_REFUNDED" || status === "REFUNDED";
}

/** 환불이 실제 차감으로 인정되는 상태 = COMPLETED 만. */
export function isCompletedRefund(status: Refund["status"]): boolean {
  return status === "COMPLETED";
}

export interface SettlementInput {
  payments: readonly Payment[];
  paymentAllocations: readonly PaymentAllocation[];
  refunds: readonly Refund[];
  refundAllocations: readonly RefundAllocation[];
}

const sum = (ns: readonly number[]): number => ns.reduce((a, b) => a + b, 0);

/** 유효 Payment 의 PaymentId 집합 */
function effectivePaymentIds(i: SettlementInput): Set<PaymentId> {
  return new Set(i.payments.filter((p) => isEffectivePayment(p.status)).map((p) => p.id));
}

/** 특정 Invoice 로 배분된 유효 결제액(환불 전). */
export function capturedAmountForInvoice(invoiceId: InvoiceId, i: SettlementInput): number {
  const eff = effectivePaymentIds(i);
  return sum(
    i.paymentAllocations
      .filter((a) => a.invoiceId === invoiceId && eff.has(a.paymentId))
      .map((a) => a.amount),
  );
}

/** 특정 Invoice 에 대한 완료된 환불액. */
export function refundedAmountForInvoice(invoiceId: InvoiceId, i: SettlementInput): number {
  const completed = new Set(i.refunds.filter((r) => isCompletedRefund(r.status)).map((r) => r.id));
  return sum(
    i.refundAllocations
      .filter((ra) => ra.invoiceId === invoiceId && completed.has(ra.refundId))
      .map((ra) => ra.amount),
  );
}

/** 순수납액 = 유효결제 − 완료환불. */
export function netPaidForInvoice(invoiceId: InvoiceId, i: SettlementInput): number {
  return capturedAmountForInvoice(invoiceId, i) - refundedAmountForInvoice(invoiceId, i);
}

/** 미납액 = total − 순수납액. */
export function outstandingForInvoice(invoice: Invoice, i: SettlementInput): number {
  return invoice.total - netPaidForInvoice(invoice.id, i);
}

/** 금액으로 도출한 Invoice 상태(저장값 검증·표시용).
   REFUNDED = 순수납 0 & 환불 발생. PAID = 미납 0. */
export function deriveInvoiceStatus(invoice: Invoice, i: SettlementInput): InvoiceStatus {
  const net = netPaidForInvoice(invoice.id, i);
  const refunded = refundedAmountForInvoice(invoice.id, i);
  const outstanding = invoice.total - net;
  if (invoice.status === "VOID" || invoice.status === "DRAFT") return invoice.status;
  if (net <= 0 && refunded > 0) return "REFUNDED";
  if (outstanding <= 0) return "PAID";
  if (net > 0) return "PARTIALLY_PAID";
  return invoice.status === "OVERDUE" ? "OVERDUE" : "ISSUED";
}

/* --- 불변식 (리뷰 R2 P0-1) — 위반 목록 반환(빈 배열 = OK) --- */
export interface Violation {
  code: string;
  message: string;
  ref?: string;
}

export function checkBillingInvariants(
  invoices: readonly Invoice[],
  invoiceLines: readonly InvoiceLine[],
  i: SettlementInput,
): Violation[] {
  const v: Violation[] = [];

  // Invoice.total = Σ InvoiceLine.amount
  for (const inv of invoices) {
    const lineSum = sum(invoiceLines.filter((l) => l.invoiceId === inv.id).map((l) => l.amount));
    if (lineSum !== inv.total) {
      v.push({ code: "INVOICE_TOTAL_MISMATCH", ref: inv.id, message: `total ${inv.total} ≠ Σlines ${lineSum}` });
    }
  }

  // Payment.amount = Σ PaymentAllocation.amount
  for (const p of i.payments) {
    const allocSum = sum(i.paymentAllocations.filter((a) => a.paymentId === p.id).map((a) => a.amount));
    if (allocSum !== p.amount) {
      v.push({ code: "PAYMENT_ALLOC_MISMATCH", ref: p.id, message: `amount ${p.amount} ≠ Σalloc ${allocSum}` });
    }
  }

  for (const inv of invoices) {
    const net = netPaidForInvoice(inv.id, i);
    const outstanding = inv.total - net;
    // 초과수납 방지(기본 정책): 미납 < 0 금지
    if (outstanding < 0) {
      v.push({ code: "OVERPAYMENT", ref: inv.id, message: `outstanding ${outstanding} < 0 (초과수납)` });
    }
    if (net < 0) {
      v.push({ code: "NEGATIVE_NET_PAID", ref: inv.id, message: `netPaid ${net} < 0 (환불>결제)` });
    }
  }

  // allocation 별 완료환불 ≤ 해당 allocation 결제액
  const allocById = new Map<PaymentAllocationId, PaymentAllocation>(
    i.paymentAllocations.map((a) => [a.id, a]),
  );
  const completedRefundIds = new Set(i.refunds.filter((r) => isCompletedRefund(r.status)).map((r) => r.id));
  const refundByAlloc = new Map<PaymentAllocationId, number>();
  for (const ra of i.refundAllocations) {
    if (!completedRefundIds.has(ra.refundId)) continue;
    refundByAlloc.set(ra.paymentAllocationId, (refundByAlloc.get(ra.paymentAllocationId) ?? 0) + ra.amount);
  }
  for (const [allocId, refunded] of refundByAlloc) {
    const alloc = allocById.get(allocId);
    if (!alloc) {
      v.push({ code: "REFUND_ALLOC_ORPHAN", ref: allocId, message: "환불이 존재하지 않는 결제배분을 참조" });
      continue;
    }
    if (refunded > alloc.amount) {
      v.push({ code: "OVER_REFUND_ALLOC", ref: allocId, message: `완료환불 ${refunded} > 결제배분 ${alloc.amount}` });
    }
  }

  // payment 별 완료환불 ≤ captured payment amount
  const paymentOfAlloc = new Map<PaymentAllocationId, PaymentId>(
    i.paymentAllocations.map((a) => [a.id, a.paymentId]),
  );
  const refundByPayment = new Map<PaymentId, number>();
  for (const ra of i.refundAllocations) {
    if (!completedRefundIds.has(ra.refundId)) continue;
    const pid = paymentOfAlloc.get(ra.paymentAllocationId);
    if (!pid) continue;
    refundByPayment.set(pid, (refundByPayment.get(pid) ?? 0) + ra.amount);
  }
  for (const p of i.payments) {
    const refunded = refundByPayment.get(p.id) ?? 0;
    if (refunded > p.amount) {
      v.push({ code: "OVER_REFUND_PAYMENT", ref: p.id, message: `완료환불 ${refunded} > 결제 ${p.amount}` });
    }
  }

  return v;
}
