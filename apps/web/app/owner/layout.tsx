"use client";

import { TenantProvider } from "@/lib/mock/tenant";
import { PhoneFrame, BottomNav, type Tab } from "@/components/mobile/MobileShell";
import { IconHome, IconCard, IconUsers, IconBuilding } from "@/components/ui/icons";

const tabs: Tab[] = [
  { href: "/owner", label: "홈", icon: IconHome },
  { href: "/owner/students", label: "원생", icon: IconUsers },
  { href: "/owner/payments", label: "수납", icon: IconCard },
  { href: "/owner/academy", label: "학원", icon: IconBuilding },
];

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  return (
    <TenantProvider>
      <PhoneFrame>
        {children}
        <BottomNav tabs={tabs} />
      </PhoneFrame>
    </TenantProvider>
  );
}
