"use client";

/* 원장 앱 — 소통: 대화 목록 (docs/12-communication.md §대화 구조)
   코치(전체방·반 담당방·1:1) / 학부모 1:1(원생 컨텍스트) /
   코치↔학부모 관리 열람. 시각 표준 = clean(틸 1액센트·라인 카드). */

import Link from "next/link";
import { AppHeader, AppScroll } from "@/components/mobile/MobileShell";
import { cn } from "@/components/ui";
import { IconChat } from "@/components/ui/icons";
import { useOwnerChat } from "./_state";
import { OWNER_ROOMS, type OwnerRoom } from "./_data";

export default function OwnerChatList() {
  const coaches = OWNER_ROOMS.filter((r) => r.group === "coach");
  const guardians = OWNER_ROOMS.filter((r) => r.group === "guardian");
  const watches = OWNER_ROOMS.filter((r) => r.group === "watch");

  return (
    <>
      <AppHeader title="소통" />
      <AppScroll>
        <div className="px-1">
          <p className="text-[19px] font-extrabold tracking-tight text-ink">소통</p>
          <p className="mt-0.5 text-[12.5px] font-medium text-ink3">
            공지 말고 대화가 필요할 때 — 전화 없이 여기서
          </p>
        </div>

        <SectionLabel>코치</SectionLabel>
        <div className="space-y-2.5">
          {coaches.map((r) => (
            <ChatRow key={r.id} room={r} />
          ))}
        </div>

        <SectionLabel>학부모 1:1 — 원생 기준으로 열려요</SectionLabel>
        <div className="space-y-2.5">
          {guardians.map((r) => (
            <ChatRow key={r.id} room={r} />
          ))}
        </div>

        <SectionLabel>코치 ↔ 학부모 대화 · 관리 열람</SectionLabel>
        <div className="space-y-2.5">
          {watches.map((r) => (
            <ChatRow key={r.id} room={r} />
          ))}
        </div>
        <p className="px-1 text-[11px] font-medium leading-relaxed text-ink3">
          열람·참여는 모두 기록에 남아요 — 필요한 순간에만, 투명하게.
        </p>

        <div className="flex items-start gap-2.5 rounded-xl border border-line px-3.5 py-3 text-[12.5px] font-medium leading-relaxed text-ink2">
          <span className="mt-0.5 shrink-0 text-brand"><IconChat size={18} /></span>
          <span>
            <b className="text-ink">금액은 자유 텍스트로 담기지 않아요</b> — 서버가 만든 청구서
            카드로만 공유돼요(조건부 허용 · docs/12 개정). 건강정보는 해당 보호자·담당·원장 범위에서만. 밤 9시 이후 학부모 메시지는 다음 날 아침 8시에
            전달돼요 (긴급 결석·안전·차량 제외).
          </span>
        </div>
      </AppScroll>
    </>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="px-1 pt-1 text-[11px] font-bold text-ink3">{children}</div>;
}

function ChatRow({ room }: { room: OwnerRoom }) {
  const c = useOwnerChat();
  const pv = c.preview[room.id];
  const unread = c.unread[room.id];
  const watch = room.group === "watch";

  return (
    <Link
      href={`/owner/chat/${room.id}`}
      className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3.5"
    >
      {"emoji" in room.avatar ? (
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-fill text-[18px]">
          {room.avatar.emoji}
        </div>
      ) : (
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent-weak text-[15px] font-extrabold text-accent-ink">
          {room.avatar.ini}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[14.5px] font-bold text-ink">{room.name}</span>
          {watch && (
            <span className="shrink-0 rounded-full bg-fill px-2 py-0.5 text-[11px] font-bold text-ink3">
              열람
            </span>
          )}
        </div>
        {room.context && (
          <div className="mt-0.5 text-[11px] font-bold text-accent-ink">{room.context}</div>
        )}
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
