"use client";

/* PC 원장 대시보드(#45) — "오늘 처리할 일" 실 API 배선.
   READY = 서버 정본만: 공지 미열람(재알림)·미납(리마인드)·긴급결석(원장 확인).
   FIXTURE = 기존 데모 유지(명시 플래그·비프로덕션 네트워크 실패만 — _live 4상태).
   대회 미응답 카드는 서버 정본이 없어 READY 에선 표시하지 않는다(위장 금지). */
import { useState } from "react";
import { PCShell } from "./_shell";
import { Panel, Meter, ActBtn, useOverlays } from "./_ui";
import { DASH_KPI, CAPACITY, fmt } from "./_data";
import { OwnerLiveProvider, useOwnerLive } from "./_live";

type TodoKey = "notice" | "unpaid" | "event" | "absence";
interface TodoDef {
  key: TodoKey;
  hot?: boolean;
  title: string;
  sub: string;
  action: string;
  after: string;
  afterSub: string;
}
const TODOS: TodoDef[] = [
  { key: "notice", title: "공지 미열람 보호자 6명", sub: '"가을 대회 참가 안내" · 어제 발송 · 읽음 81/87', action: "다시 알림", after: "재알림 발송 완료 · 추적 중", afterSub: "다음 확인: 내일 오전 10시" },
  { key: "unpaid", title: "수강료 미납 5명", sub: "3분기 ₩1,620,000 · 마감 지남 2명 포함", action: "리마인드", after: "리마인드 발송 완료 · 결제 대기", afterSub: "결제 완료 아님 — 입금 시 자동 확인" },
  { key: "event", title: "대회 미응답 4명", sub: "강동 유소년 챔피언십 · 신청 마감 D-3", action: "재발송", after: "재발송 완료 · 응답 대기", afterSub: "응답이 오면 알려드려요" },
  { key: "absence", hot: true, title: "긴급결석 1건 — 박민준", sub: '오늘 2:30 플레이2 · 사유: "아파요" · 학부모 접수 · 실제 출결 미확인', action: "확인", after: "긴급결석 확인 완료", afterSub: "학부모에게 '확인했어요' 전달 — 보강 자동 생성 아님" },
];
const TODO_CONFIRM: Record<Exclude<TodoKey, "absence">, { title: string; rows: [string, string][]; warn?: string; label: string; toast: string }> = {
  notice: { title: "공지 재알림", rows: [["공지", "가을 대회 참가 안내"], ["대상 원생", "6명"], ["알림 수신 보호자", "6명"]], warn: "안 읽은 보호자에게만 다시 보냅니다.", label: "6명에게 다시 알림", toast: "재알림 발송 완료 — 안 읽은 보호자 6명" },
  unpaid: { title: "미납 리마인드", rows: [["대상 원생", "5명"], ["미납 합계", "1,620,000원"], ["발송 채널", "알림톡 우선 · 실패 시 SMS 대체"]], label: "리마인드 발송", toast: "리마인드 발송 완료 · 결제 대기" },
  event: { title: "대회 안내 재발송", rows: [["대회", "강동 유소년 챔피언십"], ["대상 원생", "4명"], ["신청 마감", "D-3"]], label: "4명에게 재발송", toast: "재발송 완료 · 응답 대기" },
};

/* READY 카드 — 서버 정본에서 파생. after 문구는 액션 결과 message 가 정본 */
interface LiveTodo {
  key: string;
  hot?: boolean;
  icon: string;
  title: string;
  sub: string;
  action: string;
  run: () => void;
}
const AN_TYPE_KO: Record<string, string> = { ABSENCE: "긴급결석", LATE: "지각 예정", EARLY_LEAVE: "조퇴 예정" };

export default function PCDashboard() {
  return (
    <OwnerLiveProvider>
      <PCDashboardBody />
    </OwnerLiveProvider>
  );
}

function PCDashboardBody() {
  const { confirm, toast, overlays } = useOverlays();
  const live = useOwnerLive();
  const ready = live.state === "READY";
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [doneMsg, setDoneMsg] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [drafted, setDrafted] = useState<Record<string, boolean>>({});

  function complete(key: string, msg?: string) {
    setDone((d) => ({ ...d, [key]: true }));
    if (msg) setDoneMsg((m) => ({ ...m, [key]: msg }));
  }

  /* ── FIXTURE 데모 경로 (기존 유지) ── */
  function handleTodo(t: TodoDef) {
    if (done[t.key]) return;
    if (t.key === "absence") {
      complete("absence");
      toast("원장 확인 완료 — 학부모에게 '확인했어요' 알림 전달");
      return;
    }
    const c = TODO_CONFIRM[t.key];
    confirm({ title: c.title, rows: c.rows, warn: c.warn, label: c.label, onConfirm: () => { complete(t.key); toast(c.toast); } });
  }

  /* ── READY — 서버 정본 카드 산정 ── */
  const liveTodos: LiveTodo[] = [];
  if (ready) {
    for (const an of live.attendanceNotices) {
      if (an.acknowledgedAt && !done[`an:${an.noticeId}`]) continue; // 이미 확인된 통보 — 방금 처리한 건만 완료 표시로 남김
      liveTodos.push({
        key: `an:${an.noticeId}`, hot: an.type === "ABSENCE", icon: "⚠️",
        title: `${AN_TYPE_KO[an.type] ?? an.type} — ${an.participantName}`,
        sub: `${an.date} · 사유: "${an.reason}" · 학부모 접수 · 실제 출결 미확인`,
        action: "확인",
        run: () => {
          const key = `an:${an.noticeId}`;
          if (busy[key]) return;
          setBusy((b) => ({ ...b, [key]: true }));
          void live.ackAttendanceNotice(an.noticeId).then((r) => {
            setBusy((b) => ({ ...b, [key]: false }));
            toast(r.message);
            if (r.ok) complete(key, "긴급결석 확인 완료");
          });
        },
      });
    }
    for (const n of live.notices) {
      const unread = n.unread ?? 0;
      if (unread === 0 && !done[`nt:${n.noticeId}`]) continue;
      const recipients = n.recipients ?? 0;
      liveTodos.push({
        key: `nt:${n.noticeId}`, icon: "📣",
        title: `공지 미열람 보호자 ${unread}명`,
        sub: `"${n.title}" · 읽음 ${recipients - unread}/${recipients}`,
        action: "다시 알림",
        run: () => confirm({
          title: "공지 재알림",
          rows: [["공지", n.title], ["미열람 보호자", `${unread}명`]],
          warn: "안 읽은 보호자에게만 다시 보냅니다.",
          label: `${unread}명에게 다시 알림`,
          onConfirm: () => {
            void live.remindNotice(n.noticeId).then((r) => {
              toast(r.message);
              if (r.ok) complete(`nt:${n.noticeId}`, "재알림 발송 완료 · 추적 중");
            });
          },
        }),
      });
    }
    const sum = live.summary;
    if (sum && (sum.unpaidCount > 0 || done["unpaid"])) {
      liveTodos.push({
        key: "unpaid", icon: "💳",
        title: `수강료 미납 ${sum.unpaidCount}건`,
        sub: `미납 ₩${fmt(sum.unpaidKrw)} · 입금 시 자동 확인`,
        action: "리마인드",
        run: () => confirm({
          title: "미납 리마인드",
          rows: [["미납 청구", `${sum.unpaidCount}건`], ["미납 합계", `${fmt(sum.unpaidKrw)}원`], ["발송 채널", "인앱 알림 · 알림톡은 사업자 연동 후"]],
          label: "리마인드 발송",
          onConfirm: () => {
            void live.remindUnpaid().then((r) => {
              toast(r.message);
              if (r.ok) complete("unpaid", "리마인드 발송 완료 · 결제 대기");
            });
          },
        }),
      });
    }
  }

  const left = ready
    ? liveTodos.filter((t) => !done[t.key]).length
    : TODOS.filter((t) => !done[t.key]).length;

  /* KPI — READY 는 서버 집계(수납·원생·미납), FIXTURE 는 기존 데모 */
  const kpis = ready && live.summary
    ? [
        { kk: "수납 현황 (LIVE)", kv: `₩${fmt(live.summary.capturedKrw)}`, kd: `청구 ₩${fmt(live.summary.billedKrw)} 중 수납`, hero: true },
        { kk: "전체 원생", kv: `${live.participants.length}명`, kd: "서버 등록 기준", tone: "up" as const },
        { kk: "미납", kv: `${live.summary.unpaidCount}건`, kd: `₩${fmt(live.summary.unpaidKrw)}` },
      ]
    : DASH_KPI;

  return (
    <PCShell
      title="대시보드"
      actions={
        <>
          <span className="text-[11px] font-bold text-ink3 bg-fill border border-line rounded-lg px-3 py-1.5">
            {ready ? `원더짐 아카데미 · 원생 ${live.participants.length}명` : "원더짐 아카데미 · 원생 93명 · 10월 27일 (월)"}
          </span>
        </>
      }
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[19px] font-extrabold tracking-tight text-ink">원장님, 좋은 아침이에요 ☀️</h2>
        <span className="text-[12.5px] text-ink3 font-medium">
          {live.state === "ERROR"
            ? `서버 연결 오류 — ${live.errorMsg ?? "데이터를 불러오지 못했어요"}`
            : ready ? "서버 실데이터 · 실시간" : "3분기 (9~11월) · 원더짐 아카데미의 데모 설정"}
        </span>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3">
        <div className="rounded-2xl bg-accent-strong text-white p-4">
          <div className="text-[11.5px] font-semibold text-white/80">{kpis[0].kk}</div>
          <div className="text-[22px] font-extrabold tracking-tight mt-1">{kpis[0].kv}</div>
          <div className="text-[11px] font-semibold mt-1 text-white/80">{kpis[0].kd}</div>
        </div>
        {kpis.slice(1).map((k) => (
          <div key={k.kk} className="rounded-2xl bg-surface border border-line p-4">
            <div className="text-[11.5px] font-semibold text-ink3">{k.kk}</div>
            <div className="text-[22px] font-extrabold tracking-tight text-ink mt-1">{k.kv}</div>
            <div className={`text-[11px] font-semibold mt-1 ${"tone" in k && k.tone === "up" ? "text-brand" : "text-ink3"}`}>{k.kd}</div>
          </div>
        ))}
        <div className="rounded-2xl bg-surface border border-line p-4">
          <div className="text-[11.5px] font-semibold text-ink3">오늘 처리 필요</div>
          <div className="text-[22px] font-extrabold tracking-tight text-ink mt-1">{left}건</div>
          <div className={`text-[11px] font-semibold mt-1 ${left > 0 ? "text-danger-ink" : "text-ink3"}`}>
            {left > 0 ? "아래 카드에서 바로 처리" : "시스템이 이어서 추적 중"}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-[1.6fr_1fr] gap-3 items-start">
        {/* 오늘 처리할 일 */}
        <Panel title="오늘 처리할 일" hnote={left > 0 ? `${left}건 남음` : "모두 완료"} hnoteAccent={left === 0}>
          {left === 0 ? (
            <div className="text-center py-6">
              <div className="text-[30px]">🎉</div>
              <div className="text-[14px] font-extrabold text-brand mt-2">오늘 할 일 끝!</div>
              <div className="text-[11.5px] text-ink3 font-medium mt-1">알림·리마인드는 시스템이 이어서 추적할게요</div>
            </div>
          ) : ready ? (
            liveTodos.map((t) => {
              const isDone = done[t.key];
              return (
                <div key={t.key} className={`flex gap-3 items-center py-3 border-b border-line2 last:border-0 ${isDone ? "opacity-60" : ""}`}>
                  <div className={`w-[34px] h-[34px] rounded-lg grid place-items-center text-lg shrink-0 ${t.hot ? "bg-danger-weak" : "bg-fill"}`}>
                    {t.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-ink">{t.title}</div>
                    <div className="text-[11px] text-ink3 font-medium mt-0.5">{t.sub}</div>
                  </div>
                  {isDone ? (
                    <div className="text-[12px] font-bold text-brand text-right shrink-0 max-w-[46%] leading-tight">{doneMsg[t.key] ?? "처리 완료"}</div>
                  ) : (
                    <ActBtn onClick={t.run}>{busy[t.key] ? "처리 중…" : t.action}</ActBtn>
                  )}
                </div>
              );
            })
          ) : (
            TODOS.map((t) => {
              const isDone = done[t.key];
              return (
                <div key={t.key} className={`flex gap-3 items-center py-3 border-b border-line2 last:border-0 ${isDone ? "opacity-60" : ""}`}>
                  <div className={`w-[34px] h-[34px] rounded-lg grid place-items-center text-lg shrink-0 ${t.hot ? "bg-danger-weak" : "bg-fill"}`}>
                    {t.hot ? "⚠️" : t.key === "notice" ? "📣" : t.key === "unpaid" ? "💳" : "🏆"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-ink">{t.title}</div>
                    <div className="text-[11px] text-ink3 font-medium mt-0.5">{isDone ? t.afterSub : t.sub}</div>
                  </div>
                  {isDone ? (
                    <div className="text-[12px] font-bold text-brand text-right shrink-0 max-w-[46%] leading-tight">{t.after}</div>
                  ) : (
                    <ActBtn onClick={() => handleTodo(t)}>{t.action}</ActBtn>
                  )}
                </div>
              );
            })
          )}
        </Panel>

        {/* 반별 정원 현황 — READY = 서버 정본(#49: ACTIVE 등록 집계), FIXTURE = 기존 데모.
            모집 초안 버튼은 서버 정본이 없어 READY 에선 미표시(위장 금지) */}
        {ready ? (
          <Panel title="반별 정원 현황" hnote={`${live.classes.length}개 반 · 서버 정본`}>
            {live.classes.length === 0 ? (
              <div className="text-[12px] text-ink3 font-medium py-3">등록된 반이 없어요</div>
            ) : (
              live.classes.map((c) => {
                const pct = c.capacity > 0 ? Math.round((c.enrolled / c.capacity) * 100) : 0;
                const tone = pct >= 100 ? "full" as const : pct < 50 ? "low" as const : "accent" as const;
                const coachNames = c.coachUserIds
                  .map((id) => live.coaches.find((m) => m.userId === id)?.name)
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <div key={c.classId} className="mb-2.5 last:mb-0">
                    <div className="flex items-baseline justify-between gap-2.5 text-[13px]">
                      <span className="text-ink2 font-medium">
                        {c.name}
                        <small className="block text-[11px] text-ink3 font-medium">{coachNames || "담당 코치 미지정"}</small>
                      </span>
                      <span className={`font-bold text-right whitespace-nowrap ${tone === "full" ? "text-danger-ink" : tone === "low" ? "text-warn-ink" : "text-brand"}`}>
                        재원 {c.enrolled} / 정원 {c.capacity}
                      </span>
                    </div>
                    <div className="mt-1.5"><Meter pct={pct} tone={tone} /></div>
                  </div>
                );
              })
            )}
          </Panel>
        ) : (
          <Panel title="반별 정원 현황" hnote="6개 반">
            {CAPACITY.map((c) => (
              <div key={c.nm} className="mb-2.5 last:mb-0">
                <div className="flex items-baseline justify-between gap-2.5 text-[13px]">
                  <span className="text-ink2 font-medium">
                    {c.nm}
                    <small className="block text-[11px] text-ink3 font-medium">{c.sub}</small>
                  </span>
                  <span className={`font-bold text-right whitespace-nowrap ${c.tone === "full" ? "text-danger-ink" : c.tone === "low" ? "text-warn-ink" : "text-brand"}`}>
                    {c.label}
                  </span>
                </div>
                <div className="mt-1.5"><Meter pct={c.pct} tone={c.tone} /></div>
              </div>
            ))}
            <div className="flex gap-2 mt-3">
              <ActBtn className="flex-1" soft={!!drafted.a} onClick={() => { setDrafted((d) => ({ ...d, a: true })); toast("반 정보로 모집 초안이 생성됐어요"); }}>
                {drafted.a ? "초안 생성됨 → 편집하기" : "학부모 공지 만들기"}
              </ActBtn>
              <ActBtn className="flex-1" soft onClick={() => { setDrafted((d) => ({ ...d, b: true })); toast("반 정보로 홍보 초안이 생성됐어요"); }}>
                {drafted.b ? "초안 생성됨 → 편집하기" : "홍보 콘텐츠 만들기"}
              </ActBtn>
            </div>
            <div className="text-[11.5px] text-ink3 font-medium leading-relaxed mt-2">
              누르면 반 정보(토요일 · 7~9세 · 빈자리 7)로 <b className="text-brand font-bold">모집 초안이 자동 생성</b>돼요.
            </div>
          </Panel>
        )}
      </div>
      {overlays}
    </PCShell>
  );
}
