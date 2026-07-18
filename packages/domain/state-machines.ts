/* =========================================================
   PACEFOLIO 공유 도메인 — 실행 가능한 상태머신 (리뷰 R2 P0-8)
   ---------------------------------------------------------
   enum 이름만 있던 상태를 transition guard 로 코드화.
   docs/03-state-machines.md 를 재현. 부정 전이는 test 로 고정.
   상태전이 ≠ 권한검증 — 분리하되 서비스 계층에서 함께 호출.
   ========================================================= */
import type { InvoiceStatus, PaymentStatus, RefundStatus } from "./enums";
import type { Refund, Invoice } from "./entities";
import type { UserId } from "./ids";
import { netPaidForInvoice, type SettlementInput } from "./billing";

export interface TransitionResult {
  ok: boolean;
  error?: string;
}
const ok: TransitionResult = { ok: true };
const deny = (error: string): TransitionResult => ({ ok: false, error });

/* --- Payment --- */
const PAYMENT_ALLOWED: Record<PaymentStatus, readonly PaymentStatus[]> = {
  PENDING: ["AUTHORIZED", "CAPTURED", "FAILED", "CANCELLED"],
  AUTHORIZED: ["CAPTURED", "FAILED", "CANCELLED"],
  CAPTURED: ["PARTIALLY_REFUNDED", "REFUNDED"],
  PARTIALLY_REFUNDED: ["PARTIALLY_REFUNDED", "REFUNDED"],
  FAILED: [],       // 예외: PG 재조회(reconciliation)로만 CAPTURED — 아래 opts 로 허용
  CANCELLED: [],
  REFUNDED: [],     // 종결 — REFUNDED→CAPTURED 금지
};

export interface PaymentTransitionOpts {
  viaReconciliation?: boolean; // PG 재조회로 확정된 경우에만 FAILED→CAPTURED 허용
}

export function canTransitionPayment(
  from: PaymentStatus,
  to: PaymentStatus,
  opts: PaymentTransitionOpts = {},
): TransitionResult {
  if (from === to) return deny(`동일 상태 전이 무시: ${from}`);
  // 예외: FAILED→CAPTURED 는 PG 재조회 결과일 때만
  if (from === "FAILED" && to === "CAPTURED") {
    return opts.viaReconciliation ? ok : deny("FAILED→CAPTURED 는 PG 재조회에서만 허용");
  }
  return PAYMENT_ALLOWED[from].includes(to)
    ? ok
    : deny(`허용되지 않은 결제 전이: ${from}→${to}`);
}

/* --- Invoice --- */
const INVOICE_ALLOWED: Record<InvoiceStatus, readonly InvoiceStatus[]> = {
  DRAFT: ["ISSUED", "VOID"],
  ISSUED: ["PARTIALLY_PAID", "PAID", "OVERDUE", "VOID"],
  PARTIALLY_PAID: ["PAID", "PARTIALLY_PAID", "OVERDUE", "VOID", "REFUNDED"],
  OVERDUE: ["PARTIALLY_PAID", "PAID", "VOID"],
  PAID: ["PARTIALLY_PAID", "REFUNDED"], // 환불로 되돌아갈 수 있음
  VOID: [],                              // 종결 — VOID→PAID 금지
  REFUNDED: [],                          // 종결
};
export function canTransitionInvoice(from: InvoiceStatus, to: InvoiceStatus): TransitionResult {
  if (from === to) return ok; // 재계산 결과 동일 상태는 허용(멱등)
  return INVOICE_ALLOWED[from].includes(to)
    ? ok
    : deny(`허용되지 않은 청구 전이: ${from}→${to}`);
}

/** R4 P0: 상태 인접성 + 금액 guard 결합.
   인접성(canTransitionInvoice)은 "이동 가능한 경로"만 보고, 이 함수가
   실제 장부 조건을 함께 검증한다 — 서비스 계층은 이 함수를 호출.
   VOID: 순수납이 남은 청구서를 VOID 하면 장부가 깨진다.
   입금이 있으면 환불·타 Invoice 이관·credit 처리 중 하나가 선행돼야 한다. */
export function validateInvoiceTransition(
  invoice: Invoice,
  to: InvoiceStatus,
  settlement: SettlementInput,
): TransitionResult {
  const adjacency = canTransitionInvoice(invoice.status, to);
  if (!adjacency.ok) return adjacency;
  if (to === "VOID") {
    const net = netPaidForInvoice(invoice.id, settlement);
    if (net !== 0) {
      return deny(`VOID 불가: 순수납 ${net} ≠ 0 — 환불·이관·credit 선행 필요`);
    }
  }
  return ok;
}

/* --- Refund --- */
const REFUND_ALLOWED: Record<RefundStatus, readonly RefundStatus[]> = {
  REQUESTED: ["MUTUALLY_APPROVED", "REJECTED"],
  // R4 P0: 상호 승인 후 단독 거절 금지 — 거절은 REQUESTED 단계에서만.
  // 승인 후 취소가 필요해지면 REJECTED 와 구분되는 CANCELLED 상태를
  // 도입하고 (누가·PG 실행 전까지만·상대 재동의·감사 사유) 정책을 함께 정의한다.
  MUTUALLY_APPROVED: ["PROCESSING"],
  PROCESSING: ["COMPLETED", "FAILED", "UNKNOWN"], // PROCESSING→REJECTED 금지(진행 후 거절 불가)
  FAILED: ["PROCESSING"],       // PG 확정 실패 — 재시도 가능
  UNKNOWN: ["PROCESSING", "COMPLETED", "FAILED"], // 타임아웃 등 미확정 — PG 재조회로 수렴
  COMPLETED: [],                // 종결 — COMPLETED→PROCESSING 금지
  REJECTED: [],                 // 종결 — REJECTED→PROCESSING 금지
};
export function canTransitionRefund(from: RefundStatus, to: RefundStatus): TransitionResult {
  if (from === to) return deny(`동일 상태 전이 무시: ${from}`);
  return REFUND_ALLOWED[from].includes(to)
    ? ok
    : deny(`허용되지 않은 환불 전이: ${from}→${to}`);
}

/** 상호 승인 완결 여부(헌법: 학부모+원장 둘 다).
   동일인이 양측을 겸하면 무효 — 부정 방지. */
export function isRefundMutuallyApproved(r: Refund): TransitionResult {
  if (!r.guardianApprovedByUserId) return deny("보호자 승인 없음");
  if (!r.academyApprovedByUserId) return deny("원장 승인 없음");
  if (r.guardianApprovedByUserId === r.academyApprovedByUserId) {
    return deny("동일 사용자가 양측을 승인할 수 없음");
  }
  return ok;
}

/** 환불 승인 1건 기록 시 검증 — 요청자와 무관하게 양측은 서로 달라야 함. */
export function canApplyRefundApproval(
  r: Refund,
  side: "GUARDIAN" | "ACADEMY",
  approverUserId: UserId,
): TransitionResult {
  if (r.status !== "REQUESTED" && r.status !== "MUTUALLY_APPROVED") {
    return deny(`승인 불가 상태: ${r.status}`);
  }
  const otherSideApprover = side === "GUARDIAN" ? r.academyApprovedByUserId : r.guardianApprovedByUserId;
  if (otherSideApprover && otherSideApprover === approverUserId) {
    return deny("동일 사용자가 양측을 승인할 수 없음");
  }
  /* 13차 D P1-2 가 실 PG ×20 경쟁으로 적발한 결함: 같은 측 재승인이
     전부 통과 — 덮어쓰기·감사 중복·version 폭증. 승인은 측당 정확히 1회. */
  const sameSideApprovedAt = side === "GUARDIAN" ? r.guardianApprovedAt : r.academyApprovedAt;
  if (sameSideApprovedAt) {
    return deny("이미 승인된 측 — 중복 승인 불가");
  }
  return ok;
}
