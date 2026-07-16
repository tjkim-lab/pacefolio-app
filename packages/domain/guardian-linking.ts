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
import type {
  AcademyId, ParticipantId, GuardianVerificationId, GuardianId, UserId,
  GuardianParticipantLinkId, GuardianInviteRedemptionId,
} from "./ids";
import type { VerificationStatus, RelationshipType } from "./enums";
import { credentialExpired } from "./time";

/** 서버가 OTP 성공 후 발급하는 검증 세션(클라가 boolean 을 주지 않는다).
   R4 P0-6: 세션은 발급받은 사용자에게 귀속되고(actor-binding), 목적이
   고정되며, 링크 생성에 1회만 소비된다(consumedAt). 소비는 GuardianLink
   생성과 같은 DB 트랜잭션이어야 한다. */
export interface GuardianVerificationSession {
  id: GuardianVerificationId;
  issuedToUserId: UserId;  // 발급 대상 — actor 와 일치해야 사용 가능
  purpose: "GUARDIAN_LINK";// 다른 용도(로그인 등) OTP 세션 재사용 차단
  verifiedPhone: string;   // OTP 통과한 실제 전화번호(서버 도출)
  verifiedAt: string;      // ISO
  expiresAt: string;       // ISO — 만료 후 무효
  consumedAt?: string | null;          // 1회 소비 — 있으면 재사용 불가
  consumedByLinkId?: GuardianParticipantLinkId; // 어느 링크 생성에 소비됐나
}

/** 원장 선등록: 원생별 보호자 연락처(헌법: 원장 선등록→폰번호 클레임). */
export interface RegisteredGuardianContact {
  academyId: AcademyId;
  participantId: ParticipantId;
  phone: string;
  relationshipType?: RelationshipType;
}

/** 초대코드 정식 모델(R3 P0-5) — 문자열 배열 금지, 학원·원생에 귀속.
   서버는 코드 원문 대신 hash 로 저장·조회. 여기엔 해석된 invite 가 온다. */
export interface GuardianInvite {
  codeHash: string;
  academyId: AcademyId;
  participantId: ParticipantId;   // 이 원생 전용
  intendedPhone?: string;         // 지정 시 OTP 전화와 일치해야 함
  expiresAt: string;              // ISO
  maxUses: number;
  usedCount: number;
  revokedAt?: string | null;
}

/** invite 가 (요청 코드·후보 원생·OTP 전화) 조합에 유효한가.
   R4 P0-4: requestCodeHash = 서버가 요청 원문 코드를 hash 한 값.
   조회된 invite 와 요청 코드가 같은 초대인지 함수 내부에서 직접 결합 —
   "임의 코드 문자열 + 관계없는 유효 invite context → VERIFIED" 차단. */
export function isInviteUsable(
  invite: GuardianInvite,
  requestCodeHash: string,
  academyId: AcademyId,
  candidateId: ParticipantId,
  otpPhone: string,
  nowISO: string,
): boolean {
  if (!requestCodeHash || invite.codeHash !== requestCodeHash) return false; // 코드↔invite 결합
  if (invite.academyId !== academyId) return false;          // 타 학원 코드
  if (invite.participantId !== candidateId) return false;    // 타 원생 코드
  if (invite.revokedAt) return false;                        // 철회
  if (credentialExpired(invite.expiresAt, nowISO)) return false; // 만료(epoch·fail-closed)
  if (invite.usedCount >= invite.maxUses) return false;      // 사용 소진
  if (invite.intendedPhone &&
      normalizePhone(invite.intendedPhone) !== normalizePhone(otpPhone)) return false;
  return true;
}

/* ── 원자적 redemption 계약 (R4 P0-5) ──
   초대코드 소비는 DB 에서 하나의 트랜잭션이어야 한다:
     1. Invite row lock(또는 optimistic version 확인)
     2. revokedAt 확인          3. expiresAt 확인
     4. usedCount < maxUses     5. redemption 중복 확인
     6. GuardianLink 생성       7. GuardianVerification 기록
     8. Redemption 생성(가변 usedCount 단독 증가보다 안전)
     9. AuditLog               10. DomainEvent/Outbox
   DB 제약: UNIQUE(inviteId, guardianId, participantId).
   단일 사용 초대는 invite 단위 조건부 unique 추가. */
export interface GuardianInviteRedemption {
  id: GuardianInviteRedemptionId;
  inviteCodeHash: string;               // 소비된 invite (hash 로 식별)
  academyId: AcademyId;
  guardianId: GuardianId;
  participantId: ParticipantId;
  verificationSessionId: GuardianVerificationId;
  redeemedAt: string;                   // ISO
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
  actorUserId: UserId;                          // 요청 사용자(서버 세션 도출) — R4 P0-6
  session: GuardianVerificationSession | null;  // 서버 조회(없거나 만료면 무효)
  participants: readonly Participant[];         // academyId 격리 조회된 원생
  registeredContacts: readonly RegisteredGuardianContact[]; // 선등록 보호자 연락처
  invite?: GuardianInvite | null;               // 서버가 codeHash 로 해석한 invite(R3 P0-5)
  requestCodeHash?: string;                     // hash(req.academyInviteCode) — 서버 계산(R4 P0-4)
  nowISO: string;
}

export function evaluateLink(req: LinkRequest, ctx: LinkContext): LinkResult {
  // 1) OTP 검증 세션 유효성(서버 증적) — boolean 신뢰 금지
  const s = ctx.session;
  if (!s || s.id !== req.verificationSessionId) {
    return { status: "PENDING", reason: "휴대전화 인증(OTP) 세션 없음" };
  }
  // R4 P0-6: 세션 actor-binding — 남의 OTP 세션 재사용 차단
  if (s.issuedToUserId !== ctx.actorUserId) {
    return { status: "PENDING", reason: "인증 세션이 요청 사용자에게 발급되지 않음" };
  }
  if (s.purpose !== "GUARDIAN_LINK") {
    return { status: "PENDING", reason: "다른 목적의 인증 세션 — 자녀 연결용 재인증 필요" };
  }
  if (s.consumedAt) {
    return { status: "PENDING", reason: "이미 사용된 인증 세션 — 재인증 필요" };
  }
  if (credentialExpired(s.expiresAt, ctx.nowISO)) {
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
  // 4-b) 대안 — 학원·원생에 귀속된 초대코드.
  //      요청 코드 hash ↔ 조회된 invite 결합까지 검증(R4 P0-4).
  if (req.academyInviteCode && ctx.invite && ctx.requestCodeHash &&
      isInviteUsable(ctx.invite, ctx.requestCodeHash, req.academyId, candidate.id, s.verifiedPhone, ctx.nowISO)) {
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
