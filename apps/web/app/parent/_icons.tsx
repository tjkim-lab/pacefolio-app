/* 학부모 앱 전용 라인 아이콘 확장 (공용 icons.tsx 에 없는 것만 추가)
   Clean 표준: stroke 1.8, currentColor. 공용 아이콘은 재사용. */
import type { SVGProps } from "react";
import type { ComponentType } from "react";
import type { IconKey } from "./_data";
import {
  IconHome, IconCalendar, IconChat, IconUser, IconBell, IconCheck,
  IconBook, IconClock, IconChevron, IconArrowLeft,
} from "@/components/ui/icons";

type P = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 24, children, ...rest }: P & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      {children}
    </svg>
  );
}

export const IconCam = (p: P) => (
  <Svg {...p}><path d="M3 8a2 2 0 0 1 2-2h2l1.5-2h7L19 6a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><circle cx="12" cy="13" r="3.5" /></Svg>
);
export const IconAward = (p: P) => (
  <Svg {...p}><circle cx="12" cy="9" r="6" /><path d="M8.5 14 7 22l5-3 5 3-1.5-8" /></Svg>
);
export const IconMega = (p: P) => (
  <Svg {...p}><path d="M3 11v2a1 1 0 0 0 1 1h2l9 5V5L6 10H4a1 1 0 0 0-1 1z" /><path d="M18 8a4 4 0 0 1 0 8" /></Svg>
);
export const IconSend = (p: P) => (
  <Svg {...p}><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4z" /></Svg>
);
export const IconLock = (p: P) => (
  <Svg {...p}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></Svg>
);
export const IconShield = (p: P) => (
  <Svg {...p}><path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" /><path d="M9.5 12l1.8 1.8 3.2-3.6" /></Svg>
);
export const IconLoop = (p: P) => (
  <Svg {...p}><path d="M4 12a8 8 0 0 1 14-5l2 2M20 12a8 8 0 0 1-14 5l-2-2" /><path d="M18 3v4h-4M6 21v-4h4" /></Svg>
);
export const IconTrend = (p: P) => (
  <Svg {...p}><path d="M3 17l6-6 4 4 8-8" /><path d="M17 7h4v4" /></Svg>
);
export const IconBulb = (p: P) => (
  <Svg {...p}><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.2 1 2.5h6c0-1.3.3-1.8 1-2.5A6 6 0 0 0 12 3z" /></Svg>
);
export const IconDoc = (p: P) => (
  <Svg {...p}><path d="M6 2h9l4 4v16H6z" /><path d="M15 2v4h4M9 12h6M9 16h6" /></Svg>
);
export const IconHelp = (p: P) => (
  <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M9.2 9.2a2.8 2.8 0 0 1 5.4 1c0 1.9-2.8 2.5-2.8 2.5" /><path d="M12 17h.01" /></Svg>
);
export const IconTrophy = (p: P) => (
  <Svg {...p}><path d="M7 4h10v4a5 5 0 0 1-10 0z" /><path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M9 20h6M12 13v4" /></Svg>
);

const REG: Record<IconKey, ComponentType<{ size?: number; className?: string }>> = {
  home: IconHome, cal: IconCalendar, chat: IconChat, user: IconUser, bell: IconBell,
  check: IconCheck, cam: IconCam, award: IconAward, mega: IconMega, clock: IconClock,
  book: IconBook, chev: IconChevron, back: IconArrowLeft, send: IconSend, lock: IconLock,
  shield: IconShield, loop: IconLoop, trend: IconTrend, bulb: IconBulb, doc: IconDoc,
  help: IconHelp, trophy: IconTrophy,
};

export function Ic({ name, size = 20, className }: { name: IconKey; size?: number; className?: string }) {
  const C = REG[name];
  return <C size={size} className={className} />;
}
