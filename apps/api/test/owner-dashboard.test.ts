/* 원장 홈 "오늘 처리할 일"(#45) 통합 테스트 — 실 HTTP × PGlite
   공지 재알림(미열람만) · 미납 리마인드(canPay 보호자만·금액 미표시) ·
   긴급결석 통보 목록/원장 확인(멱등) + Outbox → 인앱 알림 매핑. */
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
const get = (a: Actor, path: string) => app.request(path, { headers: { cookie: a.cookie } });

let owner: Actor, coach: Actor, guardian: Actor;
let noticeId = "";
let anId = "";

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
  owner = await login("owner"); coach = await login("coach"); guardian = await login("mom");
  await db.insert(s.academyMemberships).values([
    { id: "m_o", userId: owner.userId, academyId: "a_wg", roles: ["OWNER"], status: "ACTIVE", joinedAt: "2024-03-01" },
    { id: "m_c", userId: coach.userId, academyId: "a_wg", roles: ["COACH"], status: "ACTIVE", joinedAt: "2024-08-01" },
    { id: "m_g", userId: guardian.userId, academyId: "a_wg", roles: ["GUARDIAN"], status: "ACTIVE", joinedAt: "2025-03-02" },
  ]);
  await db.insert(s.participants).values({
    id: "p_kid", academyId: "a_wg", name: "김도담", birth: "2017-04-10", ageLabel: "8세",
  });
  await db.insert(s.guardians).values({ id: "gd_mom", userId: guardian.userId });
  await db.insert(s.guardianParticipantLinks).values({
    id: "gl_kid", guardianId: "gd_mom", participantId: "p_kid", academyId: "a_wg",
    relationshipType: "MOTHER", isPrimaryGuardian: true, verificationStatus: "VERIFIED",
    canViewSchedule: true, canViewAttendance: true, canViewHealthInfo: true,
    canReceivePhotos: true, canPay: true, canRequestRefund: true,
  });
});

/* ── 공지 재알림 — 미열람 receipt 보유자에게만 ── */
test("공지 발행 → 미열람 1명 → 재알림 reminded=1 + Outbox→인앱", async () => {
  const pub = await post(owner, "/academies/a_wg/notices", {
    title: "가을 대회 참가 안내", body: "신청 받아요", audience: "전체",
  });
  assert.equal(pub.status, 201);
  noticeId = ((await pub.json()) as { noticeId: string }).noticeId;

  const r = await post(owner, `/academies/a_wg/notices/${noticeId}/remind`);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { reminded: 1 });

  await dispatchPendingOutbox(db, NOW);
  const ntf = await db.select().from(s.inAppNotifications).where(and(
    eq(s.inAppNotifications.userId, guardian.userId),
    eq(s.inAppNotifications.category, "ACADEMY_NOTICE"),
  ));
  assert.equal(ntf.length, 1);
  assert.ok(ntf[0].body.includes("가을 대회 참가 안내"));
});

test("재알림 권한 — 코치 403 / 없는 공지 422 / 전원 열람 시 reminded=0", async () => {
  assert.equal((await post(coach, `/academies/a_wg/notices/${noticeId}/remind`)).status, 403);
  assert.equal((await post(owner, "/academies/a_wg/notices/nt_ghost/remind")).status, 422);

  // 보호자 열람 → 재알림 대상 소멸(발송 없음)
  assert.equal((await post(guardian, `/academies/a_wg/notices/${noticeId}/read`)).status, 200);
  const r = await post(owner, `/academies/a_wg/notices/${noticeId}/remind`);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { reminded: 0 });
});

/* ── 미납 리마인드 — open 청구 원생의 VERIFIED·canPay 보호자 ── */
test("미납 리마인드 — ISSUED 청구 → 보호자 1명 인앱(금액 미표시)", async () => {
  await db.insert(s.billingPeriods).values({
    id: "bp_q4", academyId: "a_wg", periodStart: "2026-09-01", periodEnd: "2026-11-30", cycleMonths: 3,
  });
  await db.insert(s.invoices).values({
    id: "inv_kid", academyId: "a_wg", participantId: "p_kid", enrollmentId: "en_x",
    billingPeriodId: "bp_q4", status: "ISSUED", total: 405000, dueDate: "2026-09-10",
  });
  const r = await post(owner, "/academies/a_wg/billing/remind");
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { invoices: 1, guardians: 1, cooldown: false });

  await dispatchPendingOutbox(db, NOW);
  const ntf = await db.select().from(s.inAppNotifications).where(and(
    eq(s.inAppNotifications.userId, guardian.userId),
    eq(s.inAppNotifications.category, "BILLING_DUE"),
  ));
  assert.equal(ntf.length, 1);
  assert.ok(!ntf[0].body.includes("405"), "알림 본문에 금액 미표시(헌법)"); // 금액은 개인정보
  assert.equal((await post(coach, "/academies/a_wg/billing/remind")).status, 403);
});

/* 리뷰 P2: 당일 재발송 금지 — 같은 날 두 번째 리마인드는 cooldown(발송·인앱 없음) */
test("미납 리마인드 — 당일 2회차는 cooldown(재발송·인앱 없음)", async () => {
  const r = await post(owner, "/academies/a_wg/billing/remind"); // 위 테스트가 오늘 1회 발송함
  assert.deepEqual(await r.json(), { invoices: 1, guardians: 0, cooldown: true });
  await dispatchPendingOutbox(db, NOW);
  const ntf = await db.select().from(s.inAppNotifications).where(and(
    eq(s.inAppNotifications.userId, guardian.userId),
    eq(s.inAppNotifications.category, "BILLING_DUE"),
  ));
  assert.equal(ntf.length, 1, "재발송 안 됨 — 인앱은 여전히 1건");
});

test("미납 리마인드 — canPay=false 보호자는 제외", async () => {
  // cooldown 격리 — 이 테스트는 canPay 필터만 검증하므로 당일 발송 이력 제거
  await db.delete(s.auditLogs).where(eq(s.auditLogs.action, "billing.reminded"));
  await db.update(s.guardianParticipantLinks).set({ canPay: false })
    .where(eq(s.guardianParticipantLinks.id, "gl_kid"));
  const r = await post(owner, "/academies/a_wg/billing/remind");
  assert.deepEqual(await r.json(), { invoices: 1, guardians: 0, cooldown: false });
  await db.update(s.guardianParticipantLinks).set({ canPay: true })
    .where(eq(s.guardianParticipantLinks.id, "gl_kid"));
});

/* ── 긴급결석 통보 — 목록(staff)·원장 확인(멱등)·보호자 인앱 ── */
test("통보 목록 — staff 만 · 보호자 접수 건 노출", async () => {
  const cr = await post(guardian, "/academies/a_wg/attendance-notices", {
    participantId: "p_kid", date: "2026-09-01", type: "ABSENCE", reason: "아파요",
  });
  assert.equal(cr.status, 201);
  anId = ((await cr.json()) as { noticeId: string }).noticeId;

  assert.equal((await get(coach, "/academies/a_wg/attendance-notices")).status, 403);
  const ls = await get(owner, "/academies/a_wg/attendance-notices");
  assert.equal(ls.status, 200);
  const { notices } = await ls.json() as { notices: { noticeId: string; participantName: string; acknowledgedAt?: string }[] };
  assert.equal(notices.length, 1);
  assert.equal(notices[0].participantName, "김도담");
  assert.equal(notices[0].acknowledgedAt, undefined);
});

test("원장 확인 — 멱등(최초 시각 보존) + 보호자 '확인했어요' 인앱", async () => {
  assert.equal((await post(coach, `/academies/a_wg/attendance-notices/${anId}/ack`)).status, 403);

  const r1 = await post(owner, `/academies/a_wg/attendance-notices/${anId}/ack`);
  assert.equal(r1.status, 200);
  assert.deepEqual(await r1.json(), { noticeId: anId, alreadyAcknowledged: false });

  const r2 = await post(owner, `/academies/a_wg/attendance-notices/${anId}/ack`);
  assert.deepEqual(await r2.json(), { noticeId: anId, alreadyAcknowledged: true });

  const row = (await db.select().from(s.dbAttendanceNotices).where(eq(s.dbAttendanceNotices.id, anId)))[0];
  assert.equal(row.acknowledgedByUserId, owner.userId);
  assert.ok(row.acknowledgedAt);

  await dispatchPendingOutbox(db, NOW);
  const ntf = await db.select().from(s.inAppNotifications).where(and(
    eq(s.inAppNotifications.userId, guardian.userId),
    eq(s.inAppNotifications.category, "ATTENDANCE"),
  ));
  assert.equal(ntf.length, 1, "확인 2회여도 인앱은 1건(멱등 — outbox 는 최초 확인만)");

  assert.equal((await post(owner, "/academies/a_wg/attendance-notices/an_ghost/ack")).status, 422);
});

/* ── 원생 목록 동봉 필드(#51) — 반 이름(ACTIVE 배정)·미납 여부(open 청구) ── */
test("원생 목록(#51) — classNames·unpaid 동봉, 금액·연락처 미포함", async () => {
  await db.insert(s.dbClasses).values({
    id: "cls_p2", academyId: "a_wg", name: "플레이2 월수반",
    scheduleType: "FIXED_WEEKLY", capacity: 12, createdAt: NOW, updatedAt: NOW,
  });
  await db.insert(s.dbEnrollments).values({
    id: "en_kid", academyId: "a_wg", classId: "cls_p2", participantId: "p_kid",
    status: "ACTIVE", startDate: "2026-07-01", createdAt: NOW,
  });
  const r = await get(owner, "/academies/a_wg/participants");
  assert.equal(r.status, 200);
  const { participants } = await r.json() as {
    participants: { name: string; classNames: string[]; unpaid: boolean }[];
  };
  const kid = participants.find((p) => p.name === "김도담")!;
  assert.deepEqual(kid.classNames, ["플레이2 월수반"]);
  assert.equal(kid.unpaid, true); // inv_kid ISSUED — open 청구 존재
  const body = JSON.stringify(participants);
  assert.ok(!body.includes("405000"), "미납 여부만 — 금액 미포함");
  assert.ok(!body.includes("phone"), "PII 미포함 유지");
});

/* ── 원생 상세(#52·#53) — staff 전용·404 은닉·보호자 연락처 미포함·출석 집계 ── */
test("원생 상세(#52) — 반·코치·보호자 연결·출석 집계·청구 동봉, 코치 403·없음 404", async () => {
  await db.insert(s.classAssignments).values({
    id: "ca_kid", classId: "cls_p2", academyId: "a_wg",
    coachUserId: coach.userId, status: "ACTIVE", startDate: "2026-07-01", createdAt: NOW,
  });
  /* #53: 실제 출결 3회(출석·지각·결석) → 출석률 = (1+1)/3 = 67% */
  await db.insert(s.classSessions).values([
    { id: "ss1", classId: "cls_p2", academyId: "a_wg", date: "2026-08-25", startTime: "14:30", endTime: "15:30", createdAt: NOW, updatedAt: NOW },
    { id: "ss2", classId: "cls_p2", academyId: "a_wg", date: "2026-08-27", startTime: "14:30", endTime: "15:30", createdAt: NOW, updatedAt: NOW },
    { id: "ss3", classId: "cls_p2", academyId: "a_wg", date: "2026-09-01", startTime: "14:30", endTime: "15:30", createdAt: NOW, updatedAt: NOW },
  ]);
  await db.insert(s.attendanceRecords).values([
    { id: "ar1", academyId: "a_wg", sessionId: "ss1", participantId: "p_kid", status: "PRESENT", recordedByUserId: coach.userId, createdAt: NOW, updatedAt: NOW },
    { id: "ar2", academyId: "a_wg", sessionId: "ss2", participantId: "p_kid", status: "LATE", recordedByUserId: coach.userId, createdAt: NOW, updatedAt: NOW },
    { id: "ar3", academyId: "a_wg", sessionId: "ss3", participantId: "p_kid", status: "ABSENT", recordedByUserId: coach.userId, createdAt: NOW, updatedAt: NOW },
  ]);
  const r = await get(owner, "/academies/a_wg/participants/p_kid");
  assert.equal(r.status, 200);
  const d = await r.json() as {
    participant: { name: string; status: string };
    enrollments: { className: string; coachNames: string[] }[];
    guardians: { relationshipType: string; verificationStatus: string; canPay: boolean }[];
    attendance: { total: number; present: number; late: number; absent: number; ratePct: number | null };
    invoices: { status: string; total: number; lines: { label: string }[] }[];
  };
  assert.equal(d.attendance.total, 3);
  assert.equal(d.attendance.present, 1);
  assert.equal(d.attendance.late, 1);
  assert.equal(d.attendance.absent, 1);
  assert.equal(d.attendance.ratePct, 67); // 지각도 출석으로 센다
  assert.equal(d.participant.name, "김도담");
  assert.equal(d.enrollments.length, 1);
  assert.equal(d.enrollments[0].className, "플레이2 월수반");
  assert.equal(d.enrollments[0].coachNames.length, 1); // ACTIVE 배정 코치 이름
  assert.deepEqual(d.guardians, [{
    relationshipType: "MOTHER", isPrimaryGuardian: true,
    verificationStatus: "VERIFIED", canPay: true,
  }]);
  assert.equal(d.invoices.length, 1);
  assert.equal(d.invoices[0].total, 405000); // 원장 수납 화면 — 금액 포함
  assert.ok(!JSON.stringify(d.guardians).includes("phone"), "보호자 연락처·이름 미포함");

  assert.equal((await get(coach, "/academies/a_wg/participants/p_kid")).status, 403);
  assert.equal((await get(owner, "/academies/a_wg/participants/p_ghost")).status, 404);
});
