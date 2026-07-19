/* 기술 클리어 도메인 불변식 테스트 (지시서 §13 도메인 요구) */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  nextProgressStatus, canClear, validateClearance, isPracticeObservation,
} from "../skill-mastery";

test("연습 횟수만으로 자동 클리어 불가 — CLEARED 는 관찰값이 아니다", () => {
  assert.equal(isPracticeObservation("CLEARED"), false);
  assert.equal(isPracticeObservation("READY_FOR_CLEARANCE"), true);
  assert.equal(isPracticeObservation("PRACTICING"), true);
});

test("진행 상태 — 코치 관찰이 정본(후퇴 허용) · CLEARED 는 연습으로 안 바뀜", () => {
  assert.equal(nextProgressStatus("NOT_STARTED", "INTRODUCED"), "INTRODUCED");
  assert.equal(nextProgressStatus("PRACTICING", "READY_FOR_CLEARANCE"), "READY_FOR_CLEARANCE");
  assert.equal(nextProgressStatus("INDEPENDENT", "ASSISTED"), "ASSISTED"); // 후퇴도 현실
  assert.equal(nextProgressStatus("CLEARED", "PRACTICING"), "CLEARED");    // 클리어 불변
});

test("클리어 확정 — CLEARED 재확정 불가(멱등은 서비스)", () => {
  assert.equal(canClear("PRACTICING"), true);         // 2회 만에 클리어 가능(코치 판단)
  assert.equal(canClear("READY_FOR_CLEARANCE"), true);
  assert.equal(canClear("CLEARED"), false);
});

test("클리어 기준 — required 전부 확인돼야 확정", () => {
  const criteria = [
    { id: "c1", required: true },
    { id: "c2", required: true },
    { id: "c3", required: false },
  ];
  assert.equal(validateClearance(criteria, ["c1", "c2"]).ok, true);        // 선택 기준은 없어도 됨
  assert.equal(validateClearance(criteria, ["c1", "c2", "c3"]).ok, true);
  const miss = validateClearance(criteria, ["c1"]);
  assert.equal(miss.ok, false);
  if (!miss.ok) assert.deepEqual(miss.missing, ["c2"]);
  assert.equal(validateClearance([], []).ok, true); // 기준 없는 기술 = 코치 판단만으로 확정
});
