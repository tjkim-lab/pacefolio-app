/* AudienceFilter 2단계 통합 테스트 — 실 HTTP × PGlite
   공용 리졸버(반·코치·요일·상태·미납, 축 내 OR·축 간 AND) · staff 전용 ·
   테넌트 격리 · CSV 감사 기록 · 공지 audienceFilter 수신자 정합. */
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

interface PreviewBody {
  members: { participantId: string; name: string; status: string; classNames: string[]; unpaid: boolean }[];
  total: number; guardianRecipients: number;
}
const preview = async (filter: unknown): Promise<PreviewBody> => {
  const r = await post(owner, "/academies/a_wg/audience/preview", filter);
  assert.equal(r.status, 200);
  return (await r.json()) as PreviewBody;
};
const names = (b: PreviewBody) => b.members.map((m) => m.name).sort();

let owner: Actor, coach1: Actor, coach2: Actor, guardian1: Actor, guardian2: Actor;
let clsMon = "", clsSat = "";

before(async () => {
  const client = new PGlite();
  db = drizzle(client);
  await migrate(db, { migrationsFolder });
  app = createApp({
    db, providers: { kakao: fake }, allowedOrigins: [ORIGIN],
    redirectUri: "http://x/cb", now: () => NOW, secureCookies: false,
  });
  await db.insert(s.academies).values([
    {
      id: "a_wg", organizationId: "o", name: "원더짐", themeColor: "#12B5A5", themeInk: "#087F73",
      logoEmoji: "🐯", ownerName: "김도윤", billingCycleDefault: 3,
    },
    {
      id: "a_x", organizationId: "o2", name: "타학원", themeColor: "#000000", themeInk: "#000000",
      logoEmoji: "🦊", ownerName: "남", billingCycleDefault: 3,
    },
  ]);
  owner = await login("owner"); coach1 = await login("coach1"); coach2 = await login("coach2");
  guardian1 = await login("guardian1"); guardian2 = await login("guardian2");
  await db.insert(s.academyMemberships).values([
    { id: "m_o", userId: owner.userId, academyId: "a_wg", roles: ["OWNER"], status: "ACTIVE", joinedAt: "2024-03-01" },
    { id: "m_c1", userId: coach1.userId, academyId: "a_wg", roles: ["COACH"], status: "ACTIVE", joinedAt: "2024-08-01" },
    { id: "m_c2", userId: coach2.userId, academyId: "a_wg", roles: ["COACH"], status: "ACTIVE", joinedAt: "2024-08-01" },
  ]);
  // 반: 월수반(coach1) · 토요반(coach2)
  for (const [name, coach, slots] of [
    ["플레이2 월수반", coach1, [{ weekday: 1, startTime: "15:00", endTime: "16:00" }, { weekday: 3, startTime: "15:00", endTime: "16:00" }]],
    ["축구 토요반", coach2, [{ weekday: 6, startTime: "10:00", endTime: "11:30" }]],
  ] as const) {
    const r = await post(owner, "/academies/a_wg/classes", {
      name, scheduleType: "FIXED_WEEKLY", capacity: 12, coachUserId: coach.userId, slots: [...slots],
    });
    assert.equal(r.status, 201);
    const id = ((await r.json()) as { classId: string }).classId;
    if (!clsMon) clsMon = id; else clsSat = id;
  }
  // 원생: p1(재원·월수반·미납) p2(재원·토요반·완납) p3(휴원·무배정) p4(체험·월수반)
  await db.insert(s.participants).values([
    { id: "p1", academyId: "a_wg", name: "서지우", birth: "2018-01-01", ageLabel: "8세", status: "ENROLLED" },
    { id: "p2", academyId: "a_wg", name: "이수아", birth: "2017-02-02", ageLabel: "9세", status: "ENROLLED" },
    { id: "p3", academyId: "a_wg", name: "박민준", birth: "2016-03-03", ageLabel: "10세", status: "ON_BREAK" },
    { id: "p4", academyId: "a_wg", name: "최이안", birth: "2019-04-04", ageLabel: "7세", status: "TRIAL" },
    { id: "px", academyId: "a_x", name: "남의집아이", birth: "2018-05-05", ageLabel: "8세", status: "ENROLLED" },
  ]);
  // 타학원 반·배정 — 테넌트 격리 표적
  await db.insert(s.dbClasses).values({
    id: "cls_x", academyId: "a_x", name: "타학원반", scheduleType: "FIXED_WEEKLY", capacity: 10,
  });
  await db.insert(s.classScheduleSlots).values({
    id: "slot_x", classId: "cls_x", academyId: "a_x", weekday: 1, startTime: "15:00", endTime: "16:00",
  });
  await db.insert(s.dbEnrollments).values([
    { id: "en1", academyId: "a_wg", classId: clsMon, participantId: "p1", status: "ACTIVE", startDate: "2026-08-01" },
    { id: "en2", academyId: "a_wg", classId: clsSat, participantId: "p2", status: "ACTIVE", startDate: "2026-08-01" },
    { id: "en4", academyId: "a_wg", classId: clsMon, participantId: "p4", status: "ACTIVE", startDate: "2026-08-20" },
    { id: "en_x", academyId: "a_x", classId: "cls_x", participantId: "px", status: "ACTIVE", startDate: "2026-08-01" },
  ]);
  // 청구: p1 미납(ISSUED) · p2 완납(PAID)
  await db.insert(s.billingPeriods).values({
    id: "bp1", academyId: "a_wg", periodStart: "2026-09-01", periodEnd: "2026-11-30", cycleMonths: 3,
  });
  await db.insert(s.invoices).values([
    { id: "inv1", academyId: "a_wg", participantId: "p1", enrollmentId: "en1", billingPeriodId: "bp1", status: "ISSUED", total: 480000, dueDate: "2026-09-10" },
    { id: "inv2", academyId: "a_wg", participantId: "p2", enrollmentId: "en2", billingPeriodId: "bp1", status: "PAID", total: 450000, dueDate: "2026-09-10" },
  ]);
  // 보호자: g1=VERIFIED(p1) · g2=PENDING(p2 — 수신자 아님)
  await db.insert(s.guardians).values([
    { id: "g1", userId: guardian1.userId },
    { id: "g2", userId: guardian2.userId },
  ]);
  await db.insert(s.guardianParticipantLinks).values([
    {
      id: "gl1", guardianId: "g1", participantId: "p1", academyId: "a_wg",
      relationshipType: "MOTHER", isPrimaryGuardian: true, verificationStatus: "VERIFIED",
      canViewSchedule: true, canViewAttendance: true, canViewHealthInfo: false,
      canReceivePhotos: true, canPay: true, canRequestRefund: true,
    },
    {
      id: "gl2", guardianId: "g2", participantId: "p2", academyId: "a_wg",
      relationshipType: "FATHER", isPrimaryGuardian: true, verificationStatus: "PENDING",
      canViewSchedule: true, canViewAttendance: true, canViewHealthInfo: false,
      canReceivePhotos: true, canPay: true, canRequestRefund: true,
    },
  ]);
});

test("staff 전용: 코치 preview·export 403 · 잘못된 body 422", async () => {
  assert.equal((await post(coach1, "/academies/a_wg/audience/preview", {})).status, 403);
  assert.equal((await post(coach1, "/academies/a_wg/audience/export", {})).status, 403);
  assert.equal((await post(owner, "/academies/a_wg/audience/preview", { weekdays: [7] })).status, 422);
  assert.equal((await post(owner, "/academies/a_wg/audience/preview", { statuses: ["X"] })).status, 422);
});

test("빈 필터 = 학원 전원 · 수신자는 VERIFIED 보호자만 · 타학원 원생 미포함", async () => {
  const b = await preview({});
  assert.equal(b.total, 4);
  assert.deepEqual(names(b), ["박민준", "서지우", "이수아", "최이안"]);
  assert.equal(b.guardianRecipients, 1); // g1 VERIFIED 만 — PENDING 은 수신자 아님
  assert.ok(!b.members.some((m) => m.name === "남의집아이"));
});

test("축별 필터: 반·코치·요일·미납·상태", async () => {
  assert.deepEqual(names(await preview({ classIds: [clsMon] })), ["서지우", "최이안"]);
  assert.deepEqual(names(await preview({ coachUserIds: [coach2.userId] })), ["이수아"]);
  assert.deepEqual(names(await preview({ weekdays: [6] })), ["이수아"]);
  assert.deepEqual(names(await preview({ unpaidOnly: true })), ["서지우"]);
  assert.deepEqual(names(await preview({ statuses: ["ON_BREAK"] })), ["박민준"]);
});

test("축 내 OR · 축 간 AND — 웹 _audience 와 같은 의미론", async () => {
  // 축 내 OR: 월(1)+토(6) = 월수반 원생 ∪ 토요반 원생
  assert.deepEqual(names(await preview({ weekdays: [1, 6] })), ["서지우", "이수아", "최이안"]);
  // 축 간 AND: 월수반 ∩ 재원 = 체험(최이안) 제외
  assert.deepEqual(names(await preview({ classIds: [clsMon], statuses: ["ENROLLED"] })), ["서지우"]);
  // 반 + 미납: 토요반 ∩ 미납 = 없음
  assert.equal((await preview({ classIds: [clsSat], unpaidOnly: true })).total, 0);
});

test("테넌트 격리: 타학원 반 ID 필터 = 0명(교차 매칭 금지)", async () => {
  assert.equal((await preview({ classIds: ["cls_x"] })).total, 0);
});

test("CSV export: 명단·미납 표기 + 감사 기록(명단 원문 미포함)", async () => {
  const r = await post(owner, "/academies/a_wg/audience/export", { unpaidOnly: true });
  assert.equal(r.status, 200);
  const b = (await r.json()) as { filename: string; rowCount: number; csv: string };
  assert.equal(b.rowCount, 1);
  assert.ok(b.filename.endsWith(".csv"));
  assert.ok(b.csv.startsWith("\uFEFF")); // 엑셀 한글 BOM
  assert.ok(b.csv.includes("이름,연령,상태,반,미납"));
  assert.ok(b.csv.includes("서지우,8세,재원,플레이2 월수반,미납"));
  const audits = await db.select().from(s.auditLogs).where(and(
    eq(s.auditLogs.academyId, "a_wg"), eq(s.auditLogs.action, "audience.exported"),
  ));
  assert.equal(audits.length, 1);
  const detail = JSON.parse(audits[0].detail!) as { rowCount: number; filter: { unpaidOnly: boolean } };
  assert.equal(detail.rowCount, 1);
  assert.equal(detail.filter.unpaidOnly, true);
  assert.ok(!audits[0].detail!.includes("서지우")); // 감사엔 명단 원문 없음
});

test("공지 audienceFilter: 수신자 = 매칭 원생의 VERIFIED 보호자 (preview 와 정합)", async () => {
  const r = await post(owner, "/academies/a_wg/notices", {
    title: "월수반 안내", body: "월수반 대상 안내입니다.", audience: "월수반",
    audienceFilter: { classIds: [clsMon] },
  });
  assert.equal(r.status, 201);
  const b = (await r.json()) as { noticeId: string; recipients: number };
  assert.equal(b.recipients, 1); // p1 보호자 g1 만 — p4 는 연결 보호자 없음
  const receipts = await db.select().from(s.noticeReceipts)
    .where(eq(s.noticeReceipts.noticeId, b.noticeId));
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].userId, guardian1.userId);
});

test("공지 audienceFilter: 코치는 발행 403(리졸버 권한도 fail-closed)", async () => {
  assert.equal((await post(coach1, "/academies/a_wg/notices", {
    title: "x", body: "y", audience: "전체", audienceFilter: {},
  })).status, 403);
});
