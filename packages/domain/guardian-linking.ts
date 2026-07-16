/* =========================================================
   PACEFOLIO 공유 도메인 — 보호자-자녀 연결 검증 (F8, 리뷰#2 P0-2)
   ---------------------------------------------------------
   흐름: 학원선택/초대코드 → 폰 OTP → 학원 등록정보 일치 확인
        → 관계·동의 → VERIFIED (또는 REJECTED)
   ⚠️ 이름+생년만으로 연결 금지. OTP + 학원 등록정보 일치 필수.
   순수 함수 — 서버가 실제 OTP·조회를 수행, 여기선 규칙 모델.
   상태 정의: docs/03-state-machines.md §7.
   ========================================================= */
import type { Participant } from "./entities";
import type { AcademyId, ParticipantId } from "./ids";
import type { VerificationStatus, RelationshipType } from "./enums";

export interface LinkAttempt {
  academyId: AcademyId;      // 선택한 학원(또는 초대코드로 해석된)
  guardianPhone: string;     // 보호자 휴대전화
  otpVerified: boolean;      // 폰 OTP 통과 여부
  childName: string;         // 입력한 자녀 이름
  childBirth: string;        // YYYY-MM-DD (일부 확인용)
  relationshipType: RelationshipType;
  consentAgreed: boolean;    // 필수 동의
}

export interface LinkResult {
  status: VerificationStatus;
  participantId?: ParticipantId; // VERIFIED 시 매칭된 원생
  reason?: string;               // PENDING/REJECTED 사유
}

/** 연결 시도를 학원 등록 원생과 대조해 검증 결과 산출.
   participants 는 서버가 해당 academyId 로 격리 조회한 목록. */
export function evaluateLink(
  attempt: LinkAttempt,
  participants: readonly Participant[],
): LinkResult {
  // 1) 폰 OTP 미통과 → 대기
  if (!attempt.otpVerified) {
    return { status: "PENDING", reason: "휴대전화 인증(OTP) 필요" };
  }
  // 2) 필수 동의 미완 → 대기
  if (!attempt.consentAgreed) {
    return { status: "PENDING", reason: "필수 동의 필요" };
  }
  // 3) 학원 등록정보 대조 (이름 + 생년 일치) — 같은 학원 안에서만
  const match = participants.find(
    (p) =>
      p.academyId === attempt.academyId &&
      p.name === attempt.childName &&
      p.birth === attempt.childBirth,
  );
  // 4) 불일치 → 거절 (이름만/생년만으론 통과 불가)
  if (!match) {
    return { status: "REJECTED", reason: "학원 등록정보와 일치하지 않음" };
  }
  // 5) 통과 → 검증 완료
  return { status: "VERIFIED", participantId: match.id };
}

/** 검증 완료된 연결만 자녀 데이터 접근 허용(F6 스코프와 결합). */
export function isLinkUsable(status: VerificationStatus): boolean {
  return status === "VERIFIED";
}
