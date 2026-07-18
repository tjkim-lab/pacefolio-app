/* 공지 — 기본선 3단계(#24). 발행(학원만) → 대상 receipt 생성 → 읽음 추적.
   "미열람 보호자 명단"(13A 원장 홈)의 서버 정본. 실 발송(푸시·알림톡)은
   Outbox(NOTICE_PUBLISHED)를 publisher 가 소비 — 사업자 연동 대기. */
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { schema as s } from "@pacefolio/db";
import { newId } from "../crypto";
import { recordAudit, recordOutbox } from "../audit";
import type { Db } from "../sessions/service";

const isStaff = (roles: readonly string[]) => roles.includes("OWNER") || roles.includes("DESK");

export type NoticePublishResult =
  | { kind: "OK"; noticeId: string; recipients: number }
  | { kind: "FORBIDDEN"; reason: string };

export async function publishNotice(db: Db, input: {
  actorUserId: string; actorRoles: readonly string[]; academyId: string;
  title: string; body: string; audience: string;
  classId?: string; // AudienceFilter 1단계(E P1): 반 필터 — 해당 반 원생의 VERIFIED 보호자만
}, nowISO: string): Promise<NoticePublishResult> {
  if (!isStaff(input.actorRoles)) return { kind: "FORBIDDEN", reason: "공지 발행은 원장·데스크만" };
  return db.transaction(async (tx) => {
    /* 수신자 산정 — 서버 정본:
       전체 = 학원 ACTIVE GUARDIAN 멤버십 전원
       반 필터 = 그 반 ACTIVE 등록 원생의 VERIFIED 보호자(연결 기반) */
    let recipientUserIds: string[];
    if (input.classId) {
      const cls = (await tx.select({ id: s.dbClasses.id }).from(s.dbClasses).where(and(
        eq(s.dbClasses.id, input.classId), eq(s.dbClasses.academyId, input.academyId),
      )))[0];
      if (!cls) return { kind: "FORBIDDEN" as const, reason: "반 없음(학원 불일치 포함)" };
      const rows = await tx.select({ userId: s.guardians.userId })
        .from(s.dbEnrollments)
        .innerJoin(s.guardianParticipantLinks, and(
          eq(s.guardianParticipantLinks.participantId, s.dbEnrollments.participantId),
          eq(s.guardianParticipantLinks.academyId, input.academyId),
        ))
        .innerJoin(s.guardians, eq(s.guardians.id, s.guardianParticipantLinks.guardianId))
        .where(and(
          eq(s.dbEnrollments.classId, input.classId),
          eq(s.dbEnrollments.academyId, input.academyId),
          eq(s.dbEnrollments.status, "ACTIVE"),
          eq(s.guardianParticipantLinks.verificationStatus, "VERIFIED"),
        ));
      recipientUserIds = [...new Set(rows.map((r) => r.userId))];
    } else {
      const members = await tx.select().from(s.academyMemberships).where(and(
        eq(s.academyMemberships.academyId, input.academyId),
        eq(s.academyMemberships.status, "ACTIVE"),
      ));
      recipientUserIds = members.filter((m) => m.roles.includes("GUARDIAN")).map((m) => m.userId);
    }
    const noticeId = newId("nt");
    await tx.insert(s.dbNotices).values({
      id: noticeId, academyId: input.academyId, title: input.title, body: input.body,
      audience: input.audience, publishedAt: nowISO,
      createdByUserId: input.actorUserId, createdAt: nowISO,
    });
    const guardians = recipientUserIds.map((userId) => ({ userId }));
    if (guardians.length) {
      await tx.insert(s.noticeReceipts).values(guardians.map((g) => ({
        id: newId("ntr"), noticeId, academyId: input.academyId, userId: g.userId,
      })));
    }
    await recordAudit(tx, {
      academyId: input.academyId, actorUserId: input.actorUserId, actorRole: "ACADEMY",
      action: "notice.published", targetType: "Notice", targetId: noticeId,
      detail: { audience: input.audience, recipients: guardians.length, classId: input.classId ?? null },
      success: true,
    }, nowISO);
    await recordOutbox(tx, {
      academyId: input.academyId, eventType: "NOTICE_PUBLISHED",
      payload: { noticeId, recipients: guardians.length },
    }, nowISO);
    return { kind: "OK" as const, noticeId, recipients: guardians.length };
  });
}

export async function markNoticeRead(db: Db, input: {
  actorUserId: string; academyId: string; noticeId: string;
}, nowISO: string): Promise<{ ok: boolean }> {
  await db.update(s.noticeReceipts).set({ readAt: nowISO }).where(and(
    eq(s.noticeReceipts.noticeId, input.noticeId),
    eq(s.noticeReceipts.academyId, input.academyId),
    eq(s.noticeReceipts.userId, input.actorUserId),
    isNull(s.noticeReceipts.readAt), // 최초 읽음 시각 보존(멱등)
  ));
  return { ok: true };
}

export async function listNotices(db: Db, input: {
  actorUserId: string; actorRoles: readonly string[]; academyId: string;
}) {
  const notices = await db.select().from(s.dbNotices)
    .where(eq(s.dbNotices.academyId, input.academyId))
    .orderBy(desc(s.dbNotices.publishedAt));
  const staff = isStaff(input.actorRoles);
  const counts = staff
    ? await db.select({
        noticeId: s.noticeReceipts.noticeId,
        total: sql<number>`count(*)::int`,
        unread: sql<number>`count(*) filter (where ${s.noticeReceipts.readAt} is null)::int`,
      }).from(s.noticeReceipts)
        .where(eq(s.noticeReceipts.academyId, input.academyId))
        .groupBy(s.noticeReceipts.noticeId)
    : [];
  const byId = new Map(counts.map((c) => [c.noticeId, c]));
  return notices.map((n) => ({
    noticeId: n.id, title: n.title, body: n.body, audience: n.audience,
    publishedAt: n.publishedAt,
    ...(staff ? {
      recipients: byId.get(n.id)?.total ?? 0,
      unread: byId.get(n.id)?.unread ?? 0, // 미열람 수 — 명단은 후속(재알림과 함께)
    } : {}),
  }));
}
