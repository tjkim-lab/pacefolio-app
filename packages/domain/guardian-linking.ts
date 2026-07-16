/* =========================================================
   PACEFOLIO 공유 도메인 — 보호자-자녀 연결 검증 (F8, 리뷰 R2 P0-5)
   ---------------------------------------------------------
   ⚠️ 이전 버전 취약점: 이름+생년 일치 + `otpVerified:boolean`(클라 입력)만으로
      VERIFIED → 공격자가 본인 폰 OTP + 남의 자녀 이름/생년만 알면 통과 가능.
   수정: OTP 통과 "전화번호 주체"가 학원에 **선등록된 보호자 연락처**와 결합돼야 함.
      - otpVerified boolean → 서버 발급 GuardianVerificationSession(검증된 전화 주체)
      - 이름+생년 = 후보 탐색용일 뿐, 최종 결합 근거 아님
      - 결합 근거 = (a) 등록 보호자 연락처 일치  또는  (b) 유효 초대코드
   순수 함수 — 서버가 OTP·초대코드·연락처를 조회해 인자로 공급.
   상태 정의: docs/03-state-machines.md §7.
   ========================================================= */
import type { Participant } from "./entities";
import type { AcademyId, ParticipantId, GuardianVerificationId } from "./ids";
import type { VerificationStatus, RelationshipType } from "./enums";

/** 서버가 OTP 성공 후 발급하는 검증 세션(클라가 boolean 을 주지 않는다). */
export interface GuardianVerificationSession {
  id: GuardianVerificationId;
  verifiedPhone: string;   // OTP 통과한 실제 전화번호(서버 도출)
  verifiedAt: string;      // ISO
  expiresAt: string;       // ISO — 만료 후 무효
}

/** 원장 선등록: 원생별 보호자 연락처(헌법: 원장 선등록→폰번호 클레임). */
export interface RegisteredGuardianContact {
  academyId: AcademyId;
  participantId: ParticipantId;
  phone: string;
  relationshipType?: RelationshipType;
}

export interface LinkRequest {
  academyId: AcademyId;
  verificationSessionId: GuardianVerificationId; // 서버 OTP 증적(boolean 아님)
  childName: string;        // 후보 탐색용
  childBirth: string;       // 후보 탐색용 (YYYY-MM-DD)
  relationshipType: RelationshipType;
  consentPolicyVersion: string;
  consentAgreed: boolean;
  academyInviteCode?: string; // 대안 결합 근거(연락처 미등록 시)
}

export interface LinkResult {
  status: VerificationStatus;
  participantId?: ParticipantId;
  reason?: string;
}

export interface LinkContext {
  session: GuardianVerificationSession | null;  // 서버 조회(없거나 만료면 무효)
  participants: readonly Participant[];         // academyId 격리 조회된 원생
  registeredContacts: readonly RegisteredGuardianContact[]; // 선등록 보호자 연락처
  validInviteCodes?: readonly string[];         // 서버가 유효로 판단한 초대코드
  nowISO: string;
}

export function evaluateLink(req: LinkRequest, ctx: LinkContext): LinkResult {
  // 1) OTP 검증 세션 유효성(서버 증적) — boolean 신뢰 금지
  const s = ctx.session;
  if (!s || s.id !== req.verificationSessionId) {
    return { status: "PENDING", reason: "휴대전화 인증(OTP) 세션 없음" };
  }
  if (s.expiresAt <= ctx.nowISO) {
    return { status: "PENDING", reason: "인증 세션 만료 — 재인증 필요" };
  }
  // 2) 필수 동의(버전 포함)
  if (!req.consentAgreed || !req.consentPolicyVersion) {
    return { status: "PENDING", reason: "필수 동의 필요" };
  }
  // 3) 후보 원생 탐색(이름+생년) — 같은 학원 안에서만. (단독 결합 근거 아님)
  const candidate = ctx.participants.find(
    (p) =>
      p.academyId === req.academyId &&
      p.name === req.childName &&
      p.birth === req.childBirth,
  );
  if (!candidate) {
    return { status: "REJECTED", reason: "학원 등록 원생과 일치하지 않음" };
  }
  // 4) 결합 근거 — OTP 전화번호가 이 원생의 선등록 보호자 연락처와 일치?
  const contactMatch = ctx.registeredContacts.find(
    (c) =>
      c.academyId === req.academyId &&
      c.participantId === candidate.id &&
      normalizePhone(c.phone) === normalizePhone(s.verifiedPhone),
  );
  if (contactMatch) {
    return { status: "VERIFIED", participantId: candidate.id };
  }
  // 4-b) 대안 — 유효 초대코드
  if (req.academyInviteCode && (ctx.validInviteCodes ?? []).includes(req.academyInviteCode)) {
    return { status: "VERIFIED", participantId: candidate.id };
  }
  // 5) 전화 주체가 등록 보호자와 결합되지 않음 → 자동 VERIFIED 금지(수동 심사 대기)
  return {
    status: "PENDING",
    reason: "OTP 전화번호가 학원 선등록 보호자와 결합되지 않음 — 수동 확인 필요",
  };
}

/** 검증 완료된 연결만 자녀 데이터 접근 허용(F6 스코프와 결합). */
export function isLinkUsable(status: VerificationStatus): boolean {
  return status === "VERIFIED";
}

/** 전화번호 비교용 정규화(하이픈·공백·국가코드 흔한 형태 흡수). */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, "");
  return digits.startsWith("82") ? "0" + digits.slice(2) : digits;
}
