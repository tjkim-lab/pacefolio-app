/* =========================================================
   PACEFOLIO 공유 도메인 — 멱등 재시도 의미 (리뷰 R2 P0-7)
   ---------------------------------------------------------
   "같은 Idempotency-Key = 무조건 409" 는 안전한 네트워크 재시도를 막는다.
   규칙:
   - 같은 actor·operation·key·requestHash  → 기존 응답 재생(REPLAY)
   - 같은 key, 다른 requestHash            → 409 IDEMPOTENCY_KEY_REUSED
   - 첫 요청 처리 중                        → IN_PROGRESS
   - 보관기간(expiresAt) 만료 후 재사용     → 신규로 처리(PROCEED)
   operation namespace: 결제준비/승인/환불요청/환불승인 각각 분리.
   ========================================================= */
import type { IdempotencyRecordId, UserId, AcademyId } from "./ids";
// scope = academyId + actorId + operation + idempotencyKey (R3 P1-4)

export interface IdempotencyRecord {
  id: IdempotencyRecordId;
  actorId: UserId;
  academyId: AcademyId;
  operation: string;          // 예: "payment.prepare"
  idempotencyKey: string;
  requestHash: string;        // body 정규화 해시
  status: "IN_PROGRESS" | "COMPLETED" | "FAILED";
  resourceId?: string;
  responseStatus?: number;
  responseBodyRef?: string;   // 저장된 응답 참조
  createdAt: string;
  expiresAt: string;          // ISO — 이후 재사용은 신규 취급
}

export interface IncomingRequest {
  actorId: UserId;
  academyId: AcademyId;       // lookup scope 에 포함(R3 P1-4) — 타 학원 동일 key 는 별개
  operation: string;
  idempotencyKey: string;
  requestHash: string;        // body 정규화(JSON 키 정렬) 후 SHA-256 — 서버 규칙
  nowISO: string;
}

export type IdempotencyDecision =
  | { action: "PROCEED" }                                  // 신규 처리(IN_PROGRESS 생성)
  | { action: "REPLAY"; record: IdempotencyRecord }        // 기존 응답 재생
  | { action: "IN_PROGRESS"; record: IdempotencyRecord }   // 처리 중 — 대기/폴링
  | { action: "CONFLICT"; reason: string };                // 409 key 재사용(다른 body)

/** existing = (academyId, actorId, operation, idempotencyKey) 로 조회된 레코드(없으면 null).
   FAILED 응답도 동일 key+body 면 재생한다(멱등 — 재실행이 이중처리를 만들 수 있음).
   만료 후 재사용 시 DB unique 제약은 (key, expiresAt) 또는 만료 레코드 정리로 처리. */
export function resolveIdempotency(
  existing: IdempotencyRecord | null,
  incoming: IncomingRequest,
): IdempotencyDecision {
  if (!existing) return { action: "PROCEED" };

  // 보관기간 만료 → 신규 취급
  if (existing.expiresAt <= incoming.nowISO) return { action: "PROCEED" };

  // 스코프 방어(정상 조회면 일치) — academy/actor/operation 불일치면 재사용 충돌로 간주
  if (
    existing.academyId !== incoming.academyId ||
    existing.actorId !== incoming.actorId ||
    existing.operation !== incoming.operation
  ) {
    return { action: "CONFLICT", reason: "IDEMPOTENCY_KEY_SCOPE_MISMATCH" };
  }

  // 같은 key, 다른 body → 409
  if (existing.requestHash !== incoming.requestHash) {
    return { action: "CONFLICT", reason: "IDEMPOTENCY_KEY_REUSED" };
  }

  // 같은 key + 같은 body
  if (existing.status === "IN_PROGRESS") return { action: "IN_PROGRESS", record: existing };
  return { action: "REPLAY", record: existing };
}
