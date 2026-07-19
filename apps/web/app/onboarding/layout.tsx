/* 보호자 온보딩 레이아웃 — 폰 프레임만(하단 탭 없음).
   /parent 와 달리 가입 전 전체화면 흐름이므로 ParentProvider·ParentNav 미포함. */

import { PhoneFrame } from "@/components/mobile/MobileShell";

export default function OnboardingLayoutRoot({ children }: { children: React.ReactNode }) {
  return <PhoneFrame>{children}</PhoneFrame>;
}
