"use client";

import { TenantProvider } from "@/lib/mock/tenant";
import { PhoneFrame, BottomNav, type Tab } from "@/components/mobile/MobileShell";
import { cn } from "@/components/ui";
import { IconHome, IconChat, IconCard, IconUsers, IconBuilding } from "@/components/ui/icons";
import { OwnerChatProvider, useOwnerChat } from "./chat/_state";

/* 소통 탭 뱃지 = 채팅 안읽음 합 — provider 안에서 계산 */
function OwnerNav() {
  const { totalUnread } = useOwnerChat();
  const tabs: Tab[] = [
    { href: "/owner", label: "홈", icon: IconHome },
    { href: "/owner/chat", label: "소통", icon: IconChat, badge: totalUnread },
    { href: "/owner/students", label: "원생", icon: IconUsers },
    { href: "/owner/payments", label: "수납", icon: IconCard },
    { href: "/owner/academy", label: "학원", icon: IconBuilding },
  ];
  return <BottomNav tabs={tabs} />;
}

function ChatToast() {
  const { toast } = useOwnerChat();
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "pointer-events-none absolute left-1/2 bottom-24 z-40 max-w-[85%] -translate-x-1/2 whitespace-nowrap rounded-full bg-ink px-[18px] py-2.5 text-[12.5px] font-bold text-white transition-all duration-200",
        toast ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2",
      )}
    >
      {toast}
    </div>
  );
}

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  return (
    <TenantProvider>
      <OwnerChatProvider>
        <PhoneFrame>
          {children}
          <ChatToast />
          <OwnerNav />
        </PhoneFrame>
      </OwnerChatProvider>
    </TenantProvider>
  );
}
