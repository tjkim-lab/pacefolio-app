/* 사진 동의: 목적×대상 grant 교차조합 차단 (리뷰 R2 P0-9) */
import { test } from "node:test";
import assert from "node:assert/strict";
import { asId } from "../ids";
import type { AcademyId } from "../ids";
import {
  canSendPhoto, canSendPhotoAsset,
  type PhotoConsentRecord, type PhotoAsset,
} from "../consent";

const base: PhotoConsentRecord = {
  id: asId("cr_1"), policyId: asId("cp_1"), policyVersion: "v1",
  academyId: asId("aca_1"), guardianId: asId("g_1"), participantId: asId("p_1"),
  grants: [
    { purpose: "INDIVIDUAL_DELIVERY", audience: "GUARDIAN_ONLY" },
    { purpose: "INTERNAL_RECORD", audience: "ACADEMY_INTERNAL" },
  ],
  consentedAt: "2026-07-01T00:00:00Z", channel: "APP",
};
const NOW = "2026-07-16T00:00:00Z";

test("동의한 조합은 허용", () => {
  assert.ok(canSendPhoto(base, "INDIVIDUAL_DELIVERY", "GUARDIAN_ONLY", NOW));
  assert.ok(canSendPhoto(base, "INTERNAL_RECORD", "ACADEMY_INTERNAL", NOW));
});

test("교차조합 차단: 존재하지 않던 목적×대상은 불가(이전 취약점)", () => {
  // 목적은 INDIVIDUAL_DELIVERY(동의됨), 대상은 ACADEMY_INTERNAL(다른 grant의 것) → 조합은 미동의
  assert.equal(canSendPhoto(base, "INDIVIDUAL_DELIVERY", "ACADEMY_INTERNAL", NOW), false);
  assert.equal(canSendPhoto(base, "INTERNAL_RECORD", "GUARDIAN_ONLY", NOW), false);
});

test("홍보/외부광고 등 미동의 목적 차단", () => {
  assert.equal(canSendPhoto(base, "EXTERNAL_AD", "PUBLIC", NOW), false);
});

test("철회 시 전면 차단", () => {
  const revoked = { ...base, revokedAt: "2026-07-10T00:00:00Z" };
  assert.equal(canSendPhoto(revoked, "INDIVIDUAL_DELIVERY", "GUARDIAN_ONLY", NOW), false);
});

test("만료 시 차단", () => {
  const expired = { ...base, expiresAt: "2026-07-15T00:00:00Z" };
  assert.equal(canSendPhoto(expired, "INDIVIDUAL_DELIVERY", "GUARDIAN_ONLY", NOW), false);
});

/* ── 자산(개별 사진) 단위 검증 — B4 잔여 ── */

// p_1(base) + p_2(같은 학원, 같은 grant) 동의기록
const consentP2: PhotoConsentRecord = {
  ...base, id: asId("cr_2"), guardianId: asId("g_2"), participantId: asId("p_2"),
};
// 반공유 단체사진: p_1, p_2 두 명 등장
const groupAsset: PhotoAsset = {
  id: asId("ph_1"), academyId: asId("aca_1"),
  depictedParticipantIds: [asId("p_1"), asId("p_2")],
};

test("자산: 등장 원생 전원 동의 → 발송 허용", () => {
  const d = canSendPhotoAsset(groupAsset, [base, consentP2], "INDIVIDUAL_DELIVERY", "GUARDIAN_ONLY", NOW);
  assert.equal(d.allowed, true);
  assert.deepEqual(d.blockedParticipantIds, []);
});

test("단체사진: 한 명이라도 미동의면 차단 + 막는 원생 식별", () => {
  // p_2 동의기록 없음 → p_2가 발송을 막음
  const d = canSendPhotoAsset(groupAsset, [base], "INDIVIDUAL_DELIVERY", "GUARDIAN_ONLY", NOW);
  assert.equal(d.allowed, false);
  assert.deepEqual(d.blockedParticipantIds, [asId("p_2")]);
});

test("단체사진: 한 명 철회 시 그 원생이 blocked", () => {
  const revokedP2 = { ...consentP2, revokedAt: "2026-07-10T00:00:00Z" };
  const d = canSendPhotoAsset(groupAsset, [base, revokedP2], "INDIVIDUAL_DELIVERY", "GUARDIAN_ONLY", NOW);
  assert.equal(d.allowed, false);
  assert.deepEqual(d.blockedParticipantIds, [asId("p_2")]);
});

test("자산: 교차조합(미동의 목적×대상)은 전원 차단", () => {
  const d = canSendPhotoAsset(groupAsset, [base, consentP2], "EXTERNAL_AD", "PUBLIC", NOW);
  assert.equal(d.allowed, false);
  assert.deepEqual(d.blockedParticipantIds, [asId("p_1"), asId("p_2")]);
});

test("테넌트 무결성: 다른 학원의 동의기록은 인정 안 함", () => {
  const otherAcademyConsent = { ...consentP2, academyId: asId<AcademyId>("aca_2") };
  const d = canSendPhotoAsset(groupAsset, [base, otherAcademyConsent], "INDIVIDUAL_DELIVERY", "GUARDIAN_ONLY", NOW);
  assert.equal(d.allowed, false);
  assert.deepEqual(d.blockedParticipantIds, [asId("p_2")]);
});

test("자산: 등장 원생 없으면 게이트 대상 없음 → 허용", () => {
  const scenery: PhotoAsset = { id: asId("ph_2"), academyId: asId("aca_1"), depictedParticipantIds: [] };
  const d = canSendPhotoAsset(scenery, [base], "INDIVIDUAL_DELIVERY", "GUARDIAN_ONLY", NOW);
  assert.equal(d.allowed, true);
  assert.deepEqual(d.blockedParticipantIds, []);
});

test("자산: 같은 원생 중복 등장은 한 번만 판정", () => {
  const dupAsset: PhotoAsset = {
    id: asId("ph_3"), academyId: asId("aca_1"),
    depictedParticipantIds: [asId("p_2"), asId("p_2")],
  };
  const d = canSendPhotoAsset(dupAsset, [base], "INDIVIDUAL_DELIVERY", "GUARDIAN_ONLY", NOW);
  assert.equal(d.allowed, false);
  assert.deepEqual(d.blockedParticipantIds, [asId("p_2")]);
});
