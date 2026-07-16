/* 보호자-자녀 연결: OTP 주체↔등록 보호자 결합 (리뷰 R2 P0-5) */
import { test } from "node:test";
import assert from "node:assert/strict";
import { asId } from "../ids";
import type { Participant } from "../entities";
import {
  evaluateLink, normalizePhone,
  type LinkRequest, type LinkContext, type GuardianVerificationSession,
  type RegisteredGuardianContact,
} from "../guardian-linking";

const ACA = asId<Participant["academyId"]>("aca_1");
const child: Participant = {
  id: asId("p_child"), academyId: ACA, name: "김하준", birth: "2016-05-10", ageLabel: "9세",
};
const session: GuardianVerificationSession = {
  id: asId("vs_1"), verifiedPhone: "010-1234-5678",
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

test("연락처 미등록이라도 유효 초대코드면 VERIFIED", () => {
  const attackerSession: GuardianVerificationSession = { ...session, verifiedPhone: "010-9999-0000" };
  const r = evaluateLink(
    { ...baseReq, academyInviteCode: "INV-OK" },
    baseCtx({ session: attackerSession, registeredContacts: [], validInviteCodes: ["INV-OK"] }),
  );
  assert.equal(r.status, "VERIFIED");
});

test("전화번호 정규화(+82 / 하이픈)", () => {
  assert.equal(normalizePhone("+82 10-1234-5678"), "01012345678");
  assert.equal(normalizePhone("010-1234-5678"), "01012345678");
});
