/* R5 Phase 4 필수 동시성 테스트 — 실 PostgreSQL 전용.
   완료 기준 그대로:
   - 동일 single-use invite 로 20개 동시 요청 → 정확히 1개만 성공
   - maxUses=3 invite 에 20개 동시 요청 → 정확히 3개만 성공
   - 동일 OTP session 으로 20개 동시 요청 → 정확히 1개만 성공
   근거 잠금: invite row FOR UPDATE(경쟁 직렬화) + OTP 조건부 UPDATE +
   UNIQUE(invite, guardian, participant).
   실행: DATABASE_URL_TEST 설정 시에만(CI postgres:16 service). 로컬은 skip. */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";
import { schema as s } from "@pacefolio/db";
import { requestGuardianLink } from "../src/linking/service";
import { sha256Hex } from "../src/crypto";

const DATABASE_URL_TEST = process.env.DATABASE_URL_TEST;
const skip = !DATABASE_URL_TEST && "DATABASE_URL_TEST 미설정 — CI postgres 에서 실행";

const migrationsFolder = join(
  dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "packages", "db", "migrations",
);
const NOW = () => new Date().toISOString();
const rid = (p: string) => `${p}_${randomBytes(8).toString("base64url")}`; // 반복 실행 안전

interface World {
  db: ReturnType<typeof drizzle>;
  academyId: string;
  participantId: string;
  child: { childName: string; childBirth: string };
}

/* ⚠️ 단일 공유 pool — 테스트마다 새 Pool 을 만들면 닫히지 않은 idle 커넥션이
   누적돼 Postgres max_connections(기본 100)를 초과한다(CI Run #12 실패 원인).
   경쟁 테스트 6종 × 20 동시 tx 도 이 pool 하나(max 30)로 순차 수용. */
let sharedPool: Pool | null = null;
let sharedDb: ReturnType<typeof drizzle> | null = null;
let migrated = false;
after(async () => { await sharedPool?.end(); }); // 커넥션 정리 — runner hang 방지

async function setup(): Promise<World> {
  if (!sharedDb) {
    sharedPool = new Pool({ connectionString: DATABASE_URL_TEST, max: 30 });
    sharedDb = drizzle(sharedPool);
  }
  const db = sharedDb;
  if (!migrated) {
    await migrate(db, { migrationsFolder }); // 재적용은 no-op(migrator 저널)
    migrated = true;
  }
  const academyId = rid("a");
  const participantId = rid("p");
  await db.insert(s.academies).values({
    id: academyId, organizationId: rid("o"), name: "동시성 테스트 학원",
    themeColor: "#12B5A5", themeInk: "#087F73", logoEmoji: "🐯",
    ownerName: "김도윤", billingCycleDefault: 3,
  });
  await db.insert(s.participants).values({
    id: participantId, academyId, name: "김도담", birth: "2017-04-10", ageLabel: "8세",
  });
  return { db, academyId, participantId, child: { childName: "김도담", childBirth: "2017-04-10" } };
}

/** n 명의 사용자 + 각자 OTP 세션 생성 */
async function seedActors(w: World, n: number, phone = "010-9999-0000") {
  const actors: { userId: string; otpId: string }[] = [];
  for (let i = 0; i < n; i++) {
    const userId = rid("u");
    const otpId = rid("gvs");
    await w.db.insert(s.users).values({ id: userId, name: `보호자${i}`, phone: `010-0000-${String(i).padStart(4, "0")}` });
    await w.db.insert(s.guardianVerificationSessions).values({
      id: otpId, issuedToUserId: userId, purpose: "GUARDIAN_LINK",
      verifiedPhone: phone, verifiedAt: NOW(),
      expiresAt: new Date(Date.now() + 600_000).toISOString(),
    });
    actors.push({ userId, otpId });
  }
  return actors;
}

function fire(w: World, actor: { userId: string; otpId: string }, inviteCode: string) {
  return requestGuardianLink(w.db, {
    actorUserId: actor.userId, academyId: w.academyId,
    verificationSessionId: actor.otpId, ...w.child,
    relationshipType: "MOTHER", consentPolicyVersion: "v1.0", consentAgreed: true,
    academyInviteCode: inviteCode,
  }, NOW()).then(
    (r) => ({ ok: r.status === "VERIFIED" }),
    () => ({ ok: false }), // tx 충돌(UNIQUE·소비 경쟁) = 실패로 집계
  );
}

test("동일 single-use invite 20개 동시 요청 → 정확히 1개만 성공", { skip }, async () => {
  const w = await setup();
  const code = rid("INV");
  const inviteId = rid("gi");
  await w.db.insert(s.guardianInvites).values({
    id: inviteId, codeHash: sha256Hex(code), academyId: w.academyId,
    participantId: w.participantId, expiresAt: new Date(Date.now() + 600_000).toISOString(), maxUses: 1,
  });
  const actors = await seedActors(w, 20);
  const results = await Promise.all(actors.map((a) => fire(w, a, code)));
  const successes = results.filter((r) => r.ok).length;
  assert.equal(successes, 1, `성공 ${successes}개 — 정확히 1개여야 함`);
  // 정본(redemption COUNT)도 1
  const reds = await w.db.select().from(s.guardianInviteRedemptions);
  assert.equal(reds.filter((r) => r.inviteId === inviteId).length, 1);
});

test("maxUses=3 invite 에 20개 동시 요청 → 정확히 3개만 성공", { skip }, async () => {
  const w = await setup();
  const code = rid("INV3");
  const inviteId = rid("gi");
  await w.db.insert(s.guardianInvites).values({
    id: inviteId, codeHash: sha256Hex(code), academyId: w.academyId,
    participantId: w.participantId, expiresAt: new Date(Date.now() + 600_000).toISOString(), maxUses: 3,
  });
  const actors = await seedActors(w, 20);
  const results = await Promise.all(actors.map((a) => fire(w, a, code)));
  const successes = results.filter((r) => r.ok).length;
  assert.equal(successes, 3, `성공 ${successes}개 — 정확히 3개여야 함`);
});

test("동일 OTP session 20개 동시 요청 → 정확히 1개만 성공", { skip }, async () => {
  const w = await setup();
  // 등록 연락처 경로(invite 없이) — 같은 사용자·같은 OTP 세션으로 20회 동시
  await w.db.insert(s.registeredGuardianContacts).values({
    id: rid("rgc"), academyId: w.academyId, participantId: w.participantId, phone: "01030001234",
  });
  const [actor] = await seedActors(w, 1, "010-3000-1234");
  const results = await Promise.all(
    Array.from({ length: 20 }, () =>
      requestGuardianLink(w.db, {
        actorUserId: actor.userId, academyId: w.academyId,
        verificationSessionId: actor.otpId, ...w.child,
        relationshipType: "MOTHER", consentPolicyVersion: "v1.0", consentAgreed: true,
      }, NOW()).then((r) => ({ ok: r.status === "VERIFIED" }), () => ({ ok: false })),
    ),
  );
  const successes = results.filter((r) => r.ok).length;
  assert.equal(successes, 1, `성공 ${successes}개 — OTP 1회 소비여야 함`);
});

/* ── R8 C8-02: 결제 경쟁 테스트 (C8-01 수정의 P0 종료 증거) ── */
import { processPgWebhook, preparePayment } from "../src/billing/service";
import { schema as s2 } from "@pacefolio/db";
import { eq as eq2, inArray as inArray2 } from "drizzle-orm";

/** 결제 경쟁용 seed — invoice 100,000 + 보호자·링크·멤버십 */
async function setupBilling(w: World) {
  const userId = rid("u");
  const gdId = rid("gd");
  const invoiceId = rid("inv");
  await w.db.insert(s2.users).values({ id: userId, name: "결제경쟁", phone: "010-7" });
  await w.db.insert(s2.academyMemberships).values({
    id: rid("m"), userId, academyId: w.academyId, roles: ["GUARDIAN"], status: "ACTIVE", joinedAt: "2025-03-02",
  });
  await w.db.insert(s2.guardians).values({ id: gdId, userId });
  await w.db.insert(s2.guardianParticipantLinks).values({
    id: rid("gl"), guardianId: gdId, participantId: w.participantId, academyId: w.academyId,
    relationshipType: "MOTHER", isPrimaryGuardian: false, verificationStatus: "VERIFIED",
    canViewSchedule: true, canViewAttendance: true, canViewHealthInfo: true,
    canReceivePhotos: true, canPay: true, canRequestRefund: true,
  });
  await w.db.insert(s2.billingPeriods).values({
    id: rid("bp"), academyId: w.academyId, periodStart: "2025-09-01", periodEnd: "2025-11-30", cycleMonths: 3,
  }).then(async () => {
    const bp = (await w.db.select().from(s2.billingPeriods)).find((b) => b.academyId === w.academyId)!;
    await w.db.insert(s2.invoices).values({
      id: invoiceId, academyId: w.academyId, participantId: w.participantId, enrollmentId: rid("e"),
      billingPeriodId: bp.id, status: "ISSUED", total: 100000, dueDate: "2025-09-10",
    });
  });
  return { userId, gdId, invoiceId };
}

test("C8-01 회귀: 동일 Invoice 의 두 Payment CAPTURED 동시 도착 → APPLY 1·RECONCILE 1", { skip }, async () => {
  const w = await setup();
  const { gdId, invoiceId } = await setupBilling(w);
  // 만료된 attempt A + 새 attempt B — 리뷰 재현 조건 그대로
  const past = new Date(Date.now() - 3600_000).toISOString();
  const payA = rid("payA"); const payB = rid("payB");
  await w.db.insert(s2.payments).values([
    { id: payA, academyId: w.academyId, guardianId: gdId, amount: 100000, status: "PENDING", idempotencyKey: rid("kA"), attemptExpiresAt: past },
    { id: payB, academyId: w.academyId, guardianId: gdId, amount: 100000, status: "PENDING", idempotencyKey: rid("kB") },
  ]);
  await w.db.insert(s2.paymentAllocations).values([
    { id: rid("paA"), paymentId: payA, invoiceId, academyId: w.academyId, amount: 100000 },
    { id: rid("paB"), paymentId: payB, invoiceId, academyId: w.academyId, amount: 100000 },
  ]);
  const t = NOW();
  const evA = rid("evA"); const evB = rid("evB");
  const [dA, dB] = await Promise.all([
    processPgWebhook(w.db, "mockpg", { providerEventId: evA, paymentId: payA, targetStatus: "CAPTURED", occurredAt: t, rawPayload: "{}" }, NOW()),
    processPgWebhook(w.db, "mockpg", { providerEventId: evB, paymentId: payB, targetStatus: "CAPTURED", occurredAt: t, rawPayload: "{}" }, NOW()),
  ]);
  const actions = [dA.action, dB.action].sort();
  assert.deepEqual(actions, ["APPLY", "RECONCILE"], `기대 APPLY+RECONCILE, 실제 ${actions}`);
  // CAPTURED 정확히 1건 · 나머지 PENDING 유지
  const pays = await w.db.select().from(s2.payments).where(inArray2(s2.payments.id, [payA, payB]));
  assert.equal(pays.filter((p) => p.status === "CAPTURED").length, 1);
  assert.equal(pays.filter((p) => p.status === "PENDING").length, 1);
  // Invoice PAID · CAPTURED 배분 합 ≤ total
  const inv = (await w.db.select().from(s2.invoices).where(eq2(s2.invoices.id, invoiceId)))[0];
  assert.equal(inv.status, "PAID");
  // R9-P1-02: 이번 두 이벤트 ID 로 특정해 inbox 상태를 **정확히 1+1** 검증
  const inbox = (await w.db.select().from(s2.webhookInbox))
    .filter((i) => i.providerEventId === evA || i.providerEventId === evB);
  assert.equal(inbox.length, 2);
  assert.equal(inbox.filter((i) => i.status === "APPLIED").length, 1, "APPLIED 정확히 1건");
  assert.equal(inbox.filter((i) => i.status === "RECONCILE_REQUIRED").length, 1, "RECONCILE_REQUIRED 정확히 1건");
  assert.equal(
    (await w.db.select().from(s2.outboxEvents)).filter((o) =>
      o.eventType === "PAYMENT_CAPTURED" && (o.payload.includes(payA) || o.payload.includes(payB))).length,
    1, "PAYMENT_CAPTURED outbox 정확히 1건");
});

test("C8-02 B: 동일 Invoice 에 서로 다른 멱등키 prepare ×20 → Payment 1·나머지 ACTIVE_ATTEMPT", { skip }, async () => {
  const w = await setup();
  const { userId, invoiceId } = await setupBilling(w);
  const results = await Promise.all(Array.from({ length: 20 }, (_, i) =>
    preparePayment(w.db, {
      actorUserId: userId, academyId: w.academyId, invoiceIds: [invoiceId],
      idempotencyKey: rid(`k${i}`), requestHash: `h${i}`,
    }, NOW()).then((r) => r.kind, () => "ERROR")));
  const created = results.filter((k) => k === "CREATED").length;
  const blocked = results.filter((k) => k === "ACTIVE_ATTEMPT_EXISTS").length;
  assert.equal(created, 1, `CREATED ${created}개 — 정확히 1개여야 함 (${JSON.stringify(results)})`);
  assert.equal(blocked, 19);
  const allocs = (await w.db.select().from(s2.paymentAllocations))
    .filter((a) => a.invoiceId === invoiceId);
  assert.equal(allocs.length, 1); // Allocation 도 1개
});

test("C8-02 C: 같은 providerEventId CAPTURED ×20 → APPLY 1·IGNORE 19·version +1", { skip }, async () => {
  const w = await setup();
  const { userId, invoiceId } = await setupBilling(w);
  const prep = await preparePayment(w.db, {
    actorUserId: userId, academyId: w.academyId, invoiceIds: [invoiceId],
    idempotencyKey: rid("k"), requestHash: "h",
  }, NOW());
  assert.equal(prep.kind, "CREATED");
  const paymentId = (prep as { paymentId: string }).paymentId;
  const evId = rid("ev-same");
  const t = NOW();
  const decisions = await Promise.all(Array.from({ length: 20 }, () =>
    processPgWebhook(w.db, "mockpg", { providerEventId: evId, paymentId, targetStatus: "CAPTURED", occurredAt: t, rawPayload: "{}" }, NOW())
      .then((d) => d.action, () => "ERROR")));
  assert.equal(decisions.filter((a) => a === "APPLY").length, 1);
  assert.equal(decisions.filter((a) => a === "IGNORE_ALREADY_SEEN").length, 19);
  const pay = (await w.db.select().from(s2.payments).where(eq2(s2.payments.id, paymentId)))[0];
  assert.equal(pay.status, "CAPTURED");
  assert.equal(pay.version, 2); // 정확히 1회 갱신(+1)
});

/* ═══ 12차 hardening(#18): 환불 승인 ↔ 링크 철회 동시 경쟁 ═══
   철회 tx 가 링크 행 잠금을 쥔 채 커밋 전인 동안 승인이 도착하는 정확한
   동시 시나리오. FOR UPDATE 재검증(LCV1-P0-03 + 행 잠금)이 없으면 승인은
   철회 전 스냅샷(VERIFIED)을 읽고 both-commit — "철회됐는데 승인"이 된다.
   잠금 후에는 승인이 철회 커밋을 기다렸다가 철회된 값을 읽고 DENIED. */
import { approveRefund } from "../src/billing/refunds";

test("hardening: 링크 철회 tx 커밋 전 도착한 승인 → 잠금 대기 후 DENIED", { skip }, async () => {
  const w = await setup();
  const uid = rid("u"); const gid = rid("gd");
  await w.db.insert(s2.users).values({ id: uid, name: "경쟁보호자", phone: "010-0000-0000" });
  await w.db.insert(s2.guardians).values({ id: gid, userId: uid });
  const linkId = rid("gl");
  await w.db.insert(s2.guardianParticipantLinks).values({
    id: linkId, guardianId: gid, participantId: w.participantId, academyId: w.academyId,
    relationshipType: "MOTHER", isPrimaryGuardian: true, verificationStatus: "VERIFIED",
    canViewSchedule: true, canViewAttendance: true, canViewHealthInfo: true,
    canReceivePhotos: true, canPay: true, canRequestRefund: true,
  });
  const payId = rid("pay");
  await w.db.insert(s2.payments).values({
    id: payId, academyId: w.academyId, guardianId: gid, amount: 100000,
    status: "CAPTURED", idempotencyKey: rid("k"),
  });
  const refId = rid("ref");
  await w.db.insert(s2.refunds).values({
    id: refId, academyId: w.academyId, paymentId: payId, participantId: w.participantId,
    status: "REQUESTED", reasonCode: "PERSONAL", requestedAmount: 100000,
    requestedByUserId: uid, requestedAt: NOW(), idempotencyKey: rid("rk"),
  });

  const client = await sharedPool!.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT id FROM guardian_participant_links WHERE id = $1 FOR UPDATE", [linkId],
    );
    // 승인 시도 — 링크 FOR UPDATE 에서 블록돼야 함(커밋 전 승인 금지)
    const approval = approveRefund(w.db, {
      actorUserId: uid, academyId: w.academyId, refundId: refId, side: "GUARDIAN",
    }, NOW());
    await new Promise((r) => setTimeout(r, 400)); // 승인이 잠금 대기에 진입할 시간
    await client.query(
      "UPDATE guardian_participant_links SET verification_status = 'REJECTED' WHERE id = $1", [linkId],
    );
    await client.query("COMMIT");
    const res = await approval;
    assert.equal(res.kind, "DENIED"); // 철회 커밋을 본 뒤 거부 — 운영 심사 경로
    assert.match((res as { reason: string }).reason, /유효하지 않음/);
    // 승인 흔적이 없어야 함
    const ref = (await w.db.select().from(s2.refunds).where(eq2(s2.refunds.id, refId)))[0];
    assert.equal(ref.guardianApprovedAt, null);
    assert.equal(ref.status, "REQUESTED");
  } finally {
    client.release();
  }
});
