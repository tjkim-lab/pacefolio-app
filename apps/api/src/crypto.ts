/* 암호 유틸 — 토큰·state·PKCE·ID 생성과 hash (docs/11 §A·§B)
   원문 저장 금지 계약: 세션 토큰·OAuth state 는 sha256 hex 만 DB 에. */
import { createHash, randomBytes } from "node:crypto";

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** URL-safe 랜덤 토큰(기본 32바이트) — 세션·state·code_verifier 용 */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** prefix 붙은 랜덤 ID — 도메인 Brand<string> 관례(p_xxx, ses_xxx) */
export function newId(prefix: string): string {
  return `${prefix}_${randomBytes(9).toString("base64url")}`;
}

/** PKCE S256: code_challenge = BASE64URL(SHA256(code_verifier)) */
export function pkceChallengeS256(codeVerifier: string): string {
  return createHash("sha256").update(codeVerifier).digest("base64url");
}
