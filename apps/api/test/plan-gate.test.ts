/* 플랜 게이트(#49) 통합 테스트 — FREE/BASIC/PRO 3단 (FREE = 구독 행 없음).
   FREE 원생 상한(30명·퇴원 제외) · BASIC=반 일괄 청구 · PRO=CSV 가져오기·뱃지.
   402 PLAN_UPGRADE_REQUIRED 에 current/requiredPlan 동봉 — 화면 안내의 정본. */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { schema as s } from "@pacefolio/db";
import { FREE_PARTICIPANT_LIMIT, GATED_FEATURES } from "@pacefolio/domain";
import { createApp } from "../src/app";
import type { OAuthProvider } from "../src/auth/provider";

const migrationsFolder = join(
  dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "packages", "db", "migrations",
);
const NOW = "2026-07-19T15:00:00.000Z";
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

let owner: Actor;
const CSV = "이름,영역,설명\n활동A,균형,설명A";

before(async () => {
  const client = new PGlite();
  db = drizzle(client);
  await migrate(db, { migrationsFolder });
  app = createApp({
    db, providers: { kakao: fake }, allowedOrigins: [ORIGIN],
    redirectUri: "http://x/cb", now: () => NOW, secureCookies: false,
  });
  await db.insert(s.academies).values({
    id: "a_free", organizationId: "o", name: "무료학원", themeColor: "#12B5A5", themeInk: "#087F73",
    logoEmoji: "🏫", ownerName: "원장", billingCycleDefault: 3,
  }); // 구독 행 없음 = FREE
  owner = await login("owner");
  await db.insert(s.academyMemberships).values({
    id: "m_o", userId: owner.userId, academyId: "a_free", roles: ["OWNER"], status: "ACTIVE", joinedAt: "2024-03-01",
  });
});

test("FREE 원생 상한 — 30명까지 등록, 31번째 402(퇴원은 재적에서 제외)", async () => {
  for (let i = 1; i <= FREE_PARTICIPANT_LIMIT; i++) {
    const r = await post(owner, "/academies/a_free/participants", {
      name: `원생${i}`, birth: "2018-01-01", ageLabel: "8세",
    });
    assert.equal(r.status, 201, `원생${i} 등록 실패`);
  }
  const over = await post(owner, "/academies/a_free/participants", {
    name: "초과원생", birth: "2018-01-01", ageLabel: "8세",
  });
  assert.equal(over.status, 402);
  const body = (await over.json()) as { error: string; currentPlan: string; requiredPlan: string };
  assert.equal(body.error, "PLAN_UPGRADE_REQUIRED");
  assert.equal(body.currentPlan, "FREE");
  assert.equal(body.requiredPlan, "BASIC");
  // 퇴원 처리하면 자리가 난다 — 상한은 재적(WITHDRAWN 제외) 기준
  const first = (await db.select().from(s.participants).where(eq(s.participants.academyId, "a_free")))[0];
  await post(owner, `/academies/a_free/participants/${first.id}/status`, { status: "WITHDRAWN" });
  assert.equal((await post(owner, "/academies/a_free/participants", {
    name: "충원원생", birth: "2018-01-01", ageLabel: "8세",
  })).status, 201);
});

test("FREE — 반 일괄 청구(BASIC)·CSV 가져오기(PRO) 402, 수동 개별 운영은 허용", async () => {
  const cls = await post(owner, "/academies/a_free/classes", {
    name: "무료반", scheduleType: "FIXED_WEEKLY", capacity: 12,
    slots: [{ weekday: 1, startTime: "15:00", endTime: "16:00" }],
  });
  assert.equal(cls.status, 201); // 운영 코어는 FREE 부터 전부
  const clsId = ((await cls.json()) as { classId: string }).classId;

  const bulk = await post(owner, `/academies/a_free/classes/${clsId}/bulk-invoice-drafts`, {
    billingPeriodId: "bp_x", dueDate: "2026-09-01", baseFee: 100000,
  });
  assert.equal(bulk.status, 402);
  assert.equal(((await bulk.json()) as { requiredPlan: string }).requiredPlan, "BASIC");

  const imp = await post(owner, "/academies/a_free/imports", { fileName: "t.csv", csvText: CSV });
  assert.equal(imp.status, 402);
  assert.equal(((await imp.json()) as { requiredPlan: string }).requiredPlan, "PRO");
});

test("BASIC 승급 — 일괄 청구 열림 · PRO 전용(뱃지·가져오기)은 여전히 402", async () => {
  await db.insert(s.academySubscriptions).values({
    id: "sub_f", academyId: "a_free", plan: "BASIC", status: "ACTIVE",
    priceKrwMonthly: 29000, startedAt: NOW, createdAt: NOW, updatedAt: NOW,
  });
  const bp = await post(owner, "/academies/a_free/billing-periods", {
    periodStart: "2026-09-01", periodEnd: "2026-11-30", cycleMonths: 3,
  });
  const bpId = ((await bp.json()) as { billingPeriodId: string }).billingPeriodId;
  const cls = (await db.select().from(s.dbClasses).where(eq(s.dbClasses.academyId, "a_free")))[0];
  const bulk = await post(owner, `/academies/a_free/classes/${cls.id}/bulk-invoice-drafts`, {
    billingPeriodId: bpId, dueDate: "2026-09-10", baseFee: 100000,
  });
  assert.equal(bulk.status, 201); // BASIC = 일괄 청구 허용(대상 0명이어도 게이트는 통과)

  assert.equal((await post(owner, "/academies/a_free/imports", { fileName: "t.csv", csvText: CSV })).status, 402);
  assert.equal((await post(owner, "/academies/a_free/badge-definitions", {
    name: "테스트뱃지", criteria: "x",
  })).status, 402);
});

test("PRO 승급 — 전 게이트 통과 · CANCELED 는 FREE 로 강등", async () => {
  await db.update(s.academySubscriptions).set({ plan: "PRO", priceKrwMonthly: 99000 })
    .where(eq(s.academySubscriptions.academyId, "a_free"));
  const imp = await post(owner, "/academies/a_free/imports", { fileName: "t.csv", csvText: CSV });
  assert.notEqual(imp.status, 402); // 게이트 통과(본문 검증은 별개)

  await db.update(s.academySubscriptions).set({ status: "CANCELED" })
    .where(eq(s.academySubscriptions.academyId, "a_free"));
  assert.equal((await post(owner, "/academies/a_free/imports", { fileName: "t.csv", csvText: CSV })).status, 402);
});

/* ── #50: 기능 예외 grant — 영업 "한두 달 열어주기" ── */
let admin: Actor;

test("grant 발급 — FREE 학원에 PRO 기능이 열리고, 철회하면 즉시 잠긴다", async () => {
  // FREE 상태로 되돌림(CANCELED 유지) — 앞 테스트에서 CANCELED 로 끝남
  admin = await login("admin");
  await db.insert(s.academyMemberships).values({
    id: "m_adm", userId: admin.userId, academyId: "a_free", roles: ["PLATFORM_ADMIN"], status: "ACTIVE", joinedAt: "2024-01-01",
  });
  // 원장은 발급 불가(admin 경계 404 은닉)
  assert.equal((await post(owner, "/academies/a_free/../admin/academies/a_free/feature-grants", {
    feature: "PROGRAM_IMPORT", reason: "x",
  })).status, 404);

  // 발급: 사유 필수 · 60일
  assert.equal((await post(admin, "/admin/academies/a_free/feature-grants", {
    feature: "PROGRAM_IMPORT", reason: "", days: 60,
  })).status, 422);
  const g = await post(admin, "/admin/academies/a_free/feature-grants", {
    feature: "PROGRAM_IMPORT", reason: "영업 프로모션 2개월", days: 60,
  });
  assert.equal(g.status, 201);
  const { grantId, expiresAt } = (await g.json()) as { grantId: string; expiresAt: string };
  assert.ok(expiresAt > NOW);

  // FREE(CANCELED)인데 PRO 기능이 열림
  assert.notEqual((await post(owner, "/academies/a_free/imports", { fileName: "t.csv", csvText: CSV })).status, 402);

  // 철회 → 즉시 잠김(멱등)
  assert.equal((await post(admin, `/admin/academies/a_free/feature-grants/${grantId}/revocation`, {})).status, 200);
  assert.equal((await post(admin, `/admin/academies/a_free/feature-grants/${grantId}/revocation`, {})).status, 200);
  assert.equal((await post(owner, "/academies/a_free/imports", { fileName: "t.csv", csvText: CSV })).status, 402);
});

test("grant 만료 — 지난 만료일은 판정 시점에 자동 잠김(lazy) · 원생 상한 예외도 grant 로", async () => {
  // 만료된 grant 직접 삽입 — 판정에서 걸러져야 함
  await db.insert(s.academyFeatureGrants).values({
    id: "fg_expired", academyId: "a_free", feature: "BULK_BILLING",
    reason: "지난 프로모션", expiresAt: "2026-07-01T00:00:00.000Z",
    grantedByUserId: admin.userId, createdAt: "2026-06-01T00:00:00.000Z",
  });
  const cls = (await db.select().from(s.dbClasses).where(eq(s.dbClasses.academyId, "a_free")))[0];
  assert.equal((await post(owner, `/academies/a_free/classes/${cls.id}/bulk-invoice-drafts`, {
    billingPeriodId: "bp_x", dueDate: "2026-09-01", baseFee: 100000,
  })).status, 402);

  // 원생 무제한 grant → FREE 상한(30명) 해제
  const before = await post(owner, "/academies/a_free/participants", {
    name: "상한초과전", birth: "2018-01-01", ageLabel: "8세",
  });
  assert.equal(before.status, 402); // 30명 꽉 찬 상태(앞 테스트 30명 - 퇴원1 + 충원1)
  assert.equal((await post(admin, "/admin/academies/a_free/feature-grants", {
    feature: "UNLIMITED_PARTICIPANTS", reason: "지점 통합 이관 지원", days: 30,
  })).status, 201);
  assert.equal((await post(owner, "/academies/a_free/participants", {
    name: "상한해제후", birth: "2018-01-01", ageLabel: "8세",
  })).status, 201);

  // 목록: active 플래그 정합(만료됨 = false)
  const list = await app.request("/admin/academies/a_free/feature-grants", {
    headers: { cookie: admin.cookie },
  });
  const { grants } = (await list.json()) as { grants: { feature: string; active: boolean }[] };
  assert.equal(grants.find((x) => x.feature === "BULK_BILLING")?.active, false);
  assert.equal(grants.find((x) => x.feature === "UNLIMITED_PARTICIPANTS")?.active, true);
});

test("전 기능 체험(#50b) — 일괄 개방 후 만료로 자동 잠금(기간 필수)", async () => {
  // 기간 없이 = 422 (무기한 전체 개방은 플랜 지정으로)
  assert.equal((await post(admin, "/admin/academies/a_free/feature-grants/trial-all", {
    reason: "x",
  })).status, 422);
  // 90일 전 기능 개방 — PRO 전용(뱃지)까지 즉시 열림
  const r = await post(admin, "/admin/academies/a_free/feature-grants/trial-all", {
    reason: "신규 영업 체험 3개월", days: 90,
  });
  assert.equal(r.status, 201);
  const body = (await r.json()) as { granted: number; expiresAt: string };
  assert.equal(body.granted, GATED_FEATURES.length);
  assert.notEqual((await post(owner, "/academies/a_free/badge-definitions", {
    name: "체험뱃지", criteria: "x",
  })).status, 402);
  // 만료 시점을 지나게 조작 → 판정 시점 자동 잠금
  await db.update(s.academyFeatureGrants)
    .set({ expiresAt: "2026-07-01T00:00:00.000Z" })
    .where(eq(s.academyFeatureGrants.reason, "신규 영업 체험 3개월"));
  assert.equal((await post(owner, "/academies/a_free/badge-definitions", {
    name: "체험뱃지2", criteria: "x",
  })).status, 402);
});

test("402 안내 헬퍼(#50c) — 잠기는 순간을 사람 말로(판매 순간 카피)", async () => {
  const { ApiError, planUpgradeInfo } = await import("@pacefolio/api-client");
  const up = planUpgradeInfo(new ApiError(402, "PLAN_UPGRADE_REQUIRED", undefined, {
    feature: "BULK_BILLING", currentPlan: "FREE", requiredPlan: "BASIC",
  }));
  assert.ok(up);
  assert.match(up!.message, /BASIC 플랜부터 열려요/);
  assert.match(up!.message, /현재 무료/);
  assert.match(up!.message, /업그레이드하면 바로/);
  assert.equal(planUpgradeInfo(new ApiError(403, "FORBIDDEN")), null); // 402 만
  assert.equal(planUpgradeInfo(new Error("x")), null);
});
