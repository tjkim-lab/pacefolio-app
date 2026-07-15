"use client";

import { useState } from "react";
import { AdminShell } from "../_shell";
import { FilterChips, Note } from "../_ui";
import { TaskList } from "../_tasks";
import type { Sev } from "../_data";

type F = Sev | "all";

export default function AdminTasks() {
  const [filter, setFilter] = useState<F>("all");

  return (
    <AdminShell title="운영 작업함">
      <div className="space-y-3">
        <div>
          <h2 className="text-[19px] font-extrabold tracking-tight">운영 작업함</h2>
          <p className="text-[12.5px] text-ink3 font-medium mt-0.5">
            중요도 · 대상 학원 · 기한 · 상태 · 바로 처리 — 어느 학원에서 무엇을, 누가 언제까지
          </p>
        </div>

        <FilterChips<F>
          value={filter}
          onChange={setFilter}
          options={[
            { key: "all", label: "전체" },
            { key: "hot", label: "긴급" },
            { key: "warn", label: "주의" },
            { key: "norm", label: "일반" },
          ]}
        />

        <div className="rounded-2xl bg-surface border border-line px-4">
          <TaskList filter={filter} />
        </div>

        <Note>
          <InboxMini />
          <span>
            각 작업엔 <b className="text-ink font-bold">중요도·대상 학원·발생 시각·처리 기한·현재 상태·처리 이력</b>이 붙습니다. &quot;처리&quot; 버튼은 확인 → 처리 중 → 완료·추적으로 실제 전환됩니다(데모).
          </span>
        </Note>
      </div>
    </AdminShell>
  );
}

function InboxMini() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="text-accent shrink-0">
      <path d="M3 13h4l2 3h6l2-3h4" /><path d="M5 5h14l2 8v6H3v-6z" />
    </svg>
  );
}
