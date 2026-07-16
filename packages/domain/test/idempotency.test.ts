/* 멱등 재시도 의미 (리뷰 R2 P0-7) */
import { test } from "node:test";
import assert from "node:assert/strict";
import { asId } from "../ids";
import { resolveIdempotency, type IdempotencyRecord, type IncomingRequest } from "../idempotency";

const rec = (over: Partial<IdempotencyRecord>): IdempotencyRecord => ({
  id: asId("ir_1"), actorId: asId("u_1"), academyId: asId("aca_1"),
  operation: "payment.prepare", idempotencyKey: "k1", requestHash: "h1",
  status: "COMPLETED", createdAt: "2026-07-16T00:00:00Z", expiresAt: "2026-07-17T00:00:00Z",
  ...over,
});
const req = (over: Partial<IncomingRequest>): IncomingRequest => ({
  actorId: asId("u_1"), operation: "payment.prepare", idempotencyKey: "k1",
  requestHash: "h1", nowISO: "2026-07-16T01:00:00Z", ...over,
});

test("레코드 없음 → PROCEED", () => {
  assert.equal(resolveIdempotency(null, req({})).action, "PROCEED");
});

test("같은 key+body, 완료됨 → REPLAY(재시도 안전)", () => {
  assert.equal(resolveIdempotency(rec({}), req({})).action, "REPLAY");
});

test("같은 key, 다른 body → 409 CONFLICT", () => {
  const d = resolveIdempotency(rec({}), req({ requestHash: "h2" }));
  assert.equal(d.action, "CONFLICT");
});

test("처리 중 → IN_PROGRESS", () => {
  assert.equal(resolveIdempotency(rec({ status: "IN_PROGRESS" }), req({})).action, "IN_PROGRESS");
});

test("보관기간 만료 후 재사용 → PROCEED(신규 취급)", () => {
  const d = resolveIdempotency(rec({ expiresAt: "2026-07-16T00:30:00Z" }), req({ nowISO: "2026-07-16T02:00:00Z" }));
  assert.equal(d.action, "PROCEED");
});
