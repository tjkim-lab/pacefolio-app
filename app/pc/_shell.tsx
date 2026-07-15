"use client";

import { TenantProvider } from "@/lib/mock/tenant";
import { ConsoleShell, type NavItem } from "@/components/console/ConsoleShell";
import {
  IconChart,
  IconCard,
  IconUsers,
  IconCalendar,
  IconChat,
  IconWhistle,
  IconSpark,
  IconSettings,
} from "@/components/ui/icons";
import { academy } from "@/lib/mock/data";

const nav: NavItem[] = [
  { href: "/pc", label: "대시보드", icon: IconChart },
  { href: "/pc/students", label: "원생", icon: IconUsers },
  { href: "/pc/lessons", label: "수업 관리", icon: IconCalendar },
  { href: "/pc/payments", label: "수납", icon: IconCard },
  { href: "/pc/notice", label: "공지 · 소통", icon: IconChat },
  { href: "/pc/coaches", label: "강사", icon: IconWhistle },
  { href: "/pc/competitions", label: "대회", icon: IconSpark },
  { href: "/pc/settings", label: "설정", icon: IconSettings },
];

export function PCShell({
  title,
  actions,
  children,
}: {
  title: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <TenantProvider>
      <ConsoleShell
        brand={{ name: academy.name, emoji: academy.logoEmoji, sub: "원장 콘솔" }}
        nav={nav}
        title={title}
        actions={actions}
      >
        {children}
      </ConsoleShell>
    </TenantProvider>
  );
}
