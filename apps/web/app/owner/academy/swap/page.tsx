"use client";

import { useState } from "react";
import { AppHeader, AppScroll } from "@/components/mobile/MobileShell";
import { Card, cn } from "@/components/ui";
import { IconCheck } from "@/components/ui/icons";
import { useToast, useConfirm, CardH4, RLRow, Note, CheckRow, DChip } from "../../_kit";
import { SWAP_CLASSES, SWAP_DATES, SWAP_REVOKES, SWAP_UNASSIGNED_OPTS } from "../../_data";

const STEP_TITLES: Record<number, string> = {
  1: "① 새 코치 가입 확인",
  2: "② 담당 수업 선택",
  3: "③ 교체 시점",
  4: "④ 권한 회수",
  5: "⑤ 최종 확인 · 알림 발송",
};
const OLD = "김선재";
const NEW = "이창진";

export default function SwapWizard() {
  const { toast, toastNode } = useToast();
  const { confirm, confirmNode } = useConfirm();

  const [step, setStep] = useState(1);
  const [picked, setPicked] = useState<Set<number>>(new Set([0]));
  const [dateIdx, setDateIdx] = useState(0);
  const [revokeIdx, setRevokeIdx] = useState(0);
  const [unassignedPlan, setUnassignedPlan] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const selNames = [...picked].map((i) => SWAP_CLASSES[i].cls);
  const selKids = [...picked].reduce((s, i) => s + SWAP_CLASSES[i].kids, 0);
  const unsel = SWAP_CLASSES.filter((_, i) => !picked.has(i));
  const date = SWAP_DATES[dateIdx];
  const revoke = SWAP_REVOKES[revokeIdx].v;
  const immediate = /지금 바로/.test(revoke);

  function go(n: number) {
    if (n > 2 && picked.size === 0) {
      toast("교체할 수업을 1개 이상 선택해 주세요");
      return;
    }
    setStep(n);
  }
  function toggleClass(i: number) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }
  function finalize() {
    if (done) return;
    if (unsel.length && !unassignedPlan) {
      toast("미선택 반 처리 방식을 먼저 선택해 주세요");
      return;
    }
    const rows: [string, string][] = [
      ["교체", `${OLD} → ${NEW}`],
      ["대상 수업", selNames[0] + (selNames.length > 1 ? ` 외 ${selNames.length - 1}개` : "")],
      ["대상 원생", `${selKids}명`],
      ["적용일", date.date],
      ["기존 코치 권한", revoke],
    ];
    if (unsel.length) rows.push(["미선택 반 처리", unsel.map((u) => u.cls).join(", ") + " → " + unassignedPlan]);
    if (immediate) rows.push(["작별 피드백", "즉시 회수로 요청 불가"]);
    confirm({
      title: "코치 교체를 확정할까요?",
      rows,
      warn:
        (immediate ? `즉시 회수라 ${OLD} 코치는 작별 피드백을 남길 수 없어요. ` : "") +
        `확정하면 원생 ${selKids}명의 보호자에게 알림이 발송되고 인수인계 브리핑이 생성돼요.`,
      label: "교체 확정 및 알림 발송",
      onConfirm: () => {
        setDone(true);
        toast("교체 예약 완료 — 브리핑 생성 · 보호자 알림 발송");
      },
    });
  }

  return (
    <>
      <AppHeader
        title={
          <span>
            담당 코치 교체
            <small className="block text-[11.5px] font-medium text-ink3">{OLD} → {NEW} · 5단계 확인이면 끝</small>
          </span>
        }
        back="/owner/academy"
      />
      <AppScroll>
        {/* 진행 헤더 */}
        <div className="rounded-2xl bg-accent-strong p-4 text-white">
          <div className="flex items-center justify-between">
            <h3 className="text-[16px] font-extrabold">{STEP_TITLES[step]}</h3>
            <span className="text-[12px] font-bold opacity-85">{step}/5</span>
          </div>
          <div className="mt-0.5 text-[12px] font-medium opacity-90">확인만 하세요 — 나머지는 시스템이 처리해요</div>
          <div className="mt-3 h-2 overflow-hidden rounded-md bg-white/30">
            <div className="h-full rounded-md bg-white transition-all" style={{ width: `${(step / 5) * 100}%` }} />
          </div>
        </div>

        {/* Step 1 */}
        {step === 1 && (
          <>
            <div className="flex items-center gap-2.5 rounded-[13px] border-[1.5px] border-accent bg-accent-weak px-3 py-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent text-[14px] font-extrabold text-white">이</div>
              <div className="flex-1 text-[14px] font-bold text-ink">
                이창진 — 가입 완료
                <small className="block text-[11.5px] font-medium text-ink3">카카오 로그인 · 010-****-4821 · 어제 가입</small>
              </div>
              <span className="text-[10.5px] font-extrabold text-accent-ink">✓ 확인됨</span>
            </div>
            <Note icon={<IconCheck size={20} />}>
              <b className="font-bold text-ink">새 코치 계정이 먼저</b> — 이미 가입돼 있어 바로 진행할 수 있어요.
            </Note>
            <button onClick={() => go(2)} className="h-12 w-full rounded-2xl bg-accent-strong text-[14px] font-bold text-white">
              다음 — 어떤 수업을 넘길까요
            </button>
          </>
        )}

        {/* Step 2 */}
        {step === 2 && (
          <>
            <Card>
              <CardH4 note="복수 선택">{OLD} 코치의 담당 수업</CardH4>
              {SWAP_CLASSES.map((c, i) => (
                <CheckRow
                  key={c.cls}
                  checked={picked.has(i)}
                  title={c.cls.replace(" ", " · ")}
                  sub={c.sub}
                  onClick={() => toggleClass(i)}
                />
              ))}
            </Card>
            <Note icon={<IconCheck size={20} />}>
              선택한 <b className="font-bold text-ink">{picked.size}개 반 · 재원 {selKids}명</b>이 {NEW} 코치의 수업으로 바뀌어요. 알림은 <b className="font-bold text-ink">재원생 보호자</b>에게만 가요(휴원 2명 제외).
            </Note>
            <TwoNav onBack={() => go(1)} onNext={() => go(3)} nextLabel="다음 — 언제부터" />
          </>
        )}

        {/* Step 3 */}
        {step === 3 && (
          <>
            <Card>
              <CardH4>언제부터 {NEW} 수업이 되나요?</CardH4>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="교체 적용일 선택">
                {SWAP_DATES.map((d, i) => (
                  <DChip key={d.date} active={dateIdx === i} title={d.date} sub={d.sub} onClick={() => setDateIdx(i)} />
                ))}
              </div>
            </Card>
            <Note icon={<IconCheck size={20} />}>
              <b className="font-bold text-ink">{date.prev}까지 {OLD} 코치 담당</b> · {date.date.split(" ")[0]}부터 {NEW} 코치 담당{date.early ? " (조기 교체)" : ""} — 진도·리포트는 끊기지 않아요.
            </Note>
            <TwoNav onBack={() => go(2)} onNext={() => go(4)} nextLabel="다음 — 권한 회수" />
          </>
        )}

        {/* Step 4 */}
        {step === 4 && (
          <>
            <Card>
              <CardH4 note="원장님이 정해요" noteAc>{OLD} 접근권한 회수</CardH4>
              {SWAP_REVOKES.map((r, i) => (
                <CheckRow key={r.v} radio checked={revokeIdx === i} title={r.v} sub={r.sub} onClick={() => setRevokeIdx(i)} />
              ))}
            </Card>
            <Note icon={<IconCheck size={20} />}>
              <b className="font-bold text-ink">자동 회수가 아니에요</b> — 시점은 원장님 결정. 회수 전까지 아이별 작별 피드백을 남길 수 있어요.
            </Note>
            <TwoNav onBack={() => go(3)} onNext={() => go(5)} nextLabel="다음 — 알림 발송" />
          </>
        )}

        {/* Step 5 */}
        {step === 5 && (
          <>
            <Card>
              <CardH4 note="발송 전 미리보기">학부모 알림 미리보기</CardH4>
              <div className="rounded-xl border border-line bg-fill px-3 py-3 text-[13px] font-medium leading-loose text-ink2">
                [원더짐] 담당 코치 변경 안내 — {date.date}부터 {selNames.join(", ")} 수업은 {NEW} 코치님이 맡게 됩니다. 그동안의 수업 기록과 아이별 노하우는 그대로 이어져요 😊
              </div>
            </Card>
            <Card>
              <CardH4>교체 최종 확인</CardH4>
              <RLRow label="기존 코치" amount={OLD} />
              <RLRow label="신규 코치" amount={NEW} />
              <RLRow label="대상 수업" amount={selNames[0] + (selNames.length > 1 ? ` 외 ${selNames.length - 1}개` : "")} />
              <RLRow label="대상 원생" amount={`${selKids}명`} />
              <RLRow label="적용일" amount={date.date} />
              <RLRow label="기존 코치 권한" small="직원 권한 시스템과 연결" amount={revoke} />
              <RLRow label="학부모 알림" amount={`원생 ${selKids}명의 보호자에게 발송`} />
              <RLRow label="인수인계 브리핑" amount="자동 생성" />
            </Card>
            <Card>
              <CardH4>발송과 동시에 자동 처리</CardH4>
              <AutoLine>
                원생 {selKids}명의 보호자에게 변경 알림
                <small className="block text-[11.5px] font-medium text-ink3">금액 정보는 안 실려요</small>
              </AutoLine>
              <AutoLine>
                {NEW}에게 인수인계 브리핑 자동 생성
                <small className="block text-[11.5px] font-medium text-ink3">진도 · 아이별 기록 · 운영 메모</small>
              </AutoLine>
              <AutoLine dim={immediate}>
                {immediate ? (
                  <>
                    작별 피드백 요청 불가 — 즉시 회수
                    <small className="block text-[11.5px] font-medium text-ink3">권한이 바로 끊겨 미작성분은 브리핑에서 제외돼요</small>
                  </>
                ) : (
                  <>
                    {OLD}에게 작별 피드백 요청
                    <small className="block text-[11.5px] font-medium text-ink3">노하우는 학원에 남아요</small>
                  </>
                )}
              </AutoLine>
            </Card>

            {/* 미선택 반 처리 */}
            {unsel.length > 0 && (
              <Card>
                <CardH4 note="확정 전 필수" noteAc>미선택 반 처리</CardH4>
                <div className="mb-2 text-[12.5px] font-semibold leading-normal text-ink2">
                  {unsel.map((u) => u.cls).join(", ")} 은(는) 이번 교체에서 제외됐어요. 담당 공백이 생기지 않게 처리를 정해주세요.
                </div>
                <div className="flex flex-wrap gap-2">
                  {SWAP_UNASSIGNED_OPTS.map((opt) => (
                    <DChip key={opt} active={unassignedPlan === opt} title={opt} onClick={() => setUnassignedPlan(opt)} />
                  ))}
                </div>
              </Card>
            )}

            <button
              onClick={finalize}
              disabled={done}
              className={cn("h-12 w-full rounded-2xl text-[14px] font-bold text-white", done ? "bg-accent-ink" : "bg-accent-strong")}
            >
              {done ? `교체 예약 완료 · 적용일 ${date.date}` : "교체 확정 및 알림 발송"}
            </button>
            <button onClick={() => go(4)} className="h-11 w-full rounded-2xl bg-fill text-[13px] font-bold text-ink2">
              뒤로
            </button>
          </>
        )}
        <div className="h-2" />
      </AppScroll>
      {toastNode}
      {confirmNode}
    </>
  );
}

function TwoNav({ onBack, onNext, nextLabel }: { onBack: () => void; onNext: () => void; nextLabel: string }) {
  return (
    <div className="flex gap-2">
      <button onClick={onBack} className="h-12 shrink-0 basis-24 rounded-2xl bg-fill text-[14px] font-bold text-ink2">뒤로</button>
      <button onClick={onNext} className="h-12 flex-1 rounded-2xl bg-accent-strong text-[14px] font-bold text-white">{nextLabel}</button>
    </div>
  );
}

function AutoLine({ children, dim }: { children: React.ReactNode; dim?: boolean }) {
  return (
    <div className={cn("flex items-start gap-2.5 border-b border-line2 py-3 text-[13px] font-semibold text-ink last:border-b-0", dim && "opacity-55")}>
      <span className="mt-0.5 grid h-[22px] w-[22px] shrink-0 place-items-center rounded-md bg-accent text-white">
        <IconCheck size={14} className="stroke-[2.6]" />
      </span>
      <div>{children}</div>
    </div>
  );
}
