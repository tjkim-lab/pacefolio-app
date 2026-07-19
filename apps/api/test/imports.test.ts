/* 가져오기 스테이징 PS3 통합 테스트 (지시서 §8 필수 조건)
   미리보기 전 운영 무변경 · 원본 보존 · 자동 병합 금지 · 오류 행 수정→재검증 ·
   커밋 tx·부분 성공 · 같은 파일 중복 커밋 방지 · batch 되돌리기(archive) · 테넌트.
   ⚠️ 중립 데이터만(§16). */
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
const NOW = "2026-07-19T12:00:00.000Z";
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
const patch = (a: Actor, p: string, b?: unknown) => send(a, "PATCH", p, b);
const get = (a: Actor, p: string) => app.request(p, { headers: { cookie: a.cookie } });

let owner: Actor, coach: Actor, otherOwner: Actor;

/* 원더짐형 헤더 · 중립 데이터 — 공백/중복/누락/미지 영역을 일부러 포함 */
const CSV = [
  "Name,설명,Key FMS,Level",
  "  샘플 활동 A , 기존과 같은 이름 ,테스트 균형 영역,쉬움", // 기존 활동과 중복 후보 + 공백 정규화
  "샘플 활동 B,새 활동,미지의 영역,보통",                    // 미지 영역 = 경고(커밋 가능)
  ",이름 없는 행,테스트 균형 영역,",                          // INVALID
  "샘플 활동 C,정상 행,테스트 이동 영역,어려움",
].join("\n");

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
  // #49: 프로그램 CSV 가져오기 = PRO 게이트 — 두 학원 모두 PRO(테넌트 격리 테스트 유지)
  await db.insert(s.academySubscriptions).values([
    { id: "sub_t", academyId: "a_test", plan: "PRO", status: "ACTIVE", priceKrwMonthly: 99000, startedAt: NOW, createdAt: NOW, updatedAt: NOW },
    { id: "sub_x", academyId: "a_other", plan: "PRO", status: "ACTIVE", priceKrwMonthly: 99000, startedAt: NOW, createdAt: NOW, updatedAt: NOW },
  ]);
  owner = await login("owner");
  coach = await login("coach");
  otherOwner = await login("other");
  await db.insert(s.academyMemberships).values([
    { id: "m_o", userId: owner.userId, academyId: "a_test", roles: ["OWNER"], status: "ACTIVE", joinedAt: "2024-03-01" },
    { id: "m_c", userId: coach.userId, academyId: "a_test", roles: ["COACH"], status: "ACTIVE", joinedAt: "2024-08-01" },
    { id: "m_x", userId: otherOwner.userId, academyId: "a_other", roles: ["OWNER"], status: "ACTIVE", joinedAt: "2024-01-01" },
  ]);
  // 사전 지식: 성장영역(소분류 2) + 기존 활동 1(중복 후보 대상)
  const parent = await post(owner, "/academies/a_test/growth-domains", { name: "테스트 대분류" });
  const parentId = (await parent.json() as { domainId: string }).domainId;
  for (const name of ["테스트 균형 영역", "테스트 이동 영역"]) {
    await post(owner, "/academies/a_test/growth-domains", { name, parentId });
  }
  await post(owner, "/academies/a_test/activities", { name: "샘플 활동 A", description: "기존 활동" });
});

let batchId = "";
let invalidRowId = "";
let dupRowId = "";

test("권한: 코치 스테이징 403", async () => {
  const r = await post(coach, "/academies/a_test/imports", { fileName: "t.csv", csvText: CSV });
  assert.equal(r.status, 403);
});

test("스테이징 — 자동 매핑·정규화·검증·중복 후보 + 운영 데이터 무변경", async () => {
  const before1 = await db.select().from(s.activities).where(eq(s.activities.academyId, "a_test"));
  const r = await post(owner, "/academies/a_test/imports", { fileName: "샘플.csv", csvText: CSV });
  assert.equal(r.status, 201);
  const body = await r.json() as {
    batchId: string; total: number; valid: number; invalid: number;
    withDuplicates: number; reuploadOfCommitted: boolean;
    mapping: { name: number; primaryDomain: number };
  };
  batchId = body.batchId;
  assert.equal(body.total, 4);
  assert.equal(body.valid, 3);
  assert.equal(body.invalid, 1);
  assert.equal(body.withDuplicates, 1);      // 샘플 활동 A = 기존 활동과 중복 후보
  assert.equal(body.reuploadOfCommitted, false);
  assert.equal(body.mapping.name, 0);        // "Name" 자동 인식
  assert.equal(body.mapping.primaryDomain, 2); // "Key FMS" 자동 인식
  // §8: 미리보기 전 운영 데이터 무변경
  const after = await db.select().from(s.activities).where(eq(s.activities.academyId, "a_test"));
  assert.equal(after.length, before1.length);
});

test("미리보기 — 원본 보존(공백 그대로)·정규화 제안·경고 메시지", async () => {
  const r = await get(owner, `/academies/a_test/imports/${batchId}`);
  assert.equal(r.status, 200);
  const b = await r.json() as {
    status: string;
    rows: {
      rowId: string; sourceRowNumber: number; raw: string[];
      normalized: { name: string }; validationStatus: string;
      validationMessages: string[]; duplicateCandidateIds: string[];
    }[];
  };
  assert.equal(b.status, "STAGED");
  assert.equal(b.rows.length, 4);
  const rowA = b.rows.find((x) => x.sourceRowNumber === 2)!;
  assert.equal(rowA.raw[0], "  샘플 활동 A ");        // 원본 영구 보존
  assert.equal(rowA.normalized.name, "샘플 활동 A");   // 정규화는 제안
  assert.equal(rowA.duplicateCandidateIds.length, 1);  // 자동 병합 없음 — 후보 제안만
  dupRowId = rowA.rowId;
  const rowB = b.rows.find((x) => x.sourceRowNumber === 3)!;
  assert.equal(rowB.validationStatus, "VALID");        // 미지 영역은 경고일 뿐
  assert.ok(rowB.validationMessages.some((m) => m.includes("미지의 영역")));
  const rowEmpty = b.rows.find((x) => x.sourceRowNumber === 4)!;
  assert.equal(rowEmpty.validationStatus, "INVALID");
  invalidRowId = rowEmpty.rowId;
});

test("행 수정 → 재검증(오류 행만 고쳐 통과) + 중복 행 SKIP 지정", async () => {
  const fix = await patch(owner, `/academies/a_test/imports/${batchId}/rows/${invalidRowId}`, {
    normalized: { name: "샘플 활동 D" },
  });
  assert.equal(fix.status, 200);
  const fixed = await fix.json() as { validationStatus: string };
  assert.equal(fixed.validationStatus, "VALID");
  const skip = await patch(owner, `/academies/a_test/imports/${batchId}/rows/${dupRowId}`, {
    resolution: "SKIP", // 원장이 중복을 보고 직접 결정(자동 병합 금지)
  });
  assert.equal(skip.status, 200);
});

test("커밋 — VALID+CREATE 만 생성·SKIP 제외·태그는 매칭 영역만·감사", async () => {
  const r = await post(owner, `/academies/a_test/imports/${batchId}/commit`);
  assert.equal(r.status, 200);
  const body = await r.json() as { created: number; skipped: number; invalid: number };
  assert.equal(body.created, 3);  // B·C·D(수정됨)
  assert.equal(body.skipped, 1);  // A(SKIP)
  assert.equal(body.invalid, 0);
  const acts = await db.select().from(s.activities).where(eq(s.activities.academyId, "a_test"));
  assert.equal(acts.length, 1 + 3); // 기존 1 + 생성 3
  // 태그: C 는 "테스트 이동 영역" PRIMARY, B 는 미지 영역이라 태그 없음
  const list = await get(owner, "/academies/a_test/activities");
  const { activities } = await list.json() as { activities: { name: string; growthTags: { role: string }[] }[] };
  const actC = activities.find((a) => a.name === "샘플 활동 C")!;
  assert.equal(actC.growthTags.filter((t) => t.role === "PRIMARY").length, 1);
  const actB = activities.find((a) => a.name === "샘플 활동 B")!;
  assert.equal(actB.growthTags.length, 0);
  const audit = await db.select().from(s.auditLogs).where(eq(s.auditLogs.action, "import.committed"));
  assert.equal(audit.length, 1);
});

test("§8: 같은 배치 재커밋 409 · 같은 파일 재업로드 후 커밋도 409", async () => {
  const again = await post(owner, `/academies/a_test/imports/${batchId}/commit`);
  assert.equal(again.status, 409);
  // 같은 파일 재업로드 — 스테이징은 되고(reupload 표시) 커밋은 차단
  const re = await post(owner, "/academies/a_test/imports", { fileName: "샘플-재업로드.csv", csvText: CSV });
  assert.equal(re.status, 201);
  const reBody = await re.json() as { batchId: string; reuploadOfCommitted: boolean };
  assert.equal(reBody.reuploadOfCommitted, true);
  const reCommit = await post(owner, `/academies/a_test/imports/${reBody.batchId}/commit`);
  assert.equal(reCommit.status, 409);
});

test("되돌리기 — batch 단위 archive(삭제 아님)·멱등", async () => {
  const r = await post(owner, `/academies/a_test/imports/${batchId}/revert`);
  assert.equal(r.status, 200);
  const body = await r.json() as { archived: number };
  assert.equal(body.archived, 3);
  const archived = await db.select().from(s.activities).where(and(
    eq(s.activities.academyId, "a_test"), eq(s.activities.status, "ARCHIVED"),
  ));
  assert.equal(archived.length, 3); // 삭제 아님 — 행은 남고 ARCHIVED
  const again = await post(owner, `/academies/a_test/imports/${batchId}/revert`);
  assert.equal(again.status, 200);
  assert.equal((await again.json() as { archived: number }).archived, 0); // 멱등
});

test("교차 테넌트 — 타학원 원장의 배치 접근 404", async () => {
  const r = await get(otherOwner, `/academies/a_other/imports/${batchId}`);
  assert.equal(r.status, 404);
  const commit = await post(otherOwner, `/academies/a_other/imports/${batchId}/commit`);
  assert.equal(commit.status, 404);
});
