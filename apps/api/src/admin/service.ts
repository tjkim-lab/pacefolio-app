/* PACEFOLIO Admin 백엔드 1차 (#27) — TJ 관제 축
   ① 관제 조회: 플랫폼 overview(MRR·구독·수납 집계) + 학원별 지표
   ② 구독: 가격정책 확정(2026-07-18) BASIC 29,000 / PRO 99,000 — 지정·변경·해지
   ③ SupportView: 사유 필수·시간 제한·철회 — 테넌트 내부 열람의 유일한 문
   ④ 통제 액션: 학원 정지(전 멤버 세션 폐기 + guard 차단)·사용자 세션 강제 폐기
   전 액션 감사(audit) — "관리자도 감사받는다"가 이 모듈의 헌법. */
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { schema as s } from "@pacefolio/db";
import {
  SUBSCRIPTION_PRICE_KRW, SUBSCRIPTION_PLAN, SUPPORT_VIEW_RESOURCES,
  canTransitionSubscriptionStatus, GATED_FEATURES,
  type SubscriptionPlan, type SubscriptionStatus, type SupportViewResource,
} from "@pacefolio/domain";
import { newId } from "../crypto";
import { recordAudit } from "../audit";
import { revokeAllSessions, type Db } from "../sessions/service";

export type AdminResult<T = Record<never, never>> =
  | ({ kind: "OK" } & T)
  | { kind: "NOT_FOUND" }
  | { kind: "INVALID"; reason: string };

/* ── ① 관제 조회 ─────────────────────────────────────── */

export async function getPlatformOverview(db: Db) {
  const [academyRow] = await db.select({
    total: sql<number>`count(*)::int`,
    suspended: sql<number>`count(*) filter (where ${s.academies.suspendedAt} is not null)::int`,
  }).from(s.academies);
  const [participantRow] = await db.select({ n: sql<number>`count(*)::int` }).from(s.participants);

  const subs = await db.select({
    plan: s.academySubscriptions.plan,
    status: s.academySubscriptions.status,
    mrr: sql<number>`coalesce(sum(${s.academySubscriptions.priceKrwMonthly}), 0)::int`,
    n: sql<number>`count(*)::int`,
  }).from(s.academySubscriptions)
    .groupBy(s.academySubscriptions.plan, s.academySubscriptions.status);
  const active = subs.filter((r) => r.status === "ACTIVE");
  const planCount = (p: SubscriptionPlan) => active.find((r) => r.plan === p)?.n ?? 0;

  /* 수납 집계(테넌트 학원비 — 우리 매출 아님, 관제용): 발행·수납·미납.
     세션 리뷰 P1: 미납 = open total − 기수납 배분 / 수납 = 유효결제 − 완료환불 */
  const [inv] = await db.select({
    billed: sql<number>`coalesce(sum(${s.invoices.total}) filter (where ${s.invoices.status} not in ('DRAFT','VOID')), 0)::int`,
    openTotal: sql<number>`coalesce(sum(${s.invoices.total}) filter (where ${s.invoices.status} in ('ISSUED','PARTIALLY_PAID','OVERDUE')), 0)::int`,
  }).from(s.invoices);
  const [openAlloc] = await db.select({
    n: sql<number>`coalesce(sum(${s.paymentAllocations.amount}), 0)::int`,
  }).from(s.paymentAllocations)
    .innerJoin(s.invoices, eq(s.paymentAllocations.invoiceId, s.invoices.id))
    .innerJoin(s.payments, eq(s.paymentAllocations.paymentId, s.payments.id))
    .where(and(
      inArray(s.invoices.status, ["ISSUED", "PARTIALLY_PAID", "OVERDUE"]),
      inArray(s.payments.status, ["CAPTURED", "PARTIALLY_REFUNDED", "REFUNDED"]),
    ));
  const [pay] = await db.select({
    valid: sql<number>`coalesce(sum(${s.payments.amount}) filter (where ${s.payments.status} in ('CAPTURED','PARTIALLY_REFUNDED','REFUNDED')), 0)::int`,
  }).from(s.payments);
  const [ref] = await db.select({
    pending: sql<number>`count(*) filter (where ${s.refunds.status} in ('REQUESTED','MUTUALLY_APPROVED','PROCESSING'))::int`,
    refunded: sql<number>`coalesce(sum(${s.refunds.completedAmount}) filter (where ${s.refunds.status} = 'COMPLETED'), 0)::int`,
  }).from(s.refunds);

  return {
    academies: { total: academyRow.total, suspended: academyRow.suspended },
    participants: participantRow.n,
    subscription: {
      /* 우리 수익의 정본: MRR = ACTIVE 구독 월요금 합 */
      mrrKrw: active.reduce((sum, r) => sum + r.mrr, 0),
      activeByPlan: { BASIC: planCount("BASIC"), PRO: planCount("PRO") },
      priceTable: SUBSCRIPTION_PRICE_KRW,
    },
    tuition: {
      billedKrw: inv.billed,
      unpaidKrw: Math.max(0, inv.openTotal - openAlloc.n),
      capturedKrw: Math.max(0, pay.valid - ref.refunded),
    },
    refundsPending: ref.pending,
  };
}

export async function listAcademiesOverview(db: Db) {
  const rows = await db.select({
    academyId: s.academies.id,
    name: s.academies.name,
    ownerName: s.academies.ownerName,
    suspendedAt: s.academies.suspendedAt,
    createdAt: s.academies.createdAt,
  }).from(s.academies).orderBy(s.academies.createdAt);

  const subs = await db.select().from(s.academySubscriptions);
  const parts = await db.select({
    academyId: s.participants.academyId,
    n: sql<number>`count(*) filter (where ${s.participants.status} in ('TRIAL','ENROLLED'))::int`,
  }).from(s.participants).groupBy(s.participants.academyId);
  const invs = await db.select({
    academyId: s.invoices.academyId,
    openTotal: sql<number>`coalesce(sum(${s.invoices.total}) filter (where ${s.invoices.status} in ('ISSUED','PARTIALLY_PAID','OVERDUE')), 0)::int`,
  }).from(s.invoices).groupBy(s.invoices.academyId);
  // 세션 리뷰 P1: 학원별 미납도 기수납 배분 차감
  const allocs = await db.select({
    academyId: s.invoices.academyId,
    n: sql<number>`coalesce(sum(${s.paymentAllocations.amount}), 0)::int`,
  }).from(s.paymentAllocations)
    .innerJoin(s.invoices, eq(s.paymentAllocations.invoiceId, s.invoices.id))
    .innerJoin(s.payments, eq(s.paymentAllocations.paymentId, s.payments.id))
    .where(and(
      inArray(s.invoices.status, ["ISSUED", "PARTIALLY_PAID", "OVERDUE"]),
      inArray(s.payments.status, ["CAPTURED", "PARTIALLY_REFUNDED", "REFUNDED"]),
    ))
    .groupBy(s.invoices.academyId);

  return rows.map((a) => {
    const sub = subs.find((x) => x.academyId === a.academyId);
    return {
      academyId: a.academyId, name: a.name, ownerName: a.ownerName,
      suspended: !!a.suspendedAt,
      subscription: sub
        ? { plan: sub.plan, status: sub.status, priceKrwMonthly: sub.priceKrwMonthly }
        : null,
      activeParticipants: parts.find((x) => x.academyId === a.academyId)?.n ?? 0,
      unpaidKrw: Math.max(0,
        (invs.find((x) => x.academyId === a.academyId)?.openTotal ?? 0) -
        (allocs.find((x) => x.academyId === a.academyId)?.n ?? 0)),
    };
  });
}

/* ── ② 구독 — 학원당 1행, 지정 = upsert(가격 스냅샷) ─────
   #39-④: 모든 변화는 append-only ledger 행으로(감사 detail 이 아니라 구조화 이력) */

type LedgerEntry = {
  academyId: string; subscriptionId: string; eventType: string;
  fromPlan?: string | null; toPlan?: string | null;
  fromPriceKrw?: number | null; toPriceKrw?: number | null;
  fromStatus?: string | null; toStatus?: string | null;
  actorUserId: string; reason?: string;
};
async function recordLedger(tx: Db, e: LedgerEntry, nowISO: string) {
  await tx.insert(s.subscriptionLedger).values({
    id: newId("sl"), academyId: e.academyId, subscriptionId: e.subscriptionId,
    eventType: e.eventType,
    fromPlan: e.fromPlan ?? null, toPlan: e.toPlan ?? null,
    fromPriceKrw: e.fromPriceKrw ?? null, toPriceKrw: e.toPriceKrw ?? null,
    fromStatus: e.fromStatus ?? null, toStatus: e.toStatus ?? null,
    actorUserId: e.actorUserId, reason: e.reason, createdAt: nowISO,
  });
}

/** 상태 전이(#39-④) — 죽은 상태(TRIAL·PAST_DUE) 도달 경로. 상태머신 강제. */
export async function setSubscriptionStatus(db: Db, input: {
  actorUserId: string; academyId: string; status: SubscriptionStatus; reason?: string;
}, nowISO: string): Promise<AdminResult<{ subscriptionId: string }> | { kind: "CONFLICT"; reason: string }> {
  return db.transaction(async (tx) => {
    const sub = (await tx.select().from(s.academySubscriptions)
      .where(eq(s.academySubscriptions.academyId, input.academyId)).for("update"))[0];
    if (!sub) return { kind: "NOT_FOUND" as const };
    const from = sub.status as SubscriptionStatus;
    if (from === input.status) return { kind: "OK" as const, subscriptionId: sub.id }; // 멱등
    if (!canTransitionSubscriptionStatus(from, input.status)) {
      return { kind: "CONFLICT" as const, reason: `상태 전이 불가: ${from} → ${input.status}` };
    }
    await tx.update(s.academySubscriptions).set({
      status: input.status,
      canceledAt: input.status === "CANCELED" ? nowISO : null,
      updatedAt: nowISO, version: sql`${s.academySubscriptions.version} + 1`,
    }).where(eq(s.academySubscriptions.id, sub.id));
    await recordLedger(tx, {
      academyId: input.academyId, subscriptionId: sub.id, eventType: "STATUS_CHANGED",
      fromStatus: from, toStatus: input.status,
      actorUserId: input.actorUserId, reason: input.reason,
    }, nowISO);
    await recordAudit(tx, {
      academyId: input.academyId, actorUserId: input.actorUserId, actorRole: "PLATFORM_ADMIN",
      action: "subscription.status_changed", targetType: "AcademySubscription", targetId: sub.id,
      reason: input.reason, detail: { from, to: input.status }, success: true,
    }, nowISO);
    return { kind: "OK" as const, subscriptionId: sub.id };
  });
}

export async function listSubscriptionLedger(db: Db, academyId: string) {
  return db.select().from(s.subscriptionLedger)
    .where(eq(s.subscriptionLedger.academyId, academyId))
    .orderBy(desc(s.subscriptionLedger.createdAt))
    .limit(100);
}

export async function setSubscription(db: Db, input: {
  actorUserId: string; academyId: string; plan: SubscriptionPlan;
}, nowISO: string): Promise<AdminResult<{ subscriptionId: string; priceKrwMonthly: number }>> {
  if (!SUBSCRIPTION_PLAN.includes(input.plan)) return { kind: "INVALID", reason: "알 수 없는 플랜" };
  return db.transaction(async (tx) => {
    const academy = (await tx.select().from(s.academies)
      .where(eq(s.academies.id, input.academyId)).for("update"))[0];
    if (!academy) return { kind: "NOT_FOUND" as const };
    const prev = (await tx.select().from(s.academySubscriptions)
      .where(eq(s.academySubscriptions.academyId, input.academyId)).for("update"))[0];
    /* 세션 리뷰 반영: 같은 플랜 재지정·복원은 기존 스냅샷 가격 유지(grandfather 보호).
       가격표 반영은 플랜이 실제로 바뀔 때만 — 일괄 개정은 명시적 reprice 트랙(후속). */
    const price = prev && prev.plan === input.plan
      ? prev.priceKrwMonthly
      : SUBSCRIPTION_PRICE_KRW[input.plan];
    let subscriptionId: string;
    if (prev) {
      subscriptionId = prev.id;
      await tx.update(s.academySubscriptions).set({
        plan: input.plan, priceKrwMonthly: price, status: "ACTIVE",
        canceledAt: null, updatedAt: nowISO,
        version: sql`${s.academySubscriptions.version} + 1`,
      }).where(eq(s.academySubscriptions.id, prev.id));
    } else {
      subscriptionId = newId("sub");
      await tx.insert(s.academySubscriptions).values({
        id: subscriptionId, academyId: input.academyId,
        plan: input.plan, status: "ACTIVE", priceKrwMonthly: price,
        startedAt: nowISO, createdAt: nowISO, updatedAt: nowISO,
      });
    }
    await recordLedger(tx, {
      academyId: input.academyId, subscriptionId,
      eventType: prev ? (prev.status === "CANCELED" ? "REACTIVATED" : "PLAN_CHANGED") : "CREATED",
      fromPlan: prev?.plan ?? null, toPlan: input.plan,
      fromPriceKrw: prev?.priceKrwMonthly ?? null, toPriceKrw: price,
      fromStatus: prev?.status ?? null, toStatus: "ACTIVE",
      actorUserId: input.actorUserId,
    }, nowISO);
    await recordAudit(tx, {
      academyId: input.academyId, actorUserId: input.actorUserId, actorRole: "PLATFORM_ADMIN",
      action: "subscription.set", targetType: "AcademySubscription", targetId: subscriptionId,
      detail: {
        plan: input.plan, priceKrwMonthly: price,
        prevPlan: prev?.plan ?? null, prevPriceKrwMonthly: prev?.priceKrwMonthly ?? null,
        prevStatus: prev?.status ?? null,
      },
      success: true,
    }, nowISO);
    return { kind: "OK" as const, subscriptionId, priceKrwMonthly: price };
  });
}

export async function cancelSubscription(db: Db, input: {
  actorUserId: string; academyId: string; reason?: string;
}, nowISO: string): Promise<AdminResult<{ subscriptionId: string }>> {
  return db.transaction(async (tx) => {
    const sub = (await tx.select().from(s.academySubscriptions)
      .where(eq(s.academySubscriptions.academyId, input.academyId)).for("update"))[0];
    if (!sub) return { kind: "NOT_FOUND" as const };
    if (sub.status !== "CANCELED") {
      await tx.update(s.academySubscriptions).set({
        status: "CANCELED", canceledAt: nowISO, updatedAt: nowISO,
        version: sql`${s.academySubscriptions.version} + 1`,
      }).where(eq(s.academySubscriptions.id, sub.id));
      await recordLedger(tx, {
        academyId: input.academyId, subscriptionId: sub.id, eventType: "CANCELED",
        fromPlan: sub.plan, toPlan: sub.plan,
        fromPriceKrw: sub.priceKrwMonthly, toPriceKrw: sub.priceKrwMonthly,
        fromStatus: sub.status, toStatus: "CANCELED",
        actorUserId: input.actorUserId, reason: input.reason,
      }, nowISO);
      await recordAudit(tx, {
        academyId: input.academyId, actorUserId: input.actorUserId, actorRole: "PLATFORM_ADMIN",
        action: "subscription.canceled", targetType: "AcademySubscription", targetId: sub.id,
        reason: input.reason, detail: { plan: sub.plan }, success: true,
      }, nowISO);
    }
    return { kind: "OK" as const, subscriptionId: sub.id }; // 멱등
  });
}

/* ── ③ SupportView — 열람은 세션 단위, 사유·만료·철회·감사 ── */

const SUPPORT_VIEW_MAX_MINUTES = 60;
const SUPPORT_VIEW_DEFAULT_MINUTES = 30;

export async function issueSupportView(db: Db, input: {
  actorUserId: string; academyId: string; reason: string;
  minutes?: number; allowedResources?: readonly SupportViewResource[];
}, nowISO: string): Promise<AdminResult<{ supportViewId: string; expiresAt: string }>> {
  if (!input.reason.trim()) return { kind: "INVALID", reason: "사유 필수" };
  // 도메인 enum(authorization.ts 정본) 밖 리소스는 fail-closed(세션 리뷰 — 무검증 문자열 저장 금지)
  if (input.allowedResources?.some((r) => !SUPPORT_VIEW_RESOURCES.includes(r))) {
    return { kind: "INVALID", reason: "알 수 없는 열람 리소스" };
  }
  const minutes = Math.min(input.minutes ?? SUPPORT_VIEW_DEFAULT_MINUTES, SUPPORT_VIEW_MAX_MINUTES);
  if (minutes < 5) return { kind: "INVALID", reason: "최소 5분" };
  return db.transaction(async (tx) => {
    const academy = (await tx.select({ id: s.academies.id }).from(s.academies)
      .where(eq(s.academies.id, input.academyId)))[0];
    if (!academy) return { kind: "NOT_FOUND" as const };
    const supportViewId = newId("sv");
    const expiresAt = new Date(new Date(nowISO).getTime() + minutes * 60_000).toISOString();
    await tx.insert(s.supportViews).values({
      id: supportViewId, academyId: input.academyId, adminUserId: input.actorUserId,
      reason: input.reason.trim(),
      // 기본 = 읽기 요약 3종(authorization.ts 정본 값) — 마스킹 프로필·결제 상태는 명시 요청 시에만
      allowedResources: JSON.stringify(
        input.allowedResources ?? ["BILLING_SUMMARY", "ATTENDANCE_SUMMARY", "AUDIT_TIMELINE"],
      ),
      issuedAt: nowISO, expiresAt, createdAt: nowISO,
    });
    await recordAudit(tx, {
      academyId: input.academyId, actorUserId: input.actorUserId, actorRole: "PLATFORM_ADMIN",
      action: "support_view.issued", targetType: "SupportView", targetId: supportViewId,
      reason: input.reason.trim(), detail: { minutes }, success: true,
    }, nowISO);
    return { kind: "OK" as const, supportViewId, expiresAt };
  });
}

/** 최근 SupportView 이력 — 발급·만료·철회를 콘솔에서 한눈에(감사의 UI 표면) */
export async function listSupportViews(db: Db, limit = 50) {
  const rows = await db.select({
    id: s.supportViews.id,
    academyId: s.supportViews.academyId,
    academyName: s.academies.name,
    adminUserId: s.supportViews.adminUserId,
    reason: s.supportViews.reason,
    issuedAt: s.supportViews.issuedAt,
    expiresAt: s.supportViews.expiresAt,
    revokedAt: s.supportViews.revokedAt,
  }).from(s.supportViews)
    .leftJoin(s.academies, eq(s.academies.id, s.supportViews.academyId))
    .orderBy(desc(s.supportViews.issuedAt))
    .limit(limit);
  return rows;
}

export async function revokeSupportView(db: Db, input: {
  actorUserId: string; supportViewId: string; reason?: string;
}, nowISO: string): Promise<AdminResult<{ supportViewId: string }>> {
  return db.transaction(async (tx) => {
    const sv = (await tx.select().from(s.supportViews)
      .where(eq(s.supportViews.id, input.supportViewId)).for("update"))[0];
    if (!sv) return { kind: "NOT_FOUND" as const };
    if (!sv.revokedAt) {
      await tx.update(s.supportViews).set({ revokedAt: nowISO })
        .where(eq(s.supportViews.id, sv.id));
      await recordAudit(tx, {
        academyId: sv.academyId, actorUserId: input.actorUserId, actorRole: "PLATFORM_ADMIN",
        action: "support_view.revoked", targetType: "SupportView", targetId: sv.id,
        reason: input.reason, success: true,
      }, nowISO);
    }
    return { kind: "OK" as const, supportViewId: sv.id }; // 멱등
  });
}

/* ── ④ 통제 액션 — 정지는 guard 차단 + 전 멤버 세션 즉시 폐기 ── */

export async function suspendAcademy(db: Db, input: {
  actorUserId: string; academyId: string; reason: string;
}, nowISO: string): Promise<AdminResult<{ revokedUserSessions: number }>> {
  if (!input.reason.trim()) return { kind: "INVALID", reason: "사유 필수" };
  return db.transaction(async (tx) => {
    const academy = (await tx.select().from(s.academies)
      .where(eq(s.academies.id, input.academyId)).for("update"))[0];
    if (!academy) return { kind: "NOT_FOUND" as const };
    if (academy.suspendedAt) return { kind: "OK" as const, revokedUserSessions: 0 }; // 멱등
    await tx.update(s.academies).set({
      suspendedAt: nowISO, updatedAt: nowISO, version: sql`${s.academies.version} + 1`,
    }).where(eq(s.academies.id, academy.id));
    /* 다음 요청을 기다리지 않는다 — 소속 전원 세션 즉시 폐기(guard 는 이후 재로그인도 차단).
       세션 리뷰 반영: ACTIVE 멤버십만 대상, PLATFORM_ADMIN·시행자 본인 제외
       (관리자는 테넌트 접근이 이미 403 — 폐기 실익 없이 콘솔 자기 잠금만 유발) */
    const members = await tx.select({
      userId: s.academyMemberships.userId,
      roles: s.academyMemberships.roles,
    }).from(s.academyMemberships)
      .where(and(
        eq(s.academyMemberships.academyId, academy.id),
        eq(s.academyMemberships.status, "ACTIVE"),
      ));
    const userIds = [...new Set(
      members
        .filter((m) => !m.roles.includes("PLATFORM_ADMIN") && m.userId !== input.actorUserId)
        .map((m) => m.userId),
    )];
    if (userIds.length > 0) {
      await tx.update(s.sessions).set({ revokedAt: nowISO }).where(and(
        inArray(s.sessions.userId, userIds), isNull(s.sessions.revokedAt),
      ));
    }
    await recordAudit(tx, {
      academyId: academy.id, actorUserId: input.actorUserId, actorRole: "PLATFORM_ADMIN",
      action: "academy.suspended", targetType: "Academy", targetId: academy.id,
      reason: input.reason.trim(), detail: { members: userIds.length }, success: true,
    }, nowISO);
    return { kind: "OK" as const, revokedUserSessions: userIds.length };
  });
}

export async function unsuspendAcademy(db: Db, input: {
  actorUserId: string; academyId: string; reason?: string;
}, nowISO: string): Promise<AdminResult> {
  return db.transaction(async (tx) => {
    const academy = (await tx.select().from(s.academies)
      .where(eq(s.academies.id, input.academyId)).for("update"))[0];
    if (!academy) return { kind: "NOT_FOUND" as const };
    if (academy.suspendedAt) {
      await tx.update(s.academies).set({
        suspendedAt: null, updatedAt: nowISO, version: sql`${s.academies.version} + 1`,
      }).where(eq(s.academies.id, academy.id));
      await recordAudit(tx, {
        academyId: academy.id, actorUserId: input.actorUserId, actorRole: "PLATFORM_ADMIN",
        action: "academy.unsuspended", targetType: "Academy", targetId: academy.id,
        reason: input.reason, success: true,
      }, nowISO);
    }
    return { kind: "OK" as const }; // 멱등
  });
}

export async function adminRevokeUserSessions(db: Db, input: {
  actorUserId: string; targetUserId: string; reason: string;
}, nowISO: string): Promise<AdminResult> {
  if (!input.reason.trim()) return { kind: "INVALID", reason: "사유 필수" };
  return db.transaction(async (tx) => {
    const user = (await tx.select({ id: s.users.id }).from(s.users)
      .where(eq(s.users.id, input.targetUserId)))[0];
    if (!user) return { kind: "NOT_FOUND" as const };
    await revokeAllSessions(tx, user.id, nowISO);
    await recordAudit(tx, {
      actorUserId: input.actorUserId, actorRole: "PLATFORM_ADMIN",
      action: "user.sessions_revoked", targetType: "User", targetId: user.id,
      reason: input.reason.trim(), success: true,
    }, nowISO);
    return { kind: "OK" as const };
  });
}

/* ── ⑤ 기능 예외 grant(#50) — "이 학원에 이 기능만 기간 한정 열기"(영업·프로모션) ──
   append-only(재부여 = 새 행·이력 보존) · 만료 lazy 판정 · 발급·철회 전부 감사. */
export async function listFeatureGrants(db: Db, academyId: string, nowISO: string) {
  const rows = await db.select().from(s.academyFeatureGrants)
    .where(eq(s.academyFeatureGrants.academyId, academyId))
    .orderBy(desc(s.academyFeatureGrants.createdAt));
  return rows.map((g) => ({
    grantId: g.id, feature: g.feature, reason: g.reason,
    expiresAt: g.expiresAt ?? undefined,
    active: g.revokedAt == null && (g.expiresAt == null || g.expiresAt > nowISO),
    revokedAt: g.revokedAt ?? undefined, createdAt: g.createdAt,
  }));
}

export async function grantFeature(db: Db, input: {
  actorUserId: string; academyId: string; feature: string; reason: string; days?: number;
}, nowISO: string): Promise<AdminResult<{ grantId: string; expiresAt?: string }>> {
  if (!(GATED_FEATURES as readonly string[]).includes(input.feature)) {
    return { kind: "INVALID", reason: "게이트 대상 기능이 아님" };
  }
  if (!input.reason.trim()) return { kind: "INVALID", reason: "사유 필수 — 누가 왜 열어줬는지" };
  return db.transaction(async (tx) => {
    const academy = (await tx.select({ id: s.academies.id }).from(s.academies)
      .where(eq(s.academies.id, input.academyId)))[0];
    if (!academy) return { kind: "NOT_FOUND" as const };
    const expiresAt = input.days != null
      ? new Date(new Date(nowISO).getTime() + input.days * 86_400_000).toISOString()
      : undefined; // 무기한 — 명시적 철회로만 닫힘
    const grantId = newId("fg");
    await tx.insert(s.academyFeatureGrants).values({
      id: grantId, academyId: academy.id, feature: input.feature,
      reason: input.reason.trim(), expiresAt: expiresAt ?? null,
      grantedByUserId: input.actorUserId, createdAt: nowISO,
    });
    await recordAudit(tx, {
      academyId: academy.id, actorUserId: input.actorUserId, actorRole: "PLATFORM_ADMIN",
      action: "feature_grant.created", targetType: "FeatureGrant", targetId: grantId,
      reason: input.reason.trim(),
      detail: { feature: input.feature, expiresAt: expiresAt ?? null }, success: true,
    }, nowISO);
    return { kind: "OK" as const, grantId, expiresAt };
  });
}

export async function revokeFeatureGrant(db: Db, input: {
  actorUserId: string; academyId: string; grantId: string; reason?: string;
}, nowISO: string): Promise<AdminResult<{ grantId: string }>> {
  return db.transaction(async (tx) => {
    const g = (await tx.select().from(s.academyFeatureGrants).where(and(
      eq(s.academyFeatureGrants.id, input.grantId),
      eq(s.academyFeatureGrants.academyId, input.academyId),
    )).for("update"))[0];
    if (!g) return { kind: "NOT_FOUND" as const };
    if (g.revokedAt) return { kind: "OK" as const, grantId: g.id }; // 멱등 — 최초 철회 기록 보존
    await tx.update(s.academyFeatureGrants).set({
      revokedAt: nowISO, revokedByUserId: input.actorUserId,
    }).where(eq(s.academyFeatureGrants.id, g.id));
    await recordAudit(tx, {
      academyId: g.academyId, actorUserId: input.actorUserId, actorRole: "PLATFORM_ADMIN",
      action: "feature_grant.revoked", targetType: "FeatureGrant", targetId: g.id,
      reason: input.reason, detail: { feature: g.feature }, success: true,
    }, nowISO);
    return { kind: "OK" as const, grantId: g.id };
  });
}

/** 전 기능 체험(#50b) — "다 열어주고 쓰게 한 뒤 만료로 잠근다"(TJ 영업 전략).
   게이트 전 기능을 같은 만료일로 일괄 grant. days 필수 — 무기한 전체 개방은
   grant 가 아니라 플랜 지정(PRO)으로. 한 tx·기능별 행(개별 철회 가능)·감사 1건. */
export async function grantAllFeatures(db: Db, input: {
  actorUserId: string; academyId: string; reason: string; days: number;
}, nowISO: string): Promise<AdminResult<{ granted: number; expiresAt: string }>> {
  if (!input.reason.trim()) return { kind: "INVALID", reason: "사유 필수" };
  if (!Number.isInteger(input.days) || input.days < 1 || input.days > 365) {
    return { kind: "INVALID", reason: "기간(1~365일) 필수 — 무기한 전체 개방은 플랜 지정으로" };
  }
  return db.transaction(async (tx) => {
    const academy = (await tx.select({ id: s.academies.id }).from(s.academies)
      .where(eq(s.academies.id, input.academyId)))[0];
    if (!academy) return { kind: "NOT_FOUND" as const };
    const expiresAt = new Date(new Date(nowISO).getTime() + input.days * 86_400_000).toISOString();
    await tx.insert(s.academyFeatureGrants).values(GATED_FEATURES.map((feature) => ({
      id: newId("fg"), academyId: academy.id, feature,
      reason: input.reason.trim(), expiresAt,
      grantedByUserId: input.actorUserId, createdAt: nowISO,
    })));
    await recordAudit(tx, {
      academyId: academy.id, actorUserId: input.actorUserId, actorRole: "PLATFORM_ADMIN",
      action: "feature_grant.trial_all", targetType: "Academy", targetId: academy.id,
      reason: input.reason.trim(),
      detail: { features: [...GATED_FEATURES], days: input.days, expiresAt }, success: true,
    }, nowISO);
    return { kind: "OK" as const, granted: GATED_FEATURES.length, expiresAt };
  });
}
