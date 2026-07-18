"use client";

/* PC 강사 (13B) — 행을 누르면 상세 4군(기본/자격·안전/운영/권한).
   민감 인사정보는 PC 상세에서 권한 있는 원장만 · 교체는 목록 행/상세에 배치. */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PCShell } from "../_shell";
import { Panel, Pill, Note, ActBtn } from "../_ui";
import { IconCheck } from "@/components/ui/icons";
import { COACHES, COACH_DETAIL } from "../_data";

const GROUPS: [string, "base" | "cert" | "ops" | "perm"][] = [
  ["기본", "base"], ["자격·안전", "cert"], ["운영", "ops"], ["권한", "perm"],
];

export default function PCCoaches() {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  return (
    <PCShell title="강사" actions={<span className="text-[12px] text-ink3 font-medium">3명 · 역할별 접근 권한은 설정에서</span>}>
      <Panel title={null}>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-ink3 text-[11px] border-b border-line text-left">
              <th className="font-bold px-2.5 py-2">코치</th>
              <th className="font-bold py-2">담당</th>
              <th className="font-bold py-2">상태</th>
              <th className="font-bold py-2">접근 권한</th>
              <th className="font-bold py-2"></th>
            </tr>
          </thead>
          <tbody>
            {COACHES.map((c) => {
              const detail = COACH_DETAIL[c.nm];
              const opened = open === c.nm;
              return [
                <tr
                  key={c.nm}
                  role="button"
                  tabIndex={0}
                  aria-expanded={opened}
                  onClick={() => setOpen(opened ? null : c.nm)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(opened ? null : c.nm); } }}
                  className="border-b border-line2 cursor-pointer hover:bg-fill"
                >
                  <td className="px-2.5 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-[30px] h-[30px] rounded-full grid place-items-center text-[13px] font-bold shrink-0 ${c.tone === "wait" ? "bg-warn-weak text-warn-ink" : "bg-fill text-ink2"}`}>{c.init}</div>
                      <span className="font-bold text-ink">{c.nm}</span>
                    </div>
                  </td>
                  <td className="py-3 text-ink2">{c.charge}</td>
                  <td className="py-3"><Pill kind={c.tone === "wait" ? "wait" : "ok"}>{c.status}</Pill></td>
                  <td className="py-3 text-ink2">{c.perm}</td>
                  <td className="py-3 text-right pr-2.5">
                    {c.swap && (
                      <ActBtn soft onClick={(e?: React.MouseEvent) => { e?.stopPropagation(); router.push("/pc/coaches/swap"); }}>
                        교체
                      </ActBtn>
                    )}
                  </td>
                </tr>,
                opened && detail && (
                  <tr key={`${c.nm}-detail`} className="border-b border-line2">
                    <td colSpan={5} className="px-2.5 pb-3 pt-1 bg-fill/50">
                      <div className="grid grid-cols-4 gap-3">
                        {GROUPS.map(([label, key]) => (
                          <div key={key} className="bg-surface border border-line rounded-xl p-3">
                            <div className="text-[11px] font-extrabold text-ink3 mb-1.5">{label}</div>
                            {detail[key].map(([k, v]) => (
                              <div key={k} className="py-0.5 text-[11.5px]">
                                <span className="text-ink3 font-medium">{k}</span>
                                <div className="text-ink font-semibold leading-snug">{v}</div>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                      <div className="mt-2 text-[11px] text-ink3 font-medium">
                        급여·계약서는 원장 정책·권한 — 열람 시 접근 로그 기록. 교체 flow: 기존/새 강사 → 대상 반 → 적용일 → 인수인계 기간 → 권한 회수일 → 학부모 공지 → 미배정 확인 → 최종 승인.
                      </div>
                    </td>
                  </tr>
                ),
              ];
            })}
          </tbody>
        </table>
      </Panel>
      <Note icon={<IconCheck size={16} />}>
        교체 시 인수인계 브리핑이 자동 생성돼요 — <b className="text-ink font-bold">노하우는 학원에 남습니다.</b> 기존 코치 권한 회수는 직원 권한 시스템과 연결됩니다.
      </Note>
    </PCShell>
  );
}
