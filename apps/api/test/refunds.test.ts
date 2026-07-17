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

/* ── R9 신규 P0 3종 ── */

test("R9-P0-01: 관계없는 보호자·비결제자의 보호자 측 승인 거부 — 실제 결제자만", async () => {
  // 새 결제·환불 요청 seed (도담 두 번째 청구)
  await db.insert(s.invoices).values({
    id: "inv_d2", academyId: "a_wg", participantId: "p_dodam", enrollmentId: "e_d2",
    billingPeriodId: "bp_q4", status: "ISSUED", total: 100000, dueDate: "2025-12-10",
  });
  const prep = await post(mom.cookie, mom.csrf, "/academies/a_wg/payments/prepare",
    { invoiceIds: ["inv_d2"] }, "pay-key-2");
  const { paymentId: pay2 } = await prep.json() as { paymentId: string };
  await webhook({ providerEventId: "cap-2", paymentId: pay2, targetStatus: "CAPTURED", occurredAt: NOW() });
  const req = await post(mom.cookie, mom.csrf, "/academies/a_wg/refunds",
    { paymentId: pay2, participantId: "p_dodam", reasonCode: "PARENT_REQUEST" }, "rk-2");
  const { refundId: ref2 } = await req.json() as { refundId: string };

  // 아버지(같은 원생의 VERIFIED 보호자·GUARDIAN 역할)의 보호자 측 승인 → 거부
  const dadApprove = await post(dad.cookie, dad.csrf, `/academies/a_wg/refunds/${ref2}/approvals`);
  assert.equal(dadApprove.status, 409);
  assert.match(((await dadApprove.json()) as { reason: string }).reason, /실제 결제자/);
  // 실제 결제자(어머니) 승인 → 성공
  const momApprove = await post(mom.cookie, mom.csrf, `/academies/a_wg/refunds/${ref2}/approvals`);
  assert.equal(momApprove.status, 200);
  // 원장 승인 → MUTUALLY_APPROVED (정상 흐름 유지 확인)
  const ownerApprove = await post(owner.cookie, owner.csrf, `/academies/a_wg/refunds/${ref2}/approvals`);
  assert.equal(((await ownerApprove.json()) as { status: string }).status, "MUTUALLY_APPROVED");
});

test("R9-P0-03: Payment 2건 결제된 Invoice 에서 1건만 환불 → PARTIALLY_PAID (REFUNDED 오판 방지)", async () => {
  // Invoice 100,000 에 Payment 2건(각 50,000 CAPTURED) 직접 seed
  await db.insert(s.invoices).values({
    id: "inv_two", academyId: "a_wg", participantId: "p_dodam", enrollmentId: "e_two",
    billingPeriodId: "bp_q4", status: "PAID", total: 100000, dueDate: "2025-12-10",
  });
  const gdMom = (await db.select().from(s.guardians))[0]; // gd_mom
  await db.insert(s.payments).values([
    { id: "pay_h1", academyId: "a_wg", guardianId: "gd_mom", amount: 50000, status: "CAPTURED", idempotencyKey: "h1" },
    { id: "pay_h2", academyId: "a_wg", guardianId: "gd_mom", amount: 50000, status: "CAPTURED", idempotencyKey: "h2" },
  ]);
  await db.insert(s.paymentAllocations).values([
    { id: "pa_h1", paymentId: "pay_h1", invoiceId: "inv_two", academyId: "a_wg", amount: 50000 },
    { id: "pa_h2", paymentId: "pay_h2", invoiceId: "inv_two", academyId: "a_wg", amount: 50000 },
  ]);
  // pay_h1 만 전액 환불 (요청→양측 승인→웹훅 완료)
  const req = await post(mom.cookie, mom.csrf, "/academies/a_wg/refunds",
    { paymentId: "pay_h1", participantId: "p_dodam", reasonCode: "PARENT_REQUEST" }, "rk-h1");
  assert.equal(req.status, 201);
  const { refundId: refH } = await req.json() as { refundId: string };
  await post(mom.cookie, mom.csrf, `/academies/a_wg/refunds/${refH}/approvals`);
  await post(owner.cookie, owner.csrf, `/academies/a_wg/refunds/${refH}/approvals`);
  await webhook({ kind: "refund", providerEventId: "rf-h1", refundId: refH, targetStatus: "PROCESSING", occurredAt: new Date(Date.now() + 100).toISOString() });
  await webhook({ kind: "refund", providerEventId: "rf-h2", refundId: refH, targetStatus: "COMPLETED", occurredAt: new Date(Date.now() + 200).toISOString() });

  // 핵심: 다른 Payment(pay_h2) 50,000 이 순수납에 남음 → PARTIALLY_PAID
  const inv = (await db.select().from(s.invoices).where(eq(s.invoices.id, "inv_two")))[0];
  assert.equal(inv.status, "PARTIALLY_PAID", `기대 PARTIALLY_PAID, 실제 ${inv.status} — 다른 Payment 누락 시 REFUNDED 오판`);
  const payH1 = (await db.select().from(s.payments).where(eq(s.payments.id, "pay_h1")))[0];
  assert.equal(payH1.status, "REFUNDED");
  const payH2 = (await db.select().from(s.payments).where(eq(s.payments.id, "pay_h2")))[0];
  assert.equal(payH2.status, "CAPTURED"); // 무관한 결제는 불변
  void gdMom;
});

test("R9-P0-02: 다른 Invoice 의 PaymentAllocation 을 가리키는 RA 직접 insert → DB 연쇄 FK 거부", async () => {
  // inv_dodam 의 pa 를 참조하면서 invoiceId 는 inv_two 로 위장 — fk_ra_pa_invoice 가 차단
  const anyRefund = (await db.select().from(s.refunds))[0];
  const paDodam = (await db.select().from(s.paymentAllocations).where(eq(s.paymentAllocations.invoiceId, "inv_dodam")))[0];
  await assert.rejects(
    db.insert(s.refundAllocations).values({
      id: "ra_forge", refundId: anyRefund.id, paymentAllocationId: paDodam.id,
      paymentId: paDodam.paymentId, invoiceId: "inv_two", // 위장
      participantId: "p_dodam", academyId: "a_wg", amount: 1000,
    }),
  );
  // participant 위장도 차단 (fk_ra_invoice_participant)
  await db.insert(s.participants).values({
    id: "p_forge", academyId: "a_wg", name: "위장", birth: "2018-01-01", ageLabel: "7세",
  });
  await assert.rejects(
    db.insert(s.refundAllocations).values({
      id: "ra_forge2", refundId: anyRefund.id, paymentAllocationId: paDodam.id,
      paymentId: paDodam.paymentId, invoiceId: paDodam.invoiceId,
      participantId: "p_forge", // Invoice 의 원생이 아님
      academyId: "a_wg", amount: 1000,
    }),
  );
});

test("R10(R9-P0-02 마지막 경계): Invoice·RA participant 는 일치, Refund 만 다른 원생 → 정확히 새 FK 가 거부", async () => {
  /* 리뷰 §7 구성 그대로: Payment P 가 원생 B 의 Invoice 를 결제,
     Refund 는 원생 A 명의 — 기존 4개 FK 는 전부 만족, 새 3열 FK 만이 차단. */
  await db.insert(s.participants).values([
    { id: "p_childA", academyId: "a_wg", name: "원생A", birth: "2018-01-01", ageLabel: "7세" },
    { id: "p_childB", academyId: "a_wg", name: "원생B", birth: "2018-02-02", ageLabel: "7세" },
  ]);
  await db.insert(s.invoices).values({
    id: "inv_childB", academyId: "a_wg", participantId: "p_childB", enrollmentId: "e_cb",
    billingPeriodId: "bp_q4", status: "PAID", total: 70000, dueDate: "2025-12-10",
  });
  await db.insert(s.payments).values({
    id: "pay_p", academyId: "a_wg", guardianId: "gd_mom", amount: 70000, status: "CAPTURED", idempotencyKey: "kp",
  });
  await db.insert(s.paymentAllocations).values({
    id: "pa_p", paymentId: "pay_p", invoiceId: "inv_childB", academyId: "a_wg", amount: 70000,
  });
  // Refund 는 원생 A 명의 (같은 Payment)
  await db.insert(s.refunds).values({
    id: "ref_childA", academyId: "a_wg", paymentId: "pay_p", participantId: "p_childA",
    status: "REQUESTED", reasonCode: "X", requestedAmount: 70000,
    requestedByUserId: mom.userId, requestedAt: NOW(), idempotencyKey: "rk-x",
  });
  // 위장 RA: refund=원생A 명의, RA·Invoice=원생B — 기존 4 FK 전부 만족하는 구성
  await assert.rejects(
    db.insert(s.refundAllocations).values({
      id: "ra_mismatch", refundId: "ref_childA", paymentAllocationId: "pa_p",
      paymentId: "pay_p", invoiceId: "inv_childB",
      participantId: "p_childB", // Invoice 와 일치 — fk_ra_invoice_participant 통과
      academyId: "a_wg", amount: 70000,
    }),
    (e: unknown) => {
      // 정확히 새 제약으로 실패했는지 — 다른 FK 의 우연한 거부가 아님을 증명
      const msgs: string[] = [];
      for (let cur = e as { message?: string; cause?: unknown } | undefined; cur; cur = cur.cause as never) {
        if (cur.message) msgs.push(cur.message);
      }
      assert.match(msgs.join(" | "), /fk_ra_refund_participant_academy/);
      return true;
    },
  );
  // 대조군: participant 를 Refund 와 일치시키면… Invoice 는 원생 B 라 이번엔
  // fk_ra_invoice_participant 가 막는다 — 두 FK 가 양방향 경계를 완성
  await assert.rejects(
    db.insert(s.refundAllocations).values({
      id: "ra_mismatch2", refundId: "ref_childA", paymentAllocationId: "pa_p",
      paymentId: "pay_p", invoiceId: "inv_childB",
      participantId: "p_childA", academyId: "a_wg", amount: 70000,
    }),
    (e: unknown) => {
      const msgs: string[] = [];
      for (let cur = e as { message?: string; cause?: unknown } | undefined; cur; cur = cur.cause as never) {
        if (cur.message) msgs.push(cur.message);
      }
      assert.match(msgs.join(" | "), /fk_ra_invoice_participant/);
      return true;
    },
  );
});

test("종결 후: 중복 COMPLETED 웹훅 = 상태 불변 · 재환불 요청 거부", async () => {
  const w = await webhook({ kind: "refund", providerEventId: "rf-3", refundId, targetStatus: "FAILED", occurredAt: new Date(Date.now() + 3000).toISOString() });
  assert.equal(((await w.json()) as { decision: string }).decision, "RECONCILE"); // 종결 되돌리기 금지
  // REFUNDED 결제에 재환불 요청 → 거부 (상태 검증)
  const again = await post(mom.cookie, mom.csrf, "/academies/a_wg/refunds",
    { paymentId, participantId: "p_dodam", reasonCode: "PARENT_REQUEST" }, "rk-mom-3");
  assert.equal(again.status, 422);
});
