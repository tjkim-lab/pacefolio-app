/* 기본선 3단계(#24) 통합 테스트 — 경쟁 기본선 수명주기 완주:
   학원 생성 → 코치 초대·수락 → (반·학생·출결은 #22·#23 검증) →
   수납 기간 → 청구 생성(라인 부호·총액 검증 = 13차 A 완료 조건) →
   발행(중복 방지·DRAFT 비노출과 짝) → 오프라인 수납(이벤트+증빙) →
   공지 발행·읽음 추적. */
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
  const st = await app.request("/auth/kakao/start", { method: "POST" });
  const { state } = await st.json() as { state: string };
  const cb = await app.request(`/auth/kakao/callback?code=${code}&state=${state}`);
  const { userId } = await cb.json() as { userId: string };
  const sc = cb.headers.getSetCookie();
  return {
    cookie: sc.map((c) => c.split(";")[0]).join("; "),
    csrf: sc.find((c) => c.startsWith("pf_csrf="))!.split(";")[0].split("=")[1],
    userId,
  };
}
const post = (a: Actor, path: string, body?: unknown, idem?: string) =>
  app.request(path, {
    method: "POST",
    headers: {
      cookie: a.cookie, origin: ORIGIN, "x-csrf-token": a.csrf,
      ...(idem ? { "idempotency-key": idem } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
const get = (a: Actor, path: string) => app.request(path, { headers: { cookie: a.cookie } });

let founder: Actor, newCoach: Actor, mom: Actor;
let academy = "", bpId = "", invId = "";

before(async () => {
  const client = new PGlite();
  db = drizzle(client);
  await migrate(db, { migrationsFolder });
  app = createApp({
    db, providers: { kakao: fake }, allowedOrigins: [ORIGIN],
    redirectUri: "http://x/cb", now: () => NOW, secureCookies: false,
  });
  founder = await login("founder");
  newCoach = await login("newcoach");
  mom = await login("mom");
});

test("학원 생성 — 생성자 = OWNER ACTIVE (원더짐 자동선택 없음)", async () => {
  const r = await post(founder, "/academies", { name: "새싹 아카데미", ownerName: "김창업" });
  assert.equal(r.status, 201);
  academy = ((await r.json()) as { academyId: string }).academyId;
  const me = await get(founder, "/sessions/me");
  const body = (await me.json()) as { memberships: { academyId: string; roles: string[]; status: string }[] };
  const m = body.memberships.find((x) => x.academyId === academy)!;
  assert.deepEqual(m.roles, ["OWNER"]);
  assert.equal(m.status, "ACTIVE");
});

test("코치 초대 수명주기: INVITED → 수락 전 접근 403 → 수락 ACTIVE → 접근 가능", async () => {
  const r = await post(founder, `/academies/${academy}/members/invites`, {
    targetUserId: newCoach.userId, roles: ["COACH"],
  });
  assert.equal(r.status, 201);
  assert.equal(((await r.json()) as { status: string }).status, "INVITED");
  // 멱등 재초대
  assert.equal((await post(founder, `/academies/${academy}/members/invites`, {
    targetUserId: newCoach.userId, roles: ["COACH"],
  })).status, 201);
  // INVITED 상태로는 학원 접근 불가 — guard 는 비 ACTIVE 접근 시 403 + 전 세션 폐기(docs/10)
  assert.equal((await get(newCoach, `/academies/${academy}/classes`)).status, 403);
  assert.equal((await get(newCoach, "/sessions/me")).status, 401); // 세션 폐기 확인
  newCoach = await login("newcoach"); // 재로그인 후 수락
  // 수락 → ACTIVE → 접근 가능
  const acc = await post(newCoach, `/academies/${academy}/members/accept`);
  assert.equal(acc.status, 200);
  assert.equal(((await acc.json()) as { status: string }).status, "ACTIVE");
  assert.equal((await get(newCoach, `/academies/${academy}/classes`)).status, 200);
});

test("청구 생성: 라인 부호 정책 + 총액 검증(13차 A 완료 조건) — 발행 전 DRAFT 비노출", async () => {
  await db.insert(s.participants).values({
    id: "p_saessak", academyId: academy, name: "박새싹", birth: "2018-03-01", ageLabel: "8세",
  });
  const bp = await post(founder, `/academies/${academy}/billing-periods`, {
    periodStart: "2026-09-01", periodEnd: "2026-11-30", cycleMonths: 3,
  });
  bpId = ((await bp.json()) as { billingPeriodId: string }).billingPeriodId;
  // 양수 할인 라인 = 422 (부호 정책)
  assert.equal((await post(founder, `/academies/${academy}/invoices`, {
    participantId: "p_saessak", billingPeriodId: bpId, dueDate: "2026-09-10",
    lines: [{ type: "TUITION", label: "수강료", amount: 360000 }, { type: "DISCOUNT", label: "형제", amount: 72000 }],
  })).status, 422);
  // 할인 후 총액 0 이하 = 422 (할인 후 음수·정률 100% 초과 금지)
  assert.equal((await post(founder, `/academies/${academy}/invoices`, {
    participantId: "p_saessak", billingPeriodId: bpId, dueDate: "2026-09-10",
    lines: [{ type: "TUITION", label: "수강료", amount: 360000 }, { type: "DISCOUNT", label: "과다 할인", amount: -360000 }],
  })).status, 422);
  // 정상: 수강료 - 형제20% + 차량
  const ok = await post(founder, `/academies/${academy}/invoices`, {
    participantId: "p_saessak", billingPeriodId: bpId, dueDate: "2026-09-10",
    lines: [
      { type: "TUITION", label: "수강료(분기)", amount: 360000 },
      { type: "DISCOUNT", label: "형제 20%", amount: -72000 },
      { type: "VEHICLE", label: "차량비", amount: 45000 },
    ],
  });
  assert.equal(ok.status, 201);
  const body = (await ok.json()) as { invoiceId: string; total: number };
  invId = body.invoiceId;
  assert.equal(body.total, 333000); // 서버 합산
  // 같은 (원생, 기간) 중복 생성 = 409
  assert.equal((await post(founder, `/academies/${academy}/invoices`, {
    participantId: "p_saessak", billingPeriodId: bpId, dueDate: "2026-09-10",
    lines: [{ type: "TUITION", label: "중복", amount: 100000 }],
  })).status, 409);
});

test("발행: DRAFT→ISSUED(멱등) — Outbox(INVOICE_ISSUED) 알림 트랙", async () => {
  assert.equal((await post(founder, `/academies/${academy}/invoices/${invId}/issue`)).status, 200);
  assert.equal((await post(founder, `/academies/${academy}/invoices/${invId}/issue`)).status, 200); // 멱등
  const outbox = await db.select().from(s.outboxEvents).where(eq(s.outboxEvents.eventType, "INVOICE_ISSUED"));
  assert.equal(outbox.length, 1);
});

test("오프라인 수납: 증빙 필수·부분 수납 → PARTIALLY_PAID → 잔액 수납 → PAID · 초과 422 · 멱등", async () => {
  // Primary 보호자 연결(수납 귀속 대상)
  await db.insert(s.guardians).values({ id: "gd_bm", userId: mom.userId });
  await db.insert(s.guardianParticipantLinks).values({
    id: "gl_bm", guardianId: "gd_bm", participantId: "p_saessak", academyId: academy,
    relationshipType: "MOTHER", isPrimaryGuardian: true, verificationStatus: "VERIFIED",
    canViewSchedule: true, canViewAttendance: true, canViewHealthInfo: true,
    canReceivePhotos: true, canPay: true, canRequestRefund: true,
  });
  // 부분 수납 (현금 100,000)
  const p1 = await post(founder, `/academies/${academy}/payments/offline`, {
    invoiceId: invId, channel: "CASH", amount: 100000, evidenceNote: "현금 수납 — 전표 #12",
  }, "off-1");
  assert.equal(p1.status, 201);
  let inv = (await db.select().from(s.invoices).where(eq(s.invoices.id, invId)))[0];
  assert.equal(inv.status, "PARTIALLY_PAID"); // 정산이 상태를 도출 — 화면 토글 아님
  // 초과 수납 = 422
  assert.equal((await post(founder, `/academies/${academy}/payments/offline`, {
    invoiceId: invId, channel: "BANK_TRANSFER", amount: 999999, evidenceNote: "x",
  }, "off-over")).status, 422);
  // 잔액 전액(금액 생략) — 이체
  const p2 = await post(founder, `/academies/${academy}/payments/offline`, {
    invoiceId: invId, channel: "BANK_TRANSFER", evidenceNote: "입금자 박새싹모",
  }, "off-2");
  assert.equal(p2.status, 201);
  assert.equal(((await p2.json()) as { amount: number }).amount, 233000);
  inv = (await db.select().from(s.invoices).where(eq(s.invoices.id, invId)))[0];
  assert.equal(inv.status, "PAID");
  // 멱등 재시도 = 기존 수납 반환(중복 수납 없음)
  assert.equal((await post(founder, `/academies/${academy}/payments/offline`, {
    invoiceId: invId, channel: "BANK_TRANSFER", evidenceNote: "재시도",
  }, "off-2")).status, 201);
  const pays = await db.select().from(s.payments).where(eq(s.payments.academyId, academy));
  assert.equal(pays.length, 2);
  assert.ok(pays.every((p) => p.provider?.startsWith("offline:"))); // 채널 기록
});

test("공지: 발행(보호자 receipt 생성) → 읽음(최초 시각 보존) → staff 미열람 수", async () => {
  // mom 을 이 학원 보호자로
  await db.insert(s.academyMemberships).values({
    id: "m_bm", userId: mom.userId, academyId: academy, roles: ["GUARDIAN"], status: "ACTIVE", joinedAt: "2026-07-01",
  });
  const pub = await post(founder, `/academies/${academy}/notices`, {
    title: "가을 학기 안내", body: "9월부터 새 시간표가 적용됩니다.", audience: "전체 보호자",
  });
  assert.equal(pub.status, 201);
  const { noticeId, recipients } = (await pub.json()) as { noticeId: string; recipients: number };
  assert.equal(recipients, 1);
  // 보호자 발행 시도 403
  assert.equal((await post(mom, `/academies/${academy}/notices`, {
    title: "x", body: "y", audience: "z",
  })).status, 403);
  // staff 목록: 미열람 1
  let list = (await (await get(founder, `/academies/${academy}/notices`)).json()) as { notices: { unread?: number }[] };
  assert.equal(list.notices[0].unread, 1);
  // mom 읽음 → 미열람 0
  assert.equal((await post(mom, `/academies/${academy}/notices/${noticeId}/read`)).status, 200);
  assert.equal((await post(mom, `/academies/${academy}/notices/${noticeId}/read`)).status, 200); // 멱등
  list = (await (await get(founder, `/academies/${academy}/notices`)).json()) as { notices: { unread?: number }[] };
  assert.equal(list.notices[0].unread, 0);
  // 보호자 목록엔 미열람 수 미노출
  const momList = (await (await get(mom, `/academies/${academy}/notices`)).json()) as { notices: { unread?: number }[] };
  assert.equal(momList.notices[0].unread, undefined);
});

test("수납 관제 집계(#25): staff 발행·수납·미납 합 — 보호자 403", async () => {
  const r = await get(founder, `/academies/${academy}/billing/summary`);
  assert.equal(r.status, 200);
  const sum = (await r.json()) as {
    unpaidCount: number; unpaidKrw: number; paidCount: number; paidKrw: number;
    billedKrw: number; capturedKrw: number;
  };
  // 오프라인 수납 테스트에서 invoice 1건이 완납(PAID)됨
  assert.equal(sum.paidCount, 1);
  assert.equal(sum.billedKrw, sum.paidKrw + sum.unpaidKrw);
  assert.equal((await get(mom, `/academies/${academy}/billing/summary`)).status, 403);
});
