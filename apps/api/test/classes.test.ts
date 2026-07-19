/* 기본선 1단계(#22) 통합 테스트 — 반·수업 일정 vertical slice
   실 HTTP × PGlite(WASM Postgres — 실 PostgreSQL 검증은 CI):
   유형 3종 생성·검증 / 반복 전개(달력 산술·멱등) / 휴강 보존 / 권한·테넌트 */
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
const NOW = "2026-07-18T10:00:00.000Z";
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

let owner: Actor, coach: Actor;

before(async () => {
  const client = new PGlite();
  db = drizzle(client);
  await migrate(db, { migrationsFolder });
  app = createApp({
    db, providers: { kakao: fake }, allowedOrigins: [ORIGIN],
    redirectUri: "http://x/cb", now: () => NOW, secureCookies: false,
  });
  await db.insert(s.academies).values([
    { id: "a_wg", organizationId: "o", name: "원더짐", themeColor: "#12B5A5", themeInk: "#087F73", logoEmoji: "🐯", ownerName: "김도윤", billingCycleDefault: 3 },
    { id: "a_other", organizationId: "o2", name: "타학원", themeColor: "#000", themeInk: "#000", logoEmoji: "🏫", ownerName: "남", billingCycleDefault: 3 },
  ]);
  await db.insert(s.participants).values([
    { id: "p_dodam", academyId: "a_wg", name: "김도담", birth: "2017-04-10", ageLabel: "8세" },
    { id: "p_other", academyId: "a_other", name: "타학원생", birth: "2018-01-01", ageLabel: "7세" },
  ]);
  owner = await login("owner");
  coach = await login("coach");
  await db.insert(s.academyMemberships).values([
    { id: "m_o", userId: owner.userId, academyId: "a_wg", roles: ["OWNER"], status: "ACTIVE", joinedAt: "2024-03-01" },
    { id: "m_c", userId: coach.userId, academyId: "a_wg", roles: ["COACH"], status: "ACTIVE", joinedAt: "2024-08-01" },
  ]);
});

let clsId = "";

test("반 생성: FIXED_WEEKLY(월·수 14:30) + 담당 코치 배정 → 201 + 감사", async () => {
  const r = await post(owner, "/academies/a_wg/classes", {
    name: "플레이2 월수반", scheduleType: "FIXED_WEEKLY", capacity: 12,
    room: "본관 2층", coachUserId: coach.userId,
    slots: [
      { weekday: 1, startTime: "14:30", endTime: "15:30" },
      { weekday: 3, startTime: "14:30", endTime: "15:30" },
    ],
  });
  assert.equal(r.status, 201);
  clsId = ((await r.json()) as { classId: string }).classId;
  const assigns = await db.select().from(s.classAssignments).where(eq(s.classAssignments.classId, clsId));
  assert.equal(assigns.length, 1);
  assert.equal(assigns[0].coachUserId, coach.userId);
  assert.equal(assigns[0].status, "ACTIVE");
  const audit = await db.select().from(s.auditLogs).where(eq(s.auditLogs.action, "class.created"));
  assert.equal(audit.length, 1);
});

test("유형 검증: FIXED 인데 요일별 다른 시간 422 · 코치는 반 생성 403", async () => {
  const bad = await post(owner, "/academies/a_wg/classes", {
    name: "잘못된 반", scheduleType: "FIXED_WEEKLY", capacity: 10,
    slots: [
      { weekday: 1, startTime: "13:00", endTime: "14:00" },
      { weekday: 3, startTime: "14:00", endTime: "15:00" },
    ],
  });
  assert.equal(bad.status, 422);
  const byCoach = await post(coach, "/academies/a_wg/classes", {
    name: "코치 시도", scheduleType: "FIXED_WEEKLY", capacity: 10,
    slots: [{ weekday: 1, startTime: "13:00", endTime: "14:00" }],
  });
  assert.equal(byCoach.status, 403);
});

test("PARTICIPANT_SPECIFIC: 원생 미지정 422 · 타학원 원생 지정 = DB 복합 FK 방어", async () => {
  const noKid = await post(owner, "/academies/a_wg/classes", {
    name: "개인 레슨", scheduleType: "PARTICIPANT_SPECIFIC", capacity: 4,
    slots: [{ weekday: 6, startTime: "10:00", endTime: "10:50" }],
  });
  assert.equal(noKid.status, 422);
  const crossKid = await post(owner, "/academies/a_wg/classes", {
    name: "교차 레슨", scheduleType: "PARTICIPANT_SPECIFIC", capacity: 4,
    slots: [{ weekday: 6, startTime: "10:00", endTime: "10:50", participantId: "p_other" }],
  });
  assert.notEqual(crossKid.status, 201); // fk_slot_participant_academy — 삽입 자체 실패
  const ok = await post(owner, "/academies/a_wg/classes", {
    name: "도담 개인 레슨", scheduleType: "PARTICIPANT_SPECIFIC", capacity: 4,
    slots: [{ weekday: 6, startTime: "10:00", endTime: "10:50", participantId: "p_dodam" }],
  });
  assert.equal(ok.status, 201);
});

test("반복 전개: 2026-07-20~08-02 월·수 → 정확히 4회 + 재전개 멱등(중복 0)", async () => {
  const r = await post(owner, `/academies/a_wg/classes/${clsId}/sessions/generate`, {
    rangeStart: "2026-07-20", rangeEnd: "2026-08-02",
  });
  assert.equal(r.status, 201);
  assert.equal(((await r.json()) as { created: number }).created, 4);
  const list = await get(owner, `/academies/a_wg/classes/${clsId}/sessions?from=2026-07-20&to=2026-08-02`);
  const body = (await list.json()) as { sessions: { date: string; status: string }[] };
  assert.deepEqual(body.sessions.map((x) => x.date), ["2026-07-20", "2026-07-22", "2026-07-27", "2026-07-29"]);
  // 재전개 — 삭제 후 재삽입이므로 총 개수 불변(멱등)
  const again = await post(owner, `/academies/a_wg/classes/${clsId}/sessions/generate`, {
    rangeStart: "2026-07-20", rangeEnd: "2026-08-02",
  });
  assert.equal(again.status, 201);
  const rows = await db.select().from(s.classSessions).where(eq(s.classSessions.classId, clsId));
  assert.equal(rows.length, 4);
});

test("휴강: CANCELED + 사유·감사·Outbox — 재전개해도 휴강 보존(부활 금지)", async () => {
  const list = await get(owner, `/academies/a_wg/classes/${clsId}/sessions?from=2026-07-20&to=2026-08-02`);
  const sessions = ((await list.json()) as { sessions: { sessionId: string; date: string }[] }).sessions;
  const target = sessions.find((x) => x.date === "2026-07-27")!;
  const r = await post(owner, `/academies/a_wg/sessions/${target.sessionId}/cancellation`, {
    reason: "김선재 코치 결혼식 — 임시 휴무",
  });
  assert.equal(r.status, 200);
  // 멱등 재호출
  assert.equal((await post(owner, `/academies/a_wg/sessions/${target.sessionId}/cancellation`, { reason: "x" })).status, 200);
  const outbox = await db.select().from(s.outboxEvents).where(eq(s.outboxEvents.eventType, "CLASS_SESSION_CANCELED"));
  assert.equal(outbox.length, 1);
  // 재전개 — CANCELED 는 삭제·재생성되지 않아야 함
  await post(owner, `/academies/a_wg/classes/${clsId}/sessions/generate`, {
    rangeStart: "2026-07-20", rangeEnd: "2026-08-02",
  });
  const after = await db.select().from(s.classSessions).where(eq(s.classSessions.classId, clsId));
  assert.equal(after.length, 4);
  const canceled = after.find((x) => x.date === "2026-07-27")!;
  assert.equal(canceled.status, "CANCELED");
  assert.match(canceled.canceledReason ?? "", /결혼식/);
  assert.equal(canceled.id, target.sessionId); // 같은 행 유지 — 부활·교체 없음
});

test("휴강 세션은 코치 조회에도 상태 그대로 — 학원 멤버 조회 가능·타학원 403", async () => {
  const byCoach = await get(coach, `/academies/a_wg/classes/${clsId}/sessions`);
  assert.equal(byCoach.status, 200);
  const outsider = await login("outsider");
  await db.insert(s.academyMemberships).values({
    id: "m_out", userId: outsider.userId, academyId: "a_other", roles: ["OWNER"], status: "ACTIVE", joinedAt: "2024-01-01",
  });
  assert.equal((await get(outsider, `/academies/a_wg/classes/${clsId}/sessions`)).status, 403);
});

test("반 목록 enrolled(#49) — ACTIVE 등록만 집계·ENDED 제외·미등록 반 0", async () => {
  await db.insert(s.dbEnrollments).values({
    id: "en_cnt_dodam", academyId: "a_wg", classId: clsId, participantId: "p_dodam",
    status: "ACTIVE", startDate: "2026-07-01", createdAt: NOW,
  });
  const r = await get(owner, "/academies/a_wg/classes");
  assert.equal(r.status, 200);
  const { classes } = await r.json() as { classes: { classId: string; enrolled: number; capacity: number }[] };
  const mine = classes.find((c) => c.classId === clsId)!;
  assert.equal(mine.enrolled, 1);
  assert.equal(mine.capacity, 12);
  for (const c of classes.filter((x) => x.classId !== clsId)) assert.equal(c.enrolled, 0);

  await db.update(s.dbEnrollments).set({ status: "ENDED" })
    .where(eq(s.dbEnrollments.id, "en_cnt_dodam"));
  const r2 = await get(owner, "/academies/a_wg/classes");
  const { classes: after } = await r2.json() as { classes: { classId: string; enrolled: number }[] };
  assert.equal(after.find((c) => c.classId === clsId)!.enrolled, 0);
});
