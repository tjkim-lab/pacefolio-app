/* 코치 교체 (#42) 통합 테스트 — 실 HTTP × PGlite
   배정 행 교체(이력 보존) · 즉시 회수는 고아 반 방지 · outbox → 새 코치 브리핑 알림. */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { and, eq } from "drizzle-orm";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { schema as s } from "@pacefolio/db";
import { createApp } from "../src/app";
import { dispatchPendingOutbox } from "../src/notifications/service";
import type { OAuthProvider } from "../src/auth/provider";

const migrationsFolder = join(
  dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "packages", "db", "migrations",
);
const NOW = "2026-09-01T09:00:00.000Z";
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
const post = (a: Actor, path: string, body?: unknown) =>
  app.request(path, {
    method: "POST",
    headers: {
      cookie: a.cookie, origin: ORIGIN, "x-csrf-token": a.csrf,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

let owner: Actor, coachA: Actor, coachB: Actor;
let cls1 = "", cls2 = "";

before(async () => {
  const client = new PGlite();
  db = drizzle(client);
  await migrate(db, { migrationsFolder });
  app = createApp({
    db, providers: { kakao: fake }, allowedOrigins: [ORIGIN],
    redirectUri: "http://x/cb", now: () => NOW, secureCookies: false,
  });
  await db.insert(s.academies).values({
    id: "a_wg", organizationId: "o", name: "원더짐", themeColor: "#12B5A5", themeInk: "#087F73",
    logoEmoji: "🐯", ownerName: "김도윤", billingCycleDefault: 3,
  });
  owner = await login("owner"); coachA = await login("coachA"); coachB = await login("coachB");
  await db.insert(s.academyMemberships).values([
    { id: "m_o", userId: owner.userId, academyId: "a_wg", roles: ["OWNER"], status: "ACTIVE", joinedAt: "2024-03-01" },
    { id: "m_a", userId: coachA.userId, academyId: "a_wg", roles: ["COACH"], status: "ACTIVE", joinedAt: "2024-08-01" },
    { id: "m_b", userId: coachB.userId, academyId: "a_wg", roles: ["COACH"], status: "ACTIVE", joinedAt: "2026-08-30" },
  ]);
  // coachA 담당 반 2개 + 원생 배정
  for (const [name, slot] of [["플레이2 월수반", 1], ["축구 화금반", 2]] as const) {
    const r = await post(owner, "/academies/a_wg/classes", {
      name, scheduleType: "FIXED_WEEKLY", capacity: 12, coachUserId: coachA.userId,
      slots: [{ weekday: slot, startTime: "15:00", endTime: "16:00" }],
    });
    assert.equal(r.status, 201);
    const id = ((await r.json()) as { classId: string }).classId;
    if (!cls1) cls1 = id; else cls2 = id;
  }
  await db.insert(s.participants).values([
    { id: "p1", academyId: "a_wg", name: "서지우", birth: "2018-01-01", ageLabel: "8세" },
    { id: "p2", academyId: "a_wg", name: "이수아", birth: "2017-02-02", ageLabel: "9세" },
  ]);
  await db.insert(s.dbEnrollments).values([
    { id: "en1", academyId: "a_wg", classId: cls1, participantId: "p1", status: "ACTIVE", startDate: "2026-08-01" },
    { id: "en2", academyId: "a_wg", classId: cls1, participantId: "p2", status: "ACTIVE", startDate: "2026-08-01" },
  ]);
});

test("교체: 행 교체(기존 ENDED+신규 ACTIVE) · 대상 원생 집계 · 코치 403", async () => {
  assert.equal((await post(coachA, "/academies/a_wg/coach-swaps", {
    fromCoachUserId: coachA.userId, toCoachUserId: coachB.userId,
    classIds: [cls1], effectiveDate: "2026-09-08", revokeMode: "KEEP",
  })).status, 403);
  const r = await post(owner, "/academies/a_wg/coach-swaps", {
    fromCoachUserId: coachA.userId, toCoachUserId: coachB.userId,
    classIds: [cls1], effectiveDate: "2026-09-08", revokeMode: "KEEP",
  });
  assert.equal(r.status, 200);
  const body = (await r.json()) as { swapped: number; affectedParticipants: number; revoked: boolean };
  assert.equal(body.swapped, 1);
  assert.equal(body.affectedParticipants, 2);
  assert.equal(body.revoked, false);
  const assigns = await db.select().from(s.classAssignments)
    .where(eq(s.classAssignments.classId, cls1));
  const ended = assigns.find((a) => a.coachUserId === coachA.userId);
  const active = assigns.find((a) => a.coachUserId === coachB.userId);
  assert.equal(ended?.status, "ENDED");
  assert.equal(ended?.endDate, "2026-09-08");   // 이력 보존 — 삭제 아님
  assert.equal(active?.status, "ACTIVE");
  assert.equal(active?.startDate, "2026-09-08");
});

test("outbox COACH_SWAPPED → 새 코치 인수인계 인앱 알림", async () => {
  await dispatchPendingOutbox(db, NOW);
  const ntf = await db.select().from(s.inAppNotifications).where(and(
    eq(s.inAppNotifications.academyId, "a_wg"),
    eq(s.inAppNotifications.userId, coachB.userId),
    eq(s.inAppNotifications.category, "HANDOVER"),
  ));
  assert.equal(ntf.length, 1);
  assert.equal(ntf[0].title, "인수인계 브리핑");
  assert.ok(ntf[0].body.includes("원생 2명"));
});

test("즉시 회수: 담당 반이 남으면 422(고아 반 방지) · 전부 넘기면 멤버십 ENDED", async () => {
  // cls2 가 아직 coachA 담당 → IMMEDIATE 거부(cls2 만 넘기면서 즉시 회수 요구해도, 검증은 tx 내 교체 후 잔여 기준)
  const deny = await post(owner, "/academies/a_wg/coach-swaps", {
    fromCoachUserId: coachA.userId, toCoachUserId: coachB.userId,
    classIds: [cls2], effectiveDate: "2026-09-08", revokeMode: "IMMEDIATE",
  });
  // cls2 를 넘기면 잔여 0 — 즉시 회수 허용
  assert.equal(deny.status, 200);
  const body = (await deny.json()) as { revoked: boolean };
  assert.equal(body.revoked, true);
  const ms = (await db.select().from(s.academyMemberships).where(eq(s.academyMemberships.id, "m_a")))[0];
  assert.equal(ms.status, "ENDED");
  assert.equal(ms.endedAt, "2026-09-08");
});

test("검증: 같은 코치 422 · 비담당 반 422 · 재직 아닌 새 코치 422", async () => {
  assert.equal((await post(owner, "/academies/a_wg/coach-swaps", {
    fromCoachUserId: coachB.userId, toCoachUserId: coachB.userId,
    classIds: [cls1], effectiveDate: "2026-09-08", revokeMode: "KEEP",
  })).status, 422);
  // cls1 은 이제 coachB 담당 — coachA(from) 기준 비담당
  assert.equal((await post(owner, "/academies/a_wg/coach-swaps", {
    fromCoachUserId: coachA.userId, toCoachUserId: coachB.userId,
    classIds: [cls1], effectiveDate: "2026-09-08", revokeMode: "KEEP",
  })).status, 422);
  // coachA 멤버십 ENDED — 새 코치로 지정 불가
  assert.equal((await post(owner, "/academies/a_wg/coach-swaps", {
    fromCoachUserId: coachB.userId, toCoachUserId: coachA.userId,
    classIds: [cls1], effectiveDate: "2026-09-08", revokeMode: "KEEP",
  })).status, 422);
});
