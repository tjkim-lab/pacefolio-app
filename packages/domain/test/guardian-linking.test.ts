/* 보호자-자녀 연결: OTP 주체↔등록 보호자 결합 (리뷰 R2 P0-5) */
import { test } from "node:test";
import assert from "node:assert/strict";
import { asId } from "../ids";
import type { Participant } from "../entities";
import {
  evaluateLink, normalizePhone, isInviteUsable,
  type LinkRequest, type LinkContext, type GuardianVerificationSession,
  type RegisteredGuardianContact, type GuardianInvite,
} from "../guardian-linking";

const ACA = asId<Participant["academyId"]>("aca_1");
const child: Participant = {
  id: asId("p_child"), academyId: ACA, name: "김하준", birth: "2016-05-10", ageLabel: "9세",
};
const session: GuardianVerificationSession = {
  id: asId("vs_1"), issuedToUserId: asId("u_actor"), purpose: "GUARDIAN_LINK",
  verifiedPhone: "010-1234-5678",
  verifiedAt: "2026-07-16T00:00:00Z", expiresAt: "2026-07-16T00:10:00Z",
};
const contact: RegisteredGuardianContact = {
  academyId: ACA, participantId: child.id, phone: "01012345678",
};
const baseReq: LinkRequest = {
  academyId: ACA, verificationSessionId: asId("vs_1"),
  childName: "김하준", childBirth: "2016-05-10", relationshipType: "MOTHER",
  consentPolicyVersion: "v1", consentAgreed: true,
};
const baseCtx = (over: Partial<LinkContext>): LinkContext => ({
  actorUserId: asId("u_actor"),
  session, participants: [child], registeredContacts: [contact],
  nowISO: "2026-07-16T00:05:00Z", ...over,
});

test("정상: OTP 전화 = 선등록 보호자 연락처 → VERIFIED", () => {
  const r = evaluateLink(baseReq, baseCtx({}));
  assert.equal(r.status, "VERIFIED");
  assert.equal(r.participantId, child.id);
});

test("공격 시나리오: 남의 자녀 이름/생년은 알지만 등록 연락처 아님 → 자동 VERIFIED 금지(PENDING)", () => {
  const attackerSession: GuardianVerificationSession = { ...session, verifiedPhone: "010-9999-0000" };
  const r = evaluateLink(baseReq, baseCtx({ session: attackerSession }));
  assert.equal(r.status, "PENDING"); // 이전 취약점이면 VERIFIED 였음
});

test("OTP 세션 만료 → PENDING(재인증)", () => {
  const r = evaluateLink(baseReq, baseCtx({ nowISO: "2026-07-16T00:20:00Z" }));
  assert.equal(r.status, "PENDING");
});

test("세션 없음(클라 boolean 신뢰 안 함) → PENDING", () => {
  const r = evaluateLink(baseReq, baseCtx({ session: null }));
  assert.equal(r.status, "PENDING");
});

test("등록 원생과 이름/생년 불일치 → REJECTED", () => {
  const r = evaluateLink({ ...baseReq, childName: "다른아이" }, baseCtx({}));
  assert.equal(r.status, "REJECTED");
});

/* ── 초대코드: 학원·원생 귀속 (R3 P0-5) ── */
const invite = (over: Partial<GuardianInvite>): GuardianInvite => ({
  codeHash: "h_INV-OK", academyId: ACA, participantId: child.id,
  expiresAt: "2026-07-17T00:00:00Z", maxUses: 1, usedCount: 0, ...over,
});
const otherSession: GuardianVerificationSession = { ...session, verifiedPhone: "010-9999-0000" };

const H_OK = "h_INV-OK"; // 서버가 계산한 hash(요청 코드) — invite.codeHash 와 결합

test("연락처 미등록이라도 이 원생에 귀속된 유효 초대코드면 VERIFIED", () => {
  const r = evaluateLink(
    { ...baseReq, academyInviteCode: "INV-OK" },
    baseCtx({ session: otherSession, registeredContacts: [], invite: invite({}), requestCodeHash: H_OK }),
  );
  assert.equal(r.status, "VERIFIED");
});

test("R3: 다른 원생의 초대코드 → 자동 VERIFIED 금지(PENDING)", () => {
  const r = evaluateLink(
    { ...baseReq, academyInviteCode: "INV-OK" },
    baseCtx({ session: otherSession, registeredContacts: [], invite: invite({ participantId: asId<Participant["id"]>("p_someone_else") }), requestCodeHash: H_OK }),
  );
  assert.equal(r.status, "PENDING");
});

test("R3: 만료·철회·사용소진·지정전화 불일치 초대코드 전부 무효", () => {
  const now = "2026-07-16T00:05:00Z";
  assert.equal(isInviteUsable(invite({ expiresAt: "2026-07-15T00:00:00Z" }), H_OK, ACA, child.id, "010-9999-0000", now), false); // 만료
  assert.equal(isInviteUsable(invite({ revokedAt: "2026-07-15T00:00:00Z" }), H_OK, ACA, child.id, "010-9999-0000", now), false); // 철회
  assert.equal(isInviteUsable(invite({ usedCount: 1 }), H_OK, ACA, child.id, "010-9999-0000", now), false); // 소진
  assert.equal(isInviteUsable(invite({ intendedPhone: "010-1111-2222" }), H_OK, ACA, child.id, "010-9999-0000", now), false); // 지정전화 불일치
  assert.ok(isInviteUsable(invite({ intendedPhone: "010-9999-0000" }), H_OK, ACA, child.id, "010 9999 0000", now)); // 정규화 일치
});

test("R3: 타 학원 초대코드 무효", () => {
  assert.equal(isInviteUsable(invite({ academyId: asId<Participant["academyId"]>("aca_other") }), H_OK, ACA, child.id, "010-9999-0000", "2026-07-16T00:05:00Z"), false);
});

/* ── R4 P0-4: 요청 코드 ↔ invite hash 결합 ── */

test("R4: 임의 코드 문자열 + 관계없는 유효 invite → 거부(hash 불일치)", () => {
  // 공격: 유효한 invite 가 ctx 에 실려 와도 요청 코드가 그 invite 것이 아니면 무효
  const r = evaluateLink(
    { ...baseReq, academyInviteCode: "GUESSED-CODE" },
    baseCtx({
      session: otherSession, registeredContacts: [],
      invite: invite({}),                    // codeHash = h_INV-OK
      requestCodeHash: "h_GUESSED-CODE",     // 요청 코드의 실제 hash
    }),
  );
  assert.equal(r.status, "PENDING");
  assert.equal(isInviteUsable(invite({}), "h_GUESSED-CODE", ACA, child.id, "010-9999-0000", "2026-07-16T00:05:00Z"), false);
  assert.equal(isInviteUsable(invite({}), "", ACA, child.id, "010-9999-0000", "2026-07-16T00:05:00Z"), false); // 빈 hash 도 거부
});

/* ── R4 P0-6: OTP 세션 actor-binding · 목적 · 1회 소비 ── */

test("R4: 남의 OTP 세션 재사용 → 거부(issuedToUserId ≠ actor)", () => {
  const r = evaluateLink(baseReq, baseCtx({ actorUserId: asId<LinkContext["actorUserId"]>("u_attacker") }));
  assert.equal(r.status, "PENDING");
});

test("R4: 다른 목적 세션 재사용 → 거부(purpose ≠ GUARDIAN_LINK)", () => {
  const loginSession = { ...session, purpose: "LOGIN" as unknown as GuardianVerificationSession["purpose"] };
  const r = evaluateLink(baseReq, baseCtx({ session: loginSession }));
  assert.equal(r.status, "PENDING");
});

test("R4: 이미 소비된 세션 재사용 → 거부(consumedAt 1회 소비)", () => {
  const consumed = { ...session, consumedAt: "2026-07-16T00:02:00Z" };
  const r = evaluateLink(baseReq, baseCtx({ session: consumed }));
  assert.equal(r.status, "PENDING");
});

test("전화번호 정규화(+82 / 하이픈)", () => {
  assert.equal(normalizePhone("+82 10-1234-5678"), "01012345678");
  assert.equal(normalizePhone("010-1234-5678"), "01012345678");
});
