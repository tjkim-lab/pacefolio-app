/* 권한 부정 테스트 12종 (리뷰 R2 §7·§14 — 자동화 필수) */
import { test } from "node:test";
import assert from "node:assert/strict";
import { asId } from "../ids";
import type {
  AcademyMembership, GuardianParticipantLink, ClassAssignment, Invoice,
} from "../entities";
import { inTenantScope, canAny } from "../permissions";
import {
  canGuardianAccessParticipant, canGuardianPayInvoice, canGuardianRequestRefund,
  canCoachRecordAttendance, canCoachViewHealthInfo, canAdminUseSupportSession,
  canGuardianPayInvoices, type AuthorizationContext,
} from "../authorization";

const ACA = asId<AcademyMembership["academyId"]>("aca_1");
const ACB = asId<AcademyMembership["academyId"]>("aca_2");
const U_G = asId<AcademyMembership["userId"]>("u_guardian");
const U_C = asId<AcademyMembership["userId"]>("u_coach");
const P_MINE = asId<GuardianParticipantLink["participantId"]>("p_mine");
const P_OTHER = asId<GuardianParticipantLink["participantId"]>("p_other");
const CLASS_MINE = asId<ClassAssignment["classId"]>("cls_mine");
const CLASS_OTHER = asId<ClassAssignment["classId"]>("cls_other");

function link(over: Partial<GuardianParticipantLink>): GuardianParticipantLink {
  return {
    id: asId("gpl"), guardianId: asId("g_1"), participantId: P_MINE, academyId: ACA,
    relationshipType: "MOTHER", isPrimaryGuardian: true, verificationStatus: "VERIFIED",
    canViewSchedule: true, canViewAttendance: true, canViewHealthInfo: true,
    canReceivePhotos: true, canPay: true, canRequestRefund: true, ...over,
  };
}
function invoice(over: Partial<Invoice>): Invoice {
  return {
    id: asId("inv"), academyId: ACA, participantId: P_MINE, enrollmentId: asId("enr"),
    billingPeriodId: asId("bp"), status: "ISSUED", total: 210000, dueDate: "2026-08-10", ...over,
  };
}
const guardianCtx = (over: Partial<AuthorizationContext>): AuthorizationContext => ({
  actorUserId: U_G, memberships: [], verifiedLinks: [link({})], assignments: [],
  nowISO: "2026-07-16T00:00:00Z", ...over,
});
const coachMs: AcademyMembership[] = [
  { id: asId("m_c"), userId: U_C, academyId: ACA, roles: ["COACH"], status: "ACTIVE", joinedAt: "2024-01-01" },
];
const assign: ClassAssignment = {
  id: asId("ca"), academyId: ACA, classId: CLASS_MINE, coachUserId: U_C,
  role: "PRIMARY", status: "ACTIVE", startedAt: "2024-01-01",
};
const coachCtx = (over: Partial<AuthorizationContext>): AuthorizationContext => ({
  actorUserId: U_C, memberships: coachMs, verifiedLinks: [], assignments: [assign],
  nowISO: "2026-07-16T00:00:00Z", ...over,
});

// 1) 다른 학원 participant 접근 (테넌트)
test("① 다른 학원 리소스 접근 차단", () => {
  assert.equal(inTenantScope([ACA], ACB), false);
});
// 2) 다른 보호자의 자녀 접근
test("② 연결 안 된 자녀 접근 차단", () => {
  assert.equal(canGuardianAccessParticipant(guardianCtx({}), P_OTHER), false);
  assert.ok(canGuardianAccessParticipant(guardianCtx({}), P_MINE));
});
// 3) 다른 보호자의 Invoice 결제
test("③ 연결 안 된 자녀 Invoice 결제 차단", () => {
  assert.equal(canGuardianPayInvoice(guardianCtx({}), invoice({ participantId: P_OTHER })), false);
});
// 4) canPay 없는 링크
test("④ canPay 없는 보호자는 결제 불가", () => {
  assert.equal(canGuardianPayInvoice(guardianCtx({ verifiedLinks: [link({ canPay: false })] }), invoice({})), false);
});
// 5) 미검증 링크
test("⑤ 미검증(PENDING) 링크는 접근 불가", () => {
  assert.equal(canGuardianAccessParticipant(guardianCtx({ verifiedLinks: [link({ verificationStatus: "PENDING" })] }), P_MINE), false);
});
// 6) 환불 요청 권한 없음
test("⑥ canRequestRefund 없으면 환불 요청 불가", () => {
  assert.equal(canGuardianRequestRefund(guardianCtx({ verifiedLinks: [link({ canRequestRefund: false })] }), P_MINE), false);
});
// 7) 담당 아닌 반 실출결
test("⑦ 담당 아닌 반의 실출결 기록 차단", () => {
  assert.equal(canCoachRecordAttendance(coachCtx({}), ACA, CLASS_OTHER), false);
  assert.ok(canCoachRecordAttendance(coachCtx({}), ACA, CLASS_MINE));
});
// 8) ENDED 코치 배정 재사용
test("⑧ ENDED 배정 코치의 세션 접근 차단", () => {
  const ended = { ...assign, status: "ENDED" as const, endedAt: "2026-06-01" };
  assert.equal(canCoachRecordAttendance(coachCtx({ assignments: [ended] }), ACA, CLASS_MINE), false);
});
// 9) 담당 아닌 코치의 건강정보
test("⑨ 담당 아닌 반 건강정보 차단", () => {
  assert.equal(canCoachViewHealthInfo(coachCtx({}), ACA, CLASS_OTHER), false);
});
// 10) 코치의 결제금액 조회
test("⑩ 코치는 결제금액 조회 불가", () => {
  assert.equal(canAny(["COACH"], "VIEW_PAYMENT_AMOUNT"), false);
});
// 11) 원장의 플랫폼 Admin 능력
test("⑪ 원장은 플랫폼(본사) 관리 불가", () => {
  assert.equal(canAny(["OWNER"], "MANAGE_PLATFORM"), false);
});
// 12) Support View 만료 후 + 다른 학원 + 혼합결제
test("⑫ Support View 만료·타학원 차단 / 혼합결제 차단", () => {
  const s = { academyId: ACA, expiresAt: "2026-07-16T00:15:00Z" };
  assert.equal(canAdminUseSupportSession(guardianCtx({ supportViewSession: s, nowISO: "2026-07-16T00:30:00Z" }), ACA), false); // 만료
  assert.equal(canAdminUseSupportSession(guardianCtx({ supportViewSession: s }), ACB), false); // 타학원
  assert.ok(canAdminUseSupportSession(guardianCtx({ supportViewSession: s }), ACA)); // 유효
  // 혼합결제: 서로 다른 학원 Invoice
  const ctx = guardianCtx({ verifiedLinks: [link({}), link({ academyId: ACB, participantId: P_MINE })] });
  assert.equal(canGuardianPayInvoices(ctx, [invoice({}), invoice({ academyId: ACB })]), false);
});
