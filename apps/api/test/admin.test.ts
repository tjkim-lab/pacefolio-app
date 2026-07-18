/* Admin 백엔드 1차 통합 테스트 (#27) — 실 HTTP × PGlite
   경계 대칭(일반 역할 → admin 404 / PLATFORM_ADMIN → 일반 앱 403) ·
   구독 2플랜(29,000/99,000)·MRR 집계 · 학원 정지(세션 폐기+guard 차단) ·
   SupportView 수명주기(사유·만료·철회) · 전 액션 감사. */
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
  const sc = cb.headers.getSetCookie();
  return {
    cookie: sc.map((c) => c.split(";")[0]).join("; "),
    csrf: sc.find((c) => c.startsWith("pf_csrf="))!.split(";")[0].split("=")[1],
    userId,
  };
}
const req = (a: Actor, method: string, path: string, body?: unknown) =>
  app.request(path, {
    method,
    headers: {
      cookie: a.cookie, origin: ORIGIN, "x-csrf-token": a.csrf,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
const get = (a: Actor, path: string) =>
  app.request(path, { headers: { cookie: a.cookie } });

let admin: Actor, owner1: Actor, owner2: Actor;

before(async () => {
  const client = new PGlite();
  db = drizzle(client);
  await migrate(db, { migrationsFolder });
  app = createApp({
    db, providers: { kakao: fake }, allowedOrigins: [ORIGIN],
    redirectUri: "http://x/cb", now: () => NOW, secureCookies: false,
  });
  await db.insert(s.academies).values([
    { id: "a_wg", organizationId: "o1", name: "원더짐", themeColor: "#12B5A5", themeInk: "#087F73", logoEmoji: "🐯", ownerName: "김도윤", billingCycleDefault: 3 },
    { id: "a_b", organizationId: "o2", name: "B아카데미", themeColor: "#12B5A5", themeInk: "#087F73", logoEmoji: "🦁", ownerName: "이서준", billingCycleDefault: 1 },
  ]);
  admin = await login("tj"); owner1 = await login("owner1"); owner2 = await login("owner2");
  await db.insert(s.academyMemberships).values([
    { id: "m_adm", userId: admin.userId, academyId: "a_wg", roles: ["PLATFORM_ADMIN"], status: "ACTIVE", joinedAt: "2024-01-01" },
    { id: "m_o1", userId: owner1.userId, academyId: "a_wg", roles: ["OWNER"], status: "ACTIVE", joinedAt: "2024-03-01" },
    { id: "m_o2", userId: owner2.userId, academyId: "a_b", roles: ["OWNER"], status: "ACTIVE", joinedAt: "2025-01-01" },
  ]);
  await db.insert(s.participants).values([
    { id: "p1", academyId: "a_wg", name: "김도담", birth: "2017-04-10", ageLabel: "8세" },
    { id: "p2", academyId: "a_b", name: "이하나", birth: "2018-05-05", ageLabel: "7세", status: "TRIAL" },
  ]);
});

test("경계 대칭: 일반 원장 → /admin 404(은닉) · PLATFORM_ADMIN → 일반 학원 API 403", async () => {
  assert.equal((await get(owner1, "/admin/overview")).status, 404);
  assert.equal((await req(owner1, "PUT", "/admin/academies/a_wg/subscription", { plan: "PRO" })).status, 404);
  const r = await req(admin, "POST", "/academies/a_wg/participants", {
    name: "관리자시도", birth: "2018-01-01", ageLabel: "7세",
  });
  assert.equal(r.status, 403);
  assert.equal(((await r.json()) as { error: string }).error, "PLATFORM_ADMIN_SEPARATE_BOUNDARY");
});

test("구독 지정: 확정 가격 스냅샷(BASIC 29,000 / PRO 99,000) + 변경 + 감사", async () => {
  const r1 = await req(admin, "PUT", "/admin/academies/a_wg/subscription", { plan: "BASIC" });
  assert.equal(r1.status, 200);
  assert.equal(((await r1.json()) as { priceKrwMonthly: number }).priceKrwMonthly, 29000);
  const r2 = await req(admin, "PUT", "/admin/academies/a_b/subscription", { plan: "PRO" });
  assert.equal(((await r2.json()) as { priceKrwMonthly: number }).priceKrwMonthly, 99000);
  // 플랜 변경 = 같은 행 갱신(학원당 1구독)
  const r3 = await req(admin, "PUT", "/admin/academies/a_wg/subscription", { plan: "PRO" });
  assert.equal(((await r3.json()) as { priceKrwMonthly: number }).priceKrwMonthly, 99000);
  const subs = await db.select().from(s.academySubscriptions);
  assert.equal(subs.length, 2);
  const audit = await db.select().from(s.auditLogs).where(eq(s.auditLogs.action, "subscription.set"));
  assert.equal(audit.length, 3);
  // 없는 학원 404 · 없는 플랜 422
  assert.equal((await req(admin, "PUT", "/admin/academies/a_none/subscription", { plan: "PRO" })).status, 404);
  assert.equal((await req(admin, "PUT", "/admin/academies/a_wg/subscription", { plan: "MEGA" })).status, 422);
});

test("관제 조회: MRR = ACTIVE 월요금 합 · 플랜별 카운트 · 학원별 지표", async () => {
  const ov = await (await get(admin, "/admin/overview")).json() as {
    academies: { total: number; suspended: number };
    subscription: { mrrKrw: number; activeByPlan: { BASIC: number; PRO: number } };
  };
  assert.equal(ov.academies.total, 2);
  assert.equal(ov.subscription.mrrKrw, 198000); // PRO 99,000 × 2
  assert.equal(ov.subscription.activeByPlan.PRO, 2);
  const list = await (await get(admin, "/admin/academies")).json() as {
    academies: { academyId: string; subscription: { plan: string } | null; activeParticipants: number }[];
  };
  assert.equal(list.academies.length, 2);
  const wg = list.academies.find((a) => a.academyId === "a_wg")!;
  assert.equal(wg.subscription?.plan, "PRO");
  assert.equal(wg.activeParticipants, 1);
});

test("구독 해지: CANCELED 는 MRR 에서 제외 + 멱등", async () => {
  assert.equal((await req(admin, "POST", "/admin/academies/a_b/subscription/cancellation", { reason: "테스트 해지" })).status, 200);
  assert.equal((await req(admin, "POST", "/admin/academies/a_b/subscription/cancellation", {})).status, 200); // 멱등
  const ov = await (await get(admin, "/admin/overview")).json() as { subscription: { mrrKrw: number } };
  assert.equal(ov.subscription.mrrKrw, 99000); // a_wg PRO 만
  const audit = await db.select().from(s.auditLogs).where(eq(s.auditLogs.action, "subscription.canceled"));
  assert.equal(audit.length, 1); // 멱등 재호출은 감사 안 남김
});

test("학원 정지: 사유 필수 · 전 멤버 세션 폐기 · guard 차단 · 해제 후 복구", async () => {
  assert.equal((await req(admin, "POST", "/admin/academies/a_b/suspension", {})).status, 422); // 사유 없음
  const r = await req(admin, "POST", "/admin/academies/a_b/suspension", { reason: "미납 30일 초과" });
  assert.equal(r.status, 200);
  assert.ok(((await r.json()) as { revokedUserSessions: number }).revokedUserSessions >= 1);
  // 세션 즉시 폐기 → 401
  assert.equal((await get(owner2, "/sessions/me")).status, 401);
  // 재로그인해도 학원 API 는 ACADEMY_SUSPENDED 403
  owner2 = await login("owner2");
  const blocked = await req(owner2, "POST", "/academies/a_b/participants", {
    name: "시도", birth: "2018-01-01", ageLabel: "7세",
  });
  assert.equal(blocked.status, 403);
  assert.equal(((await blocked.json()) as { error: string }).error, "ACADEMY_SUSPENDED");
  // 해제 → 정상 복구
  assert.equal((await req(admin, "DELETE", "/admin/academies/a_b/suspension")).status, 204);
  assert.equal((await req(owner2, "POST", "/academies/a_b/participants", {
    name: "복구후등록", birth: "2018-01-01", ageLabel: "7세",
  })).status, 201);
  const audit = await db.select().from(s.auditLogs).where(eq(s.auditLogs.action, "academy.suspended"));
  assert.equal(audit.length, 1);
});

test("SupportView: 사유 필수 · 기본 30분 만료 · 철회 멱등 · 감사", async () => {
  assert.equal((await req(admin, "POST", "/admin/support-views", { academyId: "a_wg", reason: "" })).status, 422);
  const r = await req(admin, "POST", "/admin/support-views", {
    academyId: "a_wg", reason: "CS-104 결제 오류 확인",
  });
  assert.equal(r.status, 201);
  const { supportViewId, expiresAt } = (await r.json()) as { supportViewId: string; expiresAt: string };
  assert.equal(expiresAt, "2026-07-18T10:30:00.000Z"); // NOW + 30분
  const rv = await req(admin, "POST", `/admin/support-views/${supportViewId}/revocation`, { reason: "확인 완료" });
  assert.equal(rv.status, 200);
  assert.equal((await req(admin, "POST", `/admin/support-views/${supportViewId}/revocation`, {})).status, 200); // 멱등
  const audit = await db.select().from(s.auditLogs).where(eq(s.auditLogs.action, "support_view.revoked"));
  assert.equal(audit.length, 1);
  assert.equal((await req(admin, "POST", "/admin/support-views", { academyId: "a_none", reason: "x" })).status, 404);
  // 이력 조회 — 발급·철회가 학원명과 함께 보인다(감사의 UI 표면)
  const list = await get(admin, "/admin/support-views");
  assert.equal(list.status, 200);
  const { supportViews } = (await list.json()) as {
    supportViews: { id: string; academyName: string | null; revokedAt: string | null }[];
  };
  const mine = supportViews.find((v) => v.id === supportViewId)!;
  assert.equal(mine.academyName, "원더짐");
  assert.ok(mine.revokedAt);
  assert.equal((await get(owner2, "/admin/support-views")).status, 404); // 비관리자 은닉
});

test("404 은닉 순서(리뷰): 일반 역할이 Origin 없이 admin 변이 호출 → 403 아닌 404", async () => {
  const r = await app.request("/admin/academies/a_wg/subscription", {
    method: "PUT",
    headers: { cookie: owner2.cookie, "content-type": "application/json" }, // origin·csrf 없음
    body: JSON.stringify({ plan: "PRO" }),
  });
  assert.equal(r.status, 404); // adminOnly 가 csrf 보다 먼저 — admin 표면 존재 비노출
});

test("가격 스냅샷 보존(리뷰): 같은 플랜 재지정은 기존 가격 유지 · 플랜 변경 시에만 가격표 반영", async () => {
  // a_wg 는 PRO — 스냅샷을 88,000 으로 가정(가격 개정 시나리오)
  await db.update(s.academySubscriptions).set({ priceKrwMonthly: 88000 })
    .where(eq(s.academySubscriptions.academyId, "a_wg"));
  const same = await req(admin, "PUT", "/admin/academies/a_wg/subscription", { plan: "PRO" });
  assert.equal(((await same.json()) as { priceKrwMonthly: number }).priceKrwMonthly, 88000); // grandfather 유지
  const changed = await req(admin, "PUT", "/admin/academies/a_wg/subscription", { plan: "BASIC" });
  assert.equal(((await changed.json()) as { priceKrwMonthly: number }).priceKrwMonthly, 29000); // 변경 시 현 가격표
  await req(admin, "PUT", "/admin/academies/a_wg/subscription", { plan: "PRO" }); // 원복(이후 테스트 무관)
});

test("자기 잠금 방지(리뷰): 관리자 소속 학원 정지 → 관리자 세션 생존·일반 멤버만 폐기", async () => {
  owner1 = await login("owner1"); // 아래 세션 폐기 테스트와 독립적으로 활성 세션 확보
  const r = await req(admin, "POST", "/admin/academies/a_wg/suspension", { reason: "테스트 — 자기 소속 정지" });
  assert.equal(r.status, 200);
  assert.equal((await get(admin, "/admin/overview")).status, 200); // 관리자 콘솔 생존
  assert.equal((await get(owner1, "/sessions/me")).status, 401);   // 일반 멤버는 폐기
  assert.equal((await req(admin, "DELETE", "/admin/academies/a_wg/suspension")).status, 204);
});

test("정지 우회 차단(리뷰): academyCtx 미적용 라우트도 정지 학원이면 403", async () => {
  await req(admin, "POST", "/admin/academies/a_b/suspension", { reason: "우회 차단 검증" });
  // 정지 전 발급된 초대 수락 시도
  const invited = await login("invited-x");
  await db.insert(s.academyMemberships).values({
    id: "m_ix", userId: invited.userId, academyId: "a_b", roles: ["COACH"], status: "INVITED", joinedAt: "2026-07-01",
  });
  const acc = await req(invited, "POST", "/academies/a_b/members/accept", {});
  assert.equal(acc.status, 403);
  assert.equal(((await acc.json()) as { error: string }).error, "ACADEMY_SUSPENDED");
  // 보호자-자녀 연결 요청도 차단(본문 검증 전에 정지 검사)
  const link = await req(invited, "POST", "/academies/a_b/guardian-links", {});
  assert.equal(link.status, 403);
  await req(admin, "DELETE", "/admin/academies/a_b/suspension"); // 원복
});

test("사용자 세션 강제 폐기: 사유 필수 · 대상 즉시 401 · 감사", async () => {
  assert.equal((await req(admin, "POST", `/admin/users/${owner1.userId}/session-revocation`, {})).status, 422);
  assert.equal((await req(admin, "POST", `/admin/users/${owner1.userId}/session-revocation`, {
    reason: "계정 탈취 의심 신고",
  })).status, 204);
  assert.equal((await get(owner1, "/sessions/me")).status, 401);
  assert.equal((await req(admin, "POST", "/admin/users/u_none/session-revocation", { reason: "x" })).status, 404);
  const audit = await db.select().from(s.auditLogs).where(eq(s.auditLogs.action, "user.sessions_revoked"));
  assert.equal(audit.length, 1);
});

test("#39-④ 구독 ledger: 플랜 변경·해지·상태 전이가 append-only 행으로 — 불법 전이 409", async () => {
  const ledger1 = (await (await get(admin, "/admin/academies/a_wg/subscription/ledger")).json()) as
    { ledger: { eventType: string; fromPlan: string | null; toPlan: string | null }[] };
  assert.ok(ledger1.ledger.length >= 2); // 앞 테스트들의 set/변경 이력 누적
  assert.ok(ledger1.ledger.some((l) => l.eventType === "PLAN_CHANGED"));
  // 상태 전이: ACTIVE → PAST_DUE(허용) → TRIAL(불법 409)
  const ok = await req(admin, "POST", "/admin/academies/a_wg/subscription/status", {
    status: "PAST_DUE", reason: "테스트 미납",
  });
  assert.equal(ok.status, 200);
  assert.equal((await req(admin, "POST", "/admin/academies/a_wg/subscription/status", {
    status: "TRIAL",
  })).status, 409); // PAST_DUE → TRIAL 은 상태머신 밖
  // 복귀 + ledger STATUS_CHANGED 기록 확인
  await req(admin, "POST", "/admin/academies/a_wg/subscription/status", { status: "ACTIVE" });
  const ledger2 = (await (await get(admin, "/admin/academies/a_wg/subscription/ledger")).json()) as
    { ledger: { eventType: string; fromStatus: string | null; toStatus: string | null }[] };
  const st = ledger2.ledger.filter((l) => l.eventType === "STATUS_CHANGED");
  assert.equal(st.length, 2); // PAST_DUE 진입 + ACTIVE 복귀 (멱등·409는 기록 없음)
  // 비관리자 은닉(앞 정지 테스트가 owner2 세션을 폐기했으므로 재로그인)
  owner2 = await login("owner2");
  assert.equal((await get(owner2, "/admin/academies/a_wg/subscription/ledger")).status, 404);
});

test("#39-⑥ 네이버 래퍼: env 미설정 = 501 fail-closed · 비관리자 404", async () => {
  assert.equal((await get(admin, "/admin/naver/search?type=blog&q=test")).status, 501);
  assert.equal((await get(owner2, "/admin/naver/search?type=blog&q=test")).status, 404); // 직전 테스트에서 재로그인됨
});
