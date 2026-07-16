"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { AppScroll } from "@/components/mobile/MobileShell";
import { Card, Button, cn } from "@/components/ui";
import { IconBell, IconClock, IconCard, IconCheck } from "@/components/ui/icons";
import {
  useToast,
  useConfirm,
  Greeting,
  CardH4,
  Meter,
  SentNote,
  Spinner,
} from "./_kit";
import { CAP_METERS, TODOS, TODO_CONFIRM, type TodoKey } from "./_data";

/* 목업 심볼(mega/trophy/alert)을 공용 라인 아이콘으로 매핑 */
function TodoIcon({ kind }: { kind: "mega" | "card" | "trophy" | "alert" }) {
  if (kind === "card") return <IconCard size={20} />;
  return { mega: <Mega />, trophy: <Trophy />, alert: <Alert /> }[kind];
}
const Mega = () => (
  <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 11v2a1 1 0 0 0 1 1h2l9 5V5L6 10H4a1 1 0 0 0-1 1z" />
    <path d="M18 8a4 4 0 0 1 0 8" />
  </svg>
);
const Trophy = () => (
  <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M7 4h10v4a5 5 0 0 1-10 0z" />
    <path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M9 20h6M12 13v4" />
  </svg>
);
const Alert = () => (
  <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3 2.5 20h19z" />
    <path d="M12 10v4M12 17.2h.01" />
  </svg>
);

interface TodoState {
  done: boolean;
  after: string;
  afterSub: string;
}

export default function OwnerHome() {
  const { toast, toastNode } = useToast();
  const { confirm, confirmNode } = useConfirm();
  const todoCardRef = useRef<HTMLDivElement>(null);

  // 오늘 처리할 일 상태
  const [todos, setTodos] = useState<Record<TodoKey, TodoState>>(() =>
    Object.fromEntries(
      TODOS.map((t) => [t.key, { done: false, after: t.after, afterSub: t.afterSub }]),
    ) as Record<TodoKey, TodoState>,
  );
  const [coachDemoGone, setCoachDemoGone] = useState(false);
  const left = TODOS.filter((t) => !todos[t.key].done).length;

  // 배너 카루셀
  const [slide, setSlide] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const onScroll = () => {
    const el = trackRef.current;
    if (!el) return;
    setSlide(Math.max(0, Math.min(2, Math.round(el.scrollLeft / el.clientWidth))));
  };
  const goSlide = (i: number) => {
    const el = trackRef.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  };

  // 코치 전달사항
  const COACH_CHIPS = ["김선재", "이창진", "박코치"];
  const [coach, setCoach] = useState("김선재");
  const [coachMsg, setCoachMsg] = useState("도담이 오늘 컨디션 확인해주세요 — 어제 병원 다녀왔대요");
  const [coachStage, setCoachStage] = useState<0 | 1 | 2 | 3 | 4>(0); // 0 idle,1 sending,2 sent,3 read,4 result

  function completeTodo(key: TodoKey, patch?: Partial<TodoState>) {
    setTodos((prev) => (prev[key].done ? prev : { ...prev, [key]: { ...prev[key], done: true, ...patch } }));
    if (key === "absence") setCoachDemoGone(true);
  }

  function handleTodo(key: TodoKey) {
    if (todos[key].done) return;
    if (key === "absence") {
      completeTodo("absence");
      toast("원장 확인 완료 — 학부모에게 '확인했어요' 알림 전달");
      return;
    }
    const c = TODO_CONFIRM[key];
    confirm({
      title: c.title,
      rows: c.rows,
      warn: c.warn,
      label: c.label,
      onConfirm: () => {
        completeTodo(key);
        toast(c.toast);
      },
    });
  }

  function coachActualDemo() {
    if (todos.absence.done) return;
    completeTodo("absence", {
      after: "✓ 코치가 실제 출석으로 확정 — 예정 결석 종결",
      afterSub: "학부모 예정 결석(아파요) → 실제 출석 · 김선재 코치 · 원장 할 일 자동 종료",
    });
    toast("코치가 실제 출석으로 확정 — 원장 할 일에서 자동 종료됐어요");
  }

  function sendCoach() {
    if (coachStage !== 0) return;
    if (!coachMsg.trim()) {
      toast("전달할 내용을 적어주세요");
      return;
    }
    setCoachStage(1);
    setTimeout(() => {
      setCoachStage(2);
      toast(`${coach} 코치에게 전달됐어요`);
      setTimeout(() => {
        setCoachStage(3);
        toast(`${coach} 코치가 전달사항을 확인했어요`);
      }, 1800);
      setTimeout(() => {
        setCoachStage(4);
        toast("코치 처리결과가 도착했어요 — 원장 업무 기록에 저장");
      }, 3800);
    }, 700);
  }

  return (
    <>
      <AppScroll>
        <Greeting
          title={<>원장님, 좋은 아침이에요 ☀️</>}
          sub="원더짐 아카데미 · 원생 93명 · 10월 27일 (월)"
          bellDot
          bell={<IconBell size={20} />}
        />

        {/* ① 스와이프 배너 3장 */}
        <div>
          <div
            ref={trackRef}
            onScroll={onScroll}
            className="flex snap-x snap-mandatory overflow-x-auto rounded-[18px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {/* 슬라이드 1 — 수납 히어로 */}
            <div className="min-w-full shrink-0 snap-start pr-0">
              <div className="rounded-[18px] bg-accent-strong p-[18px] text-white">
                <div className="text-[12.5px] font-medium opacity-90">
                  9월 시작 수납기간 (9~11월) · 현재 수납액
                </div>
                <div className="mt-1 text-[30px] font-extrabold tracking-tighter tabular-nums">₩24,180,000</div>
                <div className="mt-1.5 text-[12.5px] opacity-90">
                  청구 총액 <b className="font-bold text-accent-weak">₩27,800,000</b> · 금액 기준 수납률{" "}
                  <b className="font-bold text-accent-weak">87%</b>
                </div>
                <div className="mt-4 flex gap-2">
                  {[
                    { k: "결제 완료", v: "81명", warn: false },
                    { k: "결제 대기", v: "7명", warn: false },
                    { k: "기한 초과", v: "5명 · ₩1.6M", warn: true },
                  ].map((r) => (
                    <div key={r.k} className="flex-1 rounded-xl bg-white/15 px-3 py-2.5">
                      <div className="text-[11px] font-medium opacity-90">{r.k}</div>
                      <div className={cn("mt-0.5 text-[15px] font-extrabold tabular-nums", r.warn && "text-warn-weak")}>
                        {r.v}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {/* 슬라이드 2 — 안 읽은 공지 */}
            <div className="min-w-full shrink-0 snap-start">
              <Card className="flex h-full flex-col">
                <div className="flex items-center gap-1.5 text-[12.5px] font-bold text-ink3">
                  <span className="text-accent"><Mega /></span> 안 읽은 공지
                </div>
                <div className="mt-2 text-[16.5px] font-extrabold leading-snug tracking-tight">
                  &quot;가을 대회 참가 안내&quot;
                  <br />
                  아직 보호자 <b className="text-accent-ink">6명</b>이 안 읽었어요
                </div>
                <div className="mt-2.5 flex items-center gap-2.5 text-[12px] font-semibold text-ink3">
                  <div className="flex-1">
                    <Meter pct={93} />
                  </div>
                  <span>읽음 81/87 보호자</span>
                </div>
                <Button variant="primary" className="mt-3 h-11 w-full text-[13px]" onClick={() => handleTodo("notice")}>
                  다시 알림
                </Button>
              </Card>
            </div>
            {/* 슬라이드 3 — 오늘 처리할 일 */}
            <div className="min-w-full shrink-0 snap-start">
              <Card className="flex h-full flex-col">
                <div className="flex items-center gap-1.5 text-[12.5px] font-bold text-ink3">
                  <span className="text-accent"><IconClock size={18} /></span> 오늘 처리할 일
                </div>
                <ul className="mt-2 space-y-0 text-[12.5px] font-semibold text-ink2">
                  {[
                    ["공지 안 본 보호자", todos.notice.done ? TODOS[0].bn : "6명", todos.notice.done],
                    ["수강료 기한 초과", todos.unpaid.done ? TODOS[1].bn : "5명", todos.unpaid.done],
                    ["대회 미응답", todos.event.done ? TODOS[2].bn : "4명", todos.event.done],
                    ["긴급 결석", todos.absence.done ? TODOS[3].bn : "1건", todos.absence.done],
                  ].map(([l, v, done]) => (
                    <li key={l as string} className="flex justify-between py-1">
                      <span>{l}</span>
                      <b className={cn("font-extrabold tabular-nums", done ? "text-accent-ink" : "text-danger")}>{v}</b>
                    </li>
                  ))}
                </ul>
                <Button
                  variant="soft"
                  className="mt-auto h-11 w-full text-[13px]"
                  onClick={() => todoCardRef.current?.scrollIntoView({ behavior: "smooth" })}
                >
                  아래에서 바로 처리하기
                </Button>
              </Card>
            </div>
          </div>
          <div className="mt-2.5 flex justify-center gap-1.5">
            {[0, 1, 2].map((i) => (
              <button
                key={i}
                aria-label={`슬라이드 ${i + 1}`}
                onClick={() => goSlide(i)}
                className={cn("h-1.5 rounded-full transition-all", i === slide ? "w-[18px] bg-accent" : "w-1.5 bg-line")}
              />
            ))}
          </div>
        </div>

        {/* 요약 타일 3개 */}
        <div className="grid grid-cols-3 gap-2.5">
          <TileStat value="93명" label="전체 원생" tone="accent" />
          <TileStat value="89%" label="이번 주 출석률" tone="gold" />
          <TileStat value={`${left}건`} label="처리 필요" tone="danger" />
        </div>

        {/* ② 오늘 처리할 일 — 액션형 리스트 */}
        <div ref={todoCardRef}>
        <Card>
          <CardH4 note={left > 0 ? `${left}건 남음` : "모두 완료"}>오늘 처리할 일</CardH4>
          {left === 0 ? (
            <div className="py-6 text-center">
              <div className="text-[34px]">🎉</div>
              <div className="mt-2 text-[15px] font-extrabold text-accent-ink">오늘 할 일 끝!</div>
              <div className="mt-1 text-[12px] font-medium text-ink3">알림·리마인드는 시스템이 이어서 추적할게요</div>
            </div>
          ) : (
            <>
              {TODOS.map((t) => {
                const st = todos[t.key];
                return (
                  <div
                    key={t.key}
                    className={cn(
                      "flex items-center gap-3 border-b border-line2 py-3 last:border-b-0",
                      st.done && "opacity-60",
                    )}
                  >
                    <div
                      className={cn(
                        "grid h-[38px] w-[38px] shrink-0 place-items-center rounded-xl",
                        t.hot ? "bg-danger-weak text-danger" : "bg-fill text-ink2",
                      )}
                    >
                      <TodoIcon kind={t.icon} />
                    </div>
                    <div className="flex-1 text-[13.5px] font-semibold leading-snug text-ink">
                      {t.title}
                      <small className="mt-0.5 block text-[12px] font-medium text-ink3">{t.sub}</small>
                    </div>
                    {st.done ? (
                      <div className="max-w-[45%] shrink-0 text-right text-[12px] font-bold leading-tight text-accent-ink">
                        {st.after}
                        <small className="block text-[10.5px] font-medium text-ink3">{st.afterSub}</small>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleTodo(t.key)}
                        className="shrink-0 rounded-[10px] bg-accent-strong px-3.5 py-2.5 text-[12px] font-bold text-white"
                      >
                        {t.action}
                      </button>
                    )}
                  </div>
                );
              })}
              {/* 코치 실제출결 데모 행 */}
              {!coachDemoGone && (
                <div className="flex items-center gap-3 py-3">
                  <div className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-xl bg-accent-weak text-accent-ink">
                    <IconCheck size={20} />
                  </div>
                  <div className="flex-1 text-[12px] font-semibold leading-snug text-ink3">
                    데모 — 코치가 실제 출결을 확정하면 이 할 일이 자동 종료돼요
                    <small className="block text-[11.5px] font-medium text-ink3">
                      박민준: 학부모 예정 결석 → 코치 실제 출석 확정
                    </small>
                  </div>
                  <button
                    onClick={coachActualDemo}
                    className="shrink-0 rounded-[10px] border-[1.5px] border-line bg-surface px-3 py-2.5 text-[12px] font-bold text-accent-ink"
                  >
                    코치 실제출석 확정
                  </button>
                </div>
              )}
            </>
          )}
        </Card>
        </div>

        {/* ③ 반별 정원 현황 */}
        <Card>
          <CardH4 note="6개 반">반별 정원 현황</CardH4>
          {CAP_METERS.map((m) => {
            const pv = { ok: "text-accent-ink", full: "text-danger", low: "text-warn" }[m.tone];
            return (
              <div key={m.nm} className="border-b border-line2 py-3 last:border-b-0">
                <div className="flex items-baseline justify-between">
                  <span className="text-[14px] font-bold text-ink">
                    {m.nm}
                    <small className="ml-1.5 text-[12px] font-medium text-ink3">{m.sub}</small>
                  </span>
                  <span className={cn("text-[12.5px] font-bold tabular-nums", pv)}>{m.note}</span>
                </div>
                <Meter pct={Math.round((m.cur / m.cap) * 100)} tone={m.tone} />
                {m.recruit && <RecruitActions toast={toast} />}
              </div>
            );
          })}
        </Card>

        {/* ④ 코치 전달사항 */}
        <Card>
          <CardH4 note="수업 전에 코치 앱에 떠요">코치에게 전달사항 ✍️</CardH4>
          <div className="mb-2.5 flex flex-wrap gap-2" role="group" aria-label="전달 대상 코치 선택">
            {COACH_CHIPS.map((c) => (
              <button
                key={c}
                aria-pressed={coach === c}
                disabled={coachStage !== 0}
                onClick={() => setCoach(c)}
                className={cn(
                  "rounded-full border-[1.5px] px-3.5 py-2 text-[12.5px] font-semibold transition disabled:opacity-60",
                  coach === c ? "border-accent-strong bg-accent-strong text-white" : "border-line bg-surface text-ink2",
                )}
              >
                {c} 코치
              </button>
            ))}
          </div>
          <textarea
            aria-label="코치 전달 내용"
            value={coachMsg}
            disabled={coachStage !== 0}
            onChange={(e) => setCoachMsg(e.target.value)}
            placeholder="예: 도담이 컨디션 확인해주세요"
            className="h-[76px] w-full resize-none rounded-xl border border-line bg-fill p-3 text-[13.5px] font-medium leading-normal text-ink outline-none focus:border-accent focus:bg-surface disabled:opacity-70"
          />
          <button
            disabled={coachStage === 1}
            onClick={sendCoach}
            className={cn(
              "mt-3 h-11 w-full rounded-2xl text-[13.5px] font-bold text-white",
              coachStage >= 2 ? "bg-accent-ink" : "bg-accent-strong",
            )}
          >
            {coachStage === 1 ? (
              <>
                <Spinner />
                전송 중...
              </>
            ) : coachStage >= 2 ? (
              "전송됨 ✓"
            ) : (
              `${coach} 코치에게 전송`
            )}
          </button>
          {coachStage >= 2 && (
            <SentNote>
              {coachStage === 2 && (
                <>✓ {coach} 코치 앱에 표시됨 · 확인 대기 — 코치가 읽으면 &quot;확인함&quot;으로 바뀌어요</>
              )}
              {coachStage === 3 && (
                <>
                  ✓ <b>{coach} 코치 확인함</b> · 오후 2:38 — 수업에 반영해요
                </>
              )}
              {coachStage === 4 && (
                <>
                  ✓ <b>코치 처리결과 도착</b> · 오후 3:12 — “도담이 강도 한 단계 낮춰 진행, 물 두 번 마시고 끝까지 참여했어요”
                  <br />
                  <span className="font-medium text-ink3">
                    민감 내용이라 전체방이 아닌 <b className="text-ink3">원장 1:1 업무 기록·해당 원생 기록</b>에만 남아요
                  </span>
                </>
              )}
            </SentNote>
          )}
        </Card>
        <div className="h-2" />
      </AppScroll>
      {toastNode}
      {confirmNode}
    </>
  );
}

function TileStat({ value, label, tone }: { value: string; label: string; tone: "accent" | "gold" | "danger" }) {
  const vc = { accent: "text-accent-ink", gold: "text-warn", danger: "text-danger" }[tone];
  return (
    <div className="rounded-2xl border border-line bg-surface p-3.5">
      <div className={cn("text-[18px] font-extrabold tracking-tight tabular-nums", vc)}>{value}</div>
      <div className="mt-0.5 text-[11.5px] font-medium text-ink3">{label}</div>
    </div>
  );
}

function RecruitActions({ toast }: { toast: (m: string) => void }) {
  const [d1, setD1] = useState(false);
  const [d2, setD2] = useState(false);
  const mk = (drafted: boolean, set: (b: boolean) => void, primary: boolean, base: string) => (
    <button
      onClick={() => {
        if (drafted) return;
        set(true);
        toast("반 정보로 모집 초안이 생성됐어요");
      }}
      className={cn(
        "flex-1 rounded-[10px] px-2 py-2.5 text-[12px] font-bold",
        drafted
          ? "bg-fill text-ink3"
          : primary
            ? "bg-accent-strong text-white"
            : "border-[1.5px] border-line bg-surface text-accent-ink",
      )}
    >
      {drafted ? "초안 생성됨 → 편집하기" : base}
    </button>
  );
  return (
    <>
      <div className="mt-3 flex gap-2">
        {mk(d1, setD1, true, "학부모 공지 만들기")}
        {mk(d2, setD2, false, "홍보 콘텐츠 만들기")}
      </div>
      <div className="mt-2 text-[11.5px] font-medium leading-normal text-ink3">
        누르면 반 정보(토요일 · 7~9세 · 빈자리 7)로 <b className="font-bold text-accent-ink">모집 초안이 자동 생성</b>돼요 — 공지·블로그·인스타에 바로 쓰세요.
      </div>
    </>
  );
}
