/* 서버 엔트리 — 로컬/프로덕션 기동용. 테스트는 app.request() 로 대체. */
import { serve } from "@hono/node-server";
import { createDb } from "@pacefolio/db";
import { createApp } from "./app";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL 이 필요합니다 (PostgreSQL 16).");
  process.exit(1);
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
