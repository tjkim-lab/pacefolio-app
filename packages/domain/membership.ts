/* =========================================================
   PACEFOLIO 공유 도메인 — 학원 멤버십 해석 (F7)
   한 User가 여러 학원·여러 역할 가능(코치가 두 학원 근무 등).
   F6 테넌트 격리(inTenantScope)에 "이 사용자의 학원 집합"을 공급.
   순수 함수 — 데이터를 인자로 받는다(fixture 비의존).
   ========================================================= */
import type { AcademyMembership } from "./entities";
import type { AcademyId, UserId } from "./ids";
import type { Role } from "./enums";

/** 이 사용자의 모든 멤버십 */
export function membershipsForUser(
  all: readonly AcademyMembership[],
  userId: UserId,
): AcademyMembership[] {
  return all.filter((m) => m.userId === userId);
}

/** ACTIVE 소속 학원 집합 — inTenantScope 의 actorAcademyIds 로 사용.
   서버는 이 값을 세션에서 도출(클라 입력 신뢰 금지). */
export function academyIdsForUser(
  all: readonly AcademyMembership[],
  userId: UserId,
): AcademyId[] {
  return all
    .filter((m) => m.userId === userId && m.status === "ACTIVE")
    .map((m) => m.academyId);
}

/** 특정 학원에서의 역할(ACTIVE). 소속 아니면 null → 접근 차단 신호. */
export function roleInAcademy(
  all: readonly AcademyMembership[],
  userId: UserId,
  academyId: AcademyId,
): Role | null {
  const m = all.find(
    (x) => x.userId === userId && x.academyId === academyId && x.status === "ACTIVE",
  );
  return m ? m.role : null;
}

/** 여러 학원 소속 여부 — "학원 전환" UI 필요 판단(리뷰#2 P1-1) */
export function hasMultipleAcademies(
  all: readonly AcademyMembership[],
  userId: UserId,
): boolean {
  return academyIdsForUser(all, userId).length > 1;
}
