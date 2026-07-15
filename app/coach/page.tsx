"use client";

import { AppHeader, AppScroll } from "@/components/mobile/MobileShell";
import { Card, Button, Tag, cn } from "@/components/ui";
import { IconSpark } from "@/components/ui/icons";
import { useCoach } from "./_state";
import {
  coach, brief, todayClass, tomorrowInfo, LIB, POLICIES, POLICY_ORDER,
} from "./_data";

export default function CoachToday() {
  const c = useCoach();
  const total = c.tomorrow.reduce((s, id) => s + (LIB.find((a) => a.id === id)?.d ?? 0), 0);
  const pol = POLICIES[c.policy];

  return (
    <>
      <AppHeader title={`${coach.academy}`} />
      <AppScroll>
        {/* 인사 */}
        <div className="px-1">
          <p className="text-[19px] font-extrabold tracking-tight text-ink">
            {coach.name} 코치님, 오늘도 파이팅 ☀️
          </p>
          <p className="mt-0.5 text-[12.5px] font-medium text-ink3">
            PACEFOLIO · {coach.academy} · {coach.dateLabel}
          </p>
        </div>

        {/* 원장 전달사항 */}
        <Card
          className={cn(
            "border-l-4",
            c.briefAcked ? "border-l-accent" : "border-l-warn bg-warn-weak",
          )}
        >
          <div className={cn("flex items-center gap-1.5 text-[11px] font-extrabold", c.briefAcked ? "text-accent-ink" : "text-warn-ink")}>
            <span className={cn("h-1.5 w-1.5 rounded-full", c.briefAcked ? "bg-accent" : "bg-warn")} />
            {c.briefAcked ? "원장 전달사항 · 확인함" : "원장 전달사항 · 수업 전 꼭 확인"}
          </div>
          <div className="mt-1.5 text-[13.5px] font-semibold leading-relaxed text-ink">
            &ldquo;{brief.body}&rdquo;
          </div>
          <div className="mt-1.5 text-[11.5px] font-medium text-ink3">{brief.from}</div>
          <button
            onClick={c.ackBrief}
            disabled={c.briefAcked}
            className={cn(
              "mt-3 w-full rounded-xl py-2.5 text-[13px] font-bold transition",
              c.briefAcked ? "bg-accent-weak text-accent-ink" : "bg-accent-strong text-white",
            )}
          >
            {c.briefAcked ? "확인함 ✓ · 원장님께 확인 표시됨" : "확인했어요"}
          </button>
        </Card>

        {/* 오늘 수업 히어로 */}
        {!c.reportSent ? (
          <Card className="border-0 bg-accent-strong text-white">
            <span className="inline-block rounded-full bg-white/20 px-3 py-1 text-[11px] font-bold">
              {todayClass.kicker}
            </span>
            <h3 className="mt-2.5 text-[19px] font-extrabold tracking-tight">{todayClass.title}</h3>
            <div className="text-[12.5px] font-medium opacity-90">{todayClass.meta}</div>
            <div className="mt-3 flex gap-2">
              <HeroStat v={todayClass.capacity} k="정원" />
              <HeroStat v={todayClass.absent} k={todayClass.absentWho} warn />
              <HeroStat v={todayClass.caution} k={todayClass.cautionWho} warn />
            </div>
            <button
              onClick={c.openClass}
              className="mt-3.5 flex w-full items-center justify-center gap-1.5 rounded-xl bg-white py-3 text-[14.5px] font-extrabold text-accent-ink"
            >
              <IconSpark size={17} /> 수업 모드 시작
            </button>
          </Card>
        ) : (
          <Card className="border-0 bg-side text-white">
            <span className="inline-block rounded-full bg-white/15 px-3 py-1 text-[11px] font-bold">
              오늘 수업 · 완료 ✓
            </span>
            <h3 className="mt-2.5 text-[19px] font-extrabold tracking-tight">{todayClass.title}</h3>
            <div className="text-[12.5px] font-medium opacity-90">
              14회차 &ldquo;균형과 리듬 ②&rdquo; · 원생 리포트 발송 · 반 채팅방 공통 완료 카드 게시
            </div>
            <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-[12px] font-bold">
              👏 반 채팅방에 공통 완료 카드 게시됨
            </div>
          </Card>
        )}

        {/* 다음 수업 10초 확정 */}
        <Card>
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-[13.5px] font-bold text-ink">다음 수업, 10초면 확정 ⚡</h4>
          </div>
          <div className="mt-1 text-[12px] font-medium text-ink3">{tomorrowInfo}</div>

          {/* 편집 권한 (원장 설정 · 시연) */}
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <span className="text-[10.5px] font-bold text-ink3">편집 권한(원장 설정 · 시연)</span>
            {POLICY_ORDER.map((k) => (
              <button
                key={k}
                onClick={() => c.setPolicy(k)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px] font-semibold transition",
                  c.policy === k ? "border-accent bg-accent-weak text-accent-ink" : "border-line text-ink2",
                )}
              >
                {POLICIES[k].nm}
              </button>
            ))}
          </div>
          <div className="mt-1.5 text-[11px] font-semibold text-ink3">
            {pol.d} · 담당 프로그램·반 배정은 원장만 해요
          </div>
          {c.policy === "LOCKED" && (
            <div className="mt-2 rounded-lg bg-warn-weak px-2.5 py-2 text-[11.5px] font-semibold text-warn-ink">
              🔒 원장 커리큘럼 고정 — 활동은 못 바꾸고, 수업 후 완료·부분 진행·미진행만 기록해요
            </div>
          )}

          {/* 자동 제안 활동 */}
          <div className="mt-2.5 divide-y divide-line2">
            {c.tomorrow.map((id) => {
              const a = LIB.find((x) => x.id === id)!;
              return (
                <div key={id} className="flex items-center gap-2.5 py-2">
                  <div className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-lg bg-fill text-[16px]">{a.e}</div>
                  <div className="flex-1">
                    <div className="text-[13px] font-bold text-ink">{a.n}</div>
                    <div className="text-[11px] font-medium text-ink3">{a.d}분 · 자동 제안</div>
                  </div>
                  <Tag tone="accent">{a.tag}</Tag>
                </div>
              );
            })}
          </div>
          <div className="mt-2 text-[11.5px] font-semibold text-ink3">
            활동 {c.tomorrow.length}개 · 총 {total}분 (권장 25~35분)
            {total > 35 && ` — ⚠ 권장보다 ${total - 35}분 길어요`}
          </div>

          <div className="mt-2 flex gap-2">
            <Button
              full
              variant={c.tomorrowConfirmed ? "soft" : "primary"}
              className={c.tomorrowConfirmed ? "bg-accent-weak text-accent-ink" : ""}
              onClick={c.confirmTomorrow}
            >
              {c.tomorrowConfirmed ? "확정됨 ✓" : "이대로 확정"}
            </Button>
            {pol.change && (
              <Button variant="ghost" className="shrink-0 text-accent-ink" onClick={c.openLib}>
                활동 바꾸기
              </Button>
            )}
          </div>
          {c.tomorrowConfirmed && (
            <div className="mt-2.5 text-[12.5px] font-bold text-accent-ink">
              코치 확정 ✓ · 아침 8시에 학부모 안내가 나가요
              <div className="mt-0.5 text-[11px] font-medium text-ink3">
                안내 발송 전엔 자유롭게 수정 · 발송 후엔 변경 안내가 다시 나가요 · 이력엔 &quot;코치 확정&quot;으로 남아요
              </div>
            </div>
          )}
        </Card>

        <div className="px-1 text-center text-[11.5px] font-medium leading-relaxed text-ink3">
          🌙 밤 10시까지 수정하지 않으면 학원에서 설정한 기본 커리큘럼이 적용돼요 (원장 설정) — 학부모 안내는 확정된 내용으로 나가요
        </div>
      </AppScroll>
    </>
  );
}

function HeroStat({ v, k, warn }: { v: string; k: string; warn?: boolean }) {
  return (
    <div className="flex-1 rounded-xl bg-white/12 px-2.5 py-2 text-center">
      <div className={cn("text-[16px] font-extrabold", warn ? "text-gold-weak" : "text-white")}>{v}</div>
      <div className="mt-0.5 text-[10.5px] font-medium opacity-85">{k}</div>
    </div>
  );
}
