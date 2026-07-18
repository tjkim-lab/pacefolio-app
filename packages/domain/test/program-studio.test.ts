/* 프로그램 스튜디오 도메인 불변식 테스트 (docs/21) */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canTransitionVersion, isVersionEditable, validateModes,
  revisionEditAction, validateGrowthTagSet, canPlaceActivity,
} from "../program-studio";

test("버전 전이 — PUBLISHED 직접 수정·회귀 금지", () => {
  assert.equal(canTransitionVersion("DRAFT", "PUBLISHED"), true);
  assert.equal(canTransitionVersion("DRAFT", "IN_REVIEW"), true);
  assert.equal(canTransitionVersion("IN_REVIEW", "DRAFT"), true);
  assert.equal(canTransitionVersion("IN_REVIEW", "PUBLISHED"), true);
  assert.equal(canTransitionVersion("PUBLISHED", "ARCHIVED"), true);
  // 금지 전이
  assert.equal(canTransitionVersion("PUBLISHED", "DRAFT"), false);   // 게시본 회귀 금지 — 복제로만
  assert.equal(canTransitionVersion("PUBLISHED", "IN_REVIEW"), false);
  assert.equal(canTransitionVersion("ARCHIVED", "DRAFT"), false);
  assert.equal(canTransitionVersion("ARCHIVED", "PUBLISHED"), false);
});

test("편집 가능 = DRAFT 만", () => {
  assert.equal(isVersionEditable("DRAFT"), true);
  assert.equal(isVersionEditable("IN_REVIEW"), false);
  assert.equal(isVersionEditable("PUBLISHED"), false);
  assert.equal(isVersionEditable("ARCHIVED"), false);
});

test("진행 방식 — 복수 조합 허용·중복/미지값/빈값 거부", () => {
  assert.equal(validateModes(["EXPERIENCE"]).ok, true);
  assert.equal(validateModes(["EXPERIENCE", "SKILL_MASTERY", "SEASONAL"]).ok, true);
  assert.equal(validateModes([]).ok, false);
  assert.equal(validateModes(["EXPERIENCE", "EXPERIENCE"]).ok, false);
  assert.equal(validateModes(["PLAY2"]).ok, false); // 단계명은 mode 가 아니다 — 데이터
});

test("개정 정책 — 게시/수업 참조 시 새 개정판, 아니면 제자리", () => {
  assert.equal(revisionEditAction({ referencedByPublishedCurriculum: false }), "EDIT_IN_PLACE");
  assert.equal(revisionEditAction({ referencedByPublishedCurriculum: true }), "CREATE_NEW_REVISION");
  assert.equal(revisionEditAction({ referencedByPublishedCurriculum: false, referencedBySessionRecords: true }), "CREATE_NEW_REVISION");
});

test("성장영역 태그 — PRIMARY 정확히 1·중복 금지·빈 세트 허용", () => {
  assert.equal(validateGrowthTagSet([]).ok, true);
  assert.equal(validateGrowthTagSet([{ growthDomainId: "g1", role: "PRIMARY" }]).ok, true);
  assert.equal(validateGrowthTagSet([
    { growthDomainId: "g1", role: "PRIMARY" }, { growthDomainId: "g2", role: "SECONDARY" },
  ]).ok, true);
  assert.equal(validateGrowthTagSet([{ growthDomainId: "g1", role: "SECONDARY" }]).ok, false); // PRIMARY 0
  assert.equal(validateGrowthTagSet([
    { growthDomainId: "g1", role: "PRIMARY" }, { growthDomainId: "g2", role: "PRIMARY" },
  ]).ok, false); // PRIMARY 2
  assert.equal(validateGrowthTagSet([
    { growthDomainId: "g1", role: "PRIMARY" }, { growthDomainId: "g1", role: "SECONDARY" },
  ]).ok, false); // 같은 도메인 중복
});

test("ARCHIVED 활동 신규 배치 금지", () => {
  assert.equal(canPlaceActivity("ACTIVE"), true);
  assert.equal(canPlaceActivity("ARCHIVED"), false);
});
