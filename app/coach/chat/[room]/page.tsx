"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { AppHeader, AppScroll } from "@/components/mobile/MobileShell";
import { cn } from "@/components/ui";
import { IconChat } from "@/components/ui/icons";
import { useCoach } from "../../_state";
import { ROOMS, type Msg } from "../../_data";

export default function CoachChatDetail() {
  const params = useParams<{ room: string }>();
  const roomId = params.room;
  const c = useCoach();
  const room = ROOMS.find((r) => r.id === roomId);
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const msgs = c.messages[roomId] ?? [];

  useEffect(() => {
    c.enterRoom(roomId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [msgs.length]);

  if (!room) {
    return (
      <>
        <AppHeader title="채팅" back="/coach/chat" />
        <AppScroll>
          <p className="text-[14px] text-ink3">채팅방을 찾을 수 없어요.</p>
        </AppScroll>
      </>
    );
  }

  const send = () => {
    if (!draft.trim()) return;
    c.sendMessage(roomId, draft);
    setDraft("");
  };

  return (
    <>
      <AppHeader title={room.name} back="/coach/chat" />
      <AppScroll>
        <div className="-mt-1 mb-2 text-[11.5px] font-medium text-ink3">{room.sub}</div>

        <div className="flex flex-col gap-2.5 pb-2">
          {msgs.map((m, i) => (
            <Bubble key={i} m={m} />
          ))}
          <div ref={endRef} />
        </div>

        {(roomId === "class" || roomId === "owner") && (
          <div className="flex items-start gap-2.5 rounded-xl border border-line px-3.5 py-3 text-[12px] font-medium leading-relaxed text-ink2">
            <span className="mt-0.5 shrink-0 text-brand"><IconChat size={16} /></span>
            <span>
              {roomId === "class" ? (
                <>
                  <b className="text-ink">전체방은 반 공통 내용만</b> — 개별 원생의 결석·기록·컨디션은 1:1 채널로만 오가요.
                </>
              ) : (
                <>
                  <b className="text-ink">전달사항은 확인 이력이 남아요</b> — 원장님께 확인 시각이 표시돼요.
                </>
              )}
            </span>
          </div>
        )}

        {/* 입력바 */}
        <div className="sticky bottom-0 flex gap-2 bg-fill py-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            aria-label="메시지 입력"
            placeholder="메시지 입력…"
            className="flex-1 rounded-full border border-line bg-surface px-4 py-2.5 text-[13.5px] text-ink focus:outline-none focus:border-accent"
          />
          <button
            onClick={send}
            aria-label="전송"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent-strong text-[15px] text-white"
          >
            ➤
          </button>
        </div>
      </AppScroll>
    </>
  );
}

function Bubble({ m }: { m: Msg }) {
  if (m.side === "sys") {
    return (
      <span className="mx-auto rounded-full bg-fill px-3 py-1 text-[10.5px] font-semibold text-ink3">
        {m.text}
      </span>
    );
  }
  if (m.side === "rep") {
    return (
      <div className="w-full rounded-2xl border border-accent-weak bg-accent-weak px-3.5 py-3 text-center">
        <div className="text-[13px] font-extrabold text-accent-ink">🎉 오늘 수업이 끝났어요</div>
        <div className="mt-0.5 text-[11px] font-medium leading-relaxed text-accent-ink/80">{m.text}</div>
        <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-accent-weak bg-surface px-3 py-1 text-[12.5px] font-extrabold text-accent-ink">
          👏 <b>{m.claps ?? 1}</b>
        </div>
      </div>
    );
  }
  const me = m.side === "me";
  return (
    <div
      className={cn(
        "max-w-[80%] rounded-2xl px-3 py-2.5 text-[13.5px] font-medium leading-snug",
        me
          ? "self-end rounded-br-sm bg-accent-strong text-white"
          : "self-start rounded-bl-sm border border-line bg-fill text-ink",
      )}
    >
      {!me && m.who && <span className="mb-0.5 block text-[10.5px] font-extrabold text-accent-ink">{m.who}</span>}
      {m.text}
      {m.time && <span className={cn("mt-1 block text-right text-[10.5px] font-medium", me ? "text-white/60" : "text-ink3")}>{m.time}</span>}
    </div>
  );
}
