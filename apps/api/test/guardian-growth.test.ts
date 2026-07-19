/* PS6 보호자 성장보고서 경계 테스트 (지시서 §10·§12)
   해당 아이와 유효하게 연결된(VERIFIED·미철회) 보호자만 조회.
   불허 = 404(은닉). 철회된 링크 즉시 차단. my-children 은 링크된 아이만. */
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
const NOW = "2026-07-21T10:00:00.000Z";
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
  const setCookies = cb.headers.getSetCookie();
  return {
    cookie: setCookies.map((c) => c.split(";")[0]).join("; "),
    csrf: setCookies.find((c) => c.startsWith("pf_csrf="))!.split(";")[0].split("=")[1],
    userId,
  };
}
const get = (a: Actor, p: string) => app.request(p, { headers: { cookie: a.cookie } });

let owner: Actor, guardian1: Actor, guardian2: Actor;

before(async () => {
  const client = new PGlite();
  db = drizzle(client);
  await migrate(db, { migrationsFolder });
  app = createApp({
    db, providers: { kakao: fake }, allowedOrigins: [ORIGIN],
    redirectUri: "http://x/cb", now: () => NOW, secureCookies: false,
  });
  await db.insert(s.academies).values(
    { id: "a_test", organizationId: "o", name: "샘플학원", themeColor: "#12B5A5", themeInk: "#087F73", logoEmoji: "🏫", ownerName: "원장A", billingCycleDefault: 3 });
  owner = await login("owner");
  guardian1 = await login("g1"); // p1 연결(VERIFIED)
  guardian2 = await login("g2"); // p2 연결이었다가 철회됨
  await db.insert(s.academyMemberships).values([
    { id: "m_o", userId: owner.userId, academyId: "a_test", roles: ["OWNER"], status: "ACTIVE", joinedAt: "2024-03-01" },
    { id: "m_g1", userId: guardian1.userId, academyId: "a_test", roles: ["GUARDIAN"], status: "ACTIVE", joinedAt: "2025-01-01" },
    { id: "m_g2", userId: guardian2.userId, academyId: "a_test", roles: ["GUARDIAN"], status: "ACTIVE", joinedAt: "2025-01-01" },
  ]);
  await db.insert(s.participants).values([
    { id: "p1", academyId: "a_test", name: "샘플 원생 1", birth: "2018-01-01", ageLabel: "7세" },
    { id: "p2", academyId: "a_test", name: "샘플 원생 2", birth: "2018-02-01", ageLabel: "7세" },
  ]);
  await db.insert(s.guardians).values([
    { id: "gd_1", userId: guardian1.userId },
    { id: "gd_2", userId: guardian2.userId },
  ]);
  await db.insert(s.guardianParticipantLinks).values([
    { id: "gl_1", guardianId: "gd_1", participantId: "p1", academyId: "a_test",
      relationshipType: "MOTHER", isPrimaryGuardian: true, verificationStatus: "VERIFIED",
      canViewSchedule: true, canViewAttendance: true, canViewHealthInfo: false,
      canReceivePhotos: true, canPay: true, canRequestRefund: false },
    { id: "gl_2", guardianId: "gd_2", participantId: "p2", academyId: "a_test",
      relationshipType: "FATHER", isPrimaryGuardian: true, verificationStatus: "VERIFIED",
      canViewSchedule: true, canViewAttendance: true, canViewHealthInfo: false,
      canReceivePhotos: true, canPay: true, canRequestRefund: false,
      revokedAt: "2026-07-01T00:00:00.000Z", revokedByUserId: owner.userId }, // 철회됨
  ]);
});

test("my-children — 유효 링크의 아이만·철회 보호자는 빈 목록", async () => {
  const r1 = await get(guardian1, "/academies/a_test/my-children");
  const b1 = await r1.json() as { children: { participantId: string }[] };
  assert.equal(b1.children.length, 1);
  assert.equal(b1.children[0].participantId, "p1");
  const r2 = await get(guardian2, "/academies/a_test/my-children");
  assert.equal(((await r2.json()) as { children: unknown[] }).children.length, 0);
});

test("경험지도·뱃지북 — 보호자는 자기 아이만(남의 아이 404 은닉)", async () => {
  const own = await get(guardian1, "/academies/a_test/participants/p1/experience-map");
  assert.equal(own.status, 200);
  const other = await get(guardian1, "/academies/a_test/participants/p2/experience-map");
  assert.equal(other.status, 404); // 남의 아이 = 은닉
  const book = await get(guardian1, "/academies/a_test/participants/p1/skill-book");
  assert.equal(book.status, 200);
  const bookOther = await get(guardian1, "/academies/a_test/participants/p2/skill-book");
  assert.equal(bookOther.status, 404);
});

test("철회된 링크 즉시 차단 · 스태프는 운영 범위 조회 유지", async () => {
  const revoked = await get(guardian2, "/academies/a_test/participants/p2/experience-map");
  assert.equal(revoked.status, 404); // 철회 = 차단
  const staff = await get(owner, "/academies/a_test/participants/p2/experience-map");
  assert.equal(staff.status, 200);
  // 링크를 VERIFIED 로 복구하면 다시 열림(재검증이 살아있다는 증명)
  await db.update(s.guardianParticipantLinks).set({ revokedAt: null })
    .where(eq(s.guardianParticipantLinks.id, "gl_2"));
  const restored = await get(guardian2, "/academies/a_test/participants/p2/experience-map");
  assert.equal(restored.status, 200);
});
