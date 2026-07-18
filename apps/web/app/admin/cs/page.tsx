"use client";

import { useState } from "react";
import { AdminShell } from "../_shell";
import { Tag } from "@/components/ui";
import { IconChevron } from "@/components/ui/icons";
import { FilterChips, Note, Empty, useConfirm, useToast } from "../_ui";
import { CS, CS_STATUS_META, type CsStatus } from "../_data";
import { AdminLiveProvider } from "../_live";
import { SupportViewPanel } from "../_support-views";

type F = "all" | "원장" | "보호자";

export default function AdminCs() {
  const [filter, setFilter] = useState<F>("all");
  const [statuses, setStatuses] = useState<Record<string, CsStatus>>({});
  const { confirm, confirmView } = useConfirm();
  const { toast, toastView } = useToast();

  const stOf = (id: string, base: CsStatus) => statuses[id] || base;
  const list = CS.filter((c) => filter === "all" || c.role === filter);

  return (
    <AdminShell title="CS · 지원">
      <div className="space-y-3">
        <div>
          <h2 className="text-[19px] font-extrabold tracking-tight">CS · 지원 인박스</h2>
          <p className="text-[12.5px] text-ink3 font-medium mt-0.5">
            원장·보호자 문의 분리 · 담당자 · SLA · 답변과 내부 메모는 분리
          </p>
        </div>

        <FilterChips<F>
          value={filter}
          onChange={setFilter}
          options={[
            { key: "all", label: "전체" },
            { key: "원장", label: "원장 문의" },
            { key: "보호자", label: "보호자 문의" },
          ]}
        />

        <div className="rounded-2xl bg-surface border border-line px-4">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-ink3 text-[11px] border-b border-line">
                <th className="text-left font-bold py-2.5">문의자</th>
                <th className="text-left font-bold py-2.5">학원</th>
                <th className="text-left font-bold py-2.5">내용</th>
                <th className="text-left font-bold py-2.5">유형</th>
                <th className="text-left font-bold py-2.5">SLA</th>
                <th className="text-left font-bold py-2.5">상태</th>
                <th className="py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => {
                const st = CS_STATUS_META[stOf(c.id, c.st)];
                const openTicket = () =>
                  confirm({
                    title: c.subj,
                    sub: `${c.role} · ${c.who} · ${c.acad} · ${c.type}`,
                    rows: [["담당자", "김CS"], ["SLA", c.sla], ["상태", CS_STATUS_META[stOf(c.id, c.st)].ko]],
                    warn: "고객에게 보이는 답변과 내부 운영 메모는 분리해 기록됩니다.",
                    memo: { label: "고객에게 보이는 답변", placeholder: "보호자·원장에게 그대로 전달돼요", big: true },
                    memo2: { label: "내부 운영 메모 (고객 비공개)", placeholder: "팀 내부만 봄 · 고객 비공개 (원인·후속 조치 등)", big: true },
                    label: "답변 발송 · 메모 저장",
                    onConfirm: () => {
                      setStatuses((p) => ({ ...p, [c.id]: "IN_PROGRESS" }));
                      toast("고객 답변 발송 · 내부 메모 저장 — 상태: 처리중 (데모)");
                    },
                  });
                return (
                  <tr
                    key={c.id}
                    tabIndex={0}
                    role="button"
                    onClick={openTicket}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openTicket();
                      }
                    }}
                    className="border-b border-line2 last:border-0 cursor-pointer hover:bg-fill outline-none focus-visible:bg-fill"
                  >
                    <td className="py-3">
                      <span className={`inline-block text-[10px] font-extrabold px-1.5 py-0.5 rounded mr-1.5 ${c.role === "원장" ? "bg-accent-weak text-brand" : "bg-warn-weak text-warn-ink"}`}>
                        {c.role}
                      </span>
                      <span className="text-ink font-semibold">{c.who}</span>
                    </td>
                    <td className="py-3 text-ink2">{c.acad}</td>
                    <td className="py-3 text-ink2">{c.subj}</td>
                    <td className="py-3 text-ink2">{c.type}</td>
                    <td className="py-3">
                      <span className={`font-semibold ${c.sla.includes("시간") ? "text-danger-ink" : "text-ink2"}`}>{c.sla}</span>
                    </td>
                    <td className="py-3"><Tag tone={st.tone}>{st.ko}</Tag></td>
                    <td className="py-3 text-right"><IconChevron size={15} className="text-ink3 inline" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {list.length === 0 && <Empty emoji="📮" title="해당 문의가 없어요" sub="필터를 바꿔보세요" />}
        </div>

        <Note>
          <ChatMini />
          <span>행 클릭 → 문의 상세. <b className="text-ink font-bold">고객에게 보이는 답변</b>과 <b className="text-ink font-bold">내부 메모</b>는 반드시 분리해 기록합니다.</span>
        </Note>

        {/* 실연결(#30): 문의 처리 중 학원 내부 확인이 필요할 때 — 열람은 이 문으로만 */}
        <AdminLiveProvider>
          <SupportViewPanel />
        </AdminLiveProvider>
      </div>
      {confirmView}
      {toastView}
    </AdminShell>
  );
}

function ChatMini() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="text-accent shrink-0">
      <path d="M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z" />
    </svg>
  );
}
