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
  webhookSecret: process.env.PACEFOLIO_WEBHOOK_SECRET, // 실 PG 서명 검증으로 교체 예정
});

const port = Number(process.env.PORT ?? 3001);
serve({ fetch: app.fetch, port }, () => {
  console.log(`PACEFOLIO API listening on :${port}`);
});
