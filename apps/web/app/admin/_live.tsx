"use client";

/* Admin 관제 실 API 연결(#28) — Coach/LiveBilling 과 같은 4상태 패턴.
   API 감지 시: TJ(PLATFORM_ADMIN) 세션 → overview(MRR·구독·수납) + 학원별 지표.
   API 부재 = FIXTURE(데모 유지) · 실연결 후 오류 = ERROR 표시(위장 금지). */
import {
  createContext, useCallback, useContext, useEffect, useState, type ReactNode,
} from "react";
import { createApiClient, ApiError } from "@pacefolio/api-client";

const api = createApiClient({ baseUrl: "/api" });
/** READY 상태의 화면이 추가 admin 호출(SupportView 등)에 재사용 */
export const adminApi = api;

export type AdminLiveState = "FIXTURE" | "LOADING" | "READY" | "ERROR";
export type AdminOverviewData = Awaited<ReturnType<typeof api.adminOverview>>;
export type AdminAcademyRow = Awaited<ReturnType<typeof api.adminAcademies>>["academies"][number];

interface AdminLiveCtx {
  state: AdminLiveState;
  errorMsg?: string;
  overview?: AdminOverviewData;
  academies: AdminAcademyRow[];
  setPlan: (academyId: string, plan: "BASIC" | "PRO") => Promise<{ ok: boolean; message: string }>;
  suspend: (academyId: string, reason: string) => Promise<{ ok: boolean; message: string }>;
  unsuspend: (academyId: string) => Promise<{ ok: boolean; message: string }>;
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
        // 주의(dev 데모 한계): 쿠키는 브라우저 전역 1개 — admin↔학부모·코치 데모 탭을
        // 오가면 마지막 devLogin 계정으로 세션이 바뀐다. 데모는 한 번에 한 역할로.
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
        if (!reachable) {
          if (process.env.NODE_ENV !== "production") { setState("FIXTURE"); return; }
          setErrorMsg("API 연결 불가"); setState("ERROR"); return;
        }
        setErrorMsg(e instanceof ApiError ? `서버 오류(${e.status}: ${e.code})` : "관제 데이터를 불러오지 못했어요");
        setState("ERROR"); // 실연결 후 오류는 오류로 — 데모 위장 금지
      }
    })();
  }, [load]);

  /* 세션 리뷰 P1: mutation 성공과 refresh 실패를 분리 — 성공을 실패로 위장 금지 */
  const refreshAfter = useCallback(async (okMsg: string) => {
    try { await load(); } catch {
      return { ok: true, message: `${okMsg} — 목록 갱신 실패, 새로고침 해주세요` };
    }
    return { ok: true, message: okMsg };
  }, [load]);

  const setPlan = useCallback(async (academyId: string, plan: "BASIC" | "PRO") => {
    let r;
    try { r = await api.adminSetSubscription(academyId, plan); }
    catch (e) {
      return {
        ok: false,
        message: e instanceof ApiError ? `변경 실패(${e.status}: ${e.code})` : "변경 실패 — 네트워크 확인",
      };
    }
    return refreshAfter(`${plan} · 월 ${r.priceKrwMonthly.toLocaleString()}원으로 변경했어요`);
  }, [refreshAfter]);

  const fail = (e: unknown, fallback: string) => ({
    ok: false,
    message: e instanceof ApiError ? `실패(${e.status}: ${e.code})` : fallback,
  });

  const suspend = useCallback(async (academyId: string, reason: string) => {
    let r;
    try { r = await api.adminSuspendAcademy(academyId, reason); }
    catch (e) { return fail(e, "정지 실패 — 네트워크 확인"); }
    return refreshAfter(`정지 완료 — 멤버 세션 ${r.revokedUserSessions}명분 즉시 폐기`);
  }, [refreshAfter]);

  const unsuspend = useCallback(async (academyId: string) => {
    try { await api.adminUnsuspendAcademy(academyId); }
    catch (e) { return fail(e, "해제 실패 — 네트워크 확인"); }
    return refreshAfter("정지 해제 — 다음 로그인부터 정상 이용");
  }, [refreshAfter]);

  return (
    <Ctx.Provider value={{ state, errorMsg, overview, academies, setPlan, suspend, unsuspend, refresh: load }}>
      {children}
    </Ctx.Provider>
  );
}
