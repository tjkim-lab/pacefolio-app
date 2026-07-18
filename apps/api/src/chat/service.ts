/* 소통(채팅) vertical slice — 배치 14 (docs/12 개정 계약)
   범위: DM 개설(find-or-create) · 메시지(민감 카테고리 규칙·ACK 수명주기) ·
   읽음/확인/처리 분리 · AuditLog·Outbox 합류.
   전부 같은 트랜잭션 — 방 멤버십이 게이트, 테넌트는 복합 FK 가 최종 방어. */
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { schema as s } from "@pacefolio/db";
import {
  requiresAck, canTransitionChatStatus, validateChatCategory, canPostToRoom, dmKey,
  type ChatRoomType, type ChatMessageKind, type ChatCategory, type ChatMessageStatus,
} from "@pacefolio/domain";
import { newId } from "../crypto";
import { recordAudit, recordOutbox } from "../audit";
import type { Db } from "../sessions/service";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

async function activeMember(tx: Tx, roomId: string, userId: string) {
  const rows = await tx.select().from(s.chatRoomMembers).where(and(
    eq(s.chatRoomMembers.roomId, roomId),
    eq(s.chatRoomMembers.userId, userId),
    isNull(s.chatRoomMembers.leftAt),
  ));
  return rows[0] ?? null;
}

/* ── DM 개설 — dmKey UNIQUE 로 중복 방지(find-or-create) ── */
export type OpenDmResult =
  | { kind: "OK"; roomId: string; created: boolean }
  | { kind: "DENIED"; reason: string };

export async function openDm(db: Db, input: {
  actorUserId: string;
  actorRoles: readonly string[];
  academyId: string;
  type: Extract<ChatRoomType, "OWNER_COACH_DM" | "GUARDIAN_DM">;
  targetUserId?: string;    // OWNER_COACH_DM: 코치
  participantId?: string;   // GUARDIAN_DM: 원생 컨텍스트
}, nowISO: string): Promise<OpenDmResult> {
  return db.transaction(async (tx) => {
    const members: { userId: string; role: string }[] = [];
    let title = "";
    let relatedParticipantId: string | null = null;

    if (input.type === "OWNER_COACH_DM") {
      if (!input.actorRoles.includes("OWNER")) {
        return { kind: "DENIED" as const, reason: "원장만 코치 DM 을 개설할 수 있어요" };
      }
      if (!input.targetUserId) return { kind: "DENIED" as const, reason: "대상 코치 필요" };
      const coachMs = await tx.select().from(s.academyMemberships).where(and(
        eq(s.academyMemberships.userId, input.targetUserId),
        eq(s.academyMemberships.academyId, input.academyId),
        eq(s.academyMemberships.status, "ACTIVE"),
      ));
      if (!coachMs[0]?.roles.includes("COACH")) {
        return { kind: "DENIED" as const, reason: "대상이 이 학원의 재직 코치가 아니에요" };
      }
      const coachUser = await tx.select().from(s.users).where(eq(s.users.id, input.targetUserId));
      members.push({ userId: input.actorUserId, role: "OWNER" }, { userId: input.targetUserId, role: "COACH" });
      title = `${coachUser[0]?.name ?? "코치"} 1:1`;
    } else {
      // GUARDIAN_DM: 보호자(VERIFIED 링크) ↔ 학원(OWNER 전원)
      if (!input.participantId) return { kind: "DENIED" as const, reason: "원생 컨텍스트 필요" };
      const gd = await tx.select().from(s.guardians)
        .where(eq(s.guardians.userId, input.actorUserId));
      const link = gd[0] && (await tx.select().from(s.guardianParticipantLinks).where(and(
        eq(s.guardianParticipantLinks.guardianId, gd[0].id),
        eq(s.guardianParticipantLinks.participantId, input.participantId),
        eq(s.guardianParticipantLinks.academyId, input.academyId),
        eq(s.guardianParticipantLinks.verificationStatus, "VERIFIED"),
      )))[0];
      if (!link) return { kind: "DENIED" as const, reason: "이 원생과 검증된 보호자 연결이 없어요" };
      const owners = await tx.select().from(s.academyMemberships).where(and(
        eq(s.academyMemberships.academyId, input.academyId),
        eq(s.academyMemberships.status, "ACTIVE"),
      ));
      const ownerIds = owners.filter((m) => m.roles.includes("OWNER")).map((m) => m.userId);
      if (ownerIds.length === 0) return { kind: "DENIED" as const, reason: "학원 원장 계정이 없어요" };
      const p = await tx.select().from(s.participants).where(eq(s.participants.id, input.participantId));
      members.push({ userId: input.actorUserId, role: "GUARDIAN" });
      ownerIds.forEach((id) => members.push({ userId: id, role: "OWNER" }));
      relatedParticipantId = input.participantId;
      title = `${p[0]?.name ?? "원생"} 보호자 1:1`;
    }

    /* 13차 C-5: 보호자 DM 의 정체성 = (보호자, 원생) — 원장 목록은 방 멤버십일 뿐
       방 정체성에 넣지 않는다(원장 증감 시 새 방 생성 방지). 코치 DM 은 양자 키. */
    const identity = input.type === "GUARDIAN_DM" ? [input.actorUserId] : members.map((m) => m.userId);
    const key = dmKey(input.type, identity, relatedParticipantId);
    const existing = await tx.select().from(s.chatRooms).where(and(
      eq(s.chatRooms.academyId, input.academyId), eq(s.chatRooms.dmKey, key),
    ));
    if (existing[0]) return { kind: "OK" as const, roomId: existing[0].id, created: false };

    const roomId = newId("cr");
    /* 13차 C P1-3: 동시 생성 경쟁 — UNIQUE 충돌을 500 이 아니라
       정상 find-or-create 로 수렴(onConflictDoNothing → 재조회) */
    const inserted = await tx.insert(s.chatRooms).values({
      id: roomId, academyId: input.academyId, type: input.type, title, dmKey: key,
      relatedParticipantId, createdByUserId: input.actorUserId, createdAt: nowISO,
    }).onConflictDoNothing({ target: [s.chatRooms.academyId, s.chatRooms.dmKey] }).returning();
    if (!inserted[0]) {
      const raced = await tx.select().from(s.chatRooms).where(and(
        eq(s.chatRooms.academyId, input.academyId), eq(s.chatRooms.dmKey, key),
      ));
      if (raced[0]) return { kind: "OK" as const, roomId: raced[0].id, created: false };
      return { kind: "DENIED" as const, reason: "방 생성 경쟁 실패 — 재시도 필요" };
    }
    await tx.insert(s.chatRoomMembers).values(members.map((m) => ({
      id: newId("crm"), roomId, academyId: input.academyId,
      userId: m.userId, role: m.role, joinedAt: nowISO,
    })));
    await recordAudit(tx, {
      academyId: input.academyId, actorUserId: input.actorUserId,
      actorRole: members.find((m) => m.userId === input.actorUserId)?.role ?? "MEMBER",
      action: "chat.room.created", targetType: "ChatRoom", targetId: roomId,
      detail: { type: input.type, memberCount: members.length }, success: true,
    }, nowISO);
    return { kind: "OK" as const, roomId, created: true };
  });
}

/* ── 메시지 발신 — 카테고리 규칙 + ACK 수명주기 시작 ── */
export type PostMessageResult =
  | { kind: "OK"; messageId: string; status: ChatMessageStatus }
  | { kind: "FORBIDDEN"; reason: string }
  | { kind: "INVALID"; reason: string };

export async function postMessage(db: Db, input: {
  actorUserId: string;
  actorRoles: readonly string[];
  academyId: string;
  roomId: string;
  msgKind: ChatMessageKind;
  category: ChatCategory;
  body: string;
  invoiceId?: string;          // 13차 C P0-1: BILLING = 참조만 — 카드는 서버가 생성
  relatedParticipantId?: string;
  clientMessageId?: string;    // 13차 C P1-5: 전송 멱등(모바일 재시도)
}, nowISO: string): Promise<PostMessageResult> {
  return db.transaction(async (tx) => {
    const room = (await tx.select().from(s.chatRooms).where(and(
      eq(s.chatRooms.id, input.roomId), eq(s.chatRooms.academyId, input.academyId),
    )))[0];
    if (!room) return { kind: "FORBIDDEN" as const, reason: "방 없음(학원 불일치 포함)" };
    const member = await activeMember(tx, room.id, input.actorUserId);
    if (!member) return { kind: "FORBIDDEN" as const, reason: "방 멤버가 아니에요(퇴장 포함)" };
    if (!canPostToRoom({ roomType: room.type, senderRoles: input.actorRoles })) {
      return { kind: "FORBIDDEN" as const, reason: "공지형 학원방은 학원만 발송 — 보호자는 질문 thread" };
    }

    /* 13차 C P1-5: 전송 멱등 — 같은 clientMessageId 재시도 = 기존 메시지 반환 */
    if (input.clientMessageId) {
      const dup = (await tx.select().from(s.chatMessages).where(and(
        eq(s.chatMessages.academyId, input.academyId),
        eq(s.chatMessages.senderUserId, input.actorUserId),
        eq(s.chatMessages.clientMessageId, input.clientMessageId),
      )))[0];
      if (dup) return { kind: "OK" as const, messageId: dup.id, status: dup.status as ChatMessageStatus };
    }

    /* 13차 C P0-2: 방 원생 ≠ 메시지 원생 금지 — 방 컨텍스트가 정본.
       원생 방(GUARDIAN_DM)에서는 클라이언트 override 를 아예 거부. */
    let related: string | null;
    if (room.relatedParticipantId) {
      if (input.relatedParticipantId && input.relatedParticipantId !== room.relatedParticipantId) {
        return { kind: "INVALID" as const, reason: "메시지 원생이 방 원생과 불일치 — 방 컨텍스트가 정본" };
      }
      related = room.relatedParticipantId;
    } else {
      related = input.relatedParticipantId ?? null;
    }

    /* 13차 C P0-1: BILLING 카드 = 서버 생성. 클라이언트는 invoiceId 참조만.
       검증: 청구서 존재·학원 일치·방 원생 일치 · 발신 보호자는 canPay(원장/데스크는 역할). */
    let serverCard: string | null = null;
    if (input.category === "BILLING") {
      if (!input.invoiceId) {
        return { kind: "INVALID" as const, reason: "금액은 invoiceId 참조로만 — 카드는 서버가 청구서에서 생성" };
      }
      const inv = (await tx.select().from(s.invoices).where(and(
        eq(s.invoices.id, input.invoiceId), eq(s.invoices.academyId, input.academyId),
      )))[0];
      if (!inv) return { kind: "INVALID" as const, reason: "청구서 없음(학원 불일치 포함)" };
      if (!related || inv.participantId !== related) {
        return { kind: "INVALID" as const, reason: "이 방 원생의 청구서가 아님" };
      }
      const staff = input.actorRoles.includes("OWNER") || input.actorRoles.includes("DESK");
      if (!staff) {
        const gd = (await tx.select().from(s.guardians).where(eq(s.guardians.userId, input.actorUserId)))[0];
        const link = gd && (await tx.select().from(s.guardianParticipantLinks).where(and(
          eq(s.guardianParticipantLinks.guardianId, gd.id),
          eq(s.guardianParticipantLinks.participantId, related),
          eq(s.guardianParticipantLinks.academyId, input.academyId),
        )))[0];
        if (!link?.canPay) {
          return { kind: "FORBIDDEN" as const, reason: "금액정보는 결제 권한(canPay) 보호자·학원만" };
        }
      }
      serverCard = JSON.stringify({
        invoiceId: inv.id, total: inv.total, status: inv.status, dueDate: inv.dueDate,
      }); // DB 정본에서 생성 — 클라이언트 금액 위조 불가
    }

    /* 13차 C P0-3(1차): HEALTH — 방의 보호자 전원이 canViewHealthInfo 여야 전송 가능.
       (코치 담당 ClassAssignment 검증은 출결 배치에서 테이블 신설과 함께 — docs/12 잔여) */
    if (input.category === "HEALTH" && related) {
      const guardianMembers = (await tx.select().from(s.chatRoomMembers).where(and(
        eq(s.chatRoomMembers.roomId, room.id), isNull(s.chatRoomMembers.leftAt),
      ))).filter((m) => m.role === "GUARDIAN");
      for (const gm of guardianMembers) {
        const gd = (await tx.select().from(s.guardians).where(eq(s.guardians.userId, gm.userId)))[0];
        const link = gd && (await tx.select().from(s.guardianParticipantLinks).where(and(
          eq(s.guardianParticipantLinks.guardianId, gd.id),
          eq(s.guardianParticipantLinks.participantId, related),
          eq(s.guardianParticipantLinks.academyId, input.academyId),
        )))[0];
        if (!link?.canViewHealthInfo) {
          return { kind: "INVALID" as const, reason: "건강정보 열람 권한(canViewHealthInfo) 없는 보호자가 있는 방 — 전송 불가" };
        }
      }
    }

    const v = validateChatCategory({
      category: input.category, roomType: room.type,
      relatedParticipantId: related, hasContextCard: !!serverCard,
    });
    if (!v.ok) return { kind: "INVALID" as const, reason: v.reason };

    const messageId = newId("cm");
    const status: ChatMessageStatus = "SENT";
    await tx.insert(s.chatMessages).values({
      id: messageId, roomId: room.id, academyId: input.academyId,
      senderUserId: input.actorUserId, kind: input.msgKind, category: input.category,
      status, body: input.body, contextCard: serverCard,
      relatedParticipantId: related, clientMessageId: input.clientMessageId ?? null,
      createdAt: nowISO,
    });
    // 수신자 ack 행 — READ ≠ ACKNOWLEDGED 를 행 단위로 기록
    const others = await tx.select().from(s.chatRoomMembers).where(and(
      eq(s.chatRoomMembers.roomId, room.id), isNull(s.chatRoomMembers.leftAt),
    ));
    const recipients = others.filter((m) => m.userId !== input.actorUserId);
    if (recipients.length) {
      await tx.insert(s.chatMessageAcks).values(recipients.map((m) => ({
        id: newId("ack"), messageId, academyId: input.academyId, userId: m.userId,
      })));
    }
    /* 13차 C: 발송은 전부 감사(docs/12 계약 — 본문 원문은 감사에 미포함) */
    await recordAudit(tx, {
      academyId: input.academyId, actorUserId: input.actorUserId, actorRole: member.role,
      action: "chat.message.sent", targetType: "ChatMessage", targetId: messageId,
      detail: { kind: input.msgKind, category: input.category, roomType: room.type,
        relatedParticipantId: related ?? undefined },
      success: true,
    }, nowISO);
    await recordOutbox(tx, {
      academyId: input.academyId, eventType: "CHAT_MESSAGE_SENT",
      payload: { messageId, roomId: room.id, kind: input.msgKind, category: input.category },
    }, nowISO);
    return { kind: "OK" as const, messageId, status };
  });
}

/* ── 읽음/확인/처리 — 3단계 분리. 확인·처리는 감사 기록 ── */
export type AckResult =
  | { kind: "OK"; status: ChatMessageStatus }
  | { kind: "FORBIDDEN"; reason: string }
  | { kind: "CONFLICT"; reason: string };

async function loadMessage(tx: Tx, academyId: string, messageId: string) {
  return (await tx.select().from(s.chatMessages).where(and(
    eq(s.chatMessages.id, messageId), eq(s.chatMessages.academyId, academyId),
  )))[0];
}

export async function markRead(db: Db, input: {
  actorUserId: string; academyId: string; messageId: string;
}, nowISO: string): Promise<AckResult> {
  return db.transaction(async (tx) => {
    const msg = await loadMessage(tx, input.academyId, input.messageId);
    if (!msg) return { kind: "FORBIDDEN" as const, reason: "메시지 없음" };
    const member = await activeMember(tx, msg.roomId, input.actorUserId);
    if (!member) return { kind: "FORBIDDEN" as const, reason: "방 멤버가 아니에요" };
    /* 13차 C P1-2: 발신자의 자기 read = 멱등 no-op — 메시지 상태를 바꾸지 않는다 */
    if (msg.senderUserId === input.actorUserId) {
      return { kind: "OK" as const, status: msg.status as ChatMessageStatus };
    }
    await tx.update(s.chatMessageAcks).set({ readAt: nowISO }).where(and(
      eq(s.chatMessageAcks.messageId, msg.id),
      eq(s.chatMessageAcks.userId, input.actorUserId),
      isNull(s.chatMessageAcks.readAt),
    ));
    await tx.update(s.chatRoomMembers).set({ lastReadAt: nowISO })
      .where(eq(s.chatRoomMembers.id, member.id));
    // 읽음은 ACK 아님 — requiresAck 메시지는 READ 까지만 전진
    let status = msg.status as ChatMessageStatus;
    if (canTransitionChatStatus(status, "READ")) {
      status = "READ";
      await tx.update(s.chatMessages).set({ status }).where(eq(s.chatMessages.id, msg.id));
    }
    return { kind: "OK" as const, status };
  });
}

export async function acknowledge(db: Db, input: {
  actorUserId: string; academyId: string; messageId: string;
}, nowISO: string): Promise<AckResult> {
  return db.transaction(async (tx) => {
    /* 13차 C P1-4: message row FOR UPDATE — 다인방 동시 ACK 에서 pending 집계
       경쟁 직렬화(둘 다 "1명 남음"을 읽고 둘 다 READ 에 머무는 문제 차단) */
    const msg = (await tx.select().from(s.chatMessages).where(and(
      eq(s.chatMessages.id, input.messageId), eq(s.chatMessages.academyId, input.academyId),
    )).for("update"))[0];
    if (!msg) return { kind: "FORBIDDEN" as const, reason: "메시지 없음" };
    if (!requiresAck(msg.kind as ChatMessageKind)) {
      return { kind: "CONFLICT" as const, reason: "확인 수명주기가 없는 메시지" };
    }
    const member = await activeMember(tx, msg.roomId, input.actorUserId);
    if (!member) return { kind: "FORBIDDEN" as const, reason: "방 멤버가 아니에요" };
    if (msg.senderUserId === input.actorUserId) {
      return { kind: "CONFLICT" as const, reason: "발신자는 자기 메시지를 확인 처리할 수 없어요" };
    }
    /* 13차 C-12: 같은 사용자의 중복 ACK = 멱등 성공(모바일 응답 유실 재시도) */
    const myAck = (await tx.select().from(s.chatMessageAcks).where(and(
      eq(s.chatMessageAcks.messageId, msg.id),
      eq(s.chatMessageAcks.userId, input.actorUserId),
    )))[0];
    if (myAck?.acknowledgedAt) {
      return { kind: "OK" as const, status: msg.status as ChatMessageStatus };
    }
    const cur = msg.status as ChatMessageStatus;
    if (!canTransitionChatStatus(cur, "ACKNOWLEDGED") && cur !== "SENT" && cur !== "DELIVERED") {
      return { kind: "CONFLICT" as const, reason: `현재 상태(${cur})에서 확인 불가` };
    }
    await tx.update(s.chatMessageAcks).set({ readAt: nowISO, acknowledgedAt: nowISO }).where(and(
      eq(s.chatMessageAcks.messageId, msg.id),
      eq(s.chatMessageAcks.userId, input.actorUserId),
    ));
    // 전 수신자 확인 시 메시지 상태 ACKNOWLEDGED (DM 은 즉시)
    const pending = await tx.select({ n: sql<number>`count(*)::int` }).from(s.chatMessageAcks)
      .where(and(eq(s.chatMessageAcks.messageId, msg.id), isNull(s.chatMessageAcks.acknowledgedAt)));
    let status: ChatMessageStatus = cur === "SENT" || cur === "DELIVERED" ? "READ" : cur;
    if ((pending[0]?.n ?? 0) === 0) {
      status = "ACKNOWLEDGED";
      await tx.update(s.chatMessages).set({ status }).where(eq(s.chatMessages.id, msg.id));
    } else if (status !== cur) {
      await tx.update(s.chatMessages).set({ status }).where(eq(s.chatMessages.id, msg.id));
    }
    await recordAudit(tx, {
      academyId: input.academyId, actorUserId: input.actorUserId, actorRole: member.role,
      action: "chat.message.acknowledged", targetType: "ChatMessage", targetId: msg.id,
      detail: { at: nowISO }, success: true,
    }, nowISO);
    return { kind: "OK" as const, status };
  });
}

export async function resolveMessage(db: Db, input: {
  actorUserId: string; academyId: string; messageId: string; note: string;
}, nowISO: string): Promise<AckResult> {
  return db.transaction(async (tx) => {
    const msg = await loadMessage(tx, input.academyId, input.messageId);
    if (!msg) return { kind: "FORBIDDEN" as const, reason: "메시지 없음" };
    const member = await activeMember(tx, msg.roomId, input.actorUserId);
    if (!member) return { kind: "FORBIDDEN" as const, reason: "방 멤버가 아니에요" };
    if (!canTransitionChatStatus(msg.status as ChatMessageStatus, "RESOLVED")) {
      return { kind: "CONFLICT" as const, reason: "확인(ACKNOWLEDGED) 후에만 처리 완료할 수 있어요" };
    }
    await tx.update(s.chatMessages).set({
      status: "RESOLVED", resolvedNote: input.note, resolvedAt: nowISO,
    }).where(eq(s.chatMessages.id, msg.id));
    await recordAudit(tx, {
      academyId: input.academyId, actorUserId: input.actorUserId, actorRole: member.role,
      action: "chat.message.resolved", targetType: "ChatMessage", targetId: msg.id,
      detail: { at: nowISO }, success: true, // note 원문은 메시지 행에 — 감사엔 사실만
    }, nowISO);
    return { kind: "OK" as const, status: "RESOLVED" };
  });
}

/* ── 조회 — 내 방 목록(+미확인 수) · 방 메시지 ── */
export async function listRooms(db: Db, input: { actorUserId: string; academyId: string }) {
  const rooms = await db.select({
    roomId: s.chatRooms.id, type: s.chatRooms.type, title: s.chatRooms.title,
    lastReadAt: s.chatRoomMembers.lastReadAt,
  }).from(s.chatRoomMembers)
    .innerJoin(s.chatRooms, eq(s.chatRoomMembers.roomId, s.chatRooms.id))
    .where(and(
      eq(s.chatRoomMembers.userId, input.actorUserId),
      eq(s.chatRoomMembers.academyId, input.academyId),
      isNull(s.chatRoomMembers.leftAt),
    ));
  const unacked = await db.select({
    roomId: s.chatMessages.roomId, n: sql<number>`count(*)::int`,
  }).from(s.chatMessageAcks)
    .innerJoin(s.chatMessages, eq(s.chatMessageAcks.messageId, s.chatMessages.id))
    .where(and(
      eq(s.chatMessageAcks.userId, input.actorUserId),
      eq(s.chatMessageAcks.academyId, input.academyId),
      isNull(s.chatMessageAcks.acknowledgedAt),
      sql`${s.chatMessages.kind} IN ('ACK_REQUIRED','URGENT_ACK_REQUIRED','OPERATIONAL_TASK')`,
      sql`${s.chatMessages.status} NOT IN ('CANCELLED','RESOLVED')`,
    ))
    .groupBy(s.chatMessages.roomId);
  const unackedBy = new Map(unacked.map((u) => [u.roomId, u.n]));
  return rooms.map((r) => ({ ...r, unacked: unackedBy.get(r.roomId) ?? 0 }));
}

export async function listMessages(db: Db, input: {
  actorUserId: string; academyId: string; roomId: string;
}, nowISO: string) {
  return db.transaction(async (tx) => {
    const member = await activeMember(tx, input.roomId, input.actorUserId);
    if (!member) return null;
    const msgs = await tx.select().from(s.chatMessages).where(and(
      eq(s.chatMessages.roomId, input.roomId),
      eq(s.chatMessages.academyId, input.academyId),
    )).orderBy(asc(s.chatMessages.createdAt), asc(s.chatMessages.id)); // 동률 안정 정렬

    /* 13차 C P0-3(조회 재인가): 보호자는 조회 시점에도 canViewHealthInfo 를
       재확인 — 권한이 철회됐으면 HEALTH 본문·카드를 가림(멤버십은 유지) */
    let healthAllowed = true;
    if (member.role === "GUARDIAN" && msgs.some((m) => m.category === "HEALTH")) {
      const gd = (await tx.select().from(s.guardians).where(eq(s.guardians.userId, input.actorUserId)))[0];
      const pid = msgs.find((m) => m.category === "HEALTH")?.relatedParticipantId;
      const link = gd && pid ? (await tx.select().from(s.guardianParticipantLinks).where(and(
        eq(s.guardianParticipantLinks.guardianId, gd.id),
        eq(s.guardianParticipantLinks.participantId, pid),
        eq(s.guardianParticipantLinks.academyId, input.academyId),
      )))[0] : undefined;
      healthAllowed = !!link?.canViewHealthInfo;
    }

    /* 13차 C P0-4: 민감(BILLING·HEALTH) 메시지 열람 = 서버 감사 행
       (UI 시스템 메시지가 아니라 AuditLog — 원장 포함 전 역할) */
    const sensitive = msgs.filter((m) => m.category !== "GENERAL" && !m.deletedAt);
    if (sensitive.length > 0) {
      await recordAudit(tx, {
        academyId: input.academyId, actorUserId: input.actorUserId, actorRole: member.role,
        action: "chat.sensitive_message.viewed", targetType: "ChatRoom", targetId: input.roomId,
        detail: {
          count: sensitive.length,
          categories: [...new Set(sensitive.map((m) => m.category))],
        },
        success: true,
      }, nowISO);
    }

    return msgs.map((m) => {
      const redactHealth = m.category === "HEALTH" && !healthAllowed;
      return {
        messageId: m.id, senderUserId: m.senderUserId, kind: m.kind, category: m.category,
        status: m.status,
        body: m.deletedAt ? "(삭제된 메시지 — 원문 보존)"
          : redactHealth ? "(건강정보 — 열람 권한이 없어요)" : m.body,
        contextCard: redactHealth ? null : m.contextCard,
        relatedParticipantId: m.relatedParticipantId,
        resolvedNote: m.resolvedNote, createdAt: m.createdAt,
      };
    });
  });
}
