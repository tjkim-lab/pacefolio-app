"use client";

import { useEffect, useRef, useState } from "react";
import { PCShell } from "../_shell";
import { Button } from "@/components/ui";
import { Panel, RL, Note, DChip, Meter, Spinner, useOverlays } from "../_ui";
import { CYCLE_NEXT, CALC, MJ_OPTS, MJ_TOTAL, MJ_FEE, fmt } from "../_data";

const CYCLES = [
  { v: "월별", sub: "매월 1일 시작" },
  { v: "2개월 단위", sub: "격월 시작" },
  { v: "3개월 단위", sub: "현재 설정" },
  { v: "직접 설정", sub: "시작일 직접 지정" },
];
const DRAFTS = [
  { init: "지", tone: "warn" as const, name: "최지호 — 반 변경", sub: "플레이1 → 플레이2 승급 (연령 배정)", ftag: "+90,000", ftagTone: "warn" as const, amt: "₩450,000" },
  { init: "민", tone: "danger" as const, name: "박민준 — 2분기 미납 있음", sub: "미납 ₩330,000 + 3분기 청구 동시 발송", ftag: "미납", ftagTone: "danger" as const, amt: "₩660,000" },
  { init: "수", tone: "muted" as const, name: "이수아 — 다종목 할인 적용", sub: "축구+인라인 · MAX 10% 하나만", ftag: "10%↓", ftagTone: "accent" as const, amt: "₩486,000" },
];

export default function PCPayments() {
  const { confirm, toast, overlays } = useOverlays();

  // 수납 주기
  const [cycle, setCycle] = useState("3개월 단위");
  const [cycleCur, setCycleCur] = useState("3개월 단위");
  const [cyclePanel, setCyclePanel] = useState(false);
  const [cycleSaving, setCycleSaving] = useState(false);
  const [cycleSaved, setCycleSaved] = useState(false);

  // 중간입회
  const [mj, setMj] = useState(MJ_OPTS[0]);
  const [mjSent, setMjSent] = useState(false);
  const mjAmt = Math.round((mj.r / MJ_TOTAL) * MJ_FEE);

  // 청구 확정 + LIVE
  const [billSent, setBillSent] = useState(false);
  const [failResolved, setFailResolved] = useState(false);
  const [failRetrying, setFailRetrying] = useState(false);
  const [live, setLive] = useState({ read: 0, paid: 0 });

  // 환불
  const [refund, setRefund] = useState<"대기" | "요청 중" | "접수 완료">("대기");

  const liveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!billSent) return;
    liveRef.current = setInterval(() => {
      setLive((s) => {
        const read = s.read < 84 ? s.read + Math.min(7, 84 - s.read) : s.read;
        const paid = read > 20 && s.paid < 62 ? s.paid + Math.min(5, 62 - s.paid) : s.paid;
        if (read >= 84 && paid >= 62 && liveRef.current) clearInterval(liveRef.current);
        return { read, paid };
      });
    }, 600);
    return () => { if (liveRef.current) clearInterval(liveRef.current); };
  }, [billSent]);

  const saveCycle = () => {
    setCycleSaving(true);
    setTimeout(() => { setCycleSaving(false); setCycleSaved(true); setCycleCur(cycle); toast("다음 수납 기간부터 적용 — 확정된 청구는 그대로예요"); }, 700);
  };

  const sendBill = () => confirm({
    title: "12월 시작 수납기간 청구를 확정·발송할까요?",
    rows: [["수업기간", "2025-12-01 ~ 2026-02-28"], ["청구 대상 원생", "93명"], ["청구서", "93건"], ["알림 수신 보호자", "87명 (가족 합산 6건 포함)"], ["청구 합계", "24,180,000원"], ["특이 케이스 검토", "3명"], ["납부 마감", "2025-11-28 (금)"]],
    warn: "확정 후 금액 변경은 수정 청구로 기록됩니다.",
    label: "확정하고 발송",
    onConfirm: () => { setBillSent(true); toast("원생 93명 청구 확정 · 보호자 87명 알림 발송"); },
  });

  const rate = Math.round((live.paid / 93) * 100);
  const liveDone = live.read >= 84 && live.paid >= 62;

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

          <Panel title="반별 청구 회차" hnote="실제 수업 캘린더 기준 · 행을 누르면 계산 기준">
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
            <Note inPanel>공휴일·휴무일은 <b className="text-ink font-bold">그 반의 수업 요일과 겹칠 때만</b> 회차에서 빠져요. 예: 10/9(목) 공휴일은 화금반 회차에 영향 없음.</Note>
          </Panel>

          <Panel title="중간입회 계산기" hnote="최이안 · 축구 화금반 · 24회 / 540,000원">
            <div className="flex gap-2 flex-wrap">
              {MJ_OPTS.map((o) => (
                <DChip key={o.date} title={o.date} sub={o.sub} active={mj.r === o.r} onClick={() => { setMj(o); setMjSent(false); }} />
              ))}
            </div>
            <div className="bg-fill rounded-xl px-3.5 py-3 text-[12.5px] font-bold text-center mt-2.5 tabular-nums leading-loose">
              입회일 이후 남은 <b className="text-brand text-[14px]">{mj.r}회</b> ÷ 전체 24회 × 540,000원 = <b className="text-brand text-[14px]">{fmt(mjAmt)}원</b>
            </div>
            <p className="text-[11.5px] text-ink3 font-medium leading-relaxed mt-2">
              현재 <b className="text-brand">9~11월 기간</b> 기준 · 공휴일·학원 휴무·반별 수업 요일이 <b className="text-brand">자동 반영된 회차</b>예요.
            </p>
            <Button variant="primary" full className="mt-3" disabled={mjSent}
              onClick={() => confirm({
                title: "중간입회 청구서를 발송할까요?",
                rows: [["원생", "최이안"], ["반", "축구 화금반"], ["입회일", mj.date], ["전체 실제 수업", "24회"], ["남은 실제 수업", `${mj.r}회`], ["청구 금액", `${fmt(mjAmt)}원`]],
                warn: "공휴일·학원 휴무·반별 수업 요일이 자동 반영된 회차 기준이에요.",
                label: "청구서 발송",
                onConfirm: () => { setMjSent(true); toast("최이안 청구서 발송 — 보호자에게 알림 전달"); },
              })}>
              {mjSent ? "발송 완료 · 결제 대기" : <>청구서 발송 · ₩{fmt(mjAmt)}</>}
            </Button>
          </Panel>
        </div>

        {/* RIGHT */}
        <div className="space-y-3">
          <Panel title="12월 시작 수납기간 청구 초안" hnote="특이 케이스 3명만 검토하세요" hnoteAccent>
            <p className="text-[11.5px] text-ink3 font-medium leading-relaxed mb-2">
              현재 <b className="text-brand">9~11월 기간은 진행 중</b> · 이번 초안은 <b className="text-brand">다음 12/1~2/28 기간</b> 청구예요. 중간입회 계산기만 현재 9~11월 기준으로 별도예요.
            </p>
            <RL label="청구 대상 원생" sub="청구는 원생별로 생성 · 내부 정산도 원생별" amount="93명" />
            <RL label="알림 수신 보호자" sub="형제 합산 결제 6건 포함 — 결제 편의 기능" amount="87명" />
            {DRAFTS.map((d) => (
              <div key={d.name} className="flex gap-2.5 items-center py-2.5 border-b border-line2">
                <div className={`w-[30px] h-[30px] rounded-full grid place-items-center text-[13px] font-bold shrink-0 ${d.tone === "warn" ? "bg-warn-weak text-warn-ink" : d.tone === "danger" ? "bg-danger-weak text-danger-ink" : "bg-fill text-ink2"}`}>{d.init}</div>
                <div className="flex-1 min-w-0"><div className="text-[13px] font-semibold text-ink">{d.name}</div><div className="text-[11px] text-ink3 font-medium">{d.sub}</div></div>
                <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded ${d.ftagTone === "warn" ? "bg-warn-weak text-warn-ink" : d.ftagTone === "danger" ? "bg-danger-weak text-danger-ink" : "bg-accent-weak text-brand"}`}>{d.ftag}</span>
                <span className="text-[13px] font-extrabold text-ink whitespace-nowrap">{d.amt}</span>
              </div>
            ))}
            <Button variant="primary" full className="mt-3" disabled={billSent} onClick={sendBill}>
              {billSent ? "청구 확정 · 발송 완료 ✓" : "나머지 90명은 자동 — 청구 확정·발송"}
            </Button>
            {billSent && (
              <>
                <div className="mt-2.5 bg-accent-weak rounded-xl px-3.5 py-2.5 text-[12px] font-semibold text-brand leading-relaxed">
                  ✓ 청구 대상 원생 93명 확정 · 보호자 87명에게 알림 발송 · 마감 11/28 (금) · 12월 시작 기간
                </div>
                {failResolved ? (
                  <div className="mt-2.5 bg-accent-weak rounded-xl px-3.5 py-2.5 text-[12px] font-semibold text-brand">✓ 재시도 완료 — 보호자 87명 전원 발송</div>
                ) : (
                  <div className="mt-2.5 bg-danger-weak rounded-xl px-3.5 py-2.5 text-[12px] font-semibold text-danger-ink leading-relaxed">
                    보호자 87명 중 85명 발송 완료 — 2명은 연락처 확인이 필요해요.
                    <div className="mt-2 flex gap-1.5">
                      <button className="h-9 px-3.5 rounded-lg text-[12px] font-bold bg-surface border border-line text-brand" onClick={() => toast("실패 2명: 보호자 연락처 오류 — 원생 상세에서 확인하세요")}>실패 대상 보기</button>
                      <button className="h-9 px-3.5 rounded-lg text-[12px] font-bold bg-accent-strong text-white disabled:opacity-60" disabled={failRetrying}
                        onClick={() => { setFailRetrying(true); setTimeout(() => { setFailResolved(true); toast("재시도 성공 · 87명 전원 발송 완료"); }, 900); }}>
                        {failRetrying ? <><Spinner />재시도 중...</> : "다시 시도"}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </Panel>

          {billSent && (
            <Panel title={<span className="flex items-center gap-2">수납 현황 실시간 <span className="inline-flex items-center gap-1 text-[10.5px] font-extrabold text-brand"><span className="w-[7px] h-[7px] rounded-full bg-accent animate-pulse" />LIVE</span></span>}>
              <div className="flex gap-2.5">
                {[["93", "청구 원생", ""], [String(live.read), "열람", "live"], [String(live.paid), "결제 완료", "live"], [String(93 - live.paid), "미결제", "hot"]].map(([v, k, kind], i) => (
                  <div key={i} className={`flex-1 text-center rounded-xl py-3 border ${kind === "live" ? "border-accent bg-accent-weak" : kind === "hot" ? "border-danger-weak bg-danger-weak" : "border-line bg-surface"}`}>
                    <div className={`text-[19px] font-extrabold tabular-nums ${kind === "live" ? "text-brand" : kind === "hot" ? "text-danger-ink" : "text-ink"}`}>{v}</div>
                    <div className="text-[10.5px] text-ink3 font-semibold mt-0.5">{k}</div>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2.5 mt-2.5"><Meter pct={rate} /><span className="text-[12px] text-ink3 font-semibold whitespace-nowrap">수납률 {rate}%</span></div>
              {liveDone && <p className="text-[11px] text-ink3 font-semibold mt-2">미결제 = 청구 93 − 결제 완료 · 그중 <b className="text-danger-ink">기한 초과 5명</b> · 나머지는 마감 전</p>}
            </Panel>
          )}

          <Panel title="미납 리마인드 타임라인" hnote="시스템이 알아서" hnoteAccent>
            <RL label="D-3 · 마감 3일 전 알림톡" sub="미결제 원생의 보호자에게만 · 11/28 예약" amount="예약" />
            <RL label="당일 · 마감일 최종 안내" sub="12/1 (월)" amount="예약" />
            <RL label="D+3 · 문자로 전환" sub="알림톡 안 읽는 학부모 대응" amount="자동" />
            <RL label="D+7 · 원장님께 전화 리스트" sub="이때부터만 사람이 개입해요" amount="자동" />
          </Panel>

          <Panel title="환불 1건 — 박민준 중도 퇴원" hnote="상호 승인 필요" className="border-accent">
            <RL label="수강료 반환" sub="시스템 예상액 · 24회 중 10회 수강 · ½ 경과 전 → ½ 반환 기준" amount="165,000" />
            <RL label="차량비 잔여" sub="남은 회차 비례 · 같은 일할 엔진" amount="+26,250" disc />
            <RL label="시스템 예상 환불액" sub="적용 기준·학원 정책 확인 후 최종 승인" amount="191,250원" total />
            <div className="flex gap-2.5 items-center py-2.5 border-b border-line2">
              <div className="w-[30px] h-[30px] rounded-full bg-fill grid place-items-center text-[13px] font-bold shrink-0">모</div>
              <div className="flex-1 min-w-0"><div className="text-[13px] font-semibold text-ink">민준 어머님 — 확인·서명 완료</div><div className="text-[11px] text-ink3 font-medium">오늘 오전 10:20 · “금액 확인했습니다”</div></div>
              <span className="text-[10.5px] font-bold px-2 py-0.5 rounded bg-accent-weak text-brand">✓ 승인</span>
            </div>
            <div className="flex gap-2.5 items-center py-2.5">
              <div className="w-[30px] h-[30px] rounded-full bg-warn-weak text-warn-ink grid place-items-center text-[13px] font-bold shrink-0">원</div>
              <div className="flex-1 min-w-0"><div className="text-[13px] font-semibold text-ink">원장님 — {refund === "대기" ? "승인 대기" : refund}</div><div className="text-[11px] text-ink3 font-medium">아래 버튼으로 최종 승인</div></div>
              <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded ${refund === "접수 완료" ? "bg-accent-weak text-brand" : "bg-warn-weak text-warn-ink"}`}>{refund === "대기" ? "대기" : refund === "요청 중" ? "요청 중" : "✓ 환불 접수"}</span>
            </div>
            <Button variant="primary" full className="mt-3" disabled={refund !== "대기"}
              onClick={() => confirm({
                title: "환불을 최종 승인할까요?",
                rows: [["원생", "박민준"], ["수강료 반환액", "165,000원"], ["차량비 반환액", "26,250원"], ["최종 환불액", "191,250원"], ["학부모 승인", "완료"], ["원장 승인", "대기"]],
                warn: "시스템 예상액이에요 — 적용 기준과 학원 정책을 확인한 뒤 승인해 주세요.",
                label: "승인하고 환불 요청",
                onConfirm: () => { setRefund("요청 중"); setTimeout(() => { setRefund("접수 완료"); toast("환불 접수 완료 — 양측 확인 기록 저장"); }, 1000); },
              })}>
              {refund === "대기" ? "승인하고 환불 요청" : refund === "요청 중" ? <><Spinner />환불 요청 중...</> : "환불 접수 완료 · 3영업일 내 입금 예정"}
            </Button>
            <p className="text-[11.5px] text-ink3 font-medium leading-relaxed mt-2">
              적용 <b className="text-brand">법령·계약·등록 방식에 따른 환불 기준</b>을 바탕으로 예상액을 계산해요 — 학원은 더 후하게만 조정할 수 있어요.
            </p>
          </Panel>
        </div>
      </div>
      {overlays}
    </PCShell>
  );
}
