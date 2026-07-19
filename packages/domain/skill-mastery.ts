/* 기술 클리어(AS) 도메인 불변식 — PS5 (docs/20 §2 · 지시서 §3.2·§6.5·§6.9)
   핵심: 반복 횟수만으로 자동 클리어하지 않는다 — 권한 있는 코치가 실제 수행
   기준을 확인하고 확정해야만 CLEARED. 아이마다 필요한 연습 횟수가 다르다. */

export const SKILL_PROGRESS_STATUSES = [
  "NOT_STARTED", "INTRODUCED", "ASSISTED", "PRACTICING",
  "INDEPENDENT", "READY_FOR_CLEARANCE", "CLEARED",
] as const;
export type SkillProgressStatus = (typeof SKILL_PROGRESS_STATUSES)[number];

/** 연습 기록으로 도달 가능한 관찰 상태 — CLEARED 는 연습으로 못 감(확정 전용) */
export const PRACTICE_OBSERVATIONS = [
  "INTRODUCED", "ASSISTED", "PRACTICING", "INDEPENDENT", "READY_FOR_CLEARANCE",
] as const;
export type PracticeObservation = (typeof PRACTICE_OBSERVATIONS)[number];

export function isPracticeObservation(v: string): v is PracticeObservation {
  return (PRACTICE_OBSERVATIONS as readonly string[]).includes(v);
}

/** 연습 후 진행 상태 — CLEARED 는 불변(연습 기록이 클리어를 되돌리지 않음) */
export function nextProgressStatus(
  current: SkillProgressStatus,
  observed: PracticeObservation,
): SkillProgressStatus {
  if (current === "CLEARED") return "CLEARED";
  return observed; // 코치의 관찰이 정본 — 후퇴(다시 도움 필요)도 현실이므로 허용
}

/** 클리어 확정 가능 여부 — 이미 CLEARED 면 불가(멱등은 서비스에서 처리) */
export function canClear(current: SkillProgressStatus): boolean {
  return current !== "CLEARED";
}

/** 클리어 기준 충족 검증 — required 기준 전부 확인돼야 확정(자동 클리어 방지의 실체) */
export function validateClearance(
  criteria: readonly { id: string; required: boolean }[],
  checkedCriteriaIds: readonly string[],
): { ok: true } | { ok: false; missing: string[] } {
  const checked = new Set(checkedCriteriaIds);
  const missing = criteria.filter((c) => c.required && !checked.has(c.id)).map((c) => c.id);
  return missing.length ? { ok: false, missing } : { ok: true };
}
