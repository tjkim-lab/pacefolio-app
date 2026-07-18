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

/** Gate 2 dev 폴백 — DATABASE_URL 없이 PGlite(in-memory)로 기동.
    같은 migration 을 적용하므로 스키마 동일 · 비영속(재시작 시 초기화) ·
    단일 커넥션이라 동시성 검증은 불가(CI postgres 가 정본). 프로덕션 금지. */
export async function createPgliteDevDb(): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const { fileURLToPath } = await import("node:url");
  const { dirname, join } = await import("node:path");
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: join(dirname(fileURLToPath(import.meta.url)), "migrations") });
  return db as unknown as Db;
}
