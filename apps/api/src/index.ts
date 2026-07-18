/* 서버 엔트리 — 로컬/프로덕션 기동용. 테스트는 app.request() 로 대체. */
import { serve } from "@hono/node-server";
import { createDb, createPgliteDevDb, type Db } from "@pacefolio/db";
import { seedWondergym } from "@pacefolio/db/seed";
import { createApp } from "./app";

const databaseUrl = process.env.DATABASE_URL;
const isProd = process.env.NODE_ENV === "production";
if (!databaseUrl && isProd) {
  console.error("DATABASE_URL 이 필요합니다 (PostgreSQL 16).");
  process.exit(1);
}

/* Gate 2 dev 폴백: DATABASE_URL 없으면 PGlite(in-memory) + 자동 migrate/seed.
   비영속 — 재시작 시 초기화. 실 PostgreSQL 검증은 DATABASE_URL/CI 로. */
let db: Db;
if (databaseUrl) {
  db = createDb(databaseUrl);
} else {
  console.warn("[dev] DATABASE_URL 없음 — PGlite in-memory DB 로 기동 (비영속·단일 커넥션·dev 전용)");
  db = await createPgliteDevDb();
  await seedWondergym(db, new Date().toISOString());
  console.warn("[dev] seed 완료 — 박서연(보호자)·김도윤(원장)·원더짐·ISSUED 청구 2건");
}

/* R8 C8-04: 조건부 boot validation — "조용한 장애" 방지.
   실 provider 를 활성화(ENABLED_PG_PROVIDERS)했는데 verifier 가 없으면
   웹훅이 전부 404 로 조용히 유실됨(결제는 PENDING 잔류) → 부팅 자체를 실패.
   활성 provider 미지정(개발·mock 단계)은 통과 — 과도한 차단 방지. */
const enabledProviders = (process.env.ENABLED_PG_PROVIDERS ?? "")
  .split(",").map((p) => p.trim()).filter(Boolean);
const registeredVerifiers: Record<string, unknown> = {}; // 실 adapter 등록 시 채움
if (process.env.NODE_ENV === "production") {
  const missing = enabledProviders.filter((p) => !registeredVerifiers[p]);
  if (missing.length > 0) {
    console.error(`[boot] 활성 PG provider 의 verifier 미등록: ${missing.join(", ")} — 웹훅이 조용히 유실됩니다. 부팅 중단.`);
    process.exit(1);
  }
}

const app = createApp({
  db,
  providers: {}, // 실제 provider 는 클라이언트 키 발급 후 등록(카카오 앵커부터)
  allowedOrigins: (process.env.PACEFOLIO_ALLOWED_ORIGINS ?? "http://localhost:3000").split(","),
  redirectUri: process.env.PACEFOLIO_OAUTH_REDIRECT_URI ?? "http://localhost:3001/auth/callback",
  secureCookies: process.env.NODE_ENV === "production",
  enableDevLogin: process.env.NODE_ENV !== "production",
  // R7 P0-1 fail-closed: 실 provider verifier 등록 전까지 웹훅은 전부 404.
  // mockpg 도 dev + 시크릿 설정 시에만 열림.
  enableMockPg: process.env.NODE_ENV !== "production",
  // dev 는 기본 시크릿으로 mockpg 개방(Gate 2 시뮬) — 프로덕션은 env 없으면 404(fail-closed 유지)
  mockPgSecret: process.env.PACEFOLIO_MOCKPG_SECRET ?? (isProd ? undefined : "dev-mockpg-secret"),
  webhookVerifiers: {}, // 실 PG adapter 연동 시 provider 별 raw-body 서명 verifier 등록
  // #19: 스토리지 어댑터 — 사업자 결정 전엔 dev 인메모리만(프로덕션 미주입 = 사진 라우트 501)
  storage: isProd ? undefined : (await import("./storage/adapter")).createDevMemoryStorage(),
});

/* 파일럿 P0: outbox 디스패처 루프 — 인앱 알림 소비(at-least-once·SKIP LOCKED).
   프로덕션은 전용 워커/스케줄러로 분리 예정 — 단일 인스턴스 dev/파일럿은 이 루프로 충분. */
const { dispatchPendingOutbox } = await import("./notifications/service");
setInterval(() => {
  dispatchPendingOutbox(db, new Date().toISOString()).catch((e) =>
    console.warn(`[outbox] dispatch 실패(다음 주기 재시도): ${e instanceof Error ? e.message : e}`));
}, 15_000);

const port = Number(process.env.PORT ?? 3001);
serve({ fetch: app.fetch, port }, () => {
  console.log(`PACEFOLIO API listening on :${port}`);
});
