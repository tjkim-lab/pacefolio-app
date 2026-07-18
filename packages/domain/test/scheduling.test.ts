/* 기본선 1단계 — 수업 유형 3종 검증 + 반복 일정 전개(달력 산술). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateScheduleSlots, expandWeeklySchedule } from "../scheduling";

test("슬롯 검증 — 유형별 규칙", () => {
  const mw = [
    { weekday: 1, startTime: "14:30", endTime: "15:30" },
    { weekday: 3, startTime: "14:30", endTime: "15:30" },
  ];
  assert.equal(validateScheduleSlots("FIXED_WEEKLY", mw).ok, true);
  // FIXED 인데 요일별 시간이 다르면 거부(VARIABLE 로 유도)
  assert.equal(validateScheduleSlots("FIXED_WEEKLY", [
    { weekday: 1, startTime: "13:00", endTime: "14:00" },
    { weekday: 3, startTime: "14:00", endTime: "15:00" },
  ]).ok, false);
  assert.equal(validateScheduleSlots("VARIABLE_BY_WEEKDAY", [
    { weekday: 1, startTime: "13:00", endTime: "14:00" },
    { weekday: 3, startTime: "14:00", endTime: "15:00" },
  ]).ok, true);
  // VARIABLE 요일 중복 금지
  assert.equal(validateScheduleSlots("VARIABLE_BY_WEEKDAY", [
    { weekday: 1, startTime: "13:00", endTime: "14:00" },
    { weekday: 1, startTime: "15:00", endTime: "16:00" },
  ]).ok, false);
  // PARTICIPANT_SPECIFIC 은 원생 필수 · 단체반은 원생 금지
  assert.equal(validateScheduleSlots("PARTICIPANT_SPECIFIC", [
    { weekday: 6, startTime: "10:00", endTime: "10:50" },
  ]).ok, false);
  assert.equal(validateScheduleSlots("PARTICIPANT_SPECIFIC", [
    { weekday: 6, startTime: "10:00", endTime: "10:50", participantId: "p_1" },
  ]).ok, true);
  assert.equal(validateScheduleSlots("FIXED_WEEKLY", [
    { weekday: 1, startTime: "14:30", endTime: "15:30", participantId: "p_1" },
  ]).ok, false);
  // 시간 형식·역전
  assert.equal(validateScheduleSlots("FIXED_WEEKLY", [
    { weekday: 1, startTime: "25:00", endTime: "26:00" },
  ]).ok, false);
  assert.equal(validateScheduleSlots("FIXED_WEEKLY", [
    { weekday: 1, startTime: "15:00", endTime: "14:00" },
  ]).ok, false);
});

test("반복 전개 — 2026-07-20(월)~08-02(일) 월·수 = 정확히 4회", () => {
  const out = expandWeeklySchedule({
    slots: [
      { weekday: 1, startTime: "14:30", endTime: "15:30" },
      { weekday: 3, startTime: "14:30", endTime: "15:30" },
    ],
    rangeStart: "2026-07-20", rangeEnd: "2026-08-02",
  });
  assert.deepEqual(out.map((s) => s.date), ["2026-07-20", "2026-07-22", "2026-07-27", "2026-07-29"]);
  assert.ok(out.every((s) => s.startTime === "14:30"));
});

test("반복 전개 — 원생별 슬롯 유지 + 잘못된 범위 = 빈 배열", () => {
  const out = expandWeeklySchedule({
    slots: [{ weekday: 6, startTime: "10:00", endTime: "10:50", participantId: "p_1" }],
    rangeStart: "2026-07-20", rangeEnd: "2026-07-26",
  });
  assert.equal(out.length, 1);
  assert.equal(out[0].date, "2026-07-25"); // 토
  assert.equal(out[0].participantId, "p_1");
  assert.equal(expandWeeklySchedule({ slots: [], rangeStart: "2026-08-01", rangeEnd: "2026-07-01" }).length, 0);
});
