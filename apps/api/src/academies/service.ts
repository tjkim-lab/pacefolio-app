/* 학원 생성 + 직원 초대 — 기본선 3단계(#24).
   초대 수명주기(경쟁 벤치마크) = 기존 MEMBERSHIP_STATUS 활용:
   INVITED → (수락) ACTIVE → SUSPENDED/ENDED. 실 SMS 초대장은 사업자 연동 시 —
   v1 은 가입된 사용자 대상 초대(초대 코드 방식은 OTP 트랙과 함께). */
import { and, eq, sql } from "drizzle-orm";
import { schema as s } from "@pacefolio/db";
import { newId } from "../crypto";
import { recordAudit, recordOutbox } from "../audit";
import type { Db } from "../sessions/service";

export type AcademyResult =
  | { kind: "OK"; academyId: string }
  | { kind: "INVALID"; reason: string };

/** 학원 생성 — 생성자는 즉시 OWNER ACTIVE membership (원더짐 자동선택은 seed/demo 만) */
export async function createAcademy(db: Db, input: {
  actorUserId: string;
  name: string; ownerName: string;
  themeColor?: string; themeInk?: string; logoEmoji?: string;
  billingCycleDefault?: 1 | 3;
}, nowISO: string): Promise<AcademyResult> {
  return db.transaction(async (tx) => {
    const academyId = newId("a");
    await tx.insert(s.academies).values({
      id: academyId, organizationId: newId("o"), name: input.name,
      themeColor: input.themeColor ?? "#12B5A5", themeInk: input.themeInk ?? "#087F73",
      logoEmoji: input.logoEmoji ?? "🏫", ownerName: input.ownerName,
      billingCycleDefault: input.billingCycleDefault ?? 3,
      createdAt: nowISO, updatedAt: nowISO,
    });
    await tx.insert(s.academyMemberships).values({
      id: newId("m"), userId: input.actorUserId, academyId,
      roles: ["OWNER"], status: "ACTIVE", joinedAt: nowISO.slice(0, 10),
      createdAt: nowISO, updatedAt: nowISO,
    });
    await recordAudit(tx, {
      academyId, actorUserId: input.actorUserId, actorRole: "OWNER",
      action: "academy.created", targetType: "Academy", targetId: academyId,
      detail: { name: input.name }, success: true,
    }, nowISO);
    return { kind: "OK" as const, academyId };
  });
}

export type InviteResult =
  | { kind: "OK"; membershipId: string; status: string }
  | { kind: "FORBIDDEN"; reason: string }
  | { kind: "INVALID"; reason: string }
  | { kind: "CONFLICT"; reason: string };

/** 직원 초대 — INVITED membership 생성(가입 사용자 대상 · v1) */
export async function inviteMember(db: Db, input: {
  actorUserId: string; actorRoles: readonly string[]; academyId: string;
  targetUserId: string; roles: ("COACH" | "DESK" | "OWNER")[];
}, nowISO: string): Promise<InviteResult> {
  if (!input.actorRoles.includes("OWNER")) {
    return { kind: "FORBIDDEN", reason: "직원 초대는 원장만" };
  }
  return db.transaction(async (tx) => {
    const user = (await tx.select().from(s.users).where(eq(s.users.id, input.targetUserId)))[0];
    if (!user) return { kind: "INVALID" as const, reason: "대상 사용자 없음(미가입 초대는 SMS 트랙)" };
    const existing = (await tx.select().from(s.academyMemberships).where(and(
      eq(s.academyMemberships.userId, input.targetUserId),
      eq(s.academyMemberships.academyId, input.academyId),
    )))[0];
    if (existing) {
      if (existing.status === "INVITED") return { kind: "OK" as const, membershipId: existing.id, status: "INVITED" }; // 멱등
      return { kind: "CONFLICT" as const, reason: `이미 멤버(${existing.status})` };
    }
    const membershipId = newId("m");
    await tx.insert(s.academyMemberships).values({
      id: membershipId, userId: input.targetUserId, academyId: input.academyId,
      roles: input.roles, status: "INVITED", joinedAt: nowISO.slice(0, 10),
      createdAt: nowISO, updatedAt: nowISO,
    });
    await recordAudit(tx, {
      academyId: input.academyId, actorUserId: input.actorUserId, actorRole: "OWNER",
      action: "membership.invited", targetType: "AcademyMembership", targetId: membershipId,
      detail: { targetUserId: input.targetUserId, roles: input.roles }, success: true,
    }, nowISO);
    await recordOutbox(tx, {
      academyId: input.academyId, eventType: "MEMBER_INVITED",
      payload: { membershipId, targetUserId: input.targetUserId, roles: input.roles },
    }, nowISO);
    return { kind: "OK" as const, membershipId, status: "INVITED" };
  });
}

/** 초대 수락 — 본인만 INVITED→ACTIVE */
export async function acceptInvite(db: Db, input: {
  actorUserId: string; academyId: string;
}, nowISO: string): Promise<InviteResult> {
  return db.transaction(async (tx) => {
    const ms = (await tx.select().from(s.academyMemberships).where(and(
      eq(s.academyMemberships.userId, input.actorUserId),
      eq(s.academyMemberships.academyId, input.academyId),
    )).for("update"))[0];
    if (!ms) return { kind: "INVALID" as const, reason: "초대 없음" };
    if (ms.status === "ACTIVE") return { kind: "OK" as const, membershipId: ms.id, status: "ACTIVE" }; // 멱등
    if (ms.status !== "INVITED") return { kind: "CONFLICT" as const, reason: `수락 불가 상태: ${ms.status}` };
    await tx.update(s.academyMemberships).set({
      status: "ACTIVE", joinedAt: nowISO.slice(0, 10), updatedAt: nowISO,
      version: sql`${s.academyMemberships.version} + 1`,
    }).where(eq(s.academyMemberships.id, ms.id));
    await recordAudit(tx, {
      academyId: input.academyId, actorUserId: input.actorUserId,
      actorRole: ms.roles.join(","),
      action: "membership.accepted", targetType: "AcademyMembership", targetId: ms.id,
      detail: {}, success: true,
    }, nowISO);
    return { kind: "OK" as const, membershipId: ms.id, status: "ACTIVE" };
  });
}
