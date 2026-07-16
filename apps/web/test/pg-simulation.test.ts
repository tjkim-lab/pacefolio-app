/* R5 P0 — PG 시뮬레이터 프로덕션 차단 테스트.
   리뷰 §4 완료 조건:
   - production 에서 mock submit 불가
   - production 에서 mock CAPTURED 전이 불가
   - 승인된 preview(빌드시점 플래그)에서만 simulator 실행
   (완료 URL 직접 접근 시 성공 단정 금지는 R3 P1-6 — receipt 없음 화면) */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

// 게이트는 런타임 평가(pgSimulationEnabled 호출)라 env 를 바꿔가며 검증 가능
import { pgSimulationEnabled, reducer, init } from "../app/parent/_state";

const ORIGINAL_ENV = process.env.NODE_ENV;
const ORIGINAL_FLAG = process.env.NEXT_PUBLIC_PACEFOLIO_PG_SIMULATION;
beforeEach(() => {
  if (ORIGINAL_ENV === undefined) delete (process.env as Record<string, string>).NODE_ENV;
  else process.env.NODE_ENV = ORIGINAL_ENV;
  if (ORIGINAL_FLAG === undefined) delete process.env.NEXT_PUBLIC_PACEFOLIO_PG_SIMULATION;
  else process.env.NEXT_PUBLIC_PACEFOLIO_PG_SIMULATION = ORIGINAL_FLAG;
});

test("게이트 매트릭스: production=차단 · dev=허용 · production+preview 플래그=허용", () => {
  assert.equal(pgSimulationEnabled("production", undefined), false);
  assert.equal(pgSimulationEnabled("production", "0"), false);
  assert.equal(pgSimulationEnabled("production", "1"), true); // 승인된 검토 프리뷰만
  assert.equal(pgSimulationEnabled("development", undefined), true);
  assert.equal(pgSimulationEnabled("test", undefined), true);
});

test("production: mock submit 이 dispatch 돼도 상태 불변(receipt 미생성)", () => {
  process.env.NODE_ENV = "production";
  delete process.env.NEXT_PUBLIC_PACEFOLIO_PG_SIMULATION;
  const st = init();
  const next = reducer(st, { t: "paymentSubmitted", names: ["도담"], method: "신용카드" });
  assert.equal(next, st);            // 참조 동일 = 아무 일도 안 일어남
  assert.ok(!next.receipt);
});

test("production: mock CAPTURED 전이 불가(청구서 PAID 로 못 감)", () => {
  // dev 에서 제출까지 만든 상태를 가정해도, production 전환 후 CAPTURED 는 무시
  const submitted = reducer(init(), { t: "paymentSubmitted", names: ["도담"], method: "신용카드" });
  assert.equal(submitted.receipt?.status, "AUTHORIZED"); // dev 에서는 제출 동작

  process.env.NODE_ENV = "production";
  delete process.env.NEXT_PUBLIC_PACEFOLIO_PG_SIMULATION;
  const next = reducer(submitted, { t: "paymentCaptured" });
  assert.equal(next, submitted);                          // 전이 무시
  assert.equal(next.receipt?.status, "AUTHORIZED");       // CAPTURED 아님
  assert.notEqual(next.invStatus["도담"], "PAID");
});

test("승인된 preview(플래그=1): production 이어도 simulator 동작", () => {
  process.env.NODE_ENV = "production";
  process.env.NEXT_PUBLIC_PACEFOLIO_PG_SIMULATION = "1";
  const submitted = reducer(init(), { t: "paymentSubmitted", names: ["도담"], method: "신용카드" });
  assert.equal(submitted.receipt?.status, "AUTHORIZED");
  const captured = reducer(submitted, { t: "paymentCaptured" });
  assert.equal(captured.receipt?.status, "CAPTURED");
});
