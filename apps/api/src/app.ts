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
import { preparePayment, processPgWebhook } from "./billing/service";
import { listGuardianInvoices } from "./billing/queries";
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
    childBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD"),
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
    return c.json(result, 202); // PENDING(수동 심사)·REJECTED — 본문에 status
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

  /* ── PG 웹훅 — 서명 검증은 provider 연동 시(지금은 시뮬 헤더 게이트) ── */
  const WebhookBody = z.object({
    providerEventId: z.string().min(1).max(128),
    paymentId: z.string().min(1).max(64),
    targetStatus: z.enum(["PENDING", "AUTHORIZED", "CAPTURED", "FAILED", "CANCELLED", "PARTIALLY_REFUNDED", "REFUNDED"]),
    occurredAt: z.string().min(10).max(40),
  }).strict();

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
    const parsed = WebhookBody.safeParse(parsedJson);
    if (!parsed.success) return c.json({ error: "INVALID_BODY" }, 422);
    // ⚠️ 이 body 형식(paymentId·targetStatus 직접 지정)은 mockpg 전용.
    //    실 provider 는 adapter 가 (provider, providerPaymentId)로 내부 결제를
    //    찾고 event type 을 내부 상태로 매핑한다(R7 P0-4 — provider 연동 시).
    const decision = await processPgWebhook(cfg.db, providerName, {
      ...parsed.data, rawPayload: raw,
    }, now());
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
