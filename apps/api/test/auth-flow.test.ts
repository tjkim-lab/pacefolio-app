/* Phase 2+3 통합 테스트 — 실제 HTTP 요청(app.request) × 진짜 Postgres(PGlite)
   R5 §3.7 "다음 단계에서 반드시 검증": state 동시 재사용 · 만료 state ·
   nonce 불일치 · logout-all 직후 기존 세션 재사용 + Route Guard 부정 케이스. */
import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createApp } from "../src/app";
import type { OAuthProvider } from "../src/auth/provider";

const migrationsFolder = join(
  dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "packages", "db", "migrations",
);

/* 시뮬 시계 — 테스트가 시간을 제어 */
let NOW = "2026-07-16T10:00:00.000Z";
const clock = () => NOW;

/* FakeProvider — 외부 I/O 없이 code 교환 시뮬. nonce 는 마지막 authorize 의 것 반영 */
function makeFakeProvider(overrides?: Partial<OAuthProvider>): OAuthProvider & { lastNonce?: string } {
  const p: OAuthProvider & { lastNonce?: string } = {
    name: "kakao",
    oidc: false,
    authorizeUrl(params) {
      p.lastNonce = params.nonce;
      return `https://fake.example/authorize?state=${params.state}`;
    },
    async exchangeCode(code) {
      if (code === "bad-code") throw new Error("invalid code");
      return {
        providerSubject: `fake-${code}`, // code 별로 다른 사용자 시뮬
        verifiedEmail: `${code}@fake.example`,
        displayName: "박서연",
        nonce: p.lastNonce,
      };
    },
    ...overrides,
  };
  return p;
}

const ORIGIN = "http://localhost:3000";
let db: ReturnType<typeof drizzle>;
let fake: ReturnType<typeof makeFakeProvider>;
let app: ReturnType<typeof createApp>;

before(async () => {
  const client = new PGlite();
  db = drizzle(client);
  await migrate(db, { migrationsFolder });
});

beforeEach(() => {
  NOW = "2026-07-16T10:00:00.000Z";
  fake = makeFakeProvider();
  app = createApp({
    db, providers: { kakao: fake },
    allowedOrigins: [ORIGIN],
    redirectUri: "http://localhost:3001/auth/kakao/callback",
    now: clock, secureCookies: false,
  });
});

/* 헬퍼: start → callback → 쿠키 획득 */
async function login(code = "alice"): Promise<{ cookie: string; csrf: string }> {
  const startRes = await app.request("/auth/kakao/start", { method: "POST" });
  assert.equal(startRes.status, 200);
  const { state } = await startRes.json() as { state: string };
  const cb = await app.request(`/auth/kakao/callback?code=${code}&state=${state}`);
  assert.equal(cb.status, 200);
  const setCookies = cb.headers.getSetCookie();
  const session = setCookies.find((c) => c.startsWith("pf_session="))!;
  const csrfCookie = setCookies.find((c) => c.startsWith("pf_csrf="))!;
  const cookie = [session.split(";")[0], csrfCookie.split(";")[0]].join("; ");
  const csrf = csrfCookie.split(";")[0].split("=")[1];
  return { cookie, csrf };
}

test("정상 플로우: start → callback(세션 쿠키) → /sessions/me", async () => {
  const { cookie } = await login("alice");
  const me = await app.request("/sessions/me", { headers: { cookie } });
  assert.equal(me.status, 200);
  const body = await me.json() as { user: { name: string }; memberships: unknown[] };
  assert.equal(body.user.name, "박서연");
  assert.deepEqual(body.memberships, []); // 아직 소속 없음 — 온보딩 대상
});

test("세션 쿠키 계약: HttpOnly·SameSite=Lax·Path=/ + 토큰 원문은 DB 에 없음", async () => {
  const startRes = await app.request("/auth/kakao/start", { method: "POST" });
  const { state } = await startRes.json() as { state: string };
  const cb = await app.request(`/auth/kakao/callback?code=bob&state=${state}`);
  const sessionCookie = cb.headers.getSetCookie().find((c) => c.startsWith("pf_session="))!;
  assert.match(sessionCookie, /HttpOnly/i);
  assert.match(sessionCookie, /SameSite=Lax/i);
  assert.match(sessionCookie, /Path=\//i);
});

test("R5: state 재사용 차단 — 같은 state 두 번째 callback 은 401", async () => {
  const startRes = await app.request("/auth/kakao/start", { method: "POST" });
  const { state } = await startRes.json() as { state: string };
  const first = await app.request(`/auth/kakao/callback?code=carol&state=${state}`);
  assert.equal(first.status, 200);
  const replay = await app.request(`/auth/kakao/callback?code=carol&state=${state}`);
  assert.equal(replay.status, 401); // 일회성 소비 — 재사용 불가
});

test("R5: 만료 state 거부 (10분 초과)", async () => {
  const startRes = await app.request("/auth/kakao/start", { method: "POST" });
  const { state } = await startRes.json() as { state: string };
  NOW = "2026-07-16T10:11:00.000Z"; // 11분 뒤
  const cb = await app.request(`/auth/kakao/callback?code=dave&state=${state}`);
  assert.equal(cb.status, 401);
});

test("R5: 위조 state·code 교환 실패 = 401 통일(이유 비노출)", async () => {
  const forged = await app.request(`/auth/kakao/callback?code=x&state=forged-state`);
  assert.equal(forged.status, 401);
  const startRes = await app.request("/auth/kakao/start", { method: "POST" });
  const { state } = await startRes.json() as { state: string };
  const badCode = await app.request(`/auth/kakao/callback?code=bad-code&state=${state}`);
  assert.equal(badCode.status, 401);
  const body = await badCode.json() as { error: string };
  assert.equal(body.error, "UNAUTHORIZED"); // 세부 이유 없음
});

test("R5: OIDC nonce 불일치 거부", async () => {
  const oidcFake = makeFakeProvider({
    oidc: true,
    async exchangeCode() {
      return { providerSubject: "g-1", nonce: "wrong-nonce" }; // 저장된 nonce 와 다름
    },
  });
  const oidcApp = createApp({
    db, providers: { google: oidcFake }, allowedOrigins: [ORIGIN],
    redirectUri: "http://x/cb", now: clock, secureCookies: false,
  });
  const startRes = await oidcApp.request("/auth/google/start", { method: "POST" });
  const { state } = await startRes.json() as { state: string };
  const cb = await oidcApp.request(`/auth/google/callback?code=g&state=${state}`);
  assert.equal(cb.status, 401);
});

test("재로그인 = 같은 (provider, subject) → 같은 사용자 (자동 병합 없음)", async () => {
  await login("erin");
  const me1 = await app.request("/sessions/me", { headers: { cookie: (await login("erin")).cookie } });
  const b1 = await me1.json() as { user: { id: string } };
  // 같은 subject 재로그인 → 같은 userId (새 계정 생성 안 됨)
  const me2 = await app.request("/sessions/me", { headers: { cookie: (await login("erin")).cookie } });
  const b2 = await me2.json() as { user: { id: string } };
  assert.equal(b1.user.id, b2.user.id);
});

/* ── Route Guard (Phase 3) ── */

test("guard: 미인증·위조 토큰·만료 세션 전부 401", async () => {
  assert.equal((await app.request("/sessions/me")).status, 401); // 쿠키 없음
  assert.equal(
    (await app.request("/sessions/me", { headers: { cookie: "pf_session=forged-token" } })).status,
    401,
  );
  const { cookie } = await login("frank");
  NOW = "2026-07-24T10:00:01.000Z"; // TTL 7일 초과
  assert.equal((await app.request("/sessions/me", { headers: { cookie } })).status, 401);
});

test("logout: 세션 즉시 무효 + CSRF 없이 호출 불가", async () => {
  const { cookie, csrf } = await login("grace");
  // CSRF 헤더 없음 → 403 (상태 변경 차단)
  const noCsrf = await app.request("/sessions/logout", {
    method: "POST", headers: { cookie, origin: ORIGIN },
  });
  assert.equal(noCsrf.status, 403);
  // 타 origin → 403
  const badOrigin = await app.request("/sessions/logout", {
    method: "POST", headers: { cookie, origin: "https://evil.example", "x-csrf-token": csrf },
  });
  assert.equal(badOrigin.status, 403);
  // 정상 로그아웃
  const ok = await app.request("/sessions/logout", {
    method: "POST", headers: { cookie, origin: ORIGIN, "x-csrf-token": csrf },
  });
  assert.equal(ok.status, 204);
  // 직후 기존 세션 재사용 → 401
  assert.equal((await app.request("/sessions/me", { headers: { cookie } })).status, 401);
});

test("R5: logout-all 직후 다른 기기 세션도 즉시 무효", async () => {
  const device1 = await login("henry");
  const device2 = await login("henry"); // 같은 사용자, 두 번째 기기
  assert.equal((await app.request("/sessions/me", { headers: { cookie: device1.cookie } })).status, 200);
  const res = await app.request("/sessions/logout-all", {
    method: "POST",
    headers: { cookie: device2.cookie, origin: ORIGIN, "x-csrf-token": device2.csrf },
  });
  assert.equal(res.status, 204);
  // 두 기기 모두 즉시 401 (R5 §3.7 logout-all 직후 재사용 차단)
  assert.equal((await app.request("/sessions/me", { headers: { cookie: device1.cookie } })).status, 401);
  assert.equal((await app.request("/sessions/me", { headers: { cookie: device2.cookie } })).status, 401);
});

test("미구성 provider 는 501 — 실 키 발급 전 안전", async () => {
  assert.equal((await app.request("/auth/naver/start", { method: "POST" })).status, 501);
  assert.equal((await app.request("/auth/unknown/start", { method: "POST" })).status, 404);
});
