"use client";

/* 코치 앱 로컬 프리미티브 — 토스트·바텀시트·선택칩.
   공용 키트에 없는 오버레이/칩만 여기서. 색은 전부 토큰 클래스. */

import type { ReactNode } from "react";
import { cn } from "@/components/ui";
import { useCoach } from "../_state";

export function Toast() {
  const { toast } = useCoach();
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "pointer-events-none absolute left-1/2 bottom-24 z-[400] -translate-x-1/2 max-w-[90%]",
        "rounded-full bg-side px-4 py-2.5 text-[12.5px] font-semibold text-white shadow-float",
        "transition-all duration-200",
        toast ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2",
      )}
    >
      <span className="block truncate">{toast}</span>
    </div>
  );
}

/* 바텀시트 — 폰 프레임 내부 absolute 오버레이 */
export function Sheet({
  open,
  onClose,
  title,
  sub,
  children,
  z = "z-[380]",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  sub?: ReactNode;
  children: ReactNode;
  z?: string;
}) {
  if (!open) return null;
  return (
    <div
      className={cn("absolute inset-0 flex items-end", z)}
      style={{ background: "var(--overlay)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-h-[80%] overflow-y-auto rounded-t-3xl bg-surface px-5 pt-3 pb-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3.5 h-1.5 w-10 rounded-full bg-line" />
        <h3 className="text-[18px] font-extrabold text-ink">{title}</h3>
        {sub && <div className="mt-1 text-[12.5px] font-medium text-ink3 leading-relaxed">{sub}</div>}
        <div className="mt-2">{children}</div>
      </div>
    </div>
  );
}

/* 선택 칩 (단일/다중) */
export function Chip({
  on,
  children,
  onClick,
}: {
  on?: boolean;
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center rounded-full border px-3 min-h-9 text-[11.5px] font-semibold transition",
        on
          ? "border-accent bg-accent-weak text-accent-ink"
          : "border-line bg-surface text-ink2",
      )}
    >
      {children}
    </button>
  );
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return <div className="mt-2.5 mb-1 text-[11.5px] font-bold text-ink2">{children}</div>;
}
