"use client";

/* Admin 관제 실 API 연결(#28) — Coach/LiveBilling 과 같은 4상태 패턴.
   API 감지 시: TJ(PLATFORM_ADMIN) 세션 → overview(MRR·구독·수납) + 학원별 지표.
   API 부재 = FIXTURE(데모 유지) · 실연결 후 오류 = ERROR 표시(위장 금지). */
import {
  createContext, useCallback, useContext, useEffect, useState, type ReactNode,
} from "react";
import { createApiClient, ApiError } from "@pacefolio/api-client";

const api = createApiClient({ baseUrl: "/api" });

export type AdminLiveState = "FIXTURE" | "LOADING" | "READY" | "ERROR";
export type AdminOverviewData = Awaited<ReturnType<typeof api.adminOverview>>;
export type AdminAcademyRow = Awaited<ReturnType<typeof api.adminAcademies>>["academies"][number];

interface AdminLiveCtx {
  state: AdminLiveState;
  errorMsg?: string;
  overview?: AdminOverviewData;
  academies: AdminAcademyRow[];
  setPlan: (academyId: string, plan: "BASIC" | "PRO") => Promise<{ ok: boolean; message: string }>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AdminLiveCtx | null>(null);
export const useAdminLive = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAdminLive must be used within AdminLiveProvider");
  return c;
};

export function AdminLiveProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AdminLiveState>("LOADING");
  const [errorMsg, setErrorMsg] = useState<string>();
  const [overview, setOverview] = useState<AdminOverviewData>();
  const [academies, setAcademies] = useState<AdminAcademyRow[]>([]);

  const load = useCallback(async () => {
    const [ov, list] = await Promise.all([api.adminOverview(), api.adminAcademies()]);
    setOverview(ov);
    setAcademies(list.academies);
  }, []);

  useEffect(() => {
    (async () => {
      let reachable = false;
      try {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 1500);
        const probe = await fetch("/api/sessions/me", { signal: ctl.signal, credentials: "include" });
        clearTimeout(t);
        if (probe.status !== 401 && !probe.ok) { setState("FIXTURE"); return; }
        reachable = true;
        if (probe.status === 401) await api.devLogin("TJ");
        let me = await api.me();
        const isAdmin = (m: { roles: string[]; status: string }) =>
          m.roles.includes("PLATFORM_ADMIN") && m.status === "ACTIVE";
        if (!me.memberships.some(isAdmin)) {
          // 다른 데모 계정 세션이면 TJ 로 전환
          await api.logout().catch(() => undefined);
          await api.devLogin("TJ");
          me = await api.me();
        }
        if (!me.memberships.some(isAdmin)) { setState("FIXTURE"); return; } // admin seed 없음 = 데모
        await load();
        setState("READY");
      } catch (e) {
        if (!reachable) { setState("FIXTURE"); return; } // API 부재만 fixture 폴백
        setErrorMsg(e instanceof ApiError ? `서버 오류(${e.status}: ${e.code})` : "관제 데이터를 불러오지 못했어요");
        setState("ERROR"); // 실연결 후 오류는 오류로 — 데모 위장 금지
      }
    })();
  }, [load]);

  const setPlan = useCallback(async (academyId: string, plan: "BASIC" | "PRO") => {
    try {
      const r = await api.adminSetSubscription(academyId, plan);
      await load();
      return { ok: true, message: `${plan} · 월 ${r.priceKrwMonthly.toLocaleString()}원으로 변경했어요` };
    } catch (e) {
      return {
        ok: false,
        message: e instanceof ApiError ? `변경 실패(${e.status}: ${e.code})` : "변경 실패 — 네트워크 확인",
      };
    }
  }, [load]);

  return (
    <Ctx.Provider value={{ state, errorMsg, overview, academies, setPlan, refresh: load }}>
      {children}
    </Ctx.Provider>
  );
}
