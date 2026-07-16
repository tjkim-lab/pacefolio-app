/* =========================================================
   PACEFOLIO 공유 도메인 — 권한 모델 (리뷰 P0-6)
   ---------------------------------------------------------
   역할(Role) → 능력(Capability) 매트릭스 + 테넌트 격리.
   ⚠️ 2단계 검증: (1) 역할이 능력을 가지는가 `can()` +
      (2) 대상이 같은 학원·본인 소유인가 (tenant/ownership scope).
   역할 통과 = 필요조건일 뿐, 충분조건 아님. 서버가 둘 다 검증.
   클라이언트가 준 role·academyId·permission 은 절대 신뢰 금지.
   ========================================================= */
import type { Role } from "./enums";
import type { AcademyId } from "./ids";

export const CAPABILITIES = [
  "VIEW_SCHEDULE",
  "VIEW_ATTENDANCE",
  "RECORD_ATTENDANCE",      // 코치의 실제 출결 확정
  "VIEW_HEALTH_INFO",       // 원생 안전정보 (담당 범위로 추가 제한)
  "VIEW_PHOTOS",
  "VIEW_PAYMENT_AMOUNT",    // 금액 = 개인정보 (코치 제외)
  "MANAGE_BILLING",         // 청구 생성·수납주기·회차
  "MAKE_PAYMENT",
  "REQUEST_REFUND",
  "APPROVE_REFUND",         // 상호 승인 중 원장 측
  "MANAGE_MEMBERS",         // 코치 초대·권한 회수
  "MANAGE_ACADEMY_SETTINGS",
  "MANAGE_CONSENT_POLICY",
  "SEND_ANNOUNCEMENT",
  "VIEW_STUDENT_CONTACT",   // 보호자 연락처 원문
  "MANAGE_PLATFORM",        // 플랫폼(본사)
  "SUPPORT_VIEW",           // 관리자 읽기전용·마스킹 지원 세션
] as const;
export type Capability = (typeof CAPABILITIES)[number];

/* 역할별 능력 (학원 범위 역할 + 보호자 + 플랫폼).
   코치는 VIEW_PAYMENT_AMOUNT·MANAGE_* 없음(리뷰 6-3·부정테스트).
   보호자 능력은 연결·검증된 자녀로 추가 스코프 제한(아래 참고). */
const MATRIX: Record<Role, readonly Capability[]> = {
  OWNER: [
    "VIEW_SCHEDULE", "VIEW_ATTENDANCE", "VIEW_HEALTH_INFO", "VIEW_PHOTOS",
    "VIEW_PAYMENT_AMOUNT", "MANAGE_BILLING", "APPROVE_REFUND", "MANAGE_MEMBERS",
    "MANAGE_ACADEMY_SETTINGS", "MANAGE_CONSENT_POLICY", "SEND_ANNOUNCEMENT",
    "VIEW_STUDENT_CONTACT",
  ],
  MANAGER: [
    "VIEW_SCHEDULE", "VIEW_ATTENDANCE", "VIEW_HEALTH_INFO", "VIEW_PHOTOS",
    "VIEW_PAYMENT_AMOUNT", "MANAGE_BILLING", "SEND_ANNOUNCEMENT", "VIEW_STUDENT_CONTACT",
  ],
  COACH: [
    "VIEW_SCHEDULE", "VIEW_ATTENDANCE", "RECORD_ATTENDANCE",
    "VIEW_HEALTH_INFO", "VIEW_PHOTOS",
  ],
  DESK: [
    "VIEW_SCHEDULE", "VIEW_ATTENDANCE", "VIEW_STUDENT_CONTACT",
  ],
  DRIVER: [
    "VIEW_SCHEDULE", "VIEW_ATTENDANCE",
  ],
  GUARDIAN: [
    "VIEW_SCHEDULE", "VIEW_ATTENDANCE", "VIEW_HEALTH_INFO", "VIEW_PHOTOS",
    "VIEW_PAYMENT_AMOUNT", "MAKE_PAYMENT", "REQUEST_REFUND",
  ],
  PLATFORM_ADMIN: [
    "MANAGE_PLATFORM", "SUPPORT_VIEW",
  ],
};

/** (1) 역할이 능력을 가지는가. 필요조건 — 스코프 검증(2)과 반드시 AND. */
export function can(role: Role, cap: Capability): boolean {
  return MATRIX[role].includes(cap);
}

export function capabilitiesFor(role: Role): readonly Capability[] {
  return MATRIX[role];
}

/** (2-a) 테넌트 격리: 행위자가 대상 학원에 소속됐는가.
   actor 의 academyId 목록은 서버가 세션에서 도출(클라 입력 신뢰 금지). */
export function inTenantScope(
  actorAcademyIds: readonly AcademyId[],
  targetAcademyId: AcademyId,
): boolean {
  return actorAcademyIds.includes(targetAcademyId);
}

/* (2-b) 소유/연결 스코프 — 역할·능력만으로 부족한 경우(런타임 데이터 필요):
   - GUARDIAN: 대상 participant 가 검증(VERIFIED)된 GuardianParticipantLink 로 연결돼야 함.
   - COACH: VIEW_HEALTH_INFO·RECORD_ATTENDANCE 는 담당(ClassAssignment) 반으로 제한.
   이 검증은 링크·배정 데이터를 받아 서버에서 수행 → 04-permission-matrix.md 참조. */
