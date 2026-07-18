"use client";

/* Gate 2 완성형 — 학부모 청구·결제 화면의 실 API 연결 계층 (13차 B 보강판).
   상태 모델(P0-2): FIXTURE_PREVIEW | LIVE_LOADING | LIVE_READY | LIVE_ERROR
   - API 부재(연결 자체 불가) = fixture 데모(디자인 검수용) — 명시 배지
   - 실연결이 성립한 뒤의 API 오류 = fixture 로 조용히 전환하지 않고 오류 표시
   결제 완료 판정(P0-1): 웹훅 decision=APPLY → GET /payments/{id} 로
   Payment=CAPTURED + 선택 청구서 전부 PAID 확인 후에만 완료 화면.
   멱등키(P1-2): 결제 시도 시작 시 생성·성공/선택 변경 전까지 보존(재시도 동일 키).
   academyId(P1-4): 세션 membership 에서 도출(하드코딩 제거). */

import {
  createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode,
} from "react";
import { createApiClient, ApiError } from "@pacefolio/api-client";

const api = createApiClient({ baseUrl: "/api" });

export type LiveState = "FIXTURE_PREVIEW" | "LIVE_LOADING" | "LIVE_READY" | "LIVE_ERROR";

export interface LiveInvoice {
  invoiceId: string;
  participantId: string;
  participantName: string;
  status: string;
  total: number;
  dueDate: string;
  lines: { type: string; label: string; amount: number }[];
}
export interface PayResult {
  paymentId: string;
  amount: number;
}

/* P1-5: 청구 상태별 정책 분리 — "ISSUED 아니면 완납" 같은 단순 판정 금지 */
export function isInvoicePayable(status: string): boolean {
  return status === "ISSUED" || status === "OVERDUE" || status === "PARTIALLY_PAID";
}
export function isInvoiceSettled(status: string): boolean {
  return status === "PAID";
}
export function invoiceStatusLabel(status: string): string {
  return ({
    ISSUED: "미납", OVERDUE: "기한 초과", PARTIALLY_PAID: "부분 납부",
    PAID: "완납 ✓", REFUNDED: "환불됨", VOID: "무효", DRAFT: "초안",
  } as Record<string, string>)[status] ?? status;
}

interface LiveCtx {
  state: LiveState;
  live: boolean; // state === LIVE_READY (기존 화면 호환)
  errorMsg?: string;
  userName?: string;
  academyId?: string;
  invoices: LiveInvoice[];
  sel: Record<string, boolean>;
  toggle: (invoiceId: string) => void;
  selIds: string[];
  selAmount: number;
  paying: boolean;
  payResult: PayResult | null;
  pay: () => Promise<{ ok: boolean; message?: string }>;
  resetPay: () => void;
  refresh: () => Promise<void>;
  retry: () => void;
}

const Ctx = createContext<LiveCtx | null>(null);
export const useLive = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useLive must be used within LiveBillingProvider");
  return c;
};

export function LiveBillingProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LiveState>("LIVE_LOADING");
  const [errorMsg, setErrorMsg] = useState<string>();
  const [userName, setUserName] = useState<string>();
  const [academyId, setAcademyId] = useState<string>();
  const [invoices, setInvoices] = useState<LiveInvoice[]>([]);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [paying, setPaying] = useState(false);
  const [payResult, setPayResult] = useState<PayResult | null>(null);
  const [attempt, setAttempt] = useState(0); // retry 트리거
  /* P1-2: 결제 멱등키 — 시도 시작 시 생성, 성공·선택 변경 전까지 보존 */
  const payIdemRef = useRef<{ key: string; sig: string } | null>(null);

  const refresh = useCallback(async () => {
    if (!academyId) return;
    const list = await api.listInvoices(academyId);
    setInvoices(list.invoices);
  }, [academyId]);

  /* 연결 감지: API 부재 → FIXTURE_PREVIEW / 성립 후 오류 → LIVE_ERROR (P0-2) */
  useEffect(() => {
    (async () => {
      setState("LIVE_LOADING");
      let reachable = false;
      try {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 1500);
        const probe = await fetch("/api/sessions/me", { signal: ctl.signal, credentials: "include" });
        clearTimeout(t);
        if (probe.status !== 401 && !probe.ok) {
          setState("FIXTURE_PREVIEW"); // API 라우트 부재(404/502) = 데모 모드
          return;
        }
        reachable = true;
        if (probe.status === 401) await api.devLogin("박서연");
        let me = await api.me();
        let membership = me.memberships.find((m) => m.roles.includes("GUARDIAN") && m.status === "ACTIVE");
        if (!membership) {
          // gate2 러너 등이 원장 세션을 남겼을 수 있음 — 보호자로 전환
          await api.logout().catch(() => undefined);
          await api.devLogin("박서연");
          me = await api.me();
          membership = me.memberships.find((m) => m.roles.includes("GUARDIAN") && m.status === "ACTIVE");
        }
        if (!membership) throw new Error("보호자 membership 없음");
        setUserName(me.user.name);
        setAcademyId(membership.academyId); // P1-4: 세션에서 도출
        const list = await api.listInvoices(membership.academyId);
        setInvoices(list.invoices);
        setState("LIVE_READY");
      } catch (e) {
        if (!reachable) {
          setState("FIXTURE_PREVIEW"); // 연결 자체가 안 됨 = 데모
        } else {
          // P0-2: 실연결이 성립했는데 실패 — fixture 로 위장하지 않는다
          setErrorMsg(e instanceof ApiError ? `${e.status} ${e.code}` : String(e));
          setState("LIVE_ERROR");
        }
      }
    })();
  }, [attempt]);

  const toggle = useCallback((invoiceId: string) => {
    setSel((prev) => ({ ...prev, [invoiceId]: !prev[invoiceId] }));
  }, []);

  const selIds = invoices
    .filter((iv) => isInvoicePayable(iv.status) && sel[iv.invoiceId])
    .map((iv) => iv.invoiceId);
  const selAmount = invoices
    .filter((iv) => selIds.includes(iv.invoiceId))
    .reduce((s, iv) => s + iv.total, 0);

  /* P0-1: 완료 판정 = decision APPLY + Payment CAPTURED + 청구서 PAID 전부 확인 */
  const pay = useCallback(async (): Promise<{ ok: boolean; message?: string }> => {
    if (paying || selIds.length === 0 || !academyId) return { ok: false, message: "선택 없음" };
    setPaying(true);
    try {
      const sig = selIds.slice().sort().join("|");
      if (!payIdemRef.current || payIdemRef.current.sig !== sig) {
        payIdemRef.current = { key: `live-${crypto.randomUUID()}`, sig }; // 재시도 = 같은 키
      }
      const r = await api.preparePayment(academyId, selIds, payIdemRef.current.key);
      if (r.status !== "PENDING") {
        return { ok: false, message: `결제 준비 상태 이상: ${r.status}` };
      }
      const wh = await fetch("/api/webhooks/pg/mockpg", {
        method: "POST",
        headers: { "content-type": "application/json", "x-webhook-secret": "dev-mockpg-secret" },
        body: JSON.stringify({
          kind: "payment", providerEventId: `evt-live-${crypto.randomUUID()}`,
          paymentId: r.paymentId, targetStatus: "CAPTURED", occurredAt: new Date().toISOString(),
        }),
      });
      const whBody = (await wh.json().catch(() => ({}))) as { decision?: string };
      if (!wh.ok || whBody.decision !== "APPLY") {
        // RECONCILE·IGNORE 등은 "완료"가 아니다 — 확인 중으로 안내
        return { ok: false, message: `결제 확인 중 (webhook: ${whBody.decision ?? wh.status}) — 잠시 후 다시 확인해주세요` };
      }
      // 서버 진실 재조회: Payment CAPTURED + 선택 청구서 전부 PAID
      const ps = await api.getPayment(academyId, r.paymentId);
      if (ps.status !== "CAPTURED") {
        return { ok: false, message: `결제 미확정 (Payment=${ps.status}) — 확인 중` };
      }
      const notPaid = ps.invoices.filter((i) => selIds.includes(i.invoiceId) && i.status !== "PAID");
      if (notPaid.length > 0) {
        return { ok: false, message: `청구서 반영 확인 중 (${notPaid[0].status})` };
      }
      await refresh();
      setSel({});
      payIdemRef.current = null; // 성공 — 키 폐기
      setPayResult({ paymentId: r.paymentId, amount: r.amount });
      return { ok: true };
    } catch (e) {
      // 재시도 시 같은 멱등키 유지(payIdemRef 보존) — 서버 REPLAY 로 수렴
      return { ok: false, message: e instanceof ApiError ? `${e.status} ${e.code}` : String(e) };
    } finally {
      setPaying(false);
    }
  }, [paying, selIds, academyId, refresh]);

  const resetPay = useCallback(() => setPayResult(null), []);
  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  const value: LiveCtx = {
    state, live: state === "LIVE_READY", errorMsg, userName, academyId,
    invoices, sel, toggle, selIds, selAmount,
    paying, payResult, pay, resetPay, refresh, retry,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/* 실연결 상태 배지 — 상태 모델을 그대로 표시(P0-2: 오류를 숨기지 않음) */
export function LiveBadge() {
  const { state, userName, errorMsg, retry } = useLive();
  if (state === "LIVE_READY") {
    return (
      <div className="mx-4 mt-2 rounded-lg bg-emerald-100 px-3 py-1.5 text-center text-[11.5px] font-bold text-emerald-800">
        🔌 실연결 모드 — {userName} 세션 · 실 API·실 DB (fixture 아님)
      </div>
    );
  }
  if (state === "LIVE_ERROR") {
    return (
      <div className="mx-4 mt-2 rounded-lg bg-red-100 px-3 py-1.5 text-center text-[11.5px] font-bold text-red-800">
        ⚠️ 실연결 오류 ({errorMsg}) — 가짜 데이터로 전환하지 않았어요{" "}
        <button onClick={retry} className="underline underline-offset-2">다시 시도</button>
      </div>
    );
  }
  return null; // FIXTURE_PREVIEW·LOADING — 데모 화면 그대로
}
