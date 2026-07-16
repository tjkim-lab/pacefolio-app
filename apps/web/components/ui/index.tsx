/* PACEFOLIO 공용 UI 키트 — 5개 앱이 공유하는 프리미티브 (Clean 톤) */
import type { ReactNode } from "react";
import { IconChevron } from "./icons";

export function cn(...xs: (string | false | null | undefined)[]) {
  return xs.filter(Boolean).join(" ");
}

/* ---------- Button ---------- */
export function Button({
  children,
  variant = "primary",
  full,
  className,
  ...rest
}: {
  children: ReactNode;
  variant?: "primary" | "soft" | "ghost" | "line";
  full?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const styles = {
    primary: "bg-accent-strong text-white hover:brightness-110 active:brightness-95",
    soft: "bg-accent-weak text-brand hover:brightness-97",
    ghost: "bg-fill text-ink2 hover:bg-line2",
    line: "border border-line text-ink hover:bg-fill",
  }[variant];
  return (
    <button
      className={cn(
        // h-12(48px) ≥ 터치 최소 44px
        "inline-flex items-center justify-center gap-1.5 rounded-xl px-4 h-12 text-[15px] font-semibold transition select-none",
        "disabled:opacity-50 disabled:pointer-events-none",
        full && "w-full",
        styles,
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ---------- IconButton (44px 히트영역 보장) ---------- */
export function IconButton({
  children,
  className,
  ...rest
}: { children: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "grid place-items-center min-w-11 min-h-11 rounded-xl text-ink2 hover:bg-fill transition",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ---------- Card ---------- */
export function Card({
  children,
  className,
  pad = true,
  ...rest
}: { children: ReactNode; pad?: boolean } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl bg-surface border border-line",
        pad && "p-4",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

/* ---------- Tag / Badge ---------- */
export function Tag({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "accent" | "warn" | "danger" | "muted" | "gold" | "info";
}) {
  const styles = {
    accent: "bg-accent-weak text-brand",
    warn: "bg-warn-weak text-warn-ink",
    danger: "bg-danger-weak text-danger-ink",
    gold: "bg-gold-weak text-gold",
    info: "bg-info-weak text-info-ink",
    muted: "bg-fill text-ink2",
  }[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
        styles,
      )}
    >
      {children}
    </span>
  );
}

/* ---------- SectionTitle ---------- */
export function SectionTitle({
  children,
  right,
}: {
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-1 mb-2 mt-1">
      <h2 className="text-[15px] font-bold text-ink">{children}</h2>
      {right && <div className="text-[13px] text-ink3">{right}</div>}
    </div>
  );
}

/* ---------- 질문형 제목 (제품이 사람 말로 질문) ---------- */
export function QTitle({ children }: { children: ReactNode }) {
  return (
    <h1 className="text-[22px] font-extrabold leading-snug text-ink">
      <span className="text-accent">“</span>
      {children}
      <span className="text-accent">”</span>
    </h1>
  );
}

/* ---------- ListRow ---------- */
export function ListRow({
  leading,
  title,
  sub,
  trailing,
  onClick,
  arrow,
}: {
  leading?: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  arrow?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 py-3 text-left transition active:bg-fill rounded-xl px-1"
    >
      {leading && <div className="shrink-0">{leading}</div>}
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-semibold text-ink truncate">{title}</div>
        {sub && <div className="text-[13px] text-ink3 truncate mt-0.5">{sub}</div>}
      </div>
      {trailing && <div className="shrink-0 text-right">{trailing}</div>}
      {arrow && <IconChevron size={18} className="shrink-0 text-ink3" />}
    </button>
  );
}

/* ---------- StatTile ---------- */
export function StatTile({
  label,
  value,
  sub,
  tone = "ink",
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "ink" | "accent" | "danger";
}) {
  const vc = { ink: "text-ink", accent: "text-accent-ink", danger: "text-danger-ink" }[tone];
  return (
    <div className="rounded-2xl bg-surface border border-line p-4">
      <div className="text-[13px] text-ink3 font-medium">{label}</div>
      <div className={cn("mt-1 text-[22px] font-extrabold tracking-tight", vc)}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[12px] text-ink3">{sub}</div>}
    </div>
  );
}

/* ---------- Avatar ---------- */
export function Avatar({
  name,
  color = "#12b5a5",
  size = 40,
}: {
  name: string;
  color?: string;
  size?: number;
}) {
  return (
    <div
      className="flex items-center justify-center rounded-full text-white font-bold"
      style={{ width: size, height: size, background: color, fontSize: size * 0.4 }}
    >
      {name.slice(0, 1)}
    </div>
  );
}

/* ---------- ProgressBar ---------- */
export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2 w-full rounded-full bg-line2 overflow-hidden">
      <div
        className="h-full rounded-full bg-accent transition-all"
        style={{ width: `${Math.round(value * 100)}%` }}
      />
    </div>
  );
}

/* ---------- Divider ---------- */
export const Divider = () => <div className="h-px bg-line2 my-1" />;
