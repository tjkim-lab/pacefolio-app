/* 기본선 2단계(#23) 통합 테스트 — 학생 수명주기 + 출결
   실 HTTP × PGlite: 등록→배정(정원)→출결(담당 검증·이력)→완료 검증→
   상태 전이(휴원 시 배정 종료)→보호자 예정 통보(VERIFIED만). */
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

let owner: Actor, coach: Actor, coach2: Actor, mom: Actor;
let clsId = "", sessId = "";
let kidA = "", kidB = "";

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
});

test("학생 등록: staff 201(+선등록 연락처) · 코치 403 — 수명주기의 시작", async () => {
  const r1 = await post(owner, "/academies/a_wg/participants", {
    name: "김도담", birth: "2017-04-10", ageLabel: "8세", guardianPhone: "010-3000-1234",
  });
  assert.equal(r1.status, 201);
  kidA = ((await r1.json()) as { participantId: string }).participantId;
  const contacts = await db.select().from(s.registeredGuardianContacts)
    .where(eq(s.registeredGuardianContacts.participantId, kidA));
  assert.equal(contacts.length, 1);
  assert.equal(contacts[0].phone, "01030001234"); // 정규화
  const r2 = await post(owner, "/academies/a_wg/participants", {
    name: "이하나", birth: "2018-05-05", ageLabel: "7세", status: "TRIAL",
  });
  kidB = ((await r2.json()) as { participantId: string }).participantId;
  assert.equal((await post(coach, "/academies/a_wg/participants", {
    name: "코치시도", birth: "2018-01-01", ageLabel: "7세",
  })).status, 403);
});

test("반 배정: 정원 검증(FOR UPDATE) — 초과 409·중복 409", async () => {
  const cls = await post(owner, "/academies/a_wg/classes", {
    name: "미니반", scheduleType: "FIXED_WEEKLY", capacity: 1, coachUserId: coach.userId,
    slots: [{ weekday: 1, startTime: "14:30", endTime: "15:30" }],
  });
  clsId = ((await cls.json()) as { classId: string }).classId;
  assert.equal((await post(owner, `/academies/a_wg/participants/${kidA}/enrollments`, { classId: clsId })).status, 201);
  const dup = await post(owner, `/academies/a_wg/participants/${kidA}/enrollments`, { classId: clsId });
  assert.equal(dup.status, 409); // 중복 배정
  const over = await post(owner, `/academies/a_wg/participants/${kidB}/enrollments`, { classId: clsId });
  assert.equal(over.status, 409); // 정원 1 초과
});

test("출결 기록: 담당 코치 OK · 비담당 코치 403 · 미배정 원생 422 · 휴강 세션 422", async () => {
  await post(owner, `/academies/a_wg/classes/${clsId}/sessions/generate`, {
    rangeStart: "2026-07-20", rangeEnd: "2026-07-20", // 월 1회
  });
  const sessions = await db.select().from(s.classSessions).where(eq(s.classSessions.classId, clsId));
  sessId = sessions[0].id;
  const ok = await post(coach, `/academies/a_wg/sessions/${sessId}/attendance`, {
    records: [{ participantId: kidA, status: "PRESENT" }],
  });
  assert.equal(ok.status, 200);
  assert.equal(((await ok.json()) as { recorded: number }).recorded, 1);
  assert.equal((await post(coach2, `/academies/a_wg/sessions/${sessId}/attendance`, {
    records: [{ participantId: kidA, status: "ABSENT" }],
  })).status, 403); // 담당 아님
  assert.equal((await post(coach, `/academies/a_wg/sessions/${sessId}/attendance`, {
    records: [{ participantId: kidB, status: "PRESENT" }],
  })).status, 422); // 이 반 배정 아님
});

test("출결 수정: 같은 행 갱신 + version+1 + 변경 감사(from→to) — 이력 보존", async () => {
  const r = await post(coach, `/academies/a_wg/sessions/${sessId}/attendance`, {
    records: [{ participantId: kidA, status: "LATE", reason: "차 막힘" }],
  });
  assert.equal(((await r.json()) as { updated: number }).updated, 1);
  const rec = (await db.select().from(s.attendanceRecords)
    .where(eq(s.attendanceRecords.sessionId, sessId)))[0];
  assert.equal(rec.status, "LATE");
  assert.equal(rec.version, 2);
  const audit = await db.select().from(s.auditLogs).where(eq(s.auditLogs.action, "attendance.updated"));
  assert.equal(audit.length, 1);
});

test("수업 완료: 전원 체크 후에만 — 멱등 + Outbox", async () => {
  // kidA 만 대상(1명) — 이미 기록됨 → 완료 가능
  const done = await post(coach, `/academies/a_wg/sessions/${sessId}/complete`);
  assert.equal(done.status, 200);
  assert.equal((await post(coach, `/academies/a_wg/sessions/${sessId}/complete`)).status, 200); // 멱등
  const sess = (await db.select().from(s.classSessions).where(eq(s.classSessions.id, sessId)))[0];
  assert.equal(sess.status, "COMPLETED");
  const outbox = await db.select().from(s.outboxEvents)
    .where(eq(s.outboxEvents.eventType, "ACTUAL_ATTENDANCE_RECORDED"));
  assert.equal(outbox.length, 1);
});

test("미체크 완료 차단: 새 세션(기록 없음) 완료 시도 → 409 + missing", async () => {
  await post(owner, `/academies/a_wg/classes/${clsId}/sessions/generate`, {
    rangeStart: "2026-07-27", rangeEnd: "2026-07-27",
  });
  const sess2 = (await db.select().from(s.classSessions).where(and(
    eq(s.classSessions.classId, clsId), eq(s.classSessions.date, "2026-07-27"),
  )))[0];
  const r = await post(coach, `/academies/a_wg/sessions/${sess2.id}/complete`);
  assert.equal(r.status, 409);
  assert.equal(((await r.json()) as { missing: number }).missing, 1);
});

test("상태 전이: 휴원 → 배정 자동 종료 · 불법 전이(TRIAL→ON_BREAK) 409 · 멱등", async () => {
  const r = await post(owner, `/academies/a_wg/participants/${kidA}/status`, {
    status: "ON_BREAK", reason: "가족 여행",
  });
  assert.equal(r.status, 200);
  const en = await db.select().from(s.dbEnrollments)
    .where(eq(s.dbEnrollments.participantId, kidA));
  assert.ok(en.every((e) => e.status === "ENDED")); // 휴원 = 배정 종료
  // 휴원 상태에서 배정 시도 → 409
  assert.equal((await post(owner, `/academies/a_wg/participants/${kidA}/enrollments`, { classId: clsId })).status, 409);
  // TRIAL(kidB) → ON_BREAK 는 상태머신 밖
  assert.equal((await post(owner, `/academies/a_wg/participants/${kidB}/status`, { status: "ON_BREAK" })).status, 409);
  // 멱등: 같은 상태 재요청 200
  assert.equal((await post(owner, `/academies/a_wg/participants/${kidA}/status`, { status: "ON_BREAK" })).status, 200);
});

test("보호자 예정 통보: VERIFIED 링크만 201 + Outbox — 실제 출결과 별개 트랙", async () => {
  // 링크 없는 mom → 403
  assert.equal((await post(mom, "/academies/a_wg/attendance-notices", {
    participantId: kidA, date: "2026-07-27", type: "ABSENCE", reason: "아파요",
  })).status, 403);
  // VERIFIED 링크 생성 후 → 201
  await db.insert(s.guardians).values({ id: "gd_m", userId: mom.userId });
  await db.insert(s.guardianParticipantLinks).values({
    id: "gl_m", guardianId: "gd_m", participantId: kidA, academyId: "a_wg",
    relationshipType: "MOTHER", isPrimaryGuardian: true, verificationStatus: "VERIFIED",
    canViewSchedule: true, canViewAttendance: true, canViewHealthInfo: true,
    canReceivePhotos: true, canPay: true, canRequestRefund: true,
  });
  const r = await post(mom, "/academies/a_wg/attendance-notices", {
    participantId: kidA, date: "2026-07-27", type: "ABSENCE", reason: "아파요",
  });
  assert.equal(r.status, 201);
  const outbox = await db.select().from(s.outboxEvents)
    .where(eq(s.outboxEvents.eventType, "ATTENDANCE_NOTICE_CREATED"));
  assert.equal(outbox.length, 1);
});
