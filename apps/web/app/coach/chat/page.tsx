"use client";

import Link from "next/link";
import { AppHeader, AppScroll } from "@/components/mobile/MobileShell";
import { cn } from "@/components/ui";
import { IconChat } from "@/components/ui/icons";
import { useCoach } from "../_state";
import { ROOMS } from "../_data";

export default function CoachChatList() {
  const c = useCoach();
  const channels = ROOMS.filter((r) => r.listGroup === "channel");
  const guardians = ROOMS.filter((r) => r.listGroup === "guardian");

  return (
    <>
      <AppHeader title="채팅" />
      <AppScroll>
        <div className="px-1">
          <p className="text-[19px] font-extrabold tracking-tight text-ink">채팅</p>
          <p className="mt-0.5 text-[12.5px] font-medium text-ink3">내 반 채널 · 자동 개설</p>
        </div>

        <div className="space-y-2.5">
          {channels.map((r) => (
            <ChatRow key={r.id} id={r.id} />
          ))}
        </div>

        <div className="px-1 pt-1 text-[11px] font-bold text-ink3">
          보호자 1:1 — 개별 결석·컨디션·기록은 전체방이 아니라 여기서만
        </div>
        <div className="space-y-2.5">
          {guardians.map((r) => (
            <ChatRow key={r.id} id={r.id} />
          ))}
        </div>

        <div className="flex items-start gap-2.5 rounded-xl border border-line px-3.5 py-3 text-[12.5px] font-medium leading-relaxed text-ink2">
          <span className="mt-0.5 shrink-0 text-brand"><IconChat size={18} /></span>
          <span>
            <b className="text-ink">밤 9시 이후 학부모 메시지는 다음 날 아침 8시에 전달</b>돼요 (학원 운영 설정 · 앱 전체 공통 기준) — 당일 결석·안전·차량 등 긴급 메시지는 예외로 바로 알려드려요.
          </span>
        </div>
      </AppScroll>
    </>
  );
}

function ChatRow({ id }: { id: string }) {
  const c = useCoach();
  const room = ROOMS.find((r) => r.id === id)!;
  const pv = c.preview[id];
  const unread = c.unread[id];
  return (
    <Link
      href={`/coach/chat/${id}`}
      className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3.5"
    >
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-fill text-[18px]">
        {room.avatar}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[14.5px] font-bold text-ink">{room.name}</div>
        <div className="mt-0.5 truncate text-[13px] font-medium text-ink3">{pv.text}</div>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-[11.5px] font-medium text-ink3">{pv.time}</div>
        {unread > 0 && (
          <span className={cn("mt-1.5 inline-grid h-5 min-w-5 place-items-center rounded-full bg-danger px-1.5 text-[11px] font-bold text-white")}>
            {unread}
          </span>
        )}
      </div>
    </Link>
  );
}
