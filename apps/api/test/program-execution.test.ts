/* 프로그램 실행 PS4 통합 테스트 — 반 적용→오늘 계획→결과 확정→경험지도.
   §13 E2E "PLAY 2형" 여정을 중립 데이터로 재현(§16):
   원장 PC 프로그램 게시 → 반 적용 → 코치 수업 실행 → 경험지도 반영.
   불변식: PUBLISHED 만 적용 · 참석 기본 반영+예외 수정 · NOT_DONE 무경험 ·
   REPLACED 는 대체 활동 영역으로 · 이벤트 UNIQUE 중복 차단 · 담당/테넌트 경계. */
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
const NOW = "2026-07-21T10:00:00.000Z"; // 월요일
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
const send = (a: Actor, method: string, path: string, body?: unknown) =>
  app.request(path, {
    method,
    headers: {
      cookie: a.cookie, origin: ORIGIN, "x-csrf-token": a.csrf,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
const post = (a: Actor, p: string, b?: unknown) => send(a, "POST", p, b);
const put = (a: Actor, p: string, b?: unknown) => send(a, "PUT", p, b);
const get = (a: Actor, p: string) => app.request(p, { headers: { cookie: a.cookie } });
const j = async <T>(r: Response) => await r.json() as T;

let owner: Actor, coach: Actor, coach2: Actor, otherOwner: Actor;
let versionId = "";       // 게시될 버전
let draftVersionId = "";  // 게시 안 된 버전(적용 거부 테스트)
let classId = "";
let sessionId = "";       // 실제 수업(classSession)
const actRev: Record<string, string> = {}; // 활동명 → 현재 revisionId
const domainId: Record<string, string> = {};
let assignmentId = "";
let planId = "";

before(async () => {
  const client = new PGlite();
  db = drizzle(client);
  await migrate(db, { migrationsFolder });
  app = createApp({
    db, providers: { kakao: fake }, allowedOrigins: [ORIGIN],
    redirectUri: "http://x/cb", now: () => NOW, secureCookies: false,
  });
  await db.insert(s.academies).values([
    { id: "a_test", organizationId: "o", name: "샘플학원", themeColor: "#12B5A5", themeInk: "#087F73", logoEmoji: "🏫", ownerName: "원장A", billingCycleDefault: 3 },
    { id: "a_other", organizationId: "o2", name: "타학원", themeColor: "#000", themeInk: "#000", logoEmoji: "🏫", ownerName: "원장B", billingCycleDefault: 3 },
  ]);
  owner = await login("owner");
  coach = await login("coach");
  coach2 = await login("coach2"); // 담당 아님
  otherOwner = await login("other");
  await db.insert(s.academyMemberships).values([
    { id: "m_o", userId: owner.userId, academyId: "a_test", roles: ["OWNER"], status: "ACTIVE", joinedAt: "2024-03-01" },
    { id: "m_c", userId: coach.userId, academyId: "a_test", roles: ["COACH"], status: "ACTIVE", joinedAt: "2024-08-01" },
    { id: "m_c2", userId: coach2.userId, academyId: "a_test", roles: ["COACH"], status: "ACTIVE", joinedAt: "2024-08-01" },
    { id: "m_x", userId: otherOwner.userId, academyId: "a_other", roles: ["OWNER"], status: "ACTIVE", joinedAt: "2024-01-01" },
  ]);
  await db.insert(s.participants).values([
    { id: "p1", academyId: "a_test", name: "샘플 원생 1", birth: "2018-01-01", ageLabel: "7세" },
    { id: "p2", academyId: "a_test", name: "샘플 원생 2", birth: "2018-02-01", ageLabel: "7세" },
    { id: "p3", academyId: "a_test", name: "샘플 원생 3", birth: "2018-03-01", ageLabel: "7세" },
    { id: "p4", academyId: "a_test", name: "샘플 원생 4", birth: "2018-04-01", ageLabel: "7세" },
  ]);

  /* 프로그램 준비(§19 여정 재사용): 영역 3 + 활동 4 + 커리큘럼 2회차 + 게시 */
  const prog = await j<{ programId: string; versionId: string }>(await post(owner, "/academies/a_test/programs", {
    name: "샘플 경험 프로그램", modes: ["EXPERIENCE"],
  }));
  versionId = prog.versionId;
  const parent = await j<{ domainId: string }>(await post(owner, "/academies/a_test/growth-domains", { name: "테스트 대분류" }));
  for (const name of ["테스트 균형", "테스트 이동", "테스트 조작"]) {
    const d = await j<{ domainId: string }>(await post(owner, "/academies/a_test/growth-domains", { name, parentId: parent.domainId }));
    domainId[name] = d.domainId;
  }
  const tagPlans: Record<string, { growthDomainId: string; role: "PRIMARY" | "SECONDARY" }[]> = {
    "샘플 활동 A": [
      { growthDomainId: domainId["테스트 균형"], role: "PRIMARY" },
      { growthDomainId: domainId["테스트 이동"], role: "SECONDARY" },
    ],
    "샘플 활동 B": [{ growthDomainId: domainId["테스트 이동"], role: "PRIMARY" }],
    "샘플 활동 C": [{ growthDomainId: domainId["테스트 균형"], role: "PRIMARY" }],
    "샘플 활동 D": [{ growthDomainId: domainId["테스트 조작"], role: "PRIMARY" }],
  };
  const actId: Record<string, string> = {};
  for (const [name, tags] of Object.entries(tagPlans)) {
    const a = await j<{ activityId: string; revisionId: string }>(
      await post(owner, "/academies/a_test/activities", { name }));
    actId[name] = a.activityId;
    actRev[name] = a.revisionId;
    await put(owner, `/academies/a_test/activities/${a.activityId}/growth-tags`, { tags });
  }
  const sec = await j<{ sectionId: string }>(await post(owner, `/academies/a_test/versions/${versionId}/sections`, {
    sectionType: "QUARTER", name: "1분기",
  }));
  for (let w = 1; w <= 2; w++) {
    const cs = await j<{ curriculumSessionId: string }>(
      await post(owner, `/academies/a_test/versions/${versionId}/sessions`, {
        sectionId: sec.sectionId, name: `1분기 ${w}주 차`, sequence: w,
      }));
    await put(owner, `/academies/a_test/curriculum-sessions/${cs.curriculumSessionId}/activities`, {
      activities: [
        { activityId: actId["샘플 활동 A"] },
        { activityId: actId["샘플 활동 B"] },
        { activityId: actId["샘플 활동 C"] },
      ],
    });
  }
  await post(owner, `/academies/a_test/versions/${versionId}/publish`);
  // 게시 안 된 버전(적용 거부용)
  const prog2 = await j<{ versionId: string }>(await post(owner, "/academies/a_test/programs", {
    name: "초안 프로그램", modes: ["EXPERIENCE"],
  }));
  draftVersionId = prog2.versionId;

  /* 반 + 수업(월 14:00) + 코치 담당 + 출결 */
  const cls = await j<{ classId: string }>(await post(owner, "/academies/a_test/classes", {
    name: "샘플 반", scheduleType: "FIXED_WEEKLY", capacity: 12, coachUserId: coach.userId,
    slots: [{ weekday: 1, startTime: "14:00", endTime: "15:00" }],
  }));
  classId = cls.classId;
  await post(owner, `/academies/a_test/classes/${classId}/sessions/generate`, {
    rangeStart: "2026-07-20", rangeEnd: "2026-07-26",
  });
  const sessions = await j<{ sessions: { sessionId: string }[] }>(
    await get(owner, `/academies/a_test/classes/${classId}/sessions`));
  sessionId = sessions.sessions[0].sessionId;
  // 출결: p1 출석 · p2 지각 · p3 결석 (p4 는 기록 없음 — 코치 예외 추가 대상)
  await db.insert(s.attendanceRecords).values([
    { id: "ar1", academyId: "a_test", sessionId, participantId: "p1", status: "PRESENT", recordedByUserId: coach.userId },
    { id: "ar2", academyId: "a_test", sessionId, participantId: "p2", status: "LATE", recordedByUserId: coach.userId },
    { id: "ar3", academyId: "a_test", sessionId, participantId: "p3", status: "ABSENT", recordedByUserId: coach.userId },
  ]);
});

test("반 적용 — PUBLISHED 만 · 중복 적용 422 · outbox", async () => {
  const draft = await post(owner, `/academies/a_test/classes/${classId}/program-assignments`, {
    programVersionId: draftVersionId, effectiveFrom: "2026-07-20",
  });
  assert.equal(draft.status, 422); // 게시 안 된 버전 거부
  const r = await post(owner, `/academies/a_test/classes/${classId}/program-assignments`, {
    programVersionId: versionId, effectiveFrom: "2026-07-20",
  });
  assert.equal(r.status, 201);
  assignmentId = (await j<{ assignmentId: string }>(r)).assignmentId;
  const dup = await post(owner, `/academies/a_test/classes/${classId}/program-assignments`, {
    programVersionId: versionId, effectiveFrom: "2026-07-21",
  });
  assert.equal(dup.status, 422); // ACTIVE 중복
  const obx = await db.select().from(s.outboxEvents)
    .where(eq(s.outboxEvents.eventType, "CLASS_PROGRAM_ASSIGNED"));
  assert.equal(obx.length, 1);
});

test("오늘 계획 — 담당 코치 조회(1주 차 제안) · 비담당 코치 403", async () => {
  const forbidden = await get(coach2, `/academies/a_test/sessions/${sessionId}/plan`);
  assert.equal(forbidden.status, 403);
  const r = await get(coach, `/academies/a_test/sessions/${sessionId}/plan`);
  assert.equal(r.status, 200);
  const body = await j<{ plans: { assignmentId: string; planned: boolean; curriculumSession?: { name: string }; activities: { name: string }[] }[] }>(r);
  assert.equal(body.plans.length, 1);
  assert.equal(body.plans[0].planned, false);
  assert.equal(body.plans[0].curriculumSession?.name, "1분기 1주 차"); // 다음 회차 제안
  assert.equal(body.plans[0].activities.length, 3);
});

test("계획 확정 — 기본=다음 회차 · 멱등", async () => {
  const r = await post(coach, `/academies/a_test/sessions/${sessionId}/plan`, { assignmentId });
  assert.equal(r.status, 201);
  planId = (await j<{ planId: string }>(r)).planId;
  const again = await post(coach, `/academies/a_test/sessions/${sessionId}/plan`, { assignmentId });
  assert.equal(again.status, 201);
  assert.equal((await j<{ planId: string }>(again)).planId, planId); // 같은 계획(멱등)
});

test("결과 확정 → 경험 이벤트: 출결 기본 반영 + 예외 수정 + NOT_DONE 무경험 + REPLACED 대체 영역", async () => {
  const r = await post(coach, `/academies/a_test/session-plans/${planId}/results`, {
    results: [
      { activityRevisionId: actRev["샘플 활동 A"], result: "COMPLETED" },                        // 균형+이동
      { activityRevisionId: actRev["샘플 활동 B"], result: "REPLACED",
        replacementActivityRevisionId: actRev["샘플 활동 D"], coachNote: "우천 대체" },          // → 조작
      { activityRevisionId: actRev["샘플 활동 C"], result: "NOT_DONE" },                         // 경험 없음
    ],
    participantOverrides: [
      { participantId: "p2", participation: "NOT_PARTICIPATED" }, // 지각이지만 코치가 제외
      { participantId: "p4", participation: "OBSERVED" },          // 출결 밖 원생 예외 추가
    ],
  });
  assert.equal(r.status, 200);
  const body = await j<{ participants: number; experienceEvents: number }>(r);
  // 참여: p1(FULL) + p4(OBSERVED) = 2명 · 활동 A(2영역)+D(1영역) = 3 → 이벤트 6
  assert.equal(body.participants, 2);
  assert.equal(body.experienceEvents, 6);
  const events = await db.select().from(s.participantExperienceEvents);
  assert.equal(events.length, 6);
  assert.equal(events.filter((e) => e.participantId === "p2").length, 0); // 예외 제외
  assert.equal(events.filter((e) => e.participantId === "p3").length, 0); // 결석 = 없음
  const p4Events = events.filter((e) => e.participantId === "p4");
  assert.equal(p4Events.length, 3);
  assert.equal(p4Events.every((e) => e.participation === "OBSERVED"), true);
  // REPLACED: 대체 활동 D 의 영역(조작)으로 기록 — 원래 B(이동) PRIMARY 단독 이벤트는 없음
  assert.equal(events.filter((e) => e.activityRevisionId === actRev["샘플 활동 D"]).length, 2);
  assert.equal(events.filter((e) => e.activityRevisionId === actRev["샘플 활동 B"]).length, 0);
});

test("재확정 — 결과 갱신·이벤트는 중복 생성 0(UNIQUE append-only)", async () => {
  const r = await post(coach, `/academies/a_test/session-plans/${planId}/results`, {
    results: [{ activityRevisionId: actRev["샘플 활동 A"], result: "COMPLETED", coachNote: "재확정" }],
    participantOverrides: [
      { participantId: "p2", participation: "NOT_PARTICIPATED" },
      { participantId: "p4", participation: "OBSERVED" },
    ],
  });
  assert.equal(r.status, 200);
  assert.equal((await j<{ experienceEvents: number }>(r)).experienceEvents, 0); // 전부 중복 차단
  const events = await db.select().from(s.participantExperienceEvents);
  assert.equal(events.length, 6); // 그대로
});

test("경험지도 — 경험 횟수·다양성·최근성(점수 아님)", async () => {
  const r = await get(owner, "/academies/a_test/participants/p1/experience-map");
  assert.equal(r.status, 200);
  const map = await j<{
    totalSessions: number;
    domains: { name: string; experienceCount: number; distinctActivities: number }[];
  }>(r);
  assert.equal(map.totalSessions, 1);
  assert.equal(map.domains.length, 3); // 균형·이동·조작
  const balance = map.domains.find((d) => d.name === "테스트 균형")!;
  assert.equal(balance.experienceCount, 1);
  assert.equal(balance.distinctActivities, 1);
  // 점수 필드가 없다 — 경험≠숙련(docs/20 §2)
  assert.equal("score" in map.domains[0], false);
});

test("경계: 비담당 코치 결과 확정 403 · 교차 테넌트 404", async () => {
  const forbidden = await post(coach2, `/academies/a_test/session-plans/${planId}/results`, {
    results: [{ activityRevisionId: actRev["샘플 활동 A"], result: "COMPLETED" }],
  });
  assert.equal(forbidden.status, 403);
  const cross = await get(otherOwner, "/academies/a_other/participants/p1/experience-map");
  assert.equal(cross.status, 404);
  const crossPlan = await post(otherOwner, `/academies/a_other/session-plans/${planId}/results`, {
    results: [{ activityRevisionId: actRev["샘플 활동 A"], result: "COMPLETED" }],
  });
  assert.equal(crossPlan.status, 404);
});
