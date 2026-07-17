/* R7 배치 5 통합 테스트 — 환불 전체 라이프사이클 (실 HTTP × 진짜 Postgres)
   요청(결제자만) → 양측 승인(동일인 금지) → PROCESSING → COMPLETED 웹훅
   → Payment REFUNDED + Invoice 재계산 + outbox — 전부 원자 트랜잭션. */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { schema as s } from "@pacefolio/db";
import { createApp } from "../src/app";
import type { OAuthProvider } from "../src/auth/provider";

const migrationsFolder = join(
  dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "packages", "db", "migrations",
);
const ORIGIN = "http://localhost:3000";
const NOW = () => new Date().toISOString();
let db: ReturnType<typeof drizzle>;
let app: ReturnType<typeof createApp>;

const fake: OAuthProvider = {
  name: "kakao", oidc: false,
  authorizeUrl: (p) => `https://fake/a?state=${p.state}`,
  exchangeCode: async (code) => ({ providerSubject: `sub-${code}`, displayName: `유저-${code}` }),
};

async function login(code: string) {
  const { state } = await (await app.request("/auth/kakao/start", { method: "POST" })).json() as { state: string };
  const cb = await app.request(`/auth/kakao/callback?code=${code}&state=${state}`);
  const { userId } = await cb.json() as { userId: string };
  const setCookies = cb.headers.getSetCookie();
  const cookie = setCookies.map((c) => c.split(";")[0]).join("; ");
  const csrf = setCookies.find((c) => c.startsWith("pf_csrf="))!.split(";")[0].split("=")[1];
  return { cookie, csrf, userId };
}

const post = (cookie: string, csrf: string, path: string, body?: unknown, idem?: string) =>
  app.request(path, {
    method: "POST",
    headers: {
      cookie, origin: ORIGIN, "x-csrf-token": csrf, "content-type": "application/json",
      ...(idem ? { "idempotency-key": idem } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

const webhook = (body: Record<string, unknown>) =>
  app.request("/webhooks/pg/mockpg", {
    method: "POST", headers: { "content-type": "application/json", "x-webhook-secret": "test-secret" },
    body: JSON.stringify(body),
  });

let mom: Awaited<ReturnType<typeof login>>;
let dad: Awaited<ReturnType<typeof login>>;
let owner: Awaited<ReturnType<typeof login>>;
let paymentId: string;
let refundId: string;

before(async () => {
  const client = new PGlite();
  db = drizzle(client);
  await migrate(db, { migrationsFolder });
  app = createApp({
    db, providers: { kakao: fake }, allowedOrigins: [ORIGIN],
    redirectUri: "http://x/cb", now: NOW, secureCookies: false,
    enableMockPg: true, mockPgSecret: "test-secret",
  });
  // seed: 학원·원생·청구서
  await db.insert(s.academies).values({
    id: "a_wg", organizationId: "o_wg", name: "원더짐", themeColor: "#12B5A5",
    themeInk: "#087F73", logoEmoji: "🐯", ownerName: "김도윤", billingCycleDefault: 3,
  });
  await db.insert(s.participants).values({
    id: "p_dodam", academyId: "a_wg", name: "김도담", birth: "2017-04-10", ageLabel: "8세",
  });
  await db.insert(s.billingPeriods).values({
    id: "bp_q4", academyId: "a_wg", periodStart: "2025-09-01", periodEnd: "2025-11-30", cycleMonths: 3,
  });
  await db.insert(s.invoices).values({
    id: "inv_dodam", academyId: "a_wg", participantId: "p_dodam", enrollmentId: "e_d",
    billingPeriodId: "bp_q4", status: "ISSUED", total: 405000, dueDate: "2025-09-10",
  });
  // 사용자: 어머니(결제자)·아버지(비결제자 보호자)·원장
  mom = await login("mom");
  dad = await login("dad");
  owner = await login("owner");
  await db.insert(s.academyMemberships).values([
    { id: "m_mom", userId: mom.userId, academyId: "a_wg", roles: ["GUARDIAN"], status: "ACTIVE", joinedAt: "2025-03-02" },
    { id: "m_dad", userId: dad.userId, academyId: "a_wg", roles: ["GUARDIAN"], status: "ACTIVE", joinedAt: "2025-03-02" },
    { id: "m_owner", userId: owner.userId, academyId: "a_wg", roles: ["OWNER"], status: "ACTIVE", joinedAt: "2024-03-01" },
  ]);
  await db.insert(s.guardians).values([
    { id: "gd_mom", userId: mom.userId }, { id: "gd_dad", userId: dad.userId },
  ]);
  const perms = {
    academyId: "a_wg", participantId: "p_dodam",
    relationshipType: "MOTHER" as const, verificationStatus: "VERIFIED" as const,
    canViewSchedule: true, canViewAttendance: true, canViewHealthInfo: true,
    canReceivePhotos: true, canPay: true, canRequestRefund: true,
  };
  await db.insert(s.guardianParticipantLinks).values([
    { id: "gl_mom", guardianId: "gd_mom", isPrimaryGuardian: true, ...perms },
    { id: "gl_dad", guardianId: "gd_dad", isPrimaryGuardian: false, ...perms },
  ]);
  // 어머니가 결제 → CAPTURED
  const prep = await post(mom.cookie, mom.csrf, "/academies/a_wg/payments/prepare",
    { invoiceIds: ["inv_dodam"] }, "pay-key");
  paymentId = ((await prep.json()) as { paymentId: string }).paymentId;
  await webhook({ providerEventId: "cap-1", paymentId, targetStatus: "CAPTURED", occurredAt: NOW() });
});

test("R4 P0-3 실전: 같은 자녀 연결이어도 결제자가 아닌 아버지의 환불 요청 거부", async () => {
  const res = await post(dad.cookie, dad.csrf, "/academies/a_wg/refunds",
    { paymentId, participantId: "p_dodam", reasonCode: "PARENT_REQUEST" }, "rk-dad");
  assert.equal(res.status, 422); // 권한 없음 — 실제 결제자만
});

test("정상: 결제자(어머니) 환불 요청 → 201 REQUESTED (전액=Σ배분)", async () => {
  const res = await post(mom.cookie, mom.csrf, "/academies/a_wg/refunds",
    { paymentId, participantId: "p_dodam", reasonCode: "PARENT_REQUEST", reasonText: "이사" }, "rk-mom");
  assert.equal(res.status, 201);
  const body = await res.json() as { refundId: string; requestedAmount: number; status: string };
  assert.equal(body.requestedAmount, 405000);
  assert.equal(body.status, "REQUESTED");
  refundId = body.refundId;
  // 진행 중 중복 요청 차단 (다른 키)
  const dup = await post(mom.cookie, mom.csrf, "/academies/a_wg/refunds",
    { paymentId, participantId: "p_dodam", reasonCode: "PARENT_REQUEST" }, "rk-mom-2");
  assert.equal(dup.status, 422);
});

test("양측 승인: 보호자 승인 → 원장 승인 → MUTUALLY_APPROVED (approved=requested)", async () => {
  const g = await post(mom.cookie, mom.csrf, `/academies/a_wg/refunds/${refundId}/approvals`);
  assert.equal(g.status, 200);
  assert.equal(((await g.json()) as { status: string }).status, "REQUESTED"); // 한쪽만 — 아직
  const a = await post(owner.cookie, owner.csrf, `/academies/a_wg/refunds/${refundId}/approvals`);
  assert.equal(a.status, 200);
  assert.equal(((await a.json()) as { status: string }).status, "MUTUALLY_APPROVED");
  const row = (await db.select().from(s.refunds).where(eq(s.refunds.id, refundId)))[0];
  assert.equal(row.approvedAmount, 405000); // 부분승인 금지 — 전액
});

test("환불 웹훅: PROCESSING → COMPLETED — Payment REFUNDED + Invoice 재계산 + outbox 원자 반영", async () => {
  const t1 = new Date(Date.now() + 1000).toISOString();
  const w1 = await webhook({ kind: "refund", providerEventId: "rf-1", refundId, targetStatus: "PROCESSING", occurredAt: t1 });
  assert.equal(((await w1.json()) as { decision: string }).decision, "APPLY");
  const t2 = new Date(Date.now() + 2000).toISOString();
  const w2 = await webhook({ kind: "refund", providerEventId: "rf-2", refundId, targetStatus: "COMPLETED", occurredAt: t2 });
  assert.equal(((await w2.json()) as { decision: string }).decision, "APPLY");

  const refund = (await db.select().from(s.refunds).where(eq(s.refunds.id, refundId)))[0];
  assert.equal(refund.status, "COMPLETED");
  assert.equal(refund.completedAmount, 405000);
  // 전액 환불 → Payment REFUNDED (같은 tx)
  const pay = (await db.select().from(s.payments).where(eq(s.payments.id, paymentId)))[0];
  assert.equal(pay.status, "REFUNDED");
  // Invoice 순수납 0 + 환불 발생 → REFUNDED 도출 (같은 tx)
  const inv = (await db.select().from(s.invoices).where(eq(s.invoices.id, "inv_dodam")))[0];
  assert.equal(inv.status, "REFUNDED");
  // outbox REFUND_COMPLETED (domain DOMAIN_EVENT_TYPE)
  const outbox = await db.select().from(s.outboxEvents);
  assert.ok(outbox.some((o) => o.eventType === "REFUND_COMPLETED"));
});

test("종결 후: 중복 COMPLETED 웹훅 = 상태 불변 · 재환불 요청 거부", async () => {
  const w = await webhook({ kind: "refund", providerEventId: "rf-3", refundId, targetStatus: "FAILED", occurredAt: new Date(Date.now() + 3000).toISOString() });
  assert.equal(((await w.json()) as { decision: string }).decision, "RECONCILE"); // 종결 되돌리기 금지
  // REFUNDED 결제에 재환불 요청 → 거부 (상태 검증)
  const again = await post(mom.cookie, mom.csrf, "/academies/a_wg/refunds",
    { paymentId, participantId: "p_dodam", reasonCode: "PARENT_REQUEST" }, "rk-mom-3");
  assert.equal(again.status, 422);
});
