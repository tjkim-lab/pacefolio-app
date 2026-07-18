/* 프로그램 스튜디오 PS1 통합 테스트 (docs/20·21·22)
   실 HTTP × PGlite: 최종 1차 완료 기준(§19) — 빈 학원에서 코드 수정 없이
   프로그램→단계→성장영역→활동→12주 커리큘럼→게시. + 불변식·보안 경계.
   ⚠️ 테스트 데이터는 중립 이름만(§16) — 실제 원더짐 콘텐츠 하드코딩 금지. */
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
const NOW = "2026-07-19T10:00:00.000Z";
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
  const setCookies = cb.headers.getSetCookie();
  return {
    cookie: setCookies.map((c) => c.split(";")[0]).join("; "),
    csrf: setCookies.find((c) => c.startsWith("pf_csrf="))!.split(";")[0].split("=")[1],
    userId,
  };
}
const send = (a: Actor, method: string, path: string, body?: unknown) =>
  app.request(path, {
    method,
    headers: {
      cookie: a.cookie, origin: ORIGIN, "x-csrf-token": a.csrf,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
const post = (a: Actor, p: string, b?: unknown) => send(a, "POST", p, b);
const patch = (a: Actor, p: string, b?: unknown) => send(a, "PATCH", p, b);
const put = (a: Actor, p: string, b?: unknown) => send(a, "PUT", p, b);
const get = (a: Actor, p: string) => app.request(p, { headers: { cookie: a.cookie } });

let owner: Actor, coach: Actor, otherOwner: Actor;

before(async () => {
  const client = new PGlite();
  db = drizzle(client);
  await migrate(db, { migrationsFolder });
  app = createApp({
    db, providers: { kakao: fake }, allowedOrigins: [ORIGIN],
    redirectUri: "http://x/cb", now: () => NOW, secureCookies: false,
  });
  await db.insert(s.academies).values([
    { id: "a_test", organizationId: "o", name: "샘플학원", themeColor: "#12B5A5", themeInk: "#087F73", logoEmoji: "🏫", ownerName: "원장A", billingCycleDefault: 3 },
    { id: "a_other", organizationId: "o2", name: "타학원", themeColor: "#000", themeInk: "#000", logoEmoji: "🏫", ownerName: "원장B", billingCycleDefault: 3 },
  ]);
  owner = await login("owner");
  coach = await login("coach");
  otherOwner = await login("other-owner");
  await db.insert(s.academyMemberships).values([
    { id: "m_o", userId: owner.userId, academyId: "a_test", roles: ["OWNER"], status: "ACTIVE", joinedAt: "2024-03-01" },
    { id: "m_c", userId: coach.userId, academyId: "a_test", roles: ["COACH"], status: "ACTIVE", joinedAt: "2024-08-01" },
    { id: "m_x", userId: otherOwner.userId, academyId: "a_other", roles: ["OWNER"], status: "ACTIVE", joinedAt: "2024-01-01" },
  ]);
});

/* §19 시나리오 상태 — 테스트 간 공유 */
let versionId = "";
let programId = "";
const domainIds: string[] = [];
const activityIds: string[] = [];
const sessionIds: string[] = [];

test("프로그램 생성(EXPERIENCE) → 201 + 첫 DRAFT 버전 자동 + 감사", async () => {
  const r = await post(owner, "/academies/a_test/programs", {
    name: "샘플 프로그램", description: "구조 검증용 중립 데이터",
    targetAgeLabel: "6~7세", modes: ["EXPERIENCE"],
  });
  assert.equal(r.status, 201);
  const body = await r.json() as { programId: string; versionId: string };
  programId = body.programId; versionId = body.versionId;
  assert.ok(programId.startsWith("prog_"));
  assert.ok(versionId.startsWith("pv_"));
  const audit = await db.select().from(s.auditLogs).where(eq(s.auditLogs.action, "program.created"));
  assert.equal(audit.length, 1);
});

test("권한·경계: 코치 생성 403 · 타학원 원장의 우리 학원 접근 403 · 잘못된 mode 422", async () => {
  const byCoach = await post(coach, "/academies/a_test/programs", { name: "코치 시도", modes: ["EXPERIENCE"] });
  assert.equal(byCoach.status, 403);
  const crossTenant = await post(otherOwner, "/academies/a_test/programs", { name: "침입", modes: ["EXPERIENCE"] });
  assert.equal(crossTenant.status, 403); // academyCtx: 소속 아님
  const badMode = await post(owner, "/academies/a_test/programs", { name: "x", modes: ["샘플 단계 2"] });
  assert.equal(badMode.status, 422); // 단계명은 mode 가 아니다 — 데이터
});

test("단계 생성 — 학원이 직접 만드는 데이터(enum 아님) · 같은 이름 중복 422", async () => {
  const r1 = await post(owner, `/academies/a_test/versions/${versionId}/levels`, {
    name: "샘플 단계 2", targetAgeLabel: "6~7세", sortOrder: 2,
  });
  assert.equal(r1.status, 201);
  const dup = await post(owner, `/academies/a_test/versions/${versionId}/levels`, {
    name: "샘플 단계 2",
  });
  assert.equal(dup.status, 422);
});

test("성장영역 — 부모(대분류)·자식 생성 + 목록", async () => {
  const parent = await post(owner, "/academies/a_test/growth-domains", {
    name: "테스트 대분류", category: "TEST",
  });
  assert.equal(parent.status, 201);
  const parentId = (await parent.json() as { domainId: string }).domainId;
  for (const name of ["테스트 균형 영역", "테스트 이동 영역", "테스트 조작 영역"]) {
    const r = await post(owner, "/academies/a_test/growth-domains", { name, parentId });
    assert.equal(r.status, 201);
    domainIds.push((await r.json() as { domainId: string }).domainId);
  }
  const list = await get(owner, "/academies/a_test/growth-domains");
  const { domains } = await list.json() as { domains: unknown[] };
  assert.equal(domains.length, 4);
});

test("활동 생성 + 성장영역 태그(PRIMARY 정확히 1 강제)", async () => {
  for (const name of ["샘플 활동 A", "샘플 활동 B", "샘플 활동 C"]) {
    const r = await post(owner, "/academies/a_test/activities", {
      name, description: "중립 테스트 활동", recommendedMinutes: 10,
    });
    assert.equal(r.status, 201);
    activityIds.push((await r.json() as { activityId: string }).activityId);
  }
  // PRIMARY 2개 → 422
  const bad = await put(owner, `/academies/a_test/activities/${activityIds[0]}/growth-tags`, {
    tags: [
      { growthDomainId: domainIds[0], role: "PRIMARY" },
      { growthDomainId: domainIds[1], role: "PRIMARY" },
    ],
  });
  assert.equal(bad.status, 422);
  const ok = await put(owner, `/academies/a_test/activities/${activityIds[0]}/growth-tags`, {
    tags: [
      { growthDomainId: domainIds[0], role: "PRIMARY" },
      { growthDomainId: domainIds[1], role: "SECONDARY" },
    ],
  });
  assert.equal(ok.status, 200);
});

test("커리큘럼 — 구조(1분기) + 12주 회차 + 회차당 활동 3개(제약 아님·기본값일 뿐)", async () => {
  const sec = await post(owner, `/academies/a_test/versions/${versionId}/sections`, {
    sectionType: "QUARTER", name: "1분기",
  });
  assert.equal(sec.status, 201);
  const sectionId = (await sec.json() as { sectionId: string }).sectionId;
  for (let w = 1; w <= 12; w++) {
    const r = await post(owner, `/academies/a_test/versions/${versionId}/sessions`, {
      sectionId, name: `1분기 ${w}주 차`, sequence: w,
    });
    assert.equal(r.status, 201);
    const cses = (await r.json() as { curriculumSessionId: string }).curriculumSessionId;
    sessionIds.push(cses);
    const setr = await put(owner, `/academies/a_test/curriculum-sessions/${cses}/activities`, {
      activities: activityIds.map((activityId) => ({ activityId })),
    });
    assert.equal(setr.status, 200);
  }
  const detail = await get(owner, `/academies/a_test/versions/${versionId}`);
  const d = await detail.json() as { sessions: { activities: unknown[] }[] };
  assert.equal(d.sessions.length, 12);
  assert.equal(d.sessions.every((x) => x.activities.length === 3), true);
});

test("게시 → outbox PROGRAM_VERSION_PUBLISHED + 멱등 재게시", async () => {
  const r = await post(owner, `/academies/a_test/versions/${versionId}/publish`);
  assert.equal(r.status, 200);
  const obx = await db.select().from(s.outboxEvents)
    .where(eq(s.outboxEvents.eventType, "PROGRAM_VERSION_PUBLISHED"));
  assert.equal(obx.length, 1);
  const again = await post(owner, `/academies/a_test/versions/${versionId}/publish`);
  assert.equal(again.status, 200); // 멱등 — 중복 outbox 없음
  const obx2 = await db.select().from(s.outboxEvents)
    .where(eq(s.outboxEvents.eventType, "PROGRAM_VERSION_PUBLISHED"));
  assert.equal(obx2.length, 1);
});

test("불변식: PUBLISHED 버전은 직접 수정 불가(레벨 추가·회차 활동 교체·회차 삭제 전부 422)", async () => {
  const lv = await post(owner, `/academies/a_test/versions/${versionId}/levels`, { name: "게시후 단계" });
  assert.equal(lv.status, 422);
  const setr = await put(owner, `/academies/a_test/curriculum-sessions/${sessionIds[0]}/activities`, {
    activities: [{ activityId: activityIds[0] }],
  });
  assert.equal(setr.status, 422);
  const del = await send(owner, "DELETE", `/academies/a_test/versions/${versionId}/sessions/${sessionIds[0]}`);
  assert.equal(del.status, 422);
});

test("개정 정책: 게시 커리큘럼이 참조하는 활동 수정 → 자동 새 개정판·과거 참조는 rev1 유지", async () => {
  const before1 = await db.select().from(s.activityRevisions)
    .where(eq(s.activityRevisions.activityId, activityIds[0]));
  assert.equal(before1.length, 1);
  const oldRevId = before1[0].id;
  const r = await patch(owner, `/academies/a_test/activities/${activityIds[0]}`, {
    name: "샘플 활동 A (개정)", coachingPoints: "새 지도 포인트",
  });
  assert.equal(r.status, 200);
  const body = await r.json() as { newRevision: boolean; revisionId: string };
  assert.equal(body.newRevision, true); // 게시 참조 → 새 개정판
  const revs = await db.select().from(s.activityRevisions)
    .where(eq(s.activityRevisions.activityId, activityIds[0]));
  assert.equal(revs.length, 2);
  // 과거(게시된) 커리큘럼은 여전히 rev1 을 참조 — 이름 변경이 과거를 못 바꾼다
  const refs = await db.select().from(s.curriculumSessionActivities)
    .where(eq(s.curriculumSessionActivities.activityRevisionId, oldRevId));
  assert.equal(refs.length, 12);
  // 미참조 활동(커리큘럼에 배치 안 됨) 수정 → 제자리(개정판 안 늘어남)
  const freshRes = await post(owner, "/academies/a_test/activities", { name: "샘플 활동 D(미배치)" });
  const freshId = (await freshRes.json() as { activityId: string }).activityId;
  const inPlace = await patch(owner, `/academies/a_test/activities/${freshId}`, {
    description: "제자리 수정",
  });
  const ip = await inPlace.json() as { newRevision: boolean };
  assert.equal(ip.newRevision, false);
});

test("복제 → 새 DRAFT + 커리큘럼 딥카피 + 편집 가능", async () => {
  const r = await post(owner, `/academies/a_test/programs/${programId}/versions`, {
    versionLabel: "v2", basedOnVersionId: versionId,
  });
  assert.equal(r.status, 201);
  const v2 = (await r.json() as { versionId: string }).versionId;
  const detail = await get(owner, `/academies/a_test/versions/${v2}`);
  const d = await detail.json() as { status: string; sessions: { curriculumSessionId: string; activities: unknown[] }[] };
  assert.equal(d.status, "DRAFT");
  assert.equal(d.sessions.length, 12); // 딥카피
  // 새 DRAFT 는 편집 가능
  const edit = await put(owner, `/academies/a_test/curriculum-sessions/${d.sessions[0].curriculumSessionId}/activities`, {
    activities: [{ activityId: activityIds[1] }],
  });
  assert.equal(edit.status, 200);
});

test("archive 활동 — 신규 배치 422 · 기존(게시) 참조는 그대로 유지", async () => {
  const arch = await post(owner, `/academies/a_test/activities/${activityIds[1]}/archive`);
  assert.equal(arch.status, 200);
  // 새 DRAFT 회차에 배치 시도 → 422
  const progs = await get(owner, "/academies/a_test/programs");
  const plist = await progs.json() as { programs: { versions: { versionId: string; status: string }[] }[] };
  const draft = plist.programs[0].versions.find((v) => v.status === "DRAFT")!;
  const detail = await get(owner, `/academies/a_test/versions/${draft.versionId}`);
  const d = await detail.json() as { sessions: { curriculumSessionId: string }[] };
  const r = await put(owner, `/academies/a_test/curriculum-sessions/${d.sessions[1].curriculumSessionId}/activities`, {
    activities: [{ activityId: activityIds[1] }],
  });
  assert.equal(r.status, 422);
  // 게시본의 기존 참조는 유지(과거 기록 보존)
  const act = (await db.select().from(s.activities).where(eq(s.activities.id, activityIds[1])))[0];
  const refs = await db.select().from(s.curriculumSessionActivities)
    .where(eq(s.curriculumSessionActivities.activityRevisionId, act.currentRevisionId!));
  assert.ok(refs.length >= 12);
});

test("교차 테넌트: 타학원 원장이 자기 학원 컨텍스트로 우리 리소스 접근 → 404/차단", async () => {
  // otherOwner 가 자기 학원(a_other) 경로로 우리 버전 ID 조회 — academyId 불일치 = NOT_FOUND
  const r = await get(otherOwner, `/academies/a_other/versions/${versionId}`);
  assert.equal(r.status, 404);
  const act = await patch(otherOwner, `/academies/a_other/activities/${activityIds[0]}`, { name: "탈취" });
  assert.equal(act.status, 404);
  const pub = await post(otherOwner, `/academies/a_other/versions/${versionId}/publish`);
  assert.equal(pub.status, 404);
});

test("§19 완결: 시스템 내부에 단계명이 고정값으로 존재하지 않는다", async () => {
  // 단계는 전부 데이터(rows) — enum·코드 상수가 아님을 데이터로 확인
  const levels = await db.select().from(s.programLevels);
  assert.ok(levels.every((lv) => lv.id.startsWith("plv_"))); // 행으로 존재
  // 다른 학원은 같은 시스템으로 전혀 다른 단계 이름을 만들 수 있다
  const p2 = await post(otherOwner, "/academies/a_other/programs", {
    name: "타학원 프로그램", modes: ["SKILL_MASTERY", "SEASONAL"],
  });
  assert.equal(p2.status, 201);
  const v2 = (await p2.json() as { versionId: string }).versionId;
  const lvl = await post(otherOwner, `/academies/a_other/versions/${v2}/levels`, {
    name: "완전히 다른 단계명",
  });
  assert.equal(lvl.status, 201);
});
