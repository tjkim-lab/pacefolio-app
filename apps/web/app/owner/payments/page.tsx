"use client";

import { useEffect, useRef, useState } from "react";
import { AppScroll } from "@/components/mobile/MobileShell";
import { Card, Tag, cn } from "@/components/ui";
import { IconBell, IconClock, IconCard, IconBell as IconBell2 } from "@/components/ui/icons";
import {
  useToast,
  useConfirm,
  Greeting,
  CardH4,
  RLRow,
  Meter,
  SentNote,
  Note,
  DChip,
  Spinner,
} from "../_kit";
import {
  CYCLE_OPTS,
  CYCLE_NEXT,
  BILL_CLASSES,
  BILL_FLAGS,
  MJ_TOTAL,
  MJ_FEE,
  MJ_DATES,
  REMIND_TIMELINE,
} from "../_data";

const fmt = (n: number) => Math.round(n).toLocaleString("ko-KR");

/* 미납 리마인드 타임라인 아이콘 */
function TLIcon({ kind }: { kind: "clock" | "mega" | "card" | "bell" }) {
  if (kind === "clock") return <IconClock size={17} />;
  if (kind === "card") return <IconCard size={17} />;
  if (kind === "bell") return <IconBell2 size={17} />;
  return (
    <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 11v2a1 1 0 0 0 1 1h2l9 5V5L6 10H4a1 1 0 0 0-1 1z" />
      <path d="M18 8a4 4 0 0 1 0 8" />
    </svg>
  );
}

export default function OwnerPayments() {
  const { toast, toastNode } = useToast();
  const { confirm, confirmNode } = useConfirm();

  return (
    <>
      <AppScroll>
        <Greeting
          title={<>수납 💳</>}
          sub="현재 9월 시작(9~11월) 진행 중 · 12월 시작 청구 준비"
          bell={<IconBell size={20} />}
        />
        <CycleCard toast={toast} />
        <BillClassesCard />
        <BillingSection toast={toast} confirm={confirm} />
        <MidJoinCard confirm={confirm} toast={toast} />
        <RemindTimeline />
        <RefundCard confirm={confirm} toast={toast} />
        <div className="h-2" />
      </AppScroll>
      {toastNode}
      {confirmNode}
    </>
  );
}

/* ───── ① 수납 주기 설정 ───── */
function CycleCard({ toast }: { toast: (m: string) => void }) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState("3개월 단위");
  const [draft, setDraft] = useState("3개월 단위");
  const [savedLabel, setSavedLabel] = useState("3개월 단위");
  const [name, setName] = useState("");
  const [start, setStart] = useState("2025-12-01");
  const [len, setLen] = useState("3");
  const [busy, setBusy] = useState(false);
  const [saveDone, setSaveDone] = useState(false);
  const pickDraft = (v: string) => {
    setDraft(v);
    setSaveDone(false);
  };

  const customLabel = () => {
    const s = start ? start.slice(5).replace("-", "/") : "12/1";
    return (name.trim() ? name.trim() + " · " : "") + s + " 시작 · " + len + "개월권";
  };
  const nextLabel = draft === "직접 설정" ? customLabel() : CYCLE_NEXT[draft] ?? "—";

  function toggle() {
    if (open) {
      setOpen(false);
    } else {
      setDraft(saved);
      setOpen(true);
    }
  }
  function cancel() {
    setDraft(saved);
    setOpen(false);
    toast("변경을 취소했어요 — 설정은 그대로예요");
  }
  function save() {
    if (busy) return;
    setBusy(true);
    setTimeout(() => {
      setSaved(draft);
      setSavedLabel(draft === "직접 설정" ? customLabel() : draft);
      setBusy(false);
      setSaveDone(true);
      toast("다음 수납 기간부터 적용 — 캘린더·청구 회차 재계산(데모) · 확정 청구는 그대로");
    }, 700);
  }

  return (
    <Card>
      <CardH4 note="여기서 다음 기간 회차가 계산돼요">학원별 수납 주기 설정</CardH4>
      <RLRow label="수납 주기" small="원더짐 아카데미의 데모 설정" amount={savedLabel} />
      <RLRow label="시작 월" small="3·6·9·12월 시작 · 원장 변경 가능" amount="3 · 6 · 9 · 12월" />
      <RLRow label="현재 수납 기간" amount="9월 시작 · 9/1~11/30" />
      <button
        onClick={toggle}
        aria-expanded={open}
        className="mt-3 h-11 w-full rounded-2xl bg-fill text-[13px] font-bold text-ink2"
      >
        {open ? "설정 접기" : "수납 주기 설정 변경"}
      </button>

      {open && (
        <div className="mt-3 border-t border-line2 pt-3">
          <div className="flex flex-wrap gap-2" role="group" aria-label="수납 주기 선택">
            {CYCLE_OPTS.map((o) => (
              <DChip
                key={o.cy}
                active={draft === o.cy}
                title={o.label}
                sub={o.sub}
                onClick={() => pickDraft(o.cy)}
              />
            ))}
          </div>

          {draft === "직접 설정" && (
            <div className="mt-2">
              <RLRow
                label="주기 이름"
                amount={
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="예: 상반기권"
                    className="w-40 rounded-[9px] border border-line bg-fill px-2.5 py-2 text-[13px] text-ink outline-none focus:border-accent focus:bg-surface"
                  />
                }
              />
              <RLRow
                label="시작일"
                amount={
                  <input
                    type="date"
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                    className="rounded-[9px] border border-line bg-fill px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-accent focus:bg-surface"
                  />
                }
              />
              <RLRow
                label="기간 길이"
                amount={
                  <select
                    value={len}
                    onChange={(e) => setLen(e.target.value)}
                    className="rounded-[9px] border border-line bg-fill px-2.5 py-2 text-[13px] text-ink outline-none focus:border-accent"
                  >
                    <option value="1">1개월</option>
                    <option value="2">2개월</option>
                    <option value="3">3개월</option>
                    <option value="6">6개월</option>
                  </select>
                }
              />
            </div>
          )}

          <div className="mt-1.5">
            <RLRow label="다음 수납 기간" small="변경 적용 시점 (미리보기)" amount={nextLabel} />
          </div>
          <Note icon={<Alert />}>
            새 설정은 <b className="font-bold text-ink">다음 수납 기간부터</b> 적용돼요. 저장하면 <b className="font-bold text-ink">다음 기간의 캘린더와 청구 회차가 다시 계산</b>돼요(데모: 미리보기). 이미 확정·발송한 청구서는 변경되지 않습니다.
          </Note>
          <div className="mt-3 flex gap-2">
            <button onClick={cancel} className="h-11 shrink-0 basis-24 rounded-2xl bg-fill text-[13px] font-bold text-ink2">
              취소
            </button>
            <button onClick={save} disabled={busy} className="h-11 flex-1 rounded-2xl bg-accent-strong text-[13px] font-bold text-white disabled:opacity-65">
              {busy ? <><Spinner />저장 중...</> : saveDone ? "저장 완료 ✓" : "이 설정으로 저장"}
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}

/* ───── ①-2 반별 청구 회차 ───── */
function BillClassesCard() {
  const [open, setOpen] = useState<Record<number, boolean>>({});
  return (
    <Card>
      <CardH4 note="12월 시작 기간 · 실제 수업 캘린더">반별 청구 회차</CardH4>
      {BILL_CLASSES.map((c, i) => (
        <div key={c.nm} className="border-b border-line2 py-2.5 last:border-b-0">
          <button onClick={() => setOpen((p) => ({ ...p, [i]: !p[i] }))} className="w-full text-left">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[14px] font-bold text-ink">
                {c.nm}
                <small className="ml-1.5 text-[12px] font-medium text-ink3">{c.days}요일</small>
              </span>
              <span className="text-[12.5px] font-bold tabular-nums text-accent-ink">최종 {c.fin}회</span>
            </div>
            <div className="mt-0.5 text-[11.5px] font-medium text-ink3">계산 기준 보기 {open[i] ? "▴" : "▾"}</div>
          </button>
          {open[i] && (
            <div className="mt-1">
              <RLRow label="기간 내 예정 수업" small={`수납 기간 × ${c.days}요일 실제 수업일`} amount={`${c.plan}회`} />
              <RLRow label="공휴일 차감" small={c.holNote} amount={c.hol ? `−${c.hol}회` : "0회"} />
              <RLRow label="학원 휴무 차감" small={c.offNote} amount={c.off ? `−${c.off}회` : "0회"} />
              <RLRow label="추가 수업" small={c.extraNote} amount={c.extra ? `+${c.extra}회` : "0회"} />
              <RLRow label="최종 청구 회차" amount={`${c.fin}회`} />
            </div>
          )}
        </div>
      ))}
      <Note icon={<Calc />}>
        공휴일·휴무일은 <b className="font-bold text-ink">그 반의 수업 요일과 겹칠 때만</b> 회차에서 빠져요. 예: 12/25(목) 성탄절·1/1(목) 신정은 화금반 회차에 영향이 없어요.
      </Note>
    </Card>
  );
}

/* ───── ② 청구 초안 + ③ LIVE ───── */
function BillingSection({
  toast,
  confirm,
}: {
  toast: (m: string) => void;
  confirm: (o: import("../_kit").ConfirmOpts) => void;
}) {
  const [sent, setSent] = useState(false);
  const [failResolved, setFailResolved] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [live, setLive] = useState({ read: 0, paid: 0 });
  const [payArrived, setPayArrived] = useState(false);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (tickRef.current) clearInterval(tickRef.current); }, []);

  function sendAll() {
    if (sent) return;
    confirm({
      title: "12월 시작 수납기간 청구를 확정하고 발송할까요?",
      rows: [
        ["청구 대상 원생", "93명"],
        ["보호자 알림 요청", "87명"],
        ["청구 합계", "27,900,000원"],
        ["특이 케이스 검토", "3명"],
        ["형제 합산 결제", "6건"],
        ["마감일", "11월 28일 (금)"],
      ],
      warn: "확정 후 금액 변경은 수정 청구로 기록됩니다.",
      label: "확정하고 발송",
      onConfirm: () => {
        setSent(true);
        toast("청구 93건 확정 · 알림 요청 87명 (도달 85 · 실패 2)");
        tickRef.current = setInterval(() => {
          setLive((prev) => {
            let { read, paid } = prev;
            if (read < 84) read += Math.min(7, 84 - read);
            if (read > 20 && paid < 62) paid += Math.min(5, 62 - paid);
            if (read >= 84 && paid >= 62 && tickRef.current) clearInterval(tickRef.current);
            return { read, paid };
          });
        }, 600);
      },
    });
  }

  function arrive() {
    if (payArrived) return;
    if (!sent) {
      toast("먼저 청구를 확정·발송하세요");
      return;
    }
    setPayArrived(true);
    setLive((prev) => {
      const paid = Math.min(93, prev.paid + 2);
      return { paid, read: Math.max(prev.read, paid) };
    });
    toast("학부모 합산 결제 738,000원 — 도담·서준 각각 완납 반영");
  }

  function retry() {
    if (retrying) return;
    setRetrying(true);
    setTimeout(() => {
      setFailResolved(true);
      setRetrying(false);
      toast("재시도 성공 · 87명 전원 도달");
    }, 900);
  }

  const rate = Math.round((live.paid / 93) * 100);

  return (
    <>
      {/* ② 청구 초안 */}
      <Card>
        <CardH4 note="특이 케이스 3명만 검토하세요" noteAc>
          12월 시작 수납기간 청구 초안
        </CardH4>
        <RLRow label="청구 대상 원생" small="청구는 원생별로 생성 · 내부 정산도 원생별" amount="93명" />
        <RLRow label="알림 수신 보호자" small="형제 합산 결제 6건 포함 — 결제 편의 기능" amount="87명" />
        {BILL_FLAGS.map((f) => (
          <div key={f.name} className="flex items-center gap-2.5 border-b border-line2 py-3 last:border-b-0">
            <div
              className={cn(
                "grid h-9 w-9 shrink-0 place-items-center rounded-full text-[12.5px] font-bold",
                f.gold ? "bg-warn-weak text-warn-ink" : "bg-fill text-ink2",
              )}
            >
              {f.ini}
            </div>
            <div className="min-w-0 flex-1 text-[13px] font-bold text-ink">
              {f.name}
              <small className="block text-[11.5px] font-medium text-ink3">{f.sub}</small>
            </div>
            <Tag tone={f.tagTone}>{f.tag}</Tag>
            <span className="shrink-0 text-[13px] font-extrabold tabular-nums">{f.amt}</span>
          </div>
        ))}
        <button
          onClick={sendAll}
          disabled={sent}
          className={cn(
            "mt-3 h-12 w-full rounded-2xl text-[14px] font-bold text-white",
            sent ? "bg-accent-ink" : "bg-accent-strong",
          )}
        >
          {sent ? "청구 확정 · 발송 완료 ✓" : "나머지 90명은 자동 — 청구 확정·발송"}
        </button>
        {sent && (
          <SentNote>✓ 청구 93건 확정 · 알림 발송 요청 87명 · 마감 11/28 (금)</SentNote>
        )}
        {sent &&
          (failResolved ? (
            <SentNote>✓ 재시도 완료 — 알림 요청 87명 전원 도달</SentNote>
          ) : (
            <SentNote tone="danger">
              알림 요청 87명 · 도달 85명 · 실패 2명 — 2명은 연락처 확인이 필요해요.
              <div className="mt-2 flex gap-1.5">
                <button
                  onClick={() => toast("실패 2명: 보호자 연락처 오류 — 원생 상세에서 확인하세요")}
                  className="rounded-[10px] border-[1.5px] border-line bg-surface px-3 py-2 text-[12px] font-bold text-accent-ink"
                >
                  실패 대상 보기
                </button>
                <button
                  onClick={retry}
                  disabled={retrying}
                  className="rounded-[10px] bg-accent-strong px-3 py-2 text-[12px] font-bold text-white disabled:opacity-65"
                >
                  {retrying ? <><Spinner />재시도 중...</> : "다시 시도"}
                </button>
              </div>
            </SentNote>
          ))}
      </Card>

      {/* ③ 수납 현황 실시간 */}
      {sent && (
        <Card>
          <CardH4
            note={
              <span className="inline-flex items-center gap-1.5 font-extrabold text-accent-ink">
                <span className="h-[7px] w-[7px] animate-pulse rounded-full bg-accent" />
                LIVE
              </span>
            }
          >
            수납 현황 실시간
          </CardH4>
          <div className="mt-1 flex gap-2.5">
            {[
              { v: 93, k: "청구 원생", live: false },
              { v: live.read, k: "열람", live: true },
              { v: live.paid, k: "결제 완료", live: true },
              { v: 93 - live.paid, k: "미결제 · 마감 전", live: false },
            ].map((s) => (
              <div
                key={s.k}
                className={cn(
                  "flex-1 rounded-[13px] border py-3 text-center",
                  s.live ? "border-accent bg-accent-weak" : "border-line bg-surface",
                )}
              >
                <div className={cn("text-[20px] font-extrabold tabular-nums", s.live && "text-accent-ink")}>{s.v}</div>
                <div className="mt-0.5 text-[11px] font-semibold text-ink3">{s.k}</div>
              </div>
            ))}
          </div>
          <div className="mt-2.5 flex items-center gap-2.5 text-[12px] font-semibold text-ink3">
            <div className="flex-1">
              <Meter pct={rate} />
            </div>
            <span>수납률 {rate}%</span>
          </div>
          <button
            onClick={arrive}
            disabled={payArrived}
            className={cn(
              "mt-2.5 h-11 w-full rounded-2xl text-[12.5px] font-bold text-white",
              payArrived ? "bg-accent-ink" : "bg-accent-strong",
            )}
          >
            {payArrived ? "결제 반영됨 ✓ · 도담·서준 완납" : "학부모 결제 도착 (데모) · 도담·서준 합산 738,000원"}
          </button>
          {payArrived && (
            <SentNote>
              ✓ 합산 결제 <b>738,000원</b> 도착 → <b>도담 405,000</b> · <b>서준 333,000</b>으로 원생별 청구에 자동 배분(PaymentAllocation) — 두 청구 모두 완납 처리됐어요
            </SentNote>
          )}
        </Card>
      )}
    </>
  );
}

/* ───── ④ 중간입회 계산기 ───── */
function MidJoinCard({
  confirm,
  toast,
}: {
  confirm: (o: import("../_kit").ConfirmOpts) => void;
  toast: (m: string) => void;
}) {
  const [sel, setSel] = useState(0);
  const [sent, setSent] = useState(false);
  const pick = MJ_DATES[sel];
  const amt = (pick.r / MJ_TOTAL) * MJ_FEE;

  function send() {
    if (sent) return;
    confirm({
      title: "중간입회 청구서를 발송할까요?",
      rows: [
        ["원생", "최이안"],
        ["반", "축구 화금반"],
        ["입회일", pick.d],
        ["전체 실제 수업", "24회"],
        ["남은 실제 수업", `${pick.r}회`],
        ["청구 금액", `${fmt(amt)}원`],
      ],
      warn: "공휴일·학원 휴무·반별 수업 요일이 자동 반영된 회차 기준이에요.",
      label: "청구서 발송",
      onConfirm: () => {
        setSent(true);
        toast("최이안 청구서 발송 — 보호자에게 알림 전달");
      },
    });
  }

  return (
    <Card>
      <CardH4 note="최이안 · 축구 화금반 · 현재 기간 24회 / 540,000원">중간입회 계산기 🧮</CardH4>
      <div className="flex flex-wrap gap-2" role="group" aria-label="입회일 선택">
        {MJ_DATES.map((d, i) => (
          <DChip
            key={d.d}
            active={sel === i}
            title={d.d}
            sub={`남은 실제 수업 ${d.r}회`}
            onClick={() => {
              setSel(i);
              setSent(false);
            }}
          />
        ))}
      </div>
      <div className="mt-2.5 rounded-xl bg-fill px-3.5 py-3 text-center text-[13px] font-bold leading-loose tabular-nums">
        입회일 이후 남은 <b className="text-[15px] text-accent-ink">{pick.r}회</b> ÷ 전체 24회 × 540,000원 ={" "}
        <b className="text-[15px] text-accent-ink">{fmt(amt)}원</b>
      </div>
      <div className="mt-1.5 text-[11.5px] font-medium leading-normal text-ink3">
        현재 <b className="font-bold text-accent-ink">9월 시작 기간(9/1~11/30)</b>에 중간 입회 — 공휴일·학원 휴무·반별 수업 요일이 <b className="font-bold text-accent-ink">자동 반영된 회차</b>예요. 선택한 입회일부터 실제 남은 수업일 기준으로 계산돼요.
      </div>
      <RLRow label="할인" small="형제·다종목·장기 해당 시 동일 규칙 — 신규라 해당 없음" amount="—" />
      <RLRow label="차량비" small="이용 시 같은 일할 구조 · 별도 · 할인 없음" amount="미이용" />
      <button
        onClick={send}
        disabled={sent}
        className={cn("mt-3 h-12 w-full rounded-2xl text-[14px] font-bold text-white", sent ? "bg-accent-ink" : "bg-accent-strong")}
      >
        {sent ? "발송 완료 · 결제 대기" : `청구서 발송 · ₩${fmt(amt)}`}
      </button>
    </Card>
  );
}

/* ───── ⑤ 미납 리마인드 타임라인 ───── */
function RemindTimeline() {
  return (
    <Card>
      <CardH4 note="시스템이 알아서" noteAc>
        미납 리마인드 타임라인
      </CardH4>
      {REMIND_TIMELINE.map((s) => (
        <div key={s.d} className="flex items-start gap-2.5 border-b border-line2 py-2.5 text-[12.5px] font-semibold text-ink last:border-b-0">
          <span className="w-11 shrink-0 pt-0.5 text-[10.5px] font-bold text-ink3">{s.d}</span>
          <span className="shrink-0 text-accent">
            <TLIcon kind={s.icon} />
          </span>
          <div>
            {s.t}
            <small className="mt-0.5 block text-[11px] font-medium text-ink3">{s.s}</small>
          </div>
        </div>
      ))}
    </Card>
  );
}

/* ───── ⑥ 환불 ───── */
function RefundCard({
  confirm,
  toast,
}: {
  confirm: (o: import("../_kit").ConfirmOpts) => void;
  toast: (m: string) => void;
}) {
  const [status, setStatus] = useState<"대기" | "요청 중" | "접수 완료">("대기");

  function doRefund() {
    if (status !== "대기") return;
    confirm({
      title: "환불을 최종 승인할까요?",
      rows: [
        ["원생", "박민준"],
        ["수강료 반환액", "165,000원"],
        ["차량비 반환액", "26,250원"],
        ["최종 환불액", "191,250원"],
        ["학부모 승인", "완료"],
        ["원장 승인", "대기"],
      ],
      warn: "시스템 예상액이에요 — 적용 기준과 학원 정책을 확인한 뒤 승인해 주세요.",
      label: "승인하고 환불 요청",
      onConfirm: () => {
        setStatus("요청 중");
        setTimeout(() => {
          setStatus("접수 완료");
          toast("환불 접수 완료 — 양측 확인 기록 저장");
        }, 1200);
      },
    });
  }

  return (
    <>
      <Card className="border-[1.5px] border-accent">
        <CardH4 note="상호 승인 필요">환불 1건 — 박민준 중도 퇴원</CardH4>
        <RLRow label="수강료 반환" small="시스템 예상액 · 24회 중 10회 수강 · ½ 경과 전 → ½ 반환 기준" amount="165,000" />
        <RLRow label="차량비 잔여" small="남은 회차 비례 · 같은 일할 엔진" amount="+26,250" amountClass="text-accent-ink" />
        <RLRow label="시스템 예상 환불액" small="적용 기준·학원 정책 확인 후 최종 승인해 주세요" amount="191,250원" total />
        <div className="flex items-center gap-2.5 border-b border-line2 py-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-fill text-[12.5px] font-bold text-ink2">모</div>
          <div className="min-w-0 flex-1 text-[13px] font-bold text-ink">
            민준 어머님 — 확인·서명 완료
            <small className="block text-[11.5px] font-medium text-ink3">오늘 오전 10:20 · &quot;금액 확인했습니다&quot;</small>
          </div>
          <Tag tone="accent">✓ 승인</Tag>
        </div>
        <div className="flex items-center gap-2.5 py-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-warn-weak text-[12.5px] font-bold text-warn-ink">원</div>
          <div className="min-w-0 flex-1 text-[13px] font-bold text-ink">
            원장님 — {status === "대기" ? "승인 대기" : status === "요청 중" ? "환불 요청 중" : "환불 접수"}
            <small className="block text-[11.5px] font-medium text-ink3">
              {status === "대기" ? "아래 버튼으로 최종 승인" : "양측 확인 기록 저장됨"}
            </small>
          </div>
          <Tag tone={status === "접수 완료" ? "accent" : "warn"}>
            {status === "대기" ? "대기" : status === "요청 중" ? "요청 중" : "✓ 환불 접수"}
          </Tag>
        </div>
        <button
          onClick={doRefund}
          disabled={status !== "대기"}
          className={cn("mt-3 h-12 w-full rounded-2xl text-[14px] font-bold text-white", status === "접수 완료" ? "bg-accent-ink" : "bg-accent-strong", status === "요청 중" && "opacity-80")}
        >
          {status === "대기" ? "승인하고 환불 요청" : status === "요청 중" ? <><Spinner />환불 요청 중...</> : "환불 접수 완료 · 3영업일 내 입금 예정"}
        </button>
      </Card>
      <Note icon={<Scale />}>
        <b className="font-bold text-ink">관련 법령과 학원에 적용되는 환불 기준</b>을 바탕으로 예상액을 계산해요. 실제 환불 전 <b className="font-bold text-ink">계약 내용과 적용 기준을 확인</b>해 주세요. 양측 확인 기록과 계산 근거를 남겨 오해·분쟁 가능성을 줄입니다.
      </Note>
    </>
  );
}

/* 인라인 아이콘 (공용 세트에 없는 것만) */
const Alert = () => (
  <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3 2.5 20h19z" />
    <path d="M12 10v4M12 17.2h.01" />
  </svg>
);
const Calc = () => (
  <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="5" y="3" width="14" height="18" rx="2" />
    <path d="M9 7h6M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01" />
  </svg>
);
const Scale = () => (
  <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3v18M7 21h10M6 7l-3 6a3 3 0 0 0 6 0zM18 7l-3 6a3 3 0 0 0 6 0zM6 7h12" />
  </svg>
);
