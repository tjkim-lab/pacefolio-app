"use client";

/* 원장 홈 (13A — docs/13-owner-product-plan.md §B)
   원칙: 모바일 = "오늘 확인하고 바로 처리" — 모든 숫자는 버튼(클릭 → 명단 →
   다음 행동). 홈 첫 화면에 금액 비노출(명단 연 후 표시). 작성·대량 발송은 PC.
   #48: READY = "오늘 처리할 일"·타일·수납 스트립이 서버 정본(#45 엔드포인트 재사용,
   pc/_live 공유) — 홈 금액 비노출 헌법대로 건수·수납률만. FIXTURE = 기존 데모. */
import { useRef, useState } from "react";
import { OwnerLiveProvider, useOwnerLive } from "../pc/_live";
import { AppScroll } from "@/components/mobile/MobileShell";
import { HomeBanner } from "@/components/mobile/HomeBanner";
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
  OwnerSheet,
} from "./_kit";
import {
  CAP_METERS, CAP_DAYS, TODOS, TODO_CONFIRM, PAY_SHEETS, NOTICE_UNREAD,
  type TodoKey,
} from "./_data";

/* 목업 심볼(mega/trophy/alert)을 공용 라인 아이콘으로 매핑 */
function TodoIcon({ kind }: { kind: "mega" | "card" | "trophy" | "alert" }) {
  if (kind === "card") return <IconCard size={18} />;
  return { mega: <Mega />, trophy: <Trophy />, alert: <Alert /> }[kind];
}
const Mega = () => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 11v2a1 1 0 0 0 1 1h2l9 5V5L6 10H4a1 1 0 0 0-1 1z" />
    <path d="M18 8a4 4 0 0 1 0 8" />
  </svg>
);
const Trophy = () => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M7 4h10v4a5 5 0 0 1-10 0z" />
    <path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M9 20h6M12 13v4" />
  </svg>
);
const Alert = () => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3 2.5 20h19z" />
    <path d="M12 10v4M12 17.2h.01" />
  </svg>
);
const Chev = ({ open }: { open: boolean }) => (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    className={cn("shrink-0 text-ink3 transition-transform", open && "rotate-180")}>
    <path d="m6 9 6 6 6-9" transform="translate(0 1.5) scale(1 .8)" />
  </svg>
);

interface TodoState {
  done: boolean;
  after: string;
  afterSub: string;
}

/* 13A 버튼 규격: 액션 76~84×36 동일 — 완료 후 같은 자리 상태 badge */
const ACT_BTN = "grid h-9 w-[80px] shrink-0 place-items-center rounded-[10px] text-[12px] font-bold";

export default function OwnerHome() {
  return (
    <OwnerLiveProvider>
      <OwnerHomeBody />
    </OwnerLiveProvider>
  );
}

/* READY 카드 — 서버 정본에서 파생(pc/page.tsx #45 와 같은 산정) */
interface LiveTodo {
  key: string;
  hot?: boolean;
  icon: "mega" | "card" | "trophy" | "alert";
  title: string;
  sub: string;
  action: string;
  run: () => void;
}
const AN_TYPE_KO: Record<string, string> = { ABSENCE: "긴급결석", LATE: "지각 예정", EARLY_LEAVE: "조퇴 예정" };

function OwnerHomeBody() {
  const { toast, toastNode } = useToast();
  const { confirm, confirmNode } = useConfirm();
  const todoCardRef = useRef<HTMLDivElement>(null);
  const live = useOwnerLive();
  const ready = live.state === "READY";
  const [liveDone, setLiveDone] = useState<Record<string, string>>({}); // key → 완료 문구
  const [liveBusy, setLiveBusy] = useState<Record<string, boolean>>({});
  const [openLive, setOpenLive] = useState<string | null>(null);
  const completeLive = (key: string, msg: string) => setLiveDone((d) => ({ ...d, [key]: msg }));

  const liveTodos: LiveTodo[] = [];
  if (ready) {
    for (const an of live.attendanceNotices) {
      if (an.acknowledgedAt && !liveDone[`an:${an.noticeId}`]) continue;
      liveTodos.push({
        key: `an:${an.noticeId}`, hot: an.type === "ABSENCE", icon: "alert",
        title: `${AN_TYPE_KO[an.type] ?? an.type} — ${an.participantName}`,
        sub: `${an.date} · 사유: "${an.reason}" · 학부모 접수 · 실제 출결은 코치 확정`,
        action: "확인",
        run: () => {
          const key = `an:${an.noticeId}`;
          if (liveBusy[key]) return;
          setLiveBusy((b) => ({ ...b, [key]: true }));
          void live.ackAttendanceNotice(an.noticeId).then((r) => {
            setLiveBusy((b) => ({ ...b, [key]: false }));
            toast(r.message);
            if (r.ok) completeLive(key, "원장 확인 완료 — 학부모에게 '확인했어요' 전달");
          });
        },
      });
    }
    for (const n of live.notices) {
      const unread = n.unread ?? 0;
      if (unread === 0 && !liveDone[`nt:${n.noticeId}`]) continue;
      const recipients = n.recipients ?? 0;
      liveTodos.push({
        key: `nt:${n.noticeId}`, icon: "mega",
        title: `공지 미열람 보호자 ${unread}명`,
        sub: `"${n.title}" · 읽음 ${recipients - unread}/${recipients} · 안 읽은 보호자에게만 다시 가요`,
        action: "다시 알림",
        run: () => confirm({
          title: "공지 재알림",
          rows: [["공지", n.title], ["미열람 보호자", `${unread}명`]],
          warn: "안 읽은 보호자에게만 다시 보냅니다 — 전체 재발송이 아니에요.",
          label: `${unread}명에게 다시 알림`,
          onConfirm: () => {
            void live.remindNotice(n.noticeId).then((r) => {
              toast(r.message);
              if (r.ok) completeLive(`nt:${n.noticeId}`, "재알림 발송 완료 · 읽음 추적 계속");
            });
          },
        }),
      });
    }
    const sum = live.summary;
    if (sum && (sum.unpaidCount > 0 || liveDone["unpaid"])) {
      liveTodos.push({
        key: "unpaid", icon: "card",
        title: `수강료 미납 ${sum.unpaidCount}건`,
        // 홈 금액 비노출(헌법) — 금액은 수납 탭에서
        sub: "입금 시 자동 확인 · 금액은 수납 탭에서 확인",
        action: "리마인드",
        run: () => confirm({
          title: "미납 리마인드",
          rows: [["미납 청구", `${sum.unpaidCount}건`], ["수신", "결제 권한 보호자만(인앱)"], ["알림톡", "사업자 연동 후"]],
          label: "리마인드 발송",
          onConfirm: () => {
            void live.remindUnpaid().then((r) => {
              toast(r.message);
              if (r.ok) completeLive("unpaid", "리마인드 발송 완료 · 결제 대기 추적");
            });
          },
        }),
      });
    }
  }
  const liveLeft = liveTodos.filter((t) => !liveDone[t.key]).length;

  // 오늘 처리할 일
  const [todos, setTodos] = useState<Record<TodoKey, TodoState>>(() =>
    Object.fromEntries(
      TODOS.map((t) => [t.key, { done: false, after: t.after, afterSub: t.afterSub }]),
    ) as Record<TodoKey, TodoState>,
  );
  const [openTodo, setOpenTodo] = useState<TodoKey | null>(null);
  const [coachDemoGone, setCoachDemoGone] = useState(false);
  const left = TODOS.filter((t) => !todos[t.key].done).length;

  // 수납 명단 시트 (13A: 숫자 = 버튼)
  const [paySheet, setPaySheet] = useState<null | "done" | "wait" | "over">(null);
  // 공지 미열람 명단 시트 (13B §7.1)
  const [noticeSheet, setNoticeSheet] = useState(false);

  // 반별 정원: 요일 OR 필터 + accordion (기본 접힘)
  const [dayFilter, setDayFilter] = useState<string[]>([]);
  const [openCls, setOpenCls] = useState<string | null>(null);
  const caps = dayFilter.length
    ? CAP_METERS.filter((m) => m.days.some((d) => dayFilter.includes(d)))
    : CAP_METERS;

  // 코치 전달사항 — ACK_REQUIRED (docs/12 개정: READ ≠ ACKNOWLEDGED ≠ RESOLVED)
  const COACH_CHIPS = ["김선재", "이창진", "박정우"];
  const [coach, setCoach] = useState("김선재");
  const [coachMsg, setCoachMsg] = useState("도담이 오늘 컨디션 확인해주세요 — 어제 병원 다녀왔대요");
  const [urgent, setUrgent] = useState(false);
  // 0 idle · 1 sending · 2 SENT · 3 READ · 4 ACKNOWLEDGED · 5 RESOLVED
  const [coachStage, setCoachStage] = useState<0 | 1 | 2 | 3 | 4 | 5>(0);

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
      after: "코치 실제 출석 확정",
      afterSub: "학부모 예정 결석(아파요) → 실제 출석 · 원장 할 일 자동 종료",
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
      toast(`${coach} 코치에게 ${urgent ? "긴급 " : ""}확인 필수로 전달됐어요`);
      setTimeout(() => {
        setCoachStage(3);
        toast(`${coach} 코치가 읽었어요 — 아직 확인 전이에요`);
      }, 1500);
      setTimeout(() => {
        setCoachStage(4);
        toast(`${coach} 코치가 '확인했습니다'를 눌렀어요`);
      }, 3000);
      setTimeout(() => {
        setCoachStage(5);
        toast("코치 처리결과가 도착했어요 — 원장 업무 기록에 저장");
      }, 5000);
    }, 700);
  }

  const sheet = paySheet ? PAY_SHEETS[paySheet] : null;

  const shownLeft = ready ? liveLeft : left;
  const sum = live.summary;
  const liveRate = sum && sum.billedKrw > 0 ? Math.round((sum.paidKrw / sum.billedKrw) * 100) : 0;

  return (
    <>
      <AppScroll>
        <Greeting
          title={<>원장님, 좋은 아침이에요 ☀️</>}
          sub={ready ? `원더짐 아카데미 · 원생 ${live.participants.length}명 · 실 데이터` : "원더짐 아카데미 · 원생 93명 · 10월 27일 (월)"}
          bellDot
          bell={<IconBell size={20} />}
        />

        {/* ① READY = 서버 수납 스트립(금액 비노출 — 건수·수납률만) · FIXTURE = 데모 배너 */}
        {ready && sum && (
          <Card className="!p-4">
            <div className="flex items-center gap-1.5 text-[12px] font-bold text-ink3">
              <span className="text-accent"><IconCard size={16} /></span> 수납 현황
              <span className="inline-flex items-center gap-1 text-[10.5px] font-extrabold text-brand"><span className="h-[7px] w-[7px] rounded-full bg-accent" />실 데이터</span>
            </div>
            <div className="mt-2 flex items-center gap-2.5">
              <div className="flex-1"><Meter pct={liveRate} /></div>
              <span className="text-[12px] font-bold text-ink2 whitespace-nowrap">수납률 {liveRate}%</span>
            </div>
            <div className="mt-1.5 text-[12px] font-semibold text-ink3">
              수납 {sum.paidCount}건 · 미납 {sum.unpaidCount}건 — 금액은 수납 탭에서 확인
            </div>
          </Card>
        )}
        {!ready && (
        <HomeBanner
          ariaLabel="원장 운영 요약 배너"
          slides={[
            <div key="pay" className="flex h-full flex-col justify-between bg-accent-strong p-4 text-white">
              <div>
                <div className="text-[12px] font-medium opacity-90">9월 시작 수납기간 (9~11월) · 금액 기준 수납률 <b className="font-bold text-accent-weak">87%</b></div>
                <div className="mt-0.5 text-[13px] font-semibold opacity-95">누르면 명단과 다음 행동으로 이어져요</div>
              </div>
              <div className="flex gap-2">
                {([
                  ["done", "결제 완료", "81명", false],
                  ["wait", "결제 대기", "7명", false],
                  ["over", "기한 초과", "5명", true],
                ] as const).map(([k, label, v, warn]) => (
                  <button
                    key={k}
                    onClick={() => setPaySheet(k)}
                    className="flex-1 rounded-xl bg-white/15 px-3 py-2 text-left transition active:bg-white/25"
                  >
                    <div className="text-[11px] font-medium opacity-90">{label}</div>
                    <div className={cn("mt-0.5 text-[15px] font-extrabold tabular-nums", warn && "text-warn-weak")}>{v}</div>
                  </button>
                ))}
              </div>
            </div>,
            <Card key="notice" className="flex h-full flex-col justify-between !p-4">
              <div className="flex items-center gap-1.5 text-[12px] font-bold text-ink3">
                <span className="text-accent"><Mega /></span> 안 읽은 공지
              </div>
              <div className="text-[14.5px] font-extrabold leading-snug tracking-tight">
                &quot;가을 대회 참가 안내&quot; — 보호자 <b className="text-accent-ink">6명</b>이 안 읽었어요
                <div className="mt-1.5 flex items-center gap-2.5 text-[11.5px] font-semibold text-ink3">
                  <div className="flex-1"><Meter pct={93} /></div>
                  <span>읽음 81/87</span>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="soft" className="h-9 flex-1 text-[12.5px]" onClick={() => setNoticeSheet(true)}>
                  안 읽은 6명 명단
                </Button>
                <Button variant="primary" className="h-9 flex-1 text-[12.5px]" onClick={() => handleTodo("notice")}>
                  다시 알림
                </Button>
              </div>
            </Card>,
            <Card key="todo" className="flex h-full flex-col justify-between !p-4">
              <div className="flex items-center gap-1.5 text-[12px] font-bold text-ink3">
                <span className="text-accent"><IconClock size={16} /></span> 오늘 처리할 일 <b className="text-danger">{left}건</b>
              </div>
              <ul className="text-[12px] font-semibold text-ink2">
                {TODOS.slice(0, 3).map((t, i) => (
                  <li key={t.key} className="flex justify-between py-0.5">
                    <span>{["공지 안 본 보호자", "수강료 기한 초과", "대회 미응답"][i]}</span>
                    <b className={cn("font-extrabold tabular-nums", todos[t.key].done ? "text-accent-ink" : "text-danger")}>
                      {todos[t.key].done ? t.bn : ["6명", "5명", "4명"][i]}
                    </b>
                  </li>
                ))}
              </ul>
              <Button variant="soft" className="h-9 w-full text-[12.5px]"
                onClick={() => todoCardRef.current?.scrollIntoView({ behavior: "smooth" })}>
                아래에서 바로 처리하기
              </Button>
            </Card>,
          ]}
        />
        )}

        {/* 요약 타일 3개 — READY 는 서버 집계(출석률은 서버 정본 없어 미표시·위장 금지) */}
        <div className="grid grid-cols-3 gap-2.5">
          {ready && sum ? (
            <>
              <TileStat value={`${live.participants.length}명`} label="전체 원생" tone="accent" />
              <TileStat value={`${sum.unpaidCount}건`} label="미납 청구" tone="gold" />
              <TileStat value={`${shownLeft}건`} label="처리 필요" tone="danger" />
            </>
          ) : (
            <>
              <TileStat value="93명" label="전체 원생" tone="accent" />
              <TileStat value="89%" label="이번 주 출석률" tone="gold" />
              <TileStat value={`${left}건`} label="처리 필요" tone="danger" />
            </>
          )}
        </div>

        {/* ② 오늘 처리할 일 — compact row (설명 기본 숨김 · 행 클릭 = 펼침) */}
        <div ref={todoCardRef}>
        {ready ? (
        <Card>
          <CardH4 note={liveLeft > 0 ? `${liveLeft}건 남음 · 실 데이터` : "모두 완료 · 실 데이터"}>오늘 처리할 일</CardH4>
          {liveTodos.length === 0 ? (
            <div className="py-6 text-center">
              <div className="text-[34px]">🎉</div>
              <div className="mt-2 text-[15px] font-extrabold text-accent-ink">오늘 할 일 끝!</div>
              <div className="mt-1 text-[12px] font-medium text-ink3">알림·리마인드는 시스템이 이어서 추적할게요</div>
            </div>
          ) : (
            liveTodos.map((t) => {
              const doneMsg = liveDone[t.key];
              const open = openLive === t.key;
              return (
                <div key={t.key} className={cn("border-b border-line2 last:border-b-0", doneMsg && "opacity-60")}>
                  <div className="flex min-h-[52px] items-center gap-2.5 py-1.5">
                    <div className={cn(
                      "grid h-8 w-8 shrink-0 place-items-center rounded-[10px]",
                      t.hot ? "bg-danger-weak text-danger" : "bg-fill text-ink2",
                    )}>
                      <TodoIcon kind={t.icon} />
                    </div>
                    <button
                      onClick={() => setOpenLive(open ? null : t.key)}
                      className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                      aria-expanded={open}
                    >
                      <span className="truncate text-[13.5px] font-semibold text-ink">{t.title}</span>
                      <Chev open={open} />
                    </button>
                    {doneMsg ? (
                      <span className={cn(ACT_BTN, "bg-fill !text-[11px] text-accent-ink")}>완료 ✓</span>
                    ) : (
                      <button onClick={t.run} disabled={liveBusy[t.key]}
                        className={cn(ACT_BTN, "bg-accent-strong text-white disabled:opacity-50")}>
                        {liveBusy[t.key] ? "..." : t.action}
                      </button>
                    )}
                  </div>
                  {open && (
                    <div className="pb-2.5 pl-[42px] text-[12px] font-medium leading-normal text-ink3">
                      {doneMsg ?? t.sub}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </Card>
        ) : (
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
                const open = openTodo === t.key;
                return (
                  <div key={t.key} className={cn("border-b border-line2 last:border-b-0", st.done && "opacity-60")}>
                    <div className="flex min-h-[52px] items-center gap-2.5 py-1.5">
                      <div className={cn(
                        "grid h-8 w-8 shrink-0 place-items-center rounded-[10px]",
                        t.hot ? "bg-danger-weak text-danger" : "bg-fill text-ink2",
                      )}>
                        <TodoIcon kind={t.icon} />
                      </div>
                      <button
                        onClick={() => setOpenTodo(open ? null : t.key)}
                        className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                        aria-expanded={open}
                      >
                        <span className="truncate text-[13.5px] font-semibold text-ink">{t.title}</span>
                        <Chev open={open} />
                      </button>
                      {st.done ? (
                        <span className={cn(ACT_BTN, "bg-fill text-accent-ink")}>{t.bn}</span>
                      ) : (
                        <button onClick={() => handleTodo(t.key)} className={cn(ACT_BTN, "bg-accent-strong text-white")}>
                          {t.action}
                        </button>
                      )}
                    </div>
                    {open && (
                      <div className="pb-2.5 pl-[42px] text-[12px] font-medium leading-normal text-ink3">
                        {st.done ? <>{st.after} · {st.afterSub}</> : t.sub}
                      </div>
                    )}
                  </div>
                );
              })}
              {/* 코치 실제출결 데모 행 */}
              {!coachDemoGone && (
                <div className="flex min-h-[52px] items-center gap-2.5 py-1.5">
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-accent-weak text-accent-ink">
                    <IconCheck size={18} />
                  </div>
                  <div className="min-w-0 flex-1 text-[12px] font-semibold leading-snug text-ink3">
                    데모 — 코치가 실제 출결을 확정하면 자동 종료
                  </div>
                  <button onClick={coachActualDemo}
                    className={cn(ACT_BTN, "border-[1.5px] border-line bg-surface !text-[11px] text-accent-ink")}>
                    코치 확정
                  </button>
                </div>
              )}
            </>
          )}
        </Card>
        )}
        </div>

        {/* ③ 반별 정원 — 요일 OR 필터 + 기본 접힘 accordion */}
        <Card>
          <CardH4 note={`${caps.length}개 반`}>반별 정원 현황</CardH4>
          <div className="mb-1 flex gap-1" role="group" aria-label="요일 필터 (복수 선택 = 또는)">
            <button
              onClick={() => setDayFilter([])}
              aria-pressed={dayFilter.length === 0}
              className={cn(
                "rounded-lg px-2 py-1.5 text-[12px] font-bold",
                dayFilter.length === 0 ? "bg-accent-strong text-white" : "bg-fill text-ink2",
              )}
            >
              전체
            </button>
            {CAP_DAYS.map((d) => {
              const on = dayFilter.includes(d);
              return (
                <button
                  key={d}
                  aria-pressed={on}
                  onClick={() => setDayFilter((prev) => (on ? prev.filter((x) => x !== d) : [...prev, d]))}
                  className={cn(
                    "flex-1 rounded-lg py-1.5 text-[12px] font-bold",
                    on ? "bg-accent-strong text-white" : "bg-fill text-ink2",
                  )}
                >
                  {d}
                </button>
              );
            })}
          </div>
          {caps.length === 0 && (
            <div className="py-5 text-center text-[12.5px] font-medium text-ink3">선택한 요일에 수업하는 반이 없어요</div>
          )}
          {caps.map((m) => {
            const pv = { ok: "text-accent-ink", full: "text-danger", low: "text-warn" }[m.tone];
            const open = openCls === m.nm;
            return (
              <div key={m.nm} className="border-b border-line2 last:border-b-0">
                <button
                  onClick={() => setOpenCls(open ? null : m.nm)}
                  aria-expanded={open}
                  className="flex min-h-[48px] w-full items-center justify-between gap-2 py-2 text-left"
                >
                  <span className="text-[14px] font-bold text-ink">{m.nm}</span>
                  <span className="flex items-center gap-1.5">
                    <span className={cn("text-[12.5px] font-bold tabular-nums", pv)}>{m.note}</span>
                    <Chev open={open} />
                  </span>
                </button>
                {open && (
                  <div className="pb-3">
                    <div className="text-[12px] font-medium text-ink3">
                      {m.prog} · {m.sub} · {m.days.join("·")} {m.time}
                    </div>
                    <Meter pct={Math.round((m.cur / m.cap) * 100)} tone={m.tone} />
                    <div className="mt-1.5 text-[12px] font-semibold text-ink2">
                      {m.cap - m.cur > 0 ? (
                        <>빈자리 <b className="text-accent-ink">{m.cap - m.cur}</b></>
                      ) : (
                        <>정원 마감{m.note.includes("대기") ? " · 대기 있음" : ""}</>
                      )}
                      {m.recruit && (
                        <span className="ml-1.5 font-medium text-ink3">— 모집 공지·홍보 작성은 PC 콘솔에서</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </Card>

        {/* ④ 코치 전달사항 — 확인 필수(ACK_REQUIRED) 메시지 */}
        <Card>
          <CardH4 note="확인 필수 — 읽음만으론 안 사라져요">코치에게 전달사항 ✍️</CardH4>
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
          <label className="mt-2 flex items-center gap-2 text-[12.5px] font-semibold text-ink2">
            <input
              type="checkbox"
              checked={urgent}
              disabled={coachStage !== 0}
              onChange={(e) => setUrgent(e.target.checked)}
              className="h-4 w-4 accent-[#DD6952]"
            />
            긴급 — 확인 전까지 반복 알림, 미확인 시 원장에게 경고
          </label>
          <button
            disabled={coachStage === 1}
            onClick={sendCoach}
            className={cn(
              "mt-3 h-11 w-full rounded-2xl text-[13.5px] font-bold text-white",
              coachStage >= 2 ? "bg-accent-ink" : urgent ? "bg-danger" : "bg-accent-strong",
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
              `${coach} 코치에게 ${urgent ? "긴급 " : ""}확인 필수로 전송`
            )}
          </button>
          {coachStage >= 2 && (
            <SentNote>
              {coachStage === 2 && (
                <>✓ {coach} 코치 · <b>전송됨</b> — 코치 홈 상단 고정 · 확인 버튼을 눌러야 사라져요</>
              )}
              {coachStage === 3 && (
                <>✓ {coach} 코치 · <b>읽음</b> — 아직 확인 전(READ ≠ 확인) · 미확인 뱃지 유지</>
              )}
              {coachStage === 4 && (
                <>✓ {coach} 코치 · <b>확인 완료</b> 오후 2:38 — 수업에 반영해요</>
              )}
              {coachStage === 5 && (
                <>
                  ✓ <b>처리 결과 도착</b> · 오후 3:12 — “도담이 강도 한 단계 낮춰 진행, 물 두 번 마시고 끝까지 참여했어요”
                  <br />
                  <span className="font-medium text-ink3">
                    같은 메시지 thread 에 기록 — 민감 내용이라 <b className="text-ink3">원장 1:1 업무 기록·해당 원생 기록</b>에만 남아요
                  </span>
                </>
              )}
            </SentNote>
          )}
        </Card>
        <div className="h-2" />
      </AppScroll>

      {/* 수납 명단 시트 — 숫자 카드 클릭 → 명단 + 다음 행동 */}
      {sheet && paySheet && (
        <OwnerSheet
          title={`${sheet.title} ${sheet.count}명`}
          sub={sheet.sub}
          onClose={() => setPaySheet(null)}
        >
          {sheet.rows.map((r) => (
            <div key={r.id} className="border-b border-line2 py-3 last:border-b-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[14px] font-bold text-ink">
                  {r.nm} <small className="ml-1 text-[12px] font-medium text-ink3">{r.cls}</small>
                </span>
                {r.amt && <span className="text-[13px] font-extrabold tabular-nums text-ink">{r.amt}</span>}
              </div>
              <div className="mt-0.5 text-[12px] font-medium text-ink3">{r.sub}</div>
              <div className="mt-2 flex gap-1.5">
                {sheet.actions.map((a) => (
                  <button
                    key={a}
                    onClick={() => {
                      if (a === "입금 확인") {
                        confirm({
                          title: "계좌이체 입금 확인",
                          rows: [["원생", r.nm], ["금액", r.amt ?? "-"], ["기록", "확인자·시각·증빙 AuditLog 저장"]],
                          warn: "수기 확인은 카드결제(CAPTURED)와 별도 수납 경로로 기록돼요 — 결제 상태를 임의로 바꾸지 않아요. 증빙(입금내역)을 함께 남겨주세요.",
                          label: "입금 확인 기록",
                          onConfirm: () => toast(`${r.nm} 입금 확인 기록됨 — AuditLog 저장 (목업)`),
                        });
                      } else {
                        toast(`${r.nm} · ${a} (목업 — 실 API 연결 후)`);
                      }
                    }}
                    className={cn(ACT_BTN, "w-auto border-[1.5px] border-line bg-surface px-2.5 text-accent-ink")}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {sheet.more && <div className="pt-3 text-center text-[12px] font-medium text-ink3">{sheet.more}</div>}
          {sheet.bulk && (
            <Button variant="primary" className="mt-3 h-11 w-full text-[13px]"
              onClick={() => toast(`${sheet.bulk} — ${sheet.count}명 대상 (목업)`)}>
              {sheet.bulk}
            </Button>
          )}
        </OwnerSheet>
      )}
      {/* 공지 미열람 보호자 명단 (13B §7.1) */}
      {noticeSheet && (
        <OwnerSheet
          title={`안 읽은 보호자 ${NOTICE_UNREAD.count}명`}
          sub={`"${NOTICE_UNREAD.title}" · 읽음 81/87`}
          onClose={() => setNoticeSheet(false)}
        >
          {NOTICE_UNREAD.rows.map((r) => (
            <div key={r.id} className="border-b border-line2 py-3 last:border-b-0">
              <div className="text-[14px] font-bold text-ink">{r.nm}</div>
              <div className="mt-0.5 text-[12px] font-medium text-ink3">{r.sub}</div>
              <div className="mt-2 flex gap-1.5">
                {["재알림", "대화"].map((a) => (
                  <button key={a} onClick={() => toast(`${r.nm} · ${a} (목업 — 실 API 연결 후)`)}
                    className={cn(ACT_BTN, "w-auto border-[1.5px] border-line bg-surface px-2.5 text-accent-ink")}>
                    {a}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div className="pt-3 text-center text-[12px] font-medium text-ink3">{NOTICE_UNREAD.more}</div>
          <Button variant="primary" className="mt-3 h-11 w-full text-[13px]"
            onClick={() => { setNoticeSheet(false); handleTodo("notice"); }}>
            선택 재발송 — 안 읽은 {NOTICE_UNREAD.count}명 전체
          </Button>
        </OwnerSheet>
      )}
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
