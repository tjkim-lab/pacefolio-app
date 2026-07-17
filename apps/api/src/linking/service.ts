/* 보호자-자녀 연결 vertical slice (R5 Phase 4 · docs/11 §C·§D)
   판정 = 도메인 evaluateLink(순수) / 원자성 = 이 트랜잭션이 강제:
     OTP 1회 소비 = 조건부 UPDATE(consumed_at IS NULL) — 동시 요청 중 1개만
     invite 소비 = redemption COUNT(정본) 검사 + UNIQUE(invite,guardian,participant)
     GuardianLink 생성·OTP 소비·redemption 이 전부 같은 tx — 실패 시 전체 rollback */
import { and, eq, isNull, sql } from "drizzle-orm";
import { schema as s } from "@pacefolio/db";
import {
  evaluateLink, normalizePhone,
  type LinkRequest, type LinkContext, type GuardianVerificationSession,
  type GuardianInvite, type RegisteredGuardianContact, type Participant,
  asId,
} from "@pacefolio/domain";
import { sha256Hex, newId } from "../crypto";
import { recordAudit, recordOutbox } from "../audit";
import type { Db } from "../sessions/service";

export interface LinkSliceInput {
  actorUserId: string;
  academyId: string;
  verificationSessionId: string;
  childName: string;
  childBirth: string;      // YYYY-MM-DD
  relationshipType: LinkRequest["relationshipType"];
  consentPolicyVersion: string;
  consentAgreed: boolean;
  academyInviteCode?: string;
}

export interface LinkSliceResult {
  status: "VERIFIED" | "PENDING" | "REJECTED";
  linkId?: string;
  participantId?: string;
  reason?: string;
}

export async function requestGuardianLink(
  db: Db,
  input: LinkSliceInput,
  nowISO: string,
): Promise<LinkSliceResult> {
  return db.transaction(async (tx) => {
    /* 1~3) 컨텍스트 조회 — OTP 세션·후보 원생·선등록 연락처·invite */
    const sesRows = await tx.select().from(s.guardianVerificationSessions)
      .where(eq(s.guardianVerificationSessions.id, input.verificationSessionId));
    const sesRow = sesRows[0];

    const participantRows = await tx.select().from(s.participants)
      .where(eq(s.participants.academyId, input.academyId));
    const contactRows = await tx.select().from(s.registeredGuardianContacts)
      .where(eq(s.registeredGuardianContacts.academyId, input.academyId));

    const requestCodeHash = input.academyInviteCode ? sha256Hex(input.academyInviteCode) : undefined;
    // ⚠️ FOR UPDATE — invite 행 잠금(R5 Phase 4 계약 1단계).
    // 없으면 동시 요청 둘 다 COUNT=0 을 읽고 둘 다 성공(보호자가 다르면
    // UNIQUE 도 못 막음) → maxUses 초과. 잠금으로 경쟁을 직렬화한다.
    const inviteRows = requestCodeHash
      ? await tx.select().from(s.guardianInvites)
          .where(eq(s.guardianInvites.codeHash, requestCodeHash)).for("update")
      : [];
    const inviteRow = inviteRows[0];

    /* 4) 도메인 순수 판정 — actor 귀속·목적·소비·만료·hash 결합·전화 결합 전부 */
    const session: GuardianVerificationSession | null = sesRow ? {
      id: asId(sesRow.id), issuedToUserId: asId(sesRow.issuedToUserId),
      purpose: sesRow.purpose as "GUARDIAN_LINK",
      verifiedPhone: sesRow.verifiedPhone, verifiedAt: sesRow.verifiedAt,
      expiresAt: sesRow.expiresAt, consumedAt: sesRow.consumedAt,
    } : null;
    const invite: GuardianInvite | null = inviteRow ? {
      codeHash: inviteRow.codeHash, academyId: asId(inviteRow.academyId),
      participantId: asId(inviteRow.participantId),
      intendedPhone: inviteRow.intendedPhone ?? undefined,
      expiresAt: inviteRow.expiresAt, maxUses: inviteRow.maxUses,
      usedCount: inviteRow.usedCount, revokedAt: inviteRow.revokedAt,
    } : null;
    const ctx: LinkContext = {
      actorUserId: asId(input.actorUserId),
      session,
      participants: participantRows.map((p): Participant => ({
        id: asId(p.id), academyId: asId(p.academyId), name: p.name, birth: p.birth, ageLabel: p.ageLabel,
      })),
      registeredContacts: contactRows.map((c): RegisteredGuardianContact => ({
        academyId: asId(c.academyId), participantId: asId(c.participantId), phone: c.phone,
      })),
      invite,
      requestCodeHash,
      nowISO,
    };
    const req: LinkRequest = {
      academyId: asId(input.academyId),
      verificationSessionId: asId(input.verificationSessionId),
      childName: input.childName, childBirth: input.childBirth,
      relationshipType: input.relationshipType,
      consentPolicyVersion: input.consentPolicyVersion, consentAgreed: input.consentAgreed,
      academyInviteCode: input.academyInviteCode,
    };
    const verdict = evaluateLink(req, ctx);
    if (verdict.status !== "VERIFIED" || !verdict.participantId) {
      return { status: verdict.status as LinkSliceResult["status"], reason: verdict.reason };
    }
    const participantId = verdict.participantId as string;
    const usedInvite = !!(input.academyInviteCode && invite &&
      invite.participantId === verdict.participantId);

    /* 5) invite 사용 시: 정본(redemption COUNT) 재검증 — usedCount 캐시 불신 (R5 §3.4) */
    if (usedInvite && inviteRow) {
      const cnt = await tx.select({ n: sql<number>`count(*)::int` })
        .from(s.guardianInviteRedemptions)
        .where(eq(s.guardianInviteRedemptions.inviteId, inviteRow.id));
      if ((cnt[0]?.n ?? 0) >= inviteRow.maxUses) {
        return { status: "PENDING", reason: "초대코드 사용 횟수 소진" };
      }
    }

    /* 6) guardian 확보(사용자당 1개 — UNIQUE) */
    const existingGd = await tx.select().from(s.guardians)
      .where(eq(s.guardians.userId, input.actorUserId));
    const guardianId = existingGd[0]?.id ?? newId("gd");
    if (!existingGd[0]) {
      await tx.insert(s.guardians).values({ id: guardianId, userId: input.actorUserId, createdAt: nowISO });
    }

    /* 7) GuardianLink 생성 — UNIQUE(guardian, participant, academy) 가 중복 차단.
       R7 P0-7 권한 정책:
       - 선등록 연락처 결합(원장이 직접 등록한 보호자) = 전체 권한
       - 초대코드 결합 = invite.allowedScopes 만(기본: 일정·출결 — 최소 권한)
       - Primary = 원생당 1명(partial unique) — 기존 primary 있으면 false */
    const scopes: readonly string[] = usedInvite && inviteRow
      ? inviteRow.allowedScopes
      : ["VIEW_SCHEDULE", "VIEW_ATTENDANCE", "VIEW_HEALTH_INFO", "RECEIVE_PHOTOS", "PAY", "REQUEST_REFUND"];
    const has = (sc: string) => scopes.includes(sc);
    const existingPrimary = await tx.select().from(s.guardianParticipantLinks)
      .where(and(
        eq(s.guardianParticipantLinks.participantId, participantId),
        eq(s.guardianParticipantLinks.isPrimaryGuardian, true),
      ));
    const linkId = newId("gl");
    await tx.insert(s.guardianParticipantLinks).values({
      id: linkId, guardianId, participantId, academyId: input.academyId,
      relationshipType: input.relationshipType,
      isPrimaryGuardian: existingPrimary.length === 0, // 첫 보호자만 primary
      verificationStatus: "VERIFIED",
      canViewSchedule: has("VIEW_SCHEDULE"),
      canViewAttendance: has("VIEW_ATTENDANCE"),
      canViewHealthInfo: has("VIEW_HEALTH_INFO"),
      canReceivePhotos: has("RECEIVE_PHOTOS"),
      canPay: has("PAY"),
      canRequestRefund: has("REQUEST_REFUND"),
      createdAt: nowISO, updatedAt: nowISO,
    });

    /* 8) OTP 세션 원자적 1회 소비 — 이미 소비됐으면 0행 → 전체 rollback */
    const consumed = await tx.update(s.guardianVerificationSessions)
      .set({ consumedAt: nowISO, consumedByLinkId: linkId })
      .where(and(
        eq(s.guardianVerificationSessions.id, input.verificationSessionId),
        isNull(s.guardianVerificationSessions.consumedAt),
      ))
      .returning();
    if (!consumed[0]) throw new Error("OTP_SESSION_ALREADY_CONSUMED"); // 동시 요청 경쟁 패자

    /* 9) invite 소비 기록(정본) + 캐시 갱신 — UNIQUE 위반 = 중복 소비 → rollback */
    if (usedInvite && inviteRow) {
      await tx.insert(s.guardianInviteRedemptions).values({
        id: newId("gir"), inviteId: inviteRow.id, academyId: input.academyId,
        guardianId, participantId,
        verificationSessionId: input.verificationSessionId, redeemedAt: nowISO,
      });
      await tx.update(s.guardianInvites)
        .set({ usedCount: sql`${s.guardianInvites.usedCount} + 1` })
        .where(eq(s.guardianInvites.id, inviteRow.id));
    }

    /* 10) AuditLog·Outbox — 같은 트랜잭션 (R7 §26: 보호자-원생 연결은 필수 감사 대상) */
    await recordAudit(tx, {
      academyId: input.academyId, actorUserId: input.actorUserId, actorRole: "GUARDIAN",
      action: "guardian_link.created", targetType: "GuardianParticipantLink", targetId: linkId,
      reason: usedInvite ? "INVITE_CODE" : "REGISTERED_CONTACT",
      detail: { participantId, viaInvite: usedInvite }, // 이름·전화 원문 미포함
      success: true,
    }, nowISO);
    await recordOutbox(tx, {
      academyId: input.academyId, eventType: "GUARDIAN_LINK_CREATED",
      payload: { linkId, guardianId, participantId },
    }, nowISO);
    return { status: "VERIFIED", linkId, participantId };
  });
}
