/* 세션 서비스 — 발급·검증·회수 (docs/10 · docs/11 §A · R5 Phase 2)
   - 토큰 원문은 쿠키로만 — DB 에는 sha256 hex (schema 에 원문 컬럼 없음)
   - 검증은 매 요청 서버가 수행: 존재 → 미회수 → 미만료 (fail-closed)
   - 만료 비교 = @pacefolio/domain time(epoch·fail-closed) 재사용 */
import { eq, and, isNull } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { schema as s } from "@pacefolio/db";
import { credentialExpired } from "@pacefolio/domain";
import { sha256Hex, randomToken, newId } from "../crypto";

// node-postgres·PGlite 양쪽 drizzle 인스턴스 호환
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = PgDatabase<any, any, any>;

export const SESSION_TTL_DAYS = 7;

export interface IssuedSession {
  token: string;      // 쿠키로만 전달 — 응답 body·로그 금지
  csrfToken: string;  // double-submit 쿠키(pf_csrf, 비 HttpOnly)
  sessionId: string;
  expiresAt: string;
}

export async function issueSession(
  db: Db,
  userId: string,
  nowISO: string,
  rotatedFromId?: string,
): Promise<IssuedSession> {
  const token = randomToken(32);
  const sessionId = newId("ses");
  const expiresAt = new Date(Date.parse(nowISO) + SESSION_TTL_DAYS * 86_400_000).toISOString();
  await db.insert(s.sessions).values({
    id: sessionId,
    userId,
    tokenHash: sha256Hex(token),
    issuedAt: nowISO,
    expiresAt,
    rotatedFromId,
  });
  return { token, csrfToken: randomToken(16), sessionId, expiresAt };
}

export interface ResolvedSession {
  sessionId: string;
  userId: string;
  user: { id: string; name: string; phone: string; email: string | null };
  memberships: { academyId: string; roles: string[]; status: string }[];
}

/** 세션 검증 체인(R5 Phase 3): 존재 → 미회수 → 미만료 → 사용자 로드.
   실패는 전부 null(fail-closed) — 이유를 클라이언트에 구분 노출하지 않음. */
export async function resolveSession(
  db: Db,
  token: string | undefined,
  nowISO: string,
): Promise<ResolvedSession | null> {
  if (!token) return null;
  const rows = await db.select().from(s.sessions).where(eq(s.sessions.tokenHash, sha256Hex(token)));
  const ses = rows[0];
  if (!ses) return null;
  if (ses.revokedAt) return null;
  if (credentialExpired(ses.expiresAt, nowISO)) return null;

  const users = await db.select().from(s.users).where(eq(s.users.id, ses.userId));
  const user = users[0];
  if (!user) return null; // 세션은 있는데 사용자 삭제됨 — 거부

  const memberships = await db
    .select()
    .from(s.academyMemberships)
    .where(eq(s.academyMemberships.userId, ses.userId));

  return {
    sessionId: ses.id,
    userId: ses.userId,
    user: { id: user.id, name: user.name, phone: user.phone, email: user.email },
    memberships: memberships.map((m) => ({ academyId: m.academyId, roles: m.roles, status: m.status })),
  };
}

export async function revokeSession(db: Db, sessionId: string, nowISO: string): Promise<void> {
  await db.update(s.sessions).set({ revokedAt: nowISO }).where(eq(s.sessions.id, sessionId));
}

/** 전 기기 로그아웃 — 멤버십 종료·탈퇴급 이벤트에도 사용(docs/10). */
export async function revokeAllSessions(db: Db, userId: string, nowISO: string): Promise<void> {
  await db
    .update(s.sessions)
    .set({ revokedAt: nowISO })
    .where(and(eq(s.sessions.userId, userId), isNull(s.sessions.revokedAt)));
}
