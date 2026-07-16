/* =========================================================
   PACEFOLIO 이벤트 계약 — Product Analytics (마케팅 리뷰 A-2·A-3·A-4)
   ---------------------------------------------------------
   ⚠️ Domain Event(@pacefolio/domain events.ts = 서비스 상태변경 정본)와 절대 합치지 않는다.
   이 이벤트는 정본이 아니다 — 화면·기능 사용 분석용.
   규칙(A-3): 이름에 동적 값 금지 · 낮은 cardinality · occurredAt(발생)≠observedAt(수집)
   · 클라이언트 이벤트 불신(결제·가입 확정은 서버 이벤트 기준) · PII 원문 금지(pii-guard).
   ========================================================= */

export interface ProductAnalyticsEvent {
  eventId: string;
  eventName: string;            // snake_case, 동적 값 금지 — isValidEventName
  eventVersion: number;
  occurredAt: string;           // 클라/서버 발생시각(ISO)
  observedAt: string;           // 수집 서버 수신시각(ISO) — 분리 필수
  source: "web" | "admin" | "generated-site";
  environment: "dev" | "staging" | "prod";
  appVersion?: string;
  academyId?: string;           // tenant 집계 필요 시
  actorPseudonymousId?: string; // 원본 userId 직접 전송 지양 — 가명 ID
  anonymousSessionId?: string;
  subjectType?: string;
  subjectId?: string;           // 허용된 비식별/내부 ID 만
  screenName?: string;
  featureName?: string;
  action?: string;
  result?: string;
  properties?: Record<string, unknown>; // PII 금지 — findPiiViolations 로 검증
  attributionContextId?: string;
  consentState: string;         // 수집 시점 동의 상태(consent-purposes)
  schemaVersion: number;
  traceId?: string;
}

/** 이벤트 이름 규칙: snake_case, 소문자, 동적 값(ID·이름) 금지, 64자 이내. */
export function isValidEventName(name: string): boolean {
  if (name.length === 0 || name.length > 64) return false;
  if (!/^[a-z][a-z0-9]*(_[a-z0-9]+)*$/.test(name)) return false;
  // UUID·긴 숫자 세그먼트 = 동적 값 삽입 신호
  if (/[0-9]{4,}/.test(name)) return false;
  return true;
}

/** 신뢰 수준(A-4): 전환·확정 지표는 server/pg 이벤트만 집계에 사용. */
export type TrustLevel = "client" | "server" | "pg";
export const EVENT_TRUST: Record<string, TrustLevel> = {
  landing_visited: "client",
  demo_started: "client",
  waitlist_form_clicked: "client",
  waitlist_submitted: "server",
  signup_completed: "server",
  academy_registered: "server",
  autopay_registered: "pg",
  payment_captured: "pg",          // 정본은 domain PAYMENT_CAPTURED — 분석 집계는 파생 복사본
  growth_report_viewed: "client",
  collection_dashboard_action: "server", // 수납 가시성 = 유효 행동(서버 기록) 기준
  portfolio_share_requested: "client",   // OS 공유창 열림 ≠ 공유 완료 (A-4)
  portfolio_share_link_created: "server",
  portfolio_share_link_opened: "server",
  portfolio_share_conversion_completed: "server",
};

/** 공유 루프 4단계 — share_clicked 를 "공유 완료"로 집계 금지(A-4). */
export const SHARE_EVENTS = [
  "portfolio_share_requested",
  "portfolio_share_link_created",
  "portfolio_share_link_opened",
  "portfolio_share_conversion_completed",
] as const;
