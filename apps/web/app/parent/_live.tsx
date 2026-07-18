"use client";

/* Gate 2 완성형 — 학부모 청구·결제 화면의 실 API 연결 계층.
   apps/api(:3001, /api rewrite)가 살아 있으면: dev 로그인(박서연) →
   실 DB 청구서 → 결제 준비 → PG 시뮬(mockpg CAPTURED 웹훅) → PAID 반영.
   API 가 없으면 live=false — 기존 fixture 데모가 그대로 동작(디자인 검수 안전).
   UI 는 api-client 만 사용(fetch 직접 호출은 웹훅 시뮬 한 곳 — dev 전용). */

import {
  createContext, useCallback, useContext, useEffect, useState, type ReactNode,
} from "react";
import { createApiClient } from "@pacefolio/api-client";

const ACADEMY = "a_wondergym";
const api = createApiClient({ baseUrl: "/api" });

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

interface LiveCtx {
  live: boolean;
  userName?: string;
  invoices: LiveInvoice[];
  sel: Record<string, boolean>;
  toggle: (invoiceId: string) => void;
  selIds: string[];
  selAmount: number;
  paying: boolean;
  payResult: PayResult | null;
  pay: () => Promise<boolean>;
  resetPay: () => void;
  refresh: () => Promise<void>;
}

const Ctx = createContext<LiveCtx | null>(null);
export const useLive = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useLive must be used within LiveBillingProvider");
  return c;
};

export function LiveBillingProvider({ children }: { children: ReactNode }) {
  const [live, setLive] = useState(false);
  const [userName, setUserName] = useState<string>();
  const [invoices, setInvoices] = useState<LiveInvoice[]>([]);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [paying, setPaying] = useState(false);
  const [payResult, setPayResult] = useState<PayResult | null>(null);

  const refresh = useCallback(async () => {
    const list = await api.listInvoices(ACADEMY);
    setInvoices(list.invoices);
  }, []);

  /* API 감지 + 보호자 세션 확보 — 실패는 조용히 fixture 모드 */
  useEffect(() => {
    (async () => {
      try {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 1500);
        const probe = await fetch("/api/sessions/me", { signal: ctl.signal, credentials: "include" });
        clearTimeout(t);
        if (probe.status !== 401 && !probe.ok) return; // API 부재(404/500) → fixture
        if (probe.status === 401) await api.devLogin("박서연");
        let me = await api.me();
        const isGuardian = me.memberships.some(
          (m) => m.academyId === ACADEMY && m.roles.includes("GUARDIAN"),
        );
        if (!isGuardian) {
          // gate2 러너 등이 원장 세션을 남겼을 수 있음 — 보호자로 전환
          await api.logout().catch(() => undefined);
          await api.devLogin("박서연");
          me = await api.me();
        }
        setUserName(me.user.name);
        await refresh();
        setLive(true);
      } catch {
        /* fixture 모드 유지 */
      }
    })();
  }, [refresh]);

  const toggle = useCallback((invoiceId: string) => {
    setSel((prev) => ({ ...prev, [invoiceId]: !prev[invoiceId] }));
  }, []);

  const selIds = invoices
    .filter((iv) => iv.status === "ISSUED" && sel[iv.invoiceId])
    .map((iv) => iv.invoiceId);
  const selAmount = invoices
    .filter((iv) => selIds.includes(iv.invoiceId))
    .reduce((s, iv) => s + iv.total, 0);

  /* 결제: 준비(서버 금액 계산·멱등키) → PG 시뮬 웹훅(CAPTURED) → 재조회.
     실 PG 연동(Gate 3) 시 웹훅 시뮬 자리에 PG SDK 호출이 들어간다. */
  const pay = useCallback(async (): Promise<boolean> => {
    if (paying || selIds.length === 0) return false;
    setPaying(true);
    try {
      const r = await api.preparePayment(ACADEMY, selIds, `live-${crypto.randomUUID()}`);
      const wh = await fetch("/api/webhooks/pg/mockpg", {
        method: "POST",
        headers: { "content-type": "application/json", "x-webhook-secret": "dev-mockpg-secret" },
        body: JSON.stringify({
          kind: "payment", providerEventId: `evt-live-${crypto.randomUUID()}`,
          paymentId: r.paymentId, targetStatus: "CAPTURED", occurredAt: new Date().toISOString(),
        }),
      });
      if (!wh.ok) throw new Error(`webhook ${wh.status}`);
      await refresh();
      setSel({});
      setPayResult({ paymentId: r.paymentId, amount: r.amount });
      return true;
    } finally {
      setPaying(false);
    }
  }, [paying, selIds, refresh]);

  const resetPay = useCallback(() => setPayResult(null), []);

  const value: LiveCtx = {
    live, userName, invoices, sel, toggle, selIds, selAmount,
    paying, payResult, pay, resetPay, refresh,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/* 실연결 상태 배지 — 청구·결제 화면 상단 공용 */
export function LiveBadge() {
  const { live, userName } = useLive();
  if (!live) return null;
  return (
    <div className="mx-4 mt-2 rounded-lg bg-emerald-100 px-3 py-1.5 text-center text-[11.5px] font-bold text-emerald-800">
      🔌 실연결 모드 — {userName} 세션 · 실 API·실 DB (fixture 아님)
    </div>
  );
}
