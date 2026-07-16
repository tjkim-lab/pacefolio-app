"use client";

import { useState } from "react";
import { AppScroll } from "@/components/mobile/MobileShell";
import { cn } from "@/components/ui";
import { Ic } from "../_icons";
import { useParent } from "../_state";
import { NoteRow, PushHeader } from "../_components";

export default function LessonPage() {
  const { detail } = useParent();
  const d = detail.lesson;
  const [open, setOpen] = useState<number | null>(null);

  return (
    <>
      <PushHeader title="오늘의 진도" sub={d.sub} />
      <AppScroll>
        <div className="rounded-[18px] bg-accent-strong text-white p-[17px]">
          <span className="text-[11px] font-bold bg-white/20 inline-block px-2.5 py-1 rounded-full">{d.lk}</span>
          <h3 className="text-[19px] font-extrabold tracking-tight mt-2.5">{d.title}</h3>
          <div className="text-[12.5px] opacity-90 font-medium">{d.lm}</div>
          <div className="text-[12px] font-bold mt-3 opacity-95">진도 {d.prog}%</div>
          <div className="h-[7px] rounded bg-white/[0.28] mt-1.5 overflow-hidden"><div className="h-full bg-white rounded" style={{ width: `${d.prog}%` }} /></div>
        </div>

        <div className="rounded-2xl bg-surface border border-line p-4">
          <h4 className="flex justify-between items-center text-[14px] font-bold text-ink mb-1">오늘 이런 걸 해요 <span className="text-[11px] font-bold text-accent-ink bg-accent-weak px-2.5 py-1 rounded-full">오늘은 {d.acts.length}가지 활동</span></h4>
          {d.acts.map((a, i) => (
            <div key={i} className="border-b border-line2 last:border-0">
              <button onClick={() => setOpen(open === i ? null : i)} className="flex w-full gap-3 items-center py-3 text-left">
                <span className="grid place-items-center w-[38px] h-[38px] rounded-xl bg-fill text-[18px] shrink-0">{a.emoji}</span>
                <span className="flex-1 text-[13.5px] font-bold text-ink leading-snug">{a.name}<small className="block text-[11.5px] text-ink3 font-medium mt-0.5">{a.min} · 눌러서 자세히</small></span>
                <span className="text-[10.5px] font-bold bg-accent-weak text-accent-ink px-2 py-1 rounded-lg self-center shrink-0">{a.skill}</span>
                <span className={cn("text-ink3 shrink-0 transition-transform self-center", open === i && "rotate-180")}><Ic name="chev" size={16} /></span>
              </button>
              {open === i && (
                <div className="pl-[51px] pr-0.5 pb-3.5">
                  <p className="text-[12.5px] text-ink2 font-medium leading-loose m-0">{a.desc}</p>
                  <div className="text-[11px] font-bold text-ink3 mt-2.5 mb-1.5">준비물</div>
                  <div className="flex gap-1.5 flex-wrap">{a.prep.map((x) => <span key={x} className="text-[12.5px] font-semibold bg-fill border border-line rounded-full px-3 py-1.5 text-ink2">{x}</span>)}</div>
                  <div className="text-[11px] font-bold text-ink3 mt-2.5 mb-1.5">오늘의 목표</div>
                  <span className="inline-block text-[12.5px] font-bold text-accent-ink bg-accent-weak rounded-lg px-3 py-2">{a.goal}</span>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="rounded-2xl bg-surface border border-line p-4">
          <h4 className="text-[14px] font-bold text-ink mb-2">오늘 준비물</h4>
          <div className="flex gap-1.5 flex-wrap">{d.prep.map((x) => <span key={x} className="text-[12.5px] font-semibold bg-fill border border-line rounded-full px-3 py-1.5 text-ink2">{x}</span>)}</div>
        </div>

        <NoteRow icon="bulb">이 안내는 <b className="text-ink">커리큘럼에서 자동 생성된 예정 내용</b>이에요. 실제로 진행한 수업은 수업 후 <b className="text-ink">리포트(코치 확인)</b>에서 확인해요.</NoteRow>
      </AppScroll>
    </>
  );
}
