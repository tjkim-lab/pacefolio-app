"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PCShell } from "../_shell";
import { Panel, Pill, Note, FilterChip, ActBtn, useOverlays } from "../_ui";
import { IconChevron, IconSearch, IconUsers } from "@/components/ui/icons";
import { KIDS, AF_GROUPS, CLS_OPTS, programOf, ageBand, dayOf, type Kid } from "../_data";

const STATUS_FILTERS = ["all", "재원", "체험", "휴원", "퇴원 예정"];
type AF = Record<string, Set<string>>;
const emptyAf = (): AF => Object.fromEntries(AF_GROUPS.map((g) => [g.key, new Set<string>()]));

const PRESETS: { t: string; apply: (af: AF) => void }[] = [
  { t: "미납 원생", apply: (af) => af.pay.add("미납") },
  { t: "차량 이용", apply: (af) => af.veh.add("이용") },
  { t: "7~9세", apply: (af) => af.age.add("7~9세") },
  { t: "안전정보 있음", apply: (af) => af.safe.add("있음") },
];
const BULK: [string, boolean][] = [["공지 보내기", false], ["반 변경", true], ["청구 생성", true], ["CSV 내보내기", false], ["태그 추가", false]];

function payPill(k: Kid): ["ok" | "due" | "wait", string] {
  if (k.pay === "미납") return ["due", "미납"];
  if (k.pay === "일할 청구") return ["wait", "일할 청구"];
  return ["ok", "완납"];
}

export default function PCStudents() {
  const router = useRouter();
  const { confirm, toast, overlays } = useOverlays();
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const [af, setAf] = useState<AF>(emptyAf);
  const [drawer, setDrawer] = useState(false);
  const [tick, setTick] = useState(0); // Set 변경 반영용

  const list = useMemo(() => {
    return KIDS.filter((k) => {
      if (status !== "all" && k.status !== status) return false;
      if (af.age.size && !af.age.has(ageBand(k.age))) return false;
      if (af.gender.size && !af.gender.has(k.gender || "미입력")) return false;
      if (af.prog.size && !af.prog.has(programOf(k.cls))) return false;
      if (af.cls2.size && !CLS_OPTS.some((c) => af.cls2.has(c) && k.cls.indexOf(c) >= 0)) return false;
      if (af.day.size && !af.day.has(dayOf(k.cls))) return false;
      if (af.coach.size && !af.coach.has(k.coach)) return false;
      if (af.pay.size && !af.pay.has(k.pay)) return false;
      if (af.veh.size && !af.veh.has(k.veh ? "이용" : "미이용")) return false;
      if (af.safe.size && !af.safe.has(k.alert ? "있음" : "없음")) return false;
      return !q || (k.nm + k.cls + k.parent).indexOf(q) >= 0;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, q, tick]);

  function toggleAf(key: string, opt: string) {
    setAf((prev) => {
      const s = prev[key];
      if (s.has(opt)) s.delete(opt); else s.add(opt);
      return { ...prev };
    });
    setTick((t) => t + 1);
  }
  function resetAll() {
    setAf(emptyAf()); setStatus("all"); setQ(""); setTick((t) => t + 1);
    toast("필터 초기화");
  }
  function applyPreset(p: (typeof PRESETS)[number]) {
    const next = emptyAf(); p.apply(next); setAf(next); setTick((t) => t + 1);
    toast(`저장된 필터 '${p.t}' 적용`);
  }
  function bulk(name: string, danger: boolean) {
    const n = list.length;
    if (danger) {
      confirm({
        title: `${n}명에게 '${name}'을(를) 실행할까요?`,
        rows: [["대상", `${n}명 (현재 필터 결과)`], ["영향", "시간표·수강료·차량 노선 변경 가능"], ["적용 시점", "다음 수납 기간부터"]],
        warn: "위험한 일괄 작업이에요 — 실행 전 영향을 확인하세요. 이미 확정된 청구서는 수정 청구로만 반영됩니다. 안전정보 상세는 권한 있는 사용자만 열람할 수 있어요.",
        label: `${name} 실행`,
        onConfirm: () => toast(`${name} — ${n}명 대상 실행(데모)`),
      });
    } else toast(`${name} — 필터 결과 ${n}명 대상 실행(데모)`);
  }

  return (
    <PCShell
      title="원생"
      actions={<span className="text-[12px] text-ink3 font-medium">전체 93명 · 샘플 8명</span>}
    >
      {/* 상태 필터 + 검색 */}
      <div className="flex gap-2 items-center flex-wrap">
        {STATUS_FILTERS.map((s) => (
          <FilterChip key={s} active={status === s} onClick={() => setStatus(s)}>
            {s === "all" ? "전체" : s}
          </FilterChip>
        ))}
        <FilterChip className="ml-auto" active={drawer} onClick={() => setDrawer((d) => !d)}>
          고급 필터 {drawer ? "−" : "+"}
        </FilterChip>
        <div className="flex items-center gap-2 bg-surface border border-line rounded-lg px-3 py-2 min-w-[250px]">
          <IconSearch size={15} className="text-ink3" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="이름·반·학부모 연락처 검색"
            className="flex-1 bg-transparent text-[13px] text-ink font-medium focus:outline-none"
          />
        </div>
      </div>

      {/* 고급 필터 드로어 */}
      {drawer && (
        <div className="border-t border-line2 pt-2">
          {AF_GROUPS.map((g) => (
            <div key={g.key}>
              <div className="text-[11px] font-bold text-ink3 mt-2 mb-1">{g.label}</div>
              <div className="flex gap-2 flex-wrap mb-0.5">
                {g.opts.map((o) => (
                  <FilterChip key={o} active={af[g.key].has(o)} onClick={() => toggleAf(g.key, o)}>{o}</FilterChip>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 프리셋 */}
      <div className="flex gap-2 items-center flex-wrap">
        <span className="text-[12px] font-bold text-brand">필터 결과 {list.length}명 (샘플 8명 기준)</span>
        {PRESETS.map((p) => (
          <FilterChip key={p.t} onClick={() => applyPreset(p)}>⭐ {p.t}</FilterChip>
        ))}
        <FilterChip className="ml-auto" onClick={resetAll}>전체 초기화</FilterChip>
      </div>

      {/* 테이블 */}
      <Panel title={null}>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-ink3 text-[11px] border-b border-line text-left">
              <th className="font-bold px-2.5 py-2">원생</th>
              <th className="font-bold py-2">반 · 담당</th>
              <th className="font-bold py-2">상태</th>
              <th className="font-bold py-2">수납 (3분기)</th>
              <th className="font-bold py-2">보강</th>
              <th className="font-bold py-2"></th>
            </tr>
          </thead>
          <tbody>
            {list.map((k) => {
              const [pk, pl] = payPill(k);
              return (
                <tr
                  key={k.id}
                  tabIndex={0}
                  role="button"
                  onClick={() => router.push(`/pc/students/${k.id}`)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); router.push(`/pc/students/${k.id}`); } }}
                  className="border-b border-line2 last:border-0 cursor-pointer hover:bg-fill"
                >
                  <td className="px-2.5 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-[30px] h-[30px] rounded-full bg-fill grid place-items-center text-sm shrink-0">{k.em}</div>
                      <div>
                        <div className="font-bold text-ink">{k.nm} ({k.age}세)</div>
                        <div className="text-[10.5px] text-ink3 font-medium">{k.parent}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-2.5 text-ink2">{k.cls} · {k.coach}</td>
                  <td className="py-2.5"><Pill kind={k.status === "재원" ? "ok" : "gray"}>{k.status}</Pill></td>
                  <td className="py-2.5"><Pill kind={pk}>{pl}</Pill></td>
                  <td className="py-2.5">{k.makeup > 0 ? <Pill kind="wait">미처리 {k.makeup}</Pill> : <span className="text-ink3">—</span>}</td>
                  <td className="py-2.5 text-right pr-2.5"><IconChevron size={15} className="text-ink3 inline" /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {list.length === 0 && (
          <div className="text-center py-6">
            <div className="text-[30px]">🔍</div>
            <div className="text-[11.5px] text-ink3 font-medium mt-1">{q ? `"${q}" 검색 결과가 없어요` : "해당 조건의 원생이 없어요"}</div>
          </div>
        )}
      </Panel>

      {/* 일괄 작업 바 */}
      <div className="flex items-center justify-between gap-2.5 bg-surface border border-line rounded-xl px-3.5 py-3 flex-wrap">
        <span className="text-[13px] font-bold text-ink">선택 대상 {list.length}명</span>
        <div className="flex gap-1.5 flex-wrap">
          {BULK.map(([name, danger]) => (
            <ActBtn key={name} soft onClick={() => bulk(name, danger)}>{name}</ActBtn>
          ))}
        </div>
      </div>

      <Note icon={<IconUsers size={16} />}>
        한 원생이 여러 학원을 동시에 다닐 수 있어요 — 이 콘솔은 <b className="text-ink font-bold">원더짐에서의 등록 정보</b>만 보여줍니다. 형제는 같은 보호자로 연결돼 <b className="text-ink font-bold">합산 결제만 편해질 뿐</b>, 수납·정산 기록은 원생별로 분리 저장됩니다.
      </Note>
      {overlays}
    </PCShell>
  );
}
