/* Phase 5 통합 테스트 — 결제 준비·멱등·PG 웹훅 + membership guard (R5 §7 Phase 3·5)
   실 HTTP × PGlite(WASM Postgres — 같은 migration·실 PostgreSQL 검증은 concurrency.pg.test.ts/CI). UI 성공 ≠ CAPTURED: 확정은 webhook 만. */
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

/** seed: 멤버십 + guardian + VERIFIED 링크 */
async function grantGuardian(userId: string, suffix: string, opts?: { status?: "ACTIVE" | "SUSPENDED"; roles?: ("GUARDIAN" | "PLATFORM_ADMIN")[] }) {
  await db.insert(s.academyMemberships).values({
    id: `m_${suffix}`, userId, academyId: "a_wg",
    roles: opts?.roles ?? ["GUARDIAN"], status: opts?.status ?? "ACTIVE", joinedAt: "2025-03-02",
  });
  const gdId = `gd_${suffix}`;
  await db.insert(s.guardians).values({ id: gdId, userId });
  await db.insert(s.guardianParticipantLinks).values({
    id: `gl_${suffix}`, guardianId: gdId, participantId: "p_dodam", academyId: "a_wg",
    relationshipType: "MOTHER", isPrimaryGuardian: false, verificationStatus: "VERIFIED",
    canViewSchedule: true, canViewAttendance: true, canViewHealthInfo: true,
    canReceivePhotos: true, canPay: true, canRequestRefund: true,
  });
  return gdId;
}

const prepare = (cookie: string, csrf: string, idemKey: string, invoiceIds: string[]) =>
  app.request("/academies/a_wg/payments/prepare", {
    method: "POST",
    headers: {
      cookie, origin: ORIGIN, "x-csrf-token": csrf,
      "idempotency-key": idemKey, "content-type": "application/json",
    },
    body: JSON.stringify({ invoiceIds }),
  });

const webhook = (body: Record<string, unknown>) =>
  app.request("/webhooks/pg/mockpg", {
    method: "POST", headers: { "content-type": "application/json", "x-webhook-secret": "test-secret" },
    body: JSON.stringify(body),
  });

before(async () => {
  const client = new PGlite();
  db = drizzle(client);
  await migrate(db, { migrationsFolder });
  app = createApp({
    db, providers: { kakao: fake }, allowedOrigins: [ORIGIN],
    redirectUri: "http://x/cb", now: NOW, secureCookies: false,
    enableMockPg: true, mockPgSecret: "test-secret",
  });
  await db.insert(s.academies).values({
    id: "a_wg", organizationId: "o_wg", name: "원더짐 아카데미", themeColor: "#12B5A5",
    themeInk: "#087F73", logoEmoji: "🐯", ownerName: "김도윤", billingCycleDefault: 3,
  });
  await db.insert(s.participants).values({
    id: "p_dodam", academyId: "a_wg", name: "김도담", birth: "2017-04-10", ageLabel: "8세",
  });
  await db.insert(s.billingPeriods).values({
    id: "bp_q4", academyId: "a_wg", periodStart: "2025-09-01", periodEnd: "2025-11-30", cycleMonths: 3,
  });
  await db.insert(s.invoices).values({
    id: "inv_dodam", academyId: "a_wg", participantId: "p_dodam", enrollmentId: "e_dodam",
    billingPeriodId: "bp_q4", status: "ISSUED", total: 405000, dueDate: "2025-09-10",
  });
  await db.insert(s.invoiceLines).values([
    { id: "il_1", invoiceId: "inv_dodam", type: "TUITION", label: "플레이2 (분기)", amount: 360000 },
    { id: "il_2", invoiceId: "inv_dodam", type: "VEHICLE", label: "차량비", amount: 45000 },
  ]);
});

/* ── membership guard (docs/10 표) ── */

test("guard: 소속 없음 → 403 (URL academyId 조작 차단)", async () => {
  const { cookie, csrf } = await login("nobody");
  const res = await prepare(cookie, csrf, "k-nobody", ["inv_dodam"]);
  assert.equal(res.status, 403);
});

test("guard: SUSPENDED 멤버십 → 403 + 전 세션 즉시 폐기(docs/10)", async () => {
  const { cookie, csrf, userId } = await login("suspended");
  await grantGuardian(userId, "susp", { status: "SUSPENDED" });
  const res = await prepare(cookie, csrf, "k-susp", ["inv_dodam"]);
  assert.equal(res.status, 403);
  // 세션·토큰 폐기 → 이후 어떤 요청도 401
  assert.equal((await app.request("/sessions/me", { headers: { cookie } })).status, 401);
});

test("guard: PLATFORM_ADMIN 은 일반 앱 진입 금지", async () => {
  const { cookie, csrf, userId } = await login("padmin");
  await grantGuardian(userId, "padm", { roles: ["GUARDIAN", "PLATFORM_ADMIN"] });
  const res = await prepare(cookie, csrf, "k-padm", ["inv_dodam"]);
  assert.equal(res.status, 403);
});

/* ── 결제 준비 + 멱등 ── */

test("정상: 준비 201 PENDING(UI 성공 ≠ CAPTURED) + allocation 생성", async () => {
  const { cookie, csrf, userId } = await login("mom");
  await grantGuardian(userId, "mom");
  const res = await prepare(cookie, csrf, "key-1", ["inv_dodam"]);
  assert.equal(res.status, 201);
  const body = await res.json() as { paymentId: string; amount: number; status: string };
  assert.equal(body.amount, 405000);
  assert.equal(body.status, "PENDING"); // 확정은 webhook 만
  const allocs = await db.select().from(s.paymentAllocations)
    .where(eq(s.paymentAllocations.paymentId, body.paymentId));
  assert.equal(allocs.length, 1);
  assert.equal(allocs[0].amount, 405000);

  // 멱등 REPLAY: 같은 key + 같은 body → 200 + 같은 paymentId (이중 결제 방지)
  const replay = await prepare(cookie, csrf, "key-1", ["inv_dodam"]);
  assert.equal(replay.status, 200);
  assert.equal(((await replay.json()) as { paymentId: string }).paymentId, body.paymentId);

  // 멱등 CONFLICT: 같은 key + 다른 body → 409
  const conflict = await prepare(cookie, csrf, "key-1", ["inv_other"]);
  assert.equal(conflict.status, 409);

  // Idempotency-Key 없음 → 422
  const noKey = await app.request("/academies/a_wg/payments/prepare", {
    method: "POST",
    headers: { cookie, origin: ORIGIN, "x-csrf-token": csrf, "content-type": "application/json" },
    body: JSON.stringify({ invoiceIds: ["inv_dodam"] }),
  });
  assert.equal(noKey.status, 422);
});

test("부정: 연결 안 된 자녀의 청구서 → 422 거부", async () => {
  await db.insert(s.participants).values({
    id: "p_other", academyId: "a_wg", name: "남의아이", birth: "2018-01-01", ageLabel: "7세",
  });
  await db.insert(s.invoices).values({
    id: "inv_other_kid", academyId: "a_wg", participantId: "p_other", enrollmentId: "e_x",
    billingPeriodId: "bp_q4", status: "ISSUED", total: 100000, dueDate: "2025-09-10",
  });
  const { cookie, csrf, userId } = await login("dad");
  await grantGuardian(userId, "dad"); // p_dodam 만 연결
  const res = await prepare(cookie, csrf, "k-dad", ["inv_other_kid"]);
  assert.equal(res.status, 422);
});

/* ── PG 웹훅 → 상태 확정 ── */

test("webhook CAPTURED → Payment 확정 + Invoice PAID 도출 + 목록 반영", async () => {
  const { cookie, csrf, userId } = await login("mom2");
  await db.insert(s.participants).values({
    id: "p_seojun", academyId: "a_wg", name: "김서준", birth: "2018-08-22", ageLabel: "7세",
  });
  await db.insert(s.invoices).values({
    id: "inv_seojun", academyId: "a_wg", participantId: "p_seojun", enrollmentId: "e_s",
    billingPeriodId: "bp_q4", status: "ISSUED", total: 333000, dueDate: "2025-09-10",
  });
  await db.insert(s.academyMemberships).values({
    id: "m_mom2", userId, academyId: "a_wg", roles: ["GUARDIAN"], status: "ACTIVE", joinedAt: "2025-03-02",
  });
  const gdId = "gd_mom2";
  await db.insert(s.guardians).values({ id: gdId, userId });
  await db.insert(s.guardianParticipantLinks).values({
    id: "gl_mom2", guardianId: gdId, participantId: "p_seojun", academyId: "a_wg",
    relationshipType: "MOTHER", isPrimaryGuardian: false, verificationStatus: "VERIFIED",
    canViewSchedule: true, canViewAttendance: true, canViewHealthInfo: true,
    canReceivePhotos: true, canPay: true, canRequestRefund: true,
  });

  const prep = await prepare(cookie, csrf, "k-mom2", ["inv_seojun"]);
  const { paymentId } = await prep.json() as { paymentId: string };

  // CAPTURED webhook — 이때만 청구서가 PAID 로
  const t1 = "2026-07-17T00:00:10Z";
  const w1 = await webhook({ providerEventId: "evt-1", paymentId, targetStatus: "CAPTURED", occurredAt: t1 });
  assert.equal(w1.status, 200);
  assert.equal(((await w1.json()) as { decision: string }).decision, "APPLY");
  const inv = await db.select().from(s.invoices).where(eq(s.invoices.id, "inv_seojun"));
  assert.equal(inv[0].status, "PAID");

  // 같은 event 재수신 → IGNORE_ALREADY_SEEN (inbox unique), 상태 불변
  const w2 = await webhook({ providerEventId: "evt-1", paymentId, targetStatus: "FAILED", occurredAt: t1 });
  assert.equal(((await w2.json()) as { decision: string }).decision, "IGNORE_ALREADY_SEEN");

  // 역순(과거 발생시각) 이벤트 → 최종 상태 되돌리지 않음
  const stale = await webhook({ providerEventId: "evt-0", paymentId, targetStatus: "AUTHORIZED", occurredAt: "2026-07-17T00:00:05Z" });
  assert.equal(((await stale.json()) as { decision: string }).decision, "IGNORE_STALE");
  const pay = await db.select().from(s.payments).where(eq(s.payments.id, paymentId));
  assert.equal(pay[0].status, "CAPTURED");

  // 보호자 청구서 목록에 PAID 반영
  const list = await app.request("/academies/a_wg/invoices", { headers: { cookie } });
  const { invoices } = await list.json() as { invoices: { invoiceId: string; status: string }[] };
  assert.equal(invoices.find((i) => i.invoiceId === "inv_seojun")?.status, "PAID");

  // 이미 결제된 청구서 재결제 시도 → 422
  const again = await prepare(cookie, csrf, "k-mom2-2", ["inv_seojun"]);
  assert.equal(again.status, 422);
});

/* ── R7 P0-1: Webhook fail-closed ── */

test("R7: 시크릿 불일치 401 · 미등록 provider 404 · mockpg 게이트 없으면 404", async () => {
  // 시크릿 불일치 — 미인증 웹훅은 결제를 변경할 수 없음
  const bad = await app.request("/webhooks/pg/mockpg", {
    method: "POST", headers: { "content-type": "application/json", "x-webhook-secret": "wrong" },
    body: JSON.stringify({ providerEventId: "evt-forge", paymentId: "pay_x", targetStatus: "CAPTURED", occurredAt: NOW() }),
  });
  assert.equal(bad.status, 401);
  // 미등록 provider = 404 (allowlist)
  const unknown = await app.request("/webhooks/pg/tosspay", {
    method: "POST", headers: { "content-type": "application/json" }, body: "{}",
  });
  assert.equal(unknown.status, 404);
  // mockpg 게이트(enableMockPg·secret) 없는 앱 = 404 — 환경변수 누락 시 fail-closed
  const gateless = createApp({
    db, providers: {}, allowedOrigins: [ORIGIN],
    redirectUri: "http://x/cb", now: NOW, secureCookies: false,
  });
  const closed = await gateless.request("/webhooks/pg/mockpg", {
    method: "POST", headers: { "content-type": "application/json", "x-webhook-secret": "test-secret" },
    body: JSON.stringify({ providerEventId: "e", paymentId: "p", targetStatus: "CAPTURED", occurredAt: NOW() }),
  });
  assert.equal(closed.status, 404);
});

/* ── R7 P0-3: 동일 Invoice 활성 attempt 차단 + 이중 CAPTURE 방어 ── */

test("R7: 다른 멱등키라도 활성 PENDING attempt 가 있으면 409 (이중 결제 1층 방어)", async () => {
  await db.insert(s.participants).values({
    id: "p_att", academyId: "a_wg", name: "활성테스트", birth: "2018-01-01", ageLabel: "7세",
  });
  await db.insert(s.invoices).values({
    id: "inv_att", academyId: "a_wg", participantId: "p_att", enrollmentId: "e_att",
    billingPeriodId: "bp_q4", status: "ISSUED", total: 100000, dueDate: "2025-09-10",
  });
  const { cookie, csrf, userId } = await login("attmom");
  await grantGuardian(userId, "att");
  await db.insert(s.guardianParticipantLinks).values({
    id: "gl_att_p", guardianId: "gd_att", participantId: "p_att", academyId: "a_wg",
    relationshipType: "MOTHER", isPrimaryGuardian: false, verificationStatus: "VERIFIED",
    canViewSchedule: true, canViewAttendance: true, canViewHealthInfo: true,
    canReceivePhotos: true, canPay: true, canRequestRefund: true,
  });
  const first = await prepare(cookie, csrf, "att-key-1", ["inv_att"]);
  assert.equal(first.status, 201);
  const { paymentId } = await first.json() as { paymentId: string };
  // 같은 Invoice + 다른 멱등키 → 409 + 기존 paymentId 반환
  const second = await prepare(cookie, csrf, "att-key-2", ["inv_att"]);
  assert.equal(second.status, 409);
  const body = await second.json() as { error: string; paymentId: string };
  assert.equal(body.error, "ACTIVE_PAYMENT_ATTEMPT_EXISTS");
  assert.equal(body.paymentId, paymentId);
  // 같은 키 재시도는 여전히 REPLAY 200
  const replay = await prepare(cookie, csrf, "att-key-1", ["inv_att"]);
  assert.equal(replay.status, 200);
});

test("R7: 이중 CAPTURE — 이미 PAID 인 청구서의 늦은 CAPTURED webhook 은 RECONCILE (2층 방어)", async () => {
  // 위 테스트의 pay 를 CAPTURED 로 확정 → inv_att = PAID
  const payRow = await db.select().from(s.payments).where(eq(s.payments.idempotencyKey, "att-key-1"));
  const payId = payRow[0].id;
  const w1 = await webhook({ providerEventId: "evt-att-1", paymentId: payId, targetStatus: "CAPTURED", occurredAt: NOW() });
  assert.equal(((await w1.json()) as { decision: string }).decision, "APPLY");
  const inv = await db.select().from(s.invoices).where(eq(s.invoices.id, "inv_att"));
  assert.equal(inv[0].status, "PAID");

  // attempt 만료 후 새 attempt 가 생겼다고 가정 — 두 번째 PENDING payment 직접 삽입
  await db.insert(s.payments).values({
    id: "pay_att_2", academyId: "a_wg", guardianId: "gd_att", amount: 100000,
    status: "PENDING", idempotencyKey: "att-key-late",
  });
  await db.insert(s.paymentAllocations).values({
    id: "pa_att_2", paymentId: "pay_att_2", invoiceId: "inv_att", academyId: "a_wg", amount: 100000,
  });
  // 두 번째 CAPTURED 도착 — 무조건 APPLY 하지 않고 RECONCILE
  const w2 = await webhook({ providerEventId: "evt-att-2", paymentId: "pay_att_2", targetStatus: "CAPTURED", occurredAt: NOW() });
  assert.equal(((await w2.json()) as { decision: string }).decision, "RECONCILE");
  const pay2 = await db.select().from(s.payments).where(eq(s.payments.id, "pay_att_2"));
  assert.equal(pay2[0].status, "PENDING"); // 상태 미변경 — 200,000원 이중 결제 차단
});

/* ── R7 배치 3: AuditLog·Outbox tx 합류 + Inbox 상태 모델 ── */

test("R7: 결제 준비·웹훅이 AuditLog·Outbox 를 같은 tx 에 기록", async () => {
  const audits = await db.select().from(s.auditLogs);
  // 앞선 테스트들에서 쌓인 감사 기록 검증
  assert.ok(audits.some((a) => a.action === "payment.prepared" && a.success));
  assert.ok(audits.some((a) => a.action === "payment.status_changed"));
  assert.ok(audits.some((a) => a.action === "payment.reconcile_required")); // 이중 CAPTURE 건
  const outbox = await db.select().from(s.outboxEvents);
  assert.ok(outbox.some((o) => o.eventType === "PAYMENT_PREPARED"));
  assert.ok(outbox.some((o) => o.eventType === "PAYMENT_CAPTURED"));
  assert.ok(outbox.every((o) => o.publishedAt === null)); // publisher worker 는 후속
});

test("R7 P0-2: inbox 상태 모델 — APPLY=APPLIED · 중복=IGNORED · RECONCILE=대기 큐(nextRetryAt)", async () => {
  const inbox = await db.select().from(s.webhookInbox);
  const applied = inbox.find((i) => i.providerEventId === "evt-att-1");
  assert.equal(applied?.status, "APPLIED");
  const reconcile = inbox.find((i) => i.providerEventId === "evt-att-2"); // 이중 CAPTURE
  assert.equal(reconcile?.status, "RECONCILE_REQUIRED");
  assert.ok(reconcile?.nextRetryAt); // worker 폴링 대상 — "처리 완료" 아님
  const stale = inbox.find((i) => i.providerEventId === "evt-0");
  assert.equal(stale?.status, "IGNORED");
});

test("QA 11.6: DRAFT 청구서는 보호자 목록에 비노출", async () => {
  await db.insert(s.invoices).values({
    id: "inv_draft", academyId: "a_wg", participantId: "p_dodam", enrollmentId: "e_dr",
    billingPeriodId: "bp_q4", status: "DRAFT", total: 999999, dueDate: "2026-01-10",
  });
  const { cookie, userId } = await login("draftmom");
  await grantGuardian(userId, "draft");
  const res = await app.request("/academies/a_wg/invoices", { headers: { cookie } });
  const { invoices } = await res.json() as { invoices: { invoiceId: string }[] };
  assert.ok(!invoices.some((i) => i.invoiceId === "inv_draft"), "DRAFT 가 노출됨");
});

test("webhook: 존재하지 않는 Payment → REJECT_INVALID (inbox 보존)", async () => {
  const w = await webhook({ providerEventId: "evt-ghost", paymentId: "pay_ghost", targetStatus: "CAPTURED", occurredAt: "2026-07-17T01:00:00Z" });
  assert.equal(((await w.json()) as { decision: string }).decision, "REJECT_INVALID");
  const inbox = await db.select().from(s.webhookInbox).where(eq(s.webhookInbox.providerEventId, "evt-ghost"));
  assert.equal(inbox.length, 1); // raw 보존 — 수동/재처리 대상
});

/* ── 13차 A P0-①: 개별 청구는 상한 이하지만 합계만 1억 초과 ── */
test("13차 A P0: 6천만원 ×2 합산 결제(1.2억) → 서버 합계 guard 가 422 거부", async () => {
  const { cookie, csrf, userId } = await login("bigsum");
  await grantGuardian(userId, "bigsum");
  await db.insert(s.invoices).values([
    { id: "inv_big_a", academyId: "a_wg", participantId: "p_dodam", enrollmentId: "e_ba", billingPeriodId: "bp_q4", status: "ISSUED", total: 60_000_000, dueDate: "2025-09-10" },
    { id: "inv_big_b", academyId: "a_wg", participantId: "p_dodam", enrollmentId: "e_bb", billingPeriodId: "bp_q4", status: "ISSUED", total: 60_000_000, dueDate: "2025-09-10" },
  ]);
  // 개별 6천만원은 DB CHECK(≤1억) 통과 — 합계 1.2억은 서비스 guard 만이 막는다
  const res = await prepare(cookie, csrf, "k-bigsum", ["inv_big_a", "inv_big_b"]);
  assert.equal(res.status, 422);
  const body = await res.json() as { reason?: string };
  assert.match(body.reason ?? "", /허용 범위|상한/);
  // Payment 가 생성되지 않았어야 함(부분 성공 금지)
  const pays = await db.select().from(s.payments);
  assert.ok(!pays.some((p) => p.idempotencyKey === "k-bigsum"));
});

/* ── 13차 B P0-1: 결제 상태 재조회 API — 완료 화면의 서버 진실 ── */
test("13차 B: GET payments/{id} — 결제자 200 · 타인 404(존재 은닉) · CAPTURED 반영", async () => {
  const { cookie, csrf, userId } = await login("statmom");
  await grantGuardian(userId, "statmom");
  await db.insert(s.invoices).values({
    id: "inv_stat", academyId: "a_wg", participantId: "p_dodam", enrollmentId: "e_stat",
    billingPeriodId: "bp_q4", status: "ISSUED", total: 50000, dueDate: "2025-09-10",
  });
  const prep = await prepare(cookie, csrf, "k-stat", ["inv_stat"]);
  assert.equal(prep.status, 201);
  const payId = (await prep.json() as { paymentId: string }).paymentId;
  // PENDING 조회
  const r1 = await app.request(`/academies/a_wg/payments/${payId}`, { headers: { cookie } });
  assert.equal(r1.status, 200);
  assert.equal((await r1.json() as { status: string }).status, "PENDING");
  // CAPTURED 후 invoices 상태 포함
  await webhook({ kind: "payment", providerEventId: "ev-stat", paymentId: payId, targetStatus: "CAPTURED", occurredAt: NOW() });
  const r2 = await app.request(`/academies/a_wg/payments/${payId}`, { headers: { cookie } });
  const body = await r2.json() as { status: string; invoices: { invoiceId: string; status: string }[] };
  assert.equal(body.status, "CAPTURED");
  assert.equal(body.invoices.find((i) => i.invoiceId === "inv_stat")?.status, "PAID");
  // 타인(같은 학원 다른 보호자) = 404 — 존재 은닉
  const other = await login("statdad");
  await grantGuardian(other.userId, "statdad");
  const r3 = await app.request(`/academies/a_wg/payments/${payId}`, { headers: { cookie: other.cookie } });
  assert.equal(r3.status, 404);
});
