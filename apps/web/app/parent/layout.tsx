"use client";

import { TenantProvider } from "@/lib/mock/tenant";
import { PhoneFrame } from "@/components/mobile/MobileShell";
import { ParentProvider } from "./_state";
import { LiveBillingProvider } from "./_live";
import { ParentNav, Sheets, Toast } from "./_components";

export default function ParentLayout({ children }: { children: React.ReactNode }) {
  return (
    <TenantProvider>
      <ParentProvider>
        <LiveBillingProvider>
          <PhoneFrame>
            {children}
            <ParentNav />
            <Sheets />
            <Toast />
          </PhoneFrame>
        </LiveBillingProvider>
      </ParentProvider>
    </TenantProvider>
  );
}
