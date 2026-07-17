/* OAuth provider 어댑터 — 카카오(앵커)·네이버·구글·애플 (docs/11 §B)
   code 교환은 외부 I/O → DB 트랜잭션 밖에서 수행(R5 Phase 2).
   결과에서 verified 필드만 신뢰. 동일 이메일 자동 병합 금지. */

export type OAuthProviderName = "kakao" | "naver" | "google" | "apple";

export interface OAuthStartParams {
  state: string;
  codeChallenge: string; // PKCE S256
  nonce?: string;        // OIDC(구글·애플) 필수
  redirectUri: string;
}

export interface OAuthTokenResult {
  /** provider 의 고유 사용자 ID — ExternalIdentity(provider, subject) UNIQUE 축 */
  providerSubject: string;
  /** provider 가 verified 로 보증한 값만(미보증이면 undefined) */
  verifiedEmail?: string;
  verifiedPhone?: string;
  displayName?: string;
  /** OIDC ID 토큰의 nonce(구글·애플) — 발급 시 저장한 값과 대조 */
  nonce?: string;
}

export interface OAuthProvider {
  name: OAuthProviderName;
  /** OIDC 여부 — true 면 nonce 필수 */
  oidc: boolean;
  authorizeUrl(p: OAuthStartParams): string;
  /** authorization code 교환(1회) — 실패 시 throw */
  exchangeCode(code: string, codeVerifier: string, redirectUri: string): Promise<OAuthTokenResult>;
}

/* 실제 provider 어댑터는 클라이언트 키 발급 후 구현(카카오 앵커부터).
   지금은 등록 안 됨 → /auth/{provider}/start 가 501 을 반환. */
export type ProviderRegistry = Partial<Record<OAuthProviderName, OAuthProvider>>;
