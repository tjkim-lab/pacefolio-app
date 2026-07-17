/* Phase 4 통합 테스트 — 보호자 연결 vertical slice (R5 §7 Phase 4)
   실 HTTP × 진짜 Postgres: 도메인 판정 + DB 원자성(1회 소비·UNIQUE·rollback).
   ⚠️ 동시 20요청 경쟁은 PGlite(단일 커넥션) 불가 — CI postgres service 에서.
      여기서는 "재사용이 반드시 실패한다"의 순차 재현 + rollback 무결성 검증. */
import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { schema as s } from "@pacefolio/db";
import { createApp } from "../src/app";
import { sha256Hex } from "../src/crypto";
import type { OAuthProvider } from "../src/auth/provider";

const migrationsFolder = join(
  dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "packages", "db", "migrations",
);

let NOW = "2026-07-16T10:00:00.000Z";
const ORIGIN = "http://localhost:3000";
let db: ReturnType<typeof drizzle>;
let app: ReturnType<typeof createApp>;
let seq = 0;

const fake: OAuthProvider = {
  name: "kakao", oidc: false,
  authorizeUrl: (p) => `https://fake/authorize?state=${p.state}`,
  exchangeCode: async (code) => ({ providerSubject: `sub-${code}`, displayName: `유저-${code}` }),
};

before(async () => {
  const client = new PGlite();
  db = drizzle(client);
  await migrate(db, { migrationsFolder });
  app = createApp({
    db, providers: { kakao: fake }, allowedOrigins: [ORIGIN],
    redirectUri: "http://x/cb", now: () => NOW, secureCookies: false,
  });
  // 공용 seed: 학원 + 원생 + 선등록 연락처
  await db.insert(s.academies).values({
    id: "a_wg", organizationId: "o_wg", name: "원더짐 아카데미", themeColor: "#12B5A5",
    themeInk: "#087F73", logoEmoji: "🐯", ownerName: "김도윤", billingCycleDefault: 3,
  });
  await db.insert(s.participants).values({
    id: "p_dodam", academyId: "a_wg", name: "김도담", birth: "2017-04-10", ageLabel: "8세",
  });
  await db.insert(s.registeredGuardianContacts).values({
    id: "rgc_1", academyId: "a_wg", participantId: "p_dodam", phone: "01030001234",
  });
});

beforeEach(() => { NOW = "2026-07-16T10:00:00.000Z"; });

/* 로그인 + OTP 세션 seed 헬퍼 */
async function loginAndOtp(code: string, phone = "010-3000-1234") {
  const startRes = await app.request("/auth/kakao/start", { method: "POST" });
  const { state } = await startRes.json() as { state: string };
  const cb = await app.request(`/auth/kakao/callback?code=${code}&state=${state}`);
  assert.equal(cb.status, 200);
  const { userId } = await cb.json() as { userId: string };
  const setCookies = cb.headers.getSetCookie();
  const cookie = setCookies.map((c) => c.split(";")[0]).join("; ");
  const csrf = setCookies.find((c) => c.startsWith("pf_csrf="))!.split(";")[0].split("=")[1];
  // 서버 OTP 검증 통과를 시뮬 — 실서비스는 SMS OTP 엔드포인트가 발급
  const otpId = `gvs_${code}_${++seq}`;
  await db.insert(s.guardianVerificationSessions).values({
    id: otpId, issuedToUserId: userId, purpose: "GUARDIAN_LINK",
    verifiedPhone: phone, verifiedAt: NOW,
    expiresAt: new Date(Date.parse(NOW) + 10 * 60_000).toISOString(),
  });
  return { cookie, csrf, userId, otpId };
}

function linkBody(otpId: string, over: Record<string, unknown> = {}) {
  return JSON.stringify({
    verificationSessionId: otpId, childName: "김도담", childBirth: "2017-04-10",
    relationshipType: "MOTHER", consentPolicyVersion: "v1.0", consentAgreed: true, ...over,
  });
}
const postLink = (cookie: string, csrf: string, body: string) =>
  app.request("/academies/a_wg/guardian-links", {
    method: "POST",
    headers: { cookie, origin: ORIGIN, "x-csrf-token": csrf, "content-type": "application/json" },
    body,
  });

test("정상: 선등록 연락처 결합 → 201 VERIFIED + 링크 생성 + OTP 1회 소비", async () => {
  const { cookie, csrf, otpId } = await loginAndOtp("mom1");
  const res = await postLink(cookie, csrf, linkBody(otpId));
  assert.equal(res.status, 201);
  const body = await res.json() as { status: string; linkId: string; participantId: string };
  assert.equal(body.status, "VERIFIED");
  assert.equal(body.participantId, "p_dodam");
  // OTP 세션이 소비되고 링크에 귀속됨
  const ses = await db.select().from(s.guardianVerificationSessions)
    .where(eq(s.guardianVerificationSessions.id, otpId));
  assert.ok(ses[0].consumedAt);
  assert.equal(ses[0].consumedByLinkId, body.linkId);
});

test("R5: 소비된 OTP 세션 재사용 → 거부(1회 소비)", async () => {
  const { cookie, csrf, otpId } = await loginAndOtp("mom2");
  assert.equal((await postLink(cookie, csrf, linkBody(otpId))).status, 201);
  // LCV1 6.5: 같은 OTP 재사용 = 명시적 409(수동심사 항목 생성 안 함)
  const replay = await postLink(cookie, csrf, linkBody(otpId));
  assert.equal(replay.status, 409);
  const body = await replay.json() as { error: string };
  assert.equal(body.error, "OTP_SESSION_ALREADY_USED");
});

test("공격: 미등록 전화 OTP → 자동 VERIFIED 금지(PENDING) — 링크·소비 없음(rollback 무결성)", async () => {
  const { cookie, csrf, otpId } = await loginAndOtp("stranger", "010-9999-0000");
  const res = await postLink(cookie, csrf, linkBody(otpId));
  assert.equal(res.status, 202);
  assert.equal(((await res.json()) as { status: string }).status, "PENDING");
  // 부수효과 없음: OTP 미소비
  const ses = await db.select().from(s.guardianVerificationSessions)
    .where(eq(s.guardianVerificationSessions.id, otpId));
  assert.equal(ses[0].consumedAt, null);
});

test("초대코드 경로: hash 결합 → VERIFIED + redemption(정본) 기록 + usedCount 캐시", async () => {
  await db.insert(s.participants).values({
    id: "p_seojun", academyId: "a_wg", name: "김서준", birth: "2018-08-22", ageLabel: "7세",
  });
  await db.insert(s.guardianInvites).values({
    id: "gi_1", codeHash: sha256Hex("INV-SEOJUN-01"), academyId: "a_wg", participantId: "p_seojun",
    expiresAt: "2026-07-17T00:00:00Z", maxUses: 1,
  });
  const { cookie, csrf, otpId } = await loginAndOtp("dad1", "010-7777-1111"); // 미등록 전화 — invite 로만 결합
  const res = await postLink(cookie, csrf, linkBody(otpId, {
    childName: "김서준", childBirth: "2018-08-22", relationshipType: "FATHER",
    academyInviteCode: "INV-SEOJUN-01",
  }));
  assert.equal(res.status, 201);
  const reds = await db.select().from(s.guardianInviteRedemptions)
    .where(eq(s.guardianInviteRedemptions.inviteId, "gi_1"));
  assert.equal(reds.length, 1); // 정본 기록
  const inv = await db.select().from(s.guardianInvites).where(eq(s.guardianInvites.id, "gi_1"));
  assert.equal(inv[0].usedCount, 1); // 캐시 동기
});

test("R5: single-use 초대코드 재사용 → 정확히 1개만 성공(정본 COUNT 재검증)", async () => {
  const other = await loginAndOtp("dad2", "010-7777-2222");
  const replay = await postLink(other.cookie, other.csrf, linkBody(other.otpId, {
    childName: "김서준", childBirth: "2018-08-22", relationshipType: "FATHER",
    academyInviteCode: "INV-SEOJUN-01", // 위 테스트에서 이미 1/1 소진
  }));
  assert.equal(replay.status, 202);
  assert.equal(((await replay.json()) as { status: string }).status, "PENDING");
  const reds = await db.select().from(s.guardianInviteRedemptions)
    .where(eq(s.guardianInviteRedemptions.inviteId, "gi_1"));
  assert.equal(reds.length, 1); // 여전히 1
});

test("공격: 위조 초대코드(관계없는 유효 invite 존재) → hash 불일치 거부", async () => {
  const { cookie, csrf, otpId } = await loginAndOtp("dad3", "010-7777-3333");
  const res = await postLink(cookie, csrf, linkBody(otpId, {
    childName: "김서준", childBirth: "2018-08-22", relationshipType: "FATHER",
    academyInviteCode: "GUESSED-CODE",
  }));
  assert.equal(res.status, 202); // PENDING — 유효 invite 가 DB 에 있어도 요청 코드와 결합 안 됨
});

test("runtime validation(R5 P0): 형식 오류·예상 밖 필드 = 422", async () => {
  const { cookie, csrf, otpId } = await loginAndOtp("mom3");
  const badBirth = await postLink(cookie, csrf, linkBody(otpId, { childBirth: "2017/04/10" }));
  assert.equal(badBirth.status, 422);
  const extraField = await postLink(cookie, csrf, linkBody(otpId, { isAdmin: true }));
  assert.equal(extraField.status, 422); // strict — 예상하지 않은 필드 거부
  const notJson = await app.request("/academies/a_wg/guardian-links", {
    method: "POST", headers: { cookie, origin: ORIGIN, "x-csrf-token": csrf }, body: "not-json",
  });
  assert.equal(notJson.status, 422);
});

/* ── R7 P0-7: 최소 권한 + Primary 정책 ── */

test("R7: 초대코드 연결 = invite.allowedScopes 만(기본: 일정·출결) — 건강·결제 권한 없음", async () => {
  await db.insert(s.participants).values({
    id: "p_scope", academyId: "a_wg", name: "권한테스트", birth: "2018-01-01", ageLabel: "7세",
  });
  await db.insert(s.guardianInvites).values({
    id: "gi_scope", codeHash: sha256Hex("INV-SCOPE"), academyId: "a_wg", participantId: "p_scope",
    expiresAt: "2026-07-18T00:00:00Z", maxUses: 2, // allowedScopes 미지정 = 기본 최소
  });
  const { cookie, csrf, otpId } = await loginAndOtp("scopedad", "010-5555-0001");
  const res = await postLink(cookie, csrf, linkBody(otpId, {
    childName: "권한테스트", childBirth: "2018-01-01", relationshipType: "FATHER",
    academyInviteCode: "INV-SCOPE",
  }));
  assert.equal(res.status, 201);
  const { linkId } = await res.json() as { linkId: string };
  const link = (await db.select().from(s.guardianParticipantLinks)
    .where(eq(s.guardianParticipantLinks.id, linkId)))[0];
  // 최소 권한: 일정·출결만 — 민감 권한은 명시 부여 전까지 false
  assert.equal(link.canViewSchedule, true);
  assert.equal(link.canViewAttendance, true);
  assert.equal(link.canViewHealthInfo, false);
  assert.equal(link.canReceivePhotos, false);
  assert.equal(link.canPay, false);
  assert.equal(link.canRequestRefund, false);
  assert.equal(link.isPrimaryGuardian, true); // 첫 보호자 = primary
});

test("R7: 두 번째 보호자는 primary 아님(원생당 1명) + 선등록 결합은 전체 권한", async () => {
  await db.insert(s.registeredGuardianContacts).values({
    id: "rgc_scope", academyId: "a_wg", participantId: "p_scope", phone: "01055550002",
  });
  const { cookie, csrf, otpId } = await loginAndOtp("scopemom", "010-5555-0002");
  const res = await postLink(cookie, csrf, linkBody(otpId, {
    childName: "권한테스트", childBirth: "2018-01-01", relationshipType: "MOTHER",
  }));
  assert.equal(res.status, 201);
  const { linkId } = await res.json() as { linkId: string };
  const link = (await db.select().from(s.guardianParticipantLinks)
    .where(eq(s.guardianParticipantLinks.id, linkId)))[0];
  assert.equal(link.isPrimaryGuardian, false);   // 이미 primary 존재 → false
  assert.equal(link.canViewHealthInfo, true);    // 선등록(원장 등록) = 전체 권한
  assert.equal(link.canPay, true);
});

test("QA 17.2: 미래 생년(2126)·달력 위반(2월 30일) → 422", async () => {
  const { cookie, csrf, otpId } = await loginAndOtp("futuremom");
  const future = await postLink(cookie, csrf, linkBody(otpId, { childBirth: "2126-01-01" }));
  assert.equal(future.status, 422);
  const badCal = await postLink(cookie, csrf, linkBody(otpId, { childBirth: "2020-02-30" }));
  assert.equal(badCal.status, 422);
});

test("guard 체인: 미인증 401 · CSRF 없음 403 — 연결 API 도 동일 경계", async () => {
  assert.equal((await app.request("/academies/a_wg/guardian-links", { method: "POST" })).status, 401);
  const { cookie, otpId } = await loginAndOtp("mom4");
  const noCsrf = await app.request("/academies/a_wg/guardian-links", {
    method: "POST", headers: { cookie, origin: ORIGIN, "content-type": "application/json" },
    body: linkBody(otpId),
  });
  assert.equal(noCsrf.status, 403);
});
