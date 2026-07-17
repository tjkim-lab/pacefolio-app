/* OAuth 인증 서비스 (docs/11 §B · R5 Phase 2)
   - state: 서버 저장(hash)·10분 만료·원자적 일회성 소비(단일 UPDATE)
   - PKCE S256 · OIDC nonce · code 교환은 DB 트랜잭션 밖(외부 I/O)
   - 계정: ExternalIdentity(provider, subject) 로만 연결 —
     동일 이메일 자동 병합 금지(병합은 별도 인증 절차) */
import { and, eq, isNull, sql } from "drizzle-orm";
import { schema as s } from "@pacefolio/db";
import { credentialExpired } from "@pacefolio/domain";
import { sha256Hex, randomToken, newId, pkceChallengeS256 } from "../crypto";
import type { OAuthProvider } from "./provider";
import { issueSession, type Db, type IssuedSession } from "../sessions/service";

export const OAUTH_STATE_TTL_MS = 10 * 60_000; // 10분 (docs/11 §B)

export interface OAuthStartResult {
  authorizeUrl: string;
  state: string;
}

export async function startOAuth(
  db: Db,
  provider: OAuthProvider,
  redirectUri: string,
  nowISO: string,
): Promise<OAuthStartResult> {
  const state = randomToken(24);
  const codeVerifier = randomToken(32);
  const nonce = provider.oidc ? randomToken(16) : undefined;
  await db.insert(s.oauthAuthorizationRequests).values({
    id: newId("oar"),
    provider: provider.name,
    stateHash: sha256Hex(state),         // 원문 저장 금지
    codeVerifier,
    nonce,
    redirectUri,
    createdAt: nowISO,
    expiresAt: new Date(Date.parse(nowISO) + OAUTH_STATE_TTL_MS).toISOString(),
  });
  const authorizeUrl = provider.authorizeUrl({
    state, codeChallenge: pkceChallengeS256(codeVerifier), nonce, redirectUri,
  });
  return { authorizeUrl, state };
}

export type CallbackResult =
  | { ok: true; session: IssuedSession; userId: string; isNewUser: boolean }
  | { ok: false; error: string }; // 이유는 로그로만 — 클라엔 401 통일(로그인 CSRF 방어)

export async function handleOAuthCallback(
  db: Db,
  provider: OAuthProvider,
  input: { code: string; state: string },
  nowISO: string,
): Promise<CallbackResult> {
  // 1) state 원자적 일회성 소비 — 단일 UPDATE 라 동시 요청 중 정확히 1개만 성공
  const consumed = await db
    .update(s.oauthAuthorizationRequests)
    .set({ consumedAt: nowISO })
    .where(and(
      eq(s.oauthAuthorizationRequests.stateHash, sha256Hex(input.state)),
      eq(s.oauthAuthorizationRequests.provider, provider.name),
      isNull(s.oauthAuthorizationRequests.consumedAt),
    ))
    .returning();
  const req = consumed[0];
  if (!req) return { ok: false, error: "STATE_UNKNOWN_OR_REUSED" };
  if (credentialExpired(req.expiresAt, nowISO)) return { ok: false, error: "STATE_EXPIRED" }; // 소비됐어도 만료면 거부

  // 2) code 교환 — 외부 I/O, 트랜잭션 밖 (R5 Phase 2 트랜잭션 경계)
  let tokenResult;
  try {
    tokenResult = await provider.exchangeCode(input.code, req.codeVerifier, req.redirectUri);
  } catch {
    return { ok: false, error: "CODE_EXCHANGE_FAILED" };
  }

  // 3) OIDC nonce 대조 — oidc provider 는 필수
  if (provider.oidc && (!req.nonce || tokenResult.nonce !== req.nonce)) {
    return { ok: false, error: "NONCE_MISMATCH" };
  }

  // 4) 짧은 DB 트랜잭션: identity 조회/생성 → user 연결 → 세션 발급
  //    자동 병합 금지: email 로 기존 계정을 찾지 않는다 — (provider, subject) 만.
  const linked = await db.transaction(async (tx) => {
    const found = await tx
      .select()
      .from(s.externalIdentities)
      .where(and(
        eq(s.externalIdentities.provider, provider.name),
        eq(s.externalIdentities.providerSubject, tokenResult.providerSubject),
      ));
    if (found[0]) return { userId: found[0].userId, isNewUser: false };

    const userId = newId("u");
    await tx.insert(s.users).values({
      id: userId,
      name: tokenResult.displayName ?? "이름 미설정",
      phone: tokenResult.verifiedPhone ?? "",
      email: tokenResult.verifiedEmail,
      createdAt: nowISO, updatedAt: nowISO,
    });
    await tx.insert(s.externalIdentities).values({
      id: newId("xid"),
      userId,
      provider: provider.name,
      providerSubject: tokenResult.providerSubject,
      verifiedEmail: tokenResult.verifiedEmail,
      verifiedPhone: tokenResult.verifiedPhone,
      createdAt: nowISO,
    });
    return { userId, isNewUser: true };
  });

  const session = await issueSession(db, linked.userId, nowISO);
  return { ok: true, session, userId: linked.userId, isNewUser: linked.isNewUser };
}

/** 만료된 OAuth 요청 정리(운영 잡) — ix_oauth_expiry 사용 */
export async function purgeExpiredOAuthRequests(db: Db, nowISO: string): Promise<void> {
  await db.delete(s.oauthAuthorizationRequests)
    .where(sql`${s.oauthAuthorizationRequests.expiresAt} <= ${nowISO}`);
}
