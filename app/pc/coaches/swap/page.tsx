"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PCShell } from "../../_shell";
import { Panel, RL, Note, DChip, CheckMark, useOverlays } from "../../_ui";
import { Button } from "@/components/ui";
import { IconArrowLeft, IconCheck } from "@/components/ui/icons";
import { SWAP_CLASSES, SWAP_DATES, SWAP_REVOKE } from "../../_data";

const WT = ["", "① 새 코치 가입 확인", "② 담당 수업 선택", "③ 교체 시점", "④ 권한 회수", "⑤ 최종 확인 · 알림 발송"];

export default function CoachSwap() {
  const router = useRouter();
  const { confirm, toast, overlays } = useOverlays();
  const [step, setStep] = useState(1);
  const [picked, setPicked] = useState<Set<number>>(new Set(SWAP_CLASSES.map((c, i) => (c.def ? i : -1)).filter((i) => i >= 0)));
  const [date, setDate] = useState(SWAP_DATES[0].date);
  const [revoke, setRevoke] = useState(SWAP_REVOKE[0].v);
  const [unassignedPlan, setUnassignedPlan] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const pickedList = SWAP_CLASSES.filter((_, i) => picked.has(i));
  const kids = pickedList.reduce((s, c) => s + c.kids, 0);
  const unpicked = SWAP_CLASSES.filter((_, i) => !picked.has(i)).map((c) => c.cls);
  const immediate = /지금 바로/.test(revoke);

  function goto(n: number) {
    if (n > 2 && picked.size === 0) { toast("교체할 수업을 1개 이상 선택해 주세요"); return; }
    setStep(n);
  }
  function togglePick(i: number) {
    setPicked((prev) => { const s = new Set(prev); if (s.has(i)) s.delete(i); else s.add(i); return s; });
  }
  function finalize() {
    if (unpicked.length && !unassignedPlan) { toast(`넘기지 않은 반(${unpicked.join(", ")})의 처리를 먼저 정해주세요`); return; }
    const rows: [string, string][] = [
      ["교체", "김선재 → 이창진"],
      ["대상 수업", pickedList[0].cls + (pickedList.length > 1 ? ` 외 ${pickedList.length - 1}개` : "")],
      ["대상 원생", `${kids}명`],
      ["적용일", date],
      ["기존 코치 권한", revoke],
    ];
    if (unpicked.length) rows.push(["넘기지 않은 반", unpicked.join(", ") + " → " + unassignedPlan]);
    confirm({
      title: "코치 교체를 확정할까요?",
      rows,
      warn: `확정하면 원생 ${kids}명의 보호자에게 알림이 발송되고 인수인계 브리핑이 생성돼요.`,
      label: "교체 확정 및 알림 발송",
      onConfirm: () => { setDone(true); toast("교체 예약 완료 — 브리핑 생성 · 보호자 알림 발송"); },
    });
  }

  return (
    <PCShell
      title={
        <span className="flex items-center gap-3">
          <button onClick={() => router.push("/pc/coaches")} className="inline-flex items-center gap-1.5 border border-line bg-surface text-[12.5px] font-bold px-3 py-1.5 rounded-lg text-ink2 hover:bg-fill">
            <IconArrowLeft size={14} /> 강사
          </button>
          담당 코치 교체
        </span>
      }
      actions={<span className="text-[12px] text-ink3 font-medium">김선재 → 이창진 · 5단계 확인이면 끝</span>}
    >
      <div className="max-w-[560px] space-y-3">
        {/* 진행 헤더 */}
        <div className="rounded-2xl bg-accent-strong text-white p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-[15.5px] font-extrabold">{WT[step]}</h3>
            <span className="text-[12px] font-bold text-white/85">{step}/5</span>
          </div>
          <div className="text-[12px] text-white/90 font-medium mt-0.5">확인만 하세요 — 나머지는 시스템이 처리해요</div>
          <div className="h-2 rounded-full bg-white/25 mt-3 overflow-hidden">
            <div className="h-full bg-white rounded-full transition-all" style={{ width: `${(step / 5) * 100}%` }} />
          </div>
        </div>

        {/* STEP 1 */}
        {step === 1 && (
          <>
            <div className="flex gap-3 items-center rounded-xl border-[1.5px] border-accent bg-accent-weak px-3.5 py-3">
              <span className="w-[22px] h-[22px] rounded-md grid place-items-center bg-accent text-white shrink-0"><CheckMark size={13} /></span>
              <div className="flex-1 text-[13px] font-bold text-ink">이창진 — 가입 완료<small className="block text-[11px] text-ink3 font-medium">카카오 로그인 · 010-****-4821 · 어제 가입</small></div>
            </div>
            <Note icon={<IconCheck size={16} />}><b className="text-ink font-bold">새 코치 계정이 먼저</b> — 이미 가입돼 있어 바로 진행할 수 있어요.</Note>
            <Button variant="primary" full onClick={() => goto(2)}>다음 — 어떤 수업을 넘길까요</Button>
          </>
        )}

        {/* STEP 2 */}
        {step === 2 && (
          <>
            <Panel title="김선재 코치의 담당 수업" hnote="복수 선택 · 최소 1개">
              {SWAP_CLASSES.map((c, i) => {
                const on = picked.has(i);
                return (
                  <button key={c.cls} onClick={() => togglePick(i)} className={`w-full flex gap-3 items-center rounded-xl border-[1.5px] px-3.5 py-3 mt-2 first:mt-0 text-left transition ${on ? "border-accent bg-accent-weak" : "border-line bg-surface hover:bg-fill"}`}>
                    <span className={`w-[22px] h-[22px] rounded-md grid place-items-center shrink-0 ${on ? "bg-accent text-white" : "border-2 border-line2"}`}>{on && <CheckMark size={13} />}</span>
                    <span className="flex-1 text-[13px] font-bold text-ink">{c.cls}<small className="block text-[11px] text-ink3 font-medium">{c.sub}</small></span>
                  </button>
                );
              })}
            </Panel>
            <Note icon={<IconCheck size={16} />}>선택한 <b className="text-ink font-bold">{pickedList.length}개 반 · {kids}명</b>이 이창진 코치의 수업으로 바뀌어요.</Note>
            <div className="flex gap-2">
              <Button variant="ghost" className="flex-[0_0_100px]" onClick={() => goto(1)}>뒤로</Button>
              <Button variant="primary" full onClick={() => goto(3)}>다음 — 언제부터</Button>
            </div>
          </>
        )}

        {/* STEP 3 */}
        {step === 3 && (
          <>
            <Panel title="언제부터 이창진 수업이 되나요?">
              <div className="flex gap-2 flex-wrap">
                {SWAP_DATES.map((d) => (
                  <DChip key={d.date} active={date === d.date} title={d.date} sub={d.sub} onClick={() => setDate(d.date)} />
                ))}
              </div>
            </Panel>
            <Note icon={<IconCheck size={16} />}>적용일 전까지는 <b className="text-ink font-bold">김선재 수업</b>으로 기록돼요. 진도·리포트는 끊기지 않아요.</Note>
            <div className="flex gap-2">
              <Button variant="ghost" className="flex-[0_0_100px]" onClick={() => goto(2)}>뒤로</Button>
              <Button variant="primary" full onClick={() => goto(4)}>다음 — 권한 회수</Button>
            </div>
          </>
        )}

        {/* STEP 4 */}
        {step === 4 && (
          <>
            <Panel title="김선재 접근권한 회수" hnote="원장님이 정해요" hnoteAccent>
              {SWAP_REVOKE.map((r) => {
                const on = revoke === r.v;
                return (
                  <button key={r.v} onClick={() => setRevoke(r.v)} className={`w-full flex gap-3 items-center rounded-xl border-[1.5px] px-3.5 py-3 mt-2 first:mt-0 text-left transition ${on ? "border-accent bg-accent-weak" : "border-line bg-surface hover:bg-fill"}`}>
                    <span className={`w-[22px] h-[22px] rounded-full grid place-items-center shrink-0 ${on ? "bg-accent text-white" : "border-2 border-line2"}`}>{on && <CheckMark size={13} />}</span>
                    <span className="flex-1 text-[13px] font-bold text-ink">{r.v}<small className="block text-[11px] text-ink3 font-medium">{r.sub}</small></span>
                  </button>
                );
              })}
            </Panel>
            <Note icon={<IconCheck size={16} />}><b className="text-ink font-bold">자동 회수가 아니에요</b> — 시점은 원장님 결정. 직원 권한 시스템과 연결돼 있어요.</Note>
            <div className="flex gap-2">
              <Button variant="ghost" className="flex-[0_0_100px]" onClick={() => goto(3)}>뒤로</Button>
              <Button variant="primary" full onClick={() => goto(5)}>다음 — 최종 확인</Button>
            </div>
          </>
        )}

        {/* STEP 5 */}
        {step === 5 && (
          <>
            <Panel title="학부모 알림 미리보기" hnote="발송 전 수정 가능">
              <div className="bg-fill border border-line rounded-xl px-3.5 py-3 text-[12.5px] text-ink2 font-medium leading-relaxed">
                [원더짐] 담당 코치 변경 안내 — {date}부터 {pickedList.map((c) => c.cls).join(", ")} 수업은 이창진 코치님이 맡게 됩니다. 그동안의 수업 기록과 아이별 노하우는 그대로 이어져요 😊
              </div>
            </Panel>
            <Panel title="교체 최종 확인">
              <RL label="기존 코치" amount="김선재" />
              <RL label="신규 코치" amount="이창진" />
              <RL label="대상 수업" amount={pickedList[0]?.cls + (pickedList.length > 1 ? ` 외 ${pickedList.length - 1}개` : "")} />
              <RL label="대상 원생" amount={`${kids}명`} />
              <RL label="적용일" amount={date} />
              <RL label="기존 코치 권한" sub="직원 권한 시스템과 연결" amount={revoke} />
              <RL label="학부모 알림" amount={`원생 ${kids}명의 보호자에게 발송`} />
              <RL label="인수인계 브리핑" amount="자동 생성" />
            </Panel>
            <Panel title="발송과 동시에 자동 처리">
              {[
                { t: `원생 ${kids}명의 보호자에게 변경 알림`, s: "금액 정보는 안 실려요" },
                { t: "이창진에게 인수인계 브리핑 자동 생성", s: "진도 · 아이별 기록 · 운영 메모" },
                { t: "김선재에게 작별 피드백 요청", s: immediate ? "⚠ 즉시 회수 — 작별 피드백을 남길 수 없어요 · 미작성분은 브리핑에서 제외" : "노하우는 학원에 남아요", dim: immediate },
              ].map((r, i) => (
                <div key={i} className={`flex gap-2.5 items-start py-2.5 border-b border-line2 last:border-0 ${r.dim ? "opacity-50" : ""}`}>
                  <span className="w-[21px] h-[21px] rounded-md bg-accent-strong text-white grid place-items-center shrink-0 mt-0.5"><CheckMark size={13} /></span>
                  <div className="text-[12.5px] font-semibold text-ink">{r.t}<small className="block text-[11px] text-ink3 font-medium">{r.s}</small></div>
                </div>
              ))}
            </Panel>
            {unpicked.length > 0 && (
              <Panel title="넘기지 않은 반 처리 필요">
                <div className="text-[12px] font-semibold text-warn-ink mb-2">⚠ {unpicked.join(", ")} — 이 반의 담당을 정해야 확정할 수 있어요</div>
                <div className="flex gap-2 flex-wrap">
                  {["다른 코치 배정", "원장 임시 담당", "미배정 TODO 생성"].map((o) => (
                    <DChip key={o} active={unassignedPlan === o} title={o} onClick={() => { setUnassignedPlan(o); toast("넘기지 않은 반 처리: " + o); }} />
                  ))}
                </div>
              </Panel>
            )}
            {done ? (
              <div className="rounded-xl bg-accent-weak text-brand text-[13px] font-bold px-4 py-3 text-center">교체 예약 완료 · 적용일 {date}</div>
            ) : (
              <Button variant="primary" full onClick={finalize}>교체 확정 및 알림 발송</Button>
            )}
            <div className="flex gap-2">
              <Button variant="ghost" className="flex-[0_0_100px]" onClick={() => goto(4)}>뒤로</Button>
            </div>
          </>
        )}
      </div>
      {overlays}
    </PCShell>
  );
}
