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

/* ── R7 P0-6: 교차 테넌트 참조를 DB 가 직접 차단 (서비스 우회 insert) ── */

async function seedTwoAcademies() {
  await seedUserAcademy(); // a_wg + u_1
  await db.insert(s.academies).values({
    id: "a_other", organizationId: "o_other", name: "타학원", themeColor: "#000",
    themeInk: "#000", logoEmoji: "🏫", ownerName: "남원장", billingCycleDefault: 3,
  }).onConflictDoNothing();
  await db.insert(s.participants).values({
    id: "p_b", academyId: "a_other", name: "B학원원생", birth: "2018-01-01", ageLabel: "7세",
  }).onConflictDoNothing();
  await db.insert(s.billingPeriods).values({
    id: "bp_a", academyId: "a_wg", periodStart: "2025-09-01", periodEnd: "2025-11-30", cycleMonths: 3,
  }).onConflictDoNothing();
}

test("R7: A학원 Invoice + B학원 Participant → DB 복합 FK 가 거부", async () => {
  await seedTwoAcademies();
  await rejectsWith(
    db.insert(s.invoices).values({
      id: "inv_cross", academyId: "a_wg", participantId: "p_b", // B학원 원생!
      enrollmentId: "e_x", billingPeriodId: "bp_a", status: "ISSUED", total: 100000, dueDate: "2025-09-10",
    }),
    /foreign key|violat/i,
  );
});

test("R7: A학원 Payment + B학원 Invoice 배분 → DB 복합 FK 가 거부", async () => {
  await seedTwoAcademies();
  await db.insert(s.participants).values({
    id: "p_a2", academyId: "a_wg", name: "A학원원생", birth: "2018-01-01", ageLabel: "7세",
  }).onConflictDoNothing();
  await db.insert(s.billingPeriods).values({
    id: "bp_b", academyId: "a_other", periodStart: "2025-09-01", periodEnd: "2025-11-30", cycleMonths: 3,
  }).onConflictDoNothing();
  await db.insert(s.participants).values({
    id: "p_b2", academyId: "a_other", name: "B원생2", birth: "2018-01-01", ageLabel: "7세",
  }).onConflictDoNothing();
  await db.insert(s.invoices).values({
    id: "inv_b", academyId: "a_other", participantId: "p_b2",
    enrollmentId: "e_b", billingPeriodId: "bp_b", status: "ISSUED", total: 50000, dueDate: "2025-09-10",
  }).onConflictDoNothing();
  await db.insert(s.users).values({ id: "u_pay", name: "결제자", phone: "010-9" }).onConflictDoNothing();
  await db.insert(s.guardians).values({ id: "gd_pay", userId: "u_pay" }).onConflictDoNothing();
  await db.insert(s.payments).values({
    id: "pay_a", academyId: "a_wg", guardianId: "gd_pay", amount: 50000,
    status: "PENDING", idempotencyKey: "cross-k",
  }).onConflictDoNothing();
  // A학원 결제에 B학원 청구서 배분 — academyId 를 a_wg 로 위장해도 invoice 복합 FK 가 잡음
  await rejectsWith(
    db.insert(s.paymentAllocations).values({
      id: "pa_cross", paymentId: "pay_a", invoiceId: "inv_b", academyId: "a_wg", amount: 50000,
    }),
    /foreign key|violat/i,
  );
});

test("R7 P0-7: 원생당 Primary 보호자 1명 — 두 번째 primary insert 거부(partial unique)", async () => {
  await seedTwoAcademies();
  await db.insert(s.users).values({ id: "u_2", name: "아버지", phone: "010-2" }).onConflictDoNothing();
  await db.insert(s.participants).values({
    id: "p_prim", academyId: "a_wg", name: "프라이머리", birth: "2018-01-01", ageLabel: "7세",
  }).onConflictDoNothing();
  await db.insert(s.users).values({ id: "u_m", name: "어머니2", phone: "010-m" }).onConflictDoNothing();
  await db.insert(s.guardians).values([
    { id: "gd_m", userId: "u_m" }, { id: "gd_f", userId: "u_2" },
  ]).onConflictDoNothing();
  const base = {
    academyId: "a_wg", participantId: "p_prim",
    relationshipType: "MOTHER" as const, verificationStatus: "VERIFIED" as const,
    canViewSchedule: true, canViewAttendance: true, canViewHealthInfo: false,
    canReceivePhotos: false, canPay: false, canRequestRefund: false,
  };
  await db.insert(s.guardianParticipantLinks).values({ id: "gl_m", guardianId: "gd_m", isPrimaryGuardian: true, ...base });
  await rejectsWith(
    db.insert(s.guardianParticipantLinks).values({ id: "gl_f", guardianId: "gd_f", isPrimaryGuardian: true, ...base }),
    /unique|duplicate/i,
  );
  // primary 아닌 두 번째 보호자는 허용
  await db.insert(s.guardianParticipantLinks).values({ id: "gl_f2", guardianId: "gd_f", isPrimaryGuardian: false, ...base });
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
