"use client";

/* 데스크톱 콘솔 공용 셸 — 좌측 사이드바 + 상단바 + 본문
   owner PC 콘솔 / admin 콘솔이 공유 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode, ComponentType } from "react";
import { cn } from "@/components/ui";

export interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<{ size?: number; className?: string }>;
}

export function ConsoleShell({
  brand,
  nav,
  title,
  actions,
  children,
}: {
  brand: { name: string; emoji: string; sub?: string };
  nav: NavItem[];
  title: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const path = usePathname();
  // 최장 일치 prefix = 실제 활성 항목 (홈이 하위 라우트에서 계속 활성되는 문제 방지)
  const activeHref = nav
    .map((n) => n.href)
    .filter((h) => path === h || path.startsWith(h + "/"))
    .sort((a, b) => b.length - a.length)[0];
  return (
    <div className="min-h-screen flex bg-fill text-ink">
      {/* Sidebar (다크) */}
      <aside className="w-60 shrink-0 bg-side text-side-ink flex flex-col">
        <div className="h-16 flex items-center gap-2.5 px-5 border-b border-white/10">
          <span className="text-2xl">{brand.emoji}</span>
          <div>
            <div className="font-extrabold text-[15px] leading-none text-side-ink-strong">
              {brand.name}
            </div>
            {brand.sub && (
              <div className="text-[11px] text-side-ink mt-1">{brand.sub}</div>
            )}
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {nav.map((n) => {
            const active = n.href === activeHref;
            const Icon = n.icon;
            return (
              <Link
                key={n.href}
                href={n.href}
                className={cn(
                  "flex items-center gap-3 px-3 h-11 rounded-xl text-[14px] font-semibold transition",
                  active
                    ? "bg-side-active text-side-ink-strong"
                    : "text-side-ink hover:bg-white/5 hover:text-side-ink-strong",
                )}
              >
                <Icon size={20} />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 text-[11px] text-side-ink border-t border-white/10">
          PACEFOLIO · 프로토타입
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-16 shrink-0 bg-surface/90 backdrop-blur border-b border-line flex items-center justify-between px-8">
          <h1 className="text-[19px] font-extrabold tracking-tight">{title}</h1>
          <div className="flex items-center gap-2">{actions}</div>
        </header>
        <main className="flex-1 overflow-y-auto p-8">
          <div className="mx-auto max-w-6xl space-y-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
