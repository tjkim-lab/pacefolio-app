/* AuditLog · Outbox 기록 — 업무 트랜잭션과 같은 tx 에서 호출 (R7 §17·18·26)
   - audit: append-only, 민감정보 원문 미포함(detail 은 호출부가 마스킹)
   - outbox: at-least-once 발행 전제 — 소비자 멱등. publisher worker 는 후속. */
import { schema as s } from "@pacefolio/db";
import { newId } from "./crypto";
import type { Db } from "./sessions/service";

export interface AuditEntry {
  academyId?: string;
  actorUserId?: string;
  actorRole?: string;
  action: string;        // 예: "guardian_link.created"
  targetType: string;
  targetId: string;
  reason?: string;
  requestId?: string;
  detail?: Record<string, unknown>; // 마스킹된 값만
  success: boolean;
}

export async function recordAudit(tx: Db, e: AuditEntry, nowISO: string): Promise<void> {
  await tx.insert(s.auditLogs).values({
    id: newId("aud"),
    academyId: e.academyId, actorUserId: e.actorUserId, actorRole: e.actorRole,
    action: e.action, targetType: e.targetType, targetId: e.targetId,
    reason: e.reason, requestId: e.requestId,
    detail: e.detail ? JSON.stringify(e.detail) : undefined,
    success: e.success, at: nowISO,
  });
}

export async function recordOutbox(
  tx: Db,
  evt: { academyId?: string; eventType: string; payload: Record<string, unknown> },
  nowISO: string,
): Promise<void> {
  await tx.insert(s.outboxEvents).values({
    id: newId("obx"),
    academyId: evt.academyId, eventType: evt.eventType,
    payload: JSON.stringify(evt.payload), // PII 최소 — ID 참조 위주
    createdAt: nowISO,
  });
}
