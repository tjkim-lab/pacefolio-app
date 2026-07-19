"use client";

/* PC 원장 실 API 연결(#25) — Coach/Admin 과 같은 4상태 패턴.
   API 감지 시: 김도윤(OWNER) 세션 → 공지 발행·읽음 추적 + 수납 집계.
   API 부재 = FIXTURE(데모 유지) · 실연결 후 오류 = ERROR(위장 금지). */
import {
  createContext, useCallback, useContext, useEffect, useState, type ReactNode,
} from "react";
import { createApiClient, ApiError } from "@pacefolio/api-client";

const api = createApiClient({ baseUrl: "/api" });

export type OwnerLiveState = "FIXTURE" | "LOADING" | "READY" | "ERROR";
export type OwnerNotice = Awaited<ReturnType<typeof api.listNotices>>["notices"][number];
export type BillingSummaryData = Awaited<ReturnType<typeof api.billingSummary>>;
export type CoachMember = Awaited<ReturnType<typeof api.listMembers>>["members"][number];
export interface CoachDirective {
  messageId: string; roomId: string; coachUserId: string; body: string; status: string;
}

interface OwnerLiveCtx {
  state: OwnerLiveState;
  errorMsg?: string;
  academyId?: string;
  notices: OwnerNotice[];
  summary?: BillingSummaryData;
  publish: (input: { title: string; body: string; audience: string; classId?: string }) =>
    Promise<{ ok: boolean; recipients: number; message: string }>;
  classes: { classId: string; name: string; coachUserIds: string[] }[]; // AudienceFilter 1단계 — 반 칩의 정본
  refreshNotices: () => Promise<void>;
  refreshSummary: () => Promise<void>;
  /* #38: 휴무 event → 서버 세션 취소·회차 재계산 / 중간입회 일할 견적(헌법 수식) */
  createClosure: (body: {
    scope: "ACADEMY" | "CLASS"; classId?: string; dateStart: string; dateEnd: string;
    closureType: string; reason: string; deductSessions: boolean;
  }) => Promise<{ ok: boolean; message: string; canceledSessions?: number }>;
  prorationQuote: (classId: string, body: {
    periodStart: string; periodEnd: string; joinDate: string; baseFee: number;
  }) => Promise<{ ok: boolean; message: string; quote?: { totalSessions: number; remainingSessions: number; amount: number; basis: string } }>;
  /* #40: 청구 초안 저장 — 견적 결과를 DRAFT 청구서로(발송은 청구 초안 검토에서) */
  participants: { participantId: string; name: string; ageLabel: string; status: string }[];
  saveDraftInvoice: (input: {
    participantId: string; periodStart: string; periodEnd: string; dueDate: string;
    lines: { type: string; label: string; amount: number }[];
  }) => Promise<{ ok: boolean; message: string; invoiceId?: string; total?: number }>;
  /* #41: 그룹(반) 일괄 — 초안 전수 생성(검토) → 일괄 발행(확정·발송) */
  bulkDrafts: (classId: string, input: { periodStart: string; periodEnd: string; dueDate: string; baseFee: number }) =>
    Promise<{ ok: boolean; message: string; created?: number; skipped?: number }>;
  bulkIssue: (classId: string, input: { periodStart: string; periodEnd: string }) =>
    Promise<{ ok: boolean; message: string; issued?: number }>;
  /* #42: 코치 교체 — 배정 행 교체(이력 보존)·권한 회수는 원장 결정·브리핑 outbox */
  swapCoach: (input: {
    fromCoachUserId: string; toCoachUserId: string; classIds: string[];
    effectiveDate: string; revokeMode: "IMMEDIATE" | "ON_EFFECTIVE" | "KEEP";
  }) => Promise<{ ok: boolean; message: string; swapped?: number; affectedParticipants?: number }>;
  refreshClasses: () => Promise<void>;
  /* #31: 코치 전달사항 — DM 개설→ACK_REQUIRED 전송, READ/ACK 은 서버 상태 재조회 */
  coaches: CoachMember[];
  sendCoachDirective: (coachUserId: string, body: string, urgent: boolean) =>
    Promise<{ ok: boolean; message: string; directive?: CoachDirective }>;
  refreshDirective: (d: CoachDirective) => Promise<CoachDirective>;
}

const Ctx = createContext<OwnerLiveCtx | null>(null);
export const useOwnerLive = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useOwnerLive must be used within OwnerLiveProvider");
  return c;
};

export function OwnerLiveProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<OwnerLiveState>("LOADING");
  const [errorMsg, setErrorMsg] = useState<string>();
  const [academyId, setAcademyId] = useState<string>();
  const [notices, setNotices] = useState<OwnerNotice[]>([]);
  const [summary, setSummary] = useState<BillingSummaryData>();
  const [coaches, setCoaches] = useState<CoachMember[]>([]);
  const [classes, setClasses] = useState<{ classId: string; name: string; coachUserIds: string[] }[]>([]);
  const [participants, setParticipants] = useState<{ participantId: string; name: string; ageLabel: string; status: string }[]>([]);

  useEffect(() => {
    (async () => {
      if (process.env.NEXT_PUBLIC_PACEFOLIO_DEMO_FIXTURE === "1") {
        setState("FIXTURE"); return; // 명시적 데모 설정 — 유일한 의도된 fixture 진입로
      }
      let reachable = false;
      try {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 1500);
        const probe = await fetch("/api/sessions/me", { signal: ctl.signal, credentials: "include" });
        clearTimeout(t);
        /* 14차 B P0: 서버가 응답한 비-401(403/404/5xx)은 전부 장애 = ERROR.
           FIXTURE 는 명시 플래그 또는 비프로덕션의 네트워크 실패만. */
        if (!probe.ok && probe.status !== 401) {
          reachable = true;
          throw new ApiError(probe.status, "PROBE_FAILED");
        }
        reachable = true;
        if (probe.status === 401) await api.devLogin("김도윤");
        const isOwner = (m: { roles: string[]; status: string }) =>
          m.roles.includes("OWNER") && m.status === "ACTIVE";
        let me = await api.me();
        if (!me.memberships.some(isOwner)) {
          await api.logout().catch(() => undefined);
          await api.devLogin("김도윤");
          me = await api.me();
        }
        const ms = me.memberships.find(isOwner);
        if (!ms) { setState("FIXTURE"); return; } // 원장 seed 없음 = 데모
        const aid = ms.academyId;
        setAcademyId(aid);
        const [nt, sum, mem, cls, pts] = await Promise.all([
          api.listNotices(aid), api.billingSummary(aid), api.listMembers(aid, "COACH"),
          api.listClasses(aid), api.listParticipants(aid),
        ]);
        setNotices(nt.notices);
        setSummary(sum);
        setCoaches(mem.members);
        setClasses(cls.classes.map((x) => ({ classId: x.classId, name: x.name, coachUserIds: x.coachUserIds })));
        setParticipants(pts.participants);
        setState("READY");
      } catch (e) {
        if (!reachable) {
          if (process.env.NODE_ENV !== "production") { setState("FIXTURE"); return; }
          setErrorMsg("API 연결 불가"); setState("ERROR"); return;
        }
        setErrorMsg(e instanceof ApiError ? `서버 오류(${e.status}: ${e.code})` : "데이터를 불러오지 못했어요");
        setState("ERROR");
      }
    })();
  }, []);

  const refreshNotices = useCallback(async () => {
    if (!academyId) return;
    const nt = await api.listNotices(academyId);
    setNotices(nt.notices);
  }, [academyId]);

  const refreshSummary = useCallback(async () => {
    if (!academyId) return;
    setSummary(await api.billingSummary(academyId));
  }, [academyId]);

  const publish = useCallback(async (input: { title: string; body: string; audience: string; classId?: string }) => {
    if (!academyId) return { ok: false, recipients: 0, message: "학원 컨텍스트 없음" };
    /* 세션 리뷰 P1 패턴: 발행 성공과 목록 갱신 실패를 분리 — 성공을 실패로 위장 금지 */
    let r;
    try { r = await api.publishNotice(academyId, input); }
    catch (e) {
      return {
        ok: false, recipients: 0,
        message: e instanceof ApiError ? `발송 실패(${e.status}: ${e.code})` : "발송 실패 — 네트워크 확인",
      };
    }
    try { await refreshNotices(); } catch {
      return { ok: true, recipients: r.recipients, message: `보호자 ${r.recipients}명에게 발송 — 목록 갱신은 새로고침으로` };
    }
    return { ok: true, recipients: r.recipients, message: `보호자 ${r.recipients}명에게 발송했어요` };
  }, [academyId, refreshNotices]);

  const saveDraftInvoice = useCallback(async (input: {
    participantId: string; periodStart: string; periodEnd: string; dueDate: string;
    lines: { type: string; label: string; amount: number }[];
  }) => {
    if (!academyId) return { ok: false, message: "학원 컨텍스트 없음" };
    try {
      const bp = await api.createBillingPeriod(academyId, {
        periodStart: input.periodStart, periodEnd: input.periodEnd, cycleMonths: 3,
      }); // find-or-create 멱등
      const inv = await api.createDraftInvoice(academyId, {
        participantId: input.participantId, billingPeriodId: bp.billingPeriodId,
        dueDate: input.dueDate, lines: input.lines,
      });
      return {
        ok: true, invoiceId: inv.invoiceId, total: inv.total,
        message: `청구 초안 저장(${inv.total.toLocaleString()}원) — 발송은 청구 초안 검토에서`,
      };
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        return { ok: false, message: "이미 이 원생·기간의 청구서가 있어요 — 수정은 VOID 후 재발행" };
      }
      return { ok: false, message: e instanceof ApiError ? `저장 실패(${e.status}: ${e.code})` : "저장 실패 — 네트워크 확인" };
    }
  }, [academyId]);

  const refreshClasses = useCallback(async () => {
    if (!academyId) return;
    const cls = await api.listClasses(academyId);
    setClasses(cls.classes.map((x) => ({ classId: x.classId, name: x.name, coachUserIds: x.coachUserIds })));
  }, [academyId]);

  const swapCoach = useCallback(async (input: {
    fromCoachUserId: string; toCoachUserId: string; classIds: string[];
    effectiveDate: string; revokeMode: "IMMEDIATE" | "ON_EFFECTIVE" | "KEEP";
  }) => {
    if (!academyId) return { ok: false, message: "학원 컨텍스트 없음" };
    let r;
    try { r = await api.swapCoach(academyId, input); }
    catch (e) {
      if (e instanceof ApiError && e.status === 422) {
        const reason = (e.body as { reason?: string } | undefined)?.reason;
        return { ok: false, message: reason ?? `교체 불가(${e.code})` };
      }
      return { ok: false, message: e instanceof ApiError ? `교체 실패(${e.status}: ${e.code})` : "교체 실패 — 네트워크 확인" };
    }
    /* mutation 성공과 목록 갱신 실패 분리 — 성공 위장 금지 */
    try { await refreshClasses(); } catch { /* 갱신은 새로고침으로 */ }
    return {
      ok: true, swapped: r.swapped, affectedParticipants: r.affectedParticipants,
      message: `교체 완료 — 반 ${r.swapped}개 · 원생 ${r.affectedParticipants}명, 새 코치에게 인수인계 브리핑이 가요`,
    };
  }, [academyId, refreshClasses]);

  const bulkDrafts = useCallback(async (classId: string, input: {
    periodStart: string; periodEnd: string; dueDate: string; baseFee: number;
  }) => {
    if (!academyId) return { ok: false, message: "학원 컨텍스트 없음" };
    try {
      const bp = await api.createBillingPeriod(academyId, {
        periodStart: input.periodStart, periodEnd: input.periodEnd, cycleMonths: 3,
      });
      const r = await api.bulkInvoiceDrafts(academyId, classId, {
        billingPeriodId: bp.billingPeriodId, dueDate: input.dueDate, baseFee: input.baseFee,
      });
      return {
        ok: true, created: r.created, skipped: r.skipped,
        message: `초안 ${r.created}건 생성${r.skipped ? ` · ${r.skipped}명은 기존 청구 있어 제외` : ""} — 확정·발송 가능`,
      };
    } catch (e) {
      return { ok: false, message: e instanceof ApiError ? `초안 생성 실패(${e.status}: ${e.code})` : "초안 생성 실패 — 네트워크 확인" };
    }
  }, [academyId]);

  const bulkIssue = useCallback(async (classId: string, input: { periodStart: string; periodEnd: string }) => {
    if (!academyId) return { ok: false, message: "학원 컨텍스트 없음" };
    try {
      const bp = await api.createBillingPeriod(academyId, {
        periodStart: input.periodStart, periodEnd: input.periodEnd, cycleMonths: 3,
      });
      const r = await api.bulkInvoiceIssue(academyId, classId, { billingPeriodId: bp.billingPeriodId });
      return { ok: true, issued: r.issued, message: `청구서 ${r.issued}건 발행 — 보호자에게 노출 시작(알림 트랙 등록)` };
    } catch (e) {
      return { ok: false, message: e instanceof ApiError ? `발행 실패(${e.status}: ${e.code})` : "발행 실패 — 네트워크 확인" };
    }
  }, [academyId]);

  const createClosure = useCallback(async (body: {
    scope: "ACADEMY" | "CLASS"; classId?: string; dateStart: string; dateEnd: string;
    closureType: string; reason: string; deductSessions: boolean;
  }) => {
    if (!academyId) return { ok: false, message: "학원 컨텍스트 없음" };
    try {
      const r = await api.createClosure(academyId, body);
      return {
        ok: true, canceledSessions: r.canceledSessions,
        message: `휴무 등록 — 세션 ${r.canceledSessions}회 취소·회차 재계산됨(감사 기록)`,
      };
    } catch (e) {
      return { ok: false, message: e instanceof ApiError ? `등록 실패(${e.status}: ${e.code})` : "등록 실패 — 네트워크 확인" };
    }
  }, [academyId]);

  const prorationQuote = useCallback(async (classId: string, body: {
    periodStart: string; periodEnd: string; joinDate: string; baseFee: number;
  }) => {
    if (!academyId) return { ok: false, message: "학원 컨텍스트 없음" };
    try {
      const q = await api.prorationQuote(academyId, classId, body);
      return { ok: true, message: "서버 견적", quote: q };
    } catch (e) {
      return { ok: false, message: e instanceof ApiError ? `견적 실패(${e.status}: ${e.code})` : "견적 실패 — 네트워크 확인" };
    }
  }, [academyId]);

  const sendCoachDirective = useCallback(async (coachUserId: string, body: string, urgent: boolean) => {
    if (!academyId) return { ok: false, message: "학원 컨텍스트 없음" };
    try {
      const dm = await api.openCoachDm(academyId, coachUserId);
      const sent = await api.sendChatMessage(academyId, dm.roomId, {
        kind: urgent ? "URGENT_ACK_REQUIRED" : "ACK_REQUIRED",
        body, clientMessageId: crypto.randomUUID(), // 전송 멱등(모바일 재시도)
      });
      return {
        ok: true,
        message: "전달했어요 — 코치가 '확인'을 누르면 상태가 바뀌어요",
        directive: { messageId: sent.messageId, roomId: dm.roomId, coachUserId, body, status: sent.status },
      };
    } catch (e) {
      return {
        ok: false,
        message: e instanceof ApiError ? `전달 실패(${e.status}: ${e.code})` : "전달 실패 — 네트워크 확인",
      };
    }
  }, [academyId]);

  const refreshDirective = useCallback(async (d: CoachDirective) => {
    if (!academyId) return d;
    const msgs = await api.listChatMessages(academyId, d.roomId);
    const found = msgs.messages.find((m) => m.messageId === d.messageId);
    return found ? { ...d, status: found.status } : d;
  }, [academyId]);

  return (
    <Ctx.Provider value={{
      state, errorMsg, academyId, notices, summary, publish, classes,
      refreshNotices, refreshSummary, coaches, sendCoachDirective, refreshDirective,
      createClosure, prorationQuote, participants, saveDraftInvoice, bulkDrafts, bulkIssue,
      swapCoach, refreshClasses,
    }}>
      {children}
    </Ctx.Provider>
  );
}
