"use client";

import { ConsoleShell, type NavItem } from "@/components/console/ConsoleShell";
import {
  IconHome,
  IconGrid,
  IconBuilding,
  IconCard,
  IconBell,
  IconChat,
  IconSettings,
} from "@/components/ui/icons";

const nav: NavItem[] = [
  { href: "/admin", label: "통합 홈", icon: IconHome },
  { href: "/admin/tasks", label: "운영 작업함", icon: IconGrid },
  { href: "/admin/academies", label: "학원 관리", icon: IconBuilding },
  { href: "/admin/payments", label: "수강료 관제", icon: IconCard },
  { href: "/admin/comm", label: "커뮤니케이션", icon: IconBell },
  { href: "/admin/cs", label: "CS · 지원", icon: IconChat },
  { href: "/admin/system", label: "시스템 · 감사", icon: IconSettings },
];

export function AdminShell({
  title,
  actions,
  children,
}: {
  title: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <ConsoleShell
      brand={{ name: "PACEFOLIO", emoji: "🛰️", sub: "본사 운영 콘솔 · Super Admin" }}
      nav={nav}
      title={title}
      actions={actions}
    >
      {children}
    </ConsoleShell>
  );
}
