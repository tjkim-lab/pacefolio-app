/* Phase 0+1 완료 기준 테스트 (R5 §7)
   - 빈 DB(PGlite = 진짜 Postgres WASM)에서 migration 전체 적용 성공
   - DB 제약이 문서의 불변식을 실제로 강제하는가:
     · ExternalIdentity(provider, providerSubject) UNIQUE
     · AcademyMembership(userId, academyId) UNIQUE (모델 A)
     · GuardianLink(guardianId, participantId, academyId) UNIQUE
     · Session tokenHash UNIQUE (원문 컬럼 자체가 없음)
     · OAuth stateHash UNIQUE (일회성 소비 전제)
     · billingCycleDefault CHECK (1|3) · roles 비어있음 금지
   ⚠️ row lock 경쟁(동시 20요청) 테스트는 PGlite 단일 커넥션으로 불가 —
      CI postgres service 에서 별도(R5 Phase 4). */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as s from "../schema";

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

/* drizzle 이 DB 에러를 "Failed query: ..." 로 감싸므로 cause 체인에서 원인 확인 */
function rejectsWith(p: Promise<unknown>, re: RegExp): Promise<void> {
  return assert.rejects(p, (e: unknown) => {
    const msgs: string[] = [];
    for (let cur = e as { message?: string; cause?: unknown } | undefined; cur; cur = cur.cause as never) {
      if (cur.message) msgs.push(cur.message);
    }
    assert.match(msgs.join(" | "), re);
    return true;
  });
}

let db: ReturnType<typeof drizzle>;

before(async () => {
  const client = new PGlite(); // 메모리 — 매 실행이 "빈 DB"
  db = drizzle(client);
  await migrate(db, { migrationsFolder }); // ← Phase 0 완료 기준: 전체 적용
});

/* 공통 seed */
async function seedUserAcademy() {
  await db.insert(s.users).values({ id: "u_1", name: "박서연", phone: "010-3000-1234" }).onConflictDoNothing();
  await db.insert(s.academies).values({
    id: "a_wg", organizationId: "o_wg", name: "원더짐 아카데미",
    themeColor: "#12B5A5", themeInk: "#087F73", logoEmoji: "🐯",
    ownerName: "김도윤", billingCycleDefault: 3,
  }).onConflictDoNothing();
}

test("migration: 빈 DB 에 전체 적용 + 기본 CRUD", async () => {
  await seedUserAcademy();
  const rows = await db.select().from(s.users);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].version, 1); // 낙관잠금 기본값
});

test("제약: ExternalIdentity(provider, providerSubject) UNIQUE — 중복 연결 거부", async () => {
  await seedUserAcademy();
  await db.insert(s.externalIdentities).values({ id: "xid_1", userId: "u_1", provider: "kakao", providerSubject: "kakao-123" });
  await rejectsWith(
    db.insert(s.externalIdentities).values({ id: "xid_2", userId: "u_1", provider: "kakao", providerSubject: "kakao-123" }),
    /unique|duplicate/i,
  );
  // 다른 provider 의 같은 subject 는 허용(별개 계정)
  await db.insert(s.externalIdentities).values({ id: "xid_3", userId: "u_1", provider: "naver", providerSubject: "kakao-123" });
});

test("제약: AcademyMembership(userId, academyId) UNIQUE — 모델 A(1 membership, roles[])", async () => {
  await seedUserAcademy();
  await db.insert(s.academyMemberships).values({
    id: "m_1", userId: "u_1", academyId: "a_wg", roles: ["OWNER", "COACH"], status: "ACTIVE", joinedAt: "2024-03-01",
  });
  await rejectsWith(
    db.insert(s.academyMemberships).values({
      id: "m_2", userId: "u_1", academyId: "a_wg", roles: ["GUARDIAN"], status: "ACTIVE", joinedAt: "2025-01-01",
    }),
    /unique|duplicate/i,
  );
});

test("제약: roles 빈 배열 금지 (CHECK)", async () => {
  await seedUserAcademy();
  await rejectsWith(
    db.insert(s.academyMemberships).values({
      id: "m_empty", userId: "u_1", academyId: "a_wg", roles: [], status: "ACTIVE", joinedAt: "2024-03-01",
    }),
    /check|violat/i,
  );
});

test("제약: billingCycleDefault ∈ {1,3} (헌법 — 월·분기)", async () => {
  await rejectsWith(
    db.insert(s.academies).values({
      id: "a_bad", organizationId: "o_x", name: "나쁜 주기", themeColor: "#000", themeInk: "#000",
      logoEmoji: "❌", ownerName: "x", billingCycleDefault: 6, // 6개월 — 금지
    }),
    /check|violat/i,
  );
});

test("제약: GuardianLink(guardian, participant, academy) UNIQUE — 중복 링크 방지", async () => {
  await seedUserAcademy();
  await db.insert(s.guardians).values({ id: "gd_1", userId: "u_1" }).onConflictDoNothing();
  await db.insert(s.participants).values({
    id: "p_1", academyId: "a_wg", name: "김도담", birth: "2017-04-10", ageLabel: "8세",
  }).onConflictDoNothing();
  const link = {
    guardianId: "gd_1", participantId: "p_1", academyId: "a_wg",
    relationshipType: "MOTHER" as const, isPrimaryGuardian: true, verificationStatus: "VERIFIED" as const,
    canViewSchedule: true, canViewAttendance: true, canViewHealthInfo: true,
    canReceivePhotos: true, canPay: true, canRequestRefund: true,
  };
  await db.insert(s.guardianParticipantLinks).values({ id: "gl_1", ...link });
  await rejectsWith(
    db.insert(s.guardianParticipantLinks).values({ id: "gl_dup", ...link }),
    /unique|duplicate/i,
  );
});

test("제약: 세션 tokenHash UNIQUE + 원문 컬럼 부재", async () => {
  await seedUserAcademy();
  await db.insert(s.sessions).values({
    id: "ses_1", userId: "u_1", tokenHash: "sha256:abc", expiresAt: "2026-07-17T00:00:00Z",
  });
  await rejectsWith(
    db.insert(s.sessions).values({
      id: "ses_2", userId: "u_1", tokenHash: "sha256:abc", expiresAt: "2026-07-18T00:00:00Z",
    }),
    /unique|duplicate/i,
  );
  // 토큰 원문 컬럼이 스키마에 아예 없음 — 저장 자체가 불가능
  assert.equal("token" in s.sessions, false);
});

test("제약: OAuth stateHash UNIQUE (일회성 소비 전제) + 참조 무결성(FK)", async () => {
  await db.insert(s.oauthAuthorizationRequests).values({
    id: "oar_1", provider: "kakao", stateHash: "sh_1", codeVerifier: "cv", redirectUri: "https://app/cb",
    expiresAt: "2026-07-16T00:10:00Z",
  });
  await rejectsWith(
    db.insert(s.oauthAuthorizationRequests).values({
      id: "oar_2", provider: "kakao", stateHash: "sh_1", codeVerifier: "cv2", redirectUri: "https://app/cb",
      expiresAt: "2026-07-16T00:10:00Z",
    }),
    /unique|duplicate/i,
  );
  // FK: 존재하지 않는 user 의 세션 금지
  await rejectsWith(
    db.insert(s.sessions).values({
      id: "ses_ghost", userId: "u_ghost", tokenHash: "sha256:x", expiresAt: "2026-07-17T00:00:00Z",
    }),
    /foreign key|violat/i,
  );
});

test("트랜잭션: 실패 시 전체 rollback (Phase 0 완료 기준)", async () => {
  await seedUserAcademy();
  await assert.rejects(
    db.transaction(async (tx) => {
      await tx.insert(s.users).values({ id: "u_tx", name: "롤백", phone: "010-0000-0000" });
      // 두 번째 insert 가 제약 위반 → 첫 insert 도 함께 롤백돼야 함
      await tx.insert(s.academies).values({
        id: "a_tx", organizationId: "o", name: "x", themeColor: "#", themeInk: "#",
        logoEmoji: "x", ownerName: "x", billingCycleDefault: 99,
      });
    }),
  );
  const ghost = await db.select().from(s.users);
  assert.ok(!ghost.some((u) => u.id === "u_tx"), "트랜잭션 실패 시 u_tx 는 존재하면 안 됨");
});
