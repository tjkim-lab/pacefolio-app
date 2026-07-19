"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PCShell } from "../_shell";
import { Panel, Pill, Note, FilterChip, ActBtn, useOverlays } from "../_ui";
import { IconChevron, IconSearch, IconUsers } from "@/components/ui/icons";
import { KIDS, type Kid } from "../_data";
import { useAudienceFilter, AudienceChips, emptyAudience, type AudienceState } from "../_audience";
import { OwnerLiveProvider, useOwnerLive } from "../_live";

const STATUS_FILTERS = ["all", "재원", "체험", "휴원", "퇴원 예정"];
type AF = AudienceState;

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
  return (
    <OwnerLiveProvider>
      <PCStudentsSwitch />
    </OwnerLiveProvider>
  );
}

/* READY = 서버 audience 공용 리졸버(#44)가 명단·필터·CSV 의 정본.
   FIXTURE/LOADING/ERROR = 기존 데모 화면 유지(데모 배지는 Provider 가 표시). */
function PCStudentsSwitch() {
  const live = useOwnerLive();
  return live.state === "READY" ? <StudentsLive /> : <StudentsFixture />;
}

const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"];
const STATUS_KO: [string, string][] = [
  ["ENROLLED", "재원"], ["TRIAL", "체험"], ["ON_BREAK", "휴원"], ["WITHDRAWN", "퇴원"],
];

function StudentsLive() {
  const router = useRouter();
  const ownerLive = useOwnerLive();
  const { toast, overlays } = useOverlays();
  const [classIds, setClassIds] = useState<string[]>([]);
  const [coachIds, setCoachIds] = useState<string[]>([]);
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [unpaidOnly, setUnpaidOnly] = useState(false);
  const [members, setMembers] = useState<{
    participantId: string; name: string; ageLabel: string; status: string;
    classNames: string[]; unpaid: boolean;
  }[]>([]);
  const [guardianRecipients, setGuardianRecipients] = useState(0);
  const [busy, setBusy] = useState(true); // 초기 로드 = 계산 중, 이후엔 핸들러가 켠다
  const toggleIn = <T,>(list: T[], v: T): T[] =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
  const touch = () => setBusy(true); // 필터 변경 이벤트에서만 — effect 내 동기 setState 금지

  const filter = useMemo(() => ({
    classIds: classIds.length ? classIds : undefined,
    coachUserIds: coachIds.length ? coachIds : undefined,
    weekdays: weekdays.length ? weekdays : undefined,
    statuses: statuses.length ? statuses : undefined,
    unpaidOnly: unpaidOnly || undefined,
  }), [classIds, coachIds, weekdays, statuses, unpaidOnly]);

  const { audiencePreview } = ownerLive;
  useEffect(() => {
    let alive = true;
    void audiencePreview(filter).then((r) => {
      if (!alive) return;
      setBusy(false);
      if (r.ok) {
        setMembers(r.members ?? []);
        setGuardianRecipients(r.guardianRecipients ?? 0);
      } else toast(r.message);
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, audiencePreview]);

  const exportCsv = () => {
    void ownerLive.audienceExportCsv(filter).then((r) => toast(r.message));
  };
  const statusPill = (st: string): ["ok" | "gray", string] => {
    const ko = STATUS_KO.find(([k]) => k === st)?.[1] ?? st;
    return [st === "ENROLLED" ? "ok" : "gray", ko];
  };

  return (
    <PCShell
      title="원생"
      actions={<span className="inline-flex items-center gap-1 text-[12px] font-extrabold text-brand"><span className="w-[7px] h-[7px] rounded-full bg-accent" />실 데이터 · AudienceFilter 서버 정본</span>}
    >
      {/* 서버 해석 축 — 반·코치·요일·상태·미납 (공지·청구·대회·CSV 와 같은 리졸버) */}
      <div className="space-y-0.5">
        <div className="text-[11px] font-bold text-ink3 mt-1 mb-1">반</div>
        <div className="flex gap-2 flex-wrap">
          {ownerLive.classes.map((c) => (
            <FilterChip key={c.classId} active={classIds.includes(c.classId)} onClick={() => { touch(); setClassIds((l) => toggleIn(l, c.classId)); }}>{c.name}</FilterChip>
          ))}
        </div>
        <div className="text-[11px] font-bold text-ink3 mt-2 mb-1">담당 코치</div>
        <div className="flex gap-2 flex-wrap">
          {ownerLive.coaches.map((c) => (
            <FilterChip key={c.userId} active={coachIds.includes(c.userId)} onClick={() => { touch(); setCoachIds((l) => toggleIn(l, c.userId)); }}>{c.name}</FilterChip>
          ))}
        </div>
        <div className="text-[11px] font-bold text-ink3 mt-2 mb-1">요일 (복수 = OR)</div>
        <div className="flex gap-2 flex-wrap">
          {WEEKDAY_KO.map((d, i) => (
            <FilterChip key={d} active={weekdays.includes(i)} onClick={() => { touch(); setWeekdays((l) => toggleIn(l, i)); }}>{d}</FilterChip>
          ))}
        </div>
        <div className="text-[11px] font-bold text-ink3 mt-2 mb-1">재원 상태 · 수납</div>
        <div className="flex gap-2 flex-wrap">
          {STATUS_KO.map(([k, ko]) => (
            <FilterChip key={k} active={statuses.includes(k)} onClick={() => { touch(); setStatuses((l) => toggleIn(l, k)); }}>{ko}</FilterChip>
          ))}
          <FilterChip active={unpaidOnly} onClick={() => { touch(); setUnpaidOnly((v) => !v); }}>미납만</FilterChip>
        </div>
      </div>

      <div className="flex gap-2 items-center flex-wrap">
        <span className="text-[12px] font-bold text-brand">
          {busy ? "대상 계산 중..." : `필터 결과 ${members.length}명 · 보호자 수신 ${guardianRecipients}명`}
        </span>
        <FilterChip className="ml-auto" onClick={() => { touch(); setClassIds([]); setCoachIds([]); setWeekdays([]); setStatuses([]); setUnpaidOnly(false); }}>전체 초기화</FilterChip>
        <ActBtn soft onClick={exportCsv}>CSV 내보내기</ActBtn>
      </div>

      <Panel title={null}>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-ink3 text-[11px] border-b border-line text-left">
              <th className="font-bold px-2.5 py-2">원생</th>
              <th className="font-bold py-2">반</th>
              <th className="font-bold py-2">상태</th>
              <th className="font-bold py-2">수납</th>
              <th className="font-bold py-2"></th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const [pk, pl] = statusPill(m.status);
              return (
                <tr
                  key={m.participantId}
                  tabIndex={0}
                  role="button"
                  onClick={() => router.push(`/pc/students/${m.participantId}`)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); router.push(`/pc/students/${m.participantId}`); } }}
                  className="border-b border-line2 last:border-0 cursor-pointer hover:bg-fill"
                >
                  <td className="px-2.5 py-2.5 font-bold text-ink">{m.name} <small className="text-ink3 font-medium">({m.ageLabel})</small></td>
                  <td className="py-2.5 text-ink2">{m.classNames.length ? m.classNames.join(" · ") : "—"}</td>
                  <td className="py-2.5"><Pill kind={pk}>{pl}</Pill></td>
                  <td className="py-2.5">{m.unpaid ? <Pill kind="due">미납</Pill> : <span className="text-ink3">—</span>}</td>
                  <td className="py-2.5 text-right pr-2.5"><IconChevron size={15} className="text-ink3 inline" /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {members.length === 0 && !busy && (
          <div className="text-center py-6">
            <div className="text-[30px]">🔍</div>
            <div className="text-[11.5px] text-ink3 font-medium mt-1">해당 조건의 원생이 없어요</div>
          </div>
        )}
      </Panel>

      <Note icon={<IconUsers size={16} />}>
        이 필터는 <b className="text-ink font-bold">공지 대상·청구 대상·대회 초대·CSV</b> 가 재사용하는 서버 공용 정본이에요. CSV 반출은 감사에 기록되고, 연락처·생년월일은 포함되지 않아요.
      </Note>
      {overlays}
    </PCShell>
  );
}

function StudentsFixture() {
  const router = useRouter();
  const { confirm, toast, overlays } = useOverlays();
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const filter = useAudienceFilter(); // 13B: AudienceFilter 정본 — 공지·청구·출결·대회와 공유
  const [drawer, setDrawer] = useState(false);

  const list = useMemo(() => {
    return KIDS.filter((k) => {
      if (status !== "all" && k.status !== status) return false;
      if (!filter.matches(k)) return false;
      return !q || (k.nm + k.cls + k.parent).indexOf(q) >= 0;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, q, filter.tick]);

  function resetAll() {
    filter.reset(); setStatus("all"); setQ("");
    toast("필터 초기화");
  }
  function applyPreset(p: (typeof PRESETS)[number]) {
    const next = emptyAudience(); p.apply(next); filter.setAf(next); filter.setTick((t) => t + 1);
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

      {/* 고급 필터 드로어 — AudienceFilter 정본 칩 (요일·시간대 상단 노출) */}
      {drawer && (
        <div className="border-t border-line2 pt-2">
          <AudienceChips filter={filter} />
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
