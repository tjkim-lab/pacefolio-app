"use client";

import { AppScroll } from "@/components/mobile/MobileShell";
import { Ic } from "../_icons";
import { useParent } from "../_state";
import { Html, NoteRow, PushHeader } from "../_components";

export default function ReportPage() {
  const { detail } = useParent();
  const d = detail.report;
  return (
    <>
      <PushHeader title="수업 리포트" sub={d.sub} />
      <AppScroll>
        <div className="rounded-2xl border border-line overflow-hidden bg-surface">
          <div className="bg-side text-white p-4">
            <div className="text-[11px] font-semibold opacity-75">{d.meta}</div>
            <h3 className="text-[17px] font-extrabold mt-1.5">{d.title}</h3>
            <div className="text-[12px] opacity-80 font-medium mt-0.5">{d.who}</div>
          </div>
          <div className="px-4 py-3.5">
            {d.items.map((it, i) => (
              <div key={i} className="flex gap-2.5 items-center py-2.5 text-[13.5px] font-bold text-ink">
                {it[0] === "half"
                  ? <span className="grid place-items-center w-[22px] h-[22px] rounded-lg bg-warn text-white shrink-0">◐</span>
                  : <span className="grid place-items-center w-[22px] h-[22px] rounded-lg bg-accent text-white shrink-0"><Ic name="check" size={14} /></span>}
                {it[1]} <small className="text-ink3 font-medium ml-auto text-[11.5px]">{it[2]}</small>
              </div>
            ))}
            <div className="bg-accent-weak rounded-xl px-3.5 py-3 text-[13px] text-accent-ink font-medium leading-loose mt-3"><b className="font-extrabold">{d.coach} 한마디</b> — {d.say}</div>
            <div className="flex gap-1.5 mt-3">{d.photos.map((p, i) => <div key={i} className="flex-1 aspect-square rounded-xl bg-fill grid place-items-center text-2xl">{p}</div>)}</div>
          </div>
        </div>
        <NoteRow icon="trend"><Html html={d.note} /></NoteRow>
      </AppScroll>
    </>
  );
}
