/* 사진 파이프라인 사전 코어(#19) 통합 테스트 — 실 HTTP × PGlite × dev 스토리지
   동의(보호자 VERIFIED·If-Match) → 업로드 의도(담당) → finalize 동의 게이트
   (미동의 태그 = 422 + 차단 명단) → 동의 후 통과 → 열람 권한 + 철회 시 차단. */
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
import { createDevMemoryStorage } from "../src/storage/adapter";
import type { OAuthProvider } from "../src/auth/provider";

const migrationsFolder = join(
  dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "packages", "db", "migrations",
);
const NOW = "2026-07-18T16:00:00.000Z";
const ORIGIN = "http://localhost:3000";
let db: ReturnType<typeof drizzle>;
let app: ReturnType<typeof createApp>;
const storage = createDevMemoryStorage();

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
const req = (a: Actor, method: string, path: string, body?: unknown, headers?: Record<string, string>) =>
  app.request(path, {
    method,
    headers: {
      cookie: a.cookie, origin: ORIGIN, "x-csrf-token": a.csrf,
      ...(body ? { "content-type": "application/json" } : {}), ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
const get = (a: Actor, path: string) => app.request(path, { headers: { cookie: a.cookie } });

let owner: Actor, coach: Actor, mom: Actor, stranger: Actor;
let photoId = "";

before(async () => {
  const client = new PGlite();
  db = drizzle(client);
  await migrate(db, { migrationsFolder });
  app = createApp({
    db, providers: { kakao: fake }, allowedOrigins: [ORIGIN],
    redirectUri: "http://x/cb", now: () => NOW, secureCookies: false,
    enableDevLogin: true, storage,
  });
  await db.insert(s.academies).values({
    id: "a_wg", organizationId: "o", name: "원더짐", themeColor: "#12B5A5", themeInk: "#087F73",
    logoEmoji: "🐯", ownerName: "김도윤", billingCycleDefault: 3,
  });
  owner = await login("owner"); coach = await login("coach");
  mom = await login("mom"); stranger = await login("stranger");
  await db.insert(s.academyMemberships).values([
    { id: "m_o", userId: owner.userId, academyId: "a_wg", roles: ["OWNER"], status: "ACTIVE", joinedAt: "2024-03-01" },
    { id: "m_c", userId: coach.userId, academyId: "a_wg", roles: ["COACH"], status: "ACTIVE", joinedAt: "2024-08-01" },
    { id: "m_m", userId: mom.userId, academyId: "a_wg", roles: ["GUARDIAN"], status: "ACTIVE", joinedAt: "2025-03-02" },
    { id: "m_s", userId: stranger.userId, academyId: "a_wg", roles: ["GUARDIAN"], status: "ACTIVE", joinedAt: "2025-03-02" },
  ]);
  await db.insert(s.participants).values({
    id: "p_dodam", academyId: "a_wg", name: "김도담", birth: "2017-04-10", ageLabel: "8세",
  });
  await db.insert(s.dbClasses).values({
    id: "cls1", academyId: "a_wg", name: "플레이2", scheduleType: "FIXED_WEEKLY", capacity: 12,
    createdAt: NOW, updatedAt: NOW,
  });
  await db.insert(s.classAssignments).values({
    id: "ca1", classId: "cls1", academyId: "a_wg", coachUserId: coach.userId,
    status: "ACTIVE", startDate: "2024-08-01", createdAt: NOW,
  });
  await db.insert(s.dbEnrollments).values({
    id: "en1", academyId: "a_wg", classId: "cls1", participantId: "p_dodam",
    status: "ACTIVE", startDate: "2025-03-02", createdAt: NOW,
  });
  // mom = 도담 VERIFIED 보호자(canReceivePhotos)
  await db.insert(s.guardians).values([
    { id: "gd_m", userId: mom.userId }, { id: "gd_s", userId: stranger.userId },
  ]);
  await db.insert(s.guardianParticipantLinks).values({
    id: "gl_m", guardianId: "gd_m", participantId: "p_dodam", academyId: "a_wg",
    relationshipType: "MOTHER", isPrimaryGuardian: true, verificationStatus: "VERIFIED",
    canViewSchedule: true, canViewAttendance: true, canViewHealthInfo: true,
    canReceivePhotos: true, canPay: true, canRequestRefund: true,
  });
});

test("업로드 의도 → dev 스토리지 PUT → PENDING 상태 — 동의 없는 finalize 는 422 + 차단 명단", async () => {
  const up = await req(coach, "POST", "/academies/a_wg/photos", {
    contentType: "image/jpeg", byteSize: 1024,
  });
  assert.equal(up.status, 201);
  const { photoId: pid, upload } = (await up.json()) as { photoId: string; upload: { url: string } };
  photoId = pid;
  // dev 스토리지 업로드(계약 라운드트립)
  const put = await app.request(upload.url, { method: "PUT", headers: { "content-type": "image/jpeg" }, body: "img" });
  assert.equal(put.status, 204);
  // 동의 게이트: 도담 태그 + CLASS_SHARE×CLASS_MEMBERS — 동의 없음 → 서버가 차단
  const fin = await req(coach, "POST", `/academies/a_wg/photos/${photoId}/finalize`, {
    participantIds: ["p_dodam"], purpose: "CLASS_SHARE", audience: "CLASS_MEMBERS",
  });
  assert.equal(fin.status, 422);
  const body = (await fin.json()) as { error: string; blockedParticipantIds: string[] };
  assert.equal(body.error, "CONSENT_REQUIRED");
  assert.deepEqual(body.blockedParticipantIds, ["p_dodam"]);
});

test("동의: 비연결 보호자 403 · VERIFIED 보호자 갱신 + If-Match 충돌 409", async () => {
  const grants = { grants: [{ purpose: "CLASS_SHARE", audience: "CLASS_MEMBERS" }], policyVersion: "v1", channel: "app" };
  assert.equal((await req(stranger, "PUT", "/academies/a_wg/participants/p_dodam/photo-consent", grants)).status, 403);
  const ok = await req(mom, "PUT", "/academies/a_wg/participants/p_dodam/photo-consent", grants);
  assert.equal(ok.status, 200);
  assert.equal(((await ok.json()) as { version: number }).version, 1);
  // 구버전 If-Match → 409(동시 수정 방지)
  assert.equal((await req(mom, "PUT", "/academies/a_wg/participants/p_dodam/photo-consent", grants, { "if-match": "99" })).status, 409);
  // 조회: staff·보호자 가능
  const got = (await (await get(owner, "/academies/a_wg/participants/p_dodam/photo-consent")).json()) as { exists: boolean };
  assert.equal(got.exists, true);
});

test("동의 후 finalize 통과 — 정확한 조합만(교차조합 차단) · 열람 권한 · 철회 시 재차단", async () => {
  // 동의한 조합(CLASS_SHARE×CLASS_MEMBERS)은 통과
  const fin = await req(coach, "POST", `/academies/a_wg/photos/${photoId}/finalize`, {
    participantIds: ["p_dodam"], purpose: "CLASS_SHARE", audience: "CLASS_MEMBERS",
  });
  assert.equal(fin.status, 200);
  // 동의 안 한 조합(SNS_POST×PUBLIC)은 차단 — 목적×대상 독립 매칭 금지
  const up2 = await req(coach, "POST", "/academies/a_wg/photos", { contentType: "image/png", byteSize: 10 });
  const up2body = (await up2.json()) as { photoId: string; upload: { url: string } };
  const p2 = up2body.photoId;
  await app.request(up2body.upload.url, { method: "PUT", headers: { "content-type": "image/png" }, body: "img" });
  assert.equal((await req(coach, "POST", `/academies/a_wg/photos/${p2}/finalize`, {
    participantIds: ["p_dodam"], purpose: "SNS_POST", audience: "PUBLIC",
  })).status, 422);
  // 열람: 보호자(자녀 태그·canReceivePhotos) OK + 감사 / 무관 보호자 404
  const url = await get(mom, `/academies/a_wg/photos/${photoId}/url`);
  assert.equal(url.status, 200);
  assert.equal((await get(stranger, `/academies/a_wg/photos/${photoId}/url`)).status, 404);
  const viewAudit = await db.select().from(s.auditLogs).where(eq(s.auditLogs.action, "photo.viewed"));
  assert.equal(viewAudit.length, 1);
  // 철회 → 새 finalize 는 다시 차단(발송 시점 재검증 원칙)
  assert.equal((await req(mom, "POST", "/academies/a_wg/participants/p_dodam/photo-consent/revocations", {})).status, 201);
  const up3 = await req(coach, "POST", "/academies/a_wg/photos", { contentType: "image/png", byteSize: 10 });
  const up3body = (await up3.json()) as { photoId: string; upload: { url: string } };
  const p3 = up3body.photoId;
  await app.request(up3body.upload.url, { method: "PUT", headers: { "content-type": "image/png" }, body: "img" });
  assert.equal((await req(coach, "POST", `/academies/a_wg/photos/${p3}/finalize`, {
    participantIds: ["p_dodam"], purpose: "CLASS_SHARE", audience: "CLASS_MEMBERS",
  })).status, 422);
});

test("어댑터 미주입 = 501 fail-closed (사업자 결정 대기 — 침묵 저장 금지)", async () => {
  const noStorage = createApp({
    db, providers: { kakao: fake }, allowedOrigins: [ORIGIN],
    redirectUri: "http://x/cb", now: () => NOW, secureCookies: false,
  });
  const r = await noStorage.request("/academies/a_wg/photos", {
    method: "POST",
    headers: { cookie: coach.cookie, origin: ORIGIN, "x-csrf-token": coach.csrf, "content-type": "application/json" },
    body: JSON.stringify({ contentType: "image/jpeg", byteSize: 10 }),
  });
  assert.equal(r.status, 501);
});

test("파일럿 P0: 빈 태그 우회 차단 · 업로드 미완료 finalize 422", async () => {
  // 업로드 미완료(PUT 안 함) → finalize 422
  const upA = await req(coach, "POST", "/academies/a_wg/photos", { contentType: "image/png", byteSize: 10 });
  const pA = ((await upA.json()) as { photoId: string }).photoId;
  const noUpload = await req(coach, "POST", `/academies/a_wg/photos/${pA}/finalize`, {
    participantIds: [], purpose: "INTERNAL_RECORD", audience: "ACADEMY_INTERNAL",
  });
  assert.equal(noUpload.status, 422); // 객체 실존 확인(HEAD) 선행
  // 빈 태그 + 외부 공개 시도 → 정책 차단(내부 기록만 허용)
  const upB = await req(coach, "POST", "/academies/a_wg/photos", { contentType: "image/png", byteSize: 10 });
  const bodyB = (await upB.json()) as { photoId: string; upload: { url: string } };
  await app.request(bodyB.upload.url, { method: "PUT", headers: { "content-type": "image/png" }, body: "x" });
  const bypass = await req(coach, "POST", `/academies/a_wg/photos/${bodyB.photoId}/finalize`, {
    participantIds: [], purpose: "SNS_POST", audience: "PUBLIC",
  });
  assert.equal(bypass.status, 422); // "등장 원생 없음 = 허용" 악용 경로 봉합
  // 빈 태그 + 내부 기록은 허용(풍경·시설 사진)
  assert.equal((await req(coach, "POST", `/academies/a_wg/photos/${bodyB.photoId}/finalize`, {
    participantIds: [], purpose: "INTERNAL_RECORD", audience: "ACADEMY_INTERNAL",
  })).status, 200);
});

test("파일럿 P0: 동의 철회 후 기존 확정 사진 다운로드 재인가 — 즉시 차단 + 감사", async () => {
  // 직전 테스트에서 mom 동의는 철회된 상태 — photoId(확정된 CLASS_SHARE 사진) 다운로드 시도
  const r = await get(mom, `/academies/a_wg/photos/${photoId}/url`);
  assert.equal(r.status, 404); // 발송 시점이 아니라 열람 시점 재검증(R2 P0-9) — 배포 즉시 중단
  const audit = await db.select().from(s.auditLogs)
    .where(eq(s.auditLogs.action, "photo.view_blocked_consent"));
  assert.equal(audit.length, 1);
  // staff 는 관리 목적 접근 유지
  assert.equal((await get(owner, `/academies/a_wg/photos/${photoId}/url`)).status, 200);
});
