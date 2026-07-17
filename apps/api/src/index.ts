/* 서버 엔트리 — 로컬/프로덕션 기동용. 테스트는 app.request() 로 대체. */
import { serve } from "@hono/node-server";
import { createDb } from "@pacefolio/db";
import { createApp } from "./app";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL 이 필요합니다 (PostgreSQL 16).");
  process.exit(1);
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
  db: createDb(databaseUrl),
  providers: {}, // 실제 provider 는 클라이언트 키 발급 후 등록(카카오 앵커부터)
  allowedOrigins: (process.env.PACEFOLIO_ALLOWED_ORIGINS ?? "http://localhost:3000").split(","),
  redirectUri: process.env.PACEFOLIO_OAUTH_REDIRECT_URI ?? "http://localhost:3001/auth/callback",
  secureCookies: process.env.NODE_ENV === "production",
  enableDevLogin: process.env.NODE_ENV !== "production",
  // R7 P0-1 fail-closed: 실 provider verifier 등록 전까지 웹훅은 전부 404.
  // mockpg 도 dev + 시크릿 설정 시에만 열림.
  enableMockPg: process.env.NODE_ENV !== "production",
  mockPgSecret: process.env.PACEFOLIO_MOCKPG_SECRET,
  webhookVerifiers: {}, // 실 PG adapter 연동 시 provider 별 raw-body 서명 verifier 등록
});

const port = Number(process.env.PORT ?? 3001);
serve({ fetch: app.fetch, port }, () => {
  console.log(`PACEFOLIO API listening on :${port}`);
});
