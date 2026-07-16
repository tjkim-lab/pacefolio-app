/* 권한 부정 테스트 (리뷰 R2 §7 + R3 P0-1~4 actor binding)
   전제: ctx 배열에 "남의 데이터"가 섞여 들어와도 통과하면 안 된다. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { asId } from "../ids";
import type {
  AcademyMembership, GuardianParticipantLink, ClassAssignment, Invoice,
} from "../entities";
import { inTenantScope, canAny } from "../permissions";
import {
  canGuardianAccessParticipant, canGuardianPayInvoice, canGuardianRequestRefund,
  canGuardianViewSchedule, canGuardianViewAttendance, canGuardianViewHealthInfo,
  canGuardianReceivePhoto, canGuardianPayInvoices,
  canCoachRecordAttendance, canCoachViewHealthInfo, canAdminUseSupportSession,
  type AuthorizationContext, type SupportViewSession, type SupportTicketRef,
  canSupportViewResource,
} from "../authorization";

const ACA = asId<AcademyMembership["academyId"]>("aca_1");
const ACB = asId<AcademyMembership["academyId"]>("aca_2");
const U_G = asId<AcademyMembership["userId"]>("u_guardian");
const U_C = asId<AcademyMembership["userId"]>("u_coach");
const U_C2 = asId<AcademyMembership["userId"]>("u_coach_other");
const U_ADMIN = asId<AcademyMembership["userId"]>("u_admin");
const G_ME = asId<GuardianParticipantLink["guardianId"]>("g_me");
const G_OTHER = asId<GuardianParticipantLink["guardianId"]>("g_other");
const P_MINE = asId<GuardianParticipantLink["participantId"]>("p_mine");
const P_OTHER = asId<GuardianParticipantLink["participantId"]>("p_other");
const CLASS_MINE = asId<ClassAssignment["classId"]>("cls_mine");
const CLASS_OTHER = asId<ClassAssignment["classId"]>("cls_other");
const NOW = "2026-07-16T12:00:00Z";

function link(over: Partial<GuardianParticipantLink>): GuardianParticipantLink {
  return {
    id: asId("gpl"), guardianId: G_ME, participantId: P_MINE, academyId: ACA,
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
const gCtx = (over: Partial<AuthorizationContext>): AuthorizationContext => ({
  actorUserId: U_G, actorGuardianId: G_ME, memberships: [], verifiedLinks: [link({})],
  assignments: [], nowISO: NOW, ...over,
});
const coachMs: AcademyMembership[] = [
  { id: asId("m_c"), userId: U_C, academyId: ACA, roles: ["COACH"], status: "ACTIVE", joinedAt: "2024-01-01" },
];
function assign(over: Partial<ClassAssignment>): ClassAssignment {
  return {
    id: asId("ca"), academyId: ACA, classId: CLASS_MINE, coachUserId: U_C,
    role: "PRIMARY", status: "ACTIVE", startedAt: "2024-01-01", ...over,
  };
}
const cCtx = (over: Partial<AuthorizationContext>): AuthorizationContext => ({
  actorUserId: U_C, memberships: coachMs, verifiedLinks: [], assignments: [assign({})],
  nowISO: NOW, ...over,
});

/* ── 테넌트 ── */
test("타 학원 리소스 접근 차단", () => {
  assert.equal(inTenantScope([ACA], ACB), false);
});

/* ── 보호자 actor binding (R3 P0-2) ── */
test("연결 안 된 자녀 접근 차단 / 본인 자녀 허용", () => {
  assert.equal(canGuardianAccessParticipant(gCtx({}), P_OTHER), false);
  assert.ok(canGuardianAccessParticipant(gCtx({}), P_MINE));
});
test("R3: 다른 보호자의 VERIFIED 링크가 ctx 에 섞여도 통과 불가(guardianId 결합)", () => {
  // 링크 자체는 VERIFIED 지만 소유자가 G_OTHER — actor(G_ME)는 접근 불가
  const ctx = gCtx({ verifiedLinks: [link({ guardianId: G_OTHER })] });
  assert.equal(canGuardianAccessParticipant(ctx, P_MINE), false);
});
test("R3: actorGuardianId 없으면(보호자 신원 미도출) 모든 링크 무효", () => {
  assert.equal(canGuardianAccessParticipant(gCtx({ actorGuardianId: undefined }), P_MINE), false);
});
test("미검증(PENDING) 링크 접근 불가", () => {
  assert.equal(canGuardianAccessParticipant(gCtx({ verifiedLinks: [link({ verificationStatus: "PENDING" })] }), P_MINE), false);
});

/* ── 보호자 action 별 세부 권한 (R3 P0-4) ── */
test("R3: 세부 flag 가 꺼진 action 은 개별 차단(연결 자체는 유효)", () => {
  const ctx = gCtx({
    verifiedLinks: [link({ canViewHealthInfo: false, canReceivePhotos: false })],
  });
  assert.ok(canGuardianViewSchedule(ctx, P_MINE));       // 켜짐
  assert.ok(canGuardianViewAttendance(ctx, P_MINE));     // 켜짐
  assert.equal(canGuardianViewHealthInfo(ctx, P_MINE), false);  // 꺼짐
  assert.equal(canGuardianReceivePhoto(ctx, P_MINE), false);    // 꺼짐
});
test("타 자녀 Invoice 결제 차단 / canPay·canRequestRefund flag 차단", () => {
  assert.equal(canGuardianPayInvoice(gCtx({}), invoice({ participantId: P_OTHER })), false);
  assert.equal(canGuardianPayInvoice(gCtx({ verifiedLinks: [link({ canPay: false })] }), invoice({})), false);
  assert.equal(canGuardianRequestRefund(gCtx({ verifiedLinks: [link({ canRequestRefund: false })] }), P_MINE), false);
});
test("혼합결제 차단: 서로 다른 학원 Invoice", () => {
  const ctx = gCtx({ verifiedLinks: [link({}), link({ academyId: ACB })] });
  assert.equal(canGuardianPayInvoices(ctx, [invoice({}), invoice({ academyId: ACB })]), false);
});

/* ── 코치 actor binding (R3 P0-1) ── */
test("담당 반 실출결 허용 / 담당 아닌 반 차단", () => {
  assert.ok(canCoachRecordAttendance(cCtx({}), ACA, CLASS_MINE));
  assert.equal(canCoachRecordAttendance(cCtx({}), ACA, CLASS_OTHER), false);
});
test("R3: 같은 반의 '다른 코치' 배정만 ctx 에 있으면 차단(coachUserId 결합)", () => {
  const ctx = cCtx({ assignments: [assign({ coachUserId: U_C2 })] });
  assert.equal(canCoachRecordAttendance(ctx, ACA, CLASS_MINE), false);
});
test("R3: 같은 classId 지만 타 학원 배정 차단(academyId 결합)", () => {
  const ctx = cCtx({ assignments: [assign({ academyId: ACB })] });
  assert.equal(canCoachRecordAttendance(ctx, ACA, CLASS_MINE), false);
});
test("R3: 시작일 이전 배정 무효", () => {
  const ctx = cCtx({ assignments: [assign({ startedAt: "2026-08-01" })] });
  assert.equal(canCoachRecordAttendance(ctx, ACA, CLASS_MINE), false);
});
test("R3: 종료일 지난 배정 무효(ACTIVE 인데 endedAt 과거 = 대체 코치 기간 만료)", () => {
  const ctx = cCtx({ assignments: [assign({ endedAt: "2026-07-01" })] });
  assert.equal(canCoachRecordAttendance(ctx, ACA, CLASS_MINE), false);
});
test("ENDED 배정 차단", () => {
  const ctx = cCtx({ assignments: [assign({ status: "ENDED", endedAt: "2026-06-01" })] });
  assert.equal(canCoachRecordAttendance(ctx, ACA, CLASS_MINE), false);
});
test("R3: 배정은 남았지만 멤버십 SUSPENDED/ENDED 면 차단", () => {
  const suspended: AcademyMembership[] = [
    { id: asId("m_c"), userId: U_C, academyId: ACA, roles: ["COACH"], status: "SUSPENDED", joinedAt: "2024-01-01" },
  ];
  assert.equal(canCoachRecordAttendance(cCtx({ memberships: suspended }), ACA, CLASS_MINE), false);
});
test("담당 아닌 반 건강정보 차단", () => {
  assert.equal(canCoachViewHealthInfo(cCtx({}), ACA, CLASS_OTHER), false);
});

/* ── 능력 매트릭스 ── */
test("코치 결제금액 조회 불가 / 원장 플랫폼 관리 불가", () => {
  assert.equal(canAny(["COACH"], "VIEW_PAYMENT_AMOUNT"), false);
  assert.equal(canAny(["OWNER"], "MANAGE_PLATFORM"), false);
});

/* ── Support View (R3 P0-3 · R4 §10) ── */
function svSession(over: Partial<SupportViewSession>): SupportViewSession {
  return {
    id: asId("svs_1"), adminUserId: U_ADMIN, targetAcademyId: ACA,
    supportTicketId: asId("tik_1"), reasonCode: "CS_BILLING",
    allowedResources: ["BILLING_SUMMARY", "PAYMENT_STATUS"],
    expiresAt: "2026-07-16T12:15:00Z", ...over,
  };
}
function svTicket(over: Partial<SupportTicketRef>): SupportTicketRef {
  return {
    id: asId("tik_1"), targetAcademyId: ACA, assigneeAdminUserId: U_ADMIN,
    status: "IN_PROGRESS", ...over,
  };
}
const adminCtx = (over: Partial<AuthorizationContext>): AuthorizationContext => ({
  actorUserId: U_ADMIN, actorPlatformRoles: ["PLATFORM_ADMIN"],
  memberships: [], verifiedLinks: [], assignments: [],
  supportViewSession: svSession({}), supportTicket: svTicket({}),
  mfaVerifiedAt: "2026-07-16T11:50:00Z",
  nowISO: NOW, ...over,
});
test("Support View 정상: 관리자+MFA+본인세션+티켓 → 허용", () => {
  assert.ok(canAdminUseSupportSession(adminCtx({}), ACA));
});
test("R3: PLATFORM_ADMIN 아니면 세션이 있어도 차단(일반 사용자 컨텍스트 오염 방어)", () => {
  assert.equal(canAdminUseSupportSession(adminCtx({ actorPlatformRoles: [] }), ACA), false);
  assert.equal(canAdminUseSupportSession(adminCtx({ actorPlatformRoles: undefined }), ACA), false);
});
test("R3: 남의 세션 재사용 차단(adminUserId ≠ actor)", () => {
  const ctx = adminCtx({ supportViewSession: svSession({ adminUserId: asId<AcademyMembership["userId"]>("u_someone") }) });
  assert.equal(canAdminUseSupportSession(ctx, ACA), false);
});
test("R3: MFA 미인증·만료(30분 초과) 차단", () => {
  assert.equal(canAdminUseSupportSession(adminCtx({ mfaVerifiedAt: null }), ACA), false);
  assert.equal(canAdminUseSupportSession(adminCtx({ mfaVerifiedAt: "2026-07-16T11:00:00Z" }), ACA), false); // 60분 전
});
test("R3: 철회된 세션 차단", () => {
  const ctx = adminCtx({ supportViewSession: svSession({ revokedAt: "2026-07-16T11:59:00Z" }) });
  assert.equal(canAdminUseSupportSession(ctx, ACA), false);
});
test("세션 만료·타학원 차단", () => {
  assert.equal(canAdminUseSupportSession(adminCtx({ nowISO: "2026-07-16T12:30:00Z", mfaVerifiedAt: "2026-07-16T12:20:00Z" }), ACA), false); // 만료
  assert.equal(canAdminUseSupportSession(adminCtx({}), ACB), false); // 타학원
});

/* ── R4 §10: 티켓 실검증 + 리소스 allowlist ── */
test("R4: 티켓 미조회·CLOSED·다른 티켓·타담당·타학원 티켓 전부 차단", () => {
  assert.equal(canAdminUseSupportSession(adminCtx({ supportTicket: null }), ACA), false);
  assert.equal(canAdminUseSupportSession(adminCtx({ supportTicket: svTicket({ status: "CLOSED" }) }), ACA), false);
  assert.equal(canAdminUseSupportSession(adminCtx({ supportTicket: svTicket({ status: "OPEN" }) }), ACA), false); // 승인 전
  assert.equal(canAdminUseSupportSession(adminCtx({ supportTicket: svTicket({ id: asId<SupportTicketRef["id"]>("tik_other") }) }), ACA), false); // 세션과 다른 티켓
  assert.equal(canAdminUseSupportSession(adminCtx({ supportTicket: svTicket({ assigneeAdminUserId: asId<AcademyMembership["userId"]>("u_other_admin") }) }), ACA), false);
  assert.equal(canAdminUseSupportSession(adminCtx({ supportTicket: svTicket({ targetAcademyId: ACB }) }), ACA), false);
  assert.equal(canAdminUseSupportSession(adminCtx({ supportTicket: svTicket({ revokedAt: "2026-07-16T11:59:00Z" }) }), ACA), false);
});

test("R4: 리소스 allowlist — 세션 유효해도 목록 밖 리소스는 차단", () => {
  const ctx = adminCtx({}); // allowedResources = BILLING_SUMMARY, PAYMENT_STATUS
  assert.ok(canSupportViewResource(ctx, ACA, "BILLING_SUMMARY"));
  assert.ok(canSupportViewResource(ctx, ACA, "PAYMENT_STATUS"));
  assert.equal(canSupportViewResource(ctx, ACA, "USER_PROFILE_MASKED"), false); // 목록 밖
  assert.equal(canSupportViewResource(ctx, ACA, "AUDIT_TIMELINE"), false);
  // 세션이 무효면 목록 안 리소스도 불가
  assert.equal(canSupportViewResource(adminCtx({ supportTicket: null }), ACA, "BILLING_SUMMARY"), false);
});
