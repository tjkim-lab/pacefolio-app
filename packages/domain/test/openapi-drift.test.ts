/* OpenAPI ↔ domain enum drift 검사 (리뷰 R2 P0-6·§8)
   api/openapi.yaml 의 모든 x-domain-enum 마커를 domain enums.ts 와 대조.
   enum 값이 한쪽만 바뀌면 이 테스트가 깨진다 → 계약 drift 자동 차단. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  ROLES, MEMBERSHIP_STATUS, ATTENDANCE_NOTICE_TYPE, ATTENDANCE_RECORD_STATUS,
  INVOICE_STATUS, PAYMENT_STATUS, REFUND_STATUS, VERIFICATION_STATUS,
  RELATIONSHIP_TYPE, CONSENT_PURPOSE, CONSENT_AUDIENCE,
} from "../enums";

const REGISTRY: Record<string, readonly string[]> = {
  ROLES, MEMBERSHIP_STATUS, ATTENDANCE_NOTICE_TYPE, ATTENDANCE_RECORD_STATUS,
  INVOICE_STATUS, PAYMENT_STATUS, REFUND_STATUS, VERIFICATION_STATUS,
  RELATIONSHIP_TYPE, CONSENT_PURPOSE, CONSENT_AUDIENCE,
};

const yamlPath = fileURLToPath(new URL("../../../api/openapi.yaml", import.meta.url));
const yaml = readFileSync(yamlPath, "utf8");

// flow-style: x-domain-enum: NAME, enum: [A, B, C]
const MARKER = /x-domain-enum:\s*(\w+),\s*enum:\s*\[([^\]]+)\]/g;
const found: Array<{ name: string; values: string[] }> = [];
for (const m of yaml.matchAll(MARKER)) {
  found.push({ name: m[1], values: m[2].split(",").map((s) => s.trim()) });
}

test("x-domain-enum 마커가 충분히 존재(계약 골자 유지)", () => {
  assert.ok(found.length >= 10, `마커 ${found.length}개 — 10개 미만이면 계약이 비었다는 신호`);
});

test("모든 x-domain-enum 이 domain enums.ts 와 값·순서까지 일치", () => {
  for (const f of found) {
    const domainValues = REGISTRY[f.name];
    assert.ok(domainValues, `openapi.yaml 이 참조한 ${f.name} 이 domain 에 없음`);
    assert.deepEqual(
      f.values, [...domainValues],
      `drift: ${f.name}\n  openapi: ${f.values.join(", ")}\n  domain : ${domainValues.join(", ")}`,
    );
  }
});

test("domain 핵심 enum 이 모두 OpenAPI 에 등장(누락 방지)", () => {
  const used = new Set(found.map((f) => f.name));
  for (const name of Object.keys(REGISTRY)) {
    assert.ok(used.has(name), `domain enum ${name} 이 OpenAPI 에 마커로 등장하지 않음`);
  }
});

test("구 경로(lib/domain) 참조 제거 확인", () => {
  assert.equal(yaml.includes("lib/domain"), false);
});

test("멱등·요청추적·페이지네이션 계약 존재", () => {
  assert.ok(yaml.includes("Idempotency-Key"));
  assert.ok(yaml.includes("X-Request-Id"));
  assert.ok(yaml.includes("page[cursor]"));
  assert.ok(yaml.includes("IDEMPOTENCY_KEY_REUSED"));
});

test("리뷰 §8 필수 endpoint 존재(auth·refund 승인·webhook·동의·탈퇴·SupportView)", () => {
  for (const p of [
    "/sessions/me", "/sessions/logout-all", "/auth/{provider}/start",
    "/otp/verifications", "/guardian-links",
    "/refunds/{refundId}/approvals", "/webhooks/pg/{provider}",
    "/photo-consent", "/me/deletion-requests", "/admin/support-view-sessions",
  ]) {
    assert.ok(yaml.includes(p), `endpoint 누락: ${p}`);
  }
});
