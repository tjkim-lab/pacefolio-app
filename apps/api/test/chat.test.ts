/* 배치 14 통합 테스트 — 소통(채팅) vertical slice (docs/12 개정 계약)
   실 HTTP × PGlite(WASM Postgres — 같은 migration·실 PostgreSQL 검증은 concurrency.pg.test.ts/CI):
   - ACK 수명주기: SENT → READ(안 사라짐) → ACKNOWLEDGED → RESOLVED
   - 민감 카테고리: BILLING = DM+context card 만 / HEALTH = 원생 지정 필수
   - 경계: 비멤버 403 · 공지형 학원방 보호자 발송 403 · DM 중복 방지 · 감사 기록 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { and, eq } from "drizzle-orm";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { schema as s } from "@pacefolio/db";
import { createApp } from "../src/app";
import type { OAuthProvider } from "../src/auth/provider";

const migrationsFolder = join(
  dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "packages", "db", "migrations",
);
const NOW = "2026-07-18T10:00:00.000Z";
const ORIGIN = "http://localhost:3000";
let db: ReturnType<typeof drizzle>;
let app: ReturnType<typeof createApp>;

const fake: OAuthProvider = {
  name: "kakao", oidc: false,
  authorizeUrl: (p) => `https://fake/authorize?state=${p.state}`,
  exchangeCode: async (code) => ({ providerSubject: `sub-${code}`, displayName: `유저-${code}` }),
};

interface Actor { cookie: string; csrf: string; userId: string }
async function login(code: string): Promise<Actor> {
  const startRes = await app.request("/auth/kakao/start", { method: "POST" });
  const { state } = await startRes.json() as { state: string };
  const cb = await app.request(`/auth/kakao/callback?code=${code}&state=${state}`);
  assert.equal(cb.status, 200);
  const { userId } = await cb.json() as { userId: string };
  const setCookies = cb.headers.getSetCookie();
  const cookie = setCookies.map((c) => c.split(";")[0]).join("; ");
  const csrf = setCookies.find((c) => c.startsWith("pf_csrf="))!.split(";")[0].split("=")[1];
  return { cookie, csrf, userId };
}
const post = (a: Actor, path: string, body?: unknown) =>
  app.request(path, {
    method: "POST",
    headers: {
      cookie: a.cookie, origin: ORIGIN, "x-csrf-token": a.csrf,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
const get = (a: Actor, path: string) => app.request(path, { headers: { cookie: a.cookie } });

let owner: Actor, coach: Actor, coach2: Actor, mom: Actor, outsider: Actor;

before(async () => {
  const client = new PGlite();
  db = drizzle(client);
  await migrate(db, { migrationsFolder });
  app = createApp({
    db, providers: { kakao: fake }, allowedOrigins: [ORIGIN],
    redirectUri: "http://x/cb", now: () => NOW, secureCookies: false,
  });
  await db.insert(s.academies).values([
    { id: "a_wg", organizationId: "o_wg", name: "원더짐", themeColor: "#12B5A5", themeInk: "#087F73", logoEmoji: "🐯", ownerName: "김도윤", billingCycleDefault: 3 },
    { id: "a_other", organizationId: "o_x", name: "타학원", themeColor: "#000", themeInk: "#000", logoEmoji: "🏫", ownerName: "남원장", billingCycleDefault: 3 },
  ]);
  await db.insert(s.participants).values([
    { id: "p_dodam", academyId: "a_wg", name: "김도담", birth: "2017-04-10", ageLabel: "8세" },
    { id: "p_b", academyId: "a_other", name: "타학원생", birth: "2018-01-01", ageLabel: "7세" },
  ]);

  owner = await login("owner");
  coach = await login("coach");
  coach2 = await login("coach2");
  mom = await login("mom");
  outsider = await login("outsider");
  await db.insert(s.academyMemberships).values([
    { id: "m_o", userId: owner.userId, academyId: "a_wg", roles: ["OWNER"], status: "ACTIVE", joinedAt: "2024-03-01" },
    { id: "m_c", userId: coach.userId, academyId: "a_wg", roles: ["COACH"], status: "ACTIVE", joinedAt: "2024-08-01" },
    { id: "m_c2", userId: coach2.userId, academyId: "a_wg", roles: ["COACH"], status: "ACTIVE", joinedAt: "2025-03-01" },
    { id: "m_m", userId: mom.userId, academyId: "a_wg", roles: ["GUARDIAN"], status: "ACTIVE", joinedAt: "2025-03-02" },
    { id: "m_out", userId: outsider.userId, academyId: "a_other", roles: ["OWNER"], status: "ACTIVE", joinedAt: "2024-01-01" },
  ]);
  await db.insert(s.guardians).values({ id: "gd_mom", userId: mom.userId });
  await db.insert(s.guardianParticipantLinks).values({
    id: "gl_mom", guardianId: "gd_mom", participantId: "p_dodam", academyId: "a_wg",
    relationshipType: "MOTHER", isPrimaryGuardian: true, verificationStatus: "VERIFIED",
    canViewSchedule: true, canViewAttendance: true, canViewHealthInfo: true,
    canReceivePhotos: true, canPay: true, canRequestRefund: true,
  });
  // 13차 C P0-1: BILLING 카드의 정본 청구서 + 두 번째 원생(불일치 검증용)
  await db.insert(s.participants).values({
    id: "p_hana", academyId: "a_wg", name: "이하나", birth: "2018-05-05", ageLabel: "7세",
  });
  await db.insert(s.billingPeriods).values({
    id: "bp_q4", academyId: "a_wg", periodStart: "2025-09-01", periodEnd: "2025-11-30", cycleMonths: 3,
  });
  await db.insert(s.invoices).values([
    { id: "inv_dodam", academyId: "a_wg", participantId: "p_dodam", enrollmentId: "e_d", billingPeriodId: "bp_q4", status: "ISSUED", total: 405000, dueDate: "2025-09-10" },
    { id: "inv_hana", academyId: "a_wg", participantId: "p_hana", enrollmentId: "e_h", billingPeriodId: "bp_q4", status: "ISSUED", total: 300000, dueDate: "2025-09-10" },
  ]);
  // #23: HEALTH 코치 담당 검증 재료 — coach(담당 O), coach2(담당 X)
  await db.insert(s.dbClasses).values({
    id: "cls_p2", academyId: "a_wg", name: "플레이2", scheduleType: "FIXED_WEEKLY", capacity: 12,
  });
  await db.insert(s.classAssignments).values({
    id: "ca_1", classId: "cls_p2", academyId: "a_wg", coachUserId: coach.userId,
    status: "ACTIVE", startDate: "2024-08-01",
  });
  await db.insert(s.dbEnrollments).values({
    id: "en_1", academyId: "a_wg", classId: "cls_p2", participantId: "p_dodam",
    status: "ACTIVE", startDate: "2025-03-02",
  });
});

/* ── ACK 수명주기: 원장 → 코치 확인 필수 전달 ── */
let dmRoom = "";
let ackMsg = "";

test("DM 개설: 원장→코치 201 + 같은 조합 재개설 = 200(기존 방)", async () => {
  const r1 = await post(owner, "/academies/a_wg/chat/dms", { type: "OWNER_COACH_DM", targetUserId: coach.userId });
  assert.equal(r1.status, 201);
  dmRoom = ((await r1.json()) as { roomId: string }).roomId;
  const r2 = await post(owner, "/academies/a_wg/chat/dms", { type: "OWNER_COACH_DM", targetUserId: coach.userId });
  assert.equal(r2.status, 200); // dmKey UNIQUE — find-or-create
  assert.equal(((await r2.json()) as { roomId: string }).roomId, dmRoom);
});

test("ACK_REQUIRED 발신 → SENT + 수신자 ack 행 + 감사 기록", async () => {
  const r = await post(owner, `/academies/a_wg/chat/rooms/${dmRoom}/messages`, {
    kind: "ACK_REQUIRED", body: "도담이 오늘 컨디션 확인해주세요", category: "HEALTH",
    relatedParticipantId: "p_dodam",
  });
  assert.equal(r.status, 201);
  const body = (await r.json()) as { messageId: string; status: string };
  ackMsg = body.messageId;
  assert.equal(body.status, "SENT");
  const acks = await db.select().from(s.chatMessageAcks).where(eq(s.chatMessageAcks.messageId, ackMsg));
  assert.equal(acks.length, 1);
  assert.equal(acks[0].userId, coach.userId);
  const audit = await db.select().from(s.auditLogs).where(and(
    eq(s.auditLogs.action, "chat.message.sent"), eq(s.auditLogs.targetId, ackMsg),
  ));
  assert.equal(audit.length, 1);
});

test("읽음 ≠ 확인: read 후에도 ACKNOWLEDGED 아님 + 미확인 수 유지", async () => {
  const r = await post(coach, `/academies/a_wg/chat/messages/${ackMsg}/read`);
  assert.equal(r.status, 200);
  assert.equal(((await r.json()) as { status: string }).status, "READ");
  const rooms = await get(coach, "/academies/a_wg/chat/rooms");
  const list = (await rooms.json()) as { rooms: { roomId: string; unacked: number }[] };
  assert.equal(list.rooms.find((x) => x.roomId === dmRoom)?.unacked, 1); // 읽어도 안 사라짐
});

test("처리 완료는 확인 후에만: resolve 선행 → 409", async () => {
  const r = await post(coach, `/academies/a_wg/chat/messages/${ackMsg}/resolve`, { note: "선행 시도" });
  assert.equal(r.status, 409);
});

test("확인(ACKNOWLEDGED): 확인자·시각 기록 + 미확인 수 0 + 감사", async () => {
  const r = await post(coach, `/academies/a_wg/chat/messages/${ackMsg}/ack`);
  assert.equal(r.status, 200);
  assert.equal(((await r.json()) as { status: string }).status, "ACKNOWLEDGED");
  const ack = (await db.select().from(s.chatMessageAcks).where(eq(s.chatMessageAcks.messageId, ackMsg)))[0];
  assert.equal(Date.parse(ack.acknowledgedAt ?? ""), Date.parse(NOW)); // 확인 시각 기록(DB 표기형)
  const rooms = await get(coach, "/academies/a_wg/chat/rooms");
  const list = (await rooms.json()) as { rooms: { roomId: string; unacked: number }[] };
  assert.equal(list.rooms.find((x) => x.roomId === dmRoom)?.unacked, 0);
  const audit = await db.select().from(s.auditLogs).where(and(
    eq(s.auditLogs.action, "chat.message.acknowledged"), eq(s.auditLogs.targetId, ackMsg),
  ));
  assert.equal(audit.length, 1);
});

test("처리 결과 보고(RESOLVED): 같은 thread 에 note + 감사", async () => {
  const r = await post(coach, `/academies/a_wg/chat/messages/${ackMsg}/resolve`, {
    note: "강도 한 단계 낮춰 진행 — 끝까지 참여했어요",
  });
  assert.equal(r.status, 200);
  assert.equal(((await r.json()) as { status: string }).status, "RESOLVED");
  const msgs = await get(coach, `/academies/a_wg/chat/rooms/${dmRoom}/messages`);
  const mm = (await msgs.json()) as { messages: { messageId: string; status: string; resolvedNote: string | null }[] };
  const m = mm.messages.find((x) => x.messageId === ackMsg)!;
  assert.equal(m.status, "RESOLVED");
  assert.match(m.resolvedNote ?? "", /끝까지 참여/);
});

/* ── 경계·권한 ── */
test("비멤버 발신 403: 다른 코치가 원장-코치1 DM 에 발신 불가", async () => {
  const r = await post(coach2, `/academies/a_wg/chat/rooms/${dmRoom}/messages`, {
    kind: "NORMAL_CHAT", body: "침입 시도",
  });
  assert.equal(r.status, 403);
});

test("타학원 사용자: 방 목록 403(membership guard) — 교차 테넌트 차단", async () => {
  const r = await get(outsider, "/academies/a_wg/chat/rooms");
  assert.equal(r.status, 403);
});

test("DM 개설 권한: 보호자가 코치 DM 개설 403 / 코치 아닌 대상 403", async () => {
  const r1 = await post(mom, "/academies/a_wg/chat/dms", { type: "OWNER_COACH_DM", targetUserId: coach.userId });
  assert.equal(r1.status, 403);
  const r2 = await post(owner, "/academies/a_wg/chat/dms", { type: "OWNER_COACH_DM", targetUserId: mom.userId });
  assert.equal(r2.status, 403); // 대상이 코치 아님
});

/* ── 민감 카테고리(docs/12 개정: 금지 → 조건부 허용) ── */
let momRoom = "";
test("보호자 DM 개설: VERIFIED 링크 필요 — 원생 컨텍스트 귀속", async () => {
  const bad = await post(mom, "/academies/a_wg/chat/dms", { type: "GUARDIAN_DM", participantId: "p_b" });
  assert.equal(bad.status, 403); // 타학원 원생 — 링크 없음
  const r = await post(mom, "/academies/a_wg/chat/dms", { type: "GUARDIAN_DM", participantId: "p_dodam" });
  assert.equal(r.status, 201);
  momRoom = ((await r.json()) as { roomId: string }).roomId;
});

test("13차 C P0-1: BILLING 카드 = 서버 생성 — 클라이언트 contextCard 는 422(strict)", async () => {
  const clientCard = await post(owner, `/academies/a_wg/chat/rooms/${momRoom}/messages`, {
    kind: "NORMAL_CHAT", category: "BILLING", body: "카드 위조 시도",
    contextCard: JSON.stringify({ invoiceId: "가짜", total: 99999999 }),
  });
  assert.equal(clientCard.status, 422); // contextCard 입력 필드 자체가 계약에서 제거됨
  const noRef = await post(mom, `/academies/a_wg/chat/rooms/${momRoom}/messages`, {
    kind: "NORMAL_CHAT", category: "BILLING", body: "수강료 문의드려요",
  });
  assert.equal(noRef.status, 422); // invoiceId 참조 필수
});

test("13차 C P0-1: invoiceId 참조 → 서버가 DB 정본으로 카드 생성(금액 위조 불가)", async () => {
  const r = await post(owner, `/academies/a_wg/chat/rooms/${momRoom}/messages`, {
    kind: "NORMAL_CHAT", category: "BILLING", body: "9월 청구서 안내드려요", invoiceId: "inv_dodam",
  });
  assert.equal(r.status, 201);
  const { messageId } = (await r.json()) as { messageId: string };
  const row = (await db.select().from(s.chatMessages).where(eq(s.chatMessages.id, messageId)))[0];
  const card = JSON.parse(row.contextCard ?? "{}") as { invoiceId: string; total: number };
  assert.equal(card.invoiceId, "inv_dodam");
  assert.equal(card.total, 405000); // 서버 DB 값 — 클라이언트가 준 값이 아님
});

test("13차 C P0-1: 가짜 invoiceId 422 · 다른 원생 청구서 422 (방 원생 정본)", async () => {
  const fake = await post(owner, `/academies/a_wg/chat/rooms/${momRoom}/messages`, {
    kind: "NORMAL_CHAT", category: "BILLING", body: "x", invoiceId: "inv_ghost",
  });
  assert.equal(fake.status, 422);
  const otherKid = await post(owner, `/academies/a_wg/chat/rooms/${momRoom}/messages`, {
    kind: "NORMAL_CHAT", category: "BILLING", body: "x", invoiceId: "inv_hana", // 도담 방에 하나 청구서
  });
  assert.equal(otherKid.status, 422);
});

test("13차 C P0-2: 방 원생 ≠ 메시지 원생 — override 422", async () => {
  const r = await post(owner, `/academies/a_wg/chat/rooms/${momRoom}/messages`, {
    kind: "NORMAL_CHAT", category: "HEALTH", body: "다른 원생 건강정보 주입 시도",
    relatedParticipantId: "p_hana", // 도담 방
  });
  assert.equal(r.status, 422);
});

test("BILLING 은 보호자 DM 밖 금지: 코치 DM 에서 422", async () => {
  const r = await post(owner, `/academies/a_wg/chat/rooms/${dmRoom}/messages`, {
    kind: "NORMAL_CHAT", category: "BILLING", body: "금액 이야기", invoiceId: "inv_dodam",
  });
  assert.equal(r.status, 422);
});

test("13차 C P0-3: canViewHealthInfo=false 보호자 방 → HEALTH 전송 422", async () => {
  const dad = await login("chatdad");
  await db.insert(s.academyMemberships).values({
    id: "m_cd", userId: dad.userId, academyId: "a_wg", roles: ["GUARDIAN"], status: "ACTIVE", joinedAt: "2025-03-02",
  });
  await db.insert(s.guardians).values({ id: "gd_cd", userId: dad.userId });
  await db.insert(s.guardianParticipantLinks).values({
    id: "gl_cd", guardianId: "gd_cd", participantId: "p_dodam", academyId: "a_wg",
    relationshipType: "FATHER", isPrimaryGuardian: false, verificationStatus: "VERIFIED",
    canViewSchedule: true, canViewAttendance: true, canViewHealthInfo: false, // 권한 없음
    canReceivePhotos: false, canPay: false, canRequestRefund: false,
  });
  const dm = await post(dad, "/academies/a_wg/chat/dms", { type: "GUARDIAN_DM", participantId: "p_dodam" });
  assert.equal(dm.status, 201);
  const room = ((await dm.json()) as { roomId: string }).roomId;
  const r = await post(owner, `/academies/a_wg/chat/rooms/${room}/messages`, {
    kind: "NORMAL_CHAT", category: "HEALTH", body: "컨디션 공유",
  });
  assert.equal(r.status, 422); // 권한 없는 보호자가 있는 방 — 전송 자체 차단
});

test("13차 C P0-4: 민감 메시지 조회 = 서버 감사 행(chat.sensitive_message.viewed)", async () => {
  const before = (await db.select().from(s.auditLogs)
    .where(eq(s.auditLogs.action, "chat.sensitive_message.viewed"))).length;
  const r = await get(owner, `/academies/a_wg/chat/rooms/${momRoom}/messages`);
  assert.equal(r.status, 200);
  const after = await db.select().from(s.auditLogs)
    .where(eq(s.auditLogs.action, "chat.sensitive_message.viewed"));
  assert.equal(after.length, before + 1);
  assert.equal(after[after.length - 1].targetId, momRoom);
});

test("13차 C P1-2: 발신자 자기 read = 멱등 no-op(상태 불변)", async () => {
  const sent = await post(owner, `/academies/a_wg/chat/rooms/${dmRoom}/messages`, {
    kind: "NORMAL_CHAT", body: "자기 read 검증",
  });
  const { messageId } = (await sent.json()) as { messageId: string };
  const r = await post(owner, `/academies/a_wg/chat/messages/${messageId}/read`);
  assert.equal(r.status, 200);
  const row = (await db.select().from(s.chatMessages).where(eq(s.chatMessages.id, messageId)))[0];
  assert.equal(row.status, "SENT"); // 발신자 read 로 READ 전진 금지
});

test("13차 C P1-5: clientMessageId 전송 멱등 — 재시도 = 같은 메시지", async () => {
  const body = { kind: "NORMAL_CHAT" as const, body: "멱등 전송", clientMessageId: "cmid-1" };
  const r1 = await post(owner, `/academies/a_wg/chat/rooms/${dmRoom}/messages`, body);
  const r2 = await post(owner, `/academies/a_wg/chat/rooms/${dmRoom}/messages`, body);
  assert.equal(r1.status, 201);
  assert.equal(r2.status, 201);
  const id1 = ((await r1.json()) as { messageId: string }).messageId;
  const id2 = ((await r2.json()) as { messageId: string }).messageId;
  assert.equal(id1, id2); // 중복 생성 없음
});

test("13차 C: 발송 Outbox 행 생성 + ACK 재시도 멱등(200)", async () => {
  const outbox = await db.select().from(s.outboxEvents)
    .where(eq(s.outboxEvents.eventType, "CHAT_MESSAGE_SENT"));
  assert.ok(outbox.length >= 1); // 발송마다 outbox 합류
  // 이미 확인한 ackMsg 재확인 = 멱등 성공(409 아님 — 모바일 응답 유실 재시도)
  const again = await post(coach, `/academies/a_wg/chat/messages/${ackMsg}/ack`);
  assert.equal(again.status, 200);
});

test("HEALTH: 원생 미지정 422 — DB CHECK(ck_chatmsg_health_participant)도 동일 불변식", async () => {
  const r = await post(owner, `/academies/a_wg/chat/rooms/${dmRoom}/messages`, {
    kind: "NORMAL_CHAT", category: "HEALTH", body: "컨디션 관련",
  });
  assert.equal(r.status, 422);
});

test("#23: 담당 아닌 코치 방 → HEALTH 422 (ClassAssignment 검증 — 13차 C 잔여 마감)", async () => {
  const dm2 = await post(owner, "/academies/a_wg/chat/dms", { type: "OWNER_COACH_DM", targetUserId: coach2.userId });
  const room2 = ((await dm2.json()) as { roomId: string }).roomId;
  const r = await post(owner, `/academies/a_wg/chat/rooms/${room2}/messages`, {
    kind: "NORMAL_CHAT", category: "HEALTH", body: "도담 건강", relatedParticipantId: "p_dodam",
  });
  assert.equal(r.status, 422); // coach2 는 도담 담당 아님
  // 담당 코치(coach) 방은 허용 — 기존 dmRoom 의 HEALTH 테스트가 그 증거(seed 배정)
});

test("확인 수명주기 없는 메시지에 ack → 409", async () => {
  const r = await post(owner, `/academies/a_wg/chat/rooms/${dmRoom}/messages`, {
    kind: "NORMAL_CHAT", body: "일반 대화",
  });
  const { messageId } = (await r.json()) as { messageId: string };
  const ack = await post(coach, `/academies/a_wg/chat/messages/${messageId}/ack`);
  assert.equal(ack.status, 409);
});

test("14차 C P1-1: 코치 배정 해제 → HEALTH 읽기 가림(방 멤버여도) · 재배정 시 복구", async () => {
  // dmRoom 의 첫 메시지는 HEALTH(도담) — 담당 해제 후 조회
  await db.update(s.classAssignments).set({ status: "ENDED" })
    .where(eq(s.classAssignments.id, "ca_1"));
  let msgs = (await (await get(coach, `/academies/a_wg/chat/rooms/${dmRoom}/messages`)).json()) as
    { messages: { category: string; body: string; contextCard: string | null }[] };
  const health = msgs.messages.find((m) => m.category === "HEALTH")!;
  assert.equal(health.body, "(건강정보 — 열람 권한이 없어요)"); // 발송 시점 권한 ≠ 영구 열람
  // 재배정 → 복구
  await db.update(s.classAssignments).set({ status: "ACTIVE" })
    .where(eq(s.classAssignments.id, "ca_1"));
  msgs = (await (await get(coach, `/academies/a_wg/chat/rooms/${dmRoom}/messages`)).json()) as
    { messages: { category: string; body: string; contextCard: string | null }[] };
  assert.notEqual(msgs.messages.find((m) => m.category === "HEALTH")!.body, "(건강정보 — 열람 권한이 없어요)");
});

test("14차 C P1-2: 보호자 canPay 회수 → BILLING 본문·카드 가림(금액 = 개인정보)", async () => {
  await db.update(s.guardianParticipantLinks).set({ canPay: false })
    .where(eq(s.guardianParticipantLinks.id, "gl_mom"));
  const msgs = (await (await get(mom, `/academies/a_wg/chat/rooms/${momRoom}/messages`)).json()) as
    { messages: { category: string; body: string; contextCard: string | null }[] };
  const billing = msgs.messages.find((m) => m.category === "BILLING")!;
  assert.equal(billing.body, "(청구 정보 — 열람 권한이 없어요)");
  assert.equal(billing.contextCard, null); // 서버 카드(금액)도 가림
  // 원복(다른 테스트 영향 방지)
  await db.update(s.guardianParticipantLinks).set({ canPay: true })
    .where(eq(s.guardianParticipantLinks.id, "gl_mom"));
});
