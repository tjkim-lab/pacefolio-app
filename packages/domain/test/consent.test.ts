/* 사진 동의: 목적×대상 grant 교차조합 차단 (리뷰 R2 P0-9) */
import { test } from "node:test";
import assert from "node:assert/strict";
import { asId } from "../ids";
import { canSendPhoto, type PhotoConsentRecord } from "../consent";

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
