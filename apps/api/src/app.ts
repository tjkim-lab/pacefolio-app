/* PACEFOLIO API — Hono 앱 조립 (api/openapi.yaml auth 섹션 구현)
   테스트는 app.request() 인메모리 — 서버 기동 불필요(PGlite 조합). */
import { Hono } from "hono";
import { setCookie, deleteCookie } from "hono/cookie";
import { z } from "zod";
import type { Db } from "./sessions/service";
import { revokeSession, revokeAllSessions, SESSION_TTL_DAYS, type IssuedSession } from "./sessions/service";
import { startOAuth, handleOAuthCallback } from "./auth/service";
import type { ProviderRegistry, OAuthProviderName } from "./auth/provider";
import { requireSession, requireCsrf, requireAcademyContext, SESSION_COOKIE, CSRF_COOKIE, type GuardEnv } from "./guard";
import { requestGuardianLink } from "./linking/service";
import { revokeGuardianLink } from "./linking/revoke";
import {
  createClass, generateSessions, cancelSession, listClasses, listSessions,
} from "./classes/service";
import {
  createParticipant, changeParticipantStatus, enrollParticipant, endEnrollment,
} from "./students/service";
import {
  recordAttendance, completeSession, listSessionAttendance, createAttendanceNotice,
} from "./attendance/service";
import { preparePayment, processPgWebhook } from "./billing/service";
import { requestRefund, approveRefund, processRefundWebhook } from "./billing/refunds";
import { listGuardianInvoices, getPaymentStatus } from "./billing/queries";
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
}

const PROVIDER_NAMES: readonly OAuthProviderName[] = ["kakao", "naver", "google", "apple"];

export function createApp(cfg: ApiConfig) {
  const now = cfg.now ?? (() => new Date().toISOString());
  const secure = cfg.secureCookies ?? true;
  const app = new Hono<GuardEnv>();
  const guard = requireSession(cfg.db, now);
  const csrf = requireCsrf(cfg.allowedOrigins);
  const academyCtx = requireAcademyContext(cfg.db, now);
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
  app.post("/auth/:provider/start", async (c) => {
    const name = c.req.param("provider") as OAuthProviderName;
    if (!PROVIDER_NAMES.includes(name)) return c.json({ error: "UNKNOWN_PROVIDER" }, 404);
    const provider = cfg.providers[name];
    if (!provider) return c.json({ error: "PROVIDER_NOT_CONFIGURED" }, 501);
    const r = await startOAuth(cfg.db, provider, cfg.redirectUri, now());
    return c.json(r, 200);
  });

  /* ── OAuth callback — state 원자적 소비 → code 교환 → 세션 발급 ── */
  app.get("/auth/:provider/callback", async (c) => {
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
  app.post("/auth/dev/login", async (c) => {
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

  app.post("/academies/:academyId/guardian-links", guard, csrf, async (c) => {
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

  return app;
}
