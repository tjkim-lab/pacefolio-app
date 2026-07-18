/* 13차 C-2 — 소통 도메인 순수 함수 전용 테스트 (표 기반). */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  requiresAck, canTransitionChatStatus, validateChatCategory, canPostToRoom, dmKey,
  type ChatMessageKind, type ChatMessageStatus,
} from "../chat";

test("requiresAck 표 — 업무 전달만 확인 수명주기", () => {
  const table: [ChatMessageKind, boolean][] = [
    ["NORMAL_CHAT", false],
    ["NOTICE", false],
    ["ACK_REQUIRED", true],
    ["URGENT_ACK_REQUIRED", true],
    ["OPERATIONAL_TASK", true],
  ];
  for (const [kind, expected] of table) {
    assert.equal(requiresAck(kind), expected, `requiresAck(${kind})`);
  }
});

test("상태 전이 — 역행 금지·확인 전 처리 금지·늦은 확인 허용", () => {
  const ok: [ChatMessageStatus, ChatMessageStatus][] = [
    ["SENT", "DELIVERED"], ["SENT", "READ"], ["SENT", "CANCELLED"], ["SENT", "EXPIRED"],
    ["DELIVERED", "READ"], ["READ", "ACKNOWLEDGED"], ["ACKNOWLEDGED", "RESOLVED"],
    ["EXPIRED", "ACKNOWLEDGED"],
  ];
  const bad: [ChatMessageStatus, ChatMessageStatus][] = [
    ["READ", "SENT"], ["ACKNOWLEDGED", "READ"], ["SENT", "RESOLVED"],
    ["READ", "RESOLVED"], ["ACKNOWLEDGED", "CANCELLED"], ["RESOLVED", "ACKNOWLEDGED"],
    ["CANCELLED", "READ"],
  ];
  for (const [f, t] of ok) assert.equal(canTransitionChatStatus(f, t), true, `${f}→${t} 허용`);
  for (const [f, t] of bad) assert.equal(canTransitionChatStatus(f, t), false, `${f}→${t} 금지`);
});

test("민감 카테고리 규칙 — BILLING/HEALTH 조건부 허용의 경계", () => {
  // BILLING: 보호자 DM + 서버 카드 + 원생 지정
  assert.equal(validateChatCategory({ category: "BILLING", roomType: "GUARDIAN_DM", relatedParticipantId: "p", hasContextCard: true }).ok, true);
  assert.equal(validateChatCategory({ category: "BILLING", roomType: "OWNER_COACH_DM", relatedParticipantId: "p", hasContextCard: true }).ok, false);
  assert.equal(validateChatCategory({ category: "BILLING", roomType: "ACADEMY_NOTICE", relatedParticipantId: "p", hasContextCard: true }).ok, false);
  assert.equal(validateChatCategory({ category: "BILLING", roomType: "GUARDIAN_DM", relatedParticipantId: "p", hasContextCard: false }).ok, false);
  assert.equal(validateChatCategory({ category: "BILLING", roomType: "GUARDIAN_DM", relatedParticipantId: null, hasContextCard: true }).ok, false);
  // HEALTH: 원생 지정 + 전체방 금지
  assert.equal(validateChatCategory({ category: "HEALTH", roomType: "GUARDIAN_DM", relatedParticipantId: "p", hasContextCard: false }).ok, true);
  assert.equal(validateChatCategory({ category: "HEALTH", roomType: "OWNER_COACH_DM", relatedParticipantId: "p", hasContextCard: false }).ok, true);
  assert.equal(validateChatCategory({ category: "HEALTH", roomType: "CLASS_GUARDIANS", relatedParticipantId: "p", hasContextCard: false }).ok, false);
  assert.equal(validateChatCategory({ category: "HEALTH", roomType: "COACH_ALL", relatedParticipantId: "p", hasContextCard: false }).ok, false);
  assert.equal(validateChatCategory({ category: "HEALTH", roomType: "GUARDIAN_DM", relatedParticipantId: null, hasContextCard: false }).ok, false);
  // GENERAL 은 제약 없음
  assert.equal(validateChatCategory({ category: "GENERAL", roomType: "ACADEMY_NOTICE", relatedParticipantId: null, hasContextCard: false }).ok, true);
});

test("공지형 학원방 발송 권한 + dmKey 안정성", () => {
  assert.equal(canPostToRoom({ roomType: "ACADEMY_NOTICE", senderRoles: ["OWNER"] }), true);
  assert.equal(canPostToRoom({ roomType: "ACADEMY_NOTICE", senderRoles: ["GUARDIAN"] }), false);
  assert.equal(canPostToRoom({ roomType: "GUARDIAN_DM", senderRoles: ["GUARDIAN"] }), true);
  // dmKey: 참여자 순서 무관 + 원생 컨텍스트 분리
  assert.equal(dmKey("OWNER_COACH_DM", ["u2", "u1"]), dmKey("OWNER_COACH_DM", ["u1", "u2"]));
  assert.notEqual(dmKey("GUARDIAN_DM", ["u1"], "p1"), dmKey("GUARDIAN_DM", ["u1"], "p2"));
});
