/* 정지 차단 인벤토리 (파일럿 P0) — 통제 계약 "정지 = 매 요청 403"의 회귀 가드.
   /academies/:academyId 하위 **등록된 전 라우트**를 정지 학원으로 호출해
   403 ACADEMY_SUSPENDED 를 전수 확인한다. academyCtx/academyAlive 없이
   새 라우트를 추가하면 이 테스트가 즉시 실패한다(14차 리뷰가 잡은 우회 2건의 재발 방지). */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { schema as s } from "@pacefolio/db";
import { createApp } from "../src/app";
import { createDevMemoryStorage } from "../src/storage/adapter";
import type { OAuthProvider } from "../src/auth/provider";

const migrationsFolder = join(
  dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "packages", "db", "migrations",
);
const NOW = "2026-07-19T10:00:00.000Z";
const ORIGIN = "http://localhost:3000";
let db: ReturnType<typeof drizzle>;
let app: ReturnType<typeof createApp>;

const fake: OAuthProvider = {
  name: "kakao", oidc: false,
  authorizeUrl: (p) => `https://fake/authorize?state=${p.state}`,
  exchangeCode: async (code) => ({ providerSubject: `sub-${code}`, displayName: `유저-${code}` }),
};
let cookie = "", csrf = "";

before(async () => {
  const client = new PGlite();
  db = drizzle(client);
  await migrate(db, { migrationsFolder });
  app = createApp({
    db, providers: { kakao: fake }, allowedOrigins: [ORIGIN],
    redirectUri: "http://x/cb", now: () => NOW, secureCookies: false,
    storage: createDevMemoryStorage(), // 사진 라우트 501 대신 정지 판정까지 도달시키기 위해
  });
  await db.insert(s.academies).values({
    id: "a_susp", organizationId: "o", name: "정지학원", themeColor: "#12B5A5", themeInk: "#087F73",
    logoEmoji: "🐯", ownerName: "김도윤", billingCycleDefault: 3,
    suspendedAt: NOW, // 세션 발급 뒤에도 정지 판정이 서도록 DB 직접 설정
  });
  const st = await app.request("/auth/kakao/start", { method: "POST" });
  const { state } = await st.json() as { state: string };
  const cb = await app.request(`/auth/kakao/callback?code=owner&state=${state}`);
  const { userId } = await cb.json() as { userId: string };
  const sc = cb.headers.getSetCookie();
  cookie = sc.map((c) => c.split(";")[0]).join("; ");
  csrf = sc.find((c) => c.startsWith("pf_csrf="))!.split(";")[0].split("=")[1];
  await db.insert(s.academyMemberships).values({
    id: "m_o", userId, academyId: "a_susp", roles: ["OWNER"], status: "ACTIVE", joinedAt: "2024-03-01",
  });
});

test("정지 학원: /academies/:academyId 하위 등록 라우트 전수 → 403 ACADEMY_SUSPENDED", async () => {
  const seen = new Set<string>();
  const targets: { method: string; path: string }[] = [];
  for (const r of app.routes) {
    if (!r.path.startsWith("/academies/:academyId")) continue;
    const key = `${r.method} ${r.path}`;
    if (r.method === "ALL" || seen.has(key)) continue;
    seen.add(key);
    targets.push({ method: r.method, path: r.path });
  }
  assert.ok(targets.length >= 40, `라우트 인벤토리가 비정상적으로 작음(${targets.length})`);

  const failures: string[] = [];
  for (const t of targets) {
    const url = t.path
      .replace(":academyId", "a_susp")
      .replace(/:[A-Za-z]+/g, "x"); // 나머지 파라미터는 임의값 — 정지 판정은 그 전에 서야 함
    const res = await app.request(url, {
      method: t.method,
      headers: {
        cookie, origin: ORIGIN, "x-csrf-token": csrf,
        "content-type": "application/json",
      },
      ...(t.method === "GET" ? {} : { body: "{}" }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (res.status !== 403 || body.error !== "ACADEMY_SUSPENDED") {
      failures.push(`${t.method} ${t.path} → ${res.status} ${body.error ?? ""}`);
    }
  }
  assert.deepEqual(failures, [], `정지 차단이 새는 라우트:\n${failures.join("\n")}`);
});
