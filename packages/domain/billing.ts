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
   REFUNDED = 순수납 0 & 환불 발생. PAID = 미납 0.
   R3 P1-3 정책: REFUNDED 는 종결 — 이후 결제로 재활성화하지 않는다.
   재결제 필요 시 replacementInvoiceId 를 가진 신규 Invoice 발행. */
export function deriveInvoiceStatus(invoice: Invoice, i: SettlementInput): InvoiceStatus {
  if (invoice.status === "VOID" || invoice.status === "DRAFT" || invoice.status === "REFUNDED") {
    return invoice.status; // 종결·미발행 상태는 금액으로 되살리지 않음
  }
  const net = netPaidForInvoice(invoice.id, i);
  const refunded = refundedAmountForInvoice(invoice.id, i);
  const outstanding = invoice.total - net;
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

  // payment 별 완료환불 ≤ captured payment amount + 상태↔환불액 일관성(R3 P1-1)
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
    // 상태 모순 검출: 환불 완료와 Payment 상태 변경은 같은 트랜잭션이어야 함
    if (p.status === "REFUNDED" && refunded !== p.amount) {
      v.push({ code: "PAYMENT_STATUS_REFUND_MISMATCH", ref: p.id, message: `REFUNDED 인데 환불합 ${refunded} ≠ 결제 ${p.amount}` });
    }
    if (p.status === "PARTIALLY_REFUNDED" && !(refunded > 0 && refunded < p.amount)) {
      v.push({ code: "PAYMENT_STATUS_REFUND_MISMATCH", ref: p.id, message: `PARTIALLY_REFUNDED 인데 환불합 ${refunded} (0 < x < ${p.amount} 위반)` });
    }
    if (p.status === "CAPTURED" && refunded !== 0) {
      v.push({ code: "PAYMENT_STATUS_REFUND_MISMATCH", ref: p.id, message: `CAPTURED 인데 완료환불 ${refunded} 존재` });
    }
  }

  return v;
}

/* --- 참조·테넌트 무결성 + 금액 검증 (R3 P0-6·P0-7) --- */

/** 양수 KRW 정수인가 — 음수 RefundAllocation 이 순수납을 늘리는 공격 차단. */
function isValidMoney(n: number): boolean {
  return Number.isInteger(n) && n > 0;
}

export function checkReferenceIntegrity(
  invoices: readonly Invoice[],
  i: SettlementInput,
): Violation[] {
  const v: Violation[] = [];
  const invoiceById = new Map(invoices.map((inv) => [inv.id, inv]));
  const paymentById = new Map(i.payments.map((p) => [p.id, p]));
  const refundById = new Map(i.refunds.map((r) => [r.id, r]));
  const allocById = new Map(i.paymentAllocations.map((a) => [a.id, a]));

  // 금액: 모두 0보다 큰 KRW 정수
  for (const p of i.payments) if (!isValidMoney(p.amount))
    v.push({ code: "INVALID_MONEY_AMOUNT", ref: p.id, message: `Payment.amount ${p.amount}` });
  for (const a of i.paymentAllocations) if (!isValidMoney(a.amount))
    v.push({ code: "INVALID_MONEY_AMOUNT", ref: a.id, message: `PaymentAllocation.amount ${a.amount}` });
  for (const r of i.refunds) if (!isValidMoney(r.requestedAmount))
    v.push({ code: "INVALID_MONEY_AMOUNT", ref: r.id, message: `Refund.requestedAmount ${r.requestedAmount}` });
  for (const ra of i.refundAllocations) if (!isValidMoney(ra.amount))
    v.push({ code: "INVALID_MONEY_AMOUNT", ref: ra.id, message: `RefundAllocation.amount ${ra.amount}` });

  // PaymentAllocation → Payment·Invoice 실존 + 테넌트 일치
  for (const a of i.paymentAllocations) {
    const p = paymentById.get(a.paymentId);
    const inv = invoiceById.get(a.invoiceId);
    if (!p) { v.push({ code: "PAYMENT_ALLOCATION_ORPHAN", ref: a.id, message: "존재하지 않는 Payment 참조" }); continue; }
    if (!inv) { v.push({ code: "PAYMENT_ALLOCATION_ORPHAN", ref: a.id, message: "존재하지 않는 Invoice 참조" }); continue; }
    if (p.academyId !== inv.academyId) {
      v.push({ code: "REFUND_TENANT_MISMATCH", ref: a.id, message: `Payment.academy ${p.academyId} ≠ Invoice.academy ${inv.academyId}` });
    }
  }

  // RefundAllocation → Refund·PaymentAllocation 실존 + 연쇄 일치
  const seenPerRefundAlloc = new Set<string>();
  for (const ra of i.refundAllocations) {
    const r = refundById.get(ra.refundId);
    const pa = allocById.get(ra.paymentAllocationId);
    if (!r) { v.push({ code: "REFUND_ALLOCATION_ORPHAN", ref: ra.id, message: "존재하지 않는 Refund 참조" }); continue; }
    if (!pa) { v.push({ code: "REFUND_ALLOCATION_ORPHAN", ref: ra.id, message: "존재하지 않는 PaymentAllocation 참조" }); continue; }
    // 같은 (refund, allocation) 쌍 중복 차단
    const key = `${ra.refundId}:${ra.paymentAllocationId}`;
    if (seenPerRefundAlloc.has(key)) {
      v.push({ code: "REFUND_ALLOCATION_DUPLICATE", ref: ra.id, message: key });
    }
    seenPerRefundAlloc.add(key);
    // Refund.paymentId = allocation 이 가리키는 payment
    if (r.paymentId !== pa.paymentId) {
      v.push({ code: "REFUND_PAYMENT_MISMATCH", ref: ra.id, message: `Refund.payment ${r.paymentId} ≠ alloc.payment ${pa.paymentId}` });
    }
    // RefundAllocation.invoiceId = PaymentAllocation.invoiceId
    if (ra.invoiceId !== pa.invoiceId) {
      v.push({ code: "REFUND_INVOICE_MISMATCH", ref: ra.id, message: `${ra.invoiceId} ≠ ${pa.invoiceId}` });
    }
    // participant 일치: RefundAllocation.participantId = Invoice.participantId
    const inv = invoiceById.get(pa.invoiceId);
    if (inv && ra.participantId !== inv.participantId) {
      v.push({ code: "REFUND_PARTICIPANT_MISMATCH", ref: ra.id, message: `${ra.participantId} ≠ invoice.participant ${inv.participantId}` });
    }
    // 테넌트: Refund.academyId = Payment.academyId = Invoice.academyId
    const p = paymentById.get(pa.paymentId);
    if (p && r.academyId !== p.academyId) {
      v.push({ code: "REFUND_TENANT_MISMATCH", ref: ra.id, message: `Refund.academy ${r.academyId} ≠ Payment.academy ${p.academyId}` });
    }
  }

  // Refund 금액 ↔ allocation 합계 (R3 P0-6)
  for (const r of i.refunds) {
    const allocSum = sum(i.refundAllocations.filter((ra) => ra.refundId === r.id).map((ra) => ra.amount));
    if (r.requestedAmount !== allocSum) {
      v.push({ code: "REFUND_AMOUNT_MISMATCH", ref: r.id, message: `requestedAmount ${r.requestedAmount} ≠ Σalloc ${allocSum}` });
    }
    if (r.approvedAmount !== undefined && r.approvedAmount > r.requestedAmount) {
      v.push({ code: "REFUND_AMOUNT_MISMATCH", ref: r.id, message: `approved ${r.approvedAmount} > requested ${r.requestedAmount}` });
    }
    if (r.status === "COMPLETED") {
      if (r.completedAmount === undefined) {
        v.push({ code: "REFUND_AMOUNT_MISMATCH", ref: r.id, message: "COMPLETED 인데 completedAmount 없음" });
      } else {
        if (r.completedAmount !== allocSum) {
          v.push({ code: "REFUND_AMOUNT_MISMATCH", ref: r.id, message: `completed ${r.completedAmount} ≠ Σalloc ${allocSum} — 장부 이중차감 위험` });
        }
        if (r.approvedAmount !== undefined && r.completedAmount > r.approvedAmount) {
          v.push({ code: "REFUND_AMOUNT_MISMATCH", ref: r.id, message: `completed ${r.completedAmount} > approved ${r.approvedAmount}` });
        }
      }
    }
  }

  return v;
}
