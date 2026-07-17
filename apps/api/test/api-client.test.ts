/* Phase 6 기반 통합 — api-client × dev 로그인 × seed 전 스택 (R5 Phase 6)
   "UI 가 mock 대신 서버 상태를 정본으로" 의 클라이언트 축:
   devLogin(박서연) → me → 자녀 청구서 → 결제 준비 → 시뮬 webhook → PAID.
   전부 api-client 경유(응답 zod runtime validation 포함). */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { seedWondergym } from "@pacefolio/db/seed";
import { createApiClient, ApiError, type FetchLike } from "@pacefolio/api-client";
import { createApp } from "../src/app";

const migrationsFolder = join(
  dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "packages", "db", "migrations",
);
const ORIGIN = "http://localhost:3000";
const NOW = () => new Date().toISOString();

let app: ReturnType<typeof createApp>;

/* 브라우저 없는 환경용 cookie jar — fetchFn 어댑터가 쿠키를 유지 */
function makeFetch(): { fetchFn: FetchLike; getCsrf: () => string | undefined } {
  const jar = new Map<string, string>();
  const fetchFn: FetchLike = async (path, init) => {
    const headers = new Headers(init?.headers);
    if (jar.size) headers.set("cookie", [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; "));
    headers.set("origin", ORIGIN); // CSRF Origin 검증 통과용(브라우저가 자동 첨부하는 헤더)
    const res = await app.request(path, { ...init, headers });
    for (const sc of res.headers.getSetCookie()) {
      const [pair] = sc.split(";");
      const [k, v] = pair.split("=");
      if (v) jar.set(k, v); else jar.delete(k);
    }
    return res;
  };
  return { fetchFn, getCsrf: () => jar.get("pf_csrf") };
}

before(async () => {
  const client = new PGlite();
  const db = drizzle(client);
  await migrate(db, { migrationsFolder });
  await seedWondergym(db, NOW());
  app = createApp({
    db, providers: {}, allowedOrigins: [ORIGIN],
    redirectUri: "http://x/cb", now: NOW, secureCookies: false,
    enableDevLogin: true,
  });
});

test("전 스택: devLogin(박서연) → me → 청구서 2건 → 결제 준비 → webhook → PAID", async () => {
  const { fetchFn, getCsrf } = makeFetch();
  const api = createApiClient({ fetchFn, getCsrfToken: getCsrf });

  // 로그인 — seed 사용자 박서연으로
  const login = await api.devLogin("박서연");
  assert.equal(login.userId, "u_guardian_psy");

  // me — 서버 도출 멤버십
  const me = await api.me();
  assert.equal(me.user.name, "박서연");
  assert.deepEqual(me.memberships.map((m) => m.academyId), ["a_wondergym"]);
  assert.ok(me.memberships[0].roles.includes("GUARDIAN"));

  // 자녀 청구서 — 도담 405,000 + 서준 333,000 (원더짐 정본 캐스트)
  const { invoices } = await api.listInvoices("a_wondergym");
  assert.equal(invoices.length, 2);
  const total = invoices.reduce((s, i) => s + i.total, 0);
  assert.equal(total, 738000); // 형제 합산 = fixture 정본과 동일
  assert.ok(invoices.every((i) => i.status === "ISSUED"));

  // 형제 합산 결제 준비
  const prep = await api.preparePayment("a_wondergym", invoices.map((i) => i.invoiceId), "demo-key-1");
  assert.equal(prep.amount, 738000);
  assert.equal(prep.status, "PENDING");

  // PG 시뮬 webhook 으로 확정 (api-client 밖 — PG 가 서버에 직접 쏘는 경로)
  const w = await app.request("/webhooks/pg/mockpg", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      providerEventId: "evt-demo-1", paymentId: prep.paymentId,
      targetStatus: "CAPTURED", occurredAt: NOW(),
    }),
  });
  assert.equal(((await w.json()) as { decision: string }).decision, "APPLY");

  // 서버 상태가 정본 — 재조회 시 PAID
  const after = await api.listInvoices("a_wondergym");
  assert.ok(after.invoices.every((i) => i.status === "PAID"));

  // 로그아웃 → me 401 (ApiError 로 표준화)
  await api.logout();
  await assert.rejects(api.me(), (e: ApiError) => e.status === 401);
});

test("dev 로그인 게이트: 비활성 앱에서는 404 (프로덕션 안전)", async () => {
  const { fetchFn } = makeFetch();
  // enableDevLogin 미지정 앱
  const prodLike = createApp({
    db: drizzle(new PGlite()), providers: {}, allowedOrigins: [ORIGIN],
    redirectUri: "http://x/cb", now: NOW, secureCookies: false,
  });
  const res = await prodLike.request("/auth/dev/login", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "박서연" }),
  });
  assert.equal(res.status, 404);
  void fetchFn;
});

test("api-client 응답 검증: 서버가 계약 밖 응답이면 클라이언트가 즉시 실패", async () => {
  // 잘못된 응답을 주는 가짜 서버 — zod 파싱이 조용히 통과시키지 않는지
  const badFetch: FetchLike = async () =>
    new Response(JSON.stringify({ unexpected: true }), { status: 200, headers: { "content-type": "application/json" } });
  const api = createApiClient({ fetchFn: badFetch, getCsrfToken: () => "x" });
  await assert.rejects(api.me()); // ZodError — 계약 위반을 런타임에 탐지
});
