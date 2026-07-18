/* 안전사고 기록(#32) 통합 테스트 — 실 HTTP × PGlite
   담당 코치만 기록(비담당 403·보호자 403) · 발생 시각 = 서버 · 감사+Outbox ·
   조회: staff 전체 / 코치 본인 보고분 / 열람 감사. */
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
const NOW = "2026-07-18T15:05:00.000Z";
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
const get = (a: Actor, path: string) => app.request(path, { headers: { cookie: a.cookie } });

let owner: Actor, coach: Actor, coach2: Actor, mom: Actor;

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
  owner = await login("owner"); coach = await login("coach");
  coach2 = await login("coach2"); mom = await login("mom");
  await db.insert(s.academyMemberships).values([
    { id: "m_o", userId: owner.userId, academyId: "a_wg", roles: ["OWNER"], status: "ACTIVE", joinedAt: "2024-03-01" },
    { id: "m_c", userId: coach.userId, academyId: "a_wg", roles: ["COACH"], status: "ACTIVE", joinedAt: "2024-08-01" },
    { id: "m_c2", userId: coach2.userId, academyId: "a_wg", roles: ["COACH"], status: "ACTIVE", joinedAt: "2025-03-01" },
    { id: "m_m", userId: mom.userId, academyId: "a_wg", roles: ["GUARDIAN"], status: "ACTIVE", joinedAt: "2025-03-02" },
  ]);
  await db.insert(s.participants).values({
    id: "p_dodam", academyId: "a_wg", name: "김도담", birth: "2017-04-10", ageLabel: "8세",
  });
  await db.insert(s.dbClasses).values({
    id: "cls1", academyId: "a_wg", name: "플레이2", scheduleType: "FIXED_WEEKLY", capacity: 12,
    createdAt: NOW, updatedAt: NOW,
  });
  await db.insert(s.classAssignments).values({
    id: "ca1", classId: "cls1", academyId: "a_wg", coachUserId: coach.userId,
    status: "ACTIVE", startDate: "2024-08-01", createdAt: NOW,
  });
  await db.insert(s.dbEnrollments).values({
    id: "en1", academyId: "a_wg", classId: "cls1", participantId: "p_dodam",
    status: "ACTIVE", startDate: "2025-03-02", createdAt: NOW,
  });
});

const BODY = {
  participantId: "p_dodam", type: "MINOR_INJURY", severity: "CAUTION",
  situation: "매트존에서 착지하다 발목을 접질림", location: "본관 2층 매트존",
  firstAid: "냉찜질 후 휴식", classContinued: false, followUpNeeded: true,
  guardianContact: "CONTACTED",
};

test("담당 코치 기록: 201 + 발생 시각 = 서버 now + 감사 + Outbox(원장 알림 트랙)", async () => {
  const r = await post(coach, "/academies/a_wg/incidents", BODY);
  assert.equal(r.status, 201);
  const body = (await r.json()) as { incidentId: string; occurredAt: string };
  assert.equal(body.occurredAt, NOW); // 클라이언트 고정 시각 아님 — 서버 기록
  const audit = await db.select().from(s.auditLogs).where(eq(s.auditLogs.action, "safety_incident.reported"));
  assert.equal(audit.length, 1);
  assert.ok(!audit[0].detail?.includes("발목")); // 감사 detail 에 상황 원문 미포함(마스킹)
  const outbox = await db.select().from(s.outboxEvents).where(eq(s.outboxEvents.eventType, "SAFETY_INCIDENT_REPORTED"));
  assert.equal(outbox.length, 1);
});

test("권한: 비담당 코치 403 · 보호자 403 · 타학원 원생 422", async () => {
  assert.equal((await post(coach2, "/academies/a_wg/incidents", BODY)).status, 403);
  assert.equal((await post(mom, "/academies/a_wg/incidents", BODY)).status, 403);
  assert.equal((await post(owner, "/academies/a_wg/incidents", { ...BODY, participantId: "p_none" })).status, 422);
  // staff(원장)는 담당 무관 기록 가능
  assert.equal((await post(owner, "/academies/a_wg/incidents", { ...BODY, severity: "MINOR" })).status, 201);
});

test("조회: staff 전체 · 코치 본인 보고분 · 비담당 코치 빈목록 · 보호자 403 · 열람 감사", async () => {
  const staffList = (await (await get(owner, "/academies/a_wg/incidents")).json()) as { incidents: unknown[] };
  assert.equal(staffList.incidents.length, 2); // 코치 1 + 원장 1
  const coachList = (await (await get(coach, "/academies/a_wg/incidents")).json()) as { incidents: { reportedByUserId: string }[] };
  assert.equal(coachList.incidents.length, 1);
  assert.equal(coachList.incidents[0].reportedByUserId, coach.userId);
  const c2List = (await (await get(coach2, "/academies/a_wg/incidents")).json()) as { incidents: unknown[] };
  assert.equal(c2List.incidents.length, 0);
  assert.equal((await get(mom, "/academies/a_wg/incidents")).status, 403);
  const viewAudit = await db.select().from(s.auditLogs).where(eq(s.auditLogs.action, "safety_incident.viewed"));
  assert.ok(viewAudit.length >= 2); // staff·코치 열람 각각 감사
});

test("파일럿 P0: outbox 디스패치 — 사고 보고 → 원장 인앱 알림 · 재실행 멱등 · 본인만 조회", async () => {
  const { dispatchPendingOutbox } = await import("../src/notifications/service");
  const n1 = await dispatchPendingOutbox(db, NOW);
  assert.ok(n1 >= 1); // 앞 테스트들의 SAFETY_INCIDENT 이벤트 소비
  const n2 = await dispatchPendingOutbox(db, NOW);
  assert.equal(n2, 0); // publishedAt 마킹 — 재실행 시 재발송 없음(멱등)
  // 원장 인앱 알림 수신(사고 2건 = 알림 2건) — 상황 원문 미포함
  const list = (await (await get(owner, "/academies/a_wg/notifications")).json()) as {
    notifications: { category: string; body: string; refType: string | null }[];
  };
  const safety = list.notifications.filter((n) => n.category === "SAFETY_INCIDENT");
  assert.equal(safety.length, 2);
  assert.ok(!safety[0].body.includes("발목")); // PII 최소 — 심각도·참조만
  assert.equal(safety[0].refType, "SafetyIncident");
  // 코치(비수신자)에겐 안 보임 — 내 것만
  const coachList = (await (await get(coach, "/academies/a_wg/notifications")).json()) as { notifications: unknown[] };
  assert.equal(coachList.notifications.length, 0);
});
