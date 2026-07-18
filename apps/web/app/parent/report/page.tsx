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
        {/* C3: 활동 영역 기록 — "능력 점수" 아님, 어떤 활동 경험이 쌓였는지 */}
        <div className="rounded-2xl border border-line bg-surface p-4">
          <div className="flex items-baseline justify-between">
            <h4 className="text-[13.5px] font-bold text-ink">이번 주 활동 영역</h4>
            <span className="text-[10.5px] font-semibold text-ink3">최근 4주 분포</span>
          </div>
          <div className="mt-2.5 space-y-2">
            {([
              ["균형감각", 3, 4],
              ["협응성", 2, 4],
              ["인지·집중", 1, 4],
            ] as const).map(([area, n, max]) => (
              <div key={area}>
                <div className="flex justify-between text-[12px] font-semibold text-ink2">
                  <span>{area}</span>
                  <span className="text-ink3">{n}회 활동</span>
                </div>
                <div className="mt-1 flex gap-1">
                  {Array.from({ length: max }, (_, i) => (
                    <div key={i} className={`h-2 flex-1 rounded-full ${i < n ? "bg-accent" : "bg-line2"}`} />
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2.5 text-[11px] font-medium leading-normal text-ink3">
            점수나 진단이 아니라 <b className="font-bold text-ink2">어떤 활동 경험이 쌓였는지</b>를 보여드려요.
            최근엔 균형 활동이 많았어요 — 다음 주엔 인지·집중 활동이 예정돼 있어요.
          </div>
        </div>
        <NoteRow icon="trend"><Html html={d.note} /></NoteRow>
      </AppScroll>
    </>
  );
}
