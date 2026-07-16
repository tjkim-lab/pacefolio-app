"use client";

import Link from "next/link";
import { AppHeader, AppScroll } from "@/components/mobile/MobileShell";
import { Card, Button, cn } from "@/components/ui";
import { IconSpark, IconClock } from "@/components/ui/icons";
import { useCoach, attCounts, uniqGuardians } from "../_state";
import { todayClass } from "../_data";

export default function CoachClassTab() {
  const c = useCoach();
  const counts = attCounts(c.att);
  const doneActs = c.actsDone.filter(Boolean).length;
  const reports = counts.p + counts.l;
  const guardians = uniqGuardians();

  return (
    <>
      <AppHeader title="수업 모드" />
      <AppScroll>
        <div className="px-1">
          <p className="text-[19px] font-extrabold tracking-tight text-ink">수업 모드</p>
          <p className="mt-0.5 text-[12.5px] font-medium text-ink3">
            출석 → 활동 체크 → 리포트, 1~2분이면 끝나요
          </p>
        </div>

        {!c.reportSent ? (
          <>
            <Card className="border-0 bg-accent-strong text-white">
              <span className="inline-block rounded-full bg-white/20 px-3 py-1 text-[11px] font-bold">
                오늘 오후 2:30 · 플레이2
              </span>
              <h3 className="mt-2.5 text-[19px] font-extrabold tracking-tight">{todayClass.round}</h3>
              <div className="text-[12.5px] font-medium opacity-90">{todayClass.preMeta}</div>
              <button
                onClick={c.openClass}
                className="mt-3.5 flex w-full items-center justify-center gap-1.5 rounded-xl bg-white py-3 text-[14.5px] font-extrabold text-accent-ink"
              >
                <IconSpark size={17} /> 수업 모드 시작
              </button>
            </Card>

            <div className="flex items-start gap-2.5 rounded-xl border border-line px-3.5 py-3 text-[12.5px] font-medium leading-relaxed text-ink2">
              <span className="mt-0.5 shrink-0 text-brand"><IconClock size={18} /></span>
              <span>
                <b className="text-ink">수업 모드는 3단계</b> — ① 출석 체크 ② 활동 체크·기록 ③ 코치 한마디. 리포트는 자동으로 조립돼요.
              </span>
            </div>
          </>
        ) : (
          <Card className="border border-accent">
            <div className="flex items-center gap-2">
              <h4 className="text-[13.5px] font-bold text-ink">오늘 수업 완료 ✓</h4>
              <span className="text-[11px] font-bold text-accent-ink">소요 {c.elapsedText}</span>
            </div>
            <div className="mt-2 flex gap-2">
              {[
                { v: `${counts.p}명`, k: "실제 출석", t: "text-accent-ink" },
                { v: `${doneActs}/3`, k: "활동 완료", t: "text-ink" },
                { v: c.newRecord ? "1건" : "0건", k: "신기록 🏅", t: "text-warn-ink" },
              ].map((s) => (
                <div key={s.k} className="flex-1 rounded-xl border border-line bg-fill py-3 text-center">
                  <div className={cn("text-[16px] font-extrabold", s.t)}>{s.v}</div>
                  <div className="mt-0.5 text-[10.5px] font-semibold text-ink3">{s.k}</div>
                </div>
              ))}
            </div>
            <div className="mt-2.5 text-[12.5px] font-medium text-ink2">
              원생 리포트 {reports}건 발송 · 보호자 {guardians}명 알림 · 반 채팅방에 공통 완료 카드 게시
            </div>
            <Link href="/coach/chat/class" className="mt-2.5 block">
              <Button full variant="ghost">반 채팅방 반응 보러 가기 👏</Button>
            </Link>
          </Card>
        )}
      </AppScroll>
    </>
  );
}
