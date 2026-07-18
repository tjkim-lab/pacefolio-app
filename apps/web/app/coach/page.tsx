"use client";

/* 코치 홈 (배치 C1 — docs/14-coach-product-plan.md)
   원칙: 코치 앱은 관리 대시보드가 아니라 현장 도구 — ① 오늘의 수업(최상단·
   시간순 캐러셀·상태별 단일 액션) ② 필수 확인 공지(확인 버튼 전까지 유지)
   ③ 학부모 전달사항. 나머지 위젯은 최소화(내일 수업 확정 = 접힘). */

import { useState } from "react";
import { AppHeader, AppScroll } from "@/components/mobile/MobileShell";
import { HomeBanner } from "@/components/mobile/HomeBanner";
import { Card, Button, Tag, cn } from "@/components/ui";
import { IconSpark } from "@/components/ui/icons";
import { useCoach } from "./_state";
import { useCoachLive } from "./_live";
import {
  coach, brief, TODAY_CLASSES, CLASS_STATUS_BTN, PARENT_NOTES,
  tomorrowInfo, LIB, POLICIES, POLICY_ORDER,
  type ClassStatus,
} from "./_data";

export default function CoachToday() {
  const c = useCoach();
  const live = useCoachLive();
  /* #31: READY 면 원장 전달사항은 chat 서버 정본 — fixture brief·setTimeout 진행 금지 */
  const liveBrief = live.state === "READY" ? live.brief : null;
  const useLiveBrief = live.state === "READY";
  const briefAcked = useLiveBrief
    ? !!liveBrief && (liveBrief.status === "ACKNOWLEDGED" || liveBrief.status === "RESOLVED")
    : c.briefAcked;
  const briefBody = useLiveBrief ? liveBrief?.body ?? "" : brief.body;
  const briefFrom = useLiveBrief ? "원장님 · 서버 전달사항 (READ ≠ 확인)" : brief.from;
  const onAckBrief = () => {
    if (useLiveBrief) {
      void live.ackBrief().then((r) => c.showToast(r.message));
      return;
    }
    c.ackBrief();
  };
  const total = c.tomorrow.reduce((s, id) => s + (LIB.find((a) => a.id === id)?.d ?? 0), 0);
  const pol = POLICIES[c.policy];
  const [tomorrowOpen, setTomorrowOpen] = useState(false);

  /* 수업 상태 — 목업: 코치 상태머신에서 파생. 정본은 서버 수업 상태(API_REQUIRED) */
  const statusOf = (id: string, main?: boolean): ClassStatus => {
    if (!main) return "SCHEDULED";
    if (c.reportSent) return "COMPLETED";
    if (c.classStep > 1 || c.attSaved) return "IN_PROGRESS";
    return "READY";
  };
  const act = (id: string, st: ClassStatus) => {
    if (st === "SCHEDULED") {
      c.showToast("수업 준비 — 명단·프로그램·전달사항 확인 (목업 · 보강수업은 시연용)");
      return;
    }
    c.openClass(); // READY(시작)·IN_PROGRESS(계속)·COMPLETED(읽기 전용 결과) 전부 수업 모드로
  };

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

        {/* ① 오늘의 수업 — 최상단 · 시간순 캐러셀 (공용 배너 144px 규격) */}
        <div>
          <div className="mb-1.5 flex items-baseline justify-between px-0.5">
            <span className="text-[12.5px] font-extrabold text-ink3">오늘의 수업 {TODAY_CLASSES.length}개 · 시간순</span>
            <span className="text-[10.5px] font-semibold text-ink3">지난·다음 수업은 색으로 구분</span>
          </div>
          <HomeBanner
            ariaLabel="오늘의 수업"
            slides={TODAY_CLASSES.map((t) => {
              const st = statusOf(t.id, t.main);
              const done = st === "COMPLETED";
              return (
                <div
                  key={t.id}
                  className={cn(
                    "flex h-full flex-col justify-between p-4 text-white",
                    done ? "bg-side" : t.main ? "bg-accent-strong" : "bg-side/80",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-[15px] font-extrabold tabular-nums">{t.time}–{t.end}</div>
                      <div className="text-[14px] font-extrabold tracking-tight">{t.name}</div>
                      <div className="mt-0.5 text-[11.5px] font-medium opacity-90">
                        학생 {t.students}명 · {t.place}{t.note ? ` · ${t.note}` : ""}
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full bg-white/20 px-2.5 py-1 text-[10.5px] font-bold">
                      {done ? "완료 ✓" : st === "IN_PROGRESS" ? "진행 중" : st === "READY" ? "시작 전" : "예정"}
                    </span>
                  </div>
                  <button
                    onClick={() => act(t.id, st)}
                    className={cn(
                      "flex h-10 w-full items-center justify-center gap-1.5 rounded-xl text-[13.5px] font-extrabold",
                      done ? "bg-white/15 text-white" : "bg-white text-accent-ink",
                    )}
                  >
                    {!done && <IconSpark size={16} />} {CLASS_STATUS_BTN[st]}
                  </button>
                </div>
              );
            })}
          />
        </div>

        {/* ② 필수 확인 공지 — 확인 버튼 전까지 유지 (READ ≠ ACKNOWLEDGED)
            #31: 실연결 시 서버 전달사항만 표시(없으면 카드 자체를 숨김 — 데모 위장 금지) */}
        {(!useLiveBrief || liveBrief) && (
        <Card
          className={cn(
            "border-l-4",
            briefAcked ? "border-l-accent" : "border-l-warn bg-warn-weak",
          )}
        >
          <div className={cn("flex items-center gap-1.5 text-[11px] font-extrabold", briefAcked ? "text-accent-ink" : "text-warn-ink")}>
            <span className={cn("h-1.5 w-1.5 rounded-full", briefAcked ? "bg-accent" : "bg-warn")} />
            {briefAcked ? "원장 전달사항 · 확인함" : "원장 전달사항 · 확인 필요 — 화면을 봐도 확인 전엔 안 사라져요"}
          </div>
          <div className="mt-1.5 text-[13.5px] font-semibold leading-relaxed text-ink">
            &ldquo;{briefBody}&rdquo;
          </div>
          <div className="mt-1.5 text-[11.5px] font-medium text-ink3">{briefFrom}</div>
          <button
            onClick={onAckBrief}
            disabled={briefAcked}
            className={cn(
              "mt-3 w-full rounded-xl py-2.5 text-[13px] font-bold transition",
              briefAcked ? "bg-accent-weak text-accent-ink" : "bg-accent-strong text-white",
            )}
          >
            {briefAcked ? "확인함 ✓ · 원장님께 확인 시각 표시됨" : "확인했어요"}
          </button>
        </Card>
        )}

        {/* ③ 학부모 전달사항 — 원생·수업 컨텍스트 함께 */}
        <Card>
          <div className="flex items-center justify-between">
            <h4 className="text-[13.5px] font-bold text-ink">학부모 전달사항</h4>
            <span className="text-[10.5px] font-semibold text-ink3">오늘 수업 관련 · {PARENT_NOTES.length}건</span>
          </div>
          <div className="mt-1 divide-y divide-line2">
            {PARENT_NOTES.map((n) => (
              <div key={n.kid + n.msg} className="py-2.5">
                <div className="text-[13px] font-bold text-ink">
                  {n.kid} <span className="font-medium text-ink2">— {n.msg}</span>
                </div>
                <div className="mt-0.5 text-[11px] font-medium text-ink3">{n.ctx}</div>
              </div>
            ))}
          </div>
        </Card>

        {/* ④ 내일 수업 확정 — 기본 접힘 (홈 위젯 최소화) */}
        <Card>
          <button
            onClick={() => setTomorrowOpen((o) => !o)}
            aria-expanded={tomorrowOpen}
            className="flex w-full items-center justify-between gap-2 text-left"
          >
            <div>
              <h4 className="text-[13.5px] font-bold text-ink">
                다음 수업, 10초면 확정 ⚡ {c.tomorrowConfirmed && <span className="text-accent-ink">· 확정됨 ✓</span>}
              </h4>
              <div className="mt-0.5 text-[12px] font-medium text-ink3">{tomorrowInfo}</div>
            </div>
            <span className={cn("text-[12px] font-bold text-ink3 transition-transform", tomorrowOpen && "rotate-180")}>▾</span>
          </button>

          {tomorrowOpen && (
            <>
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

              <div className="mt-2.5 divide-y divide-line2">
                {c.tomorrow.map((id) => {
                  const a = LIB.find((x) => x.id === id)!;
                  return (
                    <div key={id} className="flex items-center gap-2.5 py-2">
                      <div className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-lg bg-fill text-[16px]">{a.e}</div>
                      <div className="flex-1">
                        <div className="text-[13px] font-bold text-ink">{a.n}</div>
                        <div className="text-[11px] font-medium text-ink3">자동 제안</div>
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
            </>
          )}
        </Card>

        <div className="px-1 text-center text-[11.5px] font-medium leading-relaxed text-ink3">
          🌙 밤 10시까지 수정하지 않으면 학원에서 설정한 기본 커리큘럼이 적용돼요 (원장 설정)
        </div>
      </AppScroll>
    </>
  );
}
