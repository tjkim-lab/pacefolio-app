/* =========================================================
   PACEFOLIO 공유 도메인 — 리소스 권한 (리뷰 R2 §7 · R3 P0-1~4)
   ---------------------------------------------------------
   R3 보완: "ctx 배열은 이미 actor 기준으로 필터됐다"는 전제를 버린다.
   권한 함수 = 보안 경계 → 모든 판단에서 actor 결합을 내부에서 재검증:
   - 코치 배정: coachUserId=actor AND academy AND 기간(startedAt≤now<endedAt)
   - 보호자 링크: link.guardianId = ctx.actorGuardianId AND academy
   - Support View: PLATFORM_ADMIN 역할 + SUPPORT_VIEW 능력 + 세션 소유자=actor
     + 만료·철회 + MFA freshness + ticket 존재
   ⚠️ ctx 는 서버가 세션에서 도출(클라 입력 아님). 그래도 함수는 재검증한다.
   ========================================================= */
import type {
  AcademyMembership, GuardianParticipantLink, ClassAssignment, Invoice,
} from "./entities";
import type {
  AcademyId, ParticipantId, ClassId, UserId, GuardianId, SupportTicketId,
  SupportViewSessionId,
} from "./ids";
import type { Role } from "./enums";
import { canAny } from "./permissions";
import { academyIdsForUser, rolesInAcademy } from "./membership";

/** Support View 세션 (R3 P0-3 — 최소 필드 확장) */
export interface SupportViewSession {
  id: SupportViewSessionId;
  adminUserId: UserId;          // 세션 발급받은 관리자 — actor 와 일치해야 함
  targetAcademyId: AcademyId;
  supportTicketId: SupportTicketId; // 승인된 티켓 없이 발급 불가
  reasonCode: string;
  expiresAt: string;            // ISO
  revokedAt?: string | null;
}

/** MFA freshness 한도(분) — Support View 등 민감 작업 기준 */
export const MFA_FRESHNESS_MINUTES = 30;

/** 서버가 세션에서 도출하는 권한 컨텍스트(클라 입력 아님). */
export interface AuthorizationContext {
  actorUserId: UserId;
  actorGuardianId?: GuardianId;                       // 보호자 판단의 결합 축(R3 P0-2)
  actorPlatformRoles?: readonly Role[];               // 플랫폼 레벨 역할(서버 도출)
  memberships: readonly AcademyMembership[];          // actor 의 학원 소속
  verifiedLinks: readonly GuardianParticipantLink[];  // 보호자-자녀 링크(전체가 와도 안전해야 함)
  assignments: readonly ClassAssignment[];            // 코치 배정(전체가 와도 안전해야 함)
  supportViewSession?: SupportViewSession | null;
  mfaVerifiedAt?: string | null;                      // 마지막 MFA 성공 시각(ISO)
  nowISO: string;
}

/* ── 보호자: actor 본인 + academy + VERIFIED 로 결합 (R3 P0-2) ── */
function linkFor(
  ctx: AuthorizationContext,
  participantId: ParticipantId,
): GuardianParticipantLink | undefined {
  if (!ctx.actorGuardianId) return undefined; // 보호자 신원 없으면 어떤 링크도 무효
  return ctx.verifiedLinks.find(
    (l) =>
      l.guardianId === ctx.actorGuardianId &&   // ← actor 결합(타 보호자 링크 혼입 방어)
      l.participantId === participantId &&
      l.verificationStatus === "VERIFIED",
  );
}

export function canGuardianAccessParticipant(ctx: AuthorizationContext, participantId: ParticipantId): boolean {
  return !!linkFor(ctx, participantId);
}

/* R3 P0-4: 세부 권한 flag 를 무시하지 않도록 action 별 함수 분리 */
export function canGuardianViewSchedule(ctx: AuthorizationContext, participantId: ParticipantId): boolean {
  const l = linkFor(ctx, participantId);
  return !!l && l.canViewSchedule;
}
export function canGuardianViewAttendance(ctx: AuthorizationContext, participantId: ParticipantId): boolean {
  const l = linkFor(ctx, participantId);
  return !!l && l.canViewAttendance;
}
/** 건강·안전정보 — 일반 접근보다 엄격. 서버는 조회 사유·감사로그도 함께 기록해야 함. */
export function canGuardianViewHealthInfo(ctx: AuthorizationContext, participantId: ParticipantId): boolean {
  const l = linkFor(ctx, participantId);
  return !!l && l.canViewHealthInfo;
}
export function canGuardianReceivePhoto(ctx: AuthorizationContext, participantId: ParticipantId): boolean {
  const l = linkFor(ctx, participantId);
  return !!l && l.canReceivePhotos;
}
export function canGuardianPayInvoice(ctx: AuthorizationContext, invoice: Invoice): boolean {
  const l = linkFor(ctx, invoice.participantId);
  return !!l && l.canPay && invoice.academyId === l.academyId;
}
export function canGuardianRequestRefund(ctx: AuthorizationContext, participantId: ParticipantId): boolean {
  const l = linkFor(ctx, participantId);
  return !!l && l.canRequestRefund;
}

/** 합산결제 대상이 모두 같은 학원 & 모두 결제 가능 자녀인지(혼합결제 차단). */
export function canGuardianPayInvoices(ctx: AuthorizationContext, invoices: readonly Invoice[]): boolean {
  if (invoices.length === 0) return false;
  const academies = new Set(invoices.map((inv) => inv.academyId));
  if (academies.size > 1) return false;
  return invoices.every((inv) => canGuardianPayInvoice(ctx, inv));
}

/* ── 코치: actor + academy + class + 기간으로 결합 (R3 P0-1) ── */
function activeAssignmentFor(
  ctx: AuthorizationContext,
  academyId: AcademyId,
  classId: ClassId,
): ClassAssignment | undefined {
  return ctx.assignments.find(
    (a) =>
      a.coachUserId === ctx.actorUserId &&  // ← actor 결합(타 코치 배정 혼입 방어)
      a.academyId === academyId &&          // ← 같은 classId 라도 타 학원 배정 무효
      a.classId === classId &&
      a.status === "ACTIVE" &&
      a.startedAt <= ctx.nowISO &&          // 시작 전 배정 무효
      (!a.endedAt || ctx.nowISO < a.endedAt), // 종료(대체 기간 만료 포함) 후 무효
  );
}

export function canCoachAccessClass(ctx: AuthorizationContext, academyId: AcademyId, classId: ClassId): boolean {
  // 멤버십 ACTIVE(SUSPENDED/ENDED 면 배정이 남아도 차단) + 역할 능력 + 배정 결합
  if (!academyIdsForUser(ctx.memberships, ctx.actorUserId).includes(academyId)) return false;
  if (!canAny(rolesInAcademy(ctx.memberships, ctx.actorUserId, academyId), "RECORD_ATTENDANCE")) return false;
  return !!activeAssignmentFor(ctx, academyId, classId);
}
export function canCoachRecordAttendance(ctx: AuthorizationContext, academyId: AcademyId, classId: ClassId): boolean {
  return canCoachAccessClass(ctx, academyId, classId);
}
export function canCoachViewHealthInfo(ctx: AuthorizationContext, academyId: AcademyId, classId: ClassId): boolean {
  if (!academyIdsForUser(ctx.memberships, ctx.actorUserId).includes(academyId)) return false;
  if (!canAny(rolesInAcademy(ctx.memberships, ctx.actorUserId, academyId), "VIEW_HEALTH_INFO")) return false;
  return !!activeAssignmentFor(ctx, academyId, classId);
}

/* ── Support View: 관리자 신원·능력·세션 소유·MFA 결합 (R3 P0-3) ── */
function mfaFresh(ctx: AuthorizationContext): boolean {
  if (!ctx.mfaVerifiedAt) return false;
  const ageMs = Date.parse(ctx.nowISO) - Date.parse(ctx.mfaVerifiedAt);
  return ageMs >= 0 && ageMs <= MFA_FRESHNESS_MINUTES * 60_000;
}

export function canAdminUseSupportSession(ctx: AuthorizationContext, targetAcademyId: AcademyId): boolean {
  // (1) actor 가 플랫폼 관리자 역할 + SUPPORT_VIEW 능력
  const roles = ctx.actorPlatformRoles ?? [];
  if (!roles.includes("PLATFORM_ADMIN")) return false;
  if (!canAny(roles, "SUPPORT_VIEW")) return false;
  // (2) MFA freshness
  if (!mfaFresh(ctx)) return false;
  // (3) 세션 자체 검증: 소유자=actor, 대상 학원, 티켓, 만료, 철회
  const s = ctx.supportViewSession;
  if (!s) return false;
  if (s.adminUserId !== ctx.actorUserId) return false; // 남의 세션 재사용 차단
  if (s.targetAcademyId !== targetAcademyId) return false;
  if (!s.supportTicketId) return false;
  if (s.revokedAt) return false;
  if (s.expiresAt <= ctx.nowISO) return false;
  return true;
}
