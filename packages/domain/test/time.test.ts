/* 시간 비교 공통 모듈 — epoch 정규화 + fail-closed (R4 P0-9) */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  toEpochMs, credentialExpired, withinActiveWindow, ageMsOrNull, dedupRecordExpired,
} from "../time";
import { canAdminUseSupportSession, type AuthorizationContext } from "../authorization";
import { isInviteUsable, type GuardianInvite } from "../guardian-linking";
import { asId } from "../ids";

/* ── 문자열 비교가 틀리는 지점을 epoch 이 바로잡는지 ── */

test("offset 섞인 ISO: 문자열 순서 ≠ 시간 순서 — epoch 비교가 정답", () => {
  // 만료 = 12:00+09:00 (= 03:00Z), 현재 = 04:00Z → 실제로는 만료됨.
  // 문자열 비교면 "12:00..." > "04:00..." 이라 미만료로 오판 → 만료 후 접근 허용 사고.
  const expiresAt = "2026-07-16T12:00:00+09:00";
  const now = "2026-07-16T04:00:00Z";
  assert.ok(expiresAt > now, "전제: 문자열 비교는 미만료로 오판");
  assert.equal(credentialExpired(expiresAt, now), true); // epoch 은 만료로 정판
});

test("toEpochMs: 같은 순간의 다른 표기 = 같은 epoch", () => {
  assert.equal(toEpochMs("2026-07-20T18:30:00+09:00"), toEpochMs("2026-07-20T09:30:00Z"));
});

/* ── fail-closed: 파싱 실패 = 거부 방향 ── */

test("credentialExpired: 파싱 불가·누락 = 만료 취급(거부)", () => {
  const now = "2026-07-16T00:00:00Z";
  assert.equal(credentialExpired("garbage", now), true);
  assert.equal(credentialExpired(null, now), true);
  assert.equal(credentialExpired("2026-12-31T00:00:00Z", "garbage"), true);
  assert.equal(credentialExpired("2026-12-31T00:00:00Z", now), false); // 정상 미만료
});

test("withinActiveWindow: 구간 [시작, 종료) + 파싱 불가 = 비활성(거부)", () => {
  const now = "2026-07-16T00:00:00Z";
  assert.equal(withinActiveWindow("2026-07-01T00:00:00Z", null, now), true);
  assert.equal(withinActiveWindow("2026-08-01T00:00:00Z", null, now), false); // 시작 전
  assert.equal(withinActiveWindow("2026-07-01T00:00:00Z", "2026-07-10T00:00:00Z", now), false); // 종료 후
  assert.equal(withinActiveWindow("garbage", null, now), false);
  assert.equal(withinActiveWindow("2026-07-01T00:00:00Z", "garbage", now), false);
});

test("ageMsOrNull: 파싱 불가·미래 기록 = null(호출부 거부)", () => {
  const now = "2026-07-16T00:10:00Z";
  assert.equal(ageMsOrNull("2026-07-16T00:00:00Z", now), 10 * 60_000);
  assert.equal(ageMsOrNull("garbage", now), null);
  assert.equal(ageMsOrNull("2026-07-16T00:20:00Z", now), null); // 미래 MFA 기록 = 무효
});

test("dedupRecordExpired: 방향 반대 — 파싱 불가 = 미만료(중복 차단 유지)", () => {
  const now = "2026-07-16T00:00:00Z";
  assert.equal(dedupRecordExpired("2026-07-01T00:00:00Z", now), true);  // 정상 만료 → 신규 처리
  assert.equal(dedupRecordExpired("garbage", now), false);              // 불량 → 계속 차단(이중 처리 방지)
});

/* ── 실제 보안 경계 통과 검증 (부정 테스트) ── */

test("초대코드: offset 표기 만료를 문자열 비교로 놓치던 케이스 차단", () => {
  const invite: GuardianInvite = {
    codeHash: "h", academyId: asId("aca_1"), participantId: asId("p_1"),
    expiresAt: "2026-07-16T12:00:00+09:00", // = 03:00Z
    maxUses: 1, usedCount: 0,
  };
  // 현재 04:00Z — 실제 만료. 문자열 비교였다면 통과됐을 조합.
  assert.equal(
    isInviteUsable(invite, "h", asId("aca_1"), asId("p_1"), "010-1234-5678", "2026-07-16T04:00:00Z"),
    false,
  );
});

test("Support View: 만료시각 파싱 불가 세션은 사용 불가(fail-closed)", () => {
  const ctx: AuthorizationContext = {
    actorUserId: asId("u_admin"),
    actorPlatformRoles: ["PLATFORM_ADMIN"],
    memberships: [], verifiedLinks: [], assignments: [],
    supportViewSession: {
      id: asId("svs_1"), adminUserId: asId("u_admin"), targetAcademyId: asId("aca_1"),
      supportTicketId: asId("st_1"), reasonCode: "CS", expiresAt: "not-a-date",
    },
    mfaVerifiedAt: "2026-07-16T00:00:00Z",
    nowISO: "2026-07-16T00:05:00Z",
  };
  assert.equal(canAdminUseSupportSession(ctx, asId("aca_1")), false);
});
