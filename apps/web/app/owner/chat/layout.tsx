"use client";

/* 소통 섹션 공용 레이아웃 — 목록·방 상세가 같은 라이브 컨텍스트 공유(#39-②) */
import { OwnerChatLiveProvider } from "./_live";

export default function OwnerChatLayout({ children }: { children: React.ReactNode }) {
  return <OwnerChatLiveProvider>{children}</OwnerChatLiveProvider>;
}
