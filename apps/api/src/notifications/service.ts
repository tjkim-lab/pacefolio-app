/* Outbox 디스패처 + 인앱 알림 (파일럿 P0)
   원칙: outbox 는 at-least-once — 소비는 멱등(publishedAt 마킹, FOR UPDATE SKIP LOCKED).
   v1 인앱 매핑: SAFETY_INCIDENT_REPORTED → 학원 OWNER 전원(REQUIRED tier).
   그 외 이벤트는 외부 채널(알림톡·푸시) 사업자 연동 전까지 마킹만 — 유실 아님(행 보존). */
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { schema as s } from "@pacefolio/db";
import { newId } from "../crypto";
import type { Db } from "../sessions/service";

export async function dispatchPendingOutbox(db: Db, nowISO: string, limit = 50): Promise<number> {
  return db.transaction(async (tx) => {
    const pending = await tx.select().from(s.outboxEvents)
      .where(isNull(s.outboxEvents.publishedAt))
      .orderBy(asc(s.outboxEvents.createdAt))
      .limit(limit)
      .for("update", { skipLocked: true }); // 다중 워커 안전 — 경쟁 없이 분할 소비
    for (const evt of pending) {
      if (evt.eventType === "SAFETY_INCIDENT_REPORTED" && evt.academyId) {
        const payload = JSON.parse(evt.payload) as { incidentId?: string; severity?: string };
        const members = await tx.select().from(s.academyMemberships).where(and(
          eq(s.academyMemberships.academyId, evt.academyId),
          eq(s.academyMemberships.status, "ACTIVE"),
        ));
        const owners = members.filter((m) => m.roles.includes("OWNER"));
        if (owners.length) {
          await tx.insert(s.inAppNotifications).values(owners.map((o) => ({
            id: newId("ntf"), academyId: evt.academyId!, userId: o.userId,
            category: "SAFETY_INCIDENT",
            title: "안전사고 보고",
            body: `심각도 ${payload.severity ?? "?"} — 앱에서 상세를 확인해주세요`, // 원문 미포함(PII 최소)
            refType: "SafetyIncident", refId: payload.incidentId,
            createdAt: nowISO,
          })));
        }
      }
      if (evt.eventType === "COACH_SWAPPED" && evt.academyId) {
        /* #42: 새 코치에게 인수인계 브리핑 알림 — "노하우는 학원에 남는다" 진입점.
           보호자 알림은 외부 채널(알림톡) 사업자 연동 트랙 — 행 보존으로 유실 없음. */
        const payload = JSON.parse(evt.payload) as {
          toCoachUserId?: string; classIds?: string[]; effectiveDate?: string; affectedParticipants?: number;
        };
        if (payload.toCoachUserId) {
          await tx.insert(s.inAppNotifications).values({
            id: newId("ntf"), academyId: evt.academyId, userId: payload.toCoachUserId,
            category: "HANDOVER",
            title: "인수인계 브리핑",
            body: `${payload.effectiveDate ?? ""}부터 반 ${payload.classIds?.length ?? 0}개 · 원생 ${payload.affectedParticipants ?? 0}명을 맡게 됐어요 — 진도·기록을 확인해주세요`,
            refType: "CoachSwap", refId: evt.id,
            createdAt: nowISO,
          });
        }
      }
      await tx.update(s.outboxEvents).set({
        publishedAt: nowISO, attempts: evt.attempts + 1,
      }).where(eq(s.outboxEvents.id, evt.id));
    }
    return pending.length;
  });
}

export async function listMyNotifications(db: Db, input: {
  actorUserId: string; academyId: string;
}) {
  return db.select({
    notificationId: s.inAppNotifications.id,
    category: s.inAppNotifications.category,
    title: s.inAppNotifications.title,
    body: s.inAppNotifications.body,
    refType: s.inAppNotifications.refType,
    refId: s.inAppNotifications.refId,
    readAt: s.inAppNotifications.readAt,
    createdAt: s.inAppNotifications.createdAt,
  }).from(s.inAppNotifications)
    .where(and(
      eq(s.inAppNotifications.academyId, input.academyId),
      eq(s.inAppNotifications.userId, input.actorUserId), // 내 것만 — 타인 알림 표면 없음
    ))
    .orderBy(desc(s.inAppNotifications.createdAt))
    .limit(50);
}

export async function markNotificationRead(db: Db, input: {
  actorUserId: string; academyId: string; notificationId: string;
}, nowISO: string): Promise<void> {
  await db.update(s.inAppNotifications).set({ readAt: nowISO }).where(and(
    eq(s.inAppNotifications.id, input.notificationId),
    eq(s.inAppNotifications.academyId, input.academyId),
    eq(s.inAppNotifications.userId, input.actorUserId), // 소유자만 — 멱등(최초 시각 보존)
    isNull(s.inAppNotifications.readAt),
  ));
}
