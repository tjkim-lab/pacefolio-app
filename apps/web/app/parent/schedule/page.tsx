"use client";

import { useRouter } from "next/navigation";
import { AppHeader, AppScroll } from "@/components/mobile/MobileShell";
import { cn } from "@/components/ui";
import { Ic } from "../_icons";
import { useParent } from "../_state";
import { Bell, CtxBar, NoteRow } from "../_components";
import { DAY_LABEL, WEEK_DAYS } from "../_data";

export default function ParentSchedule() {
  const { st, content, cur, dispatch, openSheet, toast } = useParent();
  const router = useRouter();
  const evs = content.events[st.selDay] ?? [];

  const goContest = () => { dispatch({ t: "seg", seg: "contest" }); router.push("/parent/child"); };

  return (
    <>
      <AppHeader title={<span className="text-[17px] font-extrabold text-ink">일정</span>} right={<Bell />} />
      <AppScroll>
        <div className="text-[13px] text-ink3 -mt-1">10월 넷째 주 · {st.child} · {st.academy}</div>
        <CtxBar />

        {/* 주간 요일 선택 */}
        <div className="flex gap-1.5">
          {WEEK_DAYS.map((d) => {
            const hasEvt = !!content.events[d.d];
            const sel = d.d === st.selDay;
            return (
              <button key={d.d} onClick={() => dispatch({ t: "selDay", day: d.d })}
                className={cn("relative flex-1 text-center py-2.5 rounded-xl border", sel ? "bg-accent-strong border-accent-strong" : "bg-surface border-line")}>
                <div className={cn("text-[11px] font-semibold", sel ? "text-white/80" : "text-ink3")}>{d.w}</div>
                <div className={cn("text-[15px] font-extrabold mt-0.5", sel ? "text-white" : "text-ink")}>{d.n}</div>
                {hasEvt && <span className={cn("absolute bottom-1.5 left-1/2 -translate-x-1/2 w-[5px] h-[5px] rounded-full", sel ? "bg-white" : "bg-accent")} />}
              </button>
            );
          })}
        </div>

        {/* 선택일 일정 */}
        {evs.map((ev, i) => {
          let rs: React.ReactNode = null;
          if (ev.today) {
            if (cur.attend === "absent") rs = <div className="flex items-center gap-1.5 text-[12px] font-semibold text-danger-ink mt-2">결석 접수됨 · 사유: {cur.absReason} — 코치·원장님께 전달됨</div>;
            else if (cur.attend === "confirm") rs = <div className="flex items-center gap-1.5 text-[12px] font-semibold text-accent-ink mt-2"><Ic name="check" size={14} /> 참석 확인 완료</div>;
            else rs = <div className="flex items-center gap-1.5 text-[12px] font-semibold text-accent-ink mt-2"><Ic name="check" size={14} /> 참석 예정 — 결석할 때만 홈에서 알려주세요</div>;
          }
          return (
            <button key={i} onClick={() => ev.push && router.push("/parent/lesson")} disabled={!ev.push}
              className={cn("flex w-full gap-3 rounded-2xl bg-surface border border-line p-4 text-left", !ev.push && "cursor-default")}>
              <span className="w-1 rounded bg-accent shrink-0" />
              <span className="flex-1">
                <span className="block text-[15px] font-extrabold tracking-tight text-ink">{ev.en}</span>
                <span className="block text-[12.5px] text-ink3 font-medium mt-1">{ev.em}</span>
                {rs}
              </span>
              <span className="self-start text-[11px] font-bold px-2.5 py-1 rounded-lg bg-fill text-ink2 shrink-0">{ev.tag}</span>
            </button>
          );
        })}
        {!evs.length && (
          <div className="rounded-2xl bg-surface border border-line p-4 text-center text-[13.5px] text-ink3 font-semibold">
            {(st.selDay === "1" ? "11/1" : "10/" + st.selDay)} ({DAY_LABEL[st.selDay]}) — 등록된 일정이 없어요
          </div>
        )}

        {/* 대회 · 지난 결석 */}
        {(content.hasContest || content.hasAbsenceCard) && (
          <div className="space-y-2.5">
            <div className="text-[12px] font-extrabold text-ink3 pt-1">다가오는 대회 · 지난 결석</div>
            {content.hasContest && (
              <button onClick={goContest} className="flex w-full gap-3 rounded-2xl bg-surface border border-line p-4 text-left">
                <span className="w-1 rounded bg-warn shrink-0" />
                <span className="flex-1">
                  <span className="block text-[15px] font-extrabold tracking-tight text-ink">강동 유소년 챔피언십</span>
                  <span className="block text-[12.5px] text-ink3 font-medium mt-1">11/22(토) 오전 10:00 · 강동 체육관</span>
                  {cur.contest
                    ? <span className="flex items-center gap-1.5 text-[12px] font-semibold text-accent-ink mt-2"><Ic name="check" size={14} /> 참가 확정 · 등번호 7 · 오전 9:30 집결</span>
                    : <span className="flex items-center gap-1.5 text-[12px] font-semibold text-warn-ink mt-2"><Ic name="clock" size={14} /> 참가 신청 전 — 우리 아이 탭에서 신청</span>}
                </span>
                <span className="self-start text-[11px] font-bold px-2.5 py-1 rounded-lg bg-fill text-ink2 shrink-0">대회</span>
              </button>
            )}
            {content.hasAbsenceCard && (
              <div className="rounded-2xl bg-surface border border-line p-4 border-l-4 border-l-danger">
                <h4 className="flex justify-between items-center text-[14px] font-bold text-ink mb-1.5">지난 결석 1건 <span className="text-[12px] text-ink3 font-semibold">10/22(수) · 아파서</span></h4>
                <div className="text-[13px] text-ink2 font-medium leading-relaxed">플레이2 13회차 &quot;균형과 리듬 ①&quot;을 빠졌어요.<br />보강 여부와 진행 방식은 <b className="text-ink">학원 운영 기준</b>에 따라 안내돼요.</div>
                {!cur.makeupReq && !cur.makeupDone && (
                  <button onClick={() => openSheet("mk")} className="w-full mt-3 rounded-xl bg-fill border border-line text-ink2 text-[15px] font-bold py-3.5">보강 희망 전달</button>
                )}
                {cur.makeupReq && !cur.makeupDone && (
                  <>
                    <div className="flex items-center gap-2.5 mt-3 bg-warn-weak rounded-xl px-3.5 py-3">
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-warn-ink bg-warn-weak rounded-full px-2.5 py-1"><span className="w-[7px] h-[7px] rounded-full bg-warn inline-block" />전달됨</span>
                      <span className="text-[12.5px] font-semibold text-warn-ink">보강 희망을 학원에 전달했어요 — 실제 일정·방식은 학원에서 안내해요</span>
                    </div>
                    <button onClick={() => { dispatch({ t: "makeupDone" }); toast("원장님이 보강 처리를 완료했어요 · 메모: 다음 수업으로 대체 (데모)"); }}
                      className="w-full mt-2.5 rounded-xl bg-fill border border-line text-ink2 text-[15px] font-bold py-3.5">데모: 원장 처리 완료 상태 보기</button>
                  </>
                )}
                {cur.makeupDone && (
                  <div className="flex items-center gap-2.5 mt-3 bg-accent-weak rounded-xl px-3.5 py-3">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-accent-ink bg-accent-weak rounded-full px-2.5 py-1"><Ic name="check" size={12} />처리 완료</span>
                    <span className="text-[12.5px] font-semibold text-accent-ink">원장님 처리 · 메모: 다음 수업으로 대체</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <NoteRow icon="clock"><b className="text-ink">자동 리마인드</b> — 수업 3시간 전, 오늘 진도와 준비물을 알려드려요. 응답이 꼭 필요한 일정(대회·특강·차량 변경)만 다시 알려드려요.</NoteRow>
      </AppScroll>
    </>
  );
}
