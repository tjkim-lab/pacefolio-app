"use client";

import { useEffect, useRef, useState } from "react";
import { AppScroll } from "@/components/mobile/MobileShell";
import { Ic } from "../../_icons";
import { useParent } from "../../_state";
import { NoteRow, PushHeader } from "../../_components";

export default function CoachRoomPage() {
  const { content } = useParent();
  const coachTitle = content.chat.coach;
  const coachName = coachTitle.replace(/\s*1:1$/, "");
  const [mine, setMine] = useState<string[]>([]);
  const [text, setText] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => { bottom.current?.scrollIntoView(); }, [mine]);
  const send = () => { const v = text.trim(); if (!v) return; setMine((m) => [...m, v]); setText(""); };

  return (
    <>
      <PushHeader title={coachTitle} sub="코치와 1:1 · 개별 기록·컨디션" />
      <AppScroll>
        <div className="text-center text-[11px] text-ink3 font-semibold">어제 오전 11:40</div>

        <div className="flex gap-2.5 items-start">
          <span className="grid place-items-center w-[34px] h-[34px] rounded-xl bg-fill text-ink2 text-[12px] font-extrabold shrink-0">코치</span>
          <div className="max-w-[76%]">
            <div className="text-[11px] font-bold text-ink3 mb-1">{coachName}</div>
            <div className="bg-fill rounded-[4px_16px_16px_16px] px-3.5 py-2.5 text-[13.5px] font-medium leading-normal">{content.chat.coachPrev}. 물도 잘 마셨고 끝까지 잘 참여했어요 🙂</div>
          </div>
        </div>

        <div className="flex justify-end">
          <div className="bg-accent-strong text-white rounded-[16px_4px_16px_16px] px-3.5 py-2.5 text-[13.5px] font-medium max-w-[76%]">감사합니다 코치님! 내일도 잘 부탁드려요</div>
        </div>

        {mine.map((m, i) => (
          <div key={i} className="flex justify-end">
            <div className="bg-accent-strong text-white rounded-[16px_4px_16px_16px] px-3.5 py-2.5 text-[13.5px] font-medium max-w-[76%]">{m}</div>
          </div>
        ))}

        <NoteRow icon="lock">개별 결석·컨디션·성장 기록은 <b className="text-ink">1:1 채널에서만</b> 오가요 — 전체방엔 표시되지 않아요.</NoteRow>
        <div ref={bottom} />

        <div className="sticky bottom-0 flex gap-2 pt-3 pb-1 bg-gradient-to-t from-fill to-transparent">
          <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="코치에게 1:1 메시지" aria-label="코치 1:1 메시지 입력"
            className="flex-1 rounded-full border-[1.5px] border-line px-4 py-2.5 text-[13.5px] outline-none bg-surface text-ink focus:border-accent" />
          <button onClick={send} aria-label="보내기" className="grid place-items-center w-11 h-11 rounded-full bg-accent-strong text-white shrink-0"><Ic name="send" size={18} /></button>
        </div>
      </AppScroll>
    </>
  );
}
