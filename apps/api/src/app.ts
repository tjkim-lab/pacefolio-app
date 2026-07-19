/* PACEFOLIO API — Hono 앱 조립 (api/openapi.yaml auth 섹션 구현)
   테스트는 app.request() 인메모리 — 서버 기동 불필요(PGlite 조합). */
import { Hono, type Context } from "hono";
import { setCookie, deleteCookie } from "hono/cookie";
import { z } from "zod";
import type { Db } from "./sessions/service";
import { revokeSession, revokeAllSessions, SESSION_TTL_DAYS, type IssuedSession } from "./sessions/service";
import { startOAuth, handleOAuthCallback } from "./auth/service";
import type { ProviderRegistry, OAuthProviderName } from "./auth/provider";
import { requireSession, requireCsrf, requireAcademyContext, requireAcademyAlive, requirePlatformAdmin, SESSION_COOKIE, CSRF_COOKIE, type GuardEnv } from "./guard";
import {
  getPlatformOverview, listAcademiesOverview, setSubscription, cancelSubscription,
  setSubscriptionStatus, listSubscriptionLedger,
  issueSupportView, revokeSupportView, listSupportViews,
  suspendAcademy, unsuspendAcademy, adminRevokeUserSessions,
  listFeatureGrants, grantFeature, revokeFeatureGrant, grantAllFeatures,
} from "./admin/service";
import { rateLimit } from "./rate-limit";
import { naverFromEnv } from "./naver/service";
import { hqCrawlerFromEnv, HqCrawlerError } from "./hq/service";
import { requestGuardianLink } from "./linking/service";
import { revokeGuardianLink } from "./linking/revoke";
import {
  resolveInviteCode, createVerifiedPhoneSession, selfRegisterGuardianChildren,
} from "./guardian/onboarding";
import {
  createClass, generateSessions, cancelSession, listClasses, listSessions, listClassRoster,
} from "./classes/service";
import {
  createParticipant, changeParticipantStatus, enrollParticipant, endEnrollment, listParticipants,
  getParticipantDetail,
} from "./students/service";
import {
  createProgram, listPrograms, updateProgram, createVersion, publishVersion, getVersionDetail,
  createLevel, updateLevel, deleteLevel,
  createGrowthDomain, listGrowthDomains, updateGrowthDomain,
  createActivity, listActivities, updateActivity, archiveActivity, setActivityGrowthTags,
  createSection, deleteSection, createCurriculumSession, deleteCurriculumSession, setSessionActivities,
} from "./programs/service";
import {
  stageImport, getImportBatch, listImportBatches, updateImportRow, commitImport, revertImport,
} from "./programs/imports";
import {
  assignProgramToClass, endProgramAssignment, getSessionPlan, createSessionPlan,
  confirmSessionResults, getExperienceMap,
} from "./programs/execution";
import {
  createSkill, setSkillCriteria, listSkills, createBadgeDefinition,
  recordSkillPractice, clearSkill, correctBadgeAward, getSkillBook, getClassSkillBoard,
} from "./programs/mastery";
import { canViewGrowth, listMyChildren, listClassAssignments } from "./programs/access";
import { duplicateProgram } from "./programs/service";
import {
  recordAttendance, completeSession, listSessionAttendance, createAttendanceNotice,
  listAttendanceNotices, acknowledgeAttendanceNotice,
} from "./attendance/service";
import {
  createBillingPeriod, createInvoice, issueInvoice, voidInvoice, recordOfflinePayment,
  bulkCreateClassDrafts, bulkIssueClassDrafts,
} from "./billing/issue";
import { swapCoach, COACH_REVOKE_MODES } from "./coaches/swap";
import { resolveAudience, exportAudienceCsv } from "./audience/service";
import { publishNotice, markNoticeRead, listNotices, remindNotice } from "./notices/service";
import { remindUnpaid } from "./billing/remind";
import { checkFeature } from "./billing/plan";
import { reportIncident, listIncidents } from "./safety/service";
import { listMyNotifications, markNotificationRead } from "./notifications/service";
import {
  createClosure, revokeClosure, listClosures, getSessionStats, prorationQuote,
} from "./closures/service";
import {
  upsertPhotoConsent, revokePhotoConsent, getPhotoConsent,
  createPhotoUpload, finalizePhoto, getPhotoDownload,
} from "./photos/service";
import type { StorageAdapter } from "./storage/adapter";
import { createAcademy, inviteMember, acceptInvite, listMembers } from "./academies/service";
import { preparePayment, processPgWebhook } from "./billing/service";
import { requestRefund, approveRefund, processRefundWebhook } from "./billing/refunds";
import { listGuardianInvoices, getPaymentStatus, getBillingSummary } from "./billing/queries";
import {
  openDm, postMessage, markRead, acknowledge, resolveMessage, listRooms, listMessages,
} from "./chat/service";
import { sha256Hex } from "./crypto";

export interface ApiConfig {
  db: Db;
  providers: ProviderRegistry;
  allowedOrigins: readonly string[]; // CSRF Origin allowlist
  redirectUri: string;               // OAuth callback (allowlist 검증된 값)
  /** 테스트 주입용 시계 — 미지정 시 실제 시각 */
  now?: () => string;
  /** true 면 Secure 쿠키(프로덕션). 테스트/로컬 http 는 false */
  secureCookies?: boolean;
  /** 개발용 로그인 활성화 — 카카오 키 없이 세션 발급. 프로덕션 강제 비활성 */
  enableDevLogin?: boolean;
  /* ── Webhook 인증 (R7 P0-1: fail-closed) ──
     등록된 provider 만 수신 — verifier 미등록 provider 는 404.
     verifier 는 raw body 기준 서명 검증(실 PG adapter 가 구현). */
  webhookVerifiers?: Record<string, (rawBody: string, header: (name: string) => string | undefined) => boolean | Promise<boolean>>;
  /** mockpg(개발 시뮬) 활성화 — 프로덕션 강제 비활성 + 시크릿 필수 */
  enableMockPg?: boolean;
  /** mockpg 전용 공유 시크릿 — enableMockPg 시 필수(없으면 mockpg 도 404) */
  mockPgSecret?: string;
  /** 사진 스토리지 어댑터(#19) — 미주입 시 사진 라우트 501(사업자 결정 대기, fail-closed) */
  storage?: StorageAdapter;
}

const PROVIDER_NAMES: readonly OAuthProviderName[] = ["kakao", "naver", "google", "apple"];

export function createApp(cfg: ApiConfig) {
  const now = cfg.now ?? (() => new Date().toISOString());
  const secure = cfg.secureCookies ?? true;
  const app = new Hono<GuardEnv>();
  /* #39-⑤ 오류 형식 표준(§24): 전 오류 = { error: CODE(, reason) } JSON.
     미처리 예외는 원문 비노출(로그만) — 스택·내부 메시지 유출 금지 */
  app.onError((err, c) => {
    console.error(`[api] unhandled: ${err instanceof Error ? err.message : err}`);
    return c.json({ error: "INTERNAL" }, 500);
  });
  app.notFound((c) => c.json({ error: "NOT_FOUND" }, 404));
  /* #39-⑤ rate limit(§32): 인증 표면 무차별 대입 방지 — IP 기준 슬라이딩 윈도 */
  const authLimit = rateLimit({ windowMs: 60_000, max: 30, keyPrefix: "auth" });
  const guard = requireSession(cfg.db, now);
  const csrf = requireCsrf(cfg.allowedOrigins);
  const academyCtx = requireAcademyContext(cfg.db, now);
  const academyAlive = requireAcademyAlive(cfg.db); // academyCtx 미적용 라우트의 정지 차단(세션 리뷰)
  const guardianCtx = requireAcademyContext(cfg.db, now, "GUARDIAN");

  const setSessionCookies = (c: Parameters<typeof setCookie>[0], ses: IssuedSession) => {
    // docs/11 §A: HttpOnly · Secure · SameSite=Lax · Path=/
    setCookie(c, SESSION_COOKIE, ses.token, {
      httpOnly: true, secure, sameSite: "Lax", path: "/", maxAge: SESSION_TTL_DAYS * 86400,
    });
    // double-submit CSRF 쿠키 — JS 가 읽어 X-CSRF-Token 헤더로 되돌려줌
    setCookie(c, CSRF_COOKIE, ses.csrfToken, {
      httpOnly: false, secure, sameSite: "Lax", path: "/", maxAge: SESSION_TTL_DAYS * 86400,
    });
  };

  /* ── 인증 시작 ── */
  app.post("/auth/:provider/start", authLimit, async (c) => {
    const name = c.req.param("provider") as OAuthProviderName;
    if (!PROVIDER_NAMES.includes(name)) return c.json({ error: "UNKNOWN_PROVIDER" }, 404);
    const provider = cfg.providers[name];
    if (!provider) return c.json({ error: "PROVIDER_NOT_CONFIGURED" }, 501);
    const r = await startOAuth(cfg.db, provider, cfg.redirectUri, now());
    return c.json(r, 200);
  });

  /* ── OAuth callback — state 원자적 소비 → code 교환 → 세션 발급 ── */
  app.get("/auth/:provider/callback", authLimit, async (c) => {
    const name = c.req.param("provider") as OAuthProviderName;
    const provider = cfg.providers[name];
    if (!provider) return c.json({ error: "PROVIDER_NOT_CONFIGURED" }, 501);
    const code = c.req.query("code");
    const state = c.req.query("state");
    if (!code || !state) return c.json({ error: "UNAUTHORIZED" }, 401);

    const result = await handleOAuthCallback(cfg.db, provider, { code, state }, now());
    if (!result.ok) {
      // 이유(state 재사용·만료·nonce 불일치 등)는 서버 로그로만 — 응답은 401 통일
      console.warn(`[auth] callback rejected: ${result.error}`);
      return c.json({ error: "UNAUTHORIZED" }, 401);
    }
    setSessionCookies(c, result.session);
    return c.json({ userId: result.userId, isNewUser: result.isNewUser }, 200);
  });

  /* ── 개발용 로그인 (실 카카오 키 발급 전 브라우저 시연·통합 테스트용) ──
     게이트: enableDevLogin && NODE_ENV !== production — 프로덕션은 404
     (PG_SIMULATION 과 같은 패턴). 결정적 userId = 이름 기반 seed 사용자 재사용. */
  const DevLoginBody = z.object({ name: z.string().min(1).max(30) }).strict();
  app.post("/auth/dev/login", authLimit, async (c) => {
    if (!cfg.enableDevLogin || process.env.NODE_ENV === "production") {
      return c.json({ error: "NOT_FOUND" }, 404);
    }
    const parsed = DevLoginBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "INVALID_BODY" }, 422);
    const { findOrCreateDevUser } = await import("./auth/dev");
    const userId = await findOrCreateDevUser(cfg.db, parsed.data.name, now());
    const ses = await (await import("./sessions/service")).issueSession(cfg.db, userId, now());
    setSessionCookies(c, ses);
    return c.json({ userId }, 200);
  });

  /* ── 세션 — route guard 의 진실(docs/10) ── */
  app.get("/sessions/me", guard, (c) => {
    const auth = c.get("auth");
    return c.json({
      user: auth.user,
      memberships: auth.memberships, // 서버 도출 — 클라 role 선택은 권한 근거 아님
    });
  });

  app.post("/sessions/logout", guard, csrf, async (c) => {
    const auth = c.get("auth");
    await revokeSession(cfg.db, auth.sessionId, now());
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    deleteCookie(c, CSRF_COOKIE, { path: "/" });
    return c.body(null, 204);
  });

  /* ── 보호자-자녀 연결 (R5 Phase 4) — runtime validation = zod (R5 P0) ── */
  const LinkBody = z.object({
    verificationSessionId: z.string().min(1).max(64),
    childName: z.string().min(1).max(50),
    // 시나리오 17.2: 형식만이 아니라 실제 달력 유효성 + 합리 범위(1900~오늘)
    childBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD").refine((v) => {
      const d = new Date(`${v}T00:00:00Z`);
      return !Number.isNaN(d.getTime()) &&
        d.toISOString().slice(0, 10) === v &&    // 2월 30일 등 달력 위반 거부
        v >= "1900-01-01" && d.getTime() <= Date.now(); // 미래 생년 거부
    }, "유효하지 않은 생년월일"),
    relationshipType: z.enum(["MOTHER", "FATHER", "GRANDPARENT", "LEGAL_GUARDIAN", "OTHER"]),
    consentPolicyVersion: z.string().min(1).max(20),
    consentAgreed: z.boolean(),
    academyInviteCode: z.string().min(4).max(64).optional(),
  }).strict(); // 예상하지 않은 필드 거부(R5 §6.2)

  app.post("/academies/:academyId/guardian-links", guard, csrf, academyAlive, async (c) => {
    const parsed = LinkBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: "INVALID_BODY", issues: parsed.error.issues.map((i) => i.path.join(".")) }, 422);
    }
    const academyId = c.req.param("academyId");
    if (!academyId) return c.json({ error: "INVALID_BODY" }, 422);
    const auth = c.get("auth");
    const result = await requestGuardianLink(cfg.db, {
      actorUserId: auth.userId,             // 서버 세션 도출 — 클라 입력 아님
      academyId,
      ...parsed.data,
    }, now()).catch((e: Error) => {
      // OTP 동시 소비 경쟁 패자·UNIQUE 위반(중복 링크/소비) = 409
      console.warn(`[linking] tx rejected: ${e.message}`);
      return null;
    });
    if (!result) return c.json({ error: "CONFLICT" }, 409);
    if (result.status === "VERIFIED") return c.json(result, 201);
    if (result.status === "CONSUMED") {
      return c.json({ error: "OTP_SESSION_ALREADY_USED" }, 409); // LCV1 6.5 — 수동심사 아님
    }
    return c.json(result, 202); // PENDING(수동 심사)·REJECTED — 본문에 status
  });

  /* ── 보호자 온보딩 실연결 (슬라이스 A · 2026-07-19) ──
     초대코드→학원 / 휴대폰 본인인증(세션) / 부모 아이 직접 등록.
     ⚠️ SMS/PASS 스텁: dev 가 인증코드 반환·000000=오류 — 실서비스는 SMS challenge 대조.
     docs/design/guardian-zem-benchmark.md §6. */
  app.get("/guardian/invites/:code", guard, async (c) => {
    const code = c.req.param("code");
    if (!code) return c.json({ error: "INVALID_BODY" }, 422);
    const r = await resolveInviteCode(cfg.db, code, now());
    if (!r) return c.json({ error: "NOT_FOUND" }, 404);
    return c.json(r, 200);
  });

  const OtpIssueBody = z.object({ phone: z.string().min(3).max(20) }).strict();
  app.post("/guardian/otp/issue", guard, csrf, async (c) => {
    /* #57 보안: 실 SMS 미연동 스텁은 비프로덕션 전용 — dev/login·mockpg 와 동일한
       fail-closed. 실 challenge(발송코드 저장·대조) 연동 전까지 프로덕션은 501. */
    if (!cfg.enableDevLogin || process.env.NODE_ENV === "production") {
      return c.json({ error: "SMS_VERIFICATION_NOT_CONFIGURED" }, 501);
    }
    const parsed = OtpIssueBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "INVALID_BODY" }, 422);
    return c.json({ sent: true, devCode: "123456" }, 200); // 스텁 코드(비프로덕션)
  });

  const OtpVerifyBody = z.object({
    phone: z.string().min(3).max(20),
    code: z.string().regex(/^\d{6}$/),
  }).strict();
  app.post("/guardian/otp/verify", guard, csrf, async (c) => {
    /* #57 보안(P1, 멀티에이전트 검증 발견): 이 스텁은 발송코드 대조 없이 임의 전화로
       "인증됨" 세션을 발급한다. 프로덕션에서 열려 있으면 선등록 연락처 매칭(requestGuardianLink)과
       결합해 남의 자녀를 VERIFIED 전권으로 클레임 가능 → 프로덕션 fail-closed(501).
       실 SMS challenge 연동 시 이 게이트를 실제 대조 로직으로 교체. */
    if (!cfg.enableDevLogin || process.env.NODE_ENV === "production") {
      return c.json({ error: "SMS_VERIFICATION_NOT_CONFIGURED" }, 501);
    }
    const parsed = OtpVerifyBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "INVALID_BODY" }, 422);
    if (parsed.data.code === "000000") return c.json({ error: "INVALID_CODE" }, 422); // 스텁 오류 시뮬
    const auth = c.get("auth");
    const r = await createVerifiedPhoneSession(cfg.db, { userId: auth.userId, phone: parsed.data.phone }, now());
    return c.json(r, 201);
  });

  const SelfRegisterBody = z.object({
    verificationSessionId: z.string().min(1).max(64),
    relationshipType: z.enum(["MOTHER", "FATHER", "GRANDPARENT", "LEGAL_GUARDIAN", "OTHER"]).default("OTHER"),
    consentPolicyVersion: z.string().min(1).max(20),
    consentAgreed: z.boolean(),
    children: z.array(z.object({
      name: z.string().min(1).max(50),
      birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD"),
      programId: z.string().max(64).optional(),
    })).min(1).max(10),
  }).strict();
  app.post("/academies/:academyId/guardian/self-register", guard, csrf, academyAlive, async (c) => {
    const parsed = SelfRegisterBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: "INVALID_BODY", issues: parsed.error.issues.map((i) => i.path.join(".")) }, 422);
    }
    const academyId = c.req.param("academyId");
    if (!academyId) return c.json({ error: "INVALID_BODY" }, 422);
    const auth = c.get("auth");
    const r = await selfRegisterGuardianChildren(cfg.db, {
      actorUserId: auth.userId, academyId, ...parsed.data,
    }, now()).catch((e: Error) => {
      console.warn(`[guardian self-register] tx rejected: ${e.message}`);
      return null;
    });
    if (!r) return c.json({ error: "CONFLICT" }, 409);
    if (r.kind === "INVALID") return c.json({ error: "UNPROCESSABLE", reason: r.reason }, 422);
    if (r.kind === "CONFLICT") return c.json({ error: "CONFLICT", reason: r.reason }, 409);
    return c.json({ children: r.children }, 201);
  });

  /* 13차 D P0-1: 링크 철회 — 실제 제품 기능(raw SQL 테스트 대체).
     Link 행만 잠근다(잠금 순서 계약: Refund → Link — revoke.ts 참조). */
  const RevokeBody = z.object({
    reasonCode: z.string().min(1).max(40),
    reasonText: z.string().max(500).optional(),
  }).strict();
  app.post("/academies/:academyId/guardian-links/:linkId/revocation", guard, csrf, academyCtx, async (c) => {
    const parsed = RevokeBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "INVALID_BODY" }, 422);
    const auth = c.get("auth");
    const m = c.get("membership");
    const r = await revokeGuardianLink(cfg.db, {
      actorUserId: auth.userId, actorRoles: m.roles,
      academyId: c.req.param("academyId")!, linkId: c.req.param("linkId")!,
      ...parsed.data,
    }, now());
    if (r.kind === "NOT_FOUND") return c.json({ error: "NOT_FOUND" }, 404);
    if (r.kind === "FORBIDDEN") return c.json({ error: "FORBIDDEN", reason: r.reason }, 403);
    if (r.kind === "ALREADY_REVOKED") return c.json({ linkId: r.linkId, status: "REVOKED" }, 200); // 멱등
    return c.json({ linkId: r.linkId, status: "REVOKED", pendingRefunds: r.pendingRefunds }, 200);
  });

  /* ── 기본선 1단계(#22): 반 · 수업 일정 (docs/15) ── */
  const SlotSchema = z.object({
    weekday: z.number().int().min(0).max(6),
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    participantId: z.string().min(1).max(64).optional(),
  }).strict();
  const CreateClassBody = z.object({
    name: z.string().min(1).max(60),
    scheduleType: z.enum(["FIXED_WEEKLY", "VARIABLE_BY_WEEKDAY", "PARTICIPANT_SPECIFIC"]),
    capacity: z.number().int().min(1).max(200),
    room: z.string().max(60).optional(),
    coachUserId: z.string().min(1).max(64).optional(),
    slots: z.array(SlotSchema).min(1).max(14),
  }).strict();
  app.post("/academies/:academyId/classes", guard, csrf, academyCtx, async (c) => {
    const parsed = CreateClassBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "INVALID_BODY" }, 422);
    const auth = c.get("auth");
    const m = c.get("membership");
    const r = await createClass(cfg.db, {
      actorUserId: auth.userId, actorRoles: m.roles,
      academyId: c.req.param("academyId")!, ...parsed.data,
    }, now());
    if (r.kind === "FORBIDDEN") return c.json({ error: "FORBIDDEN", reason: r.reason }, 403);
    if (r.kind === "INVALID") return c.json({ error: "UNPROCESSABLE", reason: r.reason }, 422);
    return c.json({ classId: r.classId }, 201);
  });
  app.get("/academies/:academyId/classes", guard, academyCtx, async (c) => {
    return c.json({ classes: await listClasses(cfg.db, c.req.param("academyId")!) });
  });
  const GenerateBody = z.object({
    rangeStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    rangeEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }).strict();
  app.post("/academies/:academyId/classes/:classId/sessions/generate", guard, csrf, academyCtx, async (c) => {
    const parsed = GenerateBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "INVALID_BODY" }, 422);
    const auth = c.get("auth");
    const m = c.get("membership");
    const r = await generateSessions(cfg.db, {
      actorUserId: auth.userId, actorRoles: m.roles,
      academyId: c.req.param("academyId")!, classId: c.req.param("classId")!,
      ...parsed.data,
    }, now());
    if (r.kind === "FORBIDDEN") return c.json({ error: "FORBIDDEN", reason: r.reason }, 403);
    if (r.kind === "INVALID") return c.json({ error: "UNPROCESSABLE", reason: r.reason }, 422);
    return c.json({ created: r.created, keptCanceled: r.keptCanceled }, 201);
  });
  app.get("/academies/:academyId/classes/:classId/roster", guard, academyCtx, async (c) => {
    const auth = c.get("auth"); const m = c.get("membership");
    const rows = await listClassRoster(cfg.db, {
      actorUserId: auth.userId, actorRoles: m.roles,
      academyId: c.req.param("academyId")!, classId: c.req.param("classId")!,
    });
    if (!rows) return c.json({ error: "FORBIDDEN" }, 403); // 담당 아님
    return c.json({ roster: rows });
  });
  app.get("/academies/:academyId/classes/:classId/sessions", guard, academyCtx, async (c) => {
    const rows = await listSessions(cfg.db, {
      academyId: c.req.param("academyId")!, classId: c.req.param("classId")!,
      from: c.req.query("from"), to: c.req.query("to"),
    });
    return c.json({ sessions: rows });
  });
  const CancelBody = z.object({ reason: z.string().min(1).max(200) }).strict();
  app.post("/academies/:academyId/sessions/:sessionId/cancellation", guard, csrf, academyCtx, async (c) => {
    const parsed = CancelBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "INVALID_BODY" }, 422);
    const auth = c.get("auth");
    const m = c.get("membership");
    const r = await cancelSession(cfg.db, {
      actorUserId: auth.userId, actorRoles: m.roles,
      academyId: c.req.param("academyId")!, sessionId: c.req.param("sessionId")!,
      reason: parsed.data.reason,
    }, now());
    if (r.kind === "NOT_FOUND") return c.json({ error: "NOT_FOUND" }, 404);
    if (r.kind === "FORBIDDEN") return c.json({ error: "FORBIDDEN", reason: r.reason }, 403);
    if (r.kind === "CONFLICT") return c.json({ error: "CONFLICT", reason: r.reason }, 409);
    return c.json({ sessionId: r.sessionId, status: "CANCELED" }, 200);
  });

  /* ── 프로그램 스튜디오 PS1 (docs/20·21·22) — 원장의 프로그램 저작 ── */
  const jsonBody = async (c: Context) => c.req.json().catch(() => null);
  const studioResult = (c: Context, r: { kind: string; reason?: string } | undefined, created?: Record<string, unknown>) => {
    if (!r) return c.json({ error: "INTERNAL" }, 500); // 도달 불가 방어(tx 타입 보수화)
    if (r.kind === "NOT_FOUND") return c.json({ error: "NOT_FOUND" }, 404);
    if (r.kind === "FORBIDDEN") return c.json({ error: "FORBIDDEN", reason: r.reason }, 403);
    if (r.kind === "INVALID") return c.json({ error: "UNPROCESSABLE", reason: r.reason }, 422);
    return c.json({ ...r, ...(created ?? {}) }, r.kind === "CREATED" ? 201 : 200);
  };
  const actor = (c: Context<GuardEnv>) => ({
    actorUserId: c.get("auth").userId, actorRoles: c.get("membership").roles,
    academyId: c.req.param("academyId")!,
  });

  const ActivityContentShape = {
    name: z.string().min(1).max(120),
    description: z.string().max(4000).optional(),
    instructions: z.string().max(8000).optional(),
    easyVariation: z.string().max(2000).optional(),
    standardVariation: z.string().max(2000).optional(),
    challengeVariation: z.string().max(2000).optional(),
    coachingPoints: z.string().max(4000).optional(),
    safetyNotes: z.string().max(4000).optional(),
    difficultyLabel: z.string().max(40).optional(),
    recommendedAgeLabel: z.string().max(40).optional(),
    recommendedMinutes: z.number().int().min(1).max(600).optional(),
    participantFormat: z.string().max(60).optional(),
    spaceRequirement: z.string().max(120).optional(),
  };

  const CreateProgramBody = z.object({
    name: z.string().min(1).max(80),
    description: z.string().max(2000).optional(),
    targetAgeLabel: z.string().max(40).optional(),
    modes: z.array(z.string()).min(1).max(5),
  }).strict();
  app.post("/academies/:academyId/programs", guard, csrf, academyCtx, async (c) => {
    const p = CreateProgramBody.safeParse(await jsonBody(c));
    if (!p.success) return c.json({ error: "INVALID_BODY" }, 422);
    return studioResult(c, await createProgram(cfg.db, { ...actor(c), ...p.data }, now()));
  });
  app.get("/academies/:academyId/programs", guard, academyCtx, async (c) => {
    return c.json({ programs: await listPrograms(cfg.db, c.req.param("academyId")!) });
  });
  const UpdateProgramBody = z.object({
    name: z.string().min(1).max(80).optional(),
    description: z.string().max(2000).optional(),
    targetAgeLabel: z.string().max(40).optional(),
    archived: z.boolean().optional(),
  }).strict();
  app.patch("/academies/:academyId/programs/:programId", guard, csrf, academyCtx, async (c) => {
    const p = UpdateProgramBody.safeParse(await jsonBody(c));
    if (!p.success) return c.json({ error: "INVALID_BODY" }, 422);
    return studioResult(c, await updateProgram(cfg.db, {
      ...actor(c), programId: c.req.param("programId")!, ...p.data,
    }, now()));
  });
  const CreateVersionBody = z.object({
    versionLabel: z.string().min(1).max(40),
    basedOnVersionId: z.string().max(64).optional(),
  }).strict();
  app.post("/academies/:academyId/programs/:programId/versions", guard, csrf, academyCtx, async (c) => {
    const p = CreateVersionBody.safeParse(await jsonBody(c));
    if (!p.success) return c.json({ error: "INVALID_BODY" }, 422);
    return studioResult(c, await createVersion(cfg.db, {
      ...actor(c), programId: c.req.param("programId")!, ...p.data,
    }, now()));
  });
  app.post("/academies/:academyId/versions/:versionId/publish", guard, csrf, academyCtx, async (c) => {
    return studioResult(c, await publishVersion(cfg.db, {
      ...actor(c), versionId: c.req.param("versionId")!,
    }, now()));
  });
  app.get("/academies/:academyId/versions/:versionId", guard, academyCtx, async (c) => {
    const detail = await getVersionDetail(cfg.db, c.req.param("academyId")!, c.req.param("versionId")!);
    if (!detail) return c.json({ error: "NOT_FOUND" }, 404);
    return c.json(detail);
  });

  const LevelBody = z.object({
    name: z.string().min(1).max(60),
    code: z.string().max(20).optional(),
    description: z.string().max(2000).optional(),
    targetAgeLabel: z.string().max(40).optional(),
    sortOrder: z.number().int().min(0).max(9999).optional(),
    color: z.string().max(9).optional(),
  }).strict();
  app.post("/academies/:academyId/versions/:versionId/levels", guard, csrf, academyCtx, async (c) => {
    const p = LevelBody.safeParse(await jsonBody(c));
    if (!p.success) return c.json({ error: "INVALID_BODY" }, 422);
    return studioResult(c, await createLevel(cfg.db, {
      ...actor(c), versionId: c.req.param("versionId")!, ...p.data,
    }, now()));
  });
  app.patch("/academies/:academyId/versions/:versionId/levels/:levelId", guard, csrf, academyCtx, async (c) => {
    const p = LevelBody.partial().strict().safeParse(await jsonBody(c));
    if (!p.success) return c.json({ error: "INVALID_BODY" }, 422);
    return studioResult(c, await updateLevel(cfg.db, {
      ...actor(c), versionId: c.req.param("versionId")!, levelId: c.req.param("levelId")!, ...p.data,
    }, now()));
  });
  app.delete("/academies/:academyId/versions/:versionId/levels/:levelId", guard, csrf, academyCtx, async (c) => {
    return studioResult(c, await deleteLevel(cfg.db, {
      ...actor(c), versionId: c.req.param("versionId")!, levelId: c.req.param("levelId")!,
    }, now()));
  });

  const GrowthDomainBody = z.object({
    name: z.string().min(1).max(60),
    parentId: z.string().max(64).optional(),
    code: z.string().max(30).optional(),
    description: z.string().max(2000).optional(),
    category: z.string().max(40).optional(),
    color: z.string().max(9).optional(),
    icon: z.string().max(8).optional(),
    reportVisible: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(9999).optional(),
  }).strict();
  app.post("/academies/:academyId/growth-domains", guard, csrf, academyCtx, async (c) => {
    const p = GrowthDomainBody.safeParse(await jsonBody(c));
    if (!p.success) return c.json({ error: "INVALID_BODY" }, 422);
    return studioResult(c, await createGrowthDomain(cfg.db, { ...actor(c), ...p.data }, now()));
  });
  app.get("/academies/:academyId/growth-domains", guard, academyCtx, async (c) => {
    return c.json({ domains: await listGrowthDomains(cfg.db, c.req.param("academyId")!) });
  });
  app.patch("/academies/:academyId/growth-domains/:domainId", guard, csrf, academyCtx, async (c) => {
    const p = GrowthDomainBody.partial().extend({ active: z.boolean().optional() }).strict()
      .safeParse(await jsonBody(c));
    if (!p.success) return c.json({ error: "INVALID_BODY" }, 422);
    const { parentId: _ignored, ...rest } = p.data; // 부모 이동은 후속(계층 사이클 검증 필요)
    return studioResult(c, await updateGrowthDomain(cfg.db, {
      ...actor(c), domainId: c.req.param("domainId")!, ...rest,
    }, now()));
  });

  const CreateActivityBody = z.object(ActivityContentShape).strict();
  app.post("/academies/:academyId/activities", guard, csrf, academyCtx, async (c) => {
    const p = CreateActivityBody.safeParse(await jsonBody(c));
    if (!p.success) return c.json({ error: "INVALID_BODY" }, 422);
    return studioResult(c, await createActivity(cfg.db, { ...actor(c), ...p.data }, now()));
  });
  app.get("/academies/:academyId/activities", guard, academyCtx, async (c) => {
    return c.json({ activities: await listActivities(cfg.db, c.req.param("academyId")!) });
  });
  app.patch("/academies/:academyId/activities/:activityId", guard, csrf, academyCtx, async (c) => {
    const p = z.object(ActivityContentShape).partial().strict().safeParse(await jsonBody(c));
    if (!p.success) return c.json({ error: "INVALID_BODY" }, 422);
    return studioResult(c, await updateActivity(cfg.db, {
      ...actor(c), activityId: c.req.param("activityId")!, ...p.data,
    }, now()));
  });
  app.post("/academies/:academyId/activities/:activityId/archive", guard, csrf, academyCtx, async (c) => {
    return studioResult(c, await archiveActivity(cfg.db, {
      ...actor(c), activityId: c.req.param("activityId")!,
    }, now()));
  });
  const GrowthTagsBody = z.object({
    tags: z.array(z.object({
      growthDomainId: z.string().min(1).max(64),
      role: z.enum(["PRIMARY", "SECONDARY"]),
    })).max(30),
  }).strict();
  app.put("/academies/:academyId/activities/:activityId/growth-tags", guard, csrf, academyCtx, async (c) => {
    const p = GrowthTagsBody.safeParse(await jsonBody(c));
    if (!p.success) return c.json({ error: "INVALID_BODY" }, 422);
    return studioResult(c, await setActivityGrowthTags(cfg.db, {
      ...actor(c), activityId: c.req.param("activityId")!, tags: p.data.tags,
    }, now()));
  });

  const SectionBody = z.object({
    sectionType: z.string().min(1).max(30),
    name: z.string().min(1).max(60),
    parentSectionId: z.string().max(64).optional(),
    sortOrder: z.number().int().min(0).max(9999).optional(),
  }).strict();
  app.post("/academies/:academyId/versions/:versionId/sections", guard, csrf, academyCtx, async (c) => {
    const p = SectionBody.safeParse(await jsonBody(c));
    if (!p.success) return c.json({ error: "INVALID_BODY" }, 422);
    return studioResult(c, await createSection(cfg.db, {
      ...actor(c), versionId: c.req.param("versionId")!, ...p.data,
    }, now()));
  });
  app.delete("/academies/:academyId/versions/:versionId/sections/:sectionId", guard, csrf, academyCtx, async (c) => {
    return studioResult(c, await deleteSection(cfg.db, {
      ...actor(c), versionId: c.req.param("versionId")!, sectionId: c.req.param("sectionId")!,
    }, now()));
  });
  const CurriculumSessionBody = z.object({
    sectionId: z.string().min(1).max(64),
    name: z.string().min(1).max(60),
    sequence: z.number().int().min(1).max(9999),
    theme: z.string().max(120).optional(),
    objective: z.string().max(2000).optional(),
  }).strict();
  app.post("/academies/:academyId/versions/:versionId/sessions", guard, csrf, academyCtx, async (c) => {
    const p = CurriculumSessionBody.safeParse(await jsonBody(c));
    if (!p.success) return c.json({ error: "INVALID_BODY" }, 422);
    return studioResult(c, await createCurriculumSession(cfg.db, {
      ...actor(c), versionId: c.req.param("versionId")!, ...p.data,
    }, now()));
  });
  app.delete("/academies/:academyId/versions/:versionId/sessions/:curriculumSessionId", guard, csrf, academyCtx, async (c) => {
    return studioResult(c, await deleteCurriculumSession(cfg.db, {
      ...actor(c), versionId: c.req.param("versionId")!,
      curriculumSessionId: c.req.param("curriculumSessionId")!,
    }, now()));
  });
  const SessionActivitiesBody = z.object({
    activities: z.array(z.object({
      activityId: z.string().min(1).max(64),
      required: z.boolean().optional(),
      recommendedMinutes: z.number().int().min(1).max(600).optional(),
    })).max(50), // 3개 고정 아님 — 상한만(운영 안전)
  }).strict();
  app.put("/academies/:academyId/curriculum-sessions/:curriculumSessionId/activities", guard, csrf, academyCtx, async (c) => {
    const p = SessionActivitiesBody.safeParse(await jsonBody(c));
    if (!p.success) return c.json({ error: "INVALID_BODY" }, 422);
    return studioResult(c, await setSessionActivities(cfg.db, {
      ...actor(c), curriculumSessionId: c.req.param("curriculumSessionId")!,
      activities: p.data.activities,
    }, now()));
  });

  /* ── 가져오기 스테이징 PS3 (docs/20 §4) — 미리보기 전 운영 데이터 무변경 ── */
  const MappingShape = z.object({
    name: z.number().int().min(0).optional(),
    description: z.number().int().min(0).optional(),
    primaryDomain: z.number().int().min(0).optional(),
    secondaryDomains: z.array(z.number().int().min(0)).max(40).optional(),
    difficultyLabel: z.number().int().min(0).optional(),
    recommendedAgeLabel: z.number().int().min(0).optional(),
  }).strict();
  const StageImportBody = z.object({
    fileName: z.string().min(1).max(200),
    csvText: z.string().min(1).max(2_000_000),
    mapping: MappingShape.optional(),
  }).strict();
  app.post("/academies/:academyId/imports", guard, csrf, academyCtx, async (c) => {
    const gate = await checkFeature(cfg.db, c.req.param("academyId")!, "PROGRAM_IMPORT", now()); // #49 PRO
    if (gate) return c.json(gate, 402);
    const p = StageImportBody.safeParse(await jsonBody(c));
    if (!p.success) return c.json({ error: "INVALID_BODY" }, 422);
    const r = await stageImport(cfg.db, { ...actor(c), ...p.data }, now());
    if (r.kind === "STAGED") return c.json(r, 201);
    return studioResult(c, r);
  });
  app.get("/academies/:academyId/imports", guard, academyCtx, async (c) => {
    return c.json({ batches: await listImportBatches(cfg.db, c.req.param("academyId")!) });
  });
  app.get("/academies/:academyId/imports/:batchId", guard, academyCtx, async (c) => {
    const b = await getImportBatch(cfg.db, c.req.param("academyId")!, c.req.param("batchId")!);
    if (!b) return c.json({ error: "NOT_FOUND" }, 404);
    return c.json(b);
  });
  const UpdateImportRowBody = z.object({
    normalized: z.object({
      name: z.string().max(200).optional(),
      description: z.string().max(4000).optional(),
      primaryDomainName: z.string().max(60).optional(),
      secondaryDomainNames: z.array(z.string().max(60)).max(40).optional(),
      difficultyLabel: z.string().max(40).optional(),
      recommendedAgeLabel: z.string().max(40).optional(),
    }).strict().optional(),
    resolution: z.enum(["CREATE", "SKIP"]).optional(),
  }).strict();
  app.patch("/academies/:academyId/imports/:batchId/rows/:rowId", guard, csrf, academyCtx, async (c) => {
    const p = UpdateImportRowBody.safeParse(await jsonBody(c));
    if (!p.success) return c.json({ error: "INVALID_BODY" }, 422);
    return studioResult(c, await updateImportRow(cfg.db, {
      ...actor(c), batchId: c.req.param("batchId")!, rowId: c.req.param("rowId")!, ...p.data,
    }, now()));
  });
  app.post("/academies/:academyId/imports/:batchId/commit", guard, csrf, academyCtx, async (c) => {
    const gate = await checkFeature(cfg.db, c.req.param("academyId")!, "PROGRAM_IMPORT", now()); // #49 PRO
    if (gate) return c.json(gate, 402);
    const r = await commitImport(cfg.db, { ...actor(c), batchId: c.req.param("batchId")! }, now());
    if (r.kind === "CONFLICT") return c.json({ error: "CONFLICT", reason: r.reason }, 409);
    return studioResult(c, r);
  });
  app.post("/academies/:academyId/imports/:batchId/revert", guard, csrf, academyCtx, async (c) => {
    return studioResult(c, await revertImport(cfg.db, { ...actor(c), batchId: c.req.param("batchId")! }, now()));
  });

  /* ── 프로그램 실행 PS4 — 반 적용·오늘 계획·결과 확정·경험지도 ── */
  const AssignProgramBody = z.object({
    programVersionId: z.string().min(1).max(64),
    programLevelId: z.string().max(64).optional(),
    effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }).strict();
  app.post("/academies/:academyId/classes/:classId/program-assignments", guard, csrf, academyCtx, async (c) => {
    const p = AssignProgramBody.safeParse(await jsonBody(c));
    if (!p.success) return c.json({ error: "INVALID_BODY" }, 422);
    const r = await assignProgramToClass(cfg.db, {
      ...actor(c), classId: c.req.param("classId")!, ...p.data,
    }, now());
    if (r.kind === "ASSIGNED") return c.json(r, 201);
    return studioResult(c, r);
  });
  const EndAssignmentBody = z.object({
    effectiveTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }).strict();
  app.post("/academies/:academyId/program-assignments/:assignmentId/end", guard, csrf, academyCtx, async (c) => {
    const p = EndAssignmentBody.safeParse(await jsonBody(c));
    if (!p.success) return c.json({ error: "INVALID_BODY" }, 422);
    return studioResult(c, await endProgramAssignment(cfg.db, {
      ...actor(c), assignmentId: c.req.param("assignmentId")!, ...p.data,
    }, now()));
  });
  app.get("/academies/:academyId/sessions/:sessionId/plan", guard, academyCtx, async (c) => {
    const r = await getSessionPlan(cfg.db, { ...actor(c), classSessionId: c.req.param("sessionId")! });
    if (r === null) return c.json({ error: "NOT_FOUND" }, 404);
    if (r === "FORBIDDEN") return c.json({ error: "FORBIDDEN" }, 403);
    return c.json(r);
  });
  const CreatePlanBody = z.object({
    assignmentId: z.string().min(1).max(64),
    curriculumSessionId: z.string().max(64).optional(),
  }).strict();
  app.post("/academies/:academyId/sessions/:sessionId/plan", guard, csrf, academyCtx, async (c) => {
    const p = CreatePlanBody.safeParse(await jsonBody(c));
    if (!p.success) return c.json({ error: "INVALID_BODY" }, 422);
    const r = await createSessionPlan(cfg.db, {
      ...actor(c), classSessionId: c.req.param("sessionId")!, ...p.data,
    }, now());
    if (r.kind === "PLANNED") return c.json(r, 201);
    return studioResult(c, r);
  });
  const ConfirmResultsBody = z.object({
    results: z.array(z.object({
      activityRevisionId: z.string().min(1).max(64),
      result: z.enum(["COMPLETED", "PARTIAL", "NOT_DONE", "REPLACED"]),
      replacementActivityRevisionId: z.string().max(64).optional(),
      coachNote: z.string().max(1000).optional(),
    })).min(1).max(50),
    participantOverrides: z.array(z.object({
      participantId: z.string().min(1).max(64),
      participation: z.enum(["FULL", "PARTIAL", "OBSERVED", "NOT_PARTICIPATED"]),
    })).max(200).optional(),
  }).strict();
  app.post("/academies/:academyId/session-plans/:planId/results", guard, csrf, academyCtx, async (c) => {
    const p = ConfirmResultsBody.safeParse(await jsonBody(c));
    if (!p.success) return c.json({ error: "INVALID_BODY" }, 422);
    return studioResult(c, await confirmSessionResults(cfg.db, {
      ...actor(c), sessionPlanId: c.req.param("planId")!, ...p.data,
    }, now()));
  });
  app.get("/academies/:academyId/participants/:participantId/experience-map", guard, academyCtx, async (c) => {
    const a = actor(c);
    const pid = c.req.param("participantId")!;
    // PS6 경계: 보호자는 검증된 자기 아이만(불허 = 404 은닉)
    const allowed = await canViewGrowth(cfg.db, {
      userId: a.actorUserId, roles: a.actorRoles, academyId: a.academyId, participantId: pid,
    });
    if (!allowed) return c.json({ error: "NOT_FOUND" }, 404);
    const r = await getExperienceMap(cfg.db, { ...a, participantId: pid });
    if (!r) return c.json({ error: "NOT_FOUND" }, 404);
    return c.json(r);
  });

  /* ── 기술·클리어·뱃지 PS5 — 자동 클리어 금지·뱃지 1회·정정 이력 ── */
  const CreateSkillBody = z.object({
    programLevelId: z.string().min(1).max(64),
    name: z.string().min(1).max(80),
    description: z.string().max(2000).optional(),
    sortOrder: z.number().int().min(0).max(9999).optional(),
    recommendedPracticeMin: z.number().int().min(0).max(999).optional(),
    recommendedPracticeMax: z.number().int().min(0).max(999).optional(),
    previousSkillId: z.string().max(64).optional(),
  }).strict();
  app.post("/academies/:academyId/versions/:versionId/skills", guard, csrf, academyCtx, async (c) => {
    const p = CreateSkillBody.safeParse(await jsonBody(c));
    if (!p.success) return c.json({ error: "INVALID_BODY" }, 422);
    return studioResult(c, await createSkill(cfg.db, {
      ...actor(c), versionId: c.req.param("versionId")!, ...p.data,
    }, now()));
  });
  app.get("/academies/:academyId/versions/:versionId/skills", guard, academyCtx, async (c) => {
    return c.json({ skills: await listSkills(cfg.db, c.req.param("academyId")!, c.req.param("versionId")!) });
  });
  const CriteriaBody = z.object({
    criteria: z.array(z.object({
      label: z.string().min(1).max(200),
      description: z.string().max(1000).optional(),
      required: z.boolean().optional(),
    })).max(20),
  }).strict();
  app.put("/academies/:academyId/skills/:skillId/criteria", guard, csrf, academyCtx, async (c) => {
    const p = CriteriaBody.safeParse(await jsonBody(c));
    if (!p.success) return c.json({ error: "INVALID_BODY" }, 422);
    return studioResult(c, await setSkillCriteria(cfg.db, {
      ...actor(c), skillId: c.req.param("skillId")!, ...p.data,
    }, now()));
  });
  const BadgeDefBody = z.object({
    skillId: z.string().max(64).optional(),
    name: z.string().min(1).max(80),
    description: z.string().max(1000).optional(),
  }).strict();
  app.post("/academies/:academyId/badge-definitions", guard, csrf, academyCtx, async (c) => {
    const gate = await checkFeature(cfg.db, c.req.param("academyId")!, "BADGE_SYSTEM", now()); // #49 PRO
    if (gate) return c.json(gate, 402);
    const p = BadgeDefBody.safeParse(await jsonBody(c));
    if (!p.success) return c.json({ error: "INVALID_BODY" }, 422);
    return studioResult(c, await createBadgeDefinition(cfg.db, { ...actor(c), ...p.data }, now()));
  });
  const PracticeBody = z.object({
    result: z.string().min(1).max(30),
    classSessionId: z.string().max(64).optional(),
    coachNote: z.string().max(1000).optional(),
  }).strict();
  app.post("/academies/:academyId/participants/:participantId/skills/:skillId/practice", guard, csrf, academyCtx, async (c) => {
    const p = PracticeBody.safeParse(await jsonBody(c));
    if (!p.success) return c.json({ error: "INVALID_BODY" }, 422);
    return studioResult(c, await recordSkillPractice(cfg.db, {
      ...actor(c), participantId: c.req.param("participantId")!,
      skillId: c.req.param("skillId")!, ...p.data,
    }, now()));
  });
  const ClearanceBody = z.object({
    checkedCriteriaIds: z.array(z.string().min(1).max(64)).max(20),
    classSessionId: z.string().max(64).optional(),
  }).strict();
  app.post("/academies/:academyId/participants/:participantId/skills/:skillId/clearance", guard, csrf, academyCtx, async (c) => {
    const p = ClearanceBody.safeParse(await jsonBody(c));
    if (!p.success) return c.json({ error: "INVALID_BODY" }, 422);
    return studioResult(c, await clearSkill(cfg.db, {
      ...actor(c), participantId: c.req.param("participantId")!,
      skillId: c.req.param("skillId")!, ...p.data,
    }, now()));
  });
  const CorrectionBody = z.object({ reason: z.string().min(1).max(500) }).strict();
  app.post("/academies/:academyId/badge-awards/:awardId/correction", guard, csrf, academyCtx, async (c) => {
    const p = CorrectionBody.safeParse(await jsonBody(c));
    if (!p.success) return c.json({ error: "INVALID_BODY" }, 422);
    return studioResult(c, await correctBadgeAward(cfg.db, {
      ...actor(c), awardId: c.req.param("awardId")!, ...p.data,
    }, now()));
  });
  app.get("/academies/:academyId/participants/:participantId/skill-book", guard, academyCtx, async (c) => {
    const a = actor(c);
    const pid = c.req.param("participantId")!;
    const allowed = await canViewGrowth(cfg.db, {
      userId: a.actorUserId, roles: a.actorRoles, academyId: a.academyId, participantId: pid,
    });
    if (!allowed) return c.json({ error: "NOT_FOUND" }, 404); // PS6 보호자 경계
    const r = await getSkillBook(cfg.db, a.academyId, pid);
    if (!r) return c.json({ error: "NOT_FOUND" }, 404);
    return c.json(r);
  });
  /* PS6 — 보호자 자녀 목록(VERIFIED·미철회 링크만) */
  app.get("/academies/:academyId/my-children", guard, academyCtx, async (c) => {
    const a = actor(c);
    return c.json({ children: await listMyChildren(cfg.db, { userId: a.actorUserId, academyId: a.academyId }) });
  });
  /* 코치 기술 화면 진입점 — 반의 ACTIVE 프로그램 적용 목록 */
  app.get("/academies/:academyId/classes/:classId/program-assignments", guard, academyCtx, async (c) => {
    return c.json({ assignments: await listClassAssignments(cfg.db, c.req.param("academyId")!, c.req.param("classId")!) });
  });
  /* PS7 준비 — 프로그램 복제(학원 내) */
  app.post("/academies/:academyId/programs/:programId/duplicate", guard, csrf, academyCtx, async (c) => {
    const gate = await checkFeature(cfg.db, c.req.param("academyId")!, "PROGRAM_DUPLICATE", now()); // #49 PRO
    if (gate) return c.json(gate, 402);
    return studioResult(c, await duplicateProgram(cfg.db, { ...actor(c), programId: c.req.param("programId")! }, now()));
  });
  app.get("/academies/:academyId/classes/:classId/skill-board", guard, academyCtx, async (c) => {
    const r = await getClassSkillBoard(cfg.db, { ...actor(c), classId: c.req.param("classId")! });
    if (r === "FORBIDDEN") return c.json({ error: "FORBIDDEN" }, 403);
    return c.json(r);
  });

  /* ── 기본선 3단계(#24): 학원 생성 · 직원 초대 ── */
  const CreateAcademyBody = z.object({
    name: z.string().min(1).max(60),
    ownerName: z.string().min(1).max(30),
    themeColor: z.string().max(9).optional(),
    themeInk: z.string().max(9).optional(),
    logoEmoji: z.string().max(8).optional(),
    billingCycleDefault: z.union([z.literal(1), z.literal(3)]).optional(),
  }).strict();
  app.post("/academies", guard, csrf, async (c) => {
    const parsed = CreateAcademyBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "INVALID_BODY" }, 422);
    const auth = c.get("auth");
    const r = await createAcademy(cfg.db, { actorUserId: auth.userId, ...parsed.data }, now());
    if (r.kind !== "OK") return c.json({ error: "UNPROCESSABLE", reason: r.reason }, 422);
    return c.json({ academyId: r.academyId }, 201);
  });
  const InviteBody = z.object({
    targetUserId: z.string().min(1).max(64),
    roles: z.array(z.enum(["COACH", "DESK", "OWNER"])).min(1).max(3),
  }).strict();
  app.post("/academies/:academyId/members/invites", guard, csrf, academyCtx, async (c) => {
    const parsed = InviteBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "INVALID_BODY" }, 422);
    const auth = c.get("auth"); const m = c.get("membership");
    const r = await inviteMember(cfg.db, {
      actorUserId: auth.userId, actorRoles: m.roles,
      academyId: c.req.param("academyId")!, ...parsed.data,
    }, now());
    if (r.kind === "FORBIDDEN") return c.json({ error: "FORBIDDEN", reason: r.reason }, 403);
    if (r.kind === "CONFLICT") return c.json({ error: "CONFLICT", reason: r.reason }, 409);
    if (r.kind === "INVALID") return c.json({ error: "UNPROCESSABLE", reason: r.reason }, 422);
    return c.json({ membershipId: r.membershipId, status: r.status }, 201);
  });
  // 수락은 본인 — academyCtx(ACTIVE 요구) 밖에서 guard 만
  app.post("/academies/:academyId/members/accept", guard, csrf, academyAlive, async (c) => {
    const auth = c.get("auth");
    const r = await acceptInvite(cfg.db, {
      actorUserId: auth.userId, academyId: c.req.param("academyId")!,
    }, now());
    if (r.kind !== "OK") {
      const code = r.kind === "CONFLICT" ? 409 : r.kind === "FORBIDDEN" ? 403 : 422;
      return c.json({ error: r.kind, reason: r.reason }, code);
    }
    return c.json({ membershipId: r.membershipId, status: r.status }, 200);
  });

  /* ── 기본선 3단계(#24): 청구 발행 · 오프라인 수납 ── */
  const PeriodBody = z.object({
    periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    cycleMonths: z.union([z.literal(1), z.literal(3)]),
  }).strict();
  app.post("/academies/:academyId/billing-periods", guard, csrf, academyCtx, async (c) => {
    const parsed = PeriodBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "INVALID_BODY" }, 422);
    const auth = c.get("auth"); const m = c.get("membership");
    const r = await createBillingPeriod(cfg.db, {
      actorUserId: auth.userId, actorRoles: m.roles,
      academyId: c.req.param("academyId")!, ...parsed.data,
    }, now());
    if (r.kind === "FORBIDDEN") return c.json({ error: "FORBIDDEN", reason: r.reason }, 403);
    if (r.kind !== "OK") return c.json({ error: "UNPROCESSABLE", reason: r.reason }, 422);
    return c.json({ billingPeriodId: r.billingPeriodId }, 201);
  });
  const InvoiceBody = z.object({
    participantId: z.string().min(1).max(64),
    billingPeriodId: z.string().min(1).max(64),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    lines: z.array(z.object({
      type: z.enum(["TUITION", "VEHICLE", "DISCOUNT", "OTHER"]),
      label: z.string().min(1).max(80),
      amount: z.number().int(),
    }).strict()).min(1).max(20),
  }).strict();
  app.post("/academies/:academyId/invoices", guard, csrf, academyCtx, async (c) => {
    const parsed = InvoiceBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "INVALID_BODY" }, 422);
    const auth = c.get("auth"); const m = c.get("membership");
    const r = await createInvoice(cfg.db, {
      actorUserId: auth.userId, actorRoles: m.roles,
      academyId: c.req.param("academyId")!, ...parsed.data,
    }, now());
    if (r.kind === "FORBIDDEN") return c.json({ error: "FORBIDDEN", reason: r.reason }, 403);
    if (r.kind === "CONFLICT") return c.json({ error: "CONFLICT", reason: r.reason }, 409);
    if (r.kind === "INVALID") return c.json({ error: "UNPROCESSABLE", reason: r.reason }, 422);
    return c.json({ invoiceId: r.invoiceId, total: r.total, status: "DRAFT" }, 201);
  });
  /* #41: 반 단위 일괄 초안·일괄 발행 — "명단 검토"→초안 전수 생성, "확정·발송"→ISSUED */
  const BulkDraftBody = z.object({
    billingPeriodId: z.string().min(1).max(64),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    baseFee: z.number().int(),
  }).strict();
  app.post("/academies/:academyId/classes/:classId/bulk-invoice-drafts", guard, csrf, academyCtx, async (c) => {
    const gate = await checkFeature(cfg.db, c.req.param("academyId")!, "BULK_BILLING", now()); // #49 BASIC+
    if (gate) return c.json(gate, 402);
    const parsed = BulkDraftBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "INVALID_BODY" }, 422);
    const auth = c.get("auth"); const m = c.get("membership");
    const r = await bulkCreateClassDrafts(cfg.db, {
      actorUserId: auth.userId, actorRoles: m.roles,
      academyId: c.req.param("academyId")!, classId: c.req.param("classId")!, ...parsed.data,
    }, now());
    if (r.kind === "FORBIDDEN") return c.json({ error: "FORBIDDEN", reason: r.reason }, 403);
    if (r.kind !== "OK") return c.json({ error: "UNPROCESSABLE", reason: r.reason }, 422);
    return c.json({ created: r.created, skipped: r.skipped, invoiceIds: r.invoiceIds }, 201);
  });
  const BulkIssueBody = z.object({ billingPeriodId: z.string().min(1).max(64) }).strict();
  app.post("/academies/:academyId/classes/:classId/bulk-invoice-issue", guard, csrf, academyCtx, async (c) => {
    const gate = await checkFeature(cfg.db, c.req.param("academyId")!, "BULK_BILLING", now()); // #49 BASIC+
    if (gate) return c.json(gate, 402);
    const parsed = BulkIssueBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "INVALID_BODY" }, 422);
    const auth = c.get("auth"); const m = c.get("membership");
    const r = await bulkIssueClassDrafts(cfg.db, {
      actorUserId: auth.userId, actorRoles: m.roles,
      academyId: c.req.param("academyId")!, classId: c.req.param("classId")!,
      billingPeriodId: parsed.data.billingPeriodId,
    }, now());
    if (r.kind === "FORBIDDEN") return c.json({ error: "FORBIDDEN", reason: r.reason }, 403);
    if (r.kind !== "OK") return c.json({ error: "UNPROCESSABLE", reason: r.reason }, 422);
    return c.json({ issued: r.issued }, 200);
  });
  app.post("/academies/:academyId/invoices/:invoiceId/issue", guard, csrf, academyCtx, async (c) => {
    const auth = c.get("auth"); const m = c.get("membership");
    const r = await issueInvoice(cfg.db, {
      actorUserId: auth.userId, actorRoles: m.roles,
      academyId: c.req.param("academyId")!, invoiceId: c.req.param("invoiceId")!,
    }, now());
    if (r.kind === "FORBIDDEN") return c.json({ error: "FORBIDDEN", reason: r.reason }, 403);
    if (r.kind === "CONFLICT") return c.json({ error: "CONFLICT", reason: r.reason }, 409);
    if (r.kind === "INVALID") return c.json({ error: "UNPROCESSABLE", reason: r.reason }, 422);
    return c.json({ invoiceId: r.invoiceId, status: "ISSUED" }, 200);
  });
  const VoidBody = z.object({ reason: z.string().min(1).max(200) }).strict();
  app.post("/academies/:academyId/invoices/:invoiceId/void", guard, csrf, academyCtx, async (c) => {
    const parsed = VoidBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "INVALID_BODY" }, 422);
    const auth = c.get("auth"); const m = c.get("membership");
    const r = await voidInvoice(cfg.db, {
      actorUserId: auth.userId, actorRoles: m.roles,
      academyId: c.req.param("academyId")!, invoiceId: c.req.param("invoiceId")!,
      reason: parsed.data.reason,
    }, now());
    if (r.kind === "FORBIDDEN") return c.json({ error: "FORBIDDEN", reason: r.reason }, 403);
    if (r.kind === "CONFLICT") return c.json({ error: "CONFLICT", reason: r.reason }, 409);
    if (r.kind === "INVALID") return c.json({ error: "UNPROCESSABLE", reason: r.reason }, 422);
    return c.json({ invoiceId: r.invoiceId, status: "VOID" }, 200);
  });
  const OfflineBody = z.object({
    invoiceId: z.string().min(1).max(64),
    channel: z.enum(["BANK_TRANSFER", "CASH", "CARD_OFFLINE"]),
    amount: z.number().int().positive().optional(),
    evidenceNote: z.string().min(1).max(300), // 증빙 필수 — 화면 토글 수납 금지
  }).strict();
  app.post("/academies/:academyId/payments/offline", guard, csrf, academyCtx, async (c) => {
    const idempotencyKey = c.req.header("idempotency-key");
    if (!idempotencyKey || idempotencyKey.length > 128) {
      return c.json({ error: "IDEMPOTENCY_KEY_REQUIRED" }, 422);
    }
    const parsed = OfflineBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "INVALID_BODY" }, 422);
    const auth = c.get("auth"); const m = c.get("membership");
    const r = await recordOfflinePayment(cfg.db, {
      actorUserId: auth.userId, actorRoles: m.roles,
      academyId: c.req.param("academyId")!, ...parsed.data, idempotencyKey,
    }, now());
    if (r.kind === "FORBIDDEN") return c.json({ error: "FORBIDDEN", reason: r.reason }, 403);
    if (r.kind === "CONFLICT") return c.json({ error: "CONFLICT", reason: r.reason }, 409);
    if (r.kind === "INVALID") return c.json({ error: "UNPROCESSABLE", reason: r.reason }, 422);
    return c.json({ paymentId: r.paymentId, invoiceId: r.invoiceId, amount: r.total }, 201);
  });

  /* ── 기본선 3단계(#24): 공지 ── */
  /* AudienceFilter 2단계 — 대상 산정 공용 축(축 내 OR·축 간 AND, audience/service.ts 정본) */
  const AudienceFilterBody = z.object({
    classIds: z.array(z.string().min(1).max(64)).max(50).optional(),
    coachUserIds: z.array(z.string().min(1).max(64)).max(50).optional(),
    weekdays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
    statuses: z.array(z.enum(["TRIAL", "ENROLLED", "ON_BREAK", "WITHDRAWN"])).max(4).optional(),
    unpaidOnly: z.boolean().optional(),
  }).strict();
  const NoticePubBody = z.object({
    title: z.string().min(1).max(80),
    body: z.string().min(1).max(4000),
    audience: z.string().min(1).max(200),
    classId: z.string().min(1).max(64).optional(), // AudienceFilter 1단계 — 반 필터
    audienceFilter: AudienceFilterBody.optional(), // 2단계 — 공용 리졸버로 수신자 산정
  }).strict();
  app.post("/academies/:academyId/notices", guard, csrf, academyCtx, async (c) => {
    const parsed = NoticePubBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "INVALID_BODY" }, 422);
    const auth = c.get("auth"); const m = c.get("membership");
    const r = await publishNotice(cfg.db, {
      actorUserId: auth.userId, actorRoles: m.roles,
      academyId: c.req.param("academyId")!, ...parsed.data,
    }, now());
    if (r.kind === "FORBIDDEN") return c.json({ error: "FORBIDDEN", reason: r.reason }, 403);
    return c.json({ noticeId: r.noticeId, recipients: r.recipients }, 201);
  });
  app.get("/academies/:academyId/notices", guard, academyCtx, async (c) => {
    const auth = c.get("auth"); const m = c.get("membership");
    return c.json({ notices: await listNotices(cfg.db, {
      actorUserId: auth.userId, actorRoles: m.roles, academyId: c.req.param("academyId")!,
    }) });
  });
  app.post("/academies/:academyId/notices/:noticeId/read", guard, csrf, academyCtx, async (c) => {
    const auth = c.get("auth");
    await markNoticeRead(cfg.db, {
      actorUserId: auth.userId, academyId: c.req.param("academyId")!,
      noticeId: c.req.param("noticeId")!,
    }, now());
    return c.json({ ok: true }, 200);
  });
  /* #45: 공지 재알림 — 미열람 receipt 보유자에게만 */
  app.post("/academies/:academyId/notices/:noticeId/remind", guard, csrf, academyCtx, async (c) => {
    const auth = c.get("auth"); const m = c.get("membership");
    const r = await remindNotice(cfg.db, {
      actorUserId: auth.userId, actorRoles: m.roles,
      academyId: c.req.param("academyId")!, noticeId: c.req.param("noticeId")!,
    }, now());
    if (r.kind === "FORBIDDEN") return c.json({ error: "FORBIDDEN", reason: r.reason }, 403);
    if (r.kind === "INVALID") return c.json({ error: "UNPROCESSABLE", reason: r.reason }, 422);
    return c.json({ reminded: r.reminded }, 200);
  });
  /* #45: 미납 리마인드 — open 청구 원생의 VERIFIED·canPay 보호자 */
  app.post("/academies/:academyId/billing/remind", guard, csrf, academyCtx, async (c) => {
    const auth = c.get("auth"); const m = c.get("membership");
    const r = await remindUnpaid(cfg.db, {
      actorUserId: auth.userId, actorRoles: m.roles, academyId: c.req.param("academyId")!,
    }, now());
    if (r.kind === "FORBIDDEN") return c.json({ error: "FORBIDDEN", reason: r.reason }, 403);
    return c.json({ invoices: r.invoices, guardians: r.guardians, cooldown: r.cooldown ?? false }, 200);
  });

  /* ── 기본선 2단계(#23): 학생 수명주기 · 반 배정 · 출결 ── */
  const CreateParticipantBody = z.object({
    name: z.string().min(1).max(50),
    birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    ageLabel: z.string().min(1).max(10),
    status: z.enum(["TRIAL", "ENROLLED"]).optional(),
    guardianPhone: z.string().min(9).max(20).optional(),
  }).strict();
  app.post("/academies/:academyId/participants", guard, csrf, academyCtx, async (c) => {
    const parsed = CreateParticipantBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "INVALID_BODY" }, 422);
    const auth = c.get("auth"); const m = c.get("membership");
    const r = await createParticipant(cfg.db, {
      actorUserId: auth.userId, actorRoles: m.roles,
      academyId: c.req.param("academyId")!, ...parsed.data,
    }, now());
    if (r.kind === "FORBIDDEN") return c.json({ error: "FORBIDDEN", reason: r.reason }, 403);
    if (r.kind === "UPGRADE") { // #49 FREE 원생 상한
      return c.json({
        error: "PLAN_UPGRADE_REQUIRED", reason: r.reason,
        currentPlan: r.currentPlan, requiredPlan: r.requiredPlan,
      }, 402);
    }
    if (r.kind !== "OK") return c.json({ error: "UNPROCESSABLE", reason: r.reason }, 422);
    return c.json({ participantId: r.participantId }, 201);
  });
  const StatusBody = z.object({
    status: z.enum(["TRIAL", "ENROLLED", "ON_BREAK", "WITHDRAWN"]),
    reason: z.string().max(200).optional(),
  }).strict();
  app.post("/academies/:academyId/participants/:participantId/status", guard, csrf, academyCtx, async (c) => {
    const parsed = StatusBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "INVALID_BODY" }, 422);
    const auth = c.get("auth"); const m = c.get("membership");
    const r = await changeParticipantStatus(cfg.db, {
      actorUserId: auth.userId, actorRoles: m.roles,
      academyId: c.req.param("academyId")!, participantId: c.req.param("participantId")!,
      ...parsed.data,
    }, now());
    if (r.kind === "FORBIDDEN") return c.json({ error: "FORBIDDEN", reason: r.reason }, 403);
    if (r.kind === "CONFLICT") return c.json({ error: "CONFLICT", reason: r.reason }, 409);
    if (r.kind === "INVALID") return c.json({ error: "UNPROCESSABLE", reason: r.reason }, 422);
    return c.json({ participantId: r.participantId, status: parsed.data.status }, 200);
  });
  const EnrollBody = z.object({ classId: z.string().min(1).max(64) }).strict();
  app.post("/academies/:academyId/participants/:participantId/enrollments", guard, csrf, academyCtx, async (c) => {
    const parsed = EnrollBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "INVALID_BODY" }, 422);
    const auth = c.get("auth"); const m = c.get("membership");
    const r = await enrollParticipant(cfg.db, {
      actorUserId: auth.userId, actorRoles: m.roles,
      academyId: c.req.param("academyId")!, participantId: c.req.param("participantId")!,
      classId: parsed.data.classId,
    }, now());
    if (r.kind === "FORBIDDEN") return c.json({ error: "FORBIDDEN", reason: r.reason }, 403);
    if (r.kind === "CONFLICT") return c.json({ error: "CONFLICT", reason: r.reason }, 409);
    if (r.kind === "INVALID") return c.json({ error: "UNPROCESSABLE", reason: r.reason }, 422);
    return c.json({ enrollmentId: r.enrollmentId }, 201);
  });
  app.post("/academies/:academyId/enrollments/:enrollmentId/end", guard, csrf, academyCtx, async (c) => {
    const auth = c.get("auth"); const m = c.get("membership");
    const r = await endEnrollment(cfg.db, {
      actorUserId: auth.userId, actorRoles: m.roles,
      academyId: c.req.param("academyId")!, enrollmentId: c.req.param("enrollmentId")!,
    }, now());
    if (r.kind === "FORBIDDEN") return c.json({ error: "FORBIDDEN", reason: r.reason }, 403);
    if (r.kind !== "OK") return c.json({ error: "UNPROCESSABLE", reason: (r as { reason: string }).reason }, 422);
    return c.json({ enrollmentId: r.enrollmentId, status: "ENDED" }, 200);
  });

  const AttendanceBody = z.object({
    records: z.array(z.object({
      participantId: z.string().min(1).max(64),
      status: z.enum(["PRESENT", "ABSENT", "LATE", "EARLY_LEAVE", "EXCUSED"]),
      reason: z.string().max(200).optional(),
    }).strict()).min(1).max(50),
  }).strict();
  app.post("/academies/:academyId/sessions/:sessionId/attendance", guard, csrf, academyCtx, async (c) => {
    const parsed = AttendanceBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "INVALID_BODY" }, 422);
    const auth = c.get("auth"); const m = c.get("membership");
    const r = await recordAttendance(cfg.db, {
      actorUserId: auth.userId, actorRoles: m.roles,
      academyId: c.req.param("academyId")!, sessionId: c.req.param("sessionId")!,
      records: parsed.data.records,
    }, now());
    if (r.kind === "FORBIDDEN") return c.json({ error: "FORBIDDEN", reason: r.reason }, 403);
    if (r.kind === "INVALID") return c.json({ error: "UNPROCESSABLE", reason: r.reason }, 422);
    return c.json({ recorded: r.recorded, updated: r.updated }, 200);
  });
  app.get("/academies/:academyId/sessions/:sessionId/attendance", guard, academyCtx, async (c) => {
    const auth = c.get("auth"); const m = c.get("membership");
    const rows = await listSessionAttendance(cfg.db, {
      actorUserId: auth.userId, actorRoles: m.roles,
      academyId: c.req.param("academyId")!, sessionId: c.req.param("sessionId")!,
    });
    if (!rows) return c.json({ error: "FORBIDDEN" }, 403);
    return c.json({ records: rows });
  });
  app.post("/academies/:academyId/sessions/:sessionId/complete", guard, csrf, academyCtx, async (c) => {
    const auth = c.get("auth"); const m = c.get("membership");
    const r = await completeSession(cfg.db, {
      actorUserId: auth.userId, actorRoles: m.roles,
      academyId: c.req.param("academyId")!, sessionId: c.req.param("sessionId")!,
    }, now());
    if (r.kind === "FORBIDDEN") return c.json({ error: "FORBIDDEN", reason: r.reason }, 403);
    if (r.kind === "CONFLICT") return c.json({ error: "CONFLICT", reason: r.reason, missing: r.missing }, 409);
    if (r.kind === "INVALID") return c.json({ error: "UNPROCESSABLE", reason: r.reason }, 422);
    return c.json({ sessionId: r.sessionId, status: "COMPLETED" }, 200);
  });
  const NoticeBody = z.object({
    participantId: z.string().min(1).max(64),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    type: z.enum(["ABSENCE", "LATE", "EARLY_LEAVE"]),
    reason: z.string().min(1).max(200),
  }).strict();
  app.post("/academies/:academyId/attendance-notices", guard, csrf, academyCtx, async (c) => {
    const parsed = NoticeBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "INVALID_BODY" }, 422);
    const auth = c.get("auth");
    const { type: noticeType, ...rest } = parsed.data;
    const r = await createAttendanceNotice(cfg.db, {
      actorUserId: auth.userId, academyId: c.req.param("academyId")!,
      noticeType, ...rest,
    }, now());
    if (r.kind === "FORBIDDEN") return c.json({ error: "FORBIDDEN", reason: r.reason }, 403);
    return c.json({ noticeId: r.noticeId }, 201);
  });
  /* #45: 통보 목록(staff) + 원장 확인 — "확인했어요"만, 보강 자동 생성 아님 */
  app.get("/academies/:academyId/attendance-notices", guard, academyCtx, async (c) => {
    const m = c.get("membership");
    const rows = await listAttendanceNotices(cfg.db, {
      actorRoles: m.roles, academyId: c.req.param("academyId")!,
    });
    if (!rows) return c.json({ error: "FORBIDDEN" }, 403);
    return c.json({ notices: rows });
  });
  app.post("/academies/:academyId/attendance-notices/:noticeId/ack", guard, csrf, academyCtx, async (c) => {
    const auth = c.get("auth"); const m = c.get("membership");
    const r = await acknowledgeAttendanceNotice(cfg.db, {
      actorUserId: auth.userId, actorRoles: m.roles,
      academyId: c.req.param("academyId")!, noticeId: c.req.param("noticeId")!,
    }, now());
    if (r.kind === "FORBIDDEN") return c.json({ error: "FORBIDDEN", reason: r.reason }, 403);
    if (r.kind === "INVALID") return c.json({ error: "UNPROCESSABLE", reason: r.reason }, 422);
    return c.json({ noticeId: r.noticeId, alreadyAcknowledged: r.alreadyAcknowledged }, 200);
  });

  /* ── 결제 준비 (R5 Phase 5) — membership guard 첫 실전 적용 ── */
  const PrepareBody = z.object({
    invoiceIds: z.array(z.string().min(1).max(64)).min(1).max(10),
  }).strict();

  app.post("/academies/:academyId/payments/prepare", guard, csrf, guardianCtx, async (c) => {
    const idempotencyKey = c.req.header("idempotency-key");
    if (!idempotencyKey || idempotencyKey.length > 128) {
      return c.json({ error: "IDEMPOTENCY_KEY_REQUIRED" }, 422);
    }
    const raw = await c.req.json().catch(() => null);
    const parsed = PrepareBody.safeParse(raw);
    if (!parsed.success) return c.json({ error: "INVALID_BODY" }, 422);
    const auth = c.get("auth");
    // body 정규화(키 정렬) hash — 같은 key + 다른 body = 409 (도메인 멱등 계약)
    const requestHash = sha256Hex(JSON.stringify({ invoiceIds: [...parsed.data.invoiceIds].sort() }));
    const r = await preparePayment(cfg.db, {
      actorUserId: auth.userId,
      academyId: c.req.param("academyId")!,
      invoiceIds: parsed.data.invoiceIds,
      idempotencyKey, requestHash,
    }, now());
    switch (r.kind) {
      case "CREATED": return c.json({ paymentId: r.paymentId, amount: r.amount, status: r.status }, 201);
      case "REPLAY": return c.json({ paymentId: r.paymentId, amount: r.amount, status: r.status }, 200);
      case "IN_PROGRESS": return c.json({ error: "IN_PROGRESS" }, 409);
      case "CONFLICT": return c.json({ error: "IDEMPOTENCY_KEY_REUSED" }, 409);
      case "ACTIVE_ATTEMPT_EXISTS": // R7 P0-3 — 진행 중 결제가 있으면 새 attempt 금지
        return c.json({ error: "ACTIVE_PAYMENT_ATTEMPT_EXISTS", paymentId: r.paymentId }, 409);
      case "DENIED": return c.json({ error: "UNPROCESSABLE", reason: r.reason }, 422);
    }
  });

  /* ── 휴무 이벤트(#38) — "숫자 직접 수정 금지": event 등록 → 서버가 세션·회차 재계산 ── */
  const ClosureBody = z.object({
    scope: z.enum(["ACADEMY", "CLASS"]),
    classId: z.string().min(1).max(64).optional(),
    dateStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    dateEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    closureType: z.string().min(1).max(40),
    reason: z.string().min(1).max(300),
    deductSessions: z.boolean(),
  }).strict();
  app.post("/academies/:academyId/closures", guard, csrf, academyCtx, async (c) => {
    const parsed = ClosureBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "INVALID_BODY" }, 422);
    const auth = c.get("auth"); const m = c.get("membership");
    const r = await createClosure(cfg.db, {
      actorUserId: auth.userId, actorRoles: m.roles,
      academyId: c.req.param("academyId")!, ...parsed.data,
    }, now());
    if (r.kind === "FORBIDDEN") return c.json({ error: "FORBIDDEN", reason: r.reason }, 403);
    if (r.kind === "INVALID") return c.json({ error: "UNPROCESSABLE", reason: r.reason }, 422);
    return c.json({ closureId: r.closureId, canceledSessions: r.canceledSessions }, 201);
  });
  app.get("/academies/:academyId/closures", guard, academyCtx, async (c) =>
    c.json({ closures: await listClosures(cfg.db, c.req.param("academyId")!) }));
  app.post("/academies/:academyId/closures/:closureId/revocation", guard, csrf, academyCtx, async (c) => {
    const auth = c.get("auth"); const m = c.get("membership");
    const r = await revokeClosure(cfg.db, {
      actorUserId: auth.userId, actorRoles: m.roles,
      academyId: c.req.param("academyId")!, closureId: c.req.param("closureId")!,
    }, now());
    if (r.kind === "FORBIDDEN") return c.json({ error: "FORBIDDEN", reason: r.reason }, 403);
    if (r.kind === "INVALID") return c.json({ error: "NOT_FOUND" }, 404);
    return c.json({ closureId: r.closureId, restoredSessions: r.canceledSessions }, 200);
  });
  app.get("/academies/:academyId/classes/:classId/session-stats", guard, academyCtx, async (c) => {
    const from = c.req.query("from"); const to = c.req.query("to");
    if (!from || !to) return c.json({ error: "INVALID_BODY", reason: "from·to 필수" }, 422);
    return c.json(await getSessionStats(cfg.db, {
      academyId: c.req.param("academyId")!, classId: c.req.param("classId")!,
      from, to, asOf: now().slice(0, 10),
    }));
  });
  const QuoteBody = z.object({
    periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    joinDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    baseFee: z.number().int().positive(),
  }).strict();
  app.post("/academies/:academyId/classes/:classId/proration-quote", guard, csrf, academyCtx, async (c) => {
    const m = c.get("membership");
    if (!m.roles.includes("OWNER") && !m.roles.includes("DESK")) {
      return c.json({ error: "FORBIDDEN" }, 403);
    }
    const parsed = QuoteBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "INVALID_BODY" }, 422);
    const r = await prorationQuote(cfg.db, {
      academyId: c.req.param("academyId")!, classId: c.req.param("classId")!, ...parsed.data,
    });
    if (r.kind === "INVALID") return c.json({ error: "UNPROCESSABLE", reason: r.reason }, 422);
    return c.json(r);
  });

  /* 인앱 알림(파일럿 P0) — outbox 소비 결과, 내 것만 */
  app.get("/academies/:academyId/notifications", guard, academyCtx, async (c) => {
    const auth = c.get("auth");
    return c.json({
      notifications: await listMyNotifications(cfg.db, {
        actorUserId: auth.userId, academyId: c.req.param("academyId")!,
      }),
    });
  });
  app.post("/academies/:academyId/notifications/:notificationId/read", guard, csrf, academyCtx, async (c) => {
    const auth = c.get("auth");
    await markNotificationRead(cfg.db, {
      actorUserId: auth.userId, academyId: c.req.param("academyId")!,
      notificationId: c.req.param("notificationId")!,
    }, now());
    return c.json({ ok: true });
  });

  /* ── 사진 파이프라인 사전 코어(#19) — 동의는 초안 계약(GET/PUT+If-Match·revocations) 구현 ── */
  const ConsentBody = z.object({
    grants: z.array(z.object({
      purpose: z.enum(["INDIVIDUAL_DELIVERY", "CLASS_SHARE", "INTERNAL_RECORD", "ACADEMY_PROMOTION", "EXTERNAL_AD", "SNS_POST"]),
      audience: z.enum(["GUARDIAN_ONLY", "CLASS_MEMBERS", "ACADEMY_INTERNAL", "PUBLIC"]),
    })).max(24),
    policyVersion: z.string().min(1).max(20),
    channel: z.string().min(1).max(40),
  }).strict();

  app.get("/academies/:academyId/participants/:participantId/photo-consent", guard, academyCtx, async (c) => {
    const auth = c.get("auth"); const m = c.get("membership");
    const r = await getPhotoConsent(cfg.db, {
      actorUserId: auth.userId, actorRoles: m.roles,
      academyId: c.req.param("academyId")!, participantId: c.req.param("participantId")!,
    });
    if (!r) return c.json({ error: "FORBIDDEN" }, 403);
    return c.json(r);
  });

  app.put("/academies/:academyId/participants/:participantId/photo-consent", guard, csrf, academyCtx, async (c) => {
    const parsed = ConsentBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "INVALID_BODY" }, 422);
    const ifMatch = c.req.header("if-match");
    const auth = c.get("auth");
    const r = await upsertPhotoConsent(cfg.db, {
      actorUserId: auth.userId,
      academyId: c.req.param("academyId")!, participantId: c.req.param("participantId")!,
      ...parsed.data,
      ifMatchVersion: ifMatch !== undefined ? Number(ifMatch) : undefined,
    }, now());
    if (r.kind === "FORBIDDEN") return c.json({ error: "FORBIDDEN", reason: r.reason }, 403);
    if (r.kind === "INVALID") return c.json({ error: "INVALID_BODY", reason: r.reason }, 422);
    if (r.kind === "VERSION_CONFLICT") return c.json({ error: "VERSION_CONFLICT", currentVersion: r.currentVersion }, 409);
    return c.json({ consentId: r.consentId, version: r.version }, 200);
  });

  app.post("/academies/:academyId/participants/:participantId/photo-consent/revocations", guard, csrf, academyCtx, async (c) => {
    const auth = c.get("auth");
    const r = await revokePhotoConsent(cfg.db, {
      actorUserId: auth.userId,
      academyId: c.req.param("academyId")!, participantId: c.req.param("participantId")!,
    }, now());
    if (r.kind !== "OK") {
      if (r.kind === "FORBIDDEN") return c.json({ error: "FORBIDDEN", reason: r.reason }, 403);
      return c.json({ error: "NOT_FOUND" }, 404);
    }
    return c.json({ consentId: r.consentId }, 201);
  });

  /* 사진 자산 — 어댑터 미주입 = 501(사업자 결정 대기, 침묵 저장 금지) */
  const requireStorage = (c: Context<GuardEnv>) =>
    cfg.storage ? null : c.json({ error: "STORAGE_NOT_CONFIGURED" }, 501);

  const PhotoUploadBody = z.object({
    sessionId: z.string().min(1).max(64).optional(),
    contentType: z.string().min(1).max(100),
    byteSize: z.number().int().positive(),
  }).strict();
  app.post("/academies/:academyId/photos", guard, csrf, academyCtx, async (c) => {
    const blocked = requireStorage(c); if (blocked) return blocked;
    const parsed = PhotoUploadBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "INVALID_BODY" }, 422);
    const auth = c.get("auth"); const m = c.get("membership");
    const r = await createPhotoUpload(cfg.db, cfg.storage!, {
      actorUserId: auth.userId, actorRoles: m.roles,
      academyId: c.req.param("academyId")!, ...parsed.data,
    }, now());
    if (r.kind === "FORBIDDEN") return c.json({ error: "FORBIDDEN", reason: r.reason }, 403);
    if (r.kind === "INVALID") return c.json({ error: "UNPROCESSABLE", reason: r.reason }, 422);
    return c.json({ photoId: r.photoId, upload: r.upload }, 201);
  });

  const PhotoFinalizeBody = z.object({
    participantIds: z.array(z.string().min(1).max(64)).max(50),
    purpose: z.enum(["INDIVIDUAL_DELIVERY", "CLASS_SHARE", "INTERNAL_RECORD", "ACADEMY_PROMOTION", "EXTERNAL_AD", "SNS_POST"]),
    audience: z.enum(["GUARDIAN_ONLY", "CLASS_MEMBERS", "ACADEMY_INTERNAL", "PUBLIC"]),
  }).strict();
  app.post("/academies/:academyId/photos/:photoId/finalize", guard, csrf, academyCtx, async (c) => {
    const blocked = requireStorage(c); if (blocked) return blocked;
    const parsed = PhotoFinalizeBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "INVALID_BODY" }, 422);
    const auth = c.get("auth"); const m = c.get("membership");
    const r = await finalizePhoto(cfg.db, cfg.storage!, {
      actorUserId: auth.userId, actorRoles: m.roles,
      academyId: c.req.param("academyId")!, photoId: c.req.param("photoId")!, ...parsed.data,
    }, now());
    if (r.kind === "FORBIDDEN") return c.json({ error: "FORBIDDEN", reason: r.reason }, 403);
    if (r.kind === "INVALID") return c.json({ error: "UNPROCESSABLE", reason: r.reason }, 422);
    if (r.kind === "CONSENT_BLOCKED") {
      // "동의 없는 원생 제외"의 서버 강제 — 차단 명단 반환(제거 또는 추가 동의 유도)
      return c.json({ error: "CONSENT_REQUIRED", blockedParticipantIds: r.blockedParticipantIds }, 422);
    }
    return c.json({ photoId: r.photoId }, 200);
  });

  app.get("/academies/:academyId/photos/:photoId/url", guard, academyCtx, async (c) => {
    const blocked = requireStorage(c); if (blocked) return blocked;
    const auth = c.get("auth"); const m = c.get("membership");
    const r = await getPhotoDownload(cfg.db, cfg.storage!, {
      actorUserId: auth.userId, actorRoles: m.roles,
      academyId: c.req.param("academyId")!, photoId: c.req.param("photoId")!,
    }, now());
    if (!r) return c.json({ error: "NOT_FOUND" }, 404); // 권한 없음 포함 — 존재 은닉
    return c.json(r);
  });

  /* dev 전용 스토리지 표면(비영속) — devLogin 과 같은 게이트, 프로덕션 404 */
  app.put("/dev-storage/:key", async (c) => {
    if (!cfg.enableDevLogin || process.env.NODE_ENV === "production") return c.json({ error: "NOT_FOUND" }, 404);
    const st = cfg.storage as (StorageAdapter & { objects?: Map<string, { contentType: string; byteSize: number }> }) | undefined;
    if (!st?.objects) return c.json({ error: "NOT_FOUND" }, 404);
    const body = await c.req.arrayBuffer();
    st.objects.set(decodeURIComponent(c.req.param("key")!), {
      contentType: c.req.header("content-type") ?? "application/octet-stream",
      byteSize: body.byteLength,
    });
    return c.body(null, 204);
  });
  app.get("/dev-storage/:key", async (c) => {
    if (!cfg.enableDevLogin || process.env.NODE_ENV === "production") return c.json({ error: "NOT_FOUND" }, 404);
    const st = cfg.storage as (StorageAdapter & { objects?: Map<string, { contentType: string; byteSize: number }> }) | undefined;
    const obj = st?.objects?.get(decodeURIComponent(c.req.param("key")!));
    if (!obj) return c.json({ error: "NOT_FOUND" }, 404);
    return c.body("dev-object", 200, { "content-type": obj.contentType });
  });

  /* 안전사고 기록(#32) — 발생 시각 = 서버, 기록·열람 전부 감사 */
  const IncidentBody = z.object({
    participantId: z.string().min(1).max(64),
    sessionId: z.string().min(1).max(64).optional(),
    type: z.enum(["MINOR_INJURY", "CONDITION", "CLASS_HALT", "SAFETY_ACCIDENT", "OTHER"]),
    severity: z.enum(["MINOR", "CAUTION", "SEVERE"]),
    situation: z.string().min(1).max(2000),
    location: z.string().max(200).optional(),
    firstAid: z.string().max(1000).optional(),
    classContinued: z.boolean(),
    followUpNeeded: z.boolean(),
    guardianContact: z.enum(["CONTACTED", "NEEDED", "NOT_NEEDED"]),
  }).strict();
  app.post("/academies/:academyId/incidents", guard, csrf, academyCtx, async (c) => {
    const parsed = IncidentBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "INVALID_BODY" }, 422);
    const auth = c.get("auth"); const m = c.get("membership");
    const r = await reportIncident(cfg.db, {
      actorUserId: auth.userId, actorRoles: m.roles,
      academyId: c.req.param("academyId")!, ...parsed.data,
    }, now());
    if (r.kind === "FORBIDDEN") return c.json({ error: "FORBIDDEN", reason: r.reason }, 403);
    if (r.kind === "INVALID") return c.json({ error: "UNPROCESSABLE", reason: r.reason }, 422);
    return c.json({ incidentId: r.incidentId, occurredAt: r.occurredAt }, 201);
  });
  app.get("/academies/:academyId/incidents", guard, academyCtx, async (c) => {
    const auth = c.get("auth"); const m = c.get("membership");
    const rows = await listIncidents(cfg.db, {
      actorUserId: auth.userId, actorRoles: m.roles, academyId: c.req.param("academyId")!,
    }, now());
    if (!rows) return c.json({ error: "FORBIDDEN" }, 403);
    return c.json({ incidents: rows });
  });

  /* 원생 목록(#40) — staff 전용, PII 미포함(이름·상태·연령) */
  app.get("/academies/:academyId/participants", guard, academyCtx, async (c) => {
    const m = c.get("membership");
    const rows = await listParticipants(cfg.db, {
      actorRoles: m.roles, academyId: c.req.param("academyId")!,
      status: c.req.query("status") as never,
    });
    if (!rows) return c.json({ error: "FORBIDDEN" }, 403);
    return c.json({ participants: rows });
  });
  /* 원생 상세(#52) — staff 전용. 없음·타학원 = 404(존재 은닉) */
  app.get("/academies/:academyId/participants/:participantId", guard, academyCtx, async (c) => {
    const m = c.get("membership");
    if (!m.roles.includes("OWNER") && !m.roles.includes("DESK")) {
      return c.json({ error: "FORBIDDEN" }, 403);
    }
    const detail = await getParticipantDetail(cfg.db, {
      actorRoles: m.roles, academyId: c.req.param("academyId")!,
      participantId: c.req.param("participantId")!,
    });
    if (!detail) return c.json({ error: "NOT_FOUND" }, 404);
    return c.json(detail);
  });

  /* AudienceFilter 2단계 — 대상 미리보기(공지·청구·대회·CSV 공용, staff 전용) */
  app.post("/academies/:academyId/audience/preview", guard, csrf, academyCtx, async (c) => {
    const parsed = AudienceFilterBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "INVALID_BODY" }, 422);
    const m = c.get("membership");
    const r = await resolveAudience(cfg.db, {
      actorRoles: m.roles, academyId: c.req.param("academyId")!, filter: parsed.data,
    });
    if (!r) return c.json({ error: "FORBIDDEN" }, 403);
    return c.json({
      members: r.members, total: r.members.length,
      guardianRecipients: r.guardianUserIds.length,
    });
  });

  /* AudienceFilter 2단계 — 명단 CSV(감사 기록·PII 최소: 연락처·생년월일 미포함) */
  app.post("/academies/:academyId/audience/export", guard, csrf, academyCtx, async (c) => {
    const parsed = AudienceFilterBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "INVALID_BODY" }, 422);
    const auth = c.get("auth"); const m = c.get("membership");
    const r = await exportAudienceCsv(cfg.db, {
      actorUserId: auth.userId, actorRoles: m.roles,
      academyId: c.req.param("academyId")!, filter: parsed.data,
    }, now());
    if (!r) return c.json({ error: "FORBIDDEN" }, 403);
    return c.json({ filename: r.filename, rowCount: r.rowCount, csv: r.csv });
  });

  /* 코치 교체(#42) — 배정 행 교체(이력 보존)·권한 회수는 원장 결정·outbox 브리핑 */
  const CoachSwapBody = z.object({
    fromCoachUserId: z.string().min(1).max(64),
    toCoachUserId: z.string().min(1).max(64),
    classIds: z.array(z.string().min(1).max(64)).min(1).max(50),
    effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    revokeMode: z.enum(COACH_REVOKE_MODES),
  }).strict();
  app.post("/academies/:academyId/coach-swaps", guard, csrf, academyCtx, async (c) => {
    const parsed = CoachSwapBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "INVALID_BODY" }, 422);
    const auth = c.get("auth"); const m = c.get("membership");
    const r = await swapCoach(cfg.db, {
      actorUserId: auth.userId, actorRoles: m.roles,
      academyId: c.req.param("academyId")!, ...parsed.data,
    }, now());
    if (r.kind === "FORBIDDEN") return c.json({ error: "FORBIDDEN", reason: r.reason }, 403);
    if (r.kind !== "OK") return c.json({ error: "UNPROCESSABLE", reason: r.reason }, 422);
    return c.json({ swapped: r.swapped, affectedParticipants: r.affectedParticipants, revoked: r.revoked }, 200);
  });

  /* 멤버 목록(#31) — staff 전용. 코치 전달사항 대상 선택의 정본(PII 미포함) */
  app.get("/academies/:academyId/members", guard, academyCtx, async (c) => {
    const m = c.get("membership");
    const rows = await listMembers(cfg.db, {
      actorRoles: m.roles, academyId: c.req.param("academyId")!,
      role: c.req.query("role"),
    });
    if (!rows) return c.json({ error: "FORBIDDEN" }, 403);
    return c.json({ members: rows });
  });

  /* 원장 수납 관제 집계(#25) — staff 전용, 발행·수납·미납 실 데이터 */
  app.get("/academies/:academyId/billing/summary", guard, academyCtx, async (c) => {
    const m = c.get("membership");
    const summary = await getBillingSummary(cfg.db, {
      academyId: c.req.param("academyId")!, actorRoles: m.roles,
    });
    if (!summary) return c.json({ error: "FORBIDDEN" }, 403);
    return c.json(summary);
  });

  /* 내 자녀 청구서 목록 — 보호자 관점(연결 자녀만) */
  app.get("/academies/:academyId/invoices", guard, academyCtx, async (c) => {
    const auth = c.get("auth");
    const rows = await listGuardianInvoices(cfg.db, auth.userId, c.req.param("academyId")!);
    return c.json({ invoices: rows });
  });

  /* 13차 B P0-1: 결제 상태 재조회 — 완료 화면은 이 서버 진실 확인 후에만 */
  app.get("/academies/:academyId/payments/:paymentId", guard, academyCtx, async (c) => {
    const auth = c.get("auth");
    const m = c.get("membership");
    const r = await getPaymentStatus(cfg.db, {
      actorUserId: auth.userId, actorRoles: m.roles,
      academyId: c.req.param("academyId")!, paymentId: c.req.param("paymentId")!,
    });
    if (!r) return c.json({ error: "NOT_FOUND" }, 404);
    return c.json(r);
  });

  /* ── 환불 (R7 배치 5) — 요청·양측 승인. 실행(PG 환불 API)은 provider 연동 시 ── */
  const RefundBody = z.object({
    paymentId: z.string().min(1).max(64),
    participantId: z.string().min(1).max(64), // Refund 1건 = 원생 1명(R4 P0-2)
    reasonCode: z.string().min(1).max(40),
    reasonText: z.string().max(500).optional(),
  }).strict();

  app.post("/academies/:academyId/refunds", guard, csrf, guardianCtx, async (c) => {
    const idempotencyKey = c.req.header("idempotency-key");
    if (!idempotencyKey || idempotencyKey.length > 128) {
      return c.json({ error: "IDEMPOTENCY_KEY_REQUIRED" }, 422);
    }
    const parsed = RefundBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "INVALID_BODY" }, 422);
    const auth = c.get("auth");
    const r = await requestRefund(cfg.db, {
      actorUserId: auth.userId, academyId: c.req.param("academyId")!,
      ...parsed.data, idempotencyKey,
    }, now()).catch((e: Error) => {
      console.warn(`[refund] tx rejected: ${e.message}`); // 멱등 unique 등
      return null;
    });
    if (!r) return c.json({ error: "CONFLICT" }, 409);
    if (r.kind === "DENIED") return c.json({ error: "UNPROCESSABLE", reason: r.reason }, 422);
    return c.json({ refundId: r.refundId, requestedAmount: r.requestedAmount, status: "REQUESTED" }, 201);
  });

  /* 양측 승인 — side 는 body 가 아니라 서버가 역할로 도출(OpenAPI 계약) */
  app.post("/academies/:academyId/refunds/:refundId/approvals", guard, csrf, academyCtx, async (c) => {
    const auth = c.get("auth");
    const m = c.get("membership");
    const side = m.roles.includes("OWNER") ? "ACADEMY" as const
      : m.roles.includes("GUARDIAN") ? "GUARDIAN" as const : null;
    if (!side) return c.json({ error: "FORBIDDEN_ROLE" }, 403);
    const r = await approveRefund(cfg.db, {
      actorUserId: auth.userId, academyId: c.req.param("academyId")!,
      refundId: c.req.param("refundId")!, side,
    }, now());
    if (r.kind === "DENIED") return c.json({ error: "APPROVAL_REJECTED", reason: r.reason }, 409);
    return c.json({ refundId: r.refundId, status: r.status }, 200);
  });

  /* ── 배치 14: 소통(채팅) — docs/12 개정 계약 (DM·ACK 수명주기·민감 카테고리) ── */
  const DmBody = z.object({
    type: z.enum(["OWNER_COACH_DM", "GUARDIAN_DM"]),
    targetUserId: z.string().min(1).max(64).optional(),
    participantId: z.string().min(1).max(64).optional(),
  }).strict();
  app.post("/academies/:academyId/chat/dms", guard, csrf, academyCtx, async (c) => {
    const parsed = DmBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "INVALID_BODY" }, 422);
    const auth = c.get("auth");
    const m = c.get("membership");
    const r = await openDm(cfg.db, {
      actorUserId: auth.userId, actorRoles: m.roles,
      academyId: c.req.param("academyId")!, ...parsed.data,
    }, now());
    if (r.kind === "DENIED") return c.json({ error: "FORBIDDEN", reason: r.reason }, 403);
    return c.json({ roomId: r.roomId, created: r.created }, r.created ? 201 : 200);
  });

  const ChatMsgBody = z.object({
    kind: z.enum(["NORMAL_CHAT", "NOTICE", "ACK_REQUIRED", "URGENT_ACK_REQUIRED", "OPERATIONAL_TASK"]),
    category: z.enum(["GENERAL", "BILLING", "HEALTH"]).default("GENERAL"),
    body: z.string().min(1).max(2000),
    // 13차 C P0-1: contextCard 클라이언트 입력 제거 — BILLING 은 invoiceId 참조만(카드 = 서버 생성)
    invoiceId: z.string().min(1).max(64).optional(),
    relatedParticipantId: z.string().min(1).max(64).optional(),
    clientMessageId: z.string().min(1).max(64).optional(), // P1-5 전송 멱등
  }).strict();
  app.post("/academies/:academyId/chat/rooms/:roomId/messages", guard, csrf, academyCtx, async (c) => {
    const parsed = ChatMsgBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "INVALID_BODY" }, 422);
    const auth = c.get("auth");
    const m = c.get("membership");
    const { kind: msgKind, ...rest } = parsed.data;
    const r = await postMessage(cfg.db, {
      actorUserId: auth.userId, actorRoles: m.roles,
      academyId: c.req.param("academyId")!, roomId: c.req.param("roomId")!,
      msgKind, ...rest,
    }, now());
    if (r.kind === "FORBIDDEN") return c.json({ error: "FORBIDDEN", reason: r.reason }, 403);
    if (r.kind === "INVALID") return c.json({ error: "UNPROCESSABLE", reason: r.reason }, 422);
    return c.json({ messageId: r.messageId, status: r.status }, 201);
  });

  app.get("/academies/:academyId/chat/rooms", guard, academyCtx, async (c) => {
    const auth = c.get("auth");
    const rooms = await listRooms(cfg.db, {
      actorUserId: auth.userId, academyId: c.req.param("academyId")!,
    });
    return c.json({ rooms });
  });

  app.get("/academies/:academyId/chat/rooms/:roomId/messages", guard, academyCtx, async (c) => {
    const auth = c.get("auth");
    const msgs = await listMessages(cfg.db, {
      actorUserId: auth.userId, academyId: c.req.param("academyId")!,
      roomId: c.req.param("roomId")!,
    }, now());
    if (!msgs) return c.json({ error: "FORBIDDEN" }, 403);
    return c.json({ messages: msgs });
  });

  app.post("/academies/:academyId/chat/messages/:messageId/read", guard, csrf, academyCtx, async (c) => {
    const auth = c.get("auth");
    const r = await markRead(cfg.db, {
      actorUserId: auth.userId, academyId: c.req.param("academyId")!,
      messageId: c.req.param("messageId")!,
    }, now());
    if (r.kind === "FORBIDDEN") return c.json({ error: "FORBIDDEN", reason: r.reason }, 403);
    if (r.kind === "CONFLICT") return c.json({ error: "CONFLICT", reason: r.reason }, 409);
    return c.json({ status: r.status }, 200);
  });
  app.post("/academies/:academyId/chat/messages/:messageId/ack", guard, csrf, academyCtx, async (c) => {
    const auth = c.get("auth");
    const r = await acknowledge(cfg.db, {
      actorUserId: auth.userId, academyId: c.req.param("academyId")!,
      messageId: c.req.param("messageId")!,
    }, now());
    if (r.kind === "FORBIDDEN") return c.json({ error: "FORBIDDEN", reason: r.reason }, 403);
    if (r.kind === "CONFLICT") return c.json({ error: "CONFLICT", reason: r.reason }, 409);
    return c.json({ status: r.status }, 200);
  });

  const ResolveBody = z.object({ note: z.string().min(1).max(1000) }).strict();
  app.post("/academies/:academyId/chat/messages/:messageId/resolve", guard, csrf, academyCtx, async (c) => {
    const parsed = ResolveBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "INVALID_BODY" }, 422);
    const auth = c.get("auth");
    const r = await resolveMessage(cfg.db, {
      actorUserId: auth.userId, academyId: c.req.param("academyId")!,
      messageId: c.req.param("messageId")!, note: parsed.data.note,
    }, now());
    if (r.kind === "FORBIDDEN") return c.json({ error: "FORBIDDEN", reason: r.reason }, 403);
    if (r.kind === "CONFLICT") return c.json({ error: "CONFLICT", reason: r.reason }, 409);
    return c.json({ status: r.status }, 200);
  });

  /* ── PG 웹훅 — 서명 검증은 provider 연동 시(지금은 시뮬 헤더 게이트) ── */
  /* mockpg 전용 body — 결제/환불 이벤트를 kind 로 분기(오분류 방지, R6 P0-3).
     kind 생략 = payment(하위 호환). 실 provider 는 adapter 가 event 매핑. */
  const WebhookBody = z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("payment").default("payment"),
      providerEventId: z.string().min(1).max(128),
      paymentId: z.string().min(1).max(64),
      targetStatus: z.enum(["PENDING", "AUTHORIZED", "CAPTURED", "FAILED", "CANCELLED", "PARTIALLY_REFUNDED", "REFUNDED"]),
      occurredAt: z.string().min(10).max(40),
    }).strict(),
    z.object({
      kind: z.literal("refund"),
      providerEventId: z.string().min(1).max(128),
      refundId: z.string().min(1).max(64),
      targetStatus: z.enum(["REQUESTED", "MUTUALLY_APPROVED", "PROCESSING", "COMPLETED", "FAILED", "UNKNOWN", "REJECTED"]),
      occurredAt: z.string().min(10).max(40),
    }).strict(),
  ]);

  app.post("/webhooks/pg/:provider", async (c) => {
    /* R7 P0-1: fail-closed —
       (1) mockpg 는 enableMockPg && !production && 시크릿 일치일 때만(아니면 404)
       (2) 그 외 provider 는 등록된 verifier 가 raw body 서명을 통과시켜야만
       (3) 미등록 provider = 404. 환경변수 누락 = 전부 404(수신 자체 불가) */
    const providerName = c.req.param("provider")!;
    const raw = await c.req.text();

    if (providerName === "mockpg") {
      const mockAllowed =
        cfg.enableMockPg === true &&
        process.env.NODE_ENV !== "production" &&
        !!cfg.mockPgSecret; // 시크릿 미설정이면 dev 라도 열지 않음
      if (!mockAllowed) return c.json({ error: "NOT_FOUND" }, 404);
      if (c.req.header("x-webhook-secret") !== cfg.mockPgSecret) {
        return c.json({ error: "SIGNATURE_INVALID" }, 401);
      }
    } else {
      const verifier = cfg.webhookVerifiers?.[providerName];
      if (!verifier) return c.json({ error: "NOT_FOUND" }, 404); // allowlist — 미등록 거부
      const ok = await verifier(raw, (n) => c.req.header(n));
      if (!ok) return c.json({ error: "SIGNATURE_INVALID" }, 401);
    }

    let parsedJson: unknown;
    try { parsedJson = JSON.parse(raw); } catch { return c.json({ error: "INVALID_BODY" }, 422); }
    // kind 생략 = payment (하위 호환)
    if (parsedJson && typeof parsedJson === "object" && !("kind" in parsedJson)) {
      (parsedJson as Record<string, unknown>).kind = "payment";
    }
    const parsed = WebhookBody.safeParse(parsedJson);
    if (!parsed.success) return c.json({ error: "INVALID_BODY" }, 422);
    // ⚠️ 이 body 형식(내부 ID·targetStatus 직접 지정)은 mockpg 전용.
    //    실 provider 는 adapter 가 (provider, providerPaymentId)로 내부 결제를
    //    찾고 event type 을 내부 상태로 매핑한다(R7 P0-4 — provider 연동 시).
    const d = parsed.data;
    const decision = d.kind === "refund"
      ? await processRefundWebhook(cfg.db, providerName, { ...d, rawPayload: raw }, now())
      : await processPgWebhook(cfg.db, providerName, { ...d, rawPayload: raw }, now());
    // 중복·stale 포함 항상 200 — 내부 판단은 inbox (openapi 계약)
    return c.json({ decision: decision.action }, 200);
  });

  app.post("/sessions/logout-all", guard, csrf, async (c) => {
    const auth = c.get("auth");
    await revokeAllSessions(cfg.db, auth.userId, now()); // 이 세션 포함 전부 즉시 무효
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    deleteCookie(c, CSRF_COOKIE, { path: "/" });
    return c.body(null, 204);
  });

  /* ── Admin 백엔드 1차 (#27) — PLATFORM_ADMIN 전용 경계 ──
     일반 앱과 대칭 격리: requireAcademyContext 는 PLATFORM_ADMIN 을 403,
     여기는 PLATFORM_ADMIN 이외 전부 404(표면 은닉). 상태 변경 전부 감사. */
  const adminOnly = requirePlatformAdmin();

  app.get("/admin/overview", guard, adminOnly, async (c) =>
    c.json(await getPlatformOverview(cfg.db)));

  app.get("/admin/academies", guard, adminOnly, async (c) =>
    c.json({ academies: await listAcademiesOverview(cfg.db) }));

  const SubscriptionBody = z.object({ plan: z.enum(["BASIC", "PRO"]) }).strict();
  app.put("/admin/academies/:academyId/subscription", guard, adminOnly, csrf, async (c) => {
    const parsed = SubscriptionBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "INVALID_BODY" }, 422);
    const r = await setSubscription(cfg.db, {
      actorUserId: c.get("auth").userId,
      academyId: c.req.param("academyId")!, plan: parsed.data.plan,
    }, now());
    if (r.kind === "NOT_FOUND") return c.json({ error: "NOT_FOUND" }, 404);
    if (r.kind === "INVALID") return c.json({ error: "INVALID_BODY", reason: r.reason }, 422);
    return c.json({ subscriptionId: r.subscriptionId, priceKrwMonthly: r.priceKrwMonthly }, 200);
  });

  const ReasonBody = z.object({ reason: z.string().min(1).max(500) }).strict();
  const OptionalReasonBody = z.object({ reason: z.string().max(500).optional() }).strict();

  app.post("/admin/academies/:academyId/subscription/cancellation", guard, adminOnly, csrf, async (c) => {
    const parsed = OptionalReasonBody.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "INVALID_BODY" }, 422);
    const r = await cancelSubscription(cfg.db, {
      actorUserId: c.get("auth").userId,
      academyId: c.req.param("academyId")!, reason: parsed.data.reason,
    }, now());
    if (r.kind === "NOT_FOUND") return c.json({ error: "NOT_FOUND" }, 404);
    return c.json({ subscriptionId: (r as { subscriptionId: string }).subscriptionId }, 200);
  });

  const SupportViewBody = z.object({
    academyId: z.string().min(1).max(64),
    reason: z.string().min(1).max(500),
    minutes: z.number().int().min(5).max(60).optional(),
  }).strict();
  /* #39-④: 구독 상태 전이(상태머신 강제) + append-only ledger 조회 */
  const SubStatusBody = z.object({
    status: z.enum(["TRIAL", "ACTIVE", "PAST_DUE", "CANCELED"]),
    reason: z.string().max(300).optional(),
  }).strict();
  app.post("/admin/academies/:academyId/subscription/status", guard, adminOnly, csrf, async (c) => {
    const parsed = SubStatusBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "INVALID_BODY" }, 422);
    const r = await setSubscriptionStatus(cfg.db, {
      actorUserId: c.get("auth").userId,
      academyId: c.req.param("academyId")!, ...parsed.data,
    }, now());
    if (r.kind === "NOT_FOUND") return c.json({ error: "NOT_FOUND" }, 404);
    if (r.kind === "CONFLICT") return c.json({ error: "CONFLICT", reason: r.reason }, 409);
    if (r.kind === "INVALID") return c.json({ error: "INVALID_BODY" }, 422);
    return c.json({ subscriptionId: r.subscriptionId }, 200);
  });
  app.get("/admin/academies/:academyId/subscription/ledger", guard, adminOnly, async (c) =>
    c.json({ ledger: await listSubscriptionLedger(cfg.db, c.req.param("academyId")!) }));

  /* #50: 기능 예외 grant — "이 학원에 이 기능만 기간 한정 열기"(영업·프로모션) */
  app.get("/admin/academies/:academyId/feature-grants", guard, adminOnly, async (c) =>
    c.json({ grants: await listFeatureGrants(cfg.db, c.req.param("academyId")!, now()) }));
  const GrantBody = z.object({
    feature: z.string().min(1).max(64),
    reason: z.string().min(1).max(300),
    days: z.number().int().min(1).max(365).optional(), // 생략 = 무기한(명시 철회로만 종료)
  }).strict();
  app.post("/admin/academies/:academyId/feature-grants", guard, adminOnly, csrf, async (c) => {
    const parsed = GrantBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "INVALID_BODY" }, 422);
    const r = await grantFeature(cfg.db, {
      actorUserId: c.get("auth").userId,
      academyId: c.req.param("academyId")!, ...parsed.data,
    }, now());
    if (r.kind === "NOT_FOUND") return c.json({ error: "NOT_FOUND" }, 404);
    if (r.kind === "INVALID") return c.json({ error: "INVALID_BODY", reason: r.reason }, 422);
    return c.json({ grantId: r.grantId, expiresAt: r.expiresAt ?? null }, 201);
  });
  /* #50b: 전 기능 체험 — "다 열어주고 쓰게 한 뒤 만료로 잠근다"(기간 필수) */
  const TrialAllBody = z.object({
    reason: z.string().min(1).max(300),
    days: z.number().int().min(1).max(365),
  }).strict();
  app.post("/admin/academies/:academyId/feature-grants/trial-all", guard, adminOnly, csrf, async (c) => {
    const parsed = TrialAllBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "INVALID_BODY" }, 422);
    const r = await grantAllFeatures(cfg.db, {
      actorUserId: c.get("auth").userId,
      academyId: c.req.param("academyId")!, ...parsed.data,
    }, now());
    if (r.kind === "NOT_FOUND") return c.json({ error: "NOT_FOUND" }, 404);
    if (r.kind === "INVALID") return c.json({ error: "INVALID_BODY", reason: r.reason }, 422);
    return c.json({ granted: r.granted, expiresAt: r.expiresAt }, 201);
  });
  app.post("/admin/academies/:academyId/feature-grants/:grantId/revocation", guard, adminOnly, csrf, async (c) => {
    const parsed = OptionalReasonBody.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "INVALID_BODY" }, 422);
    const r = await revokeFeatureGrant(cfg.db, {
      actorUserId: c.get("auth").userId,
      academyId: c.req.param("academyId")!, grantId: c.req.param("grantId")!,
      reason: parsed.data.reason,
    }, now());
    if (r.kind === "NOT_FOUND") return c.json({ error: "NOT_FOUND" }, 404);
    if (r.kind !== "OK") return c.json({ error: "INVALID_BODY" }, 422);
    return c.json({ grantId: r.grantId }, 200);
  });

  /* #39-⑥(HQ-2): 네이버 검색·데이터랩 — 본부 전용, env 미설정 = 501 fail-closed */
  const naver = naverFromEnv();
  /* ── 본부(HQ) ← crawler-tool 조회 프록시 (#37 HQ-1, docs/19) ──
     PLATFORM_ADMIN 전용. env 미설정 = 501(연동 전 상태 정직 표시).
     크롤러는 무수정 존속 — 콘솔이 입구, 결과만 JSON 으로 소비. */
  const hq = hqCrawlerFromEnv(process.env);
  const hqCall = async (c: Context, run: () => Promise<unknown>) => {
    if (!hq) return c.json({ error: "HQ_CRAWLER_NOT_CONFIGURED" }, 501);
    try {
      return c.json({ result: await run() });
    } catch (e) {
      if (e instanceof HqCrawlerError) return c.json({ error: "UPSTREAM_FAILED", status: e.status, reason: e.message }, 502);
      return c.json({ error: "UPSTREAM_FAILED" }, 502);
    }
  };
  app.get("/admin/hq/health", guard, adminOnly, (c) => hqCall(c, () => hq!.health()));
  app.get("/admin/hq/products", guard, adminOnly, (c) => hqCall(c, () => hq!.products({
    brand: c.req.query("brand"), search: c.req.query("search"),
    page: c.req.query("page") ? Number(c.req.query("page")) : undefined,
    limit: c.req.query("limit") ? Number(c.req.query("limit")) : undefined,
    regStatus: c.req.query("regStatus") as "done" | "pending" | undefined,
    sort: c.req.query("sort"), order: c.req.query("order") as "asc" | "desc" | undefined,
  })));
  app.get("/admin/hq/jobs", guard, adminOnly, (c) => hqCall(c, async () => ({
    active: await hq!.activeJobs(),
    recent: await hq!.recentJobs(c.req.query("limit") ? Number(c.req.query("limit")) : 5),
    lastCrawl: await hq!.lastCrawlSummary(),
  })));

  app.get("/admin/naver/search", guard, adminOnly, async (c) => {
    if (!naver) return c.json({ error: "NAVER_NOT_CONFIGURED" }, 501);
    const type = c.req.query("type"); const q = c.req.query("q");
    if (!q || !["blog", "news", "webkr"].includes(type ?? "")) {
      return c.json({ error: "INVALID_BODY", reason: "type=blog|news|webkr, q 필수" }, 422);
    }
    try {
      return c.json({ result: await naver.search(type as "blog", q) });
    } catch { return c.json({ error: "UPSTREAM_FAILED" }, 502); }
  });
  const DatalabBody = z.object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    timeUnit: z.enum(["date", "week", "month"]),
    keywordGroups: z.array(z.object({
      groupName: z.string().min(1).max(40),
      keywords: z.array(z.string().min(1).max(40)).min(1).max(5),
    })).min(1).max(5),
  }).strict();
  app.post("/admin/naver/datalab", guard, adminOnly, csrf, async (c) => {
    if (!naver) return c.json({ error: "NAVER_NOT_CONFIGURED" }, 501);
    const parsed = DatalabBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "INVALID_BODY" }, 422);
    try {
      return c.json({ result: await naver.datalabTrend(parsed.data) });
    } catch { return c.json({ error: "UPSTREAM_FAILED" }, 502); }
  });

  app.get("/admin/support-views", guard, adminOnly, async (c) =>
    c.json({ supportViews: await listSupportViews(cfg.db) }));

  app.post("/admin/support-views", guard, adminOnly, csrf, async (c) => {
    const parsed = SupportViewBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "INVALID_BODY" }, 422);
    const r = await issueSupportView(cfg.db, {
      actorUserId: c.get("auth").userId, ...parsed.data,
    }, now());
    if (r.kind === "NOT_FOUND") return c.json({ error: "NOT_FOUND" }, 404);
    if (r.kind === "INVALID") return c.json({ error: "INVALID_BODY", reason: r.reason }, 422);
    return c.json({ supportViewId: r.supportViewId, expiresAt: r.expiresAt }, 201);
  });

  app.post("/admin/support-views/:supportViewId/revocation", guard, adminOnly, csrf, async (c) => {
    const parsed = OptionalReasonBody.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "INVALID_BODY" }, 422);
    const r = await revokeSupportView(cfg.db, {
      actorUserId: c.get("auth").userId,
      supportViewId: c.req.param("supportViewId")!, reason: parsed.data.reason,
    }, now());
    if (r.kind === "NOT_FOUND") return c.json({ error: "NOT_FOUND" }, 404);
    return c.json({ supportViewId: (r as { supportViewId: string }).supportViewId }, 200);
  });

  app.post("/admin/academies/:academyId/suspension", guard, adminOnly, csrf, async (c) => {
    const parsed = ReasonBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "INVALID_BODY" }, 422);
    const r = await suspendAcademy(cfg.db, {
      actorUserId: c.get("auth").userId,
      academyId: c.req.param("academyId")!, reason: parsed.data.reason,
    }, now());
    if (r.kind === "NOT_FOUND") return c.json({ error: "NOT_FOUND" }, 404);
    if (r.kind === "INVALID") return c.json({ error: "INVALID_BODY", reason: r.reason }, 422);
    return c.json({ revokedUserSessions: r.revokedUserSessions }, 200);
  });

  app.delete("/admin/academies/:academyId/suspension", guard, adminOnly, csrf, async (c) => {
    const r = await unsuspendAcademy(cfg.db, {
      actorUserId: c.get("auth").userId, academyId: c.req.param("academyId")!,
    }, now());
    if (r.kind === "NOT_FOUND") return c.json({ error: "NOT_FOUND" }, 404);
    return c.body(null, 204);
  });

  app.post("/admin/users/:userId/session-revocation", guard, adminOnly, csrf, async (c) => {
    const parsed = ReasonBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "INVALID_BODY" }, 422);
    const r = await adminRevokeUserSessions(cfg.db, {
      actorUserId: c.get("auth").userId,
      targetUserId: c.req.param("userId")!, reason: parsed.data.reason,
    }, now());
    if (r.kind === "NOT_FOUND") return c.json({ error: "NOT_FOUND" }, 404);
    if (r.kind === "INVALID") return c.json({ error: "INVALID_BODY", reason: r.reason }, 422);
    return c.body(null, 204);
  });

  return app;
}
