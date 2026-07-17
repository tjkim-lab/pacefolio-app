/* 개발용 사용자 — 카카오 키 발급 전 시연·테스트 전용.
   app.ts 의 게이트(enableDevLogin && !production) 뒤에서만 호출됨.
   이름이 seed 사용자와 일치하면 그 사용자로 로그인(원더짐 데모 시나리오). */
import { eq } from "drizzle-orm";
import { schema as s } from "@pacefolio/db";
import { newId } from "../crypto";
import type { Db } from "../sessions/service";

export async function findOrCreateDevUser(db: Db, name: string, nowISO: string): Promise<string> {
  const found = await db.select().from(s.users).where(eq(s.users.name, name));
  if (found[0]) return found[0].id;
  const userId = newId("u_dev");
  await db.insert(s.users).values({
    id: userId, name, phone: "", createdAt: nowISO, updatedAt: nowISO,
  });
  return userId;
}
