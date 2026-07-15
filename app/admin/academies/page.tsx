"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AdminShell } from "../_shell";
import { Tag } from "@/components/ui";
import { IconChevron } from "@/components/ui/icons";
import { FilterChips, SearchBox, Empty } from "../_ui";
import { ACADEMIES, STATUS_META, hsClass, type AcademyStatus } from "../_data";

type F = AcademyStatus | "all";

export default function AdminAcademies() {
  const router = useRouter();
  const [filter, setFilter] = useState<F>("all");
  const [q, setQ] = useState("");

  const list = ACADEMIES.filter((a) => {
    if (filter !== "all" && a.status !== filter) return false;
    if (q && !a.name.includes(q) && !a.owner.includes(q)) return false;
    return true;
  });

  return (
    <AdminShell title="학원 관리">
      <div className="space-y-3">
        <div>
          <h2 className="text-[19px] font-extrabold tracking-tight">학원 관리</h2>
          <p className="text-[12.5px] text-ink3 font-medium mt-0.5">
            전체 12곳 · 아래는 샘플 8곳 · 모든 지표·작업은 학원 단위로 귀속
          </p>
        </div>

        <div className="flex gap-2 flex-wrap items-center">
          <FilterChips<F>
            value={filter}
            onChange={setFilter}
            options={[
              { key: "all", label: "전체" },
              { key: "ACTIVE", label: "활성" },
              { key: "ONBOARDING", label: "온보딩" },
              { key: "TRIAL", label: "체험" },
              { key: "AT_RISK", label: "이탈위험" },
              { key: "SUSPENDED", label: "정지" },
            ]}
          />
          <div className="ml-auto">
            <SearchBox value={q} onChange={setQ} placeholder="학원명·원장명 검색" />
          </div>
        </div>

        <div className="rounded-2xl bg-surface border border-line px-4">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-ink3 text-[11px] border-b border-line">
                <th className="text-left font-bold py-2.5">학원</th>
                <th className="text-left font-bold py-2.5">상태</th>
                <th className="text-left font-bold py-2.5">원장</th>
                <th className="text-left font-bold py-2.5">활성 원생</th>
                <th className="text-left font-bold py-2.5">자동결제</th>
                <th className="text-left font-bold py-2.5">리포트</th>
                <th className="text-left font-bold py-2.5">헬스</th>
                <th className="text-left font-bold py-2.5">담당</th>
                <th className="py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {list.map((a) => {
                const s = STATUS_META[a.status];
                const showNum = a.status === "ACTIVE" || a.status === "AT_RISK";
                return (
                  <tr
                    key={a.id}
                    tabIndex={0}
                    role="button"
                    onClick={() => router.push(`/admin/academies/${a.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        router.push(`/admin/academies/${a.id}`);
                      }
                    }}
                    className="border-b border-line2 last:border-0 cursor-pointer hover:bg-fill outline-none focus-visible:bg-fill"
                  >
                    <td className="py-3">
                      <div className="flex items-center gap-2.5">
                        <span className="w-[30px] h-[30px] rounded-lg bg-fill grid place-items-center text-[13px] font-extrabold text-ink2 shrink-0">
                          {a.name.charAt(0)}
                        </span>
                        <div>
                          <div className="font-bold text-ink">{a.name}</div>
                          <div className="text-[10.5px] text-ink3 font-medium">{a.region} · {a.last}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3">
                      <Tag tone={s.tone}>
                        {s.ko}
                        {a.status === "ONBOARDING" && a.onboard ? " " + a.onboard.split(" ")[0] : ""}
                      </Tag>
                    </td>
                    <td className="py-3 text-ink2">{a.owner}</td>
                    <td className="py-3 text-ink2">{a.kids > 0 ? a.kids + "명" : "–"}</td>
                    <td className="py-3 text-ink2">{showNum ? a.auto + "%" : "–"}</td>
                    <td className="py-3 text-ink2">{showNum ? a.report + "%" : "–"}</td>
                    <td className="py-3">
                      {a.health > 0 ? (
                        <span className={`font-extrabold tabular-nums ${hsClass(a.health)}`}>{a.health}</span>
                      ) : (
                        <span className="text-ink3">–</span>
                      )}
                    </td>
                    <td className="py-3 text-ink2">{a.cs}</td>
                    <td className="py-3 text-right">
                      <IconChevron size={15} className="text-ink3 inline" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {list.length === 0 && <Empty emoji="🔍" title="조건에 맞는 학원이 없어요" sub="필터·검색어를 바꿔보세요" />}
        </div>
      </div>
    </AdminShell>
  );
}
