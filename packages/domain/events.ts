/* =========================================================
   PACEFOLIO 공유 도메인 — 도메인 이벤트 봉투 (F13, 리뷰 P0-3)
   앱 간 흐름을 잇는 이벤트. 최종 기준데이터는 엔티티에 저장,
   이벤트는 상태변경 전달 수단(데이터모델 대체 아님).
   ========================================================= */
import type { DomainEventType, Role } from "./enums";
import type {
  DomainEventId, AcademyId, ParticipantId, ClassSessionId, UserId,
} from "./ids";

export interface DomainEventEnvelope {
  eventId: DomainEventId;
  eventType: DomainEventType;
  academyId: AcademyId;            // 테넌트 격리 축
  participantId?: ParticipantId;
  classSessionId?: ClassSessionId;
  actorId: UserId;
  actorRole: Role;
  occurredAt: string;             // ISO
  idempotencyKey: string;         // 중복 처리 방지
  correlationId?: string;         // 한 사건 흐름 묶음
  causationId?: DomainEventId;    // 직전 원인 이벤트
  payloadVersion: number;
}
