/* 보호자 온보딩 실연결 (2026-07-19 · 슬라이스 A) — 모델:
   초대코드로 학원 진입 → 휴대폰 본인인증(세션) → 부모가 아이 직접 등록.
   ⚠️ 학원 선등록 원생을 "매칭"하지 않는다(부모가 participant 생성).
   ⚠️ SMS/PASS 는 스텁(dev 가 코드 반환) — verifyOtp 가 검증 세션을 실제 DB 기록.
   docs/design/guardian-zem-benchmark.md §6. */
import { and, eq, isNull } from "drizzle-orm";
import { schema as s } from "@pacefolio/db";
import { newId } from "../crypto";
import { hashPhone, encryptPii, hashPii } from "../crypto-pii";
import { recordAudit } from "../audit";
import type { Db } from "../sessions/service";

export type RelationshipType = "MOTHER" | "FATHER" | "GRANDPARENT" | "LEGAL_GUARDIAN" | "OTHER";

/* 코드 정규화 — 공백 제거·대문자(seed 와 동일 규약) */
export function normalizeInviteCode(raw: string): string {
  return raw.replace(/\s/g, "").toUpperCase();
}

function ageLabelFrom(birth: string, nowISO: string): string {
  const b = new Date(`${birth}T00:00:00Z`);
  const n = new Date(nowISO);
  let age = n.getUTCFullYear() - b.getUTCFullYear();
  const m = n.getUTCMonth() - b.getUTCMonth();
  if (m < 0 || (m === 0 && n.getUTCDate() < b.getUTCDate())) age -= 1;
  return `만 ${Math.max(0, age)}세`;
}

/* ── 초대코드 → 학원·프로그램 ── */
export interface ResolvedInvite {
  academyId: string;
  academyName: string;
  themeColor: string;
  programs: { id: string; label: string; hint?: string }[];
}

export async function resolveInviteCode(db: Db, rawCode: string, nowISO: string): Promise<ResolvedInvite | null> {
  const code = normalizeInviteCode(rawCode);
  if (code.length < 4) return null;
  const rows = await db.select().from(s.academyInviteCodes)
    .where(eq(s.academyInviteCodes.codeHash, hashPii(code)));
  const inv = rows[0];
  if (!inv || inv.revokedAt) return null;
  if (inv.expiresAt && Date.parse(inv.expiresAt) < Date.parse(nowISO)) return null;
  const acs = await db.select().from(s.academies).where(eq(s.academies.id, inv.academyId));
  const ac = acs[0];
  if (!ac || ac.suspendedAt) return null;
  const progs = await db.select().from(s.programs)
    .where(and(eq(s.programs.academyId, inv.academyId), isNull(s.programs.archivedAt)));
  return {
    academyId: ac.id, academyName: ac.name, themeColor: ac.themeColor,
    programs: progs.map((p) => ({ id: p.id, label: p.name, hint: p.targetAgeLabel ?? undefined })),
  };
}

/* ── 휴대폰 본인인증 세션 발급 (verifyOtp 성공 시) ──
   ⚠️ 실 SMS OTP 는 미연동 — 코드 검증(발송된 코드 대조)은 실서비스에서 challenge 저장 후.
   여기선 "검증 통과된 전화" 세션만 실제 DB 기록(gvs). */
export async function createVerifiedPhoneSession(
  db: Db, args: { userId: string; phone: string }, nowISO: string,
): Promise<{ verificationSessionId: string; expiresAt: string }> {
  const digits = args.phone.replace(/[^0-9]/g, "");
  const id = newId("gvs");
  const expiresAt = new Date(Date.parse(nowISO) + 10 * 60_000).toISOString();
  await db.insert(s.guardianVerificationSessions).values({
    id, issuedToUserId: args.userId, purpose: "GUARDIAN_LINK",
    verifiedPhoneHash: hashPhone(digits), verifiedPhoneEnc: encryptPii(digits),
    verifiedAt: nowISO, expiresAt,
  });
  return { verificationSessionId: id, expiresAt };
}

/* ── 부모 주도 아이 등록 → participant + guardian link 생성 ── */
export interface SelfRegisterInput {
  actorUserId: string;
  academyId: string;
  verificationSessionId: string;
  relationshipType: RelationshipType;
  consentPolicyVersion: string;
  consentAgreed: boolean;
  children: { name: string; birth: string; programId?: string }[];
}
export type SelfRegisterResult =
  | { kind: "OK"; children: { participantId: string; name: string; ageLabel: string }[] }
  | { kind: "INVALID"; reason: string }
  | { kind: "CONFLICT"; reason: string };

export async function selfRegisterGuardianChildren(
  db: Db, input: SelfRegisterInput, nowISO: string,
): Promise<SelfRegisterResult> {
  if (!input.consentAgreed) return { kind: "INVALID", reason: "필수 동의가 필요해요" };
  if (input.children.length === 0) return { kind: "INVALID", reason: "아이를 한 명 이상 등록해 주세요" };

  return db.transaction(async (tx) => {
    // 1) 본인인증 세션 검증(actor 귀속·미소비·미만료)
    const sesRows = await tx.select().from(s.guardianVerificationSessions)
      .where(eq(s.guardianVerificationSessions.id, input.verificationSessionId));
    const ses = sesRows[0];
    if (!ses || ses.issuedToUserId !== input.actorUserId || ses.purpose !== "GUARDIAN_LINK") {
      return { kind: "INVALID", reason: "본인인증이 필요해요" };
    }
    if (ses.consumedAt) return { kind: "CONFLICT", reason: "이미 사용된 인증이에요" };
    if (Date.parse(ses.expiresAt) < Date.parse(nowISO)) return { kind: "INVALID", reason: "인증이 만료됐어요. 다시 인증해 주세요" };

    // 2) 학원 존재·활성
    const acs = await tx.select().from(s.academies).where(eq(s.academies.id, input.academyId));
    if (!acs[0] || acs[0].suspendedAt) return { kind: "INVALID", reason: "학원을 확인할 수 없어요" };

    // 3) GUARDIAN 멤버십 보장(초대코드 상환 = 학원 소속)
    const mrows = await tx.select().from(s.academyMemberships)
      .where(and(eq(s.academyMemberships.userId, input.actorUserId), eq(s.academyMemberships.academyId, input.academyId)));
    const mem = mrows[0];
    if (!mem) {
      await tx.insert(s.academyMemberships).values({
        id: newId("m"), userId: input.actorUserId, academyId: input.academyId,
        roles: ["GUARDIAN"], status: "ACTIVE", joinedAt: nowISO.slice(0, 10),
      });
    } else if (!mem.roles.includes("GUARDIAN") || mem.status !== "ACTIVE") {
      const roles = mem.roles.includes("GUARDIAN") ? mem.roles : [...mem.roles, "GUARDIAN" as const];
      await tx.update(s.academyMemberships).set({ roles, status: "ACTIVE", updatedAt: nowISO })
        .where(eq(s.academyMemberships.id, mem.id));
    }

    // 4) guardian 행 보장(1:1 user)
    const grows = await tx.select().from(s.guardians).where(eq(s.guardians.userId, input.actorUserId));
    let guardianId = grows[0]?.id;
    if (!guardianId) {
      guardianId = newId("gd");
      await tx.insert(s.guardians).values({ id: guardianId, userId: input.actorUserId, createdAt: nowISO });
    }

    // 5) 프로그램 유효성(선택된 programId 가 이 학원 것인지)
    const progRows = await tx.select().from(s.programs).where(eq(s.programs.academyId, input.academyId));
    const progIds = new Set(progRows.map((p) => p.id));

    // 6) 아이별 participant + guardian link
    const created: { participantId: string; name: string; ageLabel: string }[] = [];
    let firstLinkId: string | undefined;
    for (const child of input.children) {
      const name = child.name.trim();
      if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(child.birth)) return { kind: "INVALID", reason: "아이 정보를 확인해 주세요" };
      if (child.programId && !progIds.has(child.programId)) return { kind: "INVALID", reason: "프로그램을 확인해 주세요" };
      const ageLabel = ageLabelFrom(child.birth, nowISO);
      const participantId = newId("p");
      await tx.insert(s.participants).values({
        id: participantId, academyId: input.academyId, name, birth: child.birth,
        ageLabel, status: "TRIAL", statusChangedAt: nowISO,
      });
      const linkId = newId("gl");
      if (!firstLinkId) firstLinkId = linkId;
      await tx.insert(s.guardianParticipantLinks).values({
        id: linkId, guardianId, participantId, academyId: input.academyId,
        relationshipType: input.relationshipType, isPrimaryGuardian: true,
        verificationStatus: "VERIFIED",
        canViewSchedule: true, canViewAttendance: true, canViewHealthInfo: true,
        canReceivePhotos: true, canPay: true, canRequestRefund: true,
      });
      await recordAudit(tx, {
        academyId: input.academyId, actorUserId: input.actorUserId, actorRole: "GUARDIAN",
        action: "guardian.self_register", targetType: "Participant", targetId: participantId,
        reason: "SELF_REGISTER", detail: { programId: child.programId ?? null, linkId }, success: true,
      }, nowISO);
      created.push({ participantId, name, ageLabel });
    }

    // 7) 본인인증 세션 1회 소비(원자적 — 동시 등록 방지)
    const consumed = await tx.update(s.guardianVerificationSessions)
      .set({ consumedAt: nowISO, consumedByLinkId: firstLinkId })
      .where(and(
        eq(s.guardianVerificationSessions.id, input.verificationSessionId),
        isNull(s.guardianVerificationSessions.consumedAt),
      ))
      .returning();
    if (!consumed[0]) throw new Error("OTP_SESSION_ALREADY_CONSUMED"); // race loser → route 409

    return { kind: "OK", children: created };
  });
}
