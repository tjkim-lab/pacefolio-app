"use client";

/* 보호자 온보딩 — 공용 스캐폴드·상태 컴포넌트.
   요청서 §9 컴포넌트 목록 이식(온보딩 로컬 스코프 · 기존 토큰·Button 재사용).
   전 화면 구조 고정: [상단(뒤로/진행)] [큰 제목] [짧은 설명] [콘텐츠] [하단 고정 CTA]. */

import type { ReactNode } from "react";
import { cn, Button } from "@/components/ui";
import { IconArrowLeft } from "@/components/ui/icons";

/* ---------- 스캐폴드 ---------- */
export function OnboardingLayout({
  top, children, cta,
}: { top?: ReactNode; children: ReactNode; cta?: ReactNode }) {
  return (
    <div className="flex-1 flex flex-col min-h-0">
      {top && <div className="shrink-0">{top}</div>}
      <main className="flex-1 overflow-y-auto overscroll-contain px-5 pt-2 pb-4">{children}</main>
      {cta && <div className="shrink-0 px-5 pt-3 pb-6 bg-fill/95 backdrop-blur border-t border-line2">{cta}</div>}
    </div>
  );
}

/* ---------- 상단바(뒤로 + 진행) ---------- */
export function OnboardingTopBar({
  onBack, index, total,
}: { onBack?: () => void; index?: number; total?: number }) {
  return (
    <div className="h-14 flex items-center gap-3 px-3">
      {onBack ? (
        <button onClick={onBack} aria-label="뒤로"
          className="grid place-items-center min-w-11 min-h-11 rounded-xl text-ink hover:bg-fill transition">
          <IconArrowLeft size={24} />
        </button>
      ) : <span className="w-11" />}
      {typeof index === "number" && typeof total === "number" && (
        <OnboardingProgress index={index} total={total} />
      )}
      <span className="w-11 shrink-0" />
    </div>
  );
}

/* ---------- 진행 표시(세그먼트 바) ---------- */
export function OnboardingProgress({ index, total }: { index: number; total: number }) {
  return (
    <div className="flex-1 flex items-center gap-1.5" role="progressbar"
      aria-valuemin={1} aria-valuemax={total} aria-valuenow={index + 1}
      aria-label={`가입 단계 ${index + 1} / ${total}`}>
      {Array.from({ length: total }).map((_, i) => (
        <span key={i}
          className={cn("h-1.5 flex-1 rounded-full transition-colors",
            i <= index ? "bg-accent" : "bg-line")} />
      ))}
    </div>
  );
}

/* ---------- 큰 제목 + 짧은 설명 ---------- */
export function PageHeader({
  title, sub, question,
}: { title: ReactNode; sub?: ReactNode; question?: boolean }) {
  return (
    <header className="mb-6 mt-2">
      <h1 className="text-[24px] font-extrabold leading-[1.35] tracking-tight text-ink whitespace-pre-line">
        {question && <span className="text-accent">“</span>}
        {title}
        {question && <span className="text-accent">”</span>}
      </h1>
      {sub && <p className="mt-3 text-[14.5px] leading-relaxed text-ink2 font-medium whitespace-pre-line">{sub}</p>}
    </header>
  );
}

/* ---------- 하단 고정 CTA(주 1개 + 보조 텍스트버튼) ---------- */
export function BottomCTA({
  primary, onPrimary, primaryDisabled, loading,
  secondary, onSecondary, note,
}: {
  primary: string; onPrimary: () => void; primaryDisabled?: boolean; loading?: boolean;
  secondary?: string; onSecondary?: () => void; note?: ReactNode;
}) {
  return (
    <div>
      {note && <div className="text-[12px] text-ink3 text-center mb-2.5 leading-relaxed">{note}</div>}
      <Button full variant="primary" onClick={onPrimary} disabled={primaryDisabled || loading}>
        {loading ? "잠시만요…" : primary}
      </Button>
      {secondary && onSecondary && (
        <button onClick={onSecondary}
          className="w-full mt-2 min-h-11 text-[14px] font-semibold text-ink3 hover:text-ink2 transition">
          {secondary}
        </button>
      )}
    </div>
  );
}

/* ---------- 캐러셀 dot ---------- */
export function Dots({ index, total }: { index: number; total: number }) {
  return (
    <div className="flex gap-1.5 justify-center" aria-hidden>
      {Array.from({ length: total }).map((_, i) => (
        <span key={i}
          className={cn("h-1.5 rounded-full transition-all", i === index ? "w-5 bg-accent" : "w-1.5 bg-line")} />
      ))}
    </div>
  );
}

/* ---------- 인라인 오류(입력창 근처 · 색 외 아이콘도 병행) ---------- */
export function InlineError({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="flex items-start gap-1.5 mt-2 text-[13px] font-semibold text-danger-ink">
      <span aria-hidden className="mt-px">⚠</span>
      <span>{children}</span>
    </div>
  );
}

/* ---------- 빈 상태(원생 없음 등) ---------- */
export function EmptyState({
  emoji, title, body, children,
}: { emoji: string; title: string; body: ReactNode; children?: ReactNode }) {
  return (
    <div className="pt-8 text-center">
      <div aria-hidden className="text-[44px] mb-3">{emoji}</div>
      <h2 className="text-[20px] font-extrabold text-ink leading-snug">{title}</h2>
      <p className="mt-3 text-[14px] text-ink2 font-medium leading-relaxed">{body}</p>
      {children && <div className="mt-5">{children}</div>}
    </div>
  );
}

/* ---------- 로딩 스켈레톤 ---------- */
export function LoadingSkeleton() {
  return (
    <div className="pt-10" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">등록된 정보를 확인하고 있어요</span>
      <div className="mx-auto mb-6 h-11 w-11 rounded-full border-[3px] border-line border-t-accent animate-spin" />
      <div className="space-y-3">
        {[0, 1].map((i) => (
          <div key={i} className="rounded-2xl border border-line bg-surface p-4 flex items-center gap-3">
            <span className="h-12 w-12 rounded-full bg-line2 animate-pulse" />
            <span className="flex-1 space-y-2">
              <span className="block h-3.5 w-24 rounded bg-line2 animate-pulse" />
              <span className="block h-3 w-36 rounded bg-line2 animate-pulse" />
            </span>
          </div>
        ))}
      </div>
      <p className="text-center text-[13px] text-ink3 font-medium mt-6">등록된 정보를 확인하고 있어요…</p>
    </div>
  );
}
