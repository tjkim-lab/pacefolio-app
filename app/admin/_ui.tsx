"use client";

/* 관리자 콘솔 전용 인터랙션 프리미티브 (데이터 배열 export 금지 — _data.ts 참조) */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/components/ui";
import type { MeterTone } from "./_data";

/* ---------- 미터 ---------- */
export function Meter({ pct, tone = "normal" }: { pct: number; tone?: MeterTone }) {
  const fill = { normal: "bg-accent", low: "bg-warn", full: "bg-danger" }[tone];
  return (
    <div className="h-[7px] flex-1 min-w-[80px] rounded bg-line overflow-hidden">
      <div className={cn("h-full rounded transition-all", fill)} style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  );
}

export function MetricRow({
  label,
  value,
  pct,
  tone = "normal",
  labelWidth = 128,
}: {
  label: string;
  value: string;
  pct: number;
  tone?: MeterTone;
  labelWidth?: number;
}) {
  return (
    <div className="flex items-center gap-2.5 mt-2 text-[12px] font-semibold text-ink3">
      <span className="text-ink2 shrink-0" style={{ flexBasis: labelWidth }}>
        {label}
      </span>
      <Meter pct={pct} tone={tone} />
      <span className="shrink-0 w-[42px] text-right tabular-nums text-ink">{value}</span>
    </div>
  );
}

/* ---------- 서비스 상태 점 ---------- */
export function ServiceDot({ state }: { state: "ok" | "warn" | "down" }) {
  const c = { ok: "bg-accent", warn: "bg-warn", down: "bg-danger" }[state];
  return <span className={cn("w-[9px] h-[9px] rounded-full shrink-0", c)} />;
}

/* ---------- 패널 ---------- */
export function Panel({
  title,
  note,
  children,
  className,
}: {
  title?: ReactNode;
  note?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-2xl bg-surface border border-line p-4 min-w-0", className)}>
      {title && (
        <h4 className="flex items-center justify-between gap-2 mb-2.5 text-[13px] font-bold text-ink2">
          <span>{title}</span>
          {note && <span className="text-[11px] font-medium text-ink3">{note}</span>}
        </h4>
      )}
      {children}
    </div>
  );
}

/* ---------- 인라인 노트 ---------- */
export function Note({
  children,
  tone = "plain",
}: {
  children: ReactNode;
  tone?: "plain" | "warn" | "inpanel";
}) {
  const s = {
    plain: "bg-surface border border-line text-ink2",
    warn: "bg-warn-weak text-warn-ink",
    inpanel: "bg-fill text-ink2",
  }[tone];
  return (
    <div className={cn("flex gap-2.5 items-start rounded-xl px-3.5 py-3 mt-3 text-[12px] font-medium leading-relaxed", s)}>
      {children}
    </div>
  );
}

/* ---------- 필터 칩 ---------- */
export function FilterChips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-2 flex-wrap items-center">
      {options.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className={cn(
            "h-8 px-3.5 rounded-full text-[12px] font-semibold border transition",
            value === o.key
              ? "bg-accent-strong border-accent-strong text-white"
              : "bg-surface border-line text-ink2 hover:bg-fill",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- 서브탭 ---------- */
export function SubTabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-2 flex-wrap mb-3.5" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.key}
          role="tab"
          aria-selected={value === t.key}
          onClick={() => onChange(t.key)}
          className={cn(
            "h-8 px-3.5 rounded-full text-[12px] font-semibold border transition",
            value === t.key
              ? "bg-accent-strong border-accent-strong text-white"
              : "bg-surface border-line text-ink2 hover:bg-fill",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- 검색 박스 ---------- */
export function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="flex items-center gap-2 bg-surface border border-line rounded-xl px-3 h-9 min-w-[250px]">
      <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" className="text-ink3">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 bg-transparent text-[13px] font-medium text-ink outline-none min-w-0"
      />
    </div>
  );
}

/* ---------- 빈 상태 ---------- */
export function Empty({ emoji, title, sub }: { emoji: string; title: string; sub: string }) {
  return (
    <div className="text-center py-6">
      <div className="text-[30px]">{emoji}</div>
      <div className="text-[14px] font-extrabold mt-1.5 text-accent-ink">{title}</div>
      <div className="text-[11.5px] text-ink3 font-medium mt-0.5">{sub}</div>
    </div>
  );
}

/* ---------- 토스트 ---------- */
export function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toast = useCallback((m: string) => {
    setMsg(m);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), 2400);
  }, []);
  const toastView = (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "fixed left-1/2 bottom-8 z-[400] -translate-x-1/2 rounded-full px-4.5 py-2.5 text-[12.5px] font-bold text-white bg-[#1f2933] shadow-lg transition-all max-w-[88%] text-center",
        msg ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 pointer-events-none",
      )}
    >
      {msg}
    </div>
  );
  return { toast, toastView };
}

/* ---------- 확인 모달 ---------- */
export interface ConfirmOpts {
  title: string;
  sub?: string;
  rows?: [string, string][];
  warn?: string;
  memo?: { label: string; placeholder: string; big?: boolean; required?: boolean };
  memo2?: { label: string; placeholder: string; big?: boolean };
  label?: string;
  onConfirm?: (memo: string, memo2: string) => void;
}

export function useConfirm() {
  const [opts, setOpts] = useState<ConfirmOpts | null>(null);
  const [busy, setBusy] = useState(false);
  const [m1, setM1] = useState("");
  const [m2, setM2] = useState("");
  const [err, setErr] = useState(false);

  const confirm = useCallback((o: ConfirmOpts) => {
    setOpts(o);
    setM1("");
    setM2("");
    setErr(false);
    setBusy(false);
  }, []);

  const close = useCallback(() => {
    setOpts(null);
    setBusy(false);
  }, []);

  useEffect(() => {
    if (!opts) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [opts, busy, close]);

  const run = () => {
    if (busy || !opts) return;
    if (opts.memo?.required && !m1.trim()) {
      setErr(true);
      return;
    }
    setBusy(true);
    setTimeout(() => {
      const cb = opts.onConfirm;
      const a = m1.trim();
      const b = m2.trim();
      close();
      cb?.(a, b);
    }, 900);
  };

  const confirmView = opts ? (
    <div
      className="fixed inset-0 z-[300] grid place-items-center bg-[rgba(25,31,40,.5)] p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) close();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-[460px] max-w-full max-h-[88%] overflow-y-auto bg-surface rounded-2xl p-5 shadow-2xl"
      >
        <h3 className="text-[16px] font-extrabold tracking-tight mb-1">{opts.title}</h3>
        {opts.sub && <div className="text-[12px] text-ink3 font-medium mb-1">{opts.sub}</div>}

        {opts.rows && opts.rows.length > 0 && (
          <div className="bg-fill rounded-xl px-3.5 py-1 mt-2.5">
            {opts.rows.map((r, i) => (
              <div
                key={i}
                className="flex justify-between items-baseline gap-2.5 py-2.5 text-[13px] border-b border-line2 last:border-0 tabular-nums"
              >
                <span className="text-ink2 font-medium">{r[0]}</span>
                <span className="font-bold text-ink text-right">{r[1]}</span>
              </div>
            ))}
          </div>
        )}

        {opts.warn && (
          <div className="text-[12px] text-ink2 font-medium leading-relaxed bg-warn-weak rounded-xl px-3 py-2.5 mt-2.5">
            {opts.warn}
          </div>
        )}

        {opts.memo && (
          <div className="mt-3">
            <label className="block text-[11.5px] font-bold text-ink2 mb-1.5">{opts.memo.label}</label>
            {opts.memo.big ? (
              <textarea
                value={m1}
                onChange={(e) => {
                  setM1(e.target.value);
                  setErr(false);
                }}
                placeholder={opts.memo.placeholder}
                className={cn(
                  "w-full rounded-xl bg-fill border px-3 py-2.5 text-[13px] text-ink outline-none focus:bg-surface focus:border-accent resize-none min-h-[74px]",
                  err ? "border-danger" : "border-line",
                )}
              />
            ) : (
              <input
                value={m1}
                onChange={(e) => {
                  setM1(e.target.value);
                  setErr(false);
                }}
                placeholder={opts.memo.placeholder}
                className={cn(
                  "w-full rounded-xl bg-fill border px-3 py-2.5 text-[13px] text-ink outline-none focus:bg-surface focus:border-accent",
                  err ? "border-danger" : "border-line",
                )}
              />
            )}
          </div>
        )}

        {opts.memo2 && (
          <div className="mt-3">
            <label className="block text-[11.5px] font-bold text-ink2 mb-1.5">{opts.memo2.label}</label>
            <textarea
              value={m2}
              onChange={(e) => setM2(e.target.value)}
              placeholder={opts.memo2.placeholder}
              className="w-full rounded-xl bg-fill border border-line px-3 py-2.5 text-[13px] text-ink outline-none focus:bg-surface focus:border-accent resize-none min-h-[74px]"
            />
          </div>
        )}

        <div className="flex gap-2 mt-3.5">
          <button
            onClick={() => !busy && close()}
            disabled={busy}
            className="w-24 shrink-0 rounded-xl bg-fill text-ink2 font-bold text-[13.5px] py-3 disabled:opacity-60"
          >
            취소
          </button>
          <button
            onClick={run}
            disabled={busy}
            className="flex-1 rounded-xl bg-accent-strong text-white font-bold text-[13.5px] py-3 disabled:opacity-70 inline-flex items-center justify-center gap-1.5"
          >
            {busy && (
              <span className="inline-block w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            )}
            {busy ? "처리 중..." : opts.label || "확인"}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return { confirm, confirmView };
}
