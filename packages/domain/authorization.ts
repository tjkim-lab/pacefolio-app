/* =========================================================
   PACEFOLIO 공유 도메인 — 리소스 권한 (리뷰 R2 §7)
   ---------------------------------------------------------
   can()/inTenantScope() 는 필요조건. 실제 리소스 접근은
   "역할 능력 AND 테넌트 AND 소유/담당/연결 스코프" 를 모두 통과해야 함.
   ⚠️ 클라이언트가 준 role·academyId·participantId·permission 신뢰 금지 —
      아래 함수는 전부 서버가 세션에서 도출한 데이터를 인자로 받는다.
   ========================================================= */
import type {
  AcademyMembership, GuardianParticipantLink, ClassAssignment, Invoice,
} from "./entities";
import type { AcademyId, ParticipantId, ClassId, UserId } from "./ids";
import { canAny } from "./permissions";
import { academyIdsForUser, rolesInAcademy } from "./membership";

export interface SupportViewSession {
  academyId: AcademyId;
  expiresAt: string; // ISO
}

/** 서버가 세션에서 도출하는 권한 컨텍스트(클라 입력 아님). */
export interface AuthorizationContext {
  actorUserId: UserId;
  memberships: readonly AcademyMembership[];        // actor 의 학원 소속
  verifiedLinks: readonly GuardianParticipantLink[]; // actor(보호자)의 검증된 자녀 연결
  assignments: readonly ClassAssignment[];           // actor(코치)의 담당 배정
  supportViewSession?: SupportViewSession | null;
  nowISO: string;
}

/* --- 보호자 --- */
function verifiedLinkTo(ctx: AuthorizationContext, participantId: ParticipantId): GuardianParticipantLink | undefined {
  return ctx.verifiedLinks.find(
    (l) => l.participantId === participantId && l.verificationStatus === "VERIFIED",
  );
}

export function canGuardianAccessParticipant(ctx: AuthorizationContext, participantId: ParticipantId): boolean {
  return !!verifiedLinkTo(ctx, participantId);
}

export function canGuardianPayInvoice(ctx: AuthorizationContext, invoice: Invoice): boolean {
  const link = verifiedLinkTo(ctx, invoice.participantId);
  return !!link && link.canPay && invoice.academyId === link.academyId;
}

export function canGuardianRequestRefund(ctx: AuthorizationContext, participantId: ParticipantId): boolean {
  const link = verifiedLinkTo(ctx, participantId);
  return !!link && link.canRequestRefund;
}

/* --- 코치(담당 배정 스코프) --- */
function activeAssignmentTo(ctx: AuthorizationContext, classId: ClassId): ClassAssignment | undefined {
  return ctx.assignments.find(
    (a) => a.classId === classId && a.status === "ACTIVE" && !a.endedAt,
  );
}

export function canCoachAccessClass(ctx: AuthorizationContext, academyId: AcademyId, classId: ClassId): boolean {
  if (!academyIdsForUser(ctx.memberships, ctx.actorUserId).includes(academyId)) return false;
  if (!canAny(rolesInAcademy(ctx.memberships, ctx.actorUserId, academyId), "RECORD_ATTENDANCE")) return false;
  return !!activeAssignmentTo(ctx, classId);
}

export function canCoachRecordAttendance(ctx: AuthorizationContext, academyId: AcademyId, classId: ClassId): boolean {
  return canCoachAccessClass(ctx, academyId, classId);
}

export function canCoachViewHealthInfo(ctx: AuthorizationContext, academyId: AcademyId, classId: ClassId): boolean {
  if (!academyIdsForUser(ctx.memberships, ctx.actorUserId).includes(academyId)) return false;
  if (!canAny(rolesInAcademy(ctx.memberships, ctx.actorUserId, academyId), "VIEW_HEALTH_INFO")) return false;
  return !!activeAssignmentTo(ctx, classId); // 담당 반으로 제한
}

/* --- 플랫폼 관리자 Support View --- */
export function canAdminUseSupportSession(ctx: AuthorizationContext, targetAcademyId: AcademyId): boolean {
  const s = ctx.supportViewSession;
  if (!s) return false;
  if (s.academyId !== targetAcademyId) return false;
  if (s.expiresAt <= ctx.nowISO) return false; // 만료
  return true;
}

/** 합산결제 대상 Invoice 들이 모두 같은 학원 & 모두 결제 가능 자녀인지(혼합결제 차단). */
export function canGuardianPayInvoices(ctx: AuthorizationContext, invoices: readonly Invoice[]): boolean {
  if (invoices.length === 0) return false;
  const academies = new Set(invoices.map((inv) => inv.academyId));
  if (academies.size > 1) return false; // 서로 다른 학원 혼합 금지
  return invoices.every((inv) => canGuardianPayInvoice(ctx, inv));
}
