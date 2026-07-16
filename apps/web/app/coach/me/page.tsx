"use client";

import Link from "next/link";
import { AppHeader, AppScroll } from "@/components/mobile/MobileShell";
import { Card, Button, Tag, ProgressBar, cn } from "@/components/ui";
import { useCoach } from "../_state";
import { coach, academies, myClasses, WEEK, weekNote } from "../_data";

export default function CoachMe() {
  const c = useCoach();
  return (
    <>
      <AppHeader title="내 정보" />
      <AppScroll>
        <div className="px-1">
          <p className="text-[19px] font-extrabold tracking-tight text-ink">내 정보</p>
          <p className="mt-0.5 text-[12.5px] font-medium text-ink3">PACEFOLIO · {coach.academy}</p>
        </div>

        {/* 코치 카드 */}
        <Card className="flex items-center gap-3 border-0 bg-side text-white">
          <div className="grid shrink-0 place-items-center rounded-2xl bg-accent text-[19px] font-extrabold" style={{ width: 52, height: 52 }}>
            {coach.initial}
          </div>
          <div>
            <div className="text-[17px] font-extrabold">{coach.name} 코치</div>
            <div className="mt-0.5 text-[11.5px] font-medium opacity-85">
              {coach.academy} · {coach.tenure} · 담당 {coach.classCount}개 반 · 재원 {coach.studentCount}명
            </div>
          </div>
        </Card>

        {/* 근무 학원 */}
        <Card>
          <div className="flex items-center justify-between">
            <h4 className="text-[13.5px] font-bold text-ink">근무 학원</h4>
            <span className="text-[10.5px] font-semibold text-ink3">전환하면 수업·채팅·권한이 함께 바뀌어요</span>
          </div>
          <div className="mt-1 divide-y divide-line2">
            {academies.map((a) => (
              <button
                key={a.id}
                onClick={() => c.showToast(a.current ? "지금 보고 있는 학원이에요" : `${a.name}(으)로 전환하면 해당 학원 정보만 표시돼요 (시연)`)}
                className="flex w-full items-center gap-3 py-2.5 text-left"
              >
                <div className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-xl bg-fill text-[17px]">{a.emoji}</div>
                <div className="flex-1">
                  <div className="text-[13.5px] font-bold text-ink">{a.name}</div>
                  <div className="text-[11.5px] font-medium text-ink3">{a.role}</div>
                </div>
                {a.current && <Tag tone="accent">현재</Tag>}
              </button>
            ))}
          </div>
        </Card>

        {/* 담당 반 */}
        <Card>
          <h4 className="text-[13.5px] font-bold text-ink">담당 반</h4>
          <div className="mt-1 divide-y divide-line2">
            {myClasses.map((m) => (
              <div key={m.name} className="flex items-center gap-3 py-2.5">
                <div className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-xl bg-fill text-[17px]">{m.e}</div>
                <div className="flex-1">
                  <div className="text-[13.5px] font-bold text-ink">{m.name}</div>
                  <div className="text-[11.5px] font-medium text-ink3">{m.sub}</div>
                </div>
                <Tag tone="muted">{m.tag}</Tag>
              </div>
            ))}
          </div>
        </Card>

        {/* 이번 주 일정 */}
        <Card>
          <h4 className="text-[13.5px] font-bold text-ink">이번 주 일정</h4>
          <div className="mt-2 flex gap-1.5">
            {WEEK.map((d) => (
              <div
                key={d.dw}
                className={cn(
                  "flex-1 rounded-xl border py-2.5 text-center",
                  d.time ? "border-accent-weak bg-accent-weak" : "border-line bg-fill",
                )}
              >
                <div className="text-[10.5px] font-semibold text-ink3">{d.dw}</div>
                <div className={cn("mt-0.5 text-[13px] font-extrabold", d.time ? "text-accent-ink" : "text-ink")}>{d.dn}</div>
                <div className="mt-0.5 min-h-3 text-[9px] font-bold text-accent-ink">{d.time ?? ""}</div>
              </div>
            ))}
          </div>
          <div className="mt-2.5 text-[11.5px] font-medium text-ink3">{weekNote}</div>
        </Card>

        {/* 인수인계 */}
        <Card>
          <div className="flex items-center justify-between">
            <h4 className="text-[13.5px] font-bold text-ink">인수인계</h4>
            <span className="text-[11px] font-bold text-accent-ink">작별 피드백 {c.byeDone}/4</span>
          </div>
          <div className="mt-1 text-[13px] font-medium leading-relaxed text-ink2">
            다음 달 퇴사 예정이세요? 아이들에게 <b className="text-ink">작별 피드백</b>을 남겨주세요 🌱 새 코치의 브리핑에 그대로 실려요.
          </div>
          <div className="mt-2.5">
            <ProgressBar value={c.byeDone / 4} />
          </div>
          <Link href="/coach/me/handover" className="mt-2.5 block">
            <Button full variant="ghost">작별 피드백 쓰기 →</Button>
          </Link>
        </Card>

        <Link href="/demo" className="block py-3 text-center text-[13px] text-ink3">
          ← 앱 허브(데모)로 돌아가기
        </Link>
      </AppScroll>
    </>
  );
}
