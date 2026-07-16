"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { AppHeader, AppScroll } from "@/components/mobile/MobileShell";
import { Card } from "@/components/ui";
import { useToast, useConfirm, CardH4, RLRow, CheckRow } from "../../_kit";
import { kidById, type Makeup } from "../../_data";

export default function KidDetail() {
  const params = useParams<{ id: string }>();
  const kid = kidById(params.id);
  const { toast, toastNode } = useToast();
  const { confirm, confirmNode } = useConfirm();

  // 보강 처리 상태 (완료 기록)
  const [records, setRecords] = useState<Record<number, string>>({});
  const makeups: Makeup[] = kid?.makeups ?? [];
  const remaining = makeups.length - Object.keys(records).length;

  if (!kid) {
    return (
      <>
        <AppHeader title="원생" back="/owner/students" />
        <AppScroll>
          <div className="py-10 text-center text-[14px] text-ink3">원생을 찾을 수 없어요.</div>
        </AppScroll>
      </>
    );
  }

  function markMakeup(i: number, m: Makeup) {
    if (records[i]) return;
    confirm({
      title: "보강 처리 완료",
      sub: m.t,
      rows: [["기록", "이 보강 건을 처리 완료로 기록"]],
      warn:
        "PACEFOLIO는 실제 보강 일정이나 진행 방식을 관리하지 않아요. 원장님이 학원 운영 방식에 따라 처리를 마친 뒤 기록해 주세요.",
      memo: "처리 메모 (선택) — 예: 다음 달 수업으로 대체",
      label: "처리 완료",
      onConfirm: (memo) => {
        const rec = "처리 완료 · 원장님 · 오늘 14:20" + (memo ? " · " + memo : "");
        setRecords((prev) => {
          const next = { ...prev, [i]: rec };
          if (Object.keys(next).length === makeups.length) toast("보강 미처리가 모두 기록됐어요");
          else toast("보강 1건 처리 완료로 기록");
          return next;
        });
      },
    });
  }

  const rideParts = kid.veh?.ride.split(" · ") ?? [];
  const dropParts = kid.veh?.drop.split(" · ") ?? [];

  return (
    <>
      <AppHeader
        title={
          <span>
            {kid.nm}
            <small className="block text-[11.5px] font-medium text-ink3">
              {kid.age}세 · {kid.cls} · {kid.status}
            </small>
          </span>
        }
        back="/owner/students"
      />
      <AppScroll>
        {/* 기본 정보 */}
        <Card>
          <CardH4>기본 정보</CardH4>
          <RLRow label="반 · 담당" amount={`${kid.cls} · ${kid.coach} 코치`} />
          <RLRow label="상태" small="이 학원(원더짐)에서의 등록 기준" amount={kid.status} />
          <RLRow label="학부모" amount={kid.parent} />
          {kid.sib && <RLRow label="형제" small="합산 결제 편의 — 수납 기록은 각자 분리" amount={kid.sib} />}
          <RLRow label="출석 (이번 분기)" amount={kid.id === "ian" ? "입회 첫 주" : "92%"} />
          {kid.alert && <RLRow label="안전 특이사항" amount={kid.alert} amountClass="text-danger" />}
        </Card>

        {/* 차량 */}
        {kid.veh && (
          <Card>
            <CardH4 note="이용">차량 🚌</CardH4>
            <RLRow label="탑승" small={rideParts[1]} amount={rideParts[0]} />
            <RLRow label="하원" small={dropParts[1]} amount={dropParts[0]} />
            <RLRow
              label="카시트·특이사항"
              amount={<span className="block max-w-[56%] whitespace-normal text-right text-[13px] font-semibold">{kid.veh.seat}</span>}
            />
          </Card>
        )}

        {/* 수납 상태 */}
        <Card>
          <CardH4 note="9월 시작 기간">수납 상태</CardH4>
          <RLRow
            label="상태"
            small={kid.payDetail}
            amount={kid.pay}
            amountClass={kid.pay === "미납" ? "text-danger" : "text-accent-ink"}
          />
        </Card>

        {/* 보강 미처리 */}
        {makeups.length > 0 && (
          <Card>
            <CardH4 note={`${remaining}건`}>보강 미처리</CardH4>
            {remaining === 0 ? (
              <div className="py-4 text-center">
                <div className="text-[34px]">✅</div>
                <div className="mt-1 text-[13.5px] font-extrabold text-accent-ink">보강이 모두 처리됐어요</div>
              </div>
            ) : (
              makeups.map((m, i) => {
                const done = !!records[i];
                return (
                  <CheckRow
                    key={i}
                    checked={done}
                    title={m.t}
                    sub={m.s}
                    onClick={() => markMakeup(i, m)}
                    trailing={
                      <span
                        className={`block max-w-[7rem] text-[11px] font-extrabold leading-tight ${done ? "text-accent-ink" : "text-ink3"}`}
                      >
                        {done ? records[i] : "보강 처리 완료"}
                      </span>
                    }
                  />
                );
              })
            )}
          </Card>
        )}
        <div className="h-2" />
      </AppScroll>
      {toastNode}
      {confirmNode}
    </>
  );
}
