/* 기술·클리어·뱃지 PS5 통합 테스트 — 지시서 §13 E2E 2(인라인 S형)를 중립 데이터로.
   원장 PC 단계·기술·기준·뱃지 생성 → 게시 → 같은 반 아이별 다른 진도 →
   코치 클리어 확정(기준 필수) → 뱃지 1회 발급 → 보호자 알림 → 정정 이력.
   불변식: 연습만으로 자동 클리어 불가 · 비담당/권한 종료 코치 차단 ·
   뱃지 중복 발급 DB 차단 · 정정 후 재발급 가능(이력 보존). */
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

let owner: Actor, coach: Actor, coach2: Actor, guardianUser: Actor, otherOwner: Actor;
let versionId = "";
let levelId = "";
let skill1 = "", skill2 = "";
let crit: string[] = [];   // skill1 기준 id (required 2 + optional 1)
let awardId = "";

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
  coach2 = await login("coach2");
  guardianUser = await login("guardian");
  otherOwner = await login("other");
  await db.insert(s.academyMemberships).values([
    { id: "m_o", userId: owner.userId, academyId: "a_test", roles: ["OWNER"], status: "ACTIVE", joinedAt: "2024-03-01" },
    { id: "m_c", userId: coach.userId, academyId: "a_test", roles: ["COACH"], status: "ACTIVE", joinedAt: "2024-08-01" },
    { id: "m_c2", userId: coach2.userId, academyId: "a_test", roles: ["COACH"], status: "ACTIVE", joinedAt: "2024-08-01" },
    { id: "m_g", userId: guardianUser.userId, academyId: "a_test", roles: ["GUARDIAN"], status: "ACTIVE", joinedAt: "2025-01-01" },
    { id: "m_x", userId: otherOwner.userId, academyId: "a_other", roles: ["OWNER"], status: "ACTIVE", joinedAt: "2024-01-01" },
  ]);
  await db.insert(s.participants).values([
    { id: "p1", academyId: "a_test", name: "샘플 원생 1", birth: "2017-01-01", ageLabel: "8세" },
    { id: "p2", academyId: "a_test", name: "샘플 원생 2", birth: "2017-02-01", ageLabel: "8세" },
    { id: "p3", academyId: "a_test", name: "샘플 원생 3", birth: "2017-03-01", ageLabel: "8세" },
  ]);
  // 보호자(p1·VERIFIED) — 클리어 알림 수신 대상
  await db.insert(s.guardians).values({ id: "gd_1", userId: guardianUser.userId });
  await db.insert(s.guardianParticipantLinks).values({
    id: "gl_1", guardianId: "gd_1", participantId: "p1", academyId: "a_test",
    relationshipType: "MOTHER", isPrimaryGuardian: true, verificationStatus: "VERIFIED",
    canViewSchedule: true, canViewAttendance: true, canViewHealthInfo: false,
    canReceivePhotos: true, canPay: true, canRequestRefund: false,
  });
  // 프로그램(SKILL_MASTERY): 단계 + 기술은 DRAFT 에서 만들고 게시
  const prog = await j<{ versionId: string }>(await post(owner, "/academies/a_test/programs", {
    name: "샘플 기술 프로그램", modes: ["SKILL_MASTERY"],
  }));
  versionId = prog.versionId;
  const lv = await j<{ levelId: string }>(await post(owner, `/academies/a_test/versions/${versionId}/levels`, {
    name: "샘플 단계 S",
  }));
  levelId = lv.levelId;
  // 반 + 담당 코치 + 등록(코치-원생 담당 판정의 근거)
  const cls = await j<{ classId: string }>(await post(owner, "/academies/a_test/classes", {
    name: "샘플 기술반", scheduleType: "FIXED_WEEKLY", capacity: 12, coachUserId: coach.userId,
    slots: [{ weekday: 1, startTime: "16:00", endTime: "17:00" }],
  }));
  await db.insert(s.dbEnrollments).values([
    { id: "en1", academyId: "a_test", classId: cls.classId, participantId: "p1", status: "ACTIVE", startDate: "2026-03-01" },
    { id: "en2", academyId: "a_test", classId: cls.classId, participantId: "p2", status: "ACTIVE", startDate: "2026-03-01" },
    { id: "en3", academyId: "a_test", classId: cls.classId, participantId: "p3", status: "ACTIVE", startDate: "2026-03-01" },
  ]);
  (globalThis as Record<string, unknown>).__classId = cls.classId;
});

test("기술 생성(DRAFT) — 같은 단계 중복 이름 422 · 기준·뱃지 정의 · 게시 후 편집 422", async () => {
  const r1 = await post(owner, `/academies/a_test/versions/${versionId}/skills`, {
    programLevelId: levelId, name: "샘플 기술 1", recommendedPracticeMin: 2, recommendedPracticeMax: 6,
  });
  assert.equal(r1.status, 201);
  skill1 = (await j<{ skillId: string }>(r1)).skillId;
  const dup = await post(owner, `/academies/a_test/versions/${versionId}/skills`, {
    programLevelId: levelId, name: "샘플 기술 1",
  });
  assert.equal(dup.status, 422);
  const r2 = await post(owner, `/academies/a_test/versions/${versionId}/skills`, {
    programLevelId: levelId, name: "샘플 기술 2", previousSkillId: skill1,
  });
  assert.equal(r2.status, 201);
  skill2 = (await j<{ skillId: string }>(r2)).skillId;
  // 클리어 기준(필수 2 + 선택 1)
  const cr = await put(owner, `/academies/a_test/skills/${skill1}/criteria`, {
    criteria: [
      { label: "테스트 기준 A", required: true },
      { label: "테스트 기준 B", required: true },
      { label: "테스트 기준 C(선택)", required: false },
    ],
  });
  assert.equal(cr.status, 200);
  const badge = await post(owner, "/academies/a_test/badge-definitions", {
    skillId: skill1, name: "샘플 기술 1 뱃지",
  });
  assert.equal(badge.status, 201);
  // 게시 → 이후 기술 추가 불가
  await post(owner, `/academies/a_test/versions/${versionId}/publish`);
  const after = await post(owner, `/academies/a_test/versions/${versionId}/skills`, {
    programLevelId: levelId, name: "게시 후 기술",
  });
  assert.equal(after.status, 422);
  const list = await j<{ skills: { criteria: unknown[] }[] }>(
    await get(owner, `/academies/a_test/versions/${versionId}/skills`));
  crit = (list.skills[0].criteria as { criterionId: string; required: boolean }[])
    .filter((c) => c.required).map((c) => c.criterionId);
  assert.equal(crit.length, 2);
});

test("같은 반 아이별 다른 진도 — 연습 기록·CLEARED 관찰값 거부·비담당 403", async () => {
  // p1: 2회(PRACTICING → READY_FOR_CLEARANCE) / p2: 1회(ASSISTED) / p3: 없음
  const r1 = await post(coach, `/academies/a_test/participants/p1/skills/${skill1}/practice`, { result: "PRACTICING" });
  assert.equal(r1.status, 200);
  const r2 = await post(coach, `/academies/a_test/participants/p1/skills/${skill1}/practice`, { result: "READY_FOR_CLEARANCE" });
  assert.equal((await j<{ practiceCount: number; status: string }>(r2)).practiceCount, 2);
  await post(coach, `/academies/a_test/participants/p2/skills/${skill1}/practice`, { result: "ASSISTED" });
  // CLEARED 는 관찰값이 아니다 — 연습으로 클리어 불가
  const cheat = await post(coach, `/academies/a_test/participants/p1/skills/${skill1}/practice`, { result: "CLEARED" });
  assert.equal(cheat.status, 422);
  // 비담당 코치 403
  const forbidden = await post(coach2, `/academies/a_test/participants/p1/skills/${skill1}/practice`, { result: "PRACTICING" });
  assert.equal(forbidden.status, 403);
  // 현황판: 아이별 다른 진도
  const board = await j<{ participants: { participantId: string; skills: { status: string }[] }[] }>(
    await get(coach, `/academies/a_test/classes/${(globalThis as Record<string, unknown>).__classId}/skill-board`));
  const byId = new Map(board.participants.map((x) => [x.participantId, x.skills]));
  assert.equal(byId.get("p1")![0].status, "READY_FOR_CLEARANCE");
  assert.equal(byId.get("p2")![0].status, "ASSISTED");
  assert.equal(byId.get("p3")!.length, 0);
});

test("자동 클리어 금지 — 필수 기준 미확인 422 · 확인 시 CLEARED+뱃지+outbox+보호자 알림(동일 tx)", async () => {
  const missing = await post(coach, `/academies/a_test/participants/p1/skills/${skill1}/clearance`, {
    checkedCriteriaIds: [crit[0]], // 필수 1개 누락
  });
  assert.equal(missing.status, 422);
  const r = await post(coach, `/academies/a_test/participants/p1/skills/${skill1}/clearance`, {
    checkedCriteriaIds: crit,
  });
  assert.equal(r.status, 200);
  const body = await j<{ alreadyCleared: boolean; badgeAwarded: boolean }>(r);
  assert.equal(body.alreadyCleared, false);
  assert.equal(body.badgeAwarded, true);
  const awards = await db.select().from(s.badgeAwards).where(eq(s.badgeAwards.participantId, "p1"));
  assert.equal(awards.length, 1);
  awardId = awards[0].id;
  const obx = await db.select().from(s.outboxEvents).where(eq(s.outboxEvents.eventType, "SKILL_BADGE_AWARDED"));
  assert.equal(obx.length, 1);
  // 보호자 인앱 알림(VERIFIED 링크) — 같은 tx 에서 생성됨
  const ntf = await db.select().from(s.inAppNotifications)
    .where(eq(s.inAppNotifications.userId, guardianUser.userId));
  assert.equal(ntf.length, 1);
  assert.ok(ntf[0].body.includes("샘플 기술 1"));
  const audit = await db.select().from(s.auditLogs).where(eq(s.auditLogs.action, "skill.cleared"));
  assert.equal(audit.length, 1);
});

test("뱃지 중복 발급 차단 — 재클리어 멱등·partial UNIQUE", async () => {
  const again = await post(coach, `/academies/a_test/participants/p1/skills/${skill1}/clearance`, {
    checkedCriteriaIds: crit,
  });
  assert.equal((await j<{ alreadyCleared: boolean }>(again)).alreadyCleared, true);
  // progress 를 되돌려도(가정 상황) 활성 뱃지가 있으면 발급 0 — DB partial UNIQUE
  await db.update(s.participantSkillProgress).set({ status: "PRACTICING", clearedAt: null })
    .where(and(eq(s.participantSkillProgress.participantId, "p1"),
      eq(s.participantSkillProgress.skillId, skill1)));
  const reclear = await post(coach, `/academies/a_test/participants/p1/skills/${skill1}/clearance`, {
    checkedCriteriaIds: crit,
  });
  assert.equal((await j<{ badgeAwarded: boolean }>(reclear)).badgeAwarded, false); // 중복 차단
  const awards = await db.select().from(s.badgeAwards).where(eq(s.badgeAwards.participantId, "p1"));
  assert.equal(awards.length, 1);
});

test("정정 — 이력 보존(CORRECTED)·멱등·정정 후 재발급 가능", async () => {
  const byCoach = await post(coach, `/academies/a_test/badge-awards/${awardId}/correction`, { reason: "시도" });
  assert.equal(byCoach.status, 403); // 정정은 원장만
  const r = await post(owner, `/academies/a_test/badge-awards/${awardId}/correction`, { reason: "잘못 확정" });
  assert.equal(r.status, 200);
  const again = await post(owner, `/academies/a_test/badge-awards/${awardId}/correction`, { reason: "재시도" });
  assert.equal(again.status, 200); // 멱등
  const corrected = await db.select().from(s.badgeAwards).where(eq(s.badgeAwards.id, awardId));
  assert.equal(corrected[0].status, "CORRECTED");
  assert.equal(corrected[0].correctionReason, "잘못 확정"); // 첫 사유 보존
  const obx = await db.select().from(s.outboxEvents).where(eq(s.outboxEvents.eventType, "SKILL_BADGE_CORRECTED"));
  assert.equal(obx.length, 1);
  // 정정 후 재클리어 → 재발급 가능(AWARDED partial UNIQUE 는 활성만 잡음)
  await db.update(s.participantSkillProgress).set({ status: "PRACTICING", clearedAt: null })
    .where(and(eq(s.participantSkillProgress.participantId, "p1"),
      eq(s.participantSkillProgress.skillId, skill1)));
  const reclear = await post(coach, `/academies/a_test/participants/p1/skills/${skill1}/clearance`, {
    checkedCriteriaIds: crit,
  });
  assert.equal((await j<{ badgeAwarded: boolean }>(reclear)).badgeAwarded, true);
  const awards = await db.select().from(s.badgeAwards).where(eq(s.badgeAwards.participantId, "p1"));
  assert.equal(awards.length, 2); // CORRECTED 1 + AWARDED 1 — 이력 보존
});

test("뱃지북 — 기술 진행·획득 뱃지(점수 없음)", async () => {
  await post(coach, `/academies/a_test/participants/p1/skills/${skill2}/practice`, { result: "INTRODUCED" });
  const r = await j<{
    skills: { name: string; status: string; practiceCount: number }[];
    badges: { name: string }[];
  }>(await get(owner, "/academies/a_test/participants/p1/skill-book"));
  assert.equal(r.skills.length, 2);
  const s1 = r.skills.find((x) => x.name === "샘플 기술 1")!;
  assert.equal(s1.status, "CLEARED");
  assert.equal(r.badges.length, 1);
  assert.equal(r.badges[0].name, "샘플 기술 1 뱃지");
  assert.equal("score" in r.skills[0], false); // 경험≠점수와 동일 원칙
});

test("코치 권한 종료 후 클리어 차단(지시서 보안 §12) · 교차 테넌트 404", async () => {
  await db.update(s.classAssignments).set({ status: "ENDED", endDate: "2026-07-20" })
    .where(eq(s.classAssignments.coachUserId, coach.userId));
  const afterEnd = await post(coach, `/academies/a_test/participants/p2/skills/${skill1}/clearance`, {
    checkedCriteriaIds: crit,
  });
  assert.equal(afterEnd.status, 403); // 담당 종료 = 차단
  const cross = await get(otherOwner, "/academies/a_other/participants/p1/skill-book");
  assert.equal(cross.status, 404);
});
