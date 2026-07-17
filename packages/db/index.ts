/* =========================================================
   PACEFOLIO DB — 클라이언트 팩토리 (Phase 0 기반 결정)
   ---------------------------------------------------------
   - prod/dev 서버: PostgreSQL 16 + node-postgres(pg)
   - 테스트: PGlite(WASM Postgres, Docker 불필요) — 같은 migration 적용
   - 모든 시각 timestamptz(UTC) · 금액 int4 KRW 정수(float 금지)
   - 트랜잭션: db.transaction() 사용 — 서비스 계층은 반드시 tx 경유
   ⚠️ 동시성(row lock 경쟁) 테스트는 PGlite(단일 커넥션)로 불가 —
      CI postgres service 에서 검증(R5 Phase 4 완료 기준).
   ========================================================= */
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export * as schema from "./schema";

/** 서버용 클라이언트 (DATABASE_URL 필수). */
export function createDb(databaseUrl: string) {
  const pool = new Pool({ connectionString: databaseUrl });
  return drizzlePg(pool, { schema });
}

export type Db = ReturnType<typeof createDb>;
