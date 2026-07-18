"use client";

/* AudienceFilter 정본 (13B — docs/13 §C)
   원생 조회 · 공지 대상 · 청구 대상 · 출결 명단 · 대회 초대 · CSV 가 이 훅과
   칩 UI 를 재사용한다 — 화면마다 필터를 따로 만들지 않는다.
   요일·시간 등 복수 선택 = OR ("월+수 = 월요일 또는 수요일 수업"). */
import { useMemo, useState } from "react";
import { FilterChip } from "./_ui";
import { AF_GROUPS, CLS_OPTS, programOf, ageBand, dayOf, timeOf, type Kid } from "./_data";

export type AudienceState = Record<string, Set<string>>;
export const emptyAudience = (): AudienceState =>
  Object.fromEntries(AF_GROUPS.map((g) => [g.key, new Set<string>()]));

export function matchesAudience(af: AudienceState, k: Kid): boolean {
  if (af.age.size && !af.age.has(ageBand(k.age))) return false;
  if (af.gender.size && !af.gender.has(k.gender || "미입력")) return false;
  if (af.prog.size && !af.prog.has(programOf(k.cls))) return false;
  if (af.cls2.size && !CLS_OPTS.some((c) => af.cls2.has(c) && k.cls.indexOf(c) >= 0)) return false;
  if (af.day.size && !af.day.has(dayOf(k.cls))) return false;
  if (af.time.size && !af.time.has(timeOf(k.cls))) return false;
  if (af.coach.size && !af.coach.has(k.coach)) return false;
  if (af.pay.size && !af.pay.has(k.pay)) return false;
  if (af.veh.size && !af.veh.has(k.veh ? "이용" : "미이용")) return false;
  if (af.safe.size && !af.safe.has(k.alert ? "있음" : "없음")) return false;
  return true;
}

export function useAudienceFilter() {
  const [af, setAf] = useState<AudienceState>(emptyAudience);
  const [tick, setTick] = useState(0); // Set 변경 리렌더용
  const toggle = (key: string, opt: string) => {
    setAf((prev) => {
      const s = prev[key];
      if (s.has(opt)) s.delete(opt);
      else s.add(opt);
      return { ...prev };
    });
    setTick((t) => t + 1);
  };
  const reset = () => {
    setAf(emptyAudience());
    setTick((t) => t + 1);
  };
  const active = useMemo(
    () => AF_GROUPS.flatMap((g) => [...af[g.key]].map((o) => `${o}`)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tick],
  );
  return { af, setAf, toggle, reset, tick, setTick, active, matches: (k: Kid) => matchesAudience(af, k) };
}

/* 칩 UI — groups 로 축을 제한해 화면별 압축 표시 가능 (정의는 공유) */
export function AudienceChips({
  filter,
  groups,
}: {
  filter: ReturnType<typeof useAudienceFilter>;
  groups?: string[];
}) {
  const shown = groups ? AF_GROUPS.filter((g) => groups.includes(g.key)) : AF_GROUPS;
  return (
    <>
      {shown.map((g) => (
        <div key={g.key}>
          <div className="text-[11px] font-bold text-ink3 mt-2 mb-1">{g.label}</div>
          <div className="flex gap-2 flex-wrap mb-0.5">
            {g.opts.map((o) => (
              <FilterChip key={o} active={filter.af[g.key].has(o)} onClick={() => filter.toggle(g.key, o)}>
                {o}
              </FilterChip>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
