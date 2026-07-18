/* Route Guard + CSRF 미들웨어 (docs/10 · docs/11 §A · R5 Phase 3)
   검증 체인: 세션 존재 → 활성·미만료 → 사용자 활성 → (다음 단계: membership
   status → academy context → role → resource 권한).
   실패 = 401 통일(fail-closed) — 이유 세분 노출 금지. */
import type { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import { eq } from "drizzle-orm";
import { schema as s } from "@pacefolio/db";
import { resolveSession, revokeAllSessions, type Db, type ResolvedSession } from "./sessions/service";

export const SESSION_COOKIE = "pf_session";
export const CSRF_COOKIE = "pf_csrf";
export const CSRF_HEADER = "x-csrf-token";

export interface GuardEnv {
  Variables: {
    auth: ResolvedSession;
    membership: { academyId: string; roles: string[]; status: string };
  };
}

export function requireSession(db: Db, now: () => string) {
  return async (c: Context<GuardEnv>, next: Next) => {
    const token = getCookie(c, SESSION_COOKIE);
    const auth = await resolveSession(db, token, now());
    if (!auth) return c.json({ error: "UNAUTHORIZED" }, 401);
    c.set("auth", auth);
    await next();
  };
}

/** Academy context guard (docs/10 Route Guard 표 · R5 Phase 3):
   - 소속 없음 → 403 TENANT_SCOPE (URL academyId 조작 차단)
   - SUSPENDED/ENDED → 403 + 전 세션 폐기(logout-all 강제, docs/10)
   - PLATFORM_ADMIN → 일반 앱 진입 금지(별도 Admin 경계)
   - requiredRole 지정 시 역할 보유 확인
   requireSession 뒤에서만 사용(auth 필요). */
export function requireAcademyContext(db: Db, now: () => string, requiredRole?: string) {
  return async (c: Context<GuardEnv>, next: Next) => {
    const academyId = c.req.param("academyId");
    const auth = c.get("auth");
    if (!academyId || !auth) return c.json({ error: "FORBIDDEN_TENANT_SCOPE" }, 403);
    if (auth.memberships.some((m) => m.roles.includes("PLATFORM_ADMIN"))) {
      return c.json({ error: "PLATFORM_ADMIN_SEPARATE_BOUNDARY" }, 403);
    }
    const m = auth.memberships.find((x) => x.academyId === academyId);
    if (!m) return c.json({ error: "FORBIDDEN_TENANT_SCOPE" }, 403);
    /* admin 통제 액션(#27): 정지된 학원은 전 역할 차단 — 구독·정책 위반 대응 지렛대 */
    const academy = (await db.select({ suspendedAt: s.academies.suspendedAt })
      .from(s.academies).where(eq(s.academies.id, academyId)))[0];
    if (academy?.suspendedAt) return c.json({ error: "ACADEMY_SUSPENDED" }, 403);
    if (m.status !== "ACTIVE") {
      await revokeAllSessions(db, auth.userId, now()); // docs/10: 접근 차단 + 세션·토큰 폐기
      return c.json({ error: "MEMBERSHIP_NOT_ACTIVE" }, 403);
    }
    if (requiredRole && !m.roles.includes(requiredRole)) {
      return c.json({ error: "FORBIDDEN_ROLE" }, 403);
    }
    c.set("membership", m);
    await next();
  };
}

/** 세션 리뷰 반영: academyCtx 를 타지 않는 academyId 라우트(guardian-links·members/accept)용
   정지 검사 — 멤버십 상태와 무관하게 학원 정지면 403. 통제 계약 "정지 = 전 역할 차단"의 구멍 봉합. */
export function requireAcademyAlive(db: Db) {
  return async (c: Context<GuardEnv>, next: Next) => {
    const academyId = c.req.param("academyId");
    if (!academyId) return c.json({ error: "INVALID_BODY" }, 422);
    const academy = (await db.select({ suspendedAt: s.academies.suspendedAt })
      .from(s.academies).where(eq(s.academies.id, academyId)))[0];
    if (academy?.suspendedAt) return c.json({ error: "ACADEMY_SUSPENDED" }, 403);
    await next();
  };
}

/** Admin 경계(#27) — requireAcademyContext 의 PLATFORM_ADMIN 차단과 대칭.
   ACTIVE PLATFORM_ADMIN 멤버십만 통과. 그 외엔 404(admin 표면 존재 은닉). */
export function requirePlatformAdmin() {
  return async (c: Context<GuardEnv>, next: Next) => {
    const auth = c.get("auth");
    const ok = auth?.memberships.some(
      (m) => m.roles.includes("PLATFORM_ADMIN") && m.status === "ACTIVE",
    );
    if (!ok) return c.json({ error: "NOT_FOUND" }, 404);
    await next();
  };
}

/** CSRF 3중 방어 중 서버 강제 2축 (docs/11 §A):
   ① Origin allowlist(부재 시 Referer, 둘 다 없으면 거부)
   ② X-CSRF-Token 헤더 = pf_csrf 쿠키 (double-submit)
   ③ SameSite=Lax 는 쿠키 속성으로 별도 적용. */
export function requireCsrf(allowedOrigins: readonly string[]) {
  return async (c: Context, next: Next) => {
    const origin = c.req.header("origin") ?? refOrigin(c.req.header("referer"));
    if (!origin || !allowedOrigins.includes(origin)) {
      return c.json({ error: "FORBIDDEN_ORIGIN" }, 403);
    }
    const headerToken = c.req.header(CSRF_HEADER);
    const cookieToken = getCookie(c, CSRF_COOKIE);
    if (!headerToken || !cookieToken || headerToken !== cookieToken) {
      return c.json({ error: "CSRF_TOKEN_MISMATCH" }, 403);
    }
    await next();
  };
}

function refOrigin(referer: string | undefined): string | undefined {
  if (!referer) return undefined;
  try {
    return new URL(referer).origin;
  } catch {
    return undefined; // 파싱 불가 = 거부 방향(fail-closed)
  }
}
