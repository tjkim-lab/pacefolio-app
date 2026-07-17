/* =========================================================
   PACEFOLIO DB 스키마 — Phase 1: Identity · Session 기반 (R5 §7)
   ---------------------------------------------------------
   정본 규칙 출처 = packages/domain (entities·enums·docs/11).
   DB 는 문서의 불변식을 "제약"으로 강제한다 (R5 §6.1):
   - ExternalIdentity(provider, providerSubject) UNIQUE
   - Session 토큰 원문 저장 금지 — tokenHash 만
   - AcademyMembership(userId, academyId) UNIQUE (멀티역할 모델 A: roles[])
   - GuardianLink(guardianId, participantId, academyId) UNIQUE
   - 모든 시각 = timestamptz(UTC) · 낙관잠금 = version int
   - 테넌트 리소스는 academyId 포함
   ID = 도메인 Brand<string> 그대로 text PK (prefix+random, 서버 생성).
   ========================================================= */
import { sql } from "drizzle-orm";
import {
  pgTable, pgEnum, text, timestamp, boolean, integer, date,
  uniqueIndex, index, check,
} from "drizzle-orm/pg-core";

/* ── enum (packages/domain/enums.ts 와 drift 검증 대상) ── */
export const oauthProviderEnum = pgEnum("oauth_provider", ["kakao", "naver", "google", "apple"]);
export const roleEnum = pgEnum("role", ["OWNER", "MANAGER", "COACH", "DESK", "DRIVER", "GUARDIAN", "PLATFORM_ADMIN"]);
export const membershipStatusEnum = pgEnum("membership_status", ["INVITED", "ACTIVE", "SUSPENDED", "ENDED"]);
export const relationshipTypeEnum = pgEnum("relationship_type", ["MOTHER", "FATHER", "GRANDPARENT", "LEGAL_GUARDIAN", "OTHER"]);
export const verificationStatusEnum = pgEnum("verification_status", ["UNVERIFIED", "PENDING", "VERIFIED", "REJECTED"]);
export const invoiceStatusEnum = pgEnum("invoice_status", ["DRAFT", "ISSUED", "PARTIALLY_PAID", "PAID", "OVERDUE", "VOID", "REFUNDED"]);
export const paymentStatusEnum = pgEnum("payment_status", ["PENDING", "AUTHORIZED", "CAPTURED", "FAILED", "CANCELLED", "PARTIALLY_REFUNDED", "REFUNDED"]);
export const invoiceLineTypeEnum = pgEnum("invoice_line_type", ["TUITION", "VEHICLE", "DISCOUNT", "OTHER"]);

/* 공통 컬럼 헬퍼 */
const createdAt = () => timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull();
const updatedAt = () => timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull();
const version = () => integer("version").default(1).notNull(); // 낙관적 잠금

/* ── 계정 ── */
export const users = pgTable("users", {
  id: text("id").primaryKey(),                    // u_xxx
  name: text("name").notNull(),
  phone: text("phone").notNull(),                 // 인증된 연락처(E.164 정규화는 서비스 계층)
  email: text("email"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  version: version(),
});

/* 소셜 계정 연결 — 동일 이메일 자동 병합 금지(docs/11 §B): 병합은 별도 절차 */
export const externalIdentities = pgTable("external_identities", {
  id: text("id").primaryKey(),                    // xid_xxx
  userId: text("user_id").notNull().references(() => users.id),
  provider: oauthProviderEnum("provider").notNull(),
  providerSubject: text("provider_subject").notNull(), // provider 의 고유 사용자 ID
  verifiedEmail: text("verified_email"),          // provider 가 verified 로 준 값만
  verifiedPhone: text("verified_phone"),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("uq_external_identity").on(t.provider, t.providerSubject), // R5 필수
  index("ix_external_identity_user").on(t.userId),
]);

/* 세션 — 토큰 원문 저장 금지(R5 필수). 쿠키 pf_session 값의 hash 만. */
export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),                    // ses_xxx
  userId: text("user_id").notNull().references(() => users.id),
  tokenHash: text("token_hash").notNull(),        // SHA-256(원문) — 원문 컬럼 자체가 없음
  issuedAt: timestamp("issued_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "string" }),
  rotatedFromId: text("rotated_from_id"),         // 로그인·권한 상승 rotation 계보
  ip: text("ip"),
  userAgent: text("user_agent"),
}, (t) => [
  uniqueIndex("uq_session_token_hash").on(t.tokenHash),
  index("ix_session_expiry").on(t.expiresAt),               // 만료 정리·검증 (R5)
  index("ix_session_user_active").on(t.userId, t.revokedAt), // logout-all·활성 조회 (R5)
]);

/* OAuth 진행 상태 — state 서버 저장·일회성 소비(docs/11 §B) */
export const oauthAuthorizationRequests = pgTable("oauth_authorization_requests", {
  id: text("id").primaryKey(),                    // oar_xxx
  provider: oauthProviderEnum("provider").notNull(),
  stateHash: text("state_hash").notNull(),        // hash 저장(원문 금지)
  codeVerifier: text("code_verifier").notNull(),  // PKCE S256
  nonce: text("nonce"),                           // OIDC(구글·애플) 필수 — 서비스 계층 강제
  redirectUri: text("redirect_uri").notNull(),    // allowlist 검증은 발급 시
  createdAt: createdAt(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }).notNull(), // 10분
  consumedAt: timestamp("consumed_at", { withTimezone: true, mode: "string" }),         // 일회성 소비
}, (t) => [
  uniqueIndex("uq_oauth_state").on(t.stateHash),
  index("ix_oauth_expiry").on(t.expiresAt),
]);

/* ── 조직 ── */
export const academies = pgTable("academies", {
  id: text("id").primaryKey(),                    // a_xxx
  organizationId: text("organization_id").notNull(),
  name: text("name").notNull(),
  themeColor: text("theme_color").notNull(),
  themeInk: text("theme_ink").notNull(),
  logoEmoji: text("logo_emoji").notNull(),
  ownerName: text("owner_name").notNull(),
  billingCycleDefault: integer("billing_cycle_default").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  version: version(),
}, (t) => [
  check("ck_billing_cycle", sql`${t.billingCycleDefault} IN (1, 3)`), // 헌법: 월(1)·분기(3)
]);

/* 멀티역할 모델 A(유저 확정): 사용자×학원 = 1 membership, roles 배열 */
export const academyMemberships = pgTable("academy_memberships", {
  id: text("id").primaryKey(),                    // m_xxx
  userId: text("user_id").notNull().references(() => users.id),
  academyId: text("academy_id").notNull().references(() => academies.id),
  roles: roleEnum("roles").array().notNull(),
  status: membershipStatusEnum("status").notNull(),
  joinedAt: date("joined_at").notNull(),
  endedAt: date("ended_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  version: version(),
}, (t) => [
  uniqueIndex("uq_membership_user_academy").on(t.userId, t.academyId), // 모델 A (R5 필수)
  index("ix_membership_academy_status").on(t.academyId, t.status),
  check("ck_membership_roles_nonempty", sql`array_length(${t.roles}, 1) >= 1`),
]);

/* ── 사람 · 관계 ── */
export const guardians = pgTable("guardians", {
  id: text("id").primaryKey(),                    // gd_xxx
  userId: text("user_id").notNull().references(() => users.id),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("uq_guardian_user").on(t.userId),   // Guardian = User 의 역할, 1:1
]);

export const participants = pgTable("participants", {
  id: text("id").primaryKey(),                    // p_xxx
  academyId: text("academy_id").notNull().references(() => academies.id), // 테넌트 축
  name: text("name").notNull(),
  birth: date("birth").notNull(),
  ageLabel: text("age_label").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  version: version(),
}, (t) => [
  index("ix_participant_academy").on(t.academyId),
]);

/* ── Phase 4: 보호자 연결 vertical slice (docs/11 §C·§D) ── */

/* 원장 선등록 보호자 연락처 — OTP 전화 주체와의 결합 근거(domain RegisteredGuardianContact) */
export const registeredGuardianContacts = pgTable("registered_guardian_contacts", {
  id: text("id").primaryKey(),                    // rgc_xxx
  academyId: text("academy_id").notNull().references(() => academies.id),
  participantId: text("participant_id").notNull().references(() => participants.id),
  phone: text("phone").notNull(),                 // 정규화 저장(normalizePhone)
  relationshipType: relationshipTypeEnum("relationship_type"),
  createdAt: createdAt(),
}, (t) => [
  index("ix_rgc_participant").on(t.participantId),
  index("ix_rgc_phone").on(t.academyId, t.phone),
]);

/* OTP 검증 세션 — actor 귀속·목적 고정·1회 소비(docs/11 §D, R4 P0-6) */
export const guardianVerificationSessions = pgTable("guardian_verification_sessions", {
  id: text("id").primaryKey(),                    // gvs_xxx
  issuedToUserId: text("issued_to_user_id").notNull().references(() => users.id),
  purpose: text("purpose").notNull(),             // "GUARDIAN_LINK" 고정(도메인 계약)
  verifiedPhone: text("verified_phone").notNull(),
  verifiedAt: timestamp("verified_at", { withTimezone: true, mode: "string" }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true, mode: "string" }), // 1회 소비
  consumedByLinkId: text("consumed_by_link_id"),
}, (t) => [
  index("ix_gvs_user").on(t.issuedToUserId),
  index("ix_gvs_expiry").on(t.expiresAt),
]);

/* 초대코드 — hash 저장. 사용 횟수 정본 = redemption COUNT (R5 §3.4), usedCount 는 캐시 */
export const guardianInvites = pgTable("guardian_invites", {
  id: text("id").primaryKey(),                    // gi_xxx
  codeHash: text("code_hash").notNull(),
  academyId: text("academy_id").notNull().references(() => academies.id),
  participantId: text("participant_id").notNull().references(() => participants.id),
  intendedPhone: text("intended_phone"),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }).notNull(),
  maxUses: integer("max_uses").notNull(),
  usedCount: integer("used_count").default(0).notNull(), // ⚠️ 캐시 — 정본은 redemptions COUNT
  revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "string" }),
  createdAt: createdAt(),
  version: version(),
}, (t) => [
  uniqueIndex("uq_invite_code_hash").on(t.codeHash),
  index("ix_invite_participant").on(t.participantId),
  check("ck_invite_max_uses", sql`${t.maxUses} >= 1`),
]);

/* 소비 기록 = 사용 횟수의 정본. UNIQUE(invite, guardian, participant) = 중복 소비 차단(R5) */
export const guardianInviteRedemptions = pgTable("guardian_invite_redemptions", {
  id: text("id").primaryKey(),                    // gir_xxx
  inviteId: text("invite_id").notNull().references(() => guardianInvites.id),
  academyId: text("academy_id").notNull().references(() => academies.id),
  guardianId: text("guardian_id").notNull().references(() => guardians.id),
  participantId: text("participant_id").notNull().references(() => participants.id),
  verificationSessionId: text("verification_session_id").notNull().references(() => guardianVerificationSessions.id),
  redeemedAt: timestamp("redeemed_at", { withTimezone: true, mode: "string" }).notNull(),
}, (t) => [
  uniqueIndex("uq_redemption").on(t.inviteId, t.guardianId, t.participantId), // R5 필수
  index("ix_redemption_invite").on(t.inviteId),
]);

/* 보호자↔자녀 — 검증 상태·세부 권한 flag = domain GuardianParticipantLink 그대로 */
export const guardianParticipantLinks = pgTable("guardian_participant_links", {
  id: text("id").primaryKey(),                    // gl_xxx
  guardianId: text("guardian_id").notNull().references(() => guardians.id),
  participantId: text("participant_id").notNull().references(() => participants.id),
  academyId: text("academy_id").notNull().references(() => academies.id),
  relationshipType: relationshipTypeEnum("relationship_type").notNull(),
  isPrimaryGuardian: boolean("is_primary_guardian").notNull(),
  verificationStatus: verificationStatusEnum("verification_status").notNull(),
  canViewSchedule: boolean("can_view_schedule").notNull(),
  canViewAttendance: boolean("can_view_attendance").notNull(),
  canViewHealthInfo: boolean("can_view_health_info").notNull(),
  canReceivePhotos: boolean("can_receive_photos").notNull(),
  canPay: boolean("can_pay").notNull(),
  canRequestRefund: boolean("can_request_refund").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  version: version(),
}, (t) => [
  uniqueIndex("uq_guardian_link").on(t.guardianId, t.participantId, t.academyId), // 중복 링크 방지 (R5)
  index("ix_link_participant").on(t.participantId),
  index("ix_link_guardian").on(t.guardianId),
]);

/* ── Phase 5: 청구 · 결제 (docs/06 · R5 §7 Phase 5) ──
   금액 = int4 KRW 정수 + CHECK(>0) — float 금지(R5 Phase 0).
   불변식 정본 = packages/domain/billing.ts — DB 는 기본 제약,
   합계 검증(total=Σlines 등)은 서비스 tx 안에서 도메인 함수로. */

export const billingPeriods = pgTable("billing_periods", {
  id: text("id").primaryKey(),                    // bp_xxx
  academyId: text("academy_id").notNull().references(() => academies.id),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  cycleMonths: integer("cycle_months").notNull(),
  createdAt: createdAt(),
}, (t) => [
  check("ck_cycle_months", sql`${t.cycleMonths} IN (1, 3)`), // 헌법
]);

export const invoices = pgTable("invoices", {
  id: text("id").primaryKey(),                    // inv_xxx
  academyId: text("academy_id").notNull().references(() => academies.id),
  participantId: text("participant_id").notNull().references(() => participants.id),
  // 수업 도메인 스키마(classes·enrollments)는 Phase 5.5 — 그때 FK 승격
  enrollmentId: text("enrollment_id").notNull(),
  billingPeriodId: text("billing_period_id").notNull().references(() => billingPeriods.id),
  status: invoiceStatusEnum("status").notNull(),
  total: integer("total").notNull(),
  dueDate: date("due_date").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  version: version(),
}, (t) => [
  index("ix_invoice_participant").on(t.participantId),
  index("ix_invoice_academy_status").on(t.academyId, t.status),
  check("ck_invoice_total_positive", sql`${t.total} > 0`),
]);

export const invoiceLines = pgTable("invoice_lines", {
  id: text("id").primaryKey(),                    // il_xxx
  invoiceId: text("invoice_id").notNull().references(() => invoices.id),
  type: invoiceLineTypeEnum("type").notNull(),
  label: text("label").notNull(),
  amount: integer("amount").notNull(),            // DISCOUNT 는 음수 허용
}, (t) => [
  index("ix_line_invoice").on(t.invoiceId),
]);

export const payments = pgTable("payments", {
  id: text("id").primaryKey(),                    // pay_xxx
  academyId: text("academy_id").notNull().references(() => academies.id),
  guardianId: text("guardian_id").notNull().references(() => guardians.id),
  amount: integer("amount").notNull(),
  status: paymentStatusEnum("status").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  providerPaymentId: text("provider_payment_id"),
  lastEventAt: timestamp("last_event_at", { withTimezone: true, mode: "string" }), // webhook 역순 guard
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  version: version(),
}, (t) => [
  uniqueIndex("uq_payment_idem").on(t.academyId, t.guardianId, t.idempotencyKey),
  index("ix_payment_provider").on(t.providerPaymentId),
  check("ck_payment_amount_positive", sql`${t.amount} > 0`),
]);

export const paymentAllocations = pgTable("payment_allocations", {
  id: text("id").primaryKey(),                    // pa_xxx
  paymentId: text("payment_id").notNull().references(() => payments.id),
  invoiceId: text("invoice_id").notNull().references(() => invoices.id),
  amount: integer("amount").notNull(),
}, (t) => [
  uniqueIndex("uq_alloc_payment_invoice").on(t.paymentId, t.invoiceId), // 같은 결제가 같은 청구 이중 배분 금지
  index("ix_alloc_invoice").on(t.invoiceId),
  check("ck_alloc_amount_positive", sql`${t.amount} > 0`),
]);

/* 멱등 레코드 — scope = (academy, actor, operation, key) (R3 P1-4 · domain idempotency.ts) */
export const idempotencyRecords = pgTable("idempotency_records", {
  id: text("id").primaryKey(),                    // idem_xxx
  actorId: text("actor_id").notNull(),
  academyId: text("academy_id").notNull(),
  operation: text("operation").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  requestHash: text("request_hash").notNull(),
  status: text("status").notNull(),               // IN_PROGRESS | COMPLETED | FAILED
  resourceId: text("resource_id"),
  responseStatus: integer("response_status"),
  createdAt: createdAt(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }).notNull(),
}, (t) => [
  uniqueIndex("uq_idem_scope").on(t.academyId, t.actorId, t.operation, t.idempotencyKey),
  index("ix_idem_expiry").on(t.expiresAt),
]);

/* PG 웹훅 inbox — UNIQUE(provider, eventId) 가 중복 수신을 DB 레벨에서 차단 */
export const webhookInbox = pgTable("webhook_inbox", {
  id: text("id").primaryKey(),                    // whi_xxx
  provider: text("provider").notNull(),
  providerEventId: text("provider_event_id").notNull(),
  payload: text("payload").notNull(),             // raw 보존(REJECT_INVALID 도 보존 후 재처리)
  receivedAt: timestamp("received_at", { withTimezone: true, mode: "string" }).notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true, mode: "string" }),
  decision: text("decision"),                     // APPLY | IGNORE_* | RECONCILE | REJECT_INVALID
}, (t) => [
  uniqueIndex("uq_webhook_event").on(t.provider, t.providerEventId),
]);
