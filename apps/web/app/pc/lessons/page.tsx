"use client";

import { useState, type ReactNode } from "react";
import { PCShell } from "../_shell";
import { Button, Card } from "@/components/ui";
import { useOverlays, Panel, RL, Pill, Note, ActBtn, FilterChip, DChip, Spinner } from "../_ui";
import { IconClock, IconSpark, IconCheck } from "@/components/ui/icons";
import {
  PROGRAMS, PERMD, CLASSES_OP, COACH_BUSY, WEEK, TT_RECUR, TT_EXC, TT_DOW, TT_TONE, TT_EXC_LIST,
  type ProgramRow, type ClsRow,
} from "../_data";

const INPUT = "w-full border border-line rounded-lg bg-fill px-3 py-2.5 text-[13px] text-ink focus:outline-none focus:border-accent focus:bg-surface";
const toneVar = (t: "accent" | "ink3" | "danger" | "warn") => (t === "ink3" ? "var(--ink-3)" : `var(--${t})`);
function pgPill(st: string): "ok" | "wait" | "gray" { return st === "운영 중" ? "ok" : st === "모집 중" ? "wait" : "gray"; }
function dayTokens(s: string) { return (s || "").split(/[·,\s]+/).filter(Boolean); }
function dayOverlap(a: string, b: string) { const tb = dayTokens(b); return dayTokens(a).some((x) => tb.indexOf(x) >= 0); }

/* ---------- 프로그램 폼 모달 ---------- */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-2.5">
      <div className="text-[11.5px] font-bold text-ink2 mb-1">{label}</div>
      {children}
    </div>
  );
}
function ProgramModal({
  mode, base, onClose, onSave,
}: { mode: "new" | "edit" | "copy"; base: ProgramRow | null; onClose: () => void; onSave: (p: ProgramRow) => void }) {
  const b = base;
  const [f, setF] = useState({
    nm: mode === "copy" ? (b?.nm ?? "") + " 복제본" : b?.nm ?? "",
    div: b?.div ?? "브레인", sport: b?.sport ?? "", age: b?.age ?? "",
    st: mode === "edit" ? b?.st ?? "초안" : "초안",
    time: b?.time ?? "", cap: b?.cap ?? "", min: b?.min ?? "",
    ses: b?.cur ? b.cur.split(" · ")[0] : "", ver: (b?.cur && b.cur.split(" · ")[1]) || "v2026-1",
    fee: b?.fee ?? "", veh: b?.veh ?? "", rep: b?.rep ?? "", perm: b?.perm ?? "선택형",
  });
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }));
  const submit = () => {
    if (!f.nm.trim()) return;
    const perm = f.perm;
    onSave({
      id: b && mode === "edit" ? b.id : "pg" + Date.now(),
      nm: f.nm.trim(), div: f.div, sport: f.sport.trim() || "—", age: f.age.trim() || "—", st: f.st,
      time: f.time.trim() || "—", cap: f.cap.trim() || "—", min: f.min.trim() || "—",
      cur: (f.ses.trim() || "0회") + " · " + (f.ver.trim() || "v2026-1"),
      fee: f.fee.trim() || "—", veh: f.veh.trim() || "—", mid: "일할 계산 (실제 남은 수업일)",
      rep: f.rep.trim() || "—", perm, permd: PERMD[perm] || "",
      cls: mode === "edit" ? b?.cls ?? "0개 반" : "0개 반", kids: mode === "edit" ? b?.kids ?? "0명" : "0명",
    });
  };
  return (
    <div className="fixed inset-0 z-[300] grid place-items-center p-6 bg-[color:var(--overlay)]" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} role="dialog" aria-modal="true">
      <div className="w-[440px] max-w-full max-h-[88%] overflow-y-auto bg-surface rounded-2xl p-5 shadow-[var(--shadow-modal)]">
        <h3 className="text-[16px] font-extrabold text-ink">{mode === "new" ? "새 프로그램 만들기" : mode === "copy" ? "프로그램 복제" : "프로그램 수정"}</h3>
        <div className="text-[12px] text-ink3 font-medium mt-1">{mode === "edit" ? "수정 내용은 새 반·수업부터 적용돼요. 완료된 수업·발송 리포트는 당시 커리큘럼 버전 그대로 유지됩니다." : "기본값을 채워 초안을 만들어요. 상태를 '모집 중/운영 중'으로 바꾸면 학부모 앱 모집에 노출돼요."}</div>
        <Field label="프로그램명 *"><input autoFocus className={INPUT} value={f.nm} onChange={(e) => set("nm", e.target.value)} placeholder="예: 플레이2" /></Field>
        <Field label="부문 *"><select className={INPUT} value={f.div} onChange={(e) => set("div", e.target.value)}><option>브레인</option><option>액티브</option></select></Field>
        <Field label="종목"><input className={INPUT} value={f.sport} onChange={(e) => set("sport", e.target.value)} placeholder="예: 밸런스·리듬 통합" /></Field>
        <Field label="대상 연령"><input className={INPUT} value={f.age} onChange={(e) => set("age", e.target.value)} placeholder="예: 7~9세" /></Field>
        <Field label="공개·모집 상태"><select className={INPUT} value={f.st} onChange={(e) => set("st", e.target.value)}><option>초안</option><option>모집 중</option><option>운영 중</option><option>비활성</option></select></Field>
        <div className="grid grid-cols-3 gap-2">
          <Field label="기본 수업 시간"><input className={INPUT} value={f.time} onChange={(e) => set("time", e.target.value)} placeholder="60분" /></Field>
          <Field label="기본 정원"><input className={INPUT} value={f.cap} onChange={(e) => set("cap", e.target.value)} placeholder="12명" /></Field>
          <Field label="최소 운영 인원"><input className={INPUT} value={f.min} onChange={(e) => set("min", e.target.value)} placeholder="6명" /></Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="기본 회차"><input className={INPUT} value={f.ses} onChange={(e) => set("ses", e.target.value)} placeholder="24회" /></Field>
          <Field label="커리큘럼 버전"><input className={INPUT} value={f.ver} onChange={(e) => set("ver", e.target.value)} placeholder="v2026-1" /></Field>
        </div>
        <Field label="기본 수강료"><input className={INPUT} value={f.fee} onChange={(e) => set("fee", e.target.value)} placeholder="360,000 / 분기" /></Field>
        <Field label="차량비"><input className={INPUT} value={f.veh} onChange={(e) => set("veh", e.target.value)} placeholder="45,000 별도 · 무할인 / 미운행" /></Field>
        <Field label="리포트 항목"><input className={INPUT} value={f.rep} onChange={(e) => set("rep", e.target.value)} placeholder="예: 밸런스·리듬 등 5항목 + 사진" /></Field>
        <Field label="코치 편집 권한"><select className={INPUT} value={f.perm} onChange={(e) => set("perm", e.target.value)}><option>잠금형</option><option>선택형</option><option>자율형</option><option>승인형</option></select></Field>
        <div className="flex gap-2 mt-3.5">
          <Button variant="ghost" className="flex-[0_0_96px]" onClick={onClose}>취소</Button>
          <Button variant="primary" full onClick={submit}>{mode === "edit" ? "저장" : "만들기"}</Button>
        </div>
      </div>
    </div>
  );
}

export default function PCLessons() {
  const { confirm, toast, overlays } = useOverlays();
  const [tab, setTab] = useState<"pg" | "cls" | "tt">("pg");

  /* 프로그램 상태 */
  const [programs, setPrograms] = useState<ProgramRow[]>(PROGRAMS.map((p) => ({ ...p })));
  const [curId, setCurId] = useState(PROGRAMS[0].id);
  const cur = programs.find((p) => p.id === curId) ?? programs[0];
  const [pgModal, setPgModal] = useState<null | { mode: "new" | "edit" | "copy" }>(null);

  function savePg(p: ProgramRow, mode: "new" | "edit" | "copy") {
    if (mode === "edit") {
      setPrograms((list) => list.map((x) => (x.id === p.id ? p : x)));
      toast(p.nm + " 수정 저장 — 새 반·수업부터 적용");
    } else {
      setPrograms((list) => [...list, p]);
      setCurId(p.id);
      toast(p.nm + (mode === "copy" ? " 복제본" : "") + " 생성 — 상세가 저장됐어요");
    }
    setPgModal(null);
  }
  function deactivate() {
    if (cur.st === "비활성") { toast("이미 비활성 상태예요"); return; }
    confirm({
      title: cur.nm + " 프로그램을 비활성화할까요?",
      rows: [["운영 반", cur.cls], ["재원 원생", cur.kids], ["신규 모집", "중단"], ["기존 반·수업", "유지 — 종료일까지 정상 운영"]],
      warn: "비활성화해도 진행 중인 반·청구·리포트는 바뀌지 않아요. 신규 모집과 반 생성만 중단됩니다.",
      label: "비활성화",
      onConfirm: () => { setPrograms((list) => list.map((x) => (x.id === cur.id ? { ...x, st: "비활성" } : x))); toast(cur.nm + " 비활성화 — 신규 모집 중단, 기존 반 유지"); },
    });
  }

  /* 반 관리 상태 */
  const [classesOp, setClassesOp] = useState<ClsRow[]>(CLASSES_OP.map((c) => ({ ...c })));
  const [cf, setCf] = useState({ name: "플레이2 금토반", prog: "플레이2", period: "12/1 ~ 2/28", days: "금·토", time: "15:00~16:00", room: "본관 2층", coach: "이창진", cap: "12명" });
  const setCF = (k: keyof typeof cf, v: string) => setCf((s) => ({ ...s, [k]: v }));
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState(false);
  const [savedCls, setSavedCls] = useState(false);
  function runCheck() {
    setChecking(true);
    window.setTimeout(() => { setChecking(false); setChecked(true); const hit = dayOverlap(cf.days, COACH_BUSY[cf.coach] || ""); toast(hit ? "검증됨 — 코치 요일 겹침 검토 필요 · 예상 24회" : "검증 완료 — 충돌 없음 · 예상 24회"); }, 700);
  }
  function saveCls() {
    if (!checked) { toast("저장 전 검증을 먼저 눌러주세요"); return; }
    confirm({
      title: "반을 만들까요?",
      rows: [["반", cf.name], ["기간 · 요일", cf.period + " · " + cf.days + " " + cf.time], ["강의실 · 코치", cf.room + " · " + cf.coach], ["예상 청구 회차", "24회 (휴무 2회 반영)"], ["Session 생성", "날짜별 실제 수업 24개 자동 생성"]],
      warn: "반이 생성되면 코치 앱에 담당 수업이 표시되고, 시간표·청구 회차가 이 Session 기준으로 연결돼요.",
      label: "반 만들기",
      onConfirm: () => { setClassesOp((l) => [...l, { nm: cf.name, prog: cf.prog, time: cf.days + " " + cf.time, room: cf.room, coach: cf.coach, cap: "0 / " + (cf.cap.replace(/[^0-9]/g, "") || "12") + " · 모집 중" }]); setSavedCls(true); toast(cf.name + " 생성 — 코치 앱·시간표에 반영"); },
    });
  }
  const coachHit = dayOverlap(cf.days, COACH_BUSY[cf.coach] || "");

  /* 시간표 상태 */
  const [ttView, setTtView] = useState<"week" | "month">("week");
  const [ttY, setTtY] = useState(2025);
  const [ttM, setTtM] = useState(11);
  const [ttDay, setTtDay] = useState<string | null>(null);
  const [ttCancelled, setTtCancelled] = useState(false);
  function cancelDemo() {
    confirm({
      title: "시간표를 변경할까요?",
      rows: [["대상 반", "축구 화금반"], ["변경일", "11월 14일 (금)"], ["변경", "정상 수업 → 학원 사정 취소"], ["영향 원생", "16명"], ["알림 수신 보호자", "15명"], ["담당 코치", "이창진"], ["예정 청구 회차", "24회 → 23회"], ["이미 확정된 청구서", "16건"]],
      warn: "이미 확정된 청구서는 직접 수정되지 않아요 — 수정 청구 발행 또는 다음 수납 기간 조정으로 기록됩니다. 취소된 수업은 원생별 보강 건으로 생성돼요.",
      label: "검토 후 변경",
      onConfirm: () => { setTtCancelled(true); toast("11/14 취소 — 영향 기록 · 수정 청구로 처리 예정"); },
    });
  }
  const monthDays = new Date(ttY, ttM, 0).getDate();
  const firstDow = new Date(ttY, ttM - 1, 1).getDay();
  function daySessions(day: number) {
    const w = new Date(ttY, ttM - 1, day).getDay();
    let s = (TT_RECUR[w] || []).map((c) => ({ cls: c, st: "cf", lb: "확정" }));
    const exc = TT_EXC[ttM + "/" + day];
    if (exc) { s = s.filter((x) => x.cls !== exc.cls); s.push({ cls: exc.cls, st: exc.st, lb: exc.lb }); }
    return s;
  }

  return (
    <PCShell title="수업 관리">
      <div className="text-[12.5px] text-ink3 font-medium">프로그램 · 반 · 시간표 — 운영의 기준 데이터를 여기서 만들어요 (PC = 설계·대량 작업 / 모바일 = 확인·승인)</div>
      <div className="flex gap-2">
        {(["pg", "cls", "tt"] as const).map((t) => (
          <FilterChip key={t} active={tab === t} onClick={() => setTab(t)}>{t === "pg" ? "프로그램" : t === "cls" ? "반 관리" : "시간표"}</FilterChip>
        ))}
      </div>

      {/* ── 탭1 · 프로그램 ── */}
      {tab === "pg" && (
        <>
          <Panel title="프로그램 목록" hnote="행을 누르면 아래에 상세 설정">
            <table className="w-full text-[13px]">
              <thead><tr className="text-ink3 text-[11px] border-b border-line text-left"><th className="font-bold px-2.5 py-2">프로그램</th><th className="font-bold py-2">부문</th><th className="font-bold py-2">대상</th><th className="font-bold py-2">커리큘럼</th><th className="font-bold py-2">운영 반</th><th className="font-bold py-2">원생</th><th className="font-bold py-2">상태</th></tr></thead>
              <tbody>
                {programs.map((p) => (
                  <tr key={p.id} tabIndex={0} role="button" onClick={() => setCurId(p.id)} className={`border-b border-line2 last:border-0 cursor-pointer hover:bg-fill ${p.id === curId ? "bg-accent-weak" : ""}`}>
                    <td className="px-2.5 py-2.5 font-bold text-ink">{p.nm}</td>
                    <td className="py-2.5 text-ink2">{p.div}</td>
                    <td className="py-2.5 text-ink2">{p.age}</td>
                    <td className="py-2.5 text-ink2">{p.cur}</td>
                    <td className="py-2.5 text-ink2">{p.cls}</td>
                    <td className="py-2.5 text-ink2">{p.kids}</td>
                    <td className="py-2.5"><Pill kind={pgPill(p.st)}>{p.st}</Pill></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex gap-2 mt-3 flex-wrap">
              <ActBtn onClick={() => setPgModal({ mode: "new" })}>새 프로그램 만들기</ActBtn>
              <ActBtn soft onClick={() => setPgModal({ mode: "edit" })}>수정</ActBtn>
              <ActBtn soft onClick={() => setPgModal({ mode: "copy" })}>복제</ActBtn>
              <ActBtn soft onClick={deactivate}>비활성화</ActBtn>
            </div>
          </Panel>

          <Panel title={<>프로그램 상세 설정 — <span className="text-brand">{cur.nm}</span></>} hnote={cur.st}>
            <div className="grid grid-cols-2 gap-x-6">
              <div>
                <RL label="부문 · 종목" amount={cur.div + " · " + cur.sport} />
                <RL label="대상 연령·레벨" amount={cur.age} />
                <RL label="공개·모집 상태" amount={cur.st} />
                <RL label="기본 수업 시간" amount={cur.time} />
                <RL label="기본 회차 · 정원" sub="반 생성 시 기본값으로 상속" amount={cur.cur.split(" · ")[0] + " · " + cur.cap} />
                <RL label="최소 운영 인원" amount={cur.min} />
              </div>
              <div>
                <RL label="기본 수강료" sub="할인은 MAX 규칙 · 상한 20%" amount={cur.fee} />
                <RL label="차량비" amount={cur.veh} />
                <RL label="중간입회" amount={cur.mid} />
                <RL label="커리큘럼 버전" sub="완료된 수업은 당시 버전 유지" amount={cur.cur} />
                <RL label="리포트 항목" amount={cur.rep} />
                <RL label="코치 편집 권한" sub={cur.permd} amount={cur.perm} tone="accent" />
              </div>
            </div>
            <Note inPanel icon={<IconCheck size={16} />}><b className="text-ink font-bold">커리큘럼은 버전으로 관리</b> — 수정해도 이미 완료된 수업·발송된 리포트는 당시 버전 그대로 유지돼요. 코치 앱의 활동 라이브러리는 하드코딩이 아니라 <b className="text-ink font-bold">프로그램·커리큘럼 버전 기준으로 조회</b>됩니다.</Note>
          </Panel>
          <div className="bg-fill rounded-xl px-3.5 py-3 text-[11.5px] font-semibold text-ink2 leading-relaxed">
            데이터 계층 — 학원 › 부문 › <b className="text-brand">프로그램</b> › 커리큘럼 버전 › 반 › 시간표 규칙 › 실제 수업(Session) › 활동 기록. 담당 프로그램·반 배정은 <b className="text-brand">원장/권한 있는 관리자만</b> 할 수 있어요 — 코치는 배정받은 프로그램 안에서 허용된 활동만 선택합니다.
          </div>
        </>
      )}

      {/* ── 탭2 · 반 관리 ── */}
      {tab === "cls" && (
        <div className="grid grid-cols-2 gap-3 items-start">
          <Panel title="운영 중인 반" hnote={`${classesOp.length}개 반`}>
            <table className="w-full text-[13px]">
              <thead><tr className="text-ink3 text-[11px] border-b border-line text-left"><th className="font-bold px-2.5 py-2">반</th><th className="font-bold py-2">프로그램</th><th className="font-bold py-2">요일·시간</th><th className="font-bold py-2">강의실</th><th className="font-bold py-2">코치</th><th className="font-bold py-2">정원</th></tr></thead>
              <tbody>
                {classesOp.map((c, i) => (
                  <tr key={i} className="border-b border-line2 last:border-0">
                    <td className="px-2.5 py-2.5 font-semibold text-ink">{c.nm}</td>
                    <td className="py-2.5 text-ink2">{c.prog}</td>
                    <td className="py-2.5 text-ink2">{c.time}</td>
                    <td className="py-2.5 text-ink2">{c.room}</td>
                    <td className="py-2.5 text-ink2">{c.coach}</td>
                    <td className="py-2.5 text-ink2">{c.cap}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>

          <Panel title="반 만들기" hnote="저장 전 자동 검증">
            <Field label="반 이름 *"><input className={INPUT} value={cf.name} onChange={(e) => setCF("name", e.target.value)} /></Field>
            <Field label="프로그램 (커리큘럼·수강료·회차 상속)"><select className={INPUT} value={cf.prog} onChange={(e) => setCF("prog", e.target.value)}>{programs.map((p) => <option key={p.id}>{p.nm}</option>)}</select></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="운영 기간"><input className={INPUT} value={cf.period} onChange={(e) => setCF("period", e.target.value)} /></Field>
              <Field label="반복 요일"><input className={INPUT} value={cf.days} onChange={(e) => setCF("days", e.target.value)} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="시작·종료 시각"><input className={INPUT} value={cf.time} onChange={(e) => setCF("time", e.target.value)} /></Field>
              <Field label="강의실"><input className={INPUT} value={cf.room} onChange={(e) => setCF("room", e.target.value)} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="담당 코치 (원장/관리자만 배정)"><select className={INPUT} value={cf.coach} onChange={(e) => { setCF("coach", e.target.value); setChecked(false); }}>{["김선재", "이창진", "이코치", "박코치"].map((c) => <option key={c}>{c}</option>)}</select></Field>
              <Field label="정원"><input className={INPUT} value={cf.cap} onChange={(e) => setCF("cap", e.target.value)} /></Field>
            </div>
            <Button variant="line" full className="mt-3 h-11 text-[12.5px]" onClick={runCheck} disabled={checking}>{checking ? <><Spinner />검증 중...</> : checked ? "재검증" : "저장 전 검증"}</Button>
            {checked && (
              <div className="mt-3 border-t border-line2 pt-1">
                <RL label="코치 일정" sub={`${cf.coach} · 기존 담당 ${COACH_BUSY[cf.coach] || "없음"}`} amount={coachHit ? "⚠ 요일 겹침 — 검토 필요" : "✓ 겹침 없음"} tone={coachHit ? "warn" : "accent"} />
                <RL label="강의실" sub={`${cf.room} · ${cf.days} ${cf.time}`} amount="✓ 사용 가능" tone="accent" />
                <RL label="휴무일" sub={`${cf.period} 내 공휴일`} amount="⚠ 2회 겹침 (회차 차감)" tone="warn" />
                <RL label="차량 운행" sub={`${cf.days} 노선`} amount="✓ 충돌 없음" tone="accent" />
                <RL label="예상 청구 회차" sub={`기간 내 ${cf.days} − 휴무 2회`} amount="24회" total />
              </div>
            )}
            <Button variant="primary" full className="mt-3" onClick={saveCls} disabled={!checked || savedCls}>{savedCls ? "반 생성 완료 · Session 24개 생성됨" : "이 설정으로 반 만들기"}</Button>
          </Panel>
        </div>
      )}

      {/* ── 탭3 · 시간표 ── */}
      {tab === "tt" && (
        <>
          <Panel title={<>시간표 <small className="font-medium text-ink3 ml-1">규칙(반복) → 날짜별 Session 자동 생성</small></>} hnote={<span className="inline-flex gap-1.5"><FilterChip active={ttView === "week"} onClick={() => setTtView("week")}>주간</FilterChip><FilterChip active={ttView === "month"} onClick={() => setTtView("month")}>월간</FilterChip></span>}>
            {ttView === "week" ? (
              <div className="grid grid-cols-6 gap-2">
                {WEEK.map((d) => (
                  <div key={d.day}>
                    <div className="text-[11px] font-extrabold text-ink2 text-center py-1 border-b border-line2 mb-1.5">{d.day}</div>
                    {d.sess.map((s, i) => {
                      const bc = s.tone === "active" ? "var(--warn)" : s.tone === "off" ? "var(--ink-3)" : "var(--accent)";
                      return (
                        <div key={i} className={`border border-line border-l-[3px] rounded-lg px-2.5 py-2 text-[11px] font-bold mb-1.5 leading-tight ${s.tone === "off" ? "bg-line2 text-ink3" : "bg-fill text-ink"}`} style={{ borderLeftColor: bc }}>
                          <span className={s.tone === "off" ? "line-through" : ""}>{s.name}</span>
                          <small className="block font-medium text-ink3 text-[10px]">{s.sub}</small>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <ActBtn soft onClick={() => { if (ttM <= 1) { setTtM(12); setTtY(ttY - 1); } else setTtM(ttM - 1); setTtDay(null); }}>‹ 이전</ActBtn>
                  <div className="font-extrabold text-[14px]">{ttY}년 {ttM}월</div>
                  <ActBtn soft onClick={() => { if (ttM >= 12) { setTtM(1); setTtY(ttY + 1); } else setTtM(ttM + 1); setTtDay(null); }}>다음 ›</ActBtn>
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {TT_DOW.map((d) => <div key={d} className="text-center text-[11px] font-bold text-ink3 py-0.5">{d}</div>)}
                  {Array.from({ length: firstDow }).map((_, i) => <div key={"e" + i} />)}
                  {Array.from({ length: monthDays }).map((_, i) => {
                    const day = i + 1;
                    const sess = daySessions(day);
                    return (
                      <button key={day} onClick={() => setTtDay(ttM + "/" + day)} className="min-h-[46px] border border-line rounded-lg px-1.5 py-1 bg-surface text-left hover:bg-fill">
                        <div className="text-[11px] font-bold text-ink2">{day}</div>
                        <div className="flex flex-wrap gap-0.5 mt-1">
                          {sess.map((s, k) => <span key={k} className="w-1.5 h-1.5 rounded-full" style={{ background: toneVar(TT_TONE[s.st]) }} />)}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="flex gap-3 text-[11px] text-ink3 mt-2 flex-wrap">
                  {([["확정", "cf"], ["예정", "sc"], ["취소", "cx"], ["추가수업", "ex"]] as const).map(([lb, st]) => (
                    <span key={st} className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: toneVar(TT_TONE[st]) }} />{lb}</span>
                  ))}
                </div>
                <div className="mt-2 px-3 py-2.5 border border-line rounded-lg text-[12px] text-ink2 min-h-[20px]">
                  {ttDay ? (() => {
                    const [, d] = ttDay.split("/"); const sess = daySessions(+d);
                    if (!sess.length) return `${ttDay} — 수업 없음`;
                    return <><b className="text-ink">{ttDay} · Session {sess.length}개</b>{sess.map((s, k) => <div key={k} className="mt-0.5">· {s.cls} — {s.lb || "확정"}</div>)}</>;
                  })() : "날짜를 누르면 그날 Session이 표시돼요."}
                </div>
              </div>
            )}
          </Panel>

          <Panel title="일정 예외 · Session 상태" hnote="공휴일·휴무는 그 반의 수업 요일과 겹칠 때만 회차 차감">
            {TT_EXC_LIST.map((e) => (
              <div key={e.title} className="flex gap-2.5 items-center py-2.5 border-b border-line2">
                <div className="w-[34px] h-[34px] rounded-xl bg-fill text-ink2 grid place-items-center shrink-0"><IconClock size={18} /></div>
                <div className="flex-1 min-w-0"><div className="text-[13px] font-semibold text-ink">{e.title}</div><div className="text-[11px] text-ink3 font-medium">{e.sub}</div></div>
                <Pill kind={e.tone === "accent" ? "ok" : "gray"}>{e.pill}</Pill>
              </div>
            ))}
            <div className="flex gap-2.5 items-center py-2.5 border-b border-line2 last:border-0">
              <div className="w-[34px] h-[34px] rounded-xl bg-fill text-ink2 grid place-items-center shrink-0"><IconClock size={18} /></div>
              <div className="flex-1 min-w-0"><div className="text-[13px] font-semibold text-ink">11/14 (금) 축구 화금반</div><div className="text-[11px] text-ink3 font-medium">{ttCancelled ? "취소됨 · 보호자 15명 알림 · 보강 건 16건 생성 · 수정 청구 예정" : "정상 수업 예정"}</div></div>
              <Pill kind={ttCancelled ? "gray" : "ok"}>{ttCancelled ? "학원 사정 취소" : "예정"}</Pill>
              {!ttCancelled && <ActBtn soft onClick={cancelDemo}>취소 데모</ActBtn>}
            </div>
            <Note inPanel icon={<IconSpark size={16} />}>Session 상태: 예정 · 확정 · 공휴일 취소 · 학원 휴무 취소 · 변경 · 완료. 정규 수업이 취소되면 <b className="text-ink font-bold">원생별 보강 건이 생성</b>되고, 실제 보강은 원장이 학원 방식대로 처리한 뒤 <b className="text-ink font-bold">처리 완료만 기록</b>해요. 시간표를 변경하면 원생·보호자·코치·청구 회차 영향을 먼저 보여주고, <b className="text-ink font-bold">이미 확정된 청구서는 수정 청구로만</b> 처리됩니다.</Note>
          </Panel>
        </>
      )}

      {pgModal && <ProgramModal mode={pgModal.mode} base={pgModal.mode === "new" ? null : cur} onClose={() => setPgModal(null)} onSave={(p) => savePg(p, pgModal.mode)} />}
      {overlays}
    </PCShell>
  );
}
