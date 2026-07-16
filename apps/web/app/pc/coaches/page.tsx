"use client";

import { useRouter } from "next/navigation";
import { PCShell } from "../_shell";
import { Panel, Pill, Note, ActBtn } from "../_ui";
import { IconCheck } from "@/components/ui/icons";
import { COACHES } from "../_data";

export default function PCCoaches() {
  const router = useRouter();
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
            {COACHES.map((c) => (
              <tr key={c.nm} className="border-b border-line2 last:border-0">
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
                  {c.swap && <ActBtn soft onClick={() => router.push("/pc/coaches/swap")}>교체</ActBtn>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      <Note icon={<IconCheck size={16} />}>
        교체 시 인수인계 브리핑이 자동 생성돼요 — <b className="text-ink font-bold">노하우는 학원에 남습니다.</b> 기존 코치 권한 회수는 직원 권한 시스템과 연결됩니다.
      </Note>
    </PCShell>
  );
}
