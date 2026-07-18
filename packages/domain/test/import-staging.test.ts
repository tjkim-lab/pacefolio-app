/* 가져오기 스테이징 순수 로직 테스트 — 중립 데이터만(지시서 §16) */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseCsv, autoMapColumns, normalizeCell, normalizeRow,
  validateActivityRow, findDuplicateCandidates,
} from "../import-staging";

test("parseCsv — 따옴표·이스케이프·개행 필드·CRLF·BOM·꼬리 빈 행", () => {
  const csv = '﻿Name,설명\r\n"샘플, 활동 A","줄1\n줄2"\r\n샘플 활동 B,"따옴표""포함"\r\n,,\r\n';
  const rows = parseCsv(csv);
  assert.equal(rows.length, 3); // 빈 행 제거
  assert.deepEqual(rows[0], ["Name", "설명"]);
  assert.deepEqual(rows[1], ["샘플, 활동 A", "줄1\n줄2"]);
  assert.deepEqual(rows[2], ["샘플 활동 B", '따옴표"포함']);
});

test("autoMapColumns — 원더짐형 헤더 인식(대소문자·공백 무시)", () => {
  const m = autoMapColumns(["Name", " 설명 ", "Key FMS", "Level", "Age"]);
  assert.equal(m.name, 0);
  assert.equal(m.description, 1);
  assert.equal(m.primaryDomain, 2);
  assert.equal(m.difficultyLabel, 3);
  assert.equal(m.recommendedAgeLabel, 4);
  // 인식 못 하는 헤더는 매핑 없음(자동 확정 금지 — 원장이 지정)
  const none = autoMapColumns(["뭔가", "이상한", "열"]);
  assert.equal(none.name, undefined);
});

test("normalize — 앞뒤·중복 공백 정리, 원본은 건드리지 않음(호출부 보존)", () => {
  assert.equal(normalizeCell("  샘플   활동  A "), "샘플 활동 A");
  const r = normalizeRow(["  샘플 활동 A ", " 설명 ", " 테스트 균형 영역 "], {
    name: 0, description: 1, primaryDomain: 2,
  });
  assert.equal(r.name, "샘플 활동 A");
  assert.equal(r.primaryDomainName, "테스트 균형 영역");
});

test("validate — 이름 없음=INVALID · 미지 영역=경고(커밋 가능)", () => {
  const domains = new Set(["테스트 균형 영역"]);
  const bad = validateActivityRow({ name: "", secondaryDomainNames: [] }, domains);
  assert.equal(bad.status, "INVALID");
  const warn = validateActivityRow(
    { name: "샘플 활동 A", primaryDomainName: "없는 영역", secondaryDomainNames: ["테스트 균형 영역"] },
    domains,
  );
  assert.equal(warn.status, "VALID"); // 경고는 있으나 커밋 가능
  assert.equal(warn.messages.length, 1);
});

test("중복 후보 — 대소문자 무시 제안만(자동 병합 금지)", () => {
  const existing = [{ id: "act_1", name: "샘플 활동 A" }, { id: "act_2", name: "다른 활동" }];
  assert.deepEqual(findDuplicateCandidates("샘플 활동 a", existing), ["act_1"]);
  assert.deepEqual(findDuplicateCandidates("신규 활동", existing), []);
  assert.deepEqual(findDuplicateCandidates("", existing), []);
});
