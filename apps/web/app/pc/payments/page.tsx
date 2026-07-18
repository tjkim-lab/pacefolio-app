"use client";

/* PC 수납 (13B — docs/13 §C)
   - 대량 청구 = "나머지 90명 자동" 금지 → AudienceFilter 그룹별
     DRAFT→REVIEWED→CONFIRMED→SENT 단계 발송 + 기발송 제외·재알림 분리
   - 휴무 = event 등록 → 계산기가 회차 재계산 (숫자 직접 수정 금지)
   - 중간입회 = 반 선택(요일·시간 자동) + 할인 → 청구 초안 저장(즉시 발송 금지)
   - 환불 = 요청 목록 + 접기/펼치기 · 계산→원장 제안→학부모 승인→원장
     최종 승인→PG→COMPLETED 순서 명시 */
import { useEffect, useRef, useState } from "react";
import { PCShell } from "../_shell";
import { Button } from "@/components/ui";
import { Panel, RL, Note, DChip, Meter, Spinner, Pill, useOverlays } from "../_ui";
import {
  CYCLE_NEXT, CALC, MJ_CLASSES, MJ_OPTS, MJ_DISCOUNTS, OFF_TYPES, OFF_SCOPES,
  BILL_GROUPS, REFUND_LIST, fmt,
} from "../_data";
import { OwnerLiveProvider, useOwnerLive } from "../_live";

const CYCLES = [
  { v: "월별", sub: "매월 1일 시작" },
  { v: "2개월 단위", sub: "격월 시작" },
  { v: "3개월 단위", sub: "현재 설정" },
  { v: "직접 설정", sub: "시작일 직접 지정" },
];
const DRAFTS = [
  { init: "지", name: "최지호 — 반 변경", sub: "플레이1 → 플레이2 승급 (연령 배정)", ftag: "+90,000", ftagTone: "warn" as const, amt: "₩450,000" },
  { init: "민", name: "박민준 — 2분기 미납 있음", sub: "미납 ₩330,000 + 다음 기간 청구 동시 발송", ftag: "미납", ftagTone: "danger" as const, amt: "₩660,000" },
  { init: "수", name: "이수아 — 다종목 할인 적용", sub: "축구+인라인 · MAX 10% 하나만", ftag: "10%↓", ftagTone: "accent" as const, amt: "₩486,000" },
];
type GroupStage = "DRAFT" | "REVIEWED" | "SENT";

export default function PCPayments() {
  return (
    <OwnerLiveProvider>
      <PCPaymentsBody />
    </OwnerLiveProvider>
  );
}

function PCPaymentsBody() {
  const { confirm, toast, overlays } = useOverlays();
  const ownerLive = useOwnerLive(); // #25: READY 시 수납 현황 = 서버 집계

  // 수납 주기
  const [cycle, setCycle] = useState("3개월 단위");
  const [cycleCur, setCycleCur] = useState("3개월 단위");
  const [cyclePanel, setCyclePanel] = useState(false);
  const [cycleSaving, setCycleSaving] = useState(false);
  const [cycleSaved, setCycleSaved] = useState(false);

  // 휴무 등록 (event → 회차 재계산)
  const [offType, setOffType] = useState(OFF_TYPES[4]);
  const [offScope, setOffScope] = useState(OFF_SCOPES[3]);
  const [offDeduct, setOffDeduct] = useState(true);
  const [offEvents, setOffEvents] = useState<string[]>([]);

  // 중간입회 계산기
  const [mjCls, setMjCls] = useState(MJ_CLASSES[0]);
  const [mj, setMj] = useState(MJ_OPTS[0]);
  const [mjDisc, setMjDisc] = useState(MJ_DISCOUNTS[0]);
  const [mjSaved, setMjSaved] = useState(false);
  /* #38 READY: 서버 견적 — 일할 = 남은회차/전체회차 × 요금(헌법 수식, DB 세션 정본) */
  const [mjClassId, setMjClassId] = useState("");
  const [mjJoin, setMjJoin] = useState("");
  const [mjFee, setMjFee] = useState(480000);
  const [mjQuote, setMjQuote] = useState<{ totalSessions: number; remainingSessions: number; amount: number; basis: string } | null>(null);
  const [mjBusy, setMjBusy] = useState(false);
  const quarterRange = () => {
    // 헌법: 분기 달력고정(3·6·9·12 시작). 오늘이 속한 분기 반환
    const today = new Date();
    const m = today.getMonth() + 1;
    const startMonth = m >= 12 ? 12 : m >= 9 ? 9 : m >= 6 ? 6 : m >= 3 ? 3 : 12;
    const y = startMonth === 12 && m < 3 ? today.getFullYear() - 1 : today.getFullYear();
    const endMonth = startMonth + 2;
    const lastDay = new Date(Date.UTC(y, endMonth, 0)).getUTCDate();
    const p = (n: number) => String(n).padStart(2, "0");
    return { start: `${y}-${p(startMonth)}-01`, end: `${y}-${p(endMonth)}-${p(lastDay)}` };
  };
  const runQuote = () => {
    if (!mjClassId || !mjJoin || mjBusy) { if (!mjClassId || !mjJoin) toast("반·첫 수업일을 선택해주세요"); return; }
    setMjBusy(true);
    const q = quarterRange();
    void ownerLive.prorationQuote(mjClassId, {
      periodStart: q.start, periodEnd: q.end, joinDate: mjJoin, baseFee: mjFee,
    }).then((r) => {
      setMjBusy(false);
      if (!r.ok || !r.quote) { toast(r.message); return; }
      setMjQuote(r.quote);
      setMjSaved(false);
    });
  };
  const mjBase = mjQuote ? mjQuote.amount : Math.round((mj.r / mjCls.total) * mjCls.fee);
  const mjAmt = Math.round((mjBase * (100 - mjDisc.pct)) / 100 / 10) * 10; // 10원 반올림 정책 고정
  /* #40: READY 저장 = 실 DRAFT 청구서(일할 TUITION + 할인 라인) — 발송은 검토에서 */
  const [mjParticipantId, setMjParticipantId] = useState("");
  const saveDraft = () => {
    if (ownerLive.state !== "READY") {
      setMjSaved(true);
      toast("청구 초안 저장(데모) — 바로 발송하지 않아요. 청구 초안에서 검토 후 확정하세요");
      return;
    }
    if (!mjQuote || !mjParticipantId || !mjJoin) { toast("원생·서버 견적이 필요해요"); return; }
    const q = quarterRange();
    const lines: { type: string; label: string; amount: number }[] = [
      { type: "TUITION", label: `수강료 일할(${mjQuote.remainingSessions}/${mjQuote.totalSessions}회)`, amount: mjQuote.amount },
    ];
    if (mjDisc.pct > 0) {
      lines.push({ type: "DISCOUNT", label: `${mjDisc.nm} −${mjDisc.pct}%`, amount: -Math.round((mjQuote.amount * mjDisc.pct) / 100) });
    }
    void ownerLive.saveDraftInvoice({
      participantId: mjParticipantId, periodStart: q.start, periodEnd: q.end,
      dueDate: mjJoin, lines,
    }).then((r) => {
      toast(r.message);
      if (r.ok) setMjSaved(true);
    });
  };

  // 부분 발송 (그룹별 단계)
  const [stages, setStages] = useState<Record<string, GroupStage>>(
    () => Object.fromEntries(BILL_GROUPS.map((g) => [g.id, "DRAFT"])),
  );
  const sentCount = BILL_GROUPS.filter((g) => stages[g.id] === "SENT").reduce((s, g) => s + g.n, 0);
  const anySent = sentCount > 0;

  // 환불 목록
  const [openRefund, setOpenRefund] = useState<string | null>("minjun");
  const [minjunStage, setMinjunStage] = useState<"대기" | "요청 중" | "접수 완료">("대기");

  // LIVE
  const [live, setLive] = useState({ read: 0, paid: 0 });
  const liveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!anySent) return;
    liveRef.current = setInterval(() => {
      setLive((s) => {
        const cap = Math.round(sentCount * 0.9);
        const payCap = Math.round(sentCount * 0.66);
        const read = s.read < cap ? s.read + Math.min(4, cap - s.read) : s.read;
        const paid = read > 5 && s.paid < payCap ? s.paid + Math.min(3, payCap - s.paid) : s.paid;
        return { read, paid };
      });
    }, 600);
    return () => { if (liveRef.current) clearInterval(liveRef.current); };
  }, [anySent, sentCount]);

  const saveCycle = () => {
    setCycleSaving(true);
    setTimeout(() => { setCycleSaving(false); setCycleSaved(true); setCycleCur(cycle); toast("다음 수납 기간부터 적용 — 확정된 청구는 그대로예요"); }, 700);
  };

  /* #38: READY = 실 휴무 event(서버 세션 취소·회차 재계산). 날짜는 READY 전용 입력 */
  const [offDate, setOffDate] = useState("");
  const [offClassId, setOffClassId] = useState<string>(""); // "" = 전체 학원
  const [offBusy, setOffBusy] = useState(false);
  const registerOff = () => {
    if (ownerLive.state === "READY") {
      if (!offDate) { toast("휴무 날짜를 선택해주세요"); return; }
      if (offBusy) return;
      setOffBusy(true);
      void (async () => {
        const r = await ownerLive.createClosure({
          scope: offClassId ? "CLASS" : "ACADEMY",
          classId: offClassId || undefined,
          dateStart: offDate, dateEnd: offDate,
          closureType: offType, reason: `${offType} 휴무`, deductSessions: offDeduct,
        });
        setOffBusy(false);
        toast(r.message);
        if (!r.ok) return;
        const scopeLabel = offClassId
          ? ownerLive.classes.find((c) => c.classId === offClassId)?.name ?? "반"
          : "전체 학원";
        setOffEvents((l) => [...l,
          `${offType} · ${scopeLabel} · ${offDate}${offDeduct ? " · 회차 차감" : " · 차감 없음"} · 세션 ${r.canceledSessions}회 취소(서버)`,
        ]);
      })();
      return;
    }
    const label = `${offType} · ${offScope} · 12/27 (토)${offDeduct ? " · 회차 차감" : " · 차감 없음"} (데모)`;
    setOffEvents((l) => [...l, label]);
    toast("휴무 등록(데모) — 계산기가 회차를 재계산해요. 확정된 청구서는 자동 변경 없음(수정 청구·차기 이월)");
  };

  /* #41: READY = 그룹(반) 정본은 서버 반 목록 · 검토=일괄 초안 · 확정=일괄 ISSUED */
  const groups: { id: string; nm: string; days?: string; time?: string; n?: number }[] =
    ownerLive.state === "READY"
      ? ownerLive.classes.map((c) => ({ id: c.classId, nm: c.name }))
      : BILL_GROUPS;
  const [grpFee, setGrpFee] = useState(160_000);
  const reviewGroup = (id: string) => {
    const g = groups.find((x) => x.id === id)!;
    if (ownerLive.state === "READY") {
      const q = quarterRange();
      void ownerLive.bulkDrafts(id, {
        periodStart: q.start, periodEnd: q.end, dueDate: q.start, baseFee: grpFee,
      }).then((r) => {
        toast(r.message);
        if (r.ok) setStages((s) => ({ ...s, [id]: "REVIEWED" }));
      });
      return;
    }
    confirm({
      title: `${g.nm} 청구 명단을 검토할까요?`,
      rows: [["대상", `${g.n}명 (${g.days} ${g.time})`], ["할인 적용", "형제·다종목 자동 반영"], ["중간 입회", "일할 초안 포함"], ["이전 미납", "동시 발송 표기"], ["제외", "이미 발송된 원생 자동 제외"]],
      label: "검토 완료 (REVIEWED)",
      onConfirm: () => { setStages((s) => ({ ...s, [id]: "REVIEWED" })); toast(`${g.nm} 검토 완료 — 확정·발송 가능`); },
    });
  };
  const sendGroup = (id: string) => {
    const g = groups.find((x) => x.id === id)!;
    if (ownerLive.state === "READY") {
      confirm({
        title: `${g.nm} 청구를 확정·발송할까요?`,
        rows: [["대상", "이 반의 검토된 초안 전부"], ["발행", "DRAFT → ISSUED (서버, 감사 기록)"], ["알림", "원생별 INVOICE_ISSUED 이벤트 등록"]],
        warn: "확정 후 금액 변경은 수정 청구로만 기록됩니다.",
        label: "확정하고 발송 (SENT)",
        onConfirm: () => {
          const q = quarterRange();
          void ownerLive.bulkIssue(id, { periodStart: q.start, periodEnd: q.end }).then((r) => {
            toast(r.message);
            if (r.ok) setStages((s) => ({ ...s, [id]: "SENT" }));
          });
        },
      });
      return;
    }
    confirm({
      title: `${g.nm} ${g.n}명에게 청구를 확정·발송할까요?`,
      rows: [["대상 원생", `${g.n}명`], ["발송 채널", "알림톡 우선 · 실패 시 SMS"], ["중복 방지", "(기간·원생·청구 버전) UNIQUE + 멱등키"], ["납부 마감", "11/28 (금)"]],
      warn: "확정 후 금액 변경은 수정 청구로만 기록됩니다. 같은 청구서 재전송은 '재알림'으로 분리돼요.",
      label: "확정하고 발송 (SENT)",
      onConfirm: () => { setStages((s) => ({ ...s, [id]: "SENT" })); toast(`${g.nm} ${g.n}명 발송 완료`); },
    });
  };

  const rate = sentCount ? Math.round((live.paid / sentCount) * 100) : 0;

  return (
    <PCShell title="수납" actions={<span className="text-[12px] text-ink3 font-medium">9월 시작 수납기간 (9/1~11/30)</span>}>
      <p className="text-[12.5px] text-ink3 font-medium -mt-1">청구는 원생별 · 결제는 보호자 계정 단위</p>

      <div className="grid grid-cols-2 gap-3 items-start">
        {/* LEFT */}
        <div className="space-y-3">
          <Panel title="학원별 수납 주기 설정" hnote="모든 청구가 여기서 계산돼요">
            <RL label="수납 주기" sub="원더짐 아카데미의 데모 설정" amount={cycleCur} tone="accent" />
            <RL label="시작 월" sub="원더짐 설정 · 원장님이 직접 변경 가능" amount="3 · 6 · 9 · 12월" />
            <RL label="현재 수납 기간" amount="3분기 · 9/1~11/30" />
            <Button variant="ghost" full className="mt-3 h-11 text-[12.5px]" onClick={() => setCyclePanel((v) => !v)} aria-expanded={cyclePanel}>
              {cyclePanel ? "설정 접기" : "수납 주기 설정 변경"}
            </Button>
            {cyclePanel && (
              <div className="mt-3 border-t border-line2 pt-3">
                <div className="flex gap-2 flex-wrap">
                  {CYCLES.map((c) => (
                    <DChip key={c.v} title={c.v} sub={c.sub} active={cycle === c.v} onClick={() => { setCycle(c.v); setCycleSaved(false); }} />
                  ))}
                </div>
                <div className="mt-2"><RL label="다음 수납 기간" sub="변경 적용 시점" amount={CYCLE_NEXT[cycle] || "—"} /></div>
                <Note inPanel>새 설정은 <b className="text-ink font-bold">다음 수납 기간부터</b> 적용돼요. 이미 확정하거나 발송한 청구서는 변경되지 않습니다.</Note>
                <Button variant="primary" full className="mt-3 h-11 text-[12.5px]" onClick={saveCycle} disabled={cycleSaving}>
                  {cycleSaving ? <><Spinner />저장 중...</> : cycleSaved ? "저장 완료 ✓" : "이 설정으로 저장"}
                </Button>
              </div>
            )}
          </Panel>

          <Panel title="반별 청구 회차 · 휴무 등록" hnote="실제 수업 캘린더 기준 · 숫자 직접 수정 금지">
            {CALC.map((c) => (
              <details key={c.nm} className="py-2 border-b border-line2 last:border-0 group">
                <summary className="flex items-center justify-between gap-2.5 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                  <span className="text-[13px] font-bold text-ink">{c.nm}<small className="text-ink3 font-medium text-[11px] ml-1.5">{c.days}요일</small></span>
                  <span className="flex items-center gap-2.5 shrink-0">
                    <span className="text-[10.5px] text-ink3 font-semibold">계산 기준 보기 ▾</span>
                    <span className="text-[12px] font-bold text-brand whitespace-nowrap">최종 {c.fin}회</span>
                  </span>
                </summary>
                <div className="mt-1">
                  <RL label="기간 내 예정 수업" sub={`수납 기간 × ${c.days}요일 실제 수업일`} amount={`${c.plan}회`} />
                  <RL label="공휴일 차감" sub={c.holNote} amount={c.hol ? `−${c.hol}회` : "0회"} />
                  <RL label="학원 휴무 차감" sub={c.offNote} amount={c.off ? `−${c.off}회` : "0회"} />
                  <RL label="추가 수업" sub={c.extraNote} amount={c.extra ? `+${c.extra}회` : "0회"} />
                  <RL label="최종 청구 회차" amount={`${c.fin}회`} total />
                </div>
              </details>
            ))}
            {/* 13B: 휴무 event 등록 — "김선재 결혼식으로 토요일 휴무 → 12회가 11회" 를 정식 기능으로 */}
            <div className="mt-2.5 border-t border-line2 pt-2.5">
              <div className="text-[11.5px] font-bold text-ink">휴무 등록 (event → 회차 자동 재계산)</div>
              <div className="mt-1.5 flex gap-1.5 flex-wrap">
                {OFF_TYPES.map((t) => (
                  <button key={t} onClick={() => setOffType(t)}
                    className={`px-2 py-1 rounded-lg text-[11px] font-semibold border ${offType === t ? "border-accent bg-accent-weak text-brand" : "border-line text-ink2"}`}>{t}</button>
                ))}
              </div>
              <div className="mt-1.5 flex gap-1.5 flex-wrap items-center">
                {ownerLive.state === "READY" ? (
                  <>
                    <button onClick={() => setOffClassId("")}
                      className={`px-2 py-1 rounded-lg text-[11px] font-semibold border ${offClassId === "" ? "border-accent bg-accent-weak text-brand" : "border-line text-ink2"}`}>전체 학원</button>
                    {ownerLive.classes.map((c) => (
                      <button key={c.classId} onClick={() => setOffClassId(c.classId)}
                        className={`px-2 py-1 rounded-lg text-[11px] font-semibold border ${offClassId === c.classId ? "border-accent bg-accent-weak text-brand" : "border-line text-ink2"}`}>{c.name}</button>
                    ))}
                    <input type="date" value={offDate} onChange={(e) => setOffDate(e.target.value)}
                      className="border border-line rounded-lg px-2 py-1 text-[11px] font-semibold text-ink bg-fill" />
                  </>
                ) : OFF_SCOPES.map((s) => (
                  <button key={s} onClick={() => setOffScope(s)}
                    className={`px-2 py-1 rounded-lg text-[11px] font-semibold border ${offScope === s ? "border-accent bg-accent-weak text-brand" : "border-line text-ink2"}`}>{s}</button>
                ))}
                <label className="flex items-center gap-1 text-[11px] font-semibold text-ink2 ml-auto">
                  <input type="checkbox" checked={offDeduct} onChange={(e) => setOffDeduct(e.target.checked)} className="w-3.5 h-3.5 accent-[#12B5A5]" />
                  회차 차감
                </label>
              </div>
              <Button variant="ghost" full className="mt-2 h-9 text-[12px]" onClick={registerOff} disabled={offBusy}>
                {ownerLive.state === "READY"
                  ? offBusy ? "서버 등록 중..." : `휴무 등록 — ${offDate || "날짜 선택"} · ${offType}`
                  : `예시 등록 — 12/27(토) ${offType} (${offScope})`}
              </Button>
              {offEvents.map((e, i) => (
                <div key={i} className="mt-1.5 text-[11px] font-semibold text-ink2 bg-fill rounded-lg px-2.5 py-1.5">
                  📅 {e} · <span className="text-brand">보강 생성·보호자 공지 선택 가능</span> · 등록자 기록
                </div>
              ))}
              <Note inPanel>휴무는 <b className="text-ink font-bold">event 로 등록</b>하고 계산기가 회차를 만들어요 — 원장이 12→11로 숫자를 직접 바꾸지 않아요. 수동 조정이 꼭 필요하면 조정 전후·이유·조정자·승인자·영향 청구서가 기록돼요.</Note>
            </div>
          </Panel>

          <Panel title="중간입회 계산기" hnote="반을 고르면 요일·시간은 자동 — 중복 입력 없음">
            <div className="text-[11px] font-bold text-ink3 mb-1">① 반 선택</div>
            <div className="flex gap-2 flex-wrap">
              {ownerLive.state === "READY"
                ? ownerLive.classes.map((c) => (
                    <DChip key={c.classId} title={c.name} sub="서버 시간표 기준" active={mjClassId === c.classId}
                      onClick={() => { setMjClassId(c.classId); setMjQuote(null); setMjSaved(false); }} />
                  ))
                : MJ_CLASSES.map((o) => (
                    <DChip key={o.nm} title={o.nm} sub={`${o.days} · ${o.total}회 / ${fmt(o.fee)}원`} active={mjCls.nm === o.nm} onClick={() => { setMjCls(o); setMjSaved(false); }} />
                  ))}
            </div>
            <div className="text-[11px] font-bold text-ink3 mb-1 mt-2.5">② 첫 수업일</div>
            {ownerLive.state === "READY" ? (
              <div className="flex gap-2 flex-wrap items-center">
                <select
                  value={mjParticipantId}
                  onChange={(e) => { setMjParticipantId(e.target.value); setMjSaved(false); }}
                  className="border border-line rounded-lg px-2 py-1.5 text-[12px] font-semibold text-ink bg-fill"
                >
                  <option value="">원생 선택</option>
                  {ownerLive.participants.map((p) => (
                    <option key={p.participantId} value={p.participantId}>{p.name} ({p.ageLabel})</option>
                  ))}
                </select>
                <input type="date" value={mjJoin} onChange={(e) => { setMjJoin(e.target.value); setMjQuote(null); }}
                  className="border border-line rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-ink bg-fill" />
                <label className="text-[11px] font-semibold text-ink3">분기료(원)</label>
                <input type="number" value={mjFee} onChange={(e) => { setMjFee(Number(e.target.value) || 0); setMjQuote(null); }}
                  className="w-[110px] border border-line rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-ink bg-fill tabular-nums" />
                <button onClick={runQuote} disabled={mjBusy}
                  className="px-3 py-1.5 rounded-lg text-[12px] font-bold bg-accent-strong text-white disabled:opacity-50">
                  {mjBusy ? "계산 중..." : "서버 견적"}
                </button>
              </div>
            ) : (
              <div className="flex gap-2 flex-wrap">
                {MJ_OPTS.map((o) => (
                  <DChip key={o.date} title={o.date} sub={o.sub} active={mj.r === o.r} onClick={() => { setMj(o); setMjSaved(false); }} />
                ))}
              </div>
            )}
            <div className="text-[11px] font-bold text-ink3 mb-1 mt-2.5">③ 할인 (MAX 하나)</div>
            <div className="flex gap-2 flex-wrap">
              {MJ_DISCOUNTS.map((d) => (
                <DChip key={d.nm} title={d.nm} sub={d.pct ? `−${d.pct}%` : "기본"} active={mjDisc.nm === d.nm} onClick={() => { setMjDisc(d); setMjSaved(false); }} />
              ))}
            </div>
            <div className="bg-fill rounded-xl px-3.5 py-3 text-[12.5px] font-bold mt-2.5 tabular-nums leading-loose">
              {ownerLive.state === "READY" && mjQuote ? (
                <div>남은 실제 수업 <b className="text-brand">{mjQuote.remainingSessions}회</b> ÷ {mjQuote.totalSessions}회 × {fmt(mjFee)}원 = {fmt(mjQuote.amount)}원
                  <small className="text-ink3 font-medium ml-1">({mjQuote.basis === "DB_SESSIONS" ? "서버 세션 정본" : "시간표+휴무 달력"})</small>
                </div>
              ) : ownerLive.state === "READY" ? (
                <div className="text-ink3 font-medium">반·첫 수업일 선택 후 <b className="text-ink">서버 견적</b>을 누르면 실제 수업 캘린더(휴무 반영) 기준으로 계산돼요.</div>
              ) : (
                <div>남은 실제 수업 <b className="text-brand">{mj.r}회</b> ÷ {mjCls.total}회 × {fmt(mjCls.fee)}원 = {fmt(mjBase)}원 <small className="text-ink3 font-medium">(데모)</small></div>
              )}
              {mjDisc.pct > 0 && <div>{mjDisc.nm} 적용 −{mjDisc.pct}%</div>}
              <div className="border-t border-line2 mt-1 pt-1">최종 청구액 <b className="text-brand text-[14px]">{fmt(mjAmt)}원</b> <small className="text-ink3 font-medium">(10원 단위 반올림 고정)</small></div>
            </div>
            <p className="text-[11.5px] text-ink3 font-medium leading-relaxed mt-2">
              공휴일·학원 휴무 제외된 <b className="text-brand">실제 수업 캘린더 기준</b> 회차예요 — 단순 날짜 차이 아님. 수동 수정 시 이유 필수.
            </p>
            <Button variant="primary" full className="mt-3" disabled={mjSaved} onClick={saveDraft}>
              {mjSaved ? "초안 저장됨 ✓ · 발송은 청구 초안에서"
                : ownerLive.state === "READY" ? `청구 초안 저장(서버 DRAFT) · ₩${fmt(mjAmt)}`
                : `청구 초안으로 저장 · ₩${fmt(mjAmt)}`}
            </Button>
          </Panel>
        </div>

        {/* RIGHT */}
        <div className="space-y-3">
          <Panel title="12월 시작 수납기간 — 대상 선택 후 청구 확정" hnote="특이 케이스 3명 먼저 검토" hnoteAccent>
            <p className="text-[11.5px] text-ink3 font-medium leading-relaxed mb-2">
              한 번에 93명 자동 발송 대신 <b className="text-brand">AudienceFilter 그룹별로 명단·금액을 검토한 뒤 부분 확정·발송</b>해요. 이미 발송된 원생은 자동 제외되고, 재전송은 &quot;재알림&quot;으로 분리돼요.
            </p>
            {DRAFTS.map((d) => (
              <div key={d.name} className="flex gap-2.5 items-center py-2.5 border-b border-line2">
                <div className={`w-[30px] h-[30px] rounded-full grid place-items-center text-[13px] font-bold shrink-0 ${d.ftagTone === "warn" ? "bg-warn-weak text-warn-ink" : d.ftagTone === "danger" ? "bg-danger-weak text-danger-ink" : "bg-fill text-ink2"}`}>{d.init}</div>
                <div className="flex-1 min-w-0"><div className="text-[13px] font-semibold text-ink">{d.name}</div><div className="text-[11px] text-ink3 font-medium">{d.sub}</div></div>
                <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded ${d.ftagTone === "warn" ? "bg-warn-weak text-warn-ink" : d.ftagTone === "danger" ? "bg-danger-weak text-danger-ink" : "bg-accent-weak text-brand"}`}>{d.ftag}</span>
                <span className="text-[13px] font-extrabold text-ink whitespace-nowrap">{d.amt}</span>
              </div>
            ))}
            {/* 그룹별 DRAFT → REVIEWED → SENT — READY 는 서버 반 정본(#41) */}
            {ownerLive.state === "READY" && (
              <div className="flex items-center gap-2 py-2 border-b border-line2 text-[12px] font-semibold text-ink3">
                기본 수강료
                <input type="number" step={10000} min={0} value={grpFee}
                  onChange={(e) => setGrpFee(Number(e.target.value) || 0)}
                  className="w-[110px] border border-line rounded-lg px-2 py-1 text-[12px] font-bold text-ink bg-fill tabular-nums" />
                원 · 할인·일할은 초안에서 원생별 조정
              </div>
            )}
            {groups.map((g) => {
              const st = stages[g.id] ?? "DRAFT";
              return (
                <div key={g.id} className="flex items-center gap-2.5 py-2.5 border-b border-line2 last:border-0">
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-bold text-ink">{g.nm} {g.days && <small className="text-ink3 font-medium">{g.days} {g.time}</small>}</div>
                    <div className="text-[11px] text-ink3 font-medium">{g.n != null ? `대상 ${g.n}명` : "대상 = 서버 배정 명단"} · {st === "DRAFT" ? "초안" : st === "REVIEWED" ? "검토 완료" : "발송 완료"}</div>
                  </div>
                  <Pill kind={st === "SENT" ? "ok" : st === "REVIEWED" ? "wait" : "gray"}>{st}</Pill>
                  {st === "DRAFT" && <Button variant="ghost" className="h-9 px-3 text-[12px] shrink-0" onClick={() => reviewGroup(g.id)}>명단 검토</Button>}
                  {st === "REVIEWED" && <Button variant="primary" className="h-9 px-3 text-[12px] shrink-0" onClick={() => sendGroup(g.id)}>확정·발송</Button>}
                  {st === "SENT" && <Button variant="ghost" className="h-9 px-3 text-[12px] shrink-0" onClick={() => toast(`${g.nm} 재알림 — 새 청구서가 아니라 알림만 다시 가요`)}>재알림</Button>}
                </div>
              );
            })}
            {anySent && (
              <div className="mt-2.5 bg-accent-weak rounded-xl px-3.5 py-2.5 text-[12px] font-semibold text-brand leading-relaxed">
                ✓ 지금까지 {sentCount}명 발송 · (기간·원생·청구 버전) UNIQUE 로 중복 발행 차단 · 마감 11/28 (금)
              </div>
            )}
          </Panel>

          {ownerLive.state === "READY" && ownerLive.summary ? (
            /* #25: 실 데이터 — 발행·수납·미납은 서버 정산이 도출(화면 토글 아님) */
            (() => {
              const s = ownerLive.summary;
              const liveRate = s.billedKrw > 0 ? Math.round((s.paidKrw / s.billedKrw) * 100) : 0;
              return (
                <Panel title={<span className="flex items-center gap-2">수납 현황 <span className="inline-flex items-center gap-1 text-[10.5px] font-extrabold text-brand"><span className="w-[7px] h-[7px] rounded-full bg-accent" />실 데이터</span></span>}>
                  <div className="flex gap-2.5">
                    {[
                      [String(s.paidCount + s.unpaidCount), "발행 청구", ""],
                      [String(s.paidCount), "수납 완료", "live"],
                      [String(s.unpaidCount), "미납 건", "hot"],
                      [`${fmt(s.unpaidKrw)}`, "미납액", "hot"],
                    ].map(([v, k, kind], i) => (
                      <div key={i} className={`flex-1 text-center rounded-xl py-3 border ${kind === "live" ? "border-accent bg-accent-weak" : kind === "hot" ? "border-danger-weak bg-danger-weak" : "border-line bg-surface"}`}>
                        <div className={`text-[19px] font-extrabold tabular-nums ${kind === "live" ? "text-brand" : kind === "hot" ? "text-danger-ink" : "text-ink"}`}>{v}</div>
                        <div className="text-[10.5px] text-ink3 font-semibold mt-0.5">{k}</div>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-2.5 mt-2.5"><Meter pct={liveRate} /><span className="text-[12px] text-ink3 font-semibold whitespace-nowrap">수납률 {liveRate}% · 수납 {fmt(s.paidKrw)} / 발행 {fmt(s.billedKrw)}</span>
                    <button
                      onClick={() => { void ownerLive.refreshSummary().then(() => toast("수납 현황 갱신")).catch(() => toast("갱신 실패 — 새로고침 해주세요")); }}
                      className="ml-auto shrink-0 rounded-lg border border-line bg-surface text-ink2 text-[11px] font-bold px-2.5 py-1.5 hover:text-ink"
                    >
                      새로고침
                    </button>
                  </div>
                </Panel>
              );
            })()
          ) : anySent && (
            <Panel title={<span className="flex items-center gap-2">수납 현황 실시간 <span className="inline-flex items-center gap-1 text-[10.5px] font-extrabold text-brand"><span className="w-[7px] h-[7px] rounded-full bg-accent animate-pulse" />LIVE</span></span>}>
              <div className="flex gap-2.5">
                {[[String(sentCount), "발송 원생", ""], [String(live.read), "열람", "live"], [String(live.paid), "결제 완료", "live"], [String(sentCount - live.paid), "미결제", "hot"]].map(([v, k, kind], i) => (
                  <div key={i} className={`flex-1 text-center rounded-xl py-3 border ${kind === "live" ? "border-accent bg-accent-weak" : kind === "hot" ? "border-danger-weak bg-danger-weak" : "border-line bg-surface"}`}>
                    <div className={`text-[19px] font-extrabold tabular-nums ${kind === "live" ? "text-brand" : kind === "hot" ? "text-danger-ink" : "text-ink"}`}>{v}</div>
                    <div className="text-[10.5px] text-ink3 font-semibold mt-0.5">{k}</div>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2.5 mt-2.5"><Meter pct={rate} /><span className="text-[12px] text-ink3 font-semibold whitespace-nowrap">수납률 {rate}%</span></div>
            </Panel>
          )}

          <Panel title="미납 리마인드 타임라인" hnote="시스템이 알아서" hnoteAccent>
            <RL label="D-3 · 마감 3일 전 알림톡" sub="미결제 원생의 보호자에게만 · 11/28 예약" amount="예약" />
            <RL label="당일 · 마감일 최종 안내" sub="12/1 (월)" amount="예약" />
            <RL label="D+3 · 문자로 전환" sub="알림톡 안 읽는 학부모 대응" amount="자동" />
            <RL label="D+7 · 원장님께 전화 리스트" sub="이때부터만 사람이 개입해요" amount="자동" />
          </Panel>

          {/* 13B: 환불 요청 목록 — 접기/펼치기 */}
          <Panel title={`환불 요청 ${REFUND_LIST.length}건`} hnote="계산 → 원장 제안 → 학부모 승인 → 원장 최종 승인 → PG" className="border-accent">
            {REFUND_LIST.map((r) => {
              const open = openRefund === r.id;
              return (
                <div key={r.id} className="border-b border-line2 last:border-0">
                  <button onClick={() => setOpenRefund(open ? null : r.id)} aria-expanded={open}
                    className="w-full flex items-center gap-2.5 py-2.5 text-left">
                    <div className={`w-[30px] h-[30px] rounded-full grid place-items-center text-[13px] font-bold shrink-0 ${r.tone === "warn" ? "bg-warn-weak text-warn-ink" : r.tone === "accent" ? "bg-accent-weak text-brand" : "bg-fill text-ink2"}`}>{r.nm[1]}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-bold text-ink">{r.nm} <small className="text-ink3 font-medium">{r.cls}</small></div>
                      <div className="text-[11px] text-ink3 font-medium">{r.stage}</div>
                    </div>
                    <span className={`text-[12px] font-bold text-ink3 transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
                  </button>
                  {open && (
                    <div className="pb-3">
                      <RL label="수강 회수" sub={`전체 ${r.detail.whole}회 중 ${r.detail.done}회 수강 · 공휴일·휴무 반영`} amount={`잔여 ${r.detail.whole - r.detail.done}회`} />
                      <RL label="수강료 반환" sub={r.detail.rule} amount={r.detail.tuition} />
                      <RL label="차량비 잔여" sub="남은 회차 비례 · 같은 일할 엔진" amount={r.detail.vehicle} />
                      <RL label="예상 환불액" amount={r.detail.total} total />
                      <div className="text-[11.5px] font-semibold text-ink2 py-1.5">{r.guardian}</div>
                      {r.id === "minjun" && (
                        <Button variant="primary" full className="mt-1.5" disabled={minjunStage !== "대기"}
                          onClick={() => confirm({
                            title: "환불을 최종 승인할까요?",
                            rows: [["원생", "박민준"], ["최종 환불액", "191,250원"], ["학부모 승인", "완료 (오전 10:20)"], ["순서", "원장 최종 승인 → PG → 웹훅 COMPLETED → 재계산"]],
                            warn: "시스템 예상액이에요 — 적용 기준과 학원 정책 확인 후 승인하세요. 승인 시점에 보호자 연결 유효성이 재검증돼요.",
                            label: "승인하고 환불 요청",
                            onConfirm: () => { setMinjunStage("요청 중"); setTimeout(() => { setMinjunStage("접수 완료"); toast("환불 접수 — 양측 확인 기록 저장 · 웹훅 COMPLETED 시 자동 재계산"); }, 1000); },
                          })}>
                          {minjunStage === "대기" ? "원장 최종 승인" : minjunStage === "요청 중" ? <><Spinner />PG 환불 요청 중...</> : "접수 완료 · 3영업일 내 입금 예정"}
                        </Button>
                      )}
                      {r.id === "ian" && (
                        <Button variant="ghost" full className="mt-1.5" onClick={() => toast("금액 제안 — 학부모 앱으로 전달돼요 (학부모 승인 → 원장 최종 승인 순서)")}>
                          이 금액으로 학부모에게 제안
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            <p className="text-[11.5px] text-ink3 font-medium leading-relaxed mt-2">
              적용 <b className="text-brand">법령·계약·등록 방식 환불 기준</b>이 바닥 — 학원은 더 후하게만 조정할 수 있어요. 승인·거절·금액은 전부 감사 기록.
            </p>
          </Panel>
        </div>
      </div>
      {overlays}
    </PCShell>
  );
}
