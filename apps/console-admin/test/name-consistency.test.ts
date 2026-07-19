/* B5(#55): admin 이름 정합 검사 — web 에서 이관(admin 분리 배포).
   admin 원더짐 행 원장 이름이 fixture 정본(김도윤)과 일치하는지 회귀 방지. */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as fx from "../lib/fixtures";
import { ACADEMIES } from "../app/admin/_data";

test("admin 원더짐 행 원장 이름 = fixture 정본", () => {
  const wg = ACADEMIES.find((a) => a.id === "wondergym")!;
  assert.equal(wg.owner, fx.academy.ownerName); // 김도윤
});
