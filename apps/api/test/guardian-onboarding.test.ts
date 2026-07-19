/* 보호자 온보딩 실연결(슬라이스 A) 통합 테스트 — 실 HTTP × PGlite.
   초대코드 검증 → 본인인증 세션 발급 → 부모 아이 직접 등록 → my-children 노출.
   ⚠️ SMS/PASS 스텁(000000=오류) — verify 가 검증 세션을 실제 DB 기록. */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { seedWondergym } from "@pacefolio/db/seed";
import { createApp } from "../src/app";
import type { OAuthProvider } from "../src/auth/provider";

const migrationsFolder = join(
  dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "packages", "db", "migrations",
);
const NOW = "2026-07-19T10:00:00.000Z";
const ORIGIN = "http://localhost:3000";
let db: ReturnType<typeof drizzle>;
let app: ReturnType<typeof createApp>;
let seq = 0;

const fake: OAuthProvider = {
  name: "kakao", oidc: false,
  authorizeUrl: (p) => `https://fake/authorize?state=${p.state}`,
  exchangeCode: async (code) => ({ providerSubject: `sub-${code}`, displayName: `유저-${code}` }),
};

before(async () => {
  db = drizzle(new PGlite());
  await migrate(db, { migrationsFolder });
  app = createApp({
    db, providers: { kakao: fake }, allowedOrigins: [ORIGIN],
    redirectUri: "http://x/cb", now: () => NOW, secureCookies: false, enableDevLogin: true,
  });
  await seedWondergym(db, NOW); // a_wondergym + WG2025 초대코드 + PLAY 프로그램들
});

async function login() {
  const start = await app.request("/auth/kakao/start", { method: "POST" });
  const { state } = await start.json() as { state: string };
  const cb = await app.request(`/auth/kakao/callback?code=u${++seq}&state=${state}`);
  assert.equal(cb.status, 200);
  const setCookies = cb.headers.getSetCookie();
  const cookie = setCookies.map((c) => c.split(";")[0]).join("; ");
  const csrf = setCookies.find((c) => c.startsWith("pf_csrf="))!.split(";")[0].split("=")[1];
  return { cookie, csrf };
}
const H = (cookie: string, csrf: string) =>
  ({ cookie, origin: ORIGIN, "x-csrf-token": csrf, "content-type": "application/json" });

test("초대코드 검증 — 유효(WG2025)→학원·프로그램, 무효→404", async () => {
  const { cookie } = await login();
  const ok = await app.request("/guardian/invites/WG2025", { headers: { cookie } });
  assert.equal(ok.status, 200);
  const body = await ok.json() as { academyId: string; academyName: string; programs: { id: string; label: string }[] };
  assert.equal(body.academyId, "a_wondergym");
  assert.ok(body.programs.some((p) => p.label === "PLAY 2"));

  const bad = await app.request("/guardian/invites/NOPE99", { headers: { cookie } });
  assert.equal(bad.status, 404);
});

test("본인인증 — 000000 오류(422) / 정상코드는 검증세션 발급(201)", async () => {
  const { cookie, csrf } = await login();
  const wrong = await app.request("/guardian/otp/verify", {
    method: "POST", headers: H(cookie, csrf), body: JSON.stringify({ phone: "010-1234-5678", code: "000000" }),
  });
  assert.equal(wrong.status, 422);

  const ok = await app.request("/guardian/otp/verify", {
    method: "POST", headers: H(cookie, csrf), body: JSON.stringify({ phone: "010-1234-5678", code: "123456" }),
  });
  assert.equal(ok.status, 201);
  const body = await ok.json() as { verificationSessionId: string };
  assert.ok(body.verificationSessionId.startsWith("gvs_"));
});

test("아이 직접 등록 — 형제 2명 participant+link 생성 → my-children 노출, 세션 1회 소비", async () => {
  const { cookie, csrf } = await login();
  const verify = await app.request("/guardian/otp/verify", {
    method: "POST", headers: H(cookie, csrf), body: JSON.stringify({ phone: "010-2222-3333", code: "123456" }),
  });
  const { verificationSessionId } = await verify.json() as { verificationSessionId: string };

  const register = await app.request("/academies/a_wondergym/guardian/self-register", {
    method: "POST", headers: H(cookie, csrf),
    body: JSON.stringify({
      verificationSessionId, consentPolicyVersion: "v1.0", consentAgreed: true,
      children: [
        { name: "김하늘", birth: "2019-03-01", programId: "prog_play2" },
        { name: "김바다", birth: "2021-05-10", programId: "prog_play1" },
      ],
    }),
  });
  assert.equal(register.status, 201);
  const reg = await register.json() as { children: { participantId: string; name: string }[] };
  assert.equal(reg.children.length, 2);

  // my-children 에 등록한 아이가 실제로 뜬다(링크 VERIFIED + 멤버십 생성됨)
  const kids = await app.request("/academies/a_wondergym/my-children", { headers: { cookie } });
  assert.equal(kids.status, 200);
  const list = await kids.json() as { children: { name: string }[] };
  assert.ok(list.children.some((k) => k.name === "김하늘"));
  assert.ok(list.children.some((k) => k.name === "김바다"));

  // 같은 검증 세션 재사용 → 소비됨 → 409
  const reuse = await app.request("/academies/a_wondergym/guardian/self-register", {
    method: "POST", headers: H(cookie, csrf),
    body: JSON.stringify({
      verificationSessionId, consentPolicyVersion: "v1.0", consentAgreed: true,
      children: [{ name: "김산", birth: "2020-01-01", programId: "prog_play1" }],
    }),
  });
  assert.equal(reuse.status, 409);
});

test("필수 동의 없으면 422", async () => {
  const { cookie, csrf } = await login();
  const verify = await app.request("/guardian/otp/verify", {
    method: "POST", headers: H(cookie, csrf), body: JSON.stringify({ phone: "010-5555-6666", code: "123456" }),
  });
  const { verificationSessionId } = await verify.json() as { verificationSessionId: string };
  const res = await app.request("/academies/a_wondergym/guardian/self-register", {
    method: "POST", headers: H(cookie, csrf),
    body: JSON.stringify({
      verificationSessionId, consentPolicyVersion: "v1.0", consentAgreed: false,
      children: [{ name: "김들", birth: "2020-01-01" }],
    }),
  });
  assert.equal(res.status, 422);
});
