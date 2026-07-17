"use client";

/* PACEFOLIO 원장 앱 — 화면 공용 인터랙션 프리미티브
   (목업의 confirm 바텀시트 · toast · rl 로우 · 미터 · 노트 재현) */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/components/ui";
import { IconCheck } from "@/components/ui/icons";

/* ---------- 바텀시트 (13A — 숫자 카드 클릭 → 명단 + 다음 행동) ---------- */
export function OwnerSheet({
  title,
  sub,
  onClose,
  children,
}: {
  title: string;
  sub?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="absolute inset-0 z-[200] flex items-end bg-ink/45" onClick={onClose} role="presentation">
      <div
        className="max-h-[76%] w-full overflow-y-auto rounded-t-[24px] bg-surface px-5 pt-4 pb-7"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="mx-auto mb-3.5 h-[5px] w-10 rounded-full bg-line" />
        <h3 className="text-[18px] font-extrabold text-ink">{title}</h3>
        {sub && <div className="mt-0.5 text-[12.5px] text-ink3">{sub}</div>}
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}

/* ---------- Spinner ---------- */
export function Spinner() {
  return (
    <span className="mr-1.5 inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white align-[-2px]" />
  );
}

/* ---------- Toast ---------- */
export function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  const tm = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toast = useCallback((m: string) => {
    setMsg(m);
    if (tm.current) clearTimeout(tm.current);
    tm.current = setTimeout(() => setMsg(null), 2000);
  }, []);
  useEffect(() => () => { if (tm.current) clearTimeout(tm.current); }, []);
  const toastNode = (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "pointer-events-none absolute left-1/2 bottom-24 z-40 -translate-x-1/2 whitespace-nowrap rounded-full bg-ink px-[18px] py-2.5 text-[12.5px] font-bold text-white transition-all duration-200",
        msg ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2",
      )}
    >
      {msg}
    </div>
  );
  return { toast, toastNode };
}

/* ---------- Confirm 바텀시트 (imperative) ---------- */
export interface ConfirmOpts {
  title: string;
  sub?: string;
  rows?: [string, ReactNode][];
  warn?: string;
  memo?: string; // 있으면 메모 입력창 노출 (placeholder)
  label?: string;
  onConfirm?: (memo: string) => void;
}

export function useConfirm() {
  const [opts, setOpts] = useState<ConfirmOpts | null>(null);
  const confirm = useCallback((o: ConfirmOpts) => setOpts(o), []);
  const confirmNode = opts ? (
    <ConfirmView opts={opts} onClose={() => setOpts(null)} />
  ) : null;
  return { confirm, confirmNode };
}

function ConfirmView({ opts, onClose }: { opts: ConfirmOpts; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [memo, setMemo] = useState("");
  const okRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    okRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const doOk = () => {
    if (busy) return;
    setBusy(true);
    setTimeout(() => {
      onClose();
      opts.onConfirm?.(memo.trim());
    }, 900);
  };

  return (
    <div
      className="absolute inset-0 z-30 flex items-end justify-center bg-ink/45"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="max-h-[80%] w-full overflow-y-auto rounded-t-[22px] bg-surface p-5 pb-6"
      >
        <h3 className="text-[16.5px] font-extrabold tracking-tight text-ink">{opts.title}</h3>
        {opts.sub && <div className="mt-1 text-[12px] font-medium text-ink3">{opts.sub}</div>}
        {opts.rows && opts.rows.length > 0 && (
          <div className="mt-2.5 rounded-xl bg-fill px-3.5 py-1">
            {opts.rows.map(([l, v], i) => (
              <RLRow key={i} label={l} amount={v} />
            ))}
          </div>
        )}
        {opts.warn && (
          <div className="mt-2.5 rounded-[10px] bg-warn-weak px-3 py-2.5 text-[12px] font-medium leading-relaxed text-ink2">
            {opts.warn}
          </div>
        )}
        {opts.memo !== undefined && (
          <input
            type="text"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder={opts.memo}
            className="mt-2.5 w-full rounded-[10px] border border-line bg-fill px-3 py-2.5 text-[13px] text-ink outline-none focus:border-accent focus:bg-surface"
          />
        )}
        <div className="mt-3.5 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => !busy && onClose()}
            className="h-12 shrink-0 basis-24 rounded-2xl bg-fill text-[14px] font-bold text-ink2 disabled:opacity-65"
          >
            취소
          </button>
          <button
            ref={okRef}
            type="button"
            disabled={busy}
            onClick={doOk}
            className="h-12 flex-1 rounded-2xl bg-accent-strong text-[14px] font-bold text-white disabled:opacity-65"
          >
            {busy ? (
              <>
                <Spinner />
                처리 중...
              </>
            ) : (
              opts.label ?? "확인"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- RLRow (라벨 / 보조설명 / 금액) ---------- */
export function RLRow({
  label,
  small,
  amount,
  amountClass,
  total,
}: {
  label: ReactNode;
  small?: ReactNode;
  amount: ReactNode;
  amountClass?: string;
  total?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-2.5 border-b border-line2 text-[13.5px] tabular-nums last:border-b-0",
        total ? "py-3" : "py-2.5",
      )}
    >
      <span className={cn("font-medium text-ink2", total && "text-[14.5px] font-bold text-ink")}>
        {label}
        {small && <small className="mt-0.5 block text-[11.5px] font-medium text-ink3">{small}</small>}
      </span>
      <span
        className={cn(
          "whitespace-nowrap text-right font-bold text-ink",
          total && "text-[17px] font-extrabold",
          amountClass,
        )}
      >
        {amount}
      </span>
    </div>
  );
}

/* ---------- Meter (정원/진행 미터, tone 지원) ---------- */
export function Meter({ pct, tone = "ok" }: { pct: number; tone?: "ok" | "full" | "low" }) {
  const bar = { ok: "bg-accent", full: "bg-danger", low: "bg-warn" }[tone];
  return (
    <div className="mt-2 h-[7px] overflow-hidden rounded bg-line2">
      <div className={cn("h-full rounded transition-all", bar)} style={{ width: `${pct}%` }} />
    </div>
  );
}

/* ---------- SentNote (발송 후 안내 배너) ---------- */
export function SentNote({ children, tone = "accent" }: { children: ReactNode; tone?: "accent" | "danger" }) {
  return (
    <div
      className={cn(
        "mt-2.5 rounded-xl px-3.5 py-2.5 text-[12.5px] font-semibold leading-normal",
        tone === "accent" ? "bg-accent-weak text-accent-ink" : "bg-danger-weak text-danger-ink",
      )}
    >
      {children}
    </div>
  );
}

/* ---------- Note (라인 아이콘 + 설명 카드) ---------- */
export function Note({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="mt-3 flex items-start gap-2.5 rounded-2xl border border-line px-3.5 py-3 text-[12.5px] font-medium leading-normal text-ink2">
      <span className="mt-0.5 shrink-0 text-accent">{icon}</span>
      <span>{children}</span>
    </div>
  );
}

/* ---------- 카드 제목 (h4 · 우측 힌트) ---------- */
export function CardH4({
  children,
  note,
  noteAc,
}: {
  children: ReactNode;
  note?: ReactNode;
  noteAc?: boolean;
}) {
  return (
    <h4 className="mb-2 flex items-center justify-between gap-2 text-[13.5px] font-bold text-ink">
      <span>{children}</span>
      {note && (
        <span className={cn("text-[11px] font-medium", noteAc ? "font-bold text-accent-ink" : "text-ink3")}>
          {note}
        </span>
      )}
    </h4>
  );
}

/* ---------- 체크박스 행 (보강/마법사 공용) ---------- */
export function CheckRow({
  checked,
  radio,
  title,
  sub,
  trailing,
  onClick,
}: {
  checked: boolean;
  radio?: boolean;
  title: ReactNode;
  sub?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
}) {
  return (
    <div
      role={radio ? "radio" : "checkbox"}
      aria-checked={checked}
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
      className={cn(
        "mt-2.5 flex cursor-pointer items-center gap-2.5 rounded-xl border-[1.5px] px-3 py-3 transition",
        checked ? "border-accent bg-accent-weak" : "border-line bg-surface",
      )}
    >
      <span
        className={cn(
          "grid h-6 w-6 shrink-0 place-items-center border-2 text-white",
          radio ? "rounded-full" : "rounded-lg",
          checked ? "border-accent bg-accent" : "border-ink3/60",
        )}
      >
        {checked && <IconCheck size={14} className="stroke-[2.6]" />}
      </span>
      <div className="flex-1 text-[13.5px] font-bold text-ink">
        {title}
        {sub && <small className="block text-[11.5px] font-medium text-ink3">{sub}</small>}
      </div>
      {trailing && <div className="shrink-0 text-right">{trailing}</div>}
    </div>
  );
}

/* ---------- 선택 칩 (dchip: 라벨 + 보조설명) ---------- */
export function DChip({
  active,
  title,
  sub,
  onClick,
}: {
  active: boolean;
  title: ReactNode;
  sub?: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "min-w-24 flex-1 rounded-xl border-[1.5px] px-3 py-2.5 text-left text-[12.5px] font-bold transition",
        active ? "border-accent bg-accent-weak text-accent-ink" : "border-line bg-surface text-ink2",
      )}
    >
      {title}
      {sub && (
        <small className={cn("mt-0.5 block text-[10.5px] font-medium", active ? "text-accent-ink" : "text-ink3")}>
          {sub}
        </small>
      )}
    </button>
  );
}

/* ---------- 필터/대상 칩 (pill) ---------- */
export function PillChip({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "min-h-11 rounded-full border-[1.5px] px-3.5 text-[12.5px] font-semibold transition",
        active ? "border-accent-strong bg-accent-strong text-white" : "border-line bg-surface text-ink2",
      )}
    >
      {children}
    </button>
  );
}

/* ---------- 홈/탭 상단 인사 헤더 ---------- */
export function Greeting({
  title,
  sub,
  bellDot,
  bell,
}: {
  title: ReactNode;
  sub: ReactNode;
  bellDot?: boolean;
  bell: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2.5 px-0.5 pt-1">
      <div>
        <div className="text-[20px] font-extrabold leading-tight tracking-tight text-ink">{title}</div>
        <div className="mt-0.5 text-[12.5px] font-medium text-ink3">{sub}</div>
      </div>
      <div className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-fill text-ink2">
        {bell}
        {bellDot && (
          <span className="absolute right-2.5 top-2 h-[7px] w-[7px] rounded-full border-[1.5px] border-fill bg-danger" />
        )}
      </div>
    </div>
  );
}
