"use client";

import { useEffect, useRef, useState } from "react";
import { AppScroll } from "@/components/mobile/MobileShell";
import { cn } from "@/components/ui";
import { Ic } from "../../_icons";
import { useParent } from "../../_state";
import { Html, PushHeader } from "../../_components";

export default function RoomPage() {
  const { content, detail, cur, dispatch, toast } = useParent();
  const d = detail.room;
  const [mine, setMine] = useState<string[]>([]);
  const [text, setText] = useState("");
  const bottom = useRef<HTMLDivElement>(null);

  // 방 진입 시 미읽음 정리 (박수 루프)
  useEffect(() => { dispatch({ t: "clearUnread" }); }, [dispatch]);
  useEffect(() => { bottom.current?.scrollIntoView(); }, [mine]);

  const send = () => { const v = text.trim(); if (!v) return; setMine((m) => [...m, v]); setText(""); };

  const clapText = cur.myClap ? `👏 ${cur.claps} · 내 박수 전달됨 ✓` : `👏 고생하셨어요 · ${cur.claps}`;
  const clapLine = cur.myClap
    ? `나와 ${d.parent} 외 ${Math.max(0, cur.claps - 2)}명이 박수를 보냈어요`
    : `${d.parent} 외 ${Math.max(0, cur.claps - 1)}명이 박수를 보냈어요`;

  return (
    <>
      <PushHeader title={content.chat.room} sub="학부모 12 · 코치 1" />
      <AppScroll>
        <div className="text-center text-[11px] text-ink3 font-semibold">{d.when}</div>

        {/* 코치 메시지 */}
        <div className="flex gap-2.5 items-start">
          <span className="grid place-items-center w-[34px] h-[34px] rounded-xl bg-fill text-ink2 text-[12px] font-extrabold shrink-0">코치</span>
          <div className="max-w-[76%]">
            <div className="text-[11px] font-bold text-ink3 mb-1">{d.coach}</div>
            <div className="bg-fill rounded-[4px_16px_16px_16px] px-3.5 py-2.5 text-[13.5px] font-medium leading-normal">{d.coachMsg}</div>
          </div>
        </div>

        {/* 수업 완료 카드 + 박수 */}
        <div className="ml-[43px] max-w-[82%] rounded-2xl border border-line overflow-hidden bg-surface">
          <div className="bg-accent-strong text-white px-3.5 py-2.5 text-[13px] font-extrabold">{d.cardH}</div>
          <div className="px-3.5 py-3 text-[12.5px] text-ink2 font-medium leading-relaxed"><Html html={d.cardB} /></div>
          <button onClick={() => { if (!cur.myClap) { dispatch({ t: "clap" }); toast("코치님께 박수를 보냈어요 👏"); } }}
            className={cn("mx-3 mb-1.5 w-[calc(100%-24px)] rounded-xl border-[1.5px] py-2.5 text-[13.5px] font-bold", cur.myClap ? "bg-accent-weak border-accent text-accent-ink" : "bg-fill border-line text-ink")}>
            {clapText}
          </button>
          <div className="px-3.5 pb-3 text-[11.5px] text-ink3 font-medium">{clapLine}</div>
        </div>

        {/* 학부모 메시지 */}
        <div className="flex gap-2.5 items-start">
          <span className="grid place-items-center w-[34px] h-[34px] rounded-xl bg-fill text-ink2 text-[12px] font-extrabold shrink-0">{d.parent.charAt(0)}</span>
          <div className="max-w-[76%]">
            <div className="text-[11px] font-bold text-ink3 mb-1">{d.parent}</div>
            <div className="bg-fill rounded-[4px_16px_16px_16px] px-3.5 py-2.5 text-[13.5px] font-medium">{d.parentMsg}</div>
          </div>
        </div>

        {/* 내가 보낸 메시지 */}
        {mine.map((m, i) => (
          <div key={i} className="flex justify-end">
            <div className="bg-accent-strong text-white rounded-[16px_4px_16px_16px] px-3.5 py-2.5 text-[13.5px] font-medium max-w-[76%]">{m}</div>
          </div>
        ))}

        <div className="text-center text-[11.5px] text-ink3 font-semibold bg-fill rounded-full px-4 py-2 mx-auto w-fit mt-2">🌙 밤 9시 이후에는 코치 알림이 다음 날 오전 8시에 전달될 수 있어요</div>
        <div ref={bottom} />

        <div className="sticky bottom-0 flex gap-2 pt-3 pb-1 bg-gradient-to-t from-fill to-transparent">
          <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="메시지 보내기" aria-label="반 채팅방 메시지 입력"
            className="flex-1 rounded-full border-[1.5px] border-line px-4 py-2.5 text-[13.5px] outline-none bg-surface text-ink focus:border-accent" />
          <button onClick={send} aria-label="보내기" className="grid place-items-center w-11 h-11 rounded-full bg-accent-strong text-white shrink-0"><Ic name="send" size={18} /></button>
        </div>
      </AppScroll>
    </>
  );
}
