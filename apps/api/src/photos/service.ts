/* 사진 파이프라인 사전 코어 (#19) — 스토리지 사업자 결정과 무관한 전 로직
   ① 동의: 보호자(VERIFIED 링크)만 갱신·철회 — grants(목적×대상 쌍) 정본, If-Match(version)
   ② 업로드 의도: 담당 코치·staff → PENDING_UPLOAD + 어댑터 업로드 타깃
   ③ finalize: 등장 원생 태그 + canSendPhotoAsset(도메인 게이트) — 미동의 원생 있으면
      422 + 차단 명단("동의 없는 원생 제외"는 UI 문구가 아니라 서버 강제)
   ④ 열람: staff·업로더·보호자(자기 자녀 태그 + canReceivePhotos) — 보호자 열람 감사 */
import { and, eq, inArray } from "drizzle-orm";
import { schema as s } from "@pacefolio/db";
import {
  CONSENT_PURPOSE, CONSENT_AUDIENCE, canSendPhotoAsset,
  type ConsentPurpose, type ConsentAudience, type PhotoConsentRecord,
} from "@pacefolio/domain";
import { newId } from "../crypto";
import { recordAudit } from "../audit";
import type { Db } from "../sessions/service";
import type { StorageAdapter } from "../storage/adapter";

const isStaff = (roles: readonly string[]) =>
  roles.includes("OWNER") || roles.includes("MANAGER") || roles.includes("DESK");

type Grant = { purpose: ConsentPurpose; audience: ConsentAudience };

function validGrants(grants: unknown): grants is Grant[] {
  return Array.isArray(grants) && grants.length <= 24 && grants.every(
    (g) => g && typeof g === "object" &&
      CONSENT_PURPOSE.includes((g as Grant).purpose) &&
      CONSENT_AUDIENCE.includes((g as Grant).audience),
  );
}

/** 보호자의 VERIFIED 링크 조회 — 동의 갱신 자격의 정본 */
async function verifiedLink(tx: Db, userId: string, academyId: string, participantId: string) {
  const gd = (await tx.select().from(s.guardians).where(eq(s.guardians.userId, userId)))[0];
  if (!gd) return null;
  const link = (await tx.select().from(s.guardianParticipantLinks).where(and(
    eq(s.guardianParticipantLinks.guardianId, gd.id),
    eq(s.guardianParticipantLinks.participantId, participantId),
    eq(s.guardianParticipantLinks.academyId, academyId),
  )))[0];
  return link && link.verificationStatus === "VERIFIED" ? { guardianId: gd.id, link } : null;
}

export type ConsentResult =
  | { kind: "OK"; consentId: string; version: number }
  | { kind: "FORBIDDEN"; reason: string }
  | { kind: "INVALID"; reason: string }
  | { kind: "VERSION_CONFLICT"; currentVersion: number };

export async function upsertPhotoConsent(db: Db, input: {
  actorUserId: string; academyId: string; participantId: string;
  grants: unknown; policyVersion: string; channel: string;
  ifMatchVersion?: number; // If-Match — 동시 수정 방지(초안 계약)
}, nowISO: string): Promise<ConsentResult> {
  if (!validGrants(input.grants)) return { kind: "INVALID", reason: "grants 는 목적×대상 쌍 배열" };
  return db.transaction(async (tx) => {
    const v = await verifiedLink(tx, input.actorUserId, input.academyId, input.participantId);
    if (!v) return { kind: "FORBIDDEN" as const, reason: "VERIFIED 보호자만 동의를 갱신할 수 있어요" };
    const prev = (await tx.select().from(s.photoConsents).where(and(
      eq(s.photoConsents.academyId, input.academyId),
      eq(s.photoConsents.participantId, input.participantId),
    )).for("update"))[0];
    if (prev && input.ifMatchVersion !== undefined && prev.version !== input.ifMatchVersion) {
      return { kind: "VERSION_CONFLICT" as const, currentVersion: prev.version };
    }
    let consentId: string; let nextVersion: number;
    if (prev) {
      consentId = prev.id; nextVersion = prev.version + 1;
      await tx.update(s.photoConsents).set({
        guardianId: v.guardianId, policyVersion: input.policyVersion,
        grants: JSON.stringify(input.grants), channel: input.channel,
        consentedAt: nowISO, revokedAt: null, updatedAt: nowISO, version: nextVersion,
      }).where(eq(s.photoConsents.id, prev.id));
    } else {
      consentId = newId("pc"); nextVersion = 1;
      await tx.insert(s.photoConsents).values({
        id: consentId, academyId: input.academyId, participantId: input.participantId,
        guardianId: v.guardianId, policyVersion: input.policyVersion,
        grants: JSON.stringify(input.grants), channel: input.channel,
        consentedAt: nowISO, createdAt: nowISO, updatedAt: nowISO,
      });
    }
    await recordAudit(tx, {
      academyId: input.academyId, actorUserId: input.actorUserId, actorRole: "GUARDIAN",
      action: prev ? "photo_consent.updated" : "photo_consent.granted",
      targetType: "PhotoConsent", targetId: consentId,
      detail: { participantId: input.participantId, grantCount: (input.grants as Grant[]).length, policyVersion: input.policyVersion },
      success: true,
    }, nowISO);
    return { kind: "OK" as const, consentId, version: nextVersion };
  });
}

export async function revokePhotoConsent(db: Db, input: {
  actorUserId: string; academyId: string; participantId: string;
}, nowISO: string): Promise<ConsentResult> {
  return db.transaction(async (tx) => {
    const v = await verifiedLink(tx, input.actorUserId, input.academyId, input.participantId);
    if (!v) return { kind: "FORBIDDEN" as const, reason: "VERIFIED 보호자만 철회할 수 있어요" };
    const row = (await tx.select().from(s.photoConsents).where(and(
      eq(s.photoConsents.academyId, input.academyId),
      eq(s.photoConsents.participantId, input.participantId),
    )).for("update"))[0];
    if (!row) return { kind: "INVALID" as const, reason: "동의 기록 없음" };
    if (!row.revokedAt) {
      await tx.update(s.photoConsents).set({
        revokedAt: nowISO, updatedAt: nowISO, version: row.version + 1,
      }).where(eq(s.photoConsents.id, row.id));
      await recordAudit(tx, {
        academyId: input.academyId, actorUserId: input.actorUserId, actorRole: "GUARDIAN",
        action: "photo_consent.revoked", targetType: "PhotoConsent", targetId: row.id,
        detail: { participantId: input.participantId }, success: true,
      }, nowISO);
    }
    return { kind: "OK" as const, consentId: row.id, version: row.version + 1 }; // 멱등
  });
}

export async function getPhotoConsent(db: Db, input: {
  actorUserId: string; actorRoles: readonly string[]; academyId: string; participantId: string;
}) {
  // staff 또는 해당 원생의 VERIFIED 보호자만
  if (!isStaff(input.actorRoles)) {
    const v = await verifiedLink(db, input.actorUserId, input.academyId, input.participantId);
    if (!v) return null;
  }
  const row = (await db.select().from(s.photoConsents).where(and(
    eq(s.photoConsents.academyId, input.academyId),
    eq(s.photoConsents.participantId, input.participantId),
  )))[0];
  if (!row) return { exists: false as const };
  return {
    exists: true as const,
    consentId: row.id, participantId: row.participantId,
    grants: JSON.parse(row.grants) as Grant[],
    policyVersion: row.policyVersion, consentedAt: row.consentedAt,
    revokedAt: row.revokedAt, version: row.version,
  };
}

/* ── 사진 자산 ─────────────────────────────────────────── */

async function coachInCharge(tx: Db, coachUserId: string, academyId: string, participantIds: readonly string[]) {
  if (participantIds.length === 0) return true;
  const rows = await tx.select({ pid: s.dbEnrollments.participantId })
    .from(s.classAssignments)
    .innerJoin(s.dbEnrollments, eq(s.dbEnrollments.classId, s.classAssignments.classId))
    .where(and(
      eq(s.classAssignments.academyId, academyId),
      eq(s.classAssignments.coachUserId, coachUserId),
      eq(s.classAssignments.status, "ACTIVE"),
      eq(s.dbEnrollments.status, "ACTIVE"),
      inArray(s.dbEnrollments.participantId, [...participantIds]),
    ));
  const covered = new Set(rows.map((r) => r.pid));
  return participantIds.every((p) => covered.has(p));
}

export type PhotoResult =
  | { kind: "OK"; photoId: string }
  | { kind: "FORBIDDEN"; reason: string }
  | { kind: "INVALID"; reason: string }
  | { kind: "CONSENT_BLOCKED"; blockedParticipantIds: readonly string[] };

export async function createPhotoUpload(db: Db, storage: StorageAdapter, input: {
  actorUserId: string; actorRoles: readonly string[]; academyId: string;
  sessionId?: string; contentType: string; byteSize: number;
}, nowISO: string) {
  if (!isStaff(input.actorRoles) && !input.actorRoles.includes("COACH")) {
    return { kind: "FORBIDDEN" as const, reason: "사진 업로드는 코치·staff 만" };
  }
  if (!/^image\//.test(input.contentType)) return { kind: "INVALID" as const, reason: "이미지 타입만" };
  if (input.byteSize <= 0 || input.byteSize > 25 * 1024 * 1024) {
    return { kind: "INVALID" as const, reason: "크기 상한 25MB" };
  }
  return db.transaction(async (tx) => {
    if (input.sessionId) {
      const sess = (await tx.select({ id: s.classSessions.id }).from(s.classSessions).where(and(
        eq(s.classSessions.id, input.sessionId), eq(s.classSessions.academyId, input.academyId),
      )))[0];
      if (!sess) return { kind: "INVALID" as const, reason: "세션 없음" };
    }
    const photoId = newId("ph");
    const storageKey = `academies/${input.academyId}/photos/${photoId}`;
    await tx.insert(s.photoAssets).values({
      id: photoId, academyId: input.academyId, sessionId: input.sessionId,
      uploadedByUserId: input.actorUserId, storageKey,
      contentType: input.contentType, byteSize: input.byteSize,
      status: "PENDING_UPLOAD", createdAt: nowISO, updatedAt: nowISO,
    });
    const upload = await storage.createUploadTarget(storageKey, input.contentType, nowISO);
    await recordAudit(tx, {
      academyId: input.academyId, actorUserId: input.actorUserId, actorRole: "ACADEMY",
      action: "photo.upload_created", targetType: "PhotoAsset", targetId: photoId,
      detail: { byteSize: input.byteSize }, success: true,
    }, nowISO);
    return { kind: "UPLOAD" as const, photoId, upload };
  });
}

export async function finalizePhoto(db: Db, storage: StorageAdapter, input: {
  actorUserId: string; actorRoles: readonly string[]; academyId: string;
  photoId: string; participantIds: readonly string[];
  purpose: ConsentPurpose; audience: ConsentAudience;
}, nowISO: string): Promise<PhotoResult> {
  if (!CONSENT_PURPOSE.includes(input.purpose) || !CONSENT_AUDIENCE.includes(input.audience)) {
    return { kind: "INVALID", reason: "목적·대상 enum 밖" };
  }
  return db.transaction(async (tx) => {
    const photo = (await tx.select().from(s.photoAssets).where(and(
      eq(s.photoAssets.id, input.photoId), eq(s.photoAssets.academyId, input.academyId),
    )).for("update"))[0];
    if (!photo) return { kind: "INVALID" as const, reason: "사진 없음" };
    if (photo.uploadedByUserId !== input.actorUserId && !isStaff(input.actorRoles)) {
      return { kind: "FORBIDDEN" as const, reason: "업로더·staff 만 확정할 수 있어요" };
    }
    if (photo.status === "DELETED") return { kind: "INVALID" as const, reason: "삭제된 사진" };
    const pids = [...new Set(input.participantIds)];
    if (pids.length > 0) {
      const found = await tx.select({ id: s.participants.id }).from(s.participants).where(and(
        eq(s.participants.academyId, input.academyId), inArray(s.participants.id, pids),
      ));
      if (found.length !== pids.length) return { kind: "INVALID" as const, reason: "원생 불일치(학원 포함)" };
      if (!isStaff(input.actorRoles) && !(await coachInCharge(tx, input.actorUserId, input.academyId, pids))) {
        return { kind: "FORBIDDEN" as const, reason: "담당 원생만 태그할 수 있어요" };
      }
    }
    /* 동의 게이트 — 도메인 정본(canSendPhotoAsset): 등장 전원 유효 동의 필요 */
    const consentRows = pids.length > 0
      ? await tx.select().from(s.photoConsents).where(and(
          eq(s.photoConsents.academyId, input.academyId),
          inArray(s.photoConsents.participantId, pids),
        ))
      : [];
    /* DB 행 → 도메인 PhotoConsentRecord (branded ID 는 경계 캐스팅) */
    const consents = consentRows.map((r) => ({
      id: r.id, policyId: "policy", policyVersion: r.policyVersion,
      academyId: r.academyId, guardianId: r.guardianId, participantId: r.participantId,
      grants: JSON.parse(r.grants), consentedAt: r.consentedAt, channel: r.channel,
      revokedAt: r.revokedAt, expiresAt: r.expiresAt,
    })) as unknown as PhotoConsentRecord[];
    const decision = canSendPhotoAsset(
      { id: photo.id, academyId: input.academyId, depictedParticipantIds: pids } as unknown as Parameters<typeof canSendPhotoAsset>[0],
      consents, input.purpose, input.audience, nowISO,
    );
    if (!decision.allowed) {
      await recordAudit(tx, {
        academyId: input.academyId, actorUserId: input.actorUserId, actorRole: "ACADEMY",
        action: "photo.finalize_blocked", targetType: "PhotoAsset", targetId: photo.id,
        detail: { blocked: decision.blockedParticipantIds.length, purpose: input.purpose, audience: input.audience },
        success: false,
      }, nowISO);
      return { kind: "CONSENT_BLOCKED" as const, blockedParticipantIds: decision.blockedParticipantIds };
    }
    await tx.delete(s.photoAssetParticipants).where(eq(s.photoAssetParticipants.photoId, photo.id));
    if (pids.length > 0) {
      await tx.insert(s.photoAssetParticipants).values(pids.map((pid) => ({
        id: newId("pap"), photoId: photo.id, academyId: input.academyId, participantId: pid,
      })));
    }
    await tx.update(s.photoAssets).set({
      status: "UPLOADED", purpose: input.purpose, audience: input.audience,
      updatedAt: nowISO, version: photo.version + 1,
    }).where(eq(s.photoAssets.id, photo.id));
    await recordAudit(tx, {
      academyId: input.academyId, actorUserId: input.actorUserId, actorRole: "ACADEMY",
      action: "photo.finalized", targetType: "PhotoAsset", targetId: photo.id,
      detail: { participants: pids.length, purpose: input.purpose, audience: input.audience },
      success: true,
    }, nowISO);
    return { kind: "OK" as const, photoId: photo.id };
  });
}

export async function getPhotoDownload(db: Db, storage: StorageAdapter, input: {
  actorUserId: string; actorRoles: readonly string[]; academyId: string; photoId: string;
}, nowISO: string) {
  const photo = (await db.select().from(s.photoAssets).where(and(
    eq(s.photoAssets.id, input.photoId), eq(s.photoAssets.academyId, input.academyId),
  )))[0];
  if (!photo || photo.status !== "UPLOADED") return null;
  const staffOrUploader = isStaff(input.actorRoles) || photo.uploadedByUserId === input.actorUserId;
  if (!staffOrUploader) {
    /* 보호자: 자기 자녀가 태그 + canReceivePhotos + VERIFIED — 열람 시점 재인가 */
    const gd = (await db.select().from(s.guardians).where(eq(s.guardians.userId, input.actorUserId)))[0];
    if (!gd) return null;
    const tags = await db.select().from(s.photoAssetParticipants)
      .where(eq(s.photoAssetParticipants.photoId, photo.id));
    const links = tags.length > 0
      ? await db.select().from(s.guardianParticipantLinks).where(and(
          eq(s.guardianParticipantLinks.guardianId, gd.id),
          eq(s.guardianParticipantLinks.academyId, input.academyId),
          inArray(s.guardianParticipantLinks.participantId, tags.map((t) => t.participantId)),
        ))
      : [];
    const allowed = links.some((l) => l.verificationStatus === "VERIFIED" && l.canReceivePhotos);
    if (!allowed) return null;
    await recordAudit(db, {
      academyId: input.academyId, actorUserId: input.actorUserId, actorRole: "GUARDIAN",
      action: "photo.viewed", targetType: "PhotoAsset", targetId: photo.id,
      detail: {}, success: true,
    }, nowISO); // 아동 사진 열람 = 감사(docs/16 원칙)
  }
  const url = await storage.getDownloadUrl(photo.storageKey, 300, nowISO).catch(() => null);
  return url ? { url, contentType: photo.contentType } : null;
}
