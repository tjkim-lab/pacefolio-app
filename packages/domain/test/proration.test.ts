/* payment-engine 정합 고정 테스트 — 원본 session-counter.test.ts(SC1~7)+prorate 케이스 포팅.
   원본과 결과가 달라지면 이식 드리프트 — 즉시 실패해야 한다. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { countSessions, enrollmentSessions, prorate } from "../proration";

test("SC1 7일 = 주3회 3", () => assert.equal(countSessions("2026-09-01", "2026-09-07", [1, 3, 5]), 3));
test("SC2 14일 = 6", () => assert.equal(countSessions("2026-09-01", "2026-09-14", [1, 3, 5]), 6));
test("SC3 12주 주2회 = 24 (분기 24회)", () => assert.equal(countSessions("2026-09-01", "2026-11-23", [2, 4]), 24));
test("SC4 휴원일 1개 제외", () =>
  assert.equal(countSessions("2026-09-01", "2026-09-07", [0, 1, 2, 3, 4, 5, 6], ["2026-09-03"]), 6));
test("SC5 중간등록 total/remaining", () => {
  const r = enrollmentSessions({ startDate: "2026-09-01", endDate: "2026-09-14" }, [0, 1, 2, 3, 4, 5, 6], "2026-09-08");
  assert.deepEqual(r, { total: 14, remaining: 7 });
});
test("SC6 학기 전 등록 = 전체", () => {
  const r = enrollmentSessions({ startDate: "2026-09-01", endDate: "2026-09-14" }, [0, 1, 2, 3, 4, 5, 6], "2026-08-01");
  assert.deepEqual(r, { total: 14, remaining: 14 });
});
test("SC7 분기24 중 3주뒤 입회 → 남은 18 (→ 일할 3/4)", () => {
  const r = enrollmentSessions({ startDate: "2026-09-01", endDate: "2026-11-23" }, [2, 4], "2026-09-22");
  assert.deepEqual(r, { total: 24, remaining: 18 });
});
test("prorate: 헌법 일할 = 남은/전체 × 요금 · 전액 조건", () => {
  assert.equal(prorate(480_000, 18, 24), 360_000);      // 3/4
  assert.equal(prorate(480_000, 24, 24), 480_000);      // 잔여=전체 → 전액
  assert.equal(prorate(480_000, 30, 24), 480_000);      // 잔여>전체 → 전액
  assert.equal(prorate(480_000, 18, 0), 480_000);       // 분모 0 방어
  assert.equal(prorate(480_000, 18, 24, false), 480_000); // 비활성
  assert.equal(prorate(100_000, 1, 3), 33_333);          // 원 단위 반올림
});
