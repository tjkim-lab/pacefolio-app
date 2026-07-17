/* R5 Phase 4 필수 동시성 테스트 — 실 PostgreSQL 전용.
   완료 기준 그대로:
   - 동일 single-use invite 로 20개 동시 요청 → 정확히 1개만 성공
   - maxUses=3 invite 에 20개 동시 요청 → 정확히 3개만 성공
   - 동일 OTP session 으로 20개 동시 요청 → 정확히 1개만 성공
   근거 잠금: invite row FOR UPDATE(경쟁 직렬화) + OTP 조건부 UPDATE +
   UNIQUE(invite, guardian, participant).
   실행: DATABASE_URL_TEST 설정 시에만(CI postgres:16 service). 로컬은 skip. */
import { test } from "node:test";
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

async function setup(): Promise<World> {
  const pool = new Pool({ connectionString: DATABASE_URL_TEST, max: 25 }); // 20 동시 tx 수용
  const db = drizzle(pool);
  await migrate(db, { migrationsFolder }); // 재적용은 no-op(migrator 저널)
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
