"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { cn, Tag } from "@/components/ui";
import { IconCheck, IconClock } from "@/components/ui/icons";
import { TASKS, SEV_LABEL, SEV_TONE, type AdminTask, type Sev } from "./_data";
import { useConfirm, useToast, Empty, Note } from "./_ui";

type TState = "NEW" | "TRACKING" | "RESOLVED";

/* 작업 아이콘 배경 */
function sevIconBg(sev: Sev) {
  return { hot: "bg-danger-weak text-danger-ink", warn: "bg-warn-weak text-warn-ink", norm: "bg-fill text-ink2" }[sev];
}

export function TaskList({
  filter = "all",
  limit,
  onCountChange,
}: {
  filter?: Sev | "all";
  limit?: number;
  onCountChange?: (n: number) => void;
}) {
  const router = useRouter();
  const { confirm, confirmView } = useConfirm();
  const { toast, toastView } = useToast();
  const [state, setState] = useState<Record<string, TState>>({});

  const tstate = (id: string): TState => state[id] || "NEW";
  const actionNeeded = (t: AdminTask) => {
    const s = tstate(t.id);
    return s !== "RESOLVED" && s !== "TRACKING";
  };

  const set = (id: string, s: TState) => {
    setState((prev) => {
      const next = { ...prev, [id]: s };
      onCountChange?.(TASKS.filter((t) => (next[t.id] || "NEW") === "NEW").length);
      return next;
    });
  };

  const list = useMemo(() => {
    let l = TASKS;
    if (filter !== "all") l = l.filter((t) => t.sev === filter);
    if (limit != null) {
      const order: Record<Sev, number> = { hot: 0, warn: 1, norm: 2 };
      l = l.filter(actionNeeded).sort((a, b) => order[a.sev] - order[b.sev]).slice(0, limit);
    }
    return l;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, limit, state]);

  const tracking = TASKS.filter((t) => tstate(t.id) === "TRACKING").length;

  function openIncident(t: AdminTask) {
    if (!t.inc) return;
    const i = t.inc;
    confirm({
      title: `긴급 인시던트 — ${i.id}`,
      sub: t.title,
      rows: [["심각도", i.sev], ["영향 범위", i.impact], ["담당자", i.owner], ["현재 상태", i.st]],
      warn: "인시던트는 일반 작업과 분리해 조사 → 복구 → 종료로 추적합니다. 이 데모에서는 조사팀 채널 에스컬레이션만 시연합니다.",
      label: "조사팀에 에스컬레이션",
      onConfirm: () => {
        i.st = "복구 중";
        toast(`${i.id} 에스컬레이션 — 상태: 복구 중 (데모)`);
      },
    });
  }

  function doProcess(t: AdminTask) {
    confirm({
      title: t.title,
      sub: `${t.acad} · 발생 ${t.time}`,
      rows: [["조치", t.cta || "처리"], ["상태 전환", "조치 필요 → 내 조치 완료·추적 중"]],
      warn: "조치하면 담당자에게 배정되고, 결과가 확인될 때까지 '추적 중'으로 남습니다(해결과 분리).",
      label: t.cta || "처리",
      onConfirm: () => {
        set(t.id, "TRACKING");
        toast(`조치했어요 — ${t.after || "추적 중"}`);
      },
    });
  }

  function TaskRow({ t }: { t: AdminTask }) {
    const s = tstate(t.id);
    return (
      <div className={cn("flex gap-3 items-center py-3 border-b border-line2 last:border-0", s === "RESOLVED" && "opacity-60")}>
        <div className={cn("w-9 h-9 rounded-xl grid place-items-center shrink-0", sevIconBg(t.sev))}>
          {t.sev === "norm" ? <IconClock size={18} /> : <AlertIcon />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-ink flex items-center gap-1.5 flex-wrap">
            <Tag tone={SEV_TONE[t.sev]}>{SEV_LABEL[t.sev]}</Tag>
            {t.kind === "incident" && <span className="text-[10px] font-extrabold text-danger-ink">● Incident</span>}
            <span>{t.title}</span>
          </div>
          <div className="text-[11px] text-ink3 font-medium mt-0.5">
            {t.acad} · {t.time} · 기한 {t.due}
            {s === "TRACKING" && " · 추적 중"}
          </div>
        </div>
        {s === "RESOLVED" ? (
          <div className="text-[12px] font-bold text-accent-ink shrink-0 flex items-center gap-1">
            <IconCheck size={14} /> 해결 완료
          </div>
        ) : t.kind === "incident" ? (
          <button onClick={() => openIncident(t)} className="shrink-0 rounded-lg bg-accent-strong text-white text-[12px] font-bold px-3 py-2">
            Incident 상세
          </button>
        ) : s === "TRACKING" ? (
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] font-semibold text-accent-ink text-right max-w-[180px]">{t.after || "내 조치 완료 · 추적 중"}</span>
            <button
              onClick={() => {
                set(t.id, "RESOLVED");
                toast("해결 처리됨 — 작업 종료");
              }}
              className="rounded-lg bg-accent-weak text-brand text-[12px] font-bold px-3 py-2 border border-line"
            >
              해결 처리
            </button>
          </div>
        ) : t.kind === "process" ? (
          <button onClick={() => doProcess(t)} className="shrink-0 rounded-lg bg-accent-strong text-white text-[12px] font-bold px-3 py-2">
            {t.cta || "처리"}
          </button>
        ) : (
          <button onClick={() => t.to && router.push(t.to)} className="shrink-0 rounded-lg bg-accent-weak text-brand text-[12px] font-bold px-3 py-2 border border-line">
            보기 →
          </button>
        )}
      </div>
    );
  }

  return (
    <>
      {list.length === 0 ? (
        <Empty emoji="🎉" title={limit != null ? "오늘 급한 일 끝!" : "처리할 작업이 없어요"} sub={limit != null ? "나머지는 시스템이 이어서 추적할게요" : "새 이벤트가 들어오면 여기 쌓입니다"} />
      ) : (
        list.map((t) => <TaskRow key={t.id} t={t} />)
      )}
      {limit != null && tracking > 0 && (
        <Note tone="inpanel">
          <IconClock size={18} className="text-accent-ink shrink-0" />
          <span>
            <b className="text-ink font-bold">추적 중 {tracking}건</b> — 내 조치는 끝났고 결과를 기다리는 항목. &quot;지금 처리할 일&quot; 배지에는 포함되지 않아요.
          </span>
        </Note>
      )}
      {confirmView}
      {toastView}
    </>
  );
}

function AlertIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3 2.5 20h19z" />
      <path d="M12 10v4M12 17.2h.01" />
    </svg>
  );
}
