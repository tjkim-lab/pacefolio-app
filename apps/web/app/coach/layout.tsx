"use client";

import { TenantProvider } from "@/lib/mock/tenant";
import { PhoneFrame, BottomNav, type Tab } from "@/components/mobile/MobileShell";
import { IconHome, IconWhistle, IconChat, IconUser } from "@/components/ui/icons";
import { CoachProvider } from "./_state";
import { Toast } from "./_components/Bits";
import ClassMode from "./_components/ClassMode";
import LibrarySheet from "./_components/LibrarySheet";
import AbsSheet from "./_components/AbsSheet";
import IncidentSheet from "./_components/IncidentSheet";
import ReviewSheet from "./_components/ReviewSheet";

const tabs: Tab[] = [
  { href: "/coach", label: "오늘", icon: IconHome },
  { href: "/coach/class", label: "수업", icon: IconWhistle },
  { href: "/coach/chat", label: "소통", icon: IconChat },
  { href: "/coach/me", label: "내 정보", icon: IconUser },
];

export default function CoachLayout({ children }: { children: React.ReactNode }) {
  return (
    <TenantProvider>
      <CoachProvider>
        {/* theme-coach: 헤더·강조 딥그린 역할 토큰 (의미 불변 — accent 는 항상 밝은 틸) */}
        <div className="theme-coach contents">
          <PhoneFrame>
            {children}
            <BottomNav tabs={tabs} />
            {/* 앱 전역 오버레이 (폰 프레임 전체 덮음) */}
            <ClassMode />
            <LibrarySheet />
            <AbsSheet />
            <IncidentSheet />
            <ReviewSheet />
            <Toast />
          </PhoneFrame>
        </div>
      </CoachProvider>
    </TenantProvider>
  );
}
