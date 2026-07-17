/* Phase 5 통합 테스트 — 결제 준비·멱등·PG 웹훅 + membership guard (R5 §7 Phase 3·5)
   실 HTTP × 진짜 Postgres. UI 성공 ≠ CAPTURED: 확정은 webhook 만. */
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
    relationshipType: "MOTHER", isPrimaryGuardian: true, verificationStatus: "VERIFIED",
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
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

before(async () => {
  const client = new PGlite();
  db = drizzle(client);
  await migrate(db, { migrationsFolder });
  app = createApp({
    db, providers: { kakao: fake }, allowedOrigins: [ORIGIN],
    redirectUri: "http://x/cb", now: NOW, secureCookies: false,
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
    relationshipType: "MOTHER", isPrimaryGuardian: true, verificationStatus: "VERIFIED",
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

test("webhook: 존재하지 않는 Payment → REJECT_INVALID (inbox 보존)", async () => {
  const w = await webhook({ providerEventId: "evt-ghost", paymentId: "pay_ghost", targetStatus: "CAPTURED", occurredAt: "2026-07-17T01:00:00Z" });
  assert.equal(((await w.json()) as { decision: string }).decision, "REJECT_INVALID");
  const inbox = await db.select().from(s.webhookInbox).where(eq(s.webhookInbox.providerEventId, "evt-ghost"));
  assert.equal(inbox.length, 1); // raw 보존 — 수동/재처리 대상
});
