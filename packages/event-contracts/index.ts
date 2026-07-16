/* PACEFOLIO 이벤트 계약 — Domain Event 외 3종(A-2 분리 원칙)
   Domain Event(상태변경 정본) = @pacefolio/domain events.ts — 여기 두지 않는다.
   Analytics(분석) / Attribution(귀속) / Audit(감사) 는 목적·보관·권한이 달라 분리. */
export * from "./analytics";
export * from "./attribution";
export * from "./audit";
export * from "./consent-purposes";
export * from "./pii-guard";
