/* R8 피드백 P0 — 이름 정합성 자동 테스트
   "반 담당자·채팅 상대·원생 담당자 이름을 동일한 사용자 ID 에서 가져오기 +
    임시 이름(김코치·이코치·박코치식 저장) 제거 + 앱 간 동일 인물 이름 일치"
   원칙: 정본(fixture users)에는 실명만 저장, 호칭(코치·선생님)은 화면 문맥에서. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import * as fx from "../lib/fixtures";
import { COACHES as PC_COACHES } from "../app/pc/_data";
import { COACHES as OWNER_COACHES } from "../app/owner/_data";
import { ACADEMIES } from "../app/admin/_data";
import { coach as coachApp } from "../app/coach/_data";

const fixtureNames = new Set(fx.users.map((u) => u.name));

test("정본(fixture users)에 임시 이름 없음 — 'X코치'식 저장 금지", () => {
  for (const u of fx.users) {
    assert.ok(!/^[가-힣]코치$/.test(u.name), `임시 이름 저장 발견: ${u.name}`);
    assert.ok(!u.name.endsWith(" 코치") && !u.name.endsWith("선생님"),
      `호칭이 이름에 저장됨: ${u.name} — 호칭은 화면 문맥에서`);
  }
});

test("pc 콘솔 COACHES 이름 = fixture 정본 실명", () => {
  for (const c of PC_COACHES) {
    assert.ok(fixtureNames.has(c.nm), `pc 코치 '${c.nm}' 가 정본에 없음`);
  }
});

test("owner 앱 COACHES = 정본 실명 + 화면 호칭('N 코치') 분리", () => {
  for (const c of OWNER_COACHES) {
    const realName = c.name.replace(/ 코치$/, "");
    assert.ok(fixtureNames.has(realName), `owner 코치 '${c.name}' 실명이 정본에 없음`);
  }
});

test("admin 원더짐 행 원장 이름 = fixture 정본", () => {
  const wg = ACADEMIES.find((a) => a.id === "wondergym")!;
  assert.equal(wg.owner, fx.academy.ownerName); // 김도윤
});

test("coach 앱 로그인 코치 = fixture 김선재 (같은 인물, 같은 이름)", () => {
  assert.equal(coachApp.name, "김선재");
  assert.ok(fixtureNames.has(coachApp.name));
  assert.equal(coachApp.academy, fx.academy.name);
});

/* R8 회귀 방지 — 위 테스트들은 정본·COACHES 목록만 검사해서 화면 카피 문자열 속
   "박코치"식 리터럴(select 페이지·parent CONTENT 강동 수영 등)을 놓쳤음.
   app/·lib/ 소스 전체를 스캔해 '성+코치' 리터럴 재유입을 차단한다.
   (파생 표기 `${...charAt(0)}코치`·"김선재 코치"처럼 띄어 쓴 화면 호칭은 걸리지 않음) */
const WEB_ROOT = fileURLToPath(new URL("..", import.meta.url));
/* 원더짐 밖 플랫폼 목업 페르소나(송파 키즈FC 원장 "최코치") — 별도 결정 전 보류 */
const ALLOWED_PERSONAS = ["최코치"];

function* walkTs(dir: string): Generator<string> {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walkTs(p);
    else if (/\.(ts|tsx)$/.test(e.name)) yield p;
  }
}

test("app/·lib/ 소스 리터럴에 '성+코치' 임시 이름 없음", () => {
  const bad: string[] = [];
  for (const dir of ["app", "lib"]) {
    for (const file of walkTs(join(WEB_ROOT, dir))) {
      let src = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");
      for (const ok of ALLOWED_PERSONAS) src = src.split(ok).join("");
      const hits = src.match(/(?<![가-힣])[가-힣]코치/g);
      if (hits) bad.push(`${relative(WEB_ROOT, file)}: ${[...new Set(hits)].join(", ")}`);
    }
  }
  assert.deepEqual(bad, [], `임시 이름 리터럴 발견 — 실명으로 교체 필요:\n${bad.join("\n")}`);
});
