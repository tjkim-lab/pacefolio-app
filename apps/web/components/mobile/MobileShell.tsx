"use client";

/* 모바일 앱 공용 셸 — 390px 폰 프레임 + 상태바 + 하단 탭바
   owner / parent / coach 앱이 공유 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode, ComponentType } from "react";
import { cn } from "@/components/ui";
import { IconArrowLeft } from "@/components/ui/icons";

export interface Tab {
  href: string;
  label: string;
  icon: ComponentType<{ size?: number; className?: string }>;
}

export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen w-full flex items-start justify-center bg-[#eef1f4] py-6 px-3">
      <div className="relative w-[390px] max-w-full h-[844px] max-h-[92vh] rounded-[44px] bg-black p-[6px] shadow-2xl">
        <div className="relative h-full w-full overflow-hidden rounded-[38px] bg-fill flex flex-col">
          {/* 상태바 */}
          <div className="shrink-0 h-11 flex items-center justify-between px-6 pt-1 text-[13px] font-semibold text-ink">
            <span>9:41</span>
            <div className="absolute left-1/2 -translate-x-1/2 top-1.5 h-6 w-28 rounded-full bg-black" />
            <span className="flex items-center gap-1 text-[11px]">
              <span>5G</span>
              <span>􀛨</span>
              <span className="inline-block w-6 h-3 rounded-[3px] border border-ink relative">
                <span className="absolute inset-[2px] right-1.5 bg-ink rounded-[1px]" />
              </span>
            </span>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

export function AppHeader({
  title,
  back,
  right,
}: {
  title: ReactNode;
  back?: string;
  right?: ReactNode;
}) {
  return (
    <header className="shrink-0 h-14 flex items-center gap-2 px-4 bg-fill/95 backdrop-blur border-b border-line2">
      {back && (
        <Link href={back} className="p-1 -ml-1 text-ink" aria-label="뒤로">
          <IconArrowLeft size={24} />
        </Link>
      )}
      <div className="flex-1 text-[17px] font-bold text-ink truncate">{title}</div>
      {right}
    </header>
  );
}

export function BottomNav({ tabs }: { tabs: Tab[] }) {
  const path = usePathname();
  // 최장 일치 prefix = 실제 활성 탭 (홈 탭이 하위 라우트에서 계속 활성되는 문제 방지)
  const activeHref = tabs
    .map((t) => t.href)
    .filter((h) => path === h || path.startsWith(h + "/"))
    .sort((a, b) => b.length - a.length)[0];
  return (
    <nav className="shrink-0 h-[68px] bg-surface border-t border-line flex items-stretch px-2 pb-2">
      {tabs.map((t) => {
        const active = t.href === activeHref;
        const Icon = t.icon;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "flex-1 flex flex-col items-center justify-center gap-1 pt-1 transition",
              active ? "text-accent" : "text-ink3",
            )}
          >
            <Icon size={24} />
            <span className="text-[11px] font-semibold">{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/* 스크롤되는 본문 영역 */
export function AppScroll({ children }: { children: ReactNode }) {
  return (
    <main className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 space-y-4">
      {children}
    </main>
  );
}
