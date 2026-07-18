/* 휴무 이벤트 → 회차 재계산 (#38) 통합 테스트 — 실 HTTP × PGlite
   "숫자 직접 수정 금지": event 등록 → 세션 취소 → 회차·일할 재계산 → 철회 시 선별 복원. */
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
const NOW = "2026-09-01T09:00:00.000Z"; // asOf = 2026-09-01
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

let owner: Actor, coach: Actor;
let closureId = "";

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
  await db.insert(s.academyMemberships).values([
    { id: "m_o", userId: owner.userId, academyId: "a_wg", roles: ["OWNER"], status: "ACTIVE", joinedAt: "2024-03-01" },
    { id: "m_c", userId: coach.userId, academyId: "a_wg", roles: ["COACH"], status: "ACTIVE", joinedAt: "2024-08-01" },
  ]);
  // 주2회(화목) 반 — 2026-09-01(화)~09-30: 화목 9회씩
  const cls = await post(owner, "/academies/a_wg/classes", {
    name: "화목반", scheduleType: "FIXED_WEEKLY", capacity: 12,
    slots: [
      { weekday: 2, startTime: "15:00", endTime: "16:00" },
      { weekday: 4, startTime: "15:00", endTime: "16:00" },
    ],
  });
  assert.equal(cls.status, 201);
  const clsId = ((await cls.json()) as { classId: string }).classId;
  (globalThis as Record<string, unknown>).clsId = clsId;
  await post(owner, `/academies/a_wg/classes/${clsId}/sessions/generate`, {
    rangeStart: "2026-09-01", rangeEnd: "2026-09-30",
  });
});

const clsId = () => (globalThis as Record<string, unknown>).clsId as string;

test("휴무 등록: 범위 내 SCHEDULED 취소 + closureId 추적 — 코치 403", async () => {
  assert.equal((await post(coach, "/academies/a_wg/closures", {
    scope: "ACADEMY", dateStart: "2026-09-08", dateEnd: "2026-09-10",
    closureType: "시설점검", reason: "매트 교체", deductSessions: true,
  })).status, 403);
  const r = await post(owner, "/academies/a_wg/closures", {
    scope: "ACADEMY", dateStart: "2026-09-08", dateEnd: "2026-09-10",
    closureType: "시설점검", reason: "매트 교체", deductSessions: true,
  });
  assert.equal(r.status, 201);
  const body = (await r.json()) as { closureId: string; canceledSessions: number };
  closureId = body.closureId;
  assert.equal(body.canceledSessions, 2); // 9/8(화)·9/10(목)
  const canceled = await db.select().from(s.classSessions).where(and(
    eq(s.classSessions.classId, clsId()), eq(s.classSessions.status, "CANCELED"),
  ));
  assert.equal(canceled.length, 2);
  assert.ok(canceled.every((x) => x.closureId === closureId));
});

test("회차 집계: CANCELED 는 모수 제외 — total 7 · canceled 2 · remaining 7", async () => {
  const stats = (await (await get(owner,
    `/academies/a_wg/classes/${clsId()}/session-stats?from=2026-09-01&to=2026-09-30`,
  )).json()) as { total: number; canceled: number; remaining: number };
  assert.equal(stats.total, 7);       // 9월 화목 9회 − 휴무 2회
  assert.equal(stats.canceled, 2);
  assert.equal(stats.remaining, 7);   // asOf 9/1 — 전부 미래
});

test("중간입회 일할(DB 세션 정본): 헌법 수식 = 남은/전체 × 요금", async () => {
  // 9/15 입회: 유효 7회 중 남은 = 15·17·22·24·29 = 5회
  const q = await post(owner, `/academies/a_wg/classes/${clsId()}/proration-quote`, {
    periodStart: "2026-09-01", periodEnd: "2026-09-30", joinDate: "2026-09-15", baseFee: 160_000,
  });
  assert.equal(q.status, 200);
  const body = (await q.json()) as { totalSessions: number; remainingSessions: number; amount: number; basis: string };
  assert.equal(body.basis, "DB_SESSIONS");
  assert.equal(body.totalSessions, 7);
  assert.equal(body.remainingSessions, 5);
  assert.equal(body.amount, Math.round((160_000 * body.remainingSessions) / 7)); // 수식 그대로
  // 코치는 견적 403(요금 정보 — staff 전용)
  assert.equal((await post(coach, `/academies/a_wg/classes/${clsId()}/proration-quote`, {
    periodStart: "2026-09-01", periodEnd: "2026-09-30", joinDate: "2026-09-15", baseFee: 160_000,
  })).status, 403);
});

test("세션 미전개 기간 견적(SLOT_CALENDAR): 시간표+유효 휴무 달력 — payment-engine 정합 경로", async () => {
  // 10월 휴무 1건(화요일 10/6 포함) 등록 후 10월 견적 — 세션은 미전개
  await post(owner, "/academies/a_wg/closures", {
    scope: "ACADEMY", dateStart: "2026-10-06", dateEnd: "2026-10-06",
    closureType: "공휴일", reason: "대체공휴일", deductSessions: true,
  });
  const q = (await (await post(owner, `/academies/a_wg/classes/${clsId()}/proration-quote`, {
    periodStart: "2026-10-01", periodEnd: "2026-10-31", joinDate: "2026-10-01", baseFee: 160_000,
  })).json()) as { totalSessions: number; basis: string; amount: number };
  assert.equal(q.basis, "SLOT_CALENDAR");
  // 10월 화목 = 9회 − 휴무(10/6 화) 1회 = 8회, 전 기간 입회 = 전액
  assert.equal(q.totalSessions, 8);
  assert.equal(q.amount, 160_000);
});

test("철회: 이 이벤트가 취소한 세션만 복원 — 다른 사유 취소 불변 · 멱등", async () => {
  // 별도 사유 단건 휴강(9/22) — 철회 대상 아님
  const sess = (await db.select().from(s.classSessions).where(and(
    eq(s.classSessions.classId, clsId()), eq(s.classSessions.date, "2026-09-22"),
  )))[0];
  await post(owner, `/academies/a_wg/sessions/${sess.id}/cancellation`, { reason: "코치 개인 사정" });
  // 휴무 철회 → 9/8·9/10 만 복원
  const rv = await post(owner, `/academies/a_wg/closures/${closureId}/revocation`);
  assert.equal(rv.status, 200);
  assert.equal(((await rv.json()) as { restoredSessions: number }).restoredSessions, 2);
  const after = await db.select().from(s.classSessions).where(and(
    eq(s.classSessions.classId, clsId()), eq(s.classSessions.status, "CANCELED"),
  ));
  const dates = after.map((x) => x.date).filter((d) => d >= "2026-09-01" && d <= "2026-09-30");
  assert.deepEqual(dates, ["2026-09-22"]); // 개인 사정 휴강만 남음
  // 멱등
  assert.equal(((await (await post(owner, `/academies/a_wg/closures/${closureId}/revocation`)).json()) as { restoredSessions: number }).restoredSessions, 0);
});

test("#40: 원생 목록(staff)·수납기간 멱등·견적→DRAFT 청구 초안 저장", async () => {
  // 원생 목록: staff OK(PII 미포함) · 코치 403
  await db.insert(s.participants).values({
    id: "p_mj", academyId: "a_wg", name: "이수아", birth: "2018-02-02", ageLabel: "8세",
  });
  const list = await get(owner, "/academies/a_wg/participants");
  assert.equal(list.status, 200);
  const rows = ((await list.json()) as { participants: { name: string }[] }).participants;
  assert.ok(rows.some((r) => r.name === "이수아"));
  assert.ok(!JSON.stringify(rows).includes("phone"));
  assert.equal((await get(coach, "/academies/a_wg/participants")).status, 403);
  // 수납기간 find-or-create 멱등
  const bp1 = await post(owner, "/academies/a_wg/billing-periods", {
    periodStart: "2026-09-01", periodEnd: "2026-11-30", cycleMonths: 3,
  });
  const bp2 = await post(owner, "/academies/a_wg/billing-periods", {
    periodStart: "2026-09-01", periodEnd: "2026-11-30", cycleMonths: 3,
  });
  const id1 = ((await bp1.json()) as { billingPeriodId: string }).billingPeriodId;
  const id2 = ((await bp2.json()) as { billingPeriodId: string }).billingPeriodId;
  assert.equal(id1, id2); // 같은 기간 = 같은 행
  // 견적(9월 유효 7회 · 9/15 입회 5회) → DRAFT 청구(일할+할인 라인)
  const q = (await (await post(owner, `/academies/a_wg/classes/${clsId()}/proration-quote`, {
    periodStart: "2026-09-01", periodEnd: "2026-09-30", joinDate: "2026-09-15", baseFee: 160_000,
  })).json()) as { amount: number; remainingSessions: number; totalSessions: number };
  const inv = await post(owner, "/academies/a_wg/invoices", {
    participantId: "p_mj", billingPeriodId: id1, dueDate: "2026-09-15",
    lines: [
      { type: "TUITION", label: `수강료 일할(${q.remainingSessions}/${q.totalSessions}회)`, amount: q.amount },
      { type: "DISCOUNT", label: "형제 20%", amount: -Math.round(q.amount * 0.2) },
    ],
  });
  assert.equal(inv.status, 201);
  const body = (await inv.json()) as { invoiceId: string; total: number };
  assert.equal(body.total, q.amount - Math.round(q.amount * 0.2)); // 서버 합산 = 일할 − 할인
  const row = (await db.select().from(s.invoices).where(eq(s.invoices.id, body.invoiceId)))[0];
  assert.equal(row.status, "DRAFT"); // 저장 = 초안, 발송은 issue 에서
});

test("#41: 그룹(반) 일괄 — 초안 전수(기존 청구 원생 제외) → 일괄 발행 · 코치 403", async () => {
  await db.insert(s.participants).values({
    id: "p_blk", academyId: "a_wg", name: "김하람", birth: "2017-05-05", ageLabel: "9세",
  });
  await db.insert(s.dbEnrollments).values([
    { id: "en_mj", academyId: "a_wg", classId: clsId(), participantId: "p_mj", status: "ACTIVE", startDate: "2026-09-15" },
    { id: "en_blk", academyId: "a_wg", classId: clsId(), participantId: "p_blk", status: "ACTIVE", startDate: "2026-09-01" },
  ]);
  // 멱등 find-or-create 로 같은 기간 id 재획득
  const bpId = ((await (await post(owner, "/academies/a_wg/billing-periods", {
    periodStart: "2026-09-01", periodEnd: "2026-11-30", cycleMonths: 3,
  })).json()) as { billingPeriodId: string }).billingPeriodId;
  assert.equal((await post(coach, `/academies/a_wg/classes/${clsId()}/bulk-invoice-drafts`, {
    billingPeriodId: bpId, dueDate: "2026-09-01", baseFee: 160_000,
  })).status, 403);
  // 초안 전수: p_blk 생성 1 · p_mj 는 #40 청구 보유라 제외
  const r1 = await post(owner, `/academies/a_wg/classes/${clsId()}/bulk-invoice-drafts`, {
    billingPeriodId: bpId, dueDate: "2026-09-01", baseFee: 160_000,
  });
  assert.equal(r1.status, 201);
  const d = (await r1.json()) as { created: number; skipped: number };
  assert.equal(d.created, 1);
  assert.equal(d.skipped, 1);
  // 일괄 발행: 반 원생의 이 기간 DRAFT 전부(p_blk 신규 + p_mj #40 초안) = 2건 ISSUED
  const r2 = await post(owner, `/academies/a_wg/classes/${clsId()}/bulk-invoice-issue`, { billingPeriodId: bpId });
  assert.equal(r2.status, 200);
  assert.equal(((await r2.json()) as { issued: number }).issued, 2);
  const rows = await db.select().from(s.invoices).where(eq(s.invoices.billingPeriodId, bpId));
  assert.ok(rows.length >= 2);
  assert.ok(rows.every((x) => x.status === "ISSUED"));
  // 멱등: 재발행 = 0건
  assert.equal(((await (await post(owner, `/academies/a_wg/classes/${clsId()}/bulk-invoice-issue`, { billingPeriodId: bpId })).json()) as { issued: number }).issued, 0);
});
