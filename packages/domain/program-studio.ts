/* 프로그램 스튜디오 도메인 불변식 (docs/20·21)
   원칙: 비즈니스 콘텐츠(단계명·영역명·활동명)는 데이터 — 여기엔 시스템 상태·전이만.
   이름은 식별자가 아니다: Activity(불변 ID) + Revision(콘텐츠) — 게시/사용된
   개정판의 편집은 새 개정판으로(과거 기록 보존). */

export const PROGRAM_MODES = ["EXPERIENCE", "SKILL_MASTERY", "SEASONAL", "MEASUREMENT", "COURSE"] as const;
export type ProgramMode = (typeof PROGRAM_MODES)[number];

export const PROGRAM_VERSION_STATUSES = ["DRAFT", "IN_REVIEW", "PUBLISHED", "ARCHIVED"] as const;
export type ProgramVersionStatus = (typeof PROGRAM_VERSION_STATUSES)[number];

/* 상태 전이 — PUBLISHED 는 되돌리지 않는다(변경 = 복제해 새 DRAFT).
   DRAFT ↔ IN_REVIEW · DRAFT|IN_REVIEW → PUBLISHED · PUBLISHED → ARCHIVED */
const VERSION_TRANSITIONS: Record<ProgramVersionStatus, readonly ProgramVersionStatus[]> = {
  DRAFT: ["IN_REVIEW", "PUBLISHED"],
  IN_REVIEW: ["DRAFT", "PUBLISHED"],
  PUBLISHED: ["ARCHIVED"],
  ARCHIVED: [],
};

export function canTransitionVersion(from: ProgramVersionStatus, to: ProgramVersionStatus): boolean {
  return VERSION_TRANSITIONS[from]?.includes(to) ?? false;
}

/** 버전 하위(레벨·커리큘럼) 편집 가능 여부 — DRAFT 만(docs/21 불변식) */
export function isVersionEditable(status: ProgramVersionStatus): boolean {
  return status === "DRAFT";
}

/** 진행 방식 조합 검증 — 1개 이상 · 중복 없음 · 알려진 값만 */
export function validateModes(modes: readonly string[]): { ok: true; modes: ProgramMode[] } | { ok: false; reason: string } {
  if (modes.length === 0) return { ok: false, reason: "진행 방식을 1개 이상 선택" };
  const set = new Set(modes);
  if (set.size !== modes.length) return { ok: false, reason: "진행 방식 중복" };
  for (const m of modes) {
    if (!(PROGRAM_MODES as readonly string[]).includes(m)) return { ok: false, reason: `알 수 없는 진행 방식: ${m}` };
  }
  return { ok: true, modes: modes as ProgramMode[] };
}

/* 개정 정책(docs/21 결정 2): 현재 개정판이 "게시된 버전의 커리큘럼" 또는
   "실제 수업 기록"(PS4+)에서 참조되면 — 편집은 새 개정판으로. 아니면 제자리 수정. */
export function revisionEditAction(input: {
  referencedByPublishedCurriculum: boolean;
  referencedBySessionRecords?: boolean; // PS4+ 확장 게이트
}): "EDIT_IN_PLACE" | "CREATE_NEW_REVISION" {
  return input.referencedByPublishedCurriculum || input.referencedBySessionRecords
    ? "CREATE_NEW_REVISION"
    : "EDIT_IN_PLACE";
}

/** 성장영역 태그 세트 검증 — PRIMARY 정확히 1 · 도메인 중복 금지 */
export function validateGrowthTagSet(tags: readonly { growthDomainId: string; role: "PRIMARY" | "SECONDARY" }[]):
  { ok: true } | { ok: false; reason: string } {
  if (tags.length === 0) return { ok: true }; // 태그 없는 활동 허용(입력 사다리)
  const primaries = tags.filter((t) => t.role === "PRIMARY");
  if (primaries.length !== 1) return { ok: false, reason: "대표(PRIMARY) 영역은 정확히 1개" };
  const ids = new Set(tags.map((t) => t.growthDomainId));
  if (ids.size !== tags.length) return { ok: false, reason: "같은 성장영역 중복 태그 금지" };
  return { ok: true };
}

/** ARCHIVED 활동은 신규 배치 금지(기존 참조·과거 기록은 유지) */
export function canPlaceActivity(activityStatus: "ACTIVE" | "ARCHIVED"): boolean {
  return activityStatus === "ACTIVE";
}
