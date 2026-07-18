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

interface OwnerLiveCtx {
  state: OwnerLiveState;
  errorMsg?: string;
  academyId?: string;
  notices: OwnerNotice[];
  summary?: BillingSummaryData;
  publish: (input: { title: string; body: string; audience: string }) =>
    Promise<{ ok: boolean; recipients: number; message: string }>;
  refreshNotices: () => Promise<void>;
  refreshSummary: () => Promise<void>;
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

  useEffect(() => {
    (async () => {
      let reachable = false;
      try {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 1500);
        const probe = await fetch("/api/sessions/me", { signal: ctl.signal, credentials: "include" });
        clearTimeout(t);
        /* 세션 리뷰: 5xx = 살아있는 서버의 오류 → ERROR(데모 위장 금지). FIXTURE 는 API 부재만 */
        if (!probe.ok && probe.status !== 401) {
          if (probe.status >= 500) { reachable = true; throw new ApiError(probe.status, "PROBE_5XX"); }
          setState("FIXTURE"); return;
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
        const [nt, sum] = await Promise.all([api.listNotices(aid), api.billingSummary(aid)]);
        setNotices(nt.notices);
        setSummary(sum);
        setState("READY");
      } catch (e) {
        if (!reachable) { setState("FIXTURE"); return; }
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

  const publish = useCallback(async (input: { title: string; body: string; audience: string }) => {
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

  return (
    <Ctx.Provider value={{ state, errorMsg, academyId, notices, summary, publish, refreshNotices, refreshSummary }}>
      {children}
    </Ctx.Provider>
  );
}
