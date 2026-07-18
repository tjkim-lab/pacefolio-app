/* 13차 A P1 — 금액 검증 전체 경계표.
   isValidMoneyAmount: 소수·NaN·Infinity·안전정수 밖·0·음수·상한 초과 전부 거부.
   라인 검증: type 별 부호 정책(DISCOUNT 음수만 / 그 외 양수만·0 금지). */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_MONEY_AMOUNT, isValidMoneyAmount,
  isValidSignedLineAmount, isValidLineAmountForType, isValidInvoiceTotal,
} from "../billing";

test("isValidMoneyAmount 경계표 — 13차 A 요구 전체", () => {
  const table: [number, boolean][] = [
    [-100_000_001, false],
    [-100_000_000, false],
    [-1, false],
    [0, false],
    [1, true],
    [99_999_999, true],
    [100_000_000, true],   // 정확한 상한 = 허용
    [100_000_001, false],  // 상한 +1 = 거부
    [1.5, false],          // 소수
    [0.0000001, false],
    [NaN, false],
    [Infinity, false],
    [-Infinity, false],
    [Number.MAX_SAFE_INTEGER + 1, false], // 안전 정수 밖
  ];
  for (const [n, expected] of table) {
    assert.equal(isValidMoneyAmount(n), expected, `isValidMoneyAmount(${n}) → ${expected} 이어야 함`);
  }
  assert.equal(MAX_MONEY_AMOUNT, 100_000_000);
  assert.equal(isValidInvoiceTotal, isValidMoneyAmount); // 총액 = 양수·상한 동일 의미
});

test("라인 부호 정책 — DISCOUNT 는 음수만, 그 외는 양수만, 0원 라인 금지", () => {
  // 공통(부호 무관 크기·정수)
  assert.equal(isValidSignedLineAmount(0), false);            // 0원 라인 금지(정책)
  assert.equal(isValidSignedLineAmount(100_000_000), true);   // +1억 정확히 허용
  assert.equal(isValidSignedLineAmount(-100_000_000), true);  // −1억 정확히 허용
  assert.equal(isValidSignedLineAmount(100_000_001), false);
  assert.equal(isValidSignedLineAmount(-100_000_001), false);
  assert.equal(isValidSignedLineAmount(1.5), false);
  assert.equal(isValidSignedLineAmount(NaN), false);
  // type 별 부호
  assert.equal(isValidLineAmountForType("DISCOUNT", -72_000), true);
  assert.equal(isValidLineAmountForType("DISCOUNT", -1), true);
  assert.equal(isValidLineAmountForType("DISCOUNT", 72_000), false); // 양수 할인 금지
  assert.equal(isValidLineAmountForType("DISCOUNT", 0), false);
  assert.equal(isValidLineAmountForType("TUITION", 360_000), true);
  assert.equal(isValidLineAmountForType("TUITION", -360_000), false); // 음수 수강료 금지
  assert.equal(isValidLineAmountForType("VEHICLE", 45_000), true);
  assert.equal(isValidLineAmountForType("OTHER", 0, ), false);
});

test("14차 A 잔여: 타입별 경계값 고정 — 상한 ±1억·0·부호 전 조합", () => {
  // DISCOUNT: 음수만, |n| ≤ 1억
  assert.equal(isValidLineAmountForType("DISCOUNT", -100_000_000), true);
  assert.equal(isValidLineAmountForType("DISCOUNT", -100_000_001), false);
  assert.equal(isValidLineAmountForType("DISCOUNT", 0), false);
  assert.equal(isValidLineAmountForType("DISCOUNT", 1), false);       // 양수 할인 금지
  assert.equal(isValidLineAmountForType("DISCOUNT", 72_000), false);
  // 일반 라인: 양수만, ≤ 1억
  assert.equal(isValidLineAmountForType("TUITION", 1), true);
  assert.equal(isValidLineAmountForType("TUITION", 100_000_000), true);
  assert.equal(isValidLineAmountForType("TUITION", 100_000_001), false);
  assert.equal(isValidLineAmountForType("VEHICLE", 0), false);
  assert.equal(isValidLineAmountForType("VEHICLE", -1), false);
  assert.equal(isValidLineAmountForType("OTHER", -100_000_000), false);
  // 총액: 0·음수·상한 초과 전부 거부
  assert.equal(isValidInvoiceTotal(1), true);
  assert.equal(isValidInvoiceTotal(100_000_000), true);
  assert.equal(isValidInvoiceTotal(100_000_001), false);
  assert.equal(isValidInvoiceTotal(0), false);
  assert.equal(isValidInvoiceTotal(-1), false);
});
