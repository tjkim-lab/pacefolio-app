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
  uniqueIndex, index, check, foreignKey,
} from "drizzle-orm/pg-core";

/* ── enum (packages/domain/enums.ts 와 drift 검증 대상) ── */
export const oauthProviderEnum = pgEnum("oauth_provider", ["kakao", "naver", "google", "apple"]);
export const roleEnum = pgEnum("role", ["OWNER", "MANAGER", "COACH", "DESK", "DRIVER", "GUARDIAN", "PLATFORM_ADMIN"]);
export const membershipStatusEnum = pgEnum("membership_status", ["INVITED", "ACTIVE", "SUSPENDED", "ENDED"]);
export const relationshipTypeEnum = pgEnum("relationship_type", ["MOTHER", "FATHER", "GRANDPARENT", "LEGAL_GUARDIAN", "OTHER"]);
export const verificationStatusEnum = pgEnum("verification_status", ["UNVERIFIED", "PENDING", "VERIFIED", "REJECTED", "REVOKED"]);
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
  suspendedAt: timestamp("suspended_at", { withTimezone: true, mode: "string" }), // admin 통제 — guard 가 403 차단
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

export const participantStatusEnum = pgEnum("participant_status", ["TRIAL", "ENROLLED", "ON_BREAK", "WITHDRAWN"]);

export const participants = pgTable("participants", {
  id: text("id").primaryKey(),                    // p_xxx
  academyId: text("academy_id").notNull().references(() => academies.id), // 테넌트 축
  name: text("name").notNull(),
  birth: date("birth").notNull(),
  ageLabel: text("age_label").notNull(),
  status: participantStatusEnum("status").notNull().default("ENROLLED"), // #23 수명주기
  statusChangedAt: timestamp("status_changed_at", { withTimezone: true, mode: "string" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  version: version(),
}, (t) => [
  index("ix_participant_academy").on(t.academyId),
  // R7 P0-6: 자식 테이블의 (participantId, academyId) 복합 FK 대상
  uniqueIndex("uq_participant_id_academy").on(t.id, t.academyId),
]);

/* ── Phase 4: 보호자 연결 vertical slice (docs/11 §C·§D) ── */

/* 원장 선등록 보호자 연락처 — OTP 전화 주체와의 결합 근거(domain RegisteredGuardianContact) */
export const registeredGuardianContacts = pgTable("registered_guardian_contacts", {
  id: text("id").primaryKey(),                    // rgc_xxx
  academyId: text("academy_id").notNull().references(() => academies.id),
  participantId: text("participant_id").notNull().references(() => participants.id),
  /* #26(docs/16 §D): 전화 원문 저장 금지 — 매칭=HMAC 해시 / 표시=AES-GCM */
  phoneHash: text("phone_hash").notNull(),
  phoneEnc: text("phone_enc").notNull(),
  relationshipType: relationshipTypeEnum("relationship_type"),
  createdAt: createdAt(),
}, (t) => [
  index("ix_rgc_participant").on(t.participantId),
  foreignKey({ name: "fk_rgc_participant_academy", columns: [t.participantId, t.academyId], foreignColumns: [participants.id, participants.academyId] }),
  index("ix_rgc_phone").on(t.academyId, t.phoneHash),
]);

/* OTP 검증 세션 — actor 귀속·목적 고정·1회 소비(docs/11 §D, R4 P0-6) */
export const guardianVerificationSessions = pgTable("guardian_verification_sessions", {
  id: text("id").primaryKey(),                    // gvs_xxx
  issuedToUserId: text("issued_to_user_id").notNull().references(() => users.id),
  purpose: text("purpose").notNull(),             // "GUARDIAN_LINK" 고정(도메인 계약)
  verifiedPhoneHash: text("verified_phone_hash").notNull(), // #26 — 원문 대신 해시(매칭)+enc(표시)
  verifiedPhoneEnc: text("verified_phone_enc").notNull(),
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
  intendedPhoneHash: text("intended_phone_hash"), // #26 — 결합 검증은 해시로 충분(표시 불필요)
  /* R7 P0-7: 초대로 부여할 권한 scope — 미지정 시 최소(일정·출결).
     건강정보·사진·결제·환불은 발급자(원장)가 명시적으로 부여해야 함. */
  allowedScopes: text("allowed_scopes").array().notNull().default(sql`ARRAY['VIEW_SCHEDULE','VIEW_ATTENDANCE']::text[]`),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }).notNull(),
  maxUses: integer("max_uses").notNull(),
  usedCount: integer("used_count").default(0).notNull(), // ⚠️ 캐시 — 정본은 redemptions COUNT
  revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "string" }),
  createdAt: createdAt(),
  version: version(),
}, (t) => [
  uniqueIndex("uq_invite_code_hash").on(t.codeHash),
  uniqueIndex("uq_invite_id_academy").on(t.id, t.academyId), // R7 P0-6 복합 FK 대상
  index("ix_invite_participant").on(t.participantId),
  check("ck_invite_max_uses", sql`${t.maxUses} >= 1`),
  // R7 P0-6: A학원 invite + B학원 원생 차단
  foreignKey({ name: "fk_invite_participant_academy", columns: [t.participantId, t.academyId], foreignColumns: [participants.id, participants.academyId] }),
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
  // R7 P0-6: A학원 redemption + B학원 invite/원생 차단
  foreignKey({ name: "fk_redemption_invite_academy", columns: [t.inviteId, t.academyId], foreignColumns: [guardianInvites.id, guardianInvites.academyId] }),
  foreignKey({ name: "fk_redemption_participant_academy", columns: [t.participantId, t.academyId], foreignColumns: [participants.id, participants.academyId] }),
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
  /* 13차 D P0-2: 철회 이력 — REVOKED(사후 철회)와 REJECTED(신청 거절)를 구분 */
  revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "string" }),
  revokedByUserId: text("revoked_by_user_id"),
  revocationReasonCode: text("revocation_reason_code"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  version: version(),
}, (t) => [
  uniqueIndex("uq_guardian_link").on(t.guardianId, t.participantId, t.academyId), // 중복 링크 방지 (R5)
  index("ix_link_participant").on(t.participantId),
  index("ix_link_guardian").on(t.guardianId),
  // R7 P0-6: A학원 링크 + B학원 원생 차단
  foreignKey({ name: "fk_link_participant_academy", columns: [t.participantId, t.academyId], foreignColumns: [participants.id, participants.academyId] }),
  // R7 P0-7: 원생당 Primary 보호자 1명 (partial unique)
  uniqueIndex("uq_primary_guardian_per_participant").on(t.participantId)
    .where(sql`${t.isPrimaryGuardian} = true`),
]);

/* ── 기본선 1단계(#22): 반 · 수업 일정 (경쟁 비교 반영 — docs/15) ──
   수업 유형 3종 + 반복 일정 전개(세션 인스턴스) + 코치 담당(assignment).
   assignment 는 채팅 HEALTH 코치 담당 검증(13차 C 잔여)의 전제 테이블. */
export const classScheduleTypeEnum = pgEnum("class_schedule_type", [
  "FIXED_WEEKLY", "VARIABLE_BY_WEEKDAY", "PARTICIPANT_SPECIFIC",
]);
export const classStatusEnum = pgEnum("class_status", ["ACTIVE", "WAITING", "CLOSED"]);
export const classSessionStatusEnum = pgEnum("class_session_status", [
  "SCHEDULED", "CANCELED", "EXTRA", "COMPLETED",
]);

export const dbClasses = pgTable("classes", {
  id: text("id").primaryKey(),                     // cls_xxx
  academyId: text("academy_id").notNull().references(() => academies.id),
  name: text("name").notNull(),
  scheduleType: classScheduleTypeEnum("schedule_type").notNull(),
  capacity: integer("capacity").notNull(),
  room: text("room"),
  status: classStatusEnum("status").notNull().default("ACTIVE"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  version: version(),
}, (t) => [
  uniqueIndex("uq_class_id_academy").on(t.id, t.academyId),
  index("ix_class_academy").on(t.academyId),
  check("ck_class_capacity", sql`${t.capacity} > 0 AND ${t.capacity} <= 200`),
]);

export const classScheduleSlots = pgTable("class_schedule_slots", {
  id: text("id").primaryKey(),                     // slot_xxx
  classId: text("class_id").notNull(),
  academyId: text("academy_id").notNull().references(() => academies.id),
  weekday: integer("weekday").notNull(),           // 0=일 … 6=토
  startTime: text("start_time").notNull(),         // "14:30"
  endTime: text("end_time").notNull(),
  participantId: text("participant_id"),           // PARTICIPANT_SPECIFIC 전용
}, (t) => [
  index("ix_slot_class").on(t.classId),
  foreignKey({ name: "fk_slot_class_academy", columns: [t.classId, t.academyId], foreignColumns: [dbClasses.id, dbClasses.academyId] }),
  foreignKey({ name: "fk_slot_participant_academy", columns: [t.participantId, t.academyId], foreignColumns: [participants.id, participants.academyId] }),
  check("ck_slot_weekday", sql`${t.weekday} BETWEEN 0 AND 6`),
]);

/* 코치 담당 — ACTIVE 배정이 채팅·출결·건강정보의 "담당 범위" 정본 */
export const classAssignments = pgTable("class_assignments", {
  id: text("id").primaryKey(),                     // ca_xxx
  classId: text("class_id").notNull(),
  academyId: text("academy_id").notNull().references(() => academies.id),
  coachUserId: text("coach_user_id").notNull().references(() => users.id),
  status: text("status").notNull(),                // ACTIVE | ENDED
  startDate: date("start_date").notNull(),
  endDate: date("end_date"),
  createdAt: createdAt(),
}, (t) => [
  index("ix_assignment_coach").on(t.coachUserId),
  index("ix_assignment_class").on(t.classId),
  foreignKey({ name: "fk_assignment_class_academy", columns: [t.classId, t.academyId], foreignColumns: [dbClasses.id, dbClasses.academyId] }),
  check("ck_assignment_status", sql`${t.status} IN ('ACTIVE', 'ENDED')`),
]);

/* 세션 인스턴스 — 반복 일정 전개 결과. 휴강 = CANCELED(사유 보존 · 재전개 시 유지) */
export const classSessions = pgTable("class_sessions", {
  id: text("id").primaryKey(),                     // sess_xxx
  classId: text("class_id").notNull(),
  academyId: text("academy_id").notNull().references(() => academies.id),
  date: date("date").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  participantId: text("participant_id"),
  status: classSessionStatusEnum("status").notNull().default("SCHEDULED"),
  canceledReason: text("canceled_reason"),
  closureId: text("closure_id"),                   // #38: 휴무 이벤트가 취소한 세션 추적(복원 근거)
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  index("ix_session_class_date").on(t.classId, t.date),
  uniqueIndex("uq_session_id_academy").on(t.id, t.academyId),
  // 단체 세션 중복 방지(원생 슬롯은 원생 포함 유일)
  uniqueIndex("uq_session_group_slot").on(t.classId, t.date, t.startTime)
    .where(sql`${t.participantId} IS NULL`),
  uniqueIndex("uq_session_participant_slot").on(t.classId, t.date, t.startTime, t.participantId)
    .where(sql`${t.participantId} IS NOT NULL`),
  foreignKey({ name: "fk_session_class_academy", columns: [t.classId, t.academyId], foreignColumns: [dbClasses.id, dbClasses.academyId] }),
  foreignKey({ name: "fk_session_participant_academy", columns: [t.participantId, t.academyId], foreignColumns: [participants.id, participants.academyId] }),
]);

/* ── 기본선 2단계(#23): 반 배정 · 출결 ──
   enrollment = 원생↔반 배정(정원 검증 대상). 출결은 예정(보호자 통보)과
   실제(코치 확정)를 절대 합치지 않는다(도메인 원칙 재현). */
export const dbEnrollments = pgTable("enrollments", {
  id: text("id").primaryKey(),                     // en_xxx
  academyId: text("academy_id").notNull().references(() => academies.id),
  classId: text("class_id").notNull(),
  participantId: text("participant_id").notNull(),
  status: text("status").notNull(),                // ACTIVE | ENDED
  startDate: date("start_date").notNull(),
  endDate: date("end_date"),
  createdAt: createdAt(),
}, (t) => [
  index("ix_enrollment_class").on(t.classId),
  index("ix_enrollment_participant").on(t.participantId),
  // 같은 반에 동시 ACTIVE 배정 1개 — 종료 후 재배정 허용
  uniqueIndex("uq_enrollment_active").on(t.classId, t.participantId)
    .where(sql`${t.status} = 'ACTIVE'`),
  foreignKey({ name: "fk_enrollment_class_academy", columns: [t.classId, t.academyId], foreignColumns: [dbClasses.id, dbClasses.academyId] }),
  foreignKey({ name: "fk_enrollment_participant_academy", columns: [t.participantId, t.academyId], foreignColumns: [participants.id, participants.academyId] }),
  check("ck_enrollment_status", sql`${t.status} IN ('ACTIVE', 'ENDED')`),
]);

export const attendanceRecordStatusEnum = pgEnum("attendance_record_status", [
  "PRESENT", "ABSENT", "LATE", "EARLY_LEAVE", "EXCUSED",
]);
export const attendanceNoticeTypeEnum = pgEnum("attendance_notice_type", ["ABSENCE", "LATE", "EARLY_LEAVE"]);

/* 실제 출결(코치 확정) — 세션×원생 1행, 수정은 같은 행 갱신+version+감사 */
export const attendanceRecords = pgTable("attendance_records", {
  id: text("id").primaryKey(),                     // ar_xxx
  academyId: text("academy_id").notNull().references(() => academies.id),
  sessionId: text("session_id").notNull(),
  participantId: text("participant_id").notNull(),
  status: attendanceRecordStatusEnum("status").notNull(),
  reason: text("reason"),                          // 결석·지각 사유(선택)
  recordedByUserId: text("recorded_by_user_id").notNull().references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  version: version(),
}, (t) => [
  uniqueIndex("uq_attendance_session_participant").on(t.sessionId, t.participantId),
  index("ix_attendance_participant").on(t.participantId),
  foreignKey({ name: "fk_attendance_session_academy", columns: [t.sessionId, t.academyId], foreignColumns: [classSessions.id, classSessions.academyId] }),
  foreignKey({ name: "fk_attendance_participant_academy", columns: [t.participantId, t.academyId], foreignColumns: [participants.id, participants.academyId] }),
]);

/* 예정 통보(보호자 접수) — 실제 출결과 별개 트랙 */
export const dbAttendanceNotices = pgTable("attendance_notices", {
  id: text("id").primaryKey(),                     // an_xxx
  academyId: text("academy_id").notNull().references(() => academies.id),
  participantId: text("participant_id").notNull(),
  date: date("date").notNull(),
  type: attendanceNoticeTypeEnum("type").notNull(),
  reason: text("reason").notNull(),
  createdByUserId: text("created_by_user_id").notNull().references(() => users.id),
  createdAt: createdAt(),
}, (t) => [
  index("ix_notice_participant_date").on(t.participantId, t.date),
  foreignKey({ name: "fk_notice_participant_academy", columns: [t.participantId, t.academyId], foreignColumns: [participants.id, participants.academyId] }),
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
  uniqueIndex("uq_bp_id_academy").on(t.id, t.academyId), // R7 P0-6 복합 FK 대상
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
  uniqueIndex("uq_invoice_id_academy").on(t.id, t.academyId), // R7 P0-6 복합 FK 대상
  uniqueIndex("uq_invoice_id_participant").on(t.id, t.participantId), // R9-P0-02 연쇄 FK 대상
  check("ck_invoice_total_positive", sql`${t.total} > 0`),
  check("ck_invoice_total_max", sql`${t.total} <= 100000000`), // C10-01 금액 상한(도메인 MAX_MONEY_AMOUNT 와 동일)
  // R7 P0-6: A학원 Invoice + B학원 Participant/BillingPeriod 를 DB 가 직접 차단
  foreignKey({ name: "fk_invoice_participant_academy", columns: [t.participantId, t.academyId], foreignColumns: [participants.id, participants.academyId] }),
  foreignKey({ name: "fk_invoice_bp_academy", columns: [t.billingPeriodId, t.academyId], foreignColumns: [billingPeriods.id, billingPeriods.academyId] }),
]);

export const invoiceLines = pgTable("invoice_lines", {
  id: text("id").primaryKey(),                    // il_xxx
  invoiceId: text("invoice_id").notNull().references(() => invoices.id),
  type: invoiceLineTypeEnum("type").notNull(),
  label: text("label").notNull(),
  amount: integer("amount").notNull(),            // DISCOUNT 는 음수 허용
}, (t) => [
  index("ix_line_invoice").on(t.invoiceId),
  // C10-01: DISCOUNT 음수 허용이라 절대값 범위로
  check("ck_line_amount_range", sql`${t.amount} BETWEEN -100000000 AND 100000000`),
]);

export const payments = pgTable("payments", {
  id: text("id").primaryKey(),                    // pay_xxx
  academyId: text("academy_id").notNull().references(() => academies.id),
  guardianId: text("guardian_id").notNull().references(() => guardians.id),
  amount: integer("amount").notNull(),
  status: paymentStatusEnum("status").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  providerPaymentId: text("provider_payment_id"),
  provider: text("provider"),                     // PG 식별(R7 P0-4) — (provider, providerPaymentId) UNIQUE
  lastEventAt: timestamp("last_event_at", { withTimezone: true, mode: "string" }), // webhook 역순 guard
  /* R7 P0-3: PENDING attempt 의 유효기간 — 만료 후엔 활성 attempt 로 세지 않음
     (사용자 이탈로 영구 블록되는 것 방지). AUTHORIZED/UNKNOWN 은 webhook/재조회로만 해소. */
  attemptExpiresAt: timestamp("attempt_expires_at", { withTimezone: true, mode: "string" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  version: version(),
}, (t) => [
  uniqueIndex("uq_payment_idem").on(t.academyId, t.guardianId, t.idempotencyKey),
  uniqueIndex("uq_payment_provider_id").on(t.provider, t.providerPaymentId), // R7 P0-4: PG 거래 중복 차단
  uniqueIndex("uq_payment_id_academy").on(t.id, t.academyId), // R7 P0-6 복합 FK 대상
  index("ix_payment_provider").on(t.providerPaymentId),
  check("ck_payment_amount_positive", sql`${t.amount} > 0`),
  check("ck_payment_amount_max", sql`${t.amount} <= 100000000`), // C10-01
]);

export const paymentAllocations = pgTable("payment_allocations", {
  id: text("id").primaryKey(),                    // pa_xxx
  paymentId: text("payment_id").notNull().references(() => payments.id),
  invoiceId: text("invoice_id").notNull().references(() => invoices.id),
  academyId: text("academy_id").notNull().references(() => academies.id), // R7 P0-6: 테넌트 축
  amount: integer("amount").notNull(),
}, (t) => [
  uniqueIndex("uq_alloc_payment_invoice").on(t.paymentId, t.invoiceId), // 같은 결제가 같은 청구 이중 배분 금지
  index("ix_alloc_invoice").on(t.invoiceId),
  check("ck_alloc_amount_positive", sql`${t.amount} > 0`),
  check("ck_alloc_amount_max", sql`${t.amount} <= 100000000`), // C10-01
  // R9-P0-02: RefundAllocation 연쇄 FK 대상
  uniqueIndex("uq_alloc_id_invoice").on(t.id, t.invoiceId),
  uniqueIndex("uq_alloc_id_payment").on(t.id, t.paymentId),
  // R7 P0-6 핵심: A학원 결제에 B학원 청구서 배분을 DB 가 직접 차단
  foreignKey({ name: "fk_alloc_payment_academy", columns: [t.paymentId, t.academyId], foreignColumns: [payments.id, payments.academyId] }),
  foreignKey({ name: "fk_alloc_invoice_academy", columns: [t.invoiceId, t.academyId], foreignColumns: [invoices.id, invoices.academyId] }),
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
  /* R7 P0-2 상태 모델: RECONCILE 은 "처리됨"이 아니라 재조회 대기 큐 —
     RECEIVED → APPLIED | IGNORED | RECONCILE_REQUIRED(→RETRY_WAITING→…) | DEAD_LETTER */
  status: text("status").default("RECEIVED").notNull(),
  attempts: integer("attempts").default(0).notNull(),
  nextRetryAt: timestamp("next_retry_at", { withTimezone: true, mode: "string" }),
}, (t) => [
  uniqueIndex("uq_webhook_event").on(t.provider, t.providerEventId),
  index("ix_inbox_reconcile_queue").on(t.status, t.nextRetryAt), // RECONCILE worker 폴링
]);

/* ── R7 배치 3: AuditLog · Outbox · Inbox 상태 모델 ── */

/* 감사 로그 — append-only(수정·삭제 금지는 운영 정책+권한으로).
   민감정보 원문 미포함(diff 는 마스킹 후) — R7 §27. */
export const auditLogs = pgTable("audit_logs", {
  id: text("id").primaryKey(),                    // aud_xxx
  academyId: text("academy_id"),                  // 플랫폼 레벨 행위는 null
  actorUserId: text("actor_user_id"),             // 시스템 행위는 null
  actorRole: text("actor_role"),
  action: text("action").notNull(),               // 예: guardian_link.created
  targetType: text("target_type").notNull(),
  targetId: text("target_id").notNull(),
  reason: text("reason"),
  requestId: text("request_id"),
  detail: text("detail"),                         // 마스킹된 JSON 문자열
  success: boolean("success").notNull(),
  at: timestamp("at", { withTimezone: true, mode: "string" }).notNull(),
}, (t) => [
  index("ix_audit_academy_at").on(t.academyId, t.at),
  index("ix_audit_target").on(t.targetType, t.targetId),
]);

/* Outbox — 업무 데이터와 같은 트랜잭션에 저장, publisher 가 at-least-once 발행.
   소비자는 멱등 전제(R7 §18). */
export const outboxEvents = pgTable("outbox_events", {
  id: text("id").primaryKey(),                    // obx_xxx
  academyId: text("academy_id"),
  eventType: text("event_type").notNull(),        // domain enums DOMAIN_EVENT_TYPE
  schemaVersion: integer("schema_version").default(1).notNull(),
  payload: text("payload").notNull(),             // JSON — PII 최소(R7 §18)
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true, mode: "string" }),
  attempts: integer("attempts").default(0).notNull(),
}, (t) => [
  index("ix_outbox_unpublished").on(t.publishedAt, t.createdAt), // publisher 폴링
]);

/* ── 인앱 알림(파일럿 P0) — Outbox 소비의 첫 채널.
   알림톡·푸시(외부 채널)는 사업자 연동 시 dispatcher 에 채널만 추가. ── */
export const inAppNotifications = pgTable("in_app_notifications", {
  id: text("id").primaryKey(),                     // ntf_xxx
  academyId: text("academy_id").notNull().references(() => academies.id),
  userId: text("user_id").notNull().references(() => users.id), // 수신자
  category: text("category").notNull(),            // domain NOTIFICATION_CATEGORY
  title: text("title").notNull(),
  body: text("body").notNull(),                    // PII 최소 — ID 참조 위주
  refType: text("ref_type"),
  refId: text("ref_id"),
  readAt: timestamp("read_at", { withTimezone: true, mode: "string" }),
  createdAt: createdAt(),
}, (t) => [
  index("ix_ntf_user_created").on(t.userId, t.createdAt),
  index("ix_ntf_academy").on(t.academyId),
]);

/* ── 사진 파이프라인 사전 코어(#19 — 스토리지 사업자 결정과 무관) ──
   동의 정본 = domain consent.ts(PhotoConsentRecord·canSendPhotoAsset).
   grants 는 목적×대상 쌍 JSON — 발송·공개 시점마다 서버 재검증(R2 P0-9). */
export const photoAssetStatusEnum = pgEnum("photo_asset_status", ["PENDING_UPLOAD", "UPLOADED", "DELETED"]);

export const photoConsents = pgTable("photo_consents", {
  id: text("id").primaryKey(),                     // pc_xxx
  academyId: text("academy_id").notNull().references(() => academies.id),
  participantId: text("participant_id").notNull(),
  guardianId: text("guardian_id").notNull().references(() => guardians.id), // 동의 주체(법정대리인)
  policyVersion: text("policy_version").notNull(),
  grants: text("grants").notNull(),                // JSON [{purpose,audience}] — 교차조합 금지(도메인 검증)
  channel: text("channel").notNull(),              // 앱/서면 등 획득 채널(증적)
  consentedAt: timestamp("consented_at", { withTimezone: true, mode: "string" }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "string" }),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  version: version(),
}, (t) => [
  uniqueIndex("uq_photo_consent_participant").on(t.academyId, t.participantId), // 원생당 1정본(갱신형)
  foreignKey({ name: "fk_pconsent_participant_academy", columns: [t.participantId, t.academyId], foreignColumns: [participants.id, participants.academyId] }),
]);

export const photoAssets = pgTable("photo_assets", {
  id: text("id").primaryKey(),                     // ph_xxx
  academyId: text("academy_id").notNull().references(() => academies.id),
  sessionId: text("session_id"),                   // 수업 컨텍스트(선택)
  uploadedByUserId: text("uploaded_by_user_id").notNull().references(() => users.id),
  storageKey: text("storage_key").notNull(),       // 어댑터 무관 키 — 사업자 결정 후에도 불변
  contentType: text("content_type").notNull(),
  byteSize: integer("byte_size").notNull(),
  status: photoAssetStatusEnum("status").notNull(),
  purpose: text("purpose"),                        // finalize 시 확정(도메인 enum 검증)
  audience: text("audience"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  version: version(),
}, (t) => [
  uniqueIndex("uq_photo_storage_key").on(t.storageKey),
  uniqueIndex("uq_photo_id_academy").on(t.id, t.academyId),
  index("ix_photo_academy_created").on(t.academyId, t.createdAt),
  check("ck_photo_byte_size", sql`${t.byteSize} > 0 AND ${t.byteSize} <= 26214400`), // 25MB 상한
  foreignKey({ name: "fk_photo_session_academy", columns: [t.sessionId, t.academyId], foreignColumns: [classSessions.id, classSessions.academyId] }),
]);

/* 사진 속 등장 원생 — 동의 게이트(canSendPhotoAsset)의 근거 */
export const photoAssetParticipants = pgTable("photo_asset_participants", {
  id: text("id").primaryKey(),                     // pap_xxx
  photoId: text("photo_id").notNull(),
  academyId: text("academy_id").notNull().references(() => academies.id),
  participantId: text("participant_id").notNull(),
}, (t) => [
  uniqueIndex("uq_pap_photo_participant").on(t.photoId, t.participantId),
  index("ix_pap_participant").on(t.participantId),
  foreignKey({ name: "fk_pap_photo_academy", columns: [t.photoId, t.academyId], foreignColumns: [photoAssets.id, photoAssets.academyId] }),
  foreignKey({ name: "fk_pap_participant_academy", columns: [t.participantId, t.academyId], foreignColumns: [participants.id, participants.academyId] }),
]);

/* ── 안전사고 기록(#32 — E 리뷰 C2): 코치 현장 기록의 서버 정본 ──
   발생 시각 = 서버 기록(클라이언트 고정 시각 금지). 민감 기록 — 열람·기록 전부 감사. */
export const incidentTypeEnum = pgEnum("incident_type", ["MINOR_INJURY", "CONDITION", "CLASS_HALT", "SAFETY_ACCIDENT", "OTHER"]);
export const incidentSeverityEnum = pgEnum("incident_severity", ["MINOR", "CAUTION", "SEVERE"]);
export const guardianContactStatusEnum = pgEnum("guardian_contact_status", ["CONTACTED", "NEEDED", "NOT_NEEDED"]);

export const safetyIncidents = pgTable("safety_incidents", {
  id: text("id").primaryKey(),                     // inc_xxx
  academyId: text("academy_id").notNull().references(() => academies.id),
  participantId: text("participant_id").notNull(),
  sessionId: text("session_id"),                   // 수업 컨텍스트(선택)
  reportedByUserId: text("reported_by_user_id").notNull().references(() => users.id),
  type: incidentTypeEnum("type").notNull(),
  severity: incidentSeverityEnum("severity").notNull(),
  situation: text("situation").notNull(),          // 언제·어디서·어떻게
  location: text("location"),
  firstAid: text("first_aid"),                     // 현장 조치
  classContinued: boolean("class_continued").notNull(),
  followUpNeeded: boolean("follow_up_needed").notNull(),
  guardianContact: guardianContactStatusEnum("guardian_contact").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "string" }).notNull(), // 서버 기록 시각
  createdAt: createdAt(),
}, (t) => [
  index("ix_incident_academy_occurred").on(t.academyId, t.occurredAt),
  index("ix_incident_participant").on(t.participantId),
  foreignKey({ name: "fk_incident_participant_academy", columns: [t.participantId, t.academyId], foreignColumns: [participants.id, participants.academyId] }),
  foreignKey({ name: "fk_incident_session_academy", columns: [t.sessionId, t.academyId], foreignColumns: [classSessions.id, classSessions.academyId] }),
]);

/* ── PACEFOLIO 구독(학원→우리) — 가격 확정 2026-07-18: BASIC 29,000 / PRO 99,000 ── */
export const subscriptionPlanEnum = pgEnum("subscription_plan", ["BASIC", "PRO"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", ["TRIAL", "ACTIVE", "PAST_DUE", "CANCELED"]);

export const academySubscriptions = pgTable("academy_subscriptions", {
  id: text("id").primaryKey(),                     // sub_xxx
  academyId: text("academy_id").notNull().references(() => academies.id),
  plan: subscriptionPlanEnum("plan").notNull(),
  status: subscriptionStatusEnum("status").notNull(),
  priceKrwMonthly: integer("price_krw_monthly").notNull(), // 스냅샷 — 가격 개정 대비
  startedAt: timestamp("started_at", { withTimezone: true, mode: "string" }).notNull(),
  canceledAt: timestamp("canceled_at", { withTimezone: true, mode: "string" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  version: version(),
}, (t) => [
  uniqueIndex("uq_subscription_academy").on(t.academyId), // 학원당 구독 1개(플랜 변경 = 갱신)
  check("ck_subscription_price", sql`${t.priceKrwMonthly} > 0 AND ${t.priceKrwMonthly} <= 10000000`),
]);

/* 구독 이력 ledger(#39-④) — append-only. 플랜·가격·상태의 모든 변화가 행으로 남는다
   (감사 detail 이 아니라 구조화 이력 — 정산·CS·grandfather 근거) */
export const subscriptionLedger = pgTable("subscription_ledger", {
  id: text("id").primaryKey(),                     // sl_xxx
  academyId: text("academy_id").notNull().references(() => academies.id),
  subscriptionId: text("subscription_id").notNull().references(() => academySubscriptions.id),
  eventType: text("event_type").notNull(),         // CREATED|PLAN_CHANGED|STATUS_CHANGED|CANCELED|REACTIVATED
  fromPlan: text("from_plan"),
  toPlan: text("to_plan"),
  fromPriceKrw: integer("from_price_krw"),
  toPriceKrw: integer("to_price_krw"),
  fromStatus: text("from_status"),
  toStatus: text("to_status"),
  actorUserId: text("actor_user_id").notNull().references(() => users.id),
  reason: text("reason"),
  createdAt: createdAt(),
}, (t) => [
  index("ix_subledger_academy_created").on(t.academyId, t.createdAt),
]);

/* SupportView — 플랫폼 관리자의 테넌트 내부 열람은 세션 단위로만
   (domain authorization.ts 설계의 DB 정본): 사유 필수 · 시간 제한 · 철회 가능 · 전 이력 감사 */
export const supportViews = pgTable("support_views", {
  id: text("id").primaryKey(),                     // sv_xxx
  academyId: text("academy_id").notNull().references(() => academies.id),
  adminUserId: text("admin_user_id").notNull().references(() => users.id),
  reason: text("reason").notNull(),                // 발급 사유 — 공란 금지
  allowedResources: text("allowed_resources").notNull(), // JSON 배열 문자열
  issuedAt: timestamp("issued_at", { withTimezone: true, mode: "string" }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "string" }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "string" }),
  createdAt: createdAt(),
}, (t) => [
  index("ix_support_views_academy").on(t.academyId),
  check("ck_support_view_window", sql`${t.expiresAt} > ${t.issuedAt}`),
]);

/* ── 휴무 이벤트(#38 — PC draft 정본화 1): "숫자 직접 수정 금지, event 가 회차를 재계산" ── */
export const closureEvents = pgTable("closure_events", {
  id: text("id").primaryKey(),                     // ce_xxx
  academyId: text("academy_id").notNull().references(() => academies.id),
  scope: text("scope").notNull(),                  // ACADEMY | CLASS
  classId: text("class_id"),                       // scope=CLASS 일 때
  dateStart: date("date_start").notNull(),
  dateEnd: date("date_end").notNull(),
  closureType: text("closure_type").notNull(),     // 공휴일·시설점검·학원휴무 등(화면 서술)
  reason: text("reason").notNull(),
  deductSessions: boolean("deduct_sessions").notNull(), // true = 회차 차감(세션 취소·청구 모수 제외)
  createdByUserId: text("created_by_user_id").notNull().references(() => users.id),
  revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "string" }), // 철회 = 세션 복원(이력 보존)
  createdAt: createdAt(),
}, (t) => [
  index("ix_closure_academy_date").on(t.academyId, t.dateStart),
  check("ck_closure_range", sql`${t.dateEnd} >= ${t.dateStart}`),
  check("ck_closure_scope", sql`${t.scope} IN ('ACADEMY','CLASS')`),
  foreignKey({ name: "fk_closure_class_academy", columns: [t.classId, t.academyId], foreignColumns: [dbClasses.id, dbClasses.academyId] }),
]);

/* ── 기본선 3단계(#24): 공지 — 발행·읽음 추적(미열람 명단의 서버 정본) ── */
export const dbNotices = pgTable("notices", {
  id: text("id").primaryKey(),                     // nt_xxx
  academyId: text("academy_id").notNull().references(() => academies.id),
  title: text("title").notNull(),
  body: text("body").notNull(),
  audience: text("audience").notNull(),            // 대상 서술(AudienceFilter 직렬화 — v1 텍스트)
  publishedAt: timestamp("published_at", { withTimezone: true, mode: "string" }).notNull(),
  createdByUserId: text("created_by_user_id").notNull().references(() => users.id),
  createdAt: createdAt(),
}, (t) => [
  index("ix_notice_academy_published").on(t.academyId, t.publishedAt),
  uniqueIndex("uq_notice_id_academy").on(t.id, t.academyId),
]);

export const noticeReceipts = pgTable("notice_receipts", {
  id: text("id").primaryKey(),                     // ntr_xxx
  noticeId: text("notice_id").notNull(),
  academyId: text("academy_id").notNull().references(() => academies.id),
  userId: text("user_id").notNull().references(() => users.id),
  readAt: timestamp("read_at", { withTimezone: true, mode: "string" }),
}, (t) => [
  uniqueIndex("uq_notice_receipt").on(t.noticeId, t.userId),
  foreignKey({ name: "fk_receipt_notice_academy", columns: [t.noticeId, t.academyId], foreignColumns: [dbNotices.id, dbNotices.academyId] }),
]);

/* ── R7 배치 5: 환불 persistence (domain Refund·RefundAllocation 이행) ──
   정책(코드·OpenAPI·docs 동일): 부분승인 미지원(approved=requested) ·
   Refund 1건=원생 1명 · 요청자=실제 결제자 · 상호 승인(동일인 금지). */
export const refundStatusEnum = pgEnum("refund_status", ["REQUESTED", "MUTUALLY_APPROVED", "PROCESSING", "COMPLETED", "FAILED", "UNKNOWN", "REJECTED"]);

export const refunds = pgTable("refunds", {
  id: text("id").primaryKey(),                    // ref_xxx
  academyId: text("academy_id").notNull().references(() => academies.id),
  paymentId: text("payment_id").notNull(),
  participantId: text("participant_id").notNull(), // 원생 1명 귀속(R4 P0-2)
  status: refundStatusEnum("status").notNull(),
  reasonCode: text("reason_code").notNull(),
  reasonText: text("reason_text"),
  requestedAmount: integer("requested_amount").notNull(),
  approvedAmount: integer("approved_amount"),      // 부분승인 금지 — 있으면 =requested
  completedAmount: integer("completed_amount"),
  requestedByUserId: text("requested_by_user_id").notNull().references(() => users.id),
  requestedAt: timestamp("requested_at", { withTimezone: true, mode: "string" }).notNull(),
  guardianApprovedByUserId: text("guardian_approved_by_user_id"),
  guardianApprovedAt: timestamp("guardian_approved_at", { withTimezone: true, mode: "string" }),
  academyApprovedByUserId: text("academy_approved_by_user_id"),
  academyApprovedAt: timestamp("academy_approved_at", { withTimezone: true, mode: "string" }),
  idempotencyKey: text("idempotency_key").notNull(),
  providerRefundId: text("provider_refund_id"),
  lastEventAt: timestamp("last_event_at", { withTimezone: true, mode: "string" }),
  completedAt: timestamp("completed_at", { withTimezone: true, mode: "string" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  version: version(),
}, (t) => [
  uniqueIndex("uq_refund_idem").on(t.academyId, t.requestedByUserId, t.idempotencyKey),
  uniqueIndex("uq_refund_id_academy").on(t.id, t.academyId),
  uniqueIndex("uq_refund_id_payment").on(t.id, t.paymentId), // R9-P0-02 연쇄 FK 대상
  uniqueIndex("uq_refund_id_participant_academy").on(t.id, t.participantId, t.academyId), // R10: Refund↔RA participant 연쇄 대상
  index("ix_refund_payment").on(t.paymentId),
  check("ck_refund_requested_positive", sql`${t.requestedAmount} > 0`),
  check("ck_refund_requested_max", sql`${t.requestedAmount} <= 100000000`), // C10-01 (approved·completed 는 =requested CHECK 로 전파)
  // 부분승인 금지를 DB 도 강제(R4 P0-1): approved 가 있으면 반드시 requested 와 동일
  check("ck_refund_no_partial_approval", sql`${t.approvedAmount} IS NULL OR ${t.approvedAmount} = ${t.requestedAmount}`),
  // 교차 테넌트 차단(R7 P0-6): Payment·Participant 와 academy 결합
  foreignKey({ name: "fk_refund_payment_academy", columns: [t.paymentId, t.academyId], foreignColumns: [payments.id, payments.academyId] }),
  foreignKey({ name: "fk_refund_participant_academy", columns: [t.participantId, t.academyId], foreignColumns: [participants.id, participants.academyId] }),
]);

/* ── 배치 14: 소통(채팅) — docs/12 개정 계약 (방·멤버·메시지·ACK) ──
   테넌트: 전부 academyId + 복합 FK. 읽음 = lastReadAt(멤버) + ack 행(메시지별).
   READ ≠ ACKNOWLEDGED ≠ RESOLVED 를 스키마가 그대로 표현. */
export const chatRoomTypeEnum = pgEnum("chat_room_type", [
  "OWNER_COACH_DM", "COACH_ALL", "CLASS_COACHES", "GUARDIAN_DM", "CLASS_GUARDIANS", "ACADEMY_NOTICE",
]);
export const chatMessageKindEnum = pgEnum("chat_message_kind", [
  "NORMAL_CHAT", "NOTICE", "ACK_REQUIRED", "URGENT_ACK_REQUIRED", "OPERATIONAL_TASK",
]);
export const chatMessageStatusEnum = pgEnum("chat_message_status", [
  "SENT", "DELIVERED", "READ", "ACKNOWLEDGED", "RESOLVED", "CANCELLED", "EXPIRED",
]);
export const chatCategoryEnum = pgEnum("chat_category", ["GENERAL", "BILLING", "HEALTH"]);

export const chatRooms = pgTable("chat_rooms", {
  id: text("id").primaryKey(),                     // cr_xxx
  academyId: text("academy_id").notNull().references(() => academies.id),
  type: chatRoomTypeEnum("type").notNull(),
  title: text("title").notNull(),
  dmKey: text("dm_key"),                           // DM 중복 방지(도메인 dmKey)
  relatedParticipantId: text("related_participant_id"), // GUARDIAN_DM 원생 컨텍스트
  createdByUserId: text("created_by_user_id").notNull().references(() => users.id),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("uq_chatroom_id_academy").on(t.id, t.academyId),
  uniqueIndex("uq_chatroom_dmkey").on(t.academyId, t.dmKey),
  foreignKey({ name: "fk_chatroom_participant_academy", columns: [t.relatedParticipantId, t.academyId], foreignColumns: [participants.id, participants.academyId] }),
]);

export const chatRoomMembers = pgTable("chat_room_members", {
  id: text("id").primaryKey(),                     // crm_xxx
  roomId: text("room_id").notNull(),
  academyId: text("academy_id").notNull().references(() => academies.id),
  userId: text("user_id").notNull().references(() => users.id),
  role: text("role").notNull(),                    // OWNER | COACH | GUARDIAN | DESK
  joinedAt: timestamp("joined_at", { withTimezone: true, mode: "string" }).notNull(),
  leftAt: timestamp("left_at", { withTimezone: true, mode: "string" }),   // 퇴장 이력 보존
  lastReadAt: timestamp("last_read_at", { withTimezone: true, mode: "string" }),
}, (t) => [
  uniqueIndex("uq_chatmember_room_user").on(t.roomId, t.userId),
  index("ix_chatmember_user").on(t.userId),
  foreignKey({ name: "fk_chatmember_room_academy", columns: [t.roomId, t.academyId], foreignColumns: [chatRooms.id, chatRooms.academyId] }),
]);

export const chatMessages = pgTable("chat_messages", {
  id: text("id").primaryKey(),                     // cm_xxx
  roomId: text("room_id").notNull(),
  academyId: text("academy_id").notNull().references(() => academies.id),
  senderUserId: text("sender_user_id").notNull().references(() => users.id),
  kind: chatMessageKindEnum("kind").notNull(),
  category: chatCategoryEnum("category").notNull().default("GENERAL"),
  status: chatMessageStatusEnum("status").notNull(),
  body: text("body").notNull(),
  contextCard: text("context_card"),               // ⚠️ 서버만 생성(13차 C P0-1) — 클라이언트 입력 금지
  clientMessageId: text("client_message_id"),      // 13차 C P1-5: 전송 멱등(모바일 재시도 중복 방지)
  relatedParticipantId: text("related_participant_id"),
  resolvedNote: text("resolved_note"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true, mode: "string" }),
  createdAt: createdAt(),
  editedAt: timestamp("edited_at", { withTimezone: true, mode: "string" }),
  deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "string" }), // soft — 원문 보존
}, (t) => [
  index("ix_chatmsg_room_created").on(t.roomId, t.createdAt),
  uniqueIndex("uq_chatmsg_id_academy").on(t.id, t.academyId),
  uniqueIndex("uq_chatmsg_client_id").on(t.academyId, t.senderUserId, t.clientMessageId), // 전송 멱등
  foreignKey({ name: "fk_chatmsg_room_academy", columns: [t.roomId, t.academyId], foreignColumns: [chatRooms.id, chatRooms.academyId] }),
  foreignKey({ name: "fk_chatmsg_participant_academy", columns: [t.relatedParticipantId, t.academyId], foreignColumns: [participants.id, participants.academyId] }),
  // 민감 카테고리 불변식 — 서비스가 막아도 DB 가 최종 방어
  check("ck_chatmsg_health_participant", sql`${t.category} <> 'HEALTH' OR ${t.relatedParticipantId} IS NOT NULL`),
  check("ck_chatmsg_billing_card", sql`${t.category} <> 'BILLING' OR ${t.contextCard} IS NOT NULL`),
]);

export const chatMessageAcks = pgTable("chat_message_acks", {
  id: text("id").primaryKey(),                     // ack_xxx
  messageId: text("message_id").notNull(),
  academyId: text("academy_id").notNull().references(() => academies.id),
  userId: text("user_id").notNull().references(() => users.id),
  readAt: timestamp("read_at", { withTimezone: true, mode: "string" }),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true, mode: "string" }),
}, (t) => [
  uniqueIndex("uq_chatack_message_user").on(t.messageId, t.userId),
  index("ix_chatack_user").on(t.userId),
  foreignKey({ name: "fk_chatack_message_academy", columns: [t.messageId, t.academyId], foreignColumns: [chatMessages.id, chatMessages.academyId] }),
]);

/* ── 프로그램 스튜디오 PS1 (docs/20·21·22) ──
   원장이 직접 만드는 범용 프로그램 저작 시스템 — 비즈니스 콘텐츠(단계명·영역명·
   활동명)는 전부 데이터. enum 은 시스템 상태만. 이름은 식별자가 아니다:
   Activity(불변 ID) + ActivityRevision(개정되는 콘텐츠) — 커리큘럼·기록은
   revisionId 를 참조해 이름이 바뀌어도 과거가 안 바뀐다. */
export const programVersionStatusEnum = pgEnum("program_version_status", [
  "DRAFT", "IN_REVIEW", "PUBLISHED", "ARCHIVED",
]);
export const programModeEnum = pgEnum("program_mode", [
  "EXPERIENCE", "SKILL_MASTERY", "SEASONAL", "MEASUREMENT", "COURSE",
]);
export const activityStatusEnum = pgEnum("activity_status", ["ACTIVE", "ARCHIVED"]);
export const growthTagRoleEnum = pgEnum("growth_tag_role", ["PRIMARY", "SECONDARY"]);

export const programs = pgTable("programs", {
  id: text("id").primaryKey(),                     // prog_xxx
  academyId: text("academy_id").notNull().references(() => academies.id),
  name: text("name").notNull(),
  description: text("description"),
  targetAgeLabel: text("target_age_label"),
  /* 상품화 준비(docs/20 §6) — 1차는 값만 확보 */
  ownershipType: text("ownership_type").notNull().default("PRIVATE_ACADEMY"),
  visibility: text("visibility").notNull().default("PRIVATE"),
  createdByUserId: text("created_by_user_id").notNull().references(() => users.id),
  archivedAt: timestamp("archived_at", { withTimezone: true, mode: "string" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  version: version(),
}, (t) => [
  uniqueIndex("uq_program_id_academy").on(t.id, t.academyId),
  index("ix_program_academy").on(t.academyId),
  check("ck_program_ownership", sql`${t.ownershipType} IN ('PRIVATE_ACADEMY','PLATFORM_TEMPLATE','MARKETPLACE_PRODUCT','INSTALLED_COPY')`),
  check("ck_program_visibility", sql`${t.visibility} IN ('PRIVATE','UNLISTED','PUBLIC')`),
]);

/* 진행 방식 — 프로그램당 복수 조합(EXPERIENCE+SKILL_MASTERY 등) */
export const programModes = pgTable("program_modes", {
  id: text("id").primaryKey(),                     // pmode_xxx
  programId: text("program_id").notNull(),
  academyId: text("academy_id").notNull().references(() => academies.id),
  mode: programModeEnum("mode").notNull(),
}, (t) => [
  uniqueIndex("uq_program_mode").on(t.programId, t.mode),
  foreignKey({ name: "fk_pmode_program_academy", columns: [t.programId, t.academyId], foreignColumns: [programs.id, programs.academyId] }),
]);

/* 게시 단위 — DRAFT 만 편집 가능 · PUBLISHED 직접 수정 금지(서비스 불변식) */
export const programVersions = pgTable("program_versions", {
  id: text("id").primaryKey(),                     // pv_xxx
  academyId: text("academy_id").notNull().references(() => academies.id),
  programId: text("program_id").notNull(),
  versionLabel: text("version_label").notNull(),
  status: programVersionStatusEnum("status").notNull().default("DRAFT"),
  basedOnVersionId: text("based_on_version_id"),   // 복제 계보
  publishedAt: timestamp("published_at", { withTimezone: true, mode: "string" }),
  publishedByUserId: text("published_by_user_id"),
  createdByUserId: text("created_by_user_id").notNull().references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  version: version(),
}, (t) => [
  uniqueIndex("uq_pv_id_academy").on(t.id, t.academyId),
  index("ix_pv_program").on(t.programId),
  foreignKey({ name: "fk_pv_program_academy", columns: [t.programId, t.academyId], foreignColumns: [programs.id, programs.academyId] }),
]);

/* 단계 — 학원이 직접 생성(PLAY 1·2·3, S/C/B/A, Level 1~10 은 전부 이 테이블의 행) */
export const programLevels = pgTable("program_levels", {
  id: text("id").primaryKey(),                     // plv_xxx
  academyId: text("academy_id").notNull().references(() => academies.id),
  programVersionId: text("program_version_id").notNull(),
  name: text("name").notNull(),
  code: text("code"),
  description: text("description"),
  targetAgeLabel: text("target_age_label"),
  sortOrder: integer("sort_order").notNull().default(0),
  color: text("color"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex("uq_plv_id_academy").on(t.id, t.academyId),
  uniqueIndex("uq_plv_version_name").on(t.programVersionId, t.name),
  foreignKey({ name: "fk_plv_version_academy", columns: [t.programVersionId, t.academyId], foreignColumns: [programVersions.id, programVersions.academyId] }),
]);

/* 성장 영역(FMS 등) — 테넌트 소유(docs/21 결정 3: 템플릿은 seed 복사) */
export const growthDomains = pgTable("growth_domains", {
  id: text("id").primaryKey(),                     // gro_xxx
  academyId: text("academy_id").notNull().references(() => academies.id),
  parentId: text("parent_id"),                     // 대분류(Locomotor) → 소분류(Running)
  code: text("code"),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category"),
  color: text("color"),
  icon: text("icon"),
  reportVisible: boolean("report_visible").notNull().default(true),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  version: version(),
}, (t) => [
  uniqueIndex("uq_gro_id_academy").on(t.id, t.academyId),
  index("ix_gro_academy").on(t.academyId),
  foreignKey({ name: "fk_gro_parent_academy", columns: [t.parentId, t.academyId], foreignColumns: [t.id, t.academyId] }),
]);

/* 활동 원본 — 불변 ID. 이름·설명은 revision 콘텐츠(이 테이블엔 이름 없음).
   currentRevisionId = FK 없는 포인터(순환 회피) — 정합은 서비스 tx 유지. */
export const activities = pgTable("activities", {
  id: text("id").primaryKey(),                     // act_xxx
  academyId: text("academy_id").notNull().references(() => academies.id),
  status: activityStatusEnum("status").notNull().default("ACTIVE"),
  currentRevisionId: text("current_revision_id"),
  createdByUserId: text("created_by_user_id").notNull().references(() => users.id),
  archivedAt: timestamp("archived_at", { withTimezone: true, mode: "string" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  version: version(),
}, (t) => [
  uniqueIndex("uq_act_id_academy").on(t.id, t.academyId),
  index("ix_act_academy_status").on(t.academyId, t.status),
]);

/* 활동 개정판 — 게시/수업에 사용된 뒤의 변경은 새 개정판(과거 기록 보존) */
export const activityRevisions = pgTable("activity_revisions", {
  id: text("id").primaryKey(),                     // arv_xxx
  academyId: text("academy_id").notNull().references(() => academies.id),
  activityId: text("activity_id").notNull(),
  revisionNumber: integer("revision_number").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  instructions: text("instructions"),
  easyVariation: text("easy_variation"),
  standardVariation: text("standard_variation"),
  challengeVariation: text("challenge_variation"),
  coachingPoints: text("coaching_points"),
  safetyNotes: text("safety_notes"),
  difficultyLabel: text("difficulty_label"),
  recommendedAgeLabel: text("recommended_age_label"),
  recommendedMinutes: integer("recommended_minutes"),
  participantFormat: text("participant_format"),
  spaceRequirement: text("space_requirement"),
  createdByUserId: text("created_by_user_id").notNull().references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex("uq_arv_id_academy").on(t.id, t.academyId),
  uniqueIndex("uq_arv_activity_number").on(t.activityId, t.revisionNumber),
  foreignKey({ name: "fk_arv_activity_academy", columns: [t.activityId, t.academyId], foreignColumns: [activities.id, activities.academyId] }),
]);

/* 개정판 × 성장영역 — 대표(PRIMARY) 1 + 보조(SECONDARY) N (중복 태그 금지) */
export const activityRevisionGrowthTags = pgTable("activity_revision_growth_tags", {
  id: text("id").primaryKey(),                     // argt_xxx
  academyId: text("academy_id").notNull().references(() => academies.id),
  activityRevisionId: text("activity_revision_id").notNull(),
  growthDomainId: text("growth_domain_id").notNull(),
  role: growthTagRoleEnum("role").notNull(),
}, (t) => [
  uniqueIndex("uq_argt_revision_domain").on(t.activityRevisionId, t.growthDomainId),
  index("ix_argt_domain").on(t.growthDomainId),
  foreignKey({ name: "fk_argt_revision_academy", columns: [t.activityRevisionId, t.academyId], foreignColumns: [activityRevisions.id, activityRevisions.academyId] }),
  foreignKey({ name: "fk_argt_domain_academy", columns: [t.growthDomainId, t.academyId], foreignColumns: [growthDomains.id, growthDomains.academyId] }),
]);

/* 커리큘럼 구조 — 연간/분기/시즌 등 임의 계층(주차 수 고정 없음) */
export const curriculumSections = pgTable("curriculum_sections", {
  id: text("id").primaryKey(),                     // csec_xxx
  academyId: text("academy_id").notNull().references(() => academies.id),
  programVersionId: text("program_version_id").notNull(),
  parentSectionId: text("parent_section_id"),
  sectionType: text("section_type").notNull(),     // YEAR|QUARTER|SEASON|UNIT 등 서술 값
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("uq_csec_id_academy").on(t.id, t.academyId),
  index("ix_csec_version").on(t.programVersionId),
  foreignKey({ name: "fk_csec_version_academy", columns: [t.programVersionId, t.academyId], foreignColumns: [programVersions.id, programVersions.academyId] }),
  foreignKey({ name: "fk_csec_parent_academy", columns: [t.parentSectionId, t.academyId], foreignColumns: [t.id, t.academyId] }),
]);

/* 회차(주차) — "1분기 1주 차" */
export const curriculumSessions = pgTable("curriculum_sessions", {
  id: text("id").primaryKey(),                     // cses_xxx
  academyId: text("academy_id").notNull().references(() => academies.id),
  programVersionId: text("program_version_id").notNull(),
  sectionId: text("section_id").notNull(),
  name: text("name").notNull(),
  sequence: integer("sequence").notNull(),
  theme: text("theme"),
  objective: text("objective"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex("uq_cses_id_academy").on(t.id, t.academyId),
  index("ix_cses_section_seq").on(t.sectionId, t.sequence),
  foreignKey({ name: "fk_cses_version_academy", columns: [t.programVersionId, t.academyId], foreignColumns: [programVersions.id, programVersions.academyId] }),
  foreignKey({ name: "fk_cses_section_academy", columns: [t.sectionId, t.academyId], foreignColumns: [curriculumSections.id, curriculumSections.academyId] }),
]);

/* 회차 × 활동 — 이름이 아니라 확정된 개정판(revisionId)을 연결(활동 3개 고정 없음) */
export const curriculumSessionActivities = pgTable("curriculum_session_activities", {
  id: text("id").primaryKey(),                     // csa_xxx
  academyId: text("academy_id").notNull().references(() => academies.id),
  curriculumSessionId: text("curriculum_session_id").notNull(),
  activityRevisionId: text("activity_revision_id").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  required: boolean("required").notNull().default(true),
  recommendedMinutes: integer("recommended_minutes"),
}, (t) => [
  index("ix_csa_session").on(t.curriculumSessionId),
  index("ix_csa_revision").on(t.activityRevisionId),
  foreignKey({ name: "fk_csa_session_academy", columns: [t.curriculumSessionId, t.academyId], foreignColumns: [curriculumSessions.id, curriculumSessions.academyId] }),
  foreignKey({ name: "fk_csa_revision_academy", columns: [t.activityRevisionId, t.academyId], foreignColumns: [activityRevisions.id, activityRevisions.academyId] }),
]);

/* ── 가져오기 스테이징 PS3 (docs/20 §4 · 지시서 §8) ──
   원본을 운영 테이블에 바로 넣지 않는다: 업로드→정규화→검증→중복후보→미리보기
   →원장 확인→커밋(tx). 원본 행(rawPayload) 영구 보존 · 자동 병합 금지. */
export const importBatchStatusEnum = pgEnum("import_batch_status", ["STAGED", "COMMITTED", "REVERTED"]);

export const importBatches = pgTable("import_batches", {
  id: text("id").primaryKey(),                     // imb_xxx
  academyId: text("academy_id").notNull().references(() => academies.id),
  targetType: text("target_type").notNull().default("ACTIVITY"), // 미래: SKILL 등
  fileName: text("file_name").notNull(),
  fileHash: text("file_hash").notNull(),           // SHA-256 — 같은 파일 중복 커밋 방지
  status: importBatchStatusEnum("status").notNull().default("STAGED"),
  mapping: text("mapping").notNull(),              // 열 매핑 JSON(자동 제안 + 원장 확정)
  uploadedByUserId: text("uploaded_by_user_id").notNull().references(() => users.id),
  committedAt: timestamp("committed_at", { withTimezone: true, mode: "string" }),
  committedByUserId: text("committed_by_user_id"),
  revertedAt: timestamp("reverted_at", { withTimezone: true, mode: "string" }),
  revertedByUserId: text("reverted_by_user_id"),
  createdAt: createdAt(),
  version: version(),
}, (t) => [
  uniqueIndex("uq_imb_id_academy").on(t.id, t.academyId),
  index("ix_imb_academy_hash").on(t.academyId, t.fileHash), // 재업로드 감지
]);

export const importRows = pgTable("import_rows", {
  id: text("id").primaryKey(),                     // imr_xxx
  academyId: text("academy_id").notNull().references(() => academies.id),
  importBatchId: text("import_batch_id").notNull(),
  sourceRowNumber: integer("source_row_number").notNull(), // 원본 행 추적(헤더=1)
  rawPayload: text("raw_payload").notNull(),       // 원본 셀 JSON — 영구 보존
  normalizedPayload: text("normalized_payload").notNull(), // 정규화 제안 JSON(수정 가능)
  validationStatus: text("validation_status").notNull(),   // VALID | INVALID
  validationMessages: text("validation_messages").notNull(), // JSON 배열
  duplicateCandidateIds: text("duplicate_candidate_ids").notNull(), // JSON 배열 — 제안만
  resolution: text("resolution").notNull().default("CREATE"), // CREATE | SKIP
  committedEntityId: text("committed_entity_id"),  // 커밋 시 생성된 activityId
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex("uq_imr_batch_row").on(t.importBatchId, t.sourceRowNumber),
  index("ix_imr_batch").on(t.importBatchId),
  check("ck_imr_resolution", sql`${t.resolution} IN ('CREATE', 'SKIP')`),
  check("ck_imr_validation", sql`${t.validationStatus} IN ('VALID', 'INVALID')`),
  foreignKey({ name: "fk_imr_batch_academy", columns: [t.importBatchId, t.academyId], foreignColumns: [importBatches.id, importBatches.academyId] }),
]);

/* ── 프로그램 실행 PS4 (docs/20 §2 · 지시서 §6.6~6.8) ──
   게시된 프로그램을 반에 적용하고, 실제 수업(classSessions)과 커리큘럼 회차를
   연결(session_plans), 코치가 활동 결과를 확정하면 참석 원생의 경험 이벤트가
   쌓인다. 경험 ≠ 숙련(점수 아님) — 이벤트는 append-only·중복은 UNIQUE 로 차단.
   게시 버전은 불변(PS1)이므로 참조가 곧 스냅샷 — 과거 수업 내용이 안 바뀐다. */
export const sessionActivityResultEnum = pgEnum("session_activity_result", [
  "COMPLETED", "PARTIAL", "NOT_DONE", "REPLACED",
]);
export const experienceParticipationEnum = pgEnum("experience_participation", [
  "FULL", "PARTIAL", "OBSERVED", "NOT_PARTICIPATED",
]);

/* 반 ↔ 게시된 프로그램 버전 — 같은 버전을 여러 반에 적용 가능 */
export const classProgramAssignments = pgTable("class_program_assignments", {
  id: text("id").primaryKey(),                     // cpa_xxx
  academyId: text("academy_id").notNull().references(() => academies.id),
  classId: text("class_id").notNull(),
  programVersionId: text("program_version_id").notNull(), // PUBLISHED 만(서비스 검증)
  programLevelId: text("program_level_id"),
  effectiveFrom: date("effective_from").notNull(),
  effectiveTo: date("effective_to"),
  startCurriculumSessionId: text("start_curriculum_session_id"),
  allowIndividualProgress: boolean("allow_individual_progress").notNull().default(true),
  coachEditPolicy: text("coach_edit_policy").notNull().default("REPLACE_ALLOWED"), // 대체 허용 정책
  status: text("status").notNull().default("ACTIVE"), // ACTIVE | ENDED
  createdByUserId: text("created_by_user_id").notNull().references(() => users.id),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("uq_cpa_id_academy").on(t.id, t.academyId),
  index("ix_cpa_class").on(t.classId),
  // 같은 반에 같은 버전 ACTIVE 중복 적용 금지(종료 후 재적용 허용)
  uniqueIndex("uq_cpa_active").on(t.classId, t.programVersionId)
    .where(sql`${t.status} = 'ACTIVE'`),
  check("ck_cpa_status", sql`${t.status} IN ('ACTIVE', 'ENDED')`),
  check("ck_cpa_edit_policy", sql`${t.coachEditPolicy} IN ('REPLACE_ALLOWED', 'PLAN_LOCKED')`),
  foreignKey({ name: "fk_cpa_class_academy", columns: [t.classId, t.academyId], foreignColumns: [dbClasses.id, dbClasses.academyId] }),
  foreignKey({ name: "fk_cpa_version_academy", columns: [t.programVersionId, t.academyId], foreignColumns: [programVersions.id, programVersions.academyId] }),
  foreignKey({ name: "fk_cpa_level_academy", columns: [t.programLevelId, t.academyId], foreignColumns: [programLevels.id, programLevels.academyId] }),
]);

/* 실제 수업 ↔ 커리큘럼 회차 — 오늘 수업의 계획. 게시 버전 참조 = 불변 스냅샷 */
export const sessionPlans = pgTable("session_plans", {
  id: text("id").primaryKey(),                     // spl_xxx
  academyId: text("academy_id").notNull().references(() => academies.id),
  classSessionId: text("class_session_id").notNull(),
  classProgramAssignmentId: text("class_program_assignment_id").notNull(),
  curriculumSessionId: text("curriculum_session_id"), // null = 자유 수업(계획 없이 실행)
  sourceProgramVersionId: text("source_program_version_id").notNull(), // 당시 버전 고정
  createdByUserId: text("created_by_user_id").notNull().references(() => users.id),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("uq_spl_id_academy").on(t.id, t.academyId),
  uniqueIndex("uq_spl_session_assignment").on(t.classSessionId, t.classProgramAssignmentId),
  index("ix_spl_assignment").on(t.classProgramAssignmentId),
  foreignKey({ name: "fk_spl_session_academy", columns: [t.classSessionId, t.academyId], foreignColumns: [classSessions.id, classSessions.academyId] }),
  foreignKey({ name: "fk_spl_assignment_academy", columns: [t.classProgramAssignmentId, t.academyId], foreignColumns: [classProgramAssignments.id, classProgramAssignments.academyId] }),
  foreignKey({ name: "fk_spl_curriculum_academy", columns: [t.curriculumSessionId, t.academyId], foreignColumns: [curriculumSessions.id, curriculumSessions.academyId] }),
]);

/* 활동 결과 — 코치 확정. 대체(REPLACED)는 대체 활동 개정판 기록 */
export const sessionActivityResults = pgTable("session_activity_results", {
  id: text("id").primaryKey(),                     // sar_xxx
  academyId: text("academy_id").notNull().references(() => academies.id),
  sessionPlanId: text("session_plan_id").notNull(),
  activityRevisionId: text("activity_revision_id").notNull(),
  result: sessionActivityResultEnum("result").notNull(),
  replacementActivityRevisionId: text("replacement_activity_revision_id"),
  coachNote: text("coach_note"),
  confirmedByUserId: text("confirmed_by_user_id").notNull().references(() => users.id),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true, mode: "string" }).notNull(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex("uq_sar_plan_activity").on(t.sessionPlanId, t.activityRevisionId),
  foreignKey({ name: "fk_sar_plan_academy", columns: [t.sessionPlanId, t.academyId], foreignColumns: [sessionPlans.id, sessionPlans.academyId] }),
  foreignKey({ name: "fk_sar_revision_academy", columns: [t.activityRevisionId, t.academyId], foreignColumns: [activityRevisions.id, activityRevisions.academyId] }),
  foreignKey({ name: "fk_sar_replacement_academy", columns: [t.replacementActivityRevisionId, t.academyId], foreignColumns: [activityRevisions.id, activityRevisions.academyId] }),
  // REPLACED 인데 대체 활동 없음 금지 — 서비스가 막아도 DB 최종 방어
  check("ck_sar_replacement", sql`${t.result} <> 'REPLACED' OR ${t.replacementActivityRevisionId} IS NOT NULL`),
]);

/* 경험 이벤트 — append-only. 경험은 숙련 점수가 아니다(docs/20 §2).
   UNIQUE(원생·수업·활동개정판·영역) = 중복 경험 차단(지시서 §6.8 필수) */
export const participantExperienceEvents = pgTable("participant_experience_events", {
  id: text("id").primaryKey(),                     // pxe_xxx
  academyId: text("academy_id").notNull().references(() => academies.id),
  participantId: text("participant_id").notNull(),
  classSessionId: text("class_session_id").notNull(),
  activityRevisionId: text("activity_revision_id").notNull(),
  growthDomainId: text("growth_domain_id").notNull(),
  participation: experienceParticipationEnum("participation").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "string" }).notNull(),
  recordedByUserId: text("recorded_by_user_id").notNull().references(() => users.id),
}, (t) => [
  uniqueIndex("uq_pxe_dedup").on(t.participantId, t.classSessionId, t.activityRevisionId, t.growthDomainId),
  index("ix_pxe_participant_domain").on(t.participantId, t.growthDomainId),
  index("ix_pxe_participant_occurred").on(t.participantId, t.occurredAt),
  foreignKey({ name: "fk_pxe_participant_academy", columns: [t.participantId, t.academyId], foreignColumns: [participants.id, participants.academyId] }),
  foreignKey({ name: "fk_pxe_session_academy", columns: [t.classSessionId, t.academyId], foreignColumns: [classSessions.id, classSessions.academyId] }),
  foreignKey({ name: "fk_pxe_revision_academy", columns: [t.activityRevisionId, t.academyId], foreignColumns: [activityRevisions.id, activityRevisions.academyId] }),
  foreignKey({ name: "fk_pxe_domain_academy", columns: [t.growthDomainId, t.academyId], foreignColumns: [growthDomains.id, growthDomains.academyId] }),
]);

export const refundAllocations = pgTable("refund_allocations", {
  id: text("id").primaryKey(),                    // ra_xxx
  refundId: text("refund_id").notNull().references(() => refunds.id),
  paymentAllocationId: text("payment_allocation_id").notNull().references(() => paymentAllocations.id),
  paymentId: text("payment_id").notNull(), // R9-P0-02: Refund↔PA 의 payment 연쇄 강제용
  invoiceId: text("invoice_id").notNull(),
  participantId: text("participant_id").notNull(), // = Refund.participantId (서비스 tx 검증)
  academyId: text("academy_id").notNull().references(() => academies.id),
  amount: integer("amount").notNull(),
}, (t) => [
  uniqueIndex("uq_refund_alloc").on(t.refundId, t.paymentAllocationId), // 중복 차감 차단(R6·R7)
  index("ix_ra_payment_allocation").on(t.paymentAllocationId),
  check("ck_ra_amount_positive", sql`${t.amount} > 0`),
  check("ck_ra_amount_max", sql`${t.amount} <= 100000000`), // C10-01
  foreignKey({ name: "fk_ra_invoice_academy", columns: [t.invoiceId, t.academyId], foreignColumns: [invoices.id, invoices.academyId] }),
  /* R9-P0-02: 연쇄 무결성을 DB 가 직접 강제 —
     RA.invoiceId = PA.invoiceId · RA.paymentId = PA.paymentId ·
     Refund.paymentId = RA.paymentId · RA.participantId = Invoice.participantId */
  foreignKey({ name: "fk_ra_pa_invoice", columns: [t.paymentAllocationId, t.invoiceId], foreignColumns: [paymentAllocations.id, paymentAllocations.invoiceId] }),
  foreignKey({ name: "fk_ra_pa_payment", columns: [t.paymentAllocationId, t.paymentId], foreignColumns: [paymentAllocations.id, paymentAllocations.paymentId] }),
  foreignKey({ name: "fk_ra_refund_payment", columns: [t.refundId, t.paymentId], foreignColumns: [refunds.id, refunds.paymentId] }),
  foreignKey({ name: "fk_ra_invoice_participant", columns: [t.invoiceId, t.participantId], foreignColumns: [invoices.id, invoices.participantId] }),
  /* R10(R9-P0-02 마지막 경계): Refund.participantId = RA.participantId 를 DB 가
     직접 강제 — Invoice·RA 는 일치시키고 Refund 만 다른 원생인 위장 차단.
     3열 FK 가 기존 fk_ra_refund_academy(2열)를 포함하므로 그 제약은 정리. */
  foreignKey({ name: "fk_ra_refund_participant_academy", columns: [t.refundId, t.participantId, t.academyId], foreignColumns: [refunds.id, refunds.participantId, refunds.academyId] }),
]);
