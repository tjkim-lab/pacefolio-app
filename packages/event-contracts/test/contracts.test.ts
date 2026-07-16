/* 이벤트 계약 테스트 (마케팅 리뷰 A-3·A-4·A-8·A-9·A-21) */
import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidEventName, EVENT_TRUST, SHARE_EVENTS } from "../analytics";
import { sanitizeUtm, UTM_ALLOWED_KEYS } from "../attribution";
import { findPiiViolations } from "../pii-guard";
import { isTrackingAllowed, TRACKING_CONSENT_PURPOSE } from "../consent-purposes";

/* --- 이벤트 이름 규칙 (A-3) --- */
test("이벤트 이름: snake_case 허용, 동적 값·대문자·한글 거부", () => {
  assert.ok(isValidEventName("growth_report_viewed"));
  assert.ok(isValidEventName("portfolio_share_link_created"));
  assert.equal(isValidEventName("GrowthReportViewed"), false);           // 대문자
  assert.equal(isValidEventName("share_by_학원명"), false);              // 한글(동적 값)
  assert.equal(isValidEventName("visit_user_12345678"), false);          // 긴 숫자 = ID 삽입
  assert.equal(isValidEventName("a".repeat(65)), false);                 // 길이
});

/* --- 신뢰 수준 (A-4) --- */
test("전환·확정 지표는 server/pg, 화면 조회는 client", () => {
  assert.equal(EVENT_TRUST["payment_captured"], "pg");
  assert.equal(EVENT_TRUST["waitlist_submitted"], "server");
  assert.equal(EVENT_TRUST["landing_visited"], "client");
});

test("공유 루프 4단계 분리 — share 클릭을 완료로 집계 금지", () => {
  assert.equal(SHARE_EVENTS.length, 4);
  assert.equal(EVENT_TRUST["portfolio_share_requested"], "client");        // OS 공유창 열림일 뿐
  assert.equal(EVENT_TRUST["portfolio_share_conversion_completed"], "server");
});

/* --- PII 가드 (A-3·A-21) --- */
test("PII 가드: 금지 키(이름·전화·금액·토큰) 탐지", () => {
  const v = findPiiViolations({
    childName: "김도담", phone: "010-1234-5678",
    paymentAmount: 338000, accessToken: "xyz",
    screenName: "growth_report", // 허용
  });
  const keys = v.map((x) => x.key).sort();
  assert.deepEqual(keys, ["accessToken", "childName", "paymentAmount", "phone"].sort());
});

test("PII 가드: 값 패턴(전화·이메일·주민번호) 탐지", () => {
  assert.ok(findPiiViolations({ memo: "연락처 010-9999-8888 로 전화" }).some((x) => x.reason === "PHONE"));
  assert.ok(findPiiViolations({ note: "tj.kim@example.com 문의" }).some((x) => x.reason === "EMAIL"));
  assert.deepEqual(findPiiViolations({ feature: "billing", count: 3 }), []); // 정상 통과
});

/* --- UTM (A-8) --- */
test("UTM: allowlist 외 키 폐기, CRLF 제거, 길이 제한", () => {
  const r = sanitizeUtm({
    utm_source: "naver", utm_medium: "cpc",
    utm_evil: "x", utm_campaign: "spring\r\nrun",
    utm_term: "y".repeat(200),
  });
  assert.deepEqual(Object.keys(r.accepted).sort(), ["campaign", "medium", "source"]);
  assert.equal(r.accepted.campaign, "springrun"); // CRLF 제거
  assert.ok(r.rejected.some((x) => x.reason === "NOT_ALLOWLISTED"));
  assert.ok(r.rejected.some((x) => x.reason === "LENGTH"));
});

test("UTM: 전화·이메일 값 반입 거부(PII_SUSPECTED)", () => {
  const r = sanitizeUtm({ utm_term: "parent 010-1234-5678", utm_content: "a@b.com" });
  assert.deepEqual(r.accepted, {});
  assert.equal(r.rejected.filter((x) => x.reason === "PII_SUSPECTED").length, 2);
});

/* --- 동의 목적 분리 (A-9) --- */
test("동의 목적 5종 분리, ESSENTIAL 항상 허용, 광고귀속은 별도 opt-in", () => {
  assert.equal(TRACKING_CONSENT_PURPOSE.length, 5);
  const analyticsOnly = { policyVersion: "v1", grantedPurposes: ["ESSENTIAL", "PRODUCT_ANALYTICS"] as const, updatedAt: "2026-07-16" };
  assert.ok(isTrackingAllowed(analyticsOnly, "ESSENTIAL"));
  assert.ok(isTrackingAllowed(analyticsOnly, "PRODUCT_ANALYTICS"));
  assert.equal(isTrackingAllowed(analyticsOnly, "MARKETING_ATTRIBUTION"), false);
  assert.equal(isTrackingAllowed(analyticsOnly, "EXTERNAL_AD_PLATFORM"), false);
});
