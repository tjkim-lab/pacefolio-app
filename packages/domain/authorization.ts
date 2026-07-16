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
  Payment, PaymentAllocation, Refund,
} from "./entities";
import type {
  AcademyId, ParticipantId, ClassId, UserId, GuardianId, SupportTicketId,
  SupportViewSessionId,
} from "./ids";
import type { Role } from "./enums";
import { canAny } from "./permissions";
import { academyIdsForUser, rolesInAcademy } from "./membership";
import { withinActiveWindow, credentialExpired, ageMsOrNull } from "./time";

/* ── Support View 리소스 allowlist (R4 §10) ──
   세션이 있어도 학원 데이터 전체 접근 불가 — 읽기 전용 요약 리소스만.
   기본 금지(리소스로 정의하지 않음): 결제 실행 · 환불 승인 · 동의 수정 ·
   원생 정보 수정 · 계정 삭제 · 원문 건강정보 · 전체 전화번호 · 사진 원본 ·
   대량 export. 쓰기 작업은 Support View 로 절대 불가. */
export const SUPPORT_VIEW_RESOURCES = [
  "BILLING_SUMMARY",      // 수납 요약(개별 금액 아님)
  "ATTENDANCE_SUMMARY",   // 출결 요약
  "USER_PROFILE_MASKED",  // 마스킹된 프로필
  "PAYMENT_STATUS",       // 결제 상태(실행 불가)
  "AUDIT_TIMELINE",       // 감사 타임라인
] as const;
export type SupportViewResource = (typeof SUPPORT_VIEW_RESOURCES)[number];

/** 세션 발급의 근거 티켓 — 발급·사용 시 서버가 함께 검증(R4 §10). */
export interface SupportTicketRef {
  id: SupportTicketId;
  targetAcademyId: AcademyId;
  assigneeAdminUserId: UserId;
  status: "OPEN" | "APPROVED" | "IN_PROGRESS" | "CLOSED";
  revokedAt?: string | null;
  closedAt?: string | null;
}

/** Support View 세션 (R3 P0-3 — 최소 필드 확장 · R4 §10 allowlist) */
export interface SupportViewSession {
  id: SupportViewSessionId;
  adminUserId: UserId;          // 세션 발급받은 관리자 — actor 와 일치해야 함
  targetAcademyId: AcademyId;
  supportTicketId: SupportTicketId; // 승인된 티켓 없이 발급 불가
  allowedResources: readonly SupportViewResource[]; // 발급 시 티켓 범위로 고정
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
  supportTicket?: SupportTicketRef | null;            // 세션의 근거 티켓(서버 조회) — R4 §10
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
/** ⚠️ 링크 flag 확인만 — 필요조건이지 충분조건 아님.
   실제 환불 요청 판단은 canGuardianRequestRefundForPayment(결제자 소유권 결합)를 쓴다. */
export function canGuardianRequestRefund(ctx: AuthorizationContext, participantId: ParticipantId): boolean {
  const l = linkFor(ctx, participantId);
  return !!l && l.canRequestRefund;
}

/* ── 환불 요청 = 실제 결제자 소유권 결합 (R4 P0-3) ──
   "같은 자녀에 VERIFIED 연결"만으로는 부족 — 어머니가 결제한 건을
   아버지가 환불 요청하는 것을 암묵 허용하면 안 된다.
   기본 정책: Payment.guardianId === actorGuardianId (실제 결제자만).
   위임이 필요하면 별도 PaymentAuthority 모델로 명시(암묵 허용 금지). */
export function canGuardianRequestRefundForPayment(
  ctx: AuthorizationContext,
  payment: Payment,
  allocations: readonly PaymentAllocation[],   // 이 Payment 의 배분(환불 대상)
  invoices: readonly Invoice[],                // 배분이 가리키는 Invoice 들
  existingRefunds: readonly Refund[],          // 이 Payment 의 기존 환불들(중복 차단)
): boolean {
  // (1) 실제 결제자 본인
  if (!ctx.actorGuardianId) return false;
  if (payment.guardianId !== ctx.actorGuardianId) return false;
  // (2) 결제 상태: 환불 가능한 상태만 (PENDING/AUTHORIZED/FAILED/CANCELLED/REFUNDED 불가)
  if (payment.status !== "CAPTURED" && payment.status !== "PARTIALLY_REFUNDED") return false;
  // (3) 배분 대상 Invoice 전부: 같은 결제·같은 학원·연결 자녀·환불 flag
  if (allocations.length === 0) return false;
  const invoiceById = new Map(invoices.map((inv) => [inv.id, inv]));
  for (const a of allocations) {
    if (a.paymentId !== payment.id) return false;          // 남의 결제 배분 혼입
    const inv = invoiceById.get(a.invoiceId);
    if (!inv) return false;                                 // 실존하지 않는 청구
    if (inv.academyId !== payment.academyId) return false;  // 테넌트 불일치
    const l = linkFor(ctx, inv.participantId);
    if (!l || !l.canRequestRefund) return false;            // 연결 자녀 + flag
    if (l.academyId !== payment.academyId) return false;
  }
  // (4) 같은 Payment 에 진행 중 환불 있으면 중복 요청 차단
  const inFlight = existingRefunds.some(
    (r) =>
      r.paymentId === payment.id &&
      (r.status === "REQUESTED" || r.status === "MUTUALLY_APPROVED" ||
       r.status === "PROCESSING" || r.status === "UNKNOWN"),
  );
  if (inFlight) return false;
  return true;
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
      // 기간 [startedAt, endedAt) — epoch 비교·파싱 실패 시 비활성(R4 P0-9 fail-closed)
      withinActiveWindow(a.startedAt, a.endedAt, ctx.nowISO),
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
  // 파싱 실패·미래 시각 = null → 거부 (R4 P0-9 fail-closed)
  const age = ageMsOrNull(ctx.mfaVerifiedAt, ctx.nowISO);
  return age !== null && age <= MFA_FRESHNESS_MINUTES * 60_000;
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
  if (credentialExpired(s.expiresAt, ctx.nowISO)) return false; // epoch 비교·fail-closed
  // (4) R4 §10: 근거 티켓 실검증 — ID 존재만으로 부족
  const t = ctx.supportTicket;
  if (!t) return false;                                  // 티켓 미조회 = 거부(fail-closed)
  if (t.id !== s.supportTicketId) return false;          // 다른 티켓 바꿔치기 차단
  if (t.status !== "APPROVED" && t.status !== "IN_PROGRESS") return false;
  if (t.targetAcademyId !== s.targetAcademyId) return false;
  if (t.assigneeAdminUserId !== s.adminUserId) return false; // 담당자 결합
  if (t.revokedAt || t.closedAt) return false;
  return true;
}

/** R4 §10: 리소스별 접근 — 세션이 유효해도 allowlist 에 있는 리소스만.
   서버는 이 함수로 리소스 단위 판단 + 조회 사실을 AuditLog 에 기록한다. */
export function canSupportViewResource(
  ctx: AuthorizationContext,
  targetAcademyId: AcademyId,
  resource: SupportViewResource,
): boolean {
  if (!canAdminUseSupportSession(ctx, targetAcademyId)) return false;
  return ctx.supportViewSession!.allowedResources.includes(resource);
}
