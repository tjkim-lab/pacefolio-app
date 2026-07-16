/* =========================================================
   PACEFOLIO 이벤트 계약 — 유입 귀속(Attribution) (마케팅 리뷰 A-8)
   UTM 은 외부 입력 — 그대로 저장·표시 금지. allowlist + 길이/문자 제한 + PII 차단.
   ========================================================= */

export interface AttributionTouch {
  id: string;
  anonymousId: string;
  userId?: string;              // 로그인 뒤 "서버에서" 결합 — 클라 전송 금지
  academyId?: string;
  occurredAt: string;
  landingUrlNormalized: string; // 전체 URL 아닌 정규화된 path
  referrerHost?: string;
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  term?: string;
  engine?: string;
  clickIdType?: string;
  clickIdEncrypted?: string;    // 광고 click ID 는 별도 보호·보관기간
  firstTouch: boolean;
  sessionId?: string;
  consentState: string;         // MARKETING_ATTRIBUTION 동의 상태
}

/** 귀속 창(A-8) — METRIC-REGISTRY 와 함께 버전 관리. */
export const ATTRIBUTION_WINDOW_DAYS = 30;

/* --- UTM 보안 규칙 (A-8) --- */
export const UTM_ALLOWED_KEYS = ["source", "medium", "campaign", "content", "term"] as const;
export const UTM_MAX_LENGTH = 100;

const PII_VALUE_PATTERNS = [
  /01[016789][-\s]?\d{3,4}[-\s]?\d{4}/, // 휴대전화
  /[\w.+-]+@[\w-]+\.[\w.]+/,            // 이메일
];

export interface UtmSanitizeResult {
  accepted: Record<string, string>;
  rejected: Array<{ key: string; reason: string }>;
}

/** UTM 정제: allowlist 외 키 폐기, CR/LF 제거, 길이 제한, PII 값 거부.
   저장은 정제본만 — Admin 표시 시에도 HTML escape 는 표시 계층 의무. */
export function sanitizeUtm(raw: Record<string, string>): UtmSanitizeResult {
  const accepted: Record<string, string> = {};
  const rejected: Array<{ key: string; reason: string }> = [];
  for (const [rawKey, rawVal] of Object.entries(raw)) {
    const key = rawKey.replace(/^utm_/, "").toLowerCase();
    if (!(UTM_ALLOWED_KEYS as readonly string[]).includes(key)) {
      rejected.push({ key: rawKey, reason: "NOT_ALLOWLISTED" });
      continue;
    }
    const cleaned = rawVal.replace(/[\r\n]/g, "").trim();
    if (cleaned.length === 0 || cleaned.length > UTM_MAX_LENGTH) {
      rejected.push({ key: rawKey, reason: "LENGTH" });
      continue;
    }
    if (PII_VALUE_PATTERNS.some((p) => p.test(cleaned))) {
      rejected.push({ key: rawKey, reason: "PII_SUSPECTED" }); // 전화·이메일 등 UTM 반입 금지
      continue;
    }
    accepted[key] = cleaned;
  }
  return { accepted, rejected };
}
