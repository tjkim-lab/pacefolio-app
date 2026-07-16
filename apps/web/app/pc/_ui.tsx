"use client";

/* 원장 PC 콘솔 전용 프리미티브 + 오버레이(확인 모달·토스트) 훅.
   공용 키트(components/ui) 위에서 목업의 밀도·인터랙션을 재현한다.
   색은 전부 토큰 클래스 — hex 하드코딩 없음. */

import { useCallback, useRef, useState, type ReactNode } from "react";
import { Card, Tag, Button, cn } from "@/components/ui";
import { IconCheck, IconSpark } from "@/components/ui/icons";

/* ---------- Panel (h4 헤더 + 본문) ---------- */
export function Panel({
  title,
  hnote,
  hnoteAccent,
  children,
  className,
}: {
  title: ReactNode;
  hnote?: ReactNode;
  hnoteAccent?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("min-w-0", className)}>
      {(title || hnote) && (
        <div className="flex items-center justify-between gap-2 mb-3">
          <h4 className="text-[13px] font-bold text-ink2">{title}</h4>
          {hnote && (
            <span className={cn("text-[11px] font-medium shrink-0", hnoteAccent ? "text-brand font-bold" : "text-ink3")}>
              {hnote}
            </span>
          )}
        </div>
      )}
      {children}
    </Card>
  );
}

/* ---------- RL — 라벨/서브 · 금액 행 ---------- */
export function RL({
  label,
  sub,
  amount,
  tone = "ink",
  total,
  disc,
}: {
  label: ReactNode;
  sub?: ReactNode;
  amount: ReactNode;
  tone?: "ink" | "accent" | "danger" | "warn";
  total?: boolean;
  disc?: boolean;
}) {
  const ac = disc
    ? "text-brand"
    : { ink: "text-ink", accent: "text-brand", danger: "text-danger-ink", warn: "text-warn-ink" }[tone];
  return (
    <div className={cn("flex items-baseline justify-between gap-2.5 py-2 border-b border-line2 last:border-0 tabular-nums")}>
      <span className={cn("text-[13px]", total ? "text-ink font-bold" : "text-ink2 font-medium")}>
        {label}
        {sub && <small className="block text-[11px] text-ink3 font-medium mt-0.5">{sub}</small>}
      </span>
      <span className={cn("text-right whitespace-nowrap font-bold", total ? "text-[15px]" : "text-[13px]", ac)}>
        {amount}
      </span>
    </div>
  );
}

/* ---------- Pill (목업 pill → Tag tone) ---------- */
const PILL_TONE = { ok: "accent", due: "danger", wait: "warn", gray: "muted" } as const;
export function Pill({ kind, children }: { kind: keyof typeof PILL_TONE; children: ReactNode }) {
  return <Tag tone={PILL_TONE[kind]}>{children}</Tag>;
}

/* ---------- Meter ---------- */
export function Meter({ pct, tone = "accent" }: { pct: number; tone?: "accent" | "full" | "low" }) {
  const bg = { accent: "bg-accent", full: "bg-danger", low: "bg-warn" }[tone];
  return (
    <div className="h-[7px] flex-1 min-w-[90px] rounded bg-line overflow-hidden">
      <div className={cn("h-full rounded transition-all", bg)} style={{ width: `${pct}%` }} />
    </div>
  );
}

/* ---------- Note (안내 박스) ---------- */
export function Note({ children, inPanel, icon }: { children: ReactNode; inPanel?: boolean; icon?: ReactNode }) {
  return (
    <div
      className={cn(
        "flex gap-2.5 items-start rounded-xl px-3.5 py-3 text-[12px] text-ink2 font-medium leading-relaxed",
        inPanel ? "bg-fill mt-2.5" : "bg-surface border border-line mt-3",
      )}
    >
      <span className="text-accent mt-0.5 shrink-0">{icon ?? <IconSpark size={16} />}</span>
      <span>{children}</span>
    </div>
  );
}

/* ---------- ActBtn — 테이블/패널 보조 버튼 (36px) ---------- */
export function ActBtn({
  children,
  soft,
  className,
  ...rest
}: { children: ReactNode; soft?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-lg text-[12px] font-bold transition select-none disabled:opacity-60 disabled:pointer-events-none",
        soft ? "bg-surface border border-line text-brand hover:bg-fill" : "bg-accent-strong text-white hover:brightness-110",
        className,
      )}
    >
      {children}
    </button>
  );
}

/* ---------- FilterChip ---------- */
export function FilterChip({
  active,
  children,
  className,
  ...rest
}: { active?: boolean; children: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      aria-pressed={active}
      className={cn(
        "text-[12px] font-semibold px-3.5 py-[7px] rounded-full border transition select-none",
        active ? "bg-accent-strong border-accent-strong text-white" : "bg-surface border-line text-ink2 hover:bg-fill",
        className,
      )}
    >
      {children}
    </button>
  );
}

/* ---------- 선택 카드형 칩 (dchip) ---------- */
export function DChip({
  active,
  title,
  sub,
  className,
  ...rest
}: { active?: boolean; title: ReactNode; sub?: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      aria-pressed={active}
      className={cn(
        "flex-1 min-w-[100px] text-left rounded-xl px-3 py-2.5 border-[1.5px] transition text-[12px] font-bold",
        active ? "border-accent bg-accent-weak text-brand" : "border-line bg-surface text-ink2 hover:bg-fill",
        className,
      )}
    >
      {title}
      {sub && <small className={cn("block text-[10px] font-medium mt-0.5", active ? "text-brand" : "text-ink3")}>{sub}</small>}
    </button>
  );
}

/* ============================================================
   오버레이 훅 — 확인 모달 + 토스트 (페이지-로컬)
   사용: const { confirm, toast, overlays } = useOverlays();
         return <>...{overlays}</>
   ============================================================ */
export interface ConfirmOpts {
  title: string;
  sub?: string;
  rows?: [string, string][];
  warn?: string;
  memo?: string;
  label?: string;
  onConfirm?: (memo: string) => void;
}

export function useOverlays() {
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [opts, setOpts] = useState<ConfirmOpts | null>(null);
  const [busy, setBusy] = useState(false);
  const [memo, setMemo] = useState("");

  const toastTimer = useRef<number | undefined>(undefined);
  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMsg(null), 2000);
  }, []);

  const confirm = useCallback((o: ConfirmOpts) => {
    setMemo("");
    setBusy(false);
    setOpts(o);
  }, []);

  const close = useCallback(() => {
    setOpts(null);
    setBusy(false);
  }, []);

  const run = useCallback(() => {
    if (!opts || busy) return;
    setBusy(true);
    window.setTimeout(() => {
      const cb = opts.onConfirm;
      const m = memo.trim();
      setOpts(null);
      setBusy(false);
      cb?.(m);
    }, 700);
  }, [opts, busy, memo]);

  const overlays = (
    <>
      {opts && (
        <div
          className="fixed inset-0 z-[300] grid place-items-center p-6 bg-[color:var(--overlay)]"
          onClick={(e) => { if (e.target === e.currentTarget && !busy) close(); }}
          onKeyDown={(e) => { if (e.key === "Escape" && !busy) close(); }}
          role="dialog"
          aria-modal="true"
        >
          <div className="w-[440px] max-w-full max-h-[88%] overflow-y-auto bg-surface rounded-2xl p-5 shadow-[var(--shadow-modal)]">
            <h3 className="text-[16px] font-extrabold text-ink">{opts.title}</h3>
            {opts.sub && <div className="text-[12px] text-ink3 font-medium mt-1">{opts.sub}</div>}
            {opts.rows && opts.rows.length > 0 && (
              <div className="bg-fill rounded-xl px-3.5 py-1 mt-3">
                {opts.rows.map((r, i) => (
                  <div key={i} className="flex items-baseline justify-between gap-2.5 py-2 border-b border-line2 last:border-0 text-[13px] tabular-nums">
                    <span className="text-ink2 font-medium">{r[0]}</span>
                    <span className="text-ink font-bold text-right">{r[1]}</span>
                  </div>
                ))}
              </div>
            )}
            {opts.warn && (
              <div className="text-[12px] text-ink2 font-medium leading-relaxed bg-warn-weak rounded-xl px-3 py-2.5 mt-3">
                {opts.warn}
              </div>
            )}
            {opts.memo && (
              <input
                autoFocus
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder={opts.memo}
                className="w-full mt-2.5 border border-line rounded-lg bg-fill px-3 py-2.5 text-[13px] text-ink focus:outline-none focus:border-accent focus:bg-surface"
              />
            )}
            <div className="flex gap-2 mt-3.5">
              <Button variant="ghost" className="flex-[0_0_96px]" onClick={close} disabled={busy}>취소</Button>
              <Button variant="primary" full onClick={run} disabled={busy}>
                {busy ? <><Spinner />처리 중...</> : opts.label || "확인"}
              </Button>
            </div>
          </div>
        </div>
      )}
      {toastMsg && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-7 z-[400] bg-ink text-white text-[12.5px] font-bold px-4.5 py-2.5 rounded-full whitespace-nowrap shadow-[var(--shadow-float)]">
          {toastMsg}
        </div>
      )}
    </>
  );

  return { toast, confirm, overlays };
}

export function Spinner() {
  return (
    <span className="inline-block w-3.5 h-3.5 mr-1.5 rounded-full border-2 border-white/40 border-t-white animate-spin align-[-2px]" />
  );
}

export const CheckMark = ({ size = 14 }: { size?: number }) => <IconCheck size={size} />;
