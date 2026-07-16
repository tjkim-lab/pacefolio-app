/* =========================================================
   분석 이벤트 PII 금지 가드 (마케팅 리뷰 A-3·A-21)
   사용자 이름·전화·생년·건강정보·결제금액 원문·토큰류를
   분석 payload 에 넣지 않는다 — CI 테스트로 강제.
   ========================================================= */

/** 분석 속성으로 금지되는 키(소문자 비교). */
export const FORBIDDEN_PROPERTY_KEYS = [
  "username", "name", "childname", "guardianname",
  "phone", "phonenumber", "tel",
  "email",
  "birth", "birthdate", "birthday",
  "healthinfo", "health",
  "paymentamount", "amount", "price",   // 금액 원문 금지 — 집계는 서버 지표로
  "cardnumber", "cardno",
  "accesstoken", "token", "sessionid", "cookie",
  "otp", "otpcode",
  "address",
] as const;

const PII_VALUE_PATTERNS: Array<[string, RegExp]> = [
  ["PHONE", /01[016789][-\s]?\d{3,4}[-\s]?\d{4}/],
  ["EMAIL", /[\w.+-]+@[\w-]+\.[\w.]+/],
  ["RRN", /\d{6}[-\s]?[1-4]\d{6}/], // 주민등록번호 패턴
];

export interface PiiViolation {
  key: string;
  reason: string; // FORBIDDEN_KEY | PHONE | EMAIL | RRN
}

/** 분석 이벤트 properties 의 PII 위반 목록(빈 배열 = 통과). */
export function findPiiViolations(props: Record<string, unknown>): PiiViolation[] {
  const out: PiiViolation[] = [];
  for (const [key, value] of Object.entries(props)) {
    const k = key.replace(/[_\-\s]/g, "").toLowerCase();
    if ((FORBIDDEN_PROPERTY_KEYS as readonly string[]).includes(k)) {
      out.push({ key, reason: "FORBIDDEN_KEY" });
      continue;
    }
    if (typeof value === "string") {
      for (const [reason, pattern] of PII_VALUE_PATTERNS) {
        if (pattern.test(value)) {
          out.push({ key, reason });
          break;
        }
      }
    }
  }
  return out;
}
