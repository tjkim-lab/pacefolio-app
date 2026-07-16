"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PCShell } from "../../_shell";
import { Panel, RL, ActBtn, CheckMark, useOverlays } from "../../_ui";
import { IconArrowLeft } from "@/components/ui/icons";
import { KIDS } from "../../_data";

export default function KidDetail() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { confirm, toast, overlays } = useOverlays();
  const base = KIDS.find((x) => x.id === params.id);
  const [makeups, setMakeups] = useState(() => (base?.makeups ?? []).map((m) => ({ ...m })));

  if (!base) {
    return (
      <PCShell title="원생 상세">
        <Panel title={null}>
          <div className="text-center py-8 text-ink3">원생을 찾을 수 없어요.</div>
          <div className="text-center"><ActBtn soft onClick={() => router.push("/pc/students")}>← 원생 목록</ActBtn></div>
        </Panel>
      </PCShell>
    );
  }
  const k = base;
  const makeupLeft = makeups.filter((m) => !m.done).length;

  function processMakeup(idx: number) {
    const m = makeups[idx];
    if (m.done) return;
    confirm({
      title: "보강 처리 완료",
      sub: m.t,
      rows: [["기록", "이 보강 건을 처리 완료로 기록"]],
      warn: "PACEFOLIO는 실제 보강 일정이나 진행 방식을 관리하지 않아요. 원장님이 학원 운영 방식에 따라 처리를 마친 뒤 기록해 주세요.",
      memo: "처리 메모 (선택) — 예: 다음 달 수업으로 대체",
      label: "처리 완료",
      onConfirm: (memo) => {
        setMakeups((prev) => prev.map((x, i) => i === idx ? { ...x, done: true, record: "처리 완료 · 원장님 · 오늘 14:20" + (memo ? " · " + memo : "") } : x));
        toast(makeupLeft <= 1 ? "보강 미처리가 모두 기록됐어요" : "보강 1건 처리 완료로 기록");
      },
    });
  }

  return (
    <PCShell
      title={
        <span className="flex items-center gap-3">
          <button onClick={() => router.push("/pc/students")} className="inline-flex items-center gap-1.5 border border-line bg-surface text-[12.5px] font-bold px-3 py-1.5 rounded-lg text-ink2 hover:bg-fill">
            <IconArrowLeft size={14} /> 목록
          </button>
          {k.nm}
        </span>
      }
      actions={<span className="text-[12px] text-ink3 font-medium">{k.age}세 · {k.cls} · {k.status}</span>}
    >
      <div className="grid grid-cols-2 gap-3 items-start">
        {/* 좌: 기본 + 차량 */}
        <div className="space-y-3">
          <Panel title="기본 정보" hnote="이 학원(원더짐)에서의 등록 기준">
            <RL label="반 · 담당" amount={`${k.cls} · ${k.coach} 코치`} />
            <RL label="상태" amount={k.status} />
            <RL label="학부모" amount={k.parent} />
            {k.sib && <RL label="형제" sub="합산 결제 편의 — 수납 기록은 각자 분리" amount={k.sib} />}
            <RL label="출석 (이번 분기)" amount={k.id === "ian" ? "입회 첫 주" : "92%"} />
            {k.alert && <RL label="안전 특이사항" amount={k.alert} tone="danger" />}
          </Panel>

          {k.veh && (
            <Panel title="차량" hnote="이용">
              <RL label="탑승" sub={k.veh.ride.split(" · ")[1]} amount={k.veh.ride.split(" · ")[0]} />
              <RL label="하원" sub={k.veh.drop.split(" · ")[1]} amount={k.veh.drop.split(" · ")[0]} />
              <div className="flex items-baseline justify-between gap-2.5 py-2">
                <span className="text-[13px] text-ink2 font-medium">카시트·특이사항</span>
                <span className="text-[13px] font-semibold text-ink text-right max-w-[56%]">{k.veh.seat}</span>
              </div>
            </Panel>
          )}
        </div>

        {/* 우: 수납 + 보강 */}
        <div className="space-y-3">
          <Panel title="수납 상태" hnote="3분기 · 원생별 분리 청구">
            {k.bill.map((r, i) => (
              <RL key={i} label={r[0]} amount={r[1]} disc={r[0].indexOf("할인") >= 0} />
            ))}
            <RL
              label="총 청구액"
              sub={k.payDetail}
              amount={`${k.total} · ${k.pay}`}
              tone={k.pay === "미납" ? "danger" : "accent"}
              total
            />
          </Panel>

          {makeups.length > 0 && (
            <Panel title="보강 미처리" hnote={`${makeupLeft}건`}>
              {makeups.map((m, i) => (
                <button
                  key={i}
                  onClick={() => processMakeup(i)}
                  disabled={m.done}
                  className={`w-full flex gap-3 items-center rounded-xl border-[1.5px] px-3 py-2.5 mt-2 first:mt-0 text-left transition ${m.done ? "border-accent bg-accent-weak cursor-default" : "border-line bg-surface hover:bg-fill"}`}
                >
                  <span className={`w-[22px] h-[22px] rounded-md grid place-items-center shrink-0 ${m.done ? "bg-accent text-white" : "border-2 border-line2"}`}>
                    {m.done && <CheckMark size={13} />}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] font-bold text-ink">{m.t}</span>
                    <span className="block text-[11px] text-ink3 font-medium">{m.s}</span>
                  </span>
                  <span className={`text-[11px] font-extrabold text-right max-w-[42%] leading-tight ${m.done ? "text-brand" : "text-ink3"}`}>
                    {m.done ? m.record : "보강 처리 완료"}
                  </span>
                </button>
              ))}
              {makeupLeft === 0 && (
                <div className="text-center py-3.5">
                  <div className="text-[30px]">✅</div>
                  <div className="text-[13px] font-extrabold text-brand mt-1">보강이 모두 처리됐어요</div>
                </div>
              )}
              <div className="text-[11.5px] text-ink3 font-medium leading-relaxed mt-2">
                PACEFOLIO는 보강 일정·방식을 관리하지 않아요 — 원장님이 처리한 뒤 <b className="text-brand font-bold">기록만</b> 남깁니다.
              </div>
            </Panel>
          )}
        </div>
      </div>
      {overlays}
    </PCShell>
  );
}
