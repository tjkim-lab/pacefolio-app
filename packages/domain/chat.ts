/* =========================================================
   소통(채팅) 도메인 — docs/12-communication.md 개정판(12차) 계약
   ---------------------------------------------------------
   - 메시지 유형: NORMAL_CHAT · NOTICE · ACK_REQUIRED ·
     URGENT_ACK_REQUIRED · OPERATIONAL_TASK
   - 상태: SENT→DELIVERED→READ→ACKNOWLEDGED→RESOLVED (+CANCELLED·EXPIRED)
     READ(봤다) ≠ ACKNOWLEDGED(확인 버튼) ≠ RESOLVED(처리 결과 보고)
   - 민감정보 조건부 허용: BILLING = DM + 서버 context card 로만 /
     HEALTH = 원생 지정 필수 + 전체방 금지
   순수 함수만 — DB·전송 없음.
   ========================================================= */

export type ChatRoomType =
  | "OWNER_COACH_DM"   // 원장 ↔ 코치 1:1
  | "COACH_ALL"        // 전체 코치 단체방
  | "CLASS_COACHES"    // 반 담당 코치방
  | "GUARDIAN_DM"      // 원장(학원) ↔ 보호자 1:1 (원생 컨텍스트)
  | "CLASS_GUARDIANS"  // 반 전체 보호자방
  | "ACADEMY_NOTICE";  // 공지형 학원방(학원만 발송)

export type ChatMessageKind =
  | "NORMAL_CHAT" | "NOTICE" | "ACK_REQUIRED" | "URGENT_ACK_REQUIRED" | "OPERATIONAL_TASK";

export type ChatMessageStatus =
  | "SENT" | "DELIVERED" | "READ" | "ACKNOWLEDGED" | "RESOLVED" | "CANCELLED" | "EXPIRED";

export type ChatCategory = "GENERAL" | "BILLING" | "HEALTH";

/** 확인(ACK) 수명주기를 갖는 유형 — 읽음만으로는 끝나지 않는다. */
export function requiresAck(kind: ChatMessageKind): boolean {
  return kind === "ACK_REQUIRED" || kind === "URGENT_ACK_REQUIRED" || kind === "OPERATIONAL_TASK";
}

/* 상태 전이 — 뒤로 가기 금지. CANCELLED 는 확인 전에만(발신자 취소),
   EXPIRED 는 미확인 시간 초과(원장 경고 경로). RESOLVED 는 확인 후에만. */
const NEXT: Record<ChatMessageStatus, readonly ChatMessageStatus[]> = {
  SENT: ["DELIVERED", "READ", "CANCELLED", "EXPIRED"],
  DELIVERED: ["READ", "CANCELLED", "EXPIRED"],
  READ: ["ACKNOWLEDGED", "CANCELLED", "EXPIRED"],
  ACKNOWLEDGED: ["RESOLVED"],
  RESOLVED: [],
  CANCELLED: [],
  EXPIRED: ["ACKNOWLEDGED"], // 늦은 확인은 허용 — 경고 이력은 남는다
};
export function canTransitionChatStatus(from: ChatMessageStatus, to: ChatMessageStatus): boolean {
  return NEXT[from].includes(to);
}

/** 민감 카테고리 규칙 (docs/12 개정 — "금지"가 아니라 조건부 허용) */
export function validateChatCategory(input: {
  category: ChatCategory;
  roomType: ChatRoomType;
  relatedParticipantId?: string | null;
  hasContextCard: boolean;
}): { ok: true } | { ok: false; reason: string } {
  const { category, roomType, relatedParticipantId, hasContextCard } = input;
  if (category === "BILLING") {
    if (roomType !== "GUARDIAN_DM") {
      return { ok: false, reason: "금액정보는 해당 보호자 DM 에서만 — 학원방·코치방 전송 금지" };
    }
    if (!hasContextCard) {
      return { ok: false, reason: "금액은 자유 텍스트가 아니라 서버 생성 청구서 context card 로만 공유" };
    }
    if (!relatedParticipantId) {
      return { ok: false, reason: "금액정보는 관련 원생 지정 필수" };
    }
    return { ok: true };
  }
  if (category === "HEALTH") {
    if (roomType === "ACADEMY_NOTICE" || roomType === "CLASS_GUARDIANS" || roomType === "COACH_ALL") {
      return { ok: false, reason: "건강정보는 전체방 전송 금지 — 해당 보호자·담당 코치·원장 범위만" };
    }
    if (!relatedParticipantId) {
      return { ok: false, reason: "건강정보는 관련 원생 지정 필수" };
    }
    return { ok: true };
  }
  return { ok: true };
}

/** 공지형 학원방은 학원(원장·직원)만 발송 — 보호자는 thread 만 */
export function canPostToRoom(input: {
  roomType: ChatRoomType;
  senderRoles: readonly string[];
}): boolean {
  if (input.roomType === "ACADEMY_NOTICE") {
    return input.senderRoles.includes("OWNER") || input.senderRoles.includes("DESK");
  }
  return true; // 그 외 방은 멤버십(방 멤버 여부)이 게이트 — 서비스 계층 검증
}

/** DM 중복 방지 키 — (정렬된 참여자, 원생 컨텍스트) 로 유일 */
export function dmKey(type: ChatRoomType, userIds: readonly string[], participantId?: string | null): string {
  const users = [...userIds].sort().join(":");
  return `${type}:${users}${participantId ? `:${participantId}` : ""}`;
}
