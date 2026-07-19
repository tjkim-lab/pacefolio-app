/* #57 보안 회귀 — OTP 스텁 프로덕션 fail-closed.
   멀티에이전트 검증(P1): /guardian/otp/verify 스텁이 발송코드 대조 없이 임의 전화로
   "인증됨" 세션을 발급 → 선등록 연락처 매칭과 결합해 남의 자녀 클레임 악용 가능.
   프로덕션 상당(enableDevLogin=false)에선 issue/verify 가 501(SMS 미연동)이어야 하고,
   임의 전화로 검증 세션이 만들어지지 않아야 한다. */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { schema as s } from "@pacefolio/db";
import { createApp } from "../src/app";
import type { OAuthProvider } from "../src/auth/provider";

const migrationsFolder = join(
  dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "packages", "db", "migrations",
);
const NOW = "2026-07-19T15:00:00.000Z";
const ORIGIN = "http://localhost:3000";
let db: ReturnType<typeof drizzle>;
let app: ReturnType<typeof createApp>;

const fake: OAuthProvider = {
  name: "kakao", oidc: false,
  authorizeUrl: (p) => `https://fake/authorize?state=${p.state}`,
  exchangeCode: async (code) => ({ providerSubject: `sub-${code}`, displayName: `유저-${code}` }),
};
interface Actor { cookie: string; csrf: string; userId: string }
async function login(code: string): Promise<Actor> {
  const st = await app.request("/auth/kakao/start", { method: "POST" });
  const { state } = await st.json() as { state: string };
  const cb = await app.request(`/auth/kakao/callback?code=${code}&state=${state}`);
  const { userId } = await cb.json() as { userId: string };
  const sc = cb.headers.getSetCookie();
  return {
    cookie: sc.map((c) => c.split(";")[0]).join("; "),
    csrf: sc.find((c) => c.startsWith("pf_csrf="))!.split(";")[0].split("=")[1],
    userId,
  };
}
const post = (a: Actor, path: string, body: unknown) =>
  app.request(path, {
    method: "POST",
    headers: { cookie: a.cookie, origin: ORIGIN, "x-csrf-token": a.csrf, "content-type": "application/json" },
    body: JSON.stringify(body),
  });

let actor: Actor;

before(async () => {
  const client = new PGlite();
  db = drizzle(client);
  await migrate(db, { migrationsFolder });
  /* enableDevLogin: false = 프로덕션 상당 — 스텁 OTP 는 열려선 안 됨 */
  app = createApp({
    db, providers: { kakao: fake }, allowedOrigins: [ORIGIN],
    redirectUri: "http://x/cb", now: () => NOW, secureCookies: false, enableDevLogin: false,
  });
  actor = await login("attacker");
});

test("프로덕션 상당: OTP verify 501 — 임의 전화로 검증 세션 발급 불가", async () => {
  const before = (await db.select().from(s.guardianVerificationSessions)).length;
  const verify = await post(actor, "/guardian/otp/verify", { phone: "010-9999-8888", code: "123456" });
  assert.equal(verify.status, 501);
  assert.equal(((await verify.json()) as { error: string }).error, "SMS_VERIFICATION_NOT_CONFIGURED");
  // DB 부작용 없음 — 검증 세션이 생성되지 않았다(자녀 클레임 선결조건 차단)
  const after = (await db.select().from(s.guardianVerificationSessions)).length;
  assert.equal(after, before);
});

test("프로덕션 상당: OTP issue 501 — 스텁 발송 없음", async () => {
  const issue = await post(actor, "/guardian/otp/issue", { phone: "010-9999-8888" });
  assert.equal(issue.status, 501);
  assert.equal(((await issue.json()) as { error: string }).error, "SMS_VERIFICATION_NOT_CONFIGURED");
});

test("인증세션 없이는 self-register 도 본인인증 요구(방어 심층)", async () => {
  // 위조한 verificationSessionId 로 자녀 등록 시도 → 본인인증 실패로 거부
  const r = await post(actor, "/academies/a_x/guardian/self-register", {
    verificationSessionId: "gvs_forged", relationshipType: "MOTHER",
    consentPolicyVersion: "v1.0", consentAgreed: true,
    children: [{ name: "남의아이", birth: "2018-01-01" }],
  });
  // 학원 컨텍스트 없음(멤버십 미보유) 또는 인증세션 무효 — 어느 쪽이든 참가자 미생성
  assert.ok(r.status >= 400);
  const parts = await db.select().from(s.participants).where(eq(s.participants.name, "남의아이"));
  assert.equal(parts.length, 0);
});
