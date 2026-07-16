/* R4 P0 — 환불 정책 3종 + 상태전이 금액 guard (§19 완료 기준)
   1) 부분승인 미지원: approvedAmount = requestedAmount 불변식
   2) Refund 원생 연쇄 무결성: Refund = 원생 1명 귀속
   3) 환불 요청자 = 실제 결제자(Payment.guardianId) 소유권
   4) PARTIALLY_PAID→VOID 금액 guard · MUTUALLY_APPROVED→REJECTED 금지 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { asId } from "../ids";
import type { GuardianId } from "../ids";
import type {
  Invoice, Payment, PaymentAllocation, Refund, RefundAllocation,
  GuardianParticipantLink,
} from "../entities";
import { checkReferenceIntegrity, type SettlementInput } from "../billing";
import { validateInvoiceTransition, canTransitionRefund } from "../state-machines";
import {
  canGuardianRequestRefundForPayment, type AuthorizationContext,
} from "../authorization";

/* ── 공용 fixture: 형제(A·B) 청구 2건을 어머니가 합산결제 ── */
const invoiceA: Invoice = {
  id: asId("inv_a"), academyId: asId("aca_1"), participantId: asId("p_a"),
  enrollmentId: asId("e_a"), billingPeriodId: asId("bp_1"),
  status: "PAID", total: 100000, dueDate: "2026-07-10",
};
const invoiceB: Invoice = { ...invoiceA, id: asId("inv_b"), participantId: asId("p_b"), enrollmentId: asId("e_b") };
const payMother: Payment = {
  id: asId("pay_1"), academyId: asId("aca_1"), guardianId: asId("gd_mother"),
  amount: 200000, status: "CAPTURED", idempotencyKey: "k1", createdAt: "2026-07-05",
};
const allocA: PaymentAllocation = { id: asId("pa_a"), paymentId: payMother.id, invoiceId: invoiceA.id, amount: 100000 };
const allocB: PaymentAllocation = { id: asId("pa_b"), paymentId: payMother.id, invoiceId: invoiceB.id, amount: 100000 };

function refundBase(over: Partial<Refund>): Refund {
  return {
    id: asId("ref_1"), academyId: asId("aca_1"), paymentId: payMother.id,
    participantId: asId("p_a"), status: "REQUESTED", reasonCode: "PARENT_REQUEST",
    requestedAmount: 100000,
    requestedByUserId: asId("u_mother"), requestedAt: "2026-07-20T00:00:00Z",
    idempotencyKey: "rk_1", ...over,
  };
}
const raA: RefundAllocation = {
  id: asId("ra_a"), refundId: asId("ref_1"), paymentAllocationId: allocA.id,
  invoiceId: invoiceA.id, participantId: asId("p_a"), amount: 100000,
};
const settlement = (over: Partial<SettlementInput>): SettlementInput => ({
  payments: [payMother], paymentAllocations: [allocA, allocB],
  refunds: [], refundAllocations: [], ...over,
});

/* ── 1) 부분승인 미지원 ── */

test("부분승인 거부: approved < requested → REFUND_PARTIAL_APPROVAL_UNSUPPORTED", () => {
  // 요청 100,000 · 승인 80,000 — 리뷰 §3 모순 사례 그대로
  const i = settlement({
    refunds: [refundBase({ status: "MUTUALLY_APPROVED", approvedAmount: 80000 })],
    refundAllocations: [raA],
  });
  const v = checkReferenceIntegrity([invoiceA, invoiceB], i);
  assert.ok(v.some((x) => x.code === "REFUND_PARTIAL_APPROVAL_UNSUPPORTED"));
});

test("전액 승인은 통과: requested = approved = completed = Σalloc", () => {
  const i = settlement({
    payments: [{ ...payMother, status: "PARTIALLY_REFUNDED" }],
    refunds: [refundBase({ status: "COMPLETED", approvedAmount: 100000, completedAmount: 100000 })],
    refundAllocations: [raA],
  });
  assert.deepEqual(checkReferenceIntegrity([invoiceA, invoiceB], i), []);
});

test("MUTUALLY_APPROVED·PROCESSING·COMPLETED 부터 approvedAmount 필수", () => {
  for (const status of ["MUTUALLY_APPROVED", "PROCESSING"] as const) {
    const i = settlement({ refunds: [refundBase({ status })], refundAllocations: [raA] });
    assert.ok(
      checkReferenceIntegrity([invoiceA, invoiceB], i).some((x) => x.code === "REFUND_APPROVED_AMOUNT_REQUIRED"),
      status,
    );
  }
});

/* ── 2) Refund 원생 연쇄 무결성 ── */

test("Refund.participantId ≠ allocation.participantId → 연쇄 불일치 탐지", () => {
  // Refund 는 원생 A 명의인데 allocation 은 원생 B 청구서 차감 시도
  const raWrong: RefundAllocation = {
    ...raA, id: asId("ra_wrong"), paymentAllocationId: allocB.id,
    invoiceId: invoiceB.id, participantId: asId("p_b"),
  };
  const i = settlement({
    refunds: [refundBase({})], // participantId = p_a
    refundAllocations: [raWrong],
  });
  const v = checkReferenceIntegrity([invoiceA, invoiceB], i);
  assert.ok(v.some((x) => x.code === "REFUND_PARTICIPANT_CHAIN_MISMATCH"));
});

test("형제 합산결제라도 환불은 원생별 Refund 분리 — 두 원생 섞인 Refund 거부", () => {
  const raB: RefundAllocation = {
    id: asId("ra_b"), refundId: asId("ref_1"), paymentAllocationId: allocB.id,
    invoiceId: invoiceB.id, participantId: asId("p_b"), amount: 100000,
  };
  const i = settlement({
    refunds: [refundBase({ requestedAmount: 200000 })], // 원생 A 명의로 A+B 동시 환불 시도
    refundAllocations: [raA, raB],
  });
  const v = checkReferenceIntegrity([invoiceA, invoiceB], i);
  assert.ok(v.some((x) => x.code === "REFUND_PARTICIPANT_CHAIN_MISMATCH"));
});

/* ── 3) 환불 요청자 = 실제 결제자 ── */

const linkOf = (gid: string, pid: string): GuardianParticipantLink => ({
  id: asId(`gl_${gid}_${pid}`), guardianId: asId(gid), participantId: asId(pid),
  academyId: asId("aca_1"), relationshipType: "MOTHER",
  isPrimaryGuardian: true, verificationStatus: "VERIFIED",
  canViewSchedule: true, canViewAttendance: true, canViewHealthInfo: true,
  canReceivePhotos: true, canPay: true, canRequestRefund: true,
});
function ctxOf(guardianId: string, links: GuardianParticipantLink[]): AuthorizationContext {
  return {
    actorUserId: asId(`u_${guardianId}`), actorGuardianId: asId<GuardianId>(guardianId),
    memberships: [], verifiedLinks: links, assignments: [],
    nowISO: "2026-07-20T00:00:00Z",
  };
}

test("실제 결제자(어머니)는 환불 요청 가능", () => {
  const ctx = ctxOf("gd_mother", [linkOf("gd_mother", "p_a")]);
  assert.equal(
    canGuardianRequestRefundForPayment(ctx, payMother, [allocA], [invoiceA], []),
    true,
  );
});

test("부정: 같은 자녀에 VERIFIED 연결된 아버지도 어머니 결제 건은 환불 요청 불가", () => {
  // 리뷰 §4 정책 공백 사례 그대로 — 아버지도 p_a 에 연결·flag 전부 true
  const ctx = ctxOf("gd_father", [linkOf("gd_father", "p_a")]);
  assert.equal(
    canGuardianRequestRefundForPayment(ctx, payMother, [allocA], [invoiceA], []),
    false,
  );
});

test("부정: CAPTURED 이전(AUTHORIZED) 결제는 환불 요청 불가", () => {
  const ctx = ctxOf("gd_mother", [linkOf("gd_mother", "p_a")]);
  assert.equal(
    canGuardianRequestRefundForPayment(ctx, { ...payMother, status: "AUTHORIZED" }, [allocA], [invoiceA], []),
    false,
  );
});

test("부정: 진행 중 환불이 있으면 중복 요청 차단", () => {
  const ctx = ctxOf("gd_mother", [linkOf("gd_mother", "p_a")]);
  const inFlight = refundBase({ status: "PROCESSING", approvedAmount: 100000 });
  assert.equal(
    canGuardianRequestRefundForPayment(ctx, payMother, [allocA], [invoiceA], [inFlight]),
    false,
  );
});

test("부정: 남의 결제 배분 혼입·링크 없는 자녀 청구는 거부", () => {
  const ctx = ctxOf("gd_mother", [linkOf("gd_mother", "p_a")]); // p_b 링크 없음
  const foreignAlloc: PaymentAllocation = { ...allocA, id: asId("pa_x"), paymentId: asId("pay_other") };
  assert.equal(
    canGuardianRequestRefundForPayment(ctx, payMother, [foreignAlloc], [invoiceA], []),
    false,
  );
  assert.equal(
    canGuardianRequestRefundForPayment(ctx, payMother, [allocB], [invoiceB], []),
    false, // p_b 는 연결 안 된 자녀
  );
});

/* ── 4) 상태전이 비즈니스 guard ── */

test("PARTIALLY_PAID→VOID: 순수납이 남아 있으면 거부(장부 보호)", () => {
  const inv = { ...invoiceA, status: "PARTIALLY_PAID" as const };
  const i = settlement({}); // allocA 100,000 유효 → 순수납 100,000
  const r = validateInvoiceTransition(inv, "VOID", i);
  assert.equal(r.ok, false);
});

test("PARTIALLY_PAID→VOID: 완료 환불로 순수납 0 이면 허용", () => {
  const inv = { ...invoiceA, status: "PARTIALLY_PAID" as const };
  const i = settlement({
    payments: [{ ...payMother, status: "PARTIALLY_REFUNDED" }],
    refunds: [refundBase({ status: "COMPLETED", approvedAmount: 100000, completedAmount: 100000 })],
    refundAllocations: [raA], // invoiceA 100,000 전액 환불 → 순수납 0
  });
  assert.equal(validateInvoiceTransition(inv, "VOID", i).ok, true);
});

test("상호 승인 후 단독 거절 금지: MUTUALLY_APPROVED→REJECTED 불가", () => {
  assert.equal(canTransitionRefund("MUTUALLY_APPROVED", "REJECTED").ok, false);
  assert.ok(canTransitionRefund("REQUESTED", "REJECTED").ok);       // 거절은 요청 단계에서만
  assert.ok(canTransitionRefund("MUTUALLY_APPROVED", "PROCESSING").ok);
});
