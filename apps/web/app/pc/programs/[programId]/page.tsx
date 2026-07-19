"use client";

/* 프로그램 편집기 (PS2) — 버전(게시·복제) · 단계 · 커리큘럼(구조→회차→활동 배치).
   3단 레이아웃(docs/22): 왼쪽 구조 | 가운데 회차 편성 | 오른쪽 단계·활동 상세.
   불변식 UI 반영: 게시된 버전은 읽기 전용 — 수정하려면 복제해 새 DRAFT. */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { PCShell } from "../../_shell";
import { Panel, Pill, Note, ActBtn, Spinner, useOverlays } from "../../_ui";
import {
  api, useStudioAcademy, StudioGate, Field, inputCls, statusPill,
} from "../_studio";
import type { StudioProgram, StudioVersionDetail, StudioActivity } from "@pacefolio/api-client";

export default function PCProgramEditor() {
  const params = useParams<{ programId: string }>();
  const programId = params.programId;
  const gate = useStudioAcademy();
  const { confirm, toast, overlays } = useOverlays();

  const [program, setProgram] = useState<StudioProgram | null>(null);
  const [versionId, setVersionId] = useState<string>();
  const [detail, setDetail] = useState<StudioVersionDetail | null>(null);
  const [library, setLibrary] = useState<StudioActivity[]>([]);
  const [selSession, setSelSession] = useState<string>();
  const [err, setErr] = useState<string>();
  const [busy, setBusy] = useState(false);

  const refreshProgram = useCallback(async () => {
    if (!gate.academyId) return;
    try {
      const r = await api.listPrograms(gate.academyId);
      const p = r.programs.find((x) => x.programId === programId) ?? null;
      setProgram(p);
      if (p && !versionId) {
        const draft = p.versions.find((v) => v.status === "DRAFT") ?? p.versions[0];
        if (draft) setVersionId(draft.versionId);
      }
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, [gate.academyId, programId, versionId]);

  const refreshDetail = useCallback(async () => {
    if (!gate.academyId || !versionId) return;
    try {
      const d = await api.getProgramVersion(gate.academyId, versionId);
      setDetail(d);
      setErr(undefined);
      if (!selSession && d.sessions[0]) setSelSession(d.sessions[0].curriculumSessionId);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, [gate.academyId, versionId, selSession]);

  const refreshLibrary = useCallback(async () => {
    if (!gate.academyId) return;
    try { setLibrary((await api.listStudioActivities(gate.academyId)).activities); } catch { /* 라이브러리는 목록 실패해도 편집기 유지 */ }
  }, [gate.academyId]);

  useEffect(() => { (async () => { await Promise.all([refreshProgram(), refreshLibrary()]); })(); }, [refreshProgram, refreshLibrary]);
  useEffect(() => { (async () => { await refreshDetail(); })(); }, [refreshDetail]);

  const editable = detail?.status === "DRAFT" && gate.isOwner;
  const session = useMemo(
    () => detail?.sessions.find((x) => x.curriculumSessionId === selSession),
    [detail, selSession],
  );

  const publish = () => {
    if (!gate.academyId || !versionId) return;
    const academyId = gate.academyId;
    confirm({
      title: "이 버전을 게시할까요?",
      sub: "게시하면 직접 수정할 수 없어요. 바꾸려면 복제해서 새 버전을 만들면 돼요.",
      label: "게시하기",
      onConfirm: () => {
        setBusy(true);
        api.publishProgramVersion(academyId, versionId)
          .then(async () => {
            toast("게시했어요. 이제 반에 적용할 준비가 됐어요.");
            await Promise.all([refreshProgram(), refreshDetail()]);
          })
          .catch((e) => toast(`게시하지 못했어요. (${e instanceof Error ? e.message : e})`))
          .finally(() => setBusy(false));
      },
    });
  };

  const clone = async () => {
    if (!gate.academyId || !versionId || !program) return;
    setBusy(true);
    try {
      const label = `v${program.versions.length + 1}`;
      const r = await api.createProgramVersion(gate.academyId, programId, {
        versionLabel: label, basedOnVersionId: versionId,
      });
      toast(`${label} 초안을 만들었어요(기존 내용 복사).`);
      setVersionId(r.versionId);
      setDetail(null); setSelSession(undefined);
      await refreshProgram();
    } catch (e) { toast(`복제하지 못했어요. (${e instanceof Error ? e.message : e})`); }
    setBusy(false);
  };

  /* 회차 활동 편성 — 세트 교체 API 로 저장 */
  const saveSessionActivities = async (activityIds: string[]) => {
    if (!gate.academyId || !session) return;
    try {
      await api.setCurriculumSessionActivities(gate.academyId, session.curriculumSessionId,
        activityIds.map((activityId) => ({ activityId })));
      await refreshDetail();
    } catch (e) { toast(`저장하지 못했어요. (${e instanceof Error ? e.message : e})`); }
  };

  /* 배치용: 현재 회차의 revisionId → activityId 역매핑(라이브러리 현재 개정판 기준) */
  const revToAct = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of library) if (a.currentRevisionId) m.set(a.currentRevisionId, a.activityId);
    return m;
  }, [library]);
  const sessionActIds = useMemo(
    () => (session?.activities ?? []).map((x) => revToAct.get(x.activityRevisionId)).filter((x): x is string => !!x),
    [session, revToAct],
  );

  return (
    <PCShell
      title={program ? `프로그램 · ${program.name}` : "프로그램"}
      actions={detail && gate.isOwner ? (
        <div className="flex gap-1.5">
          {detail.status === "DRAFT" && <ActBtn disabled={busy} onClick={publish}>게시하기</ActBtn>}
          <ActBtn soft disabled={busy} onClick={() => void clone()}>복제해 새 버전</ActBtn>
        </div>
      ) : undefined}
    >
      <StudioGate state={gate.state} errorMsg={gate.errorMsg}>
        {err && <Note>불러오지 못했어요. ({err})</Note>}
        {!program && !err && <div className="flex items-center gap-2 py-10 justify-center text-ink3 text-[13px]"><Spinner /> 불러오는 중…</div>}
        {program && (
          <>
            <div className="flex items-center gap-1.5 flex-wrap mb-3">
              {program.versions.map((v) => {
                const sp = statusPill(v.status);
                return (
                  <button
                    key={v.versionId}
                    onClick={() => { setVersionId(v.versionId); setDetail(null); setSelSession(undefined); }}
                    className={`h-8 px-3 rounded-lg text-[12px] font-bold border transition ${
                      v.versionId === versionId ? "bg-ink text-white border-ink" : "bg-surface text-ink2 border-line hover:border-ink3"
                    }`}
                  >
                    {v.versionLabel} <span className="opacity-70">· {sp.label}</span>
                  </button>
                );
              })}
              {detail && !editable && (
                <Pill kind={detail.status === "PUBLISHED" ? "ok" : "wait"}>
                  {detail.status === "PUBLISHED" ? "게시됨 — 읽기 전용(복제로 수정)" : "읽기 전용"}
                </Pill>
              )}
            </div>
            {detail?.status === "PUBLISHED" && gate.isOwner && (
              <ApplyToClassPane academyId={gate.academyId!} versionId={detail.versionId}
                onDone={(m) => toast(m)} />
            )}
            {!detail && <div className="flex items-center gap-2 py-10 justify-center text-ink3 text-[13px]"><Spinner /> 버전 불러오는 중…</div>}
            {detail && (
              <div className="grid gap-3 lg:grid-cols-[260px_1fr_280px] items-start">
                <StructurePane
                  detail={detail} editable={!!editable} academyId={gate.academyId!}
                  versionId={detail.versionId} selSession={selSession}
                  onSelect={setSelSession} onChanged={() => void refreshDetail()}
                />
                <SessionPane
                  session={session} editable={!!editable} library={library}
                  sessionActIds={sessionActIds} onSave={(ids) => void saveSessionActivities(ids)}
                />
                <LevelsPane
                  detail={detail} editable={!!editable} academyId={gate.academyId!}
                  onChanged={() => void refreshDetail()}
                />
              </div>
            )}
          </>
        )}
      </StudioGate>
      {overlays}
    </PCShell>
  );
}

/* ── 왼쪽: 구조(분기·시즌) + 회차 ── */
function StructurePane({ detail, editable, academyId, versionId, selSession, onSelect, onChanged }: {
  detail: StudioVersionDetail; editable: boolean; academyId: string; versionId: string;
  selSession?: string; onSelect: (id: string) => void; onChanged: () => void;
}) {
  const [secName, setSecName] = useState("");
  const [weeks, setWeeks] = useState(12); // 기본값일 뿐 — 제약 아님(자유 변경)
  const [busy, setBusy] = useState(false);

  const addSectionWithWeeks = async () => {
    if (!secName.trim() || busy) return;
    setBusy(true);
    try {
      const sec = await api.createCurriculumSection(academyId, versionId, {
        sectionType: "QUARTER", name: secName.trim(), sortOrder: detail.sections.length,
      });
      const startSeq = detail.sessions.length;
      for (let w = 1; w <= weeks; w++) {
        await api.createCurriculumSession(academyId, versionId, {
          sectionId: sec.sectionId, name: `${secName.trim()} ${w}주 차`, sequence: startSeq + w,
        });
      }
      setSecName("");
      onChanged();
    } catch { /* onChanged 후 상태로 표시 */ }
    setBusy(false);
  };

  return (
    <Panel title="커리큘럼 구조" hnote={editable ? "구조를 만들면 주차가 함께 생겨요" : undefined}>
      {detail.sections.length === 0 && (
        <Note inPanel>아직 구조가 없어요. 분기(예: 1분기)를 만들면 주차가 함께 생겨요.</Note>
      )}
      {detail.sections.map((sec) => (
        <div key={sec.sectionId} className="mt-2">
          <div className="text-[12px] font-extrabold text-ink">{sec.name}</div>
          <div className="mt-1 grid gap-1">
            {detail.sessions.filter((se) => se.sectionId === sec.sectionId).map((se) => (
              <button
                key={se.curriculumSessionId}
                onClick={() => onSelect(se.curriculumSessionId)}
                className={`text-left px-2.5 py-1.5 rounded-lg text-[12px] font-bold border transition ${
                  se.curriculumSessionId === selSession
                    ? "bg-accent/10 border-accent text-accent"
                    : "bg-surface border-line text-ink2 hover:border-ink3"
                }`}
              >
                {se.name}
                <span className="float-right text-[10.5px] opacity-70">{se.activities.length}개 활동</span>
              </button>
            ))}
          </div>
        </div>
      ))}
      {editable && (
        <div className="mt-3 border-t border-line pt-3 grid gap-2">
          <Field label="새 구조 이름">
            <input className={inputCls} value={secName} onChange={(e) => setSecName(e.target.value)} placeholder="예: 1분기" />
          </Field>
          <Field label="주차 수(자유 변경)">
            <input className={inputCls} type="number" min={1} max={53} value={weeks}
              onChange={(e) => setWeeks(Math.max(1, Math.min(53, Number(e.target.value) || 1)))} />
          </Field>
          <ActBtn disabled={!secName.trim() || busy} onClick={() => void addSectionWithWeeks()}>
            {busy ? "만드는 중…" : `구조 + ${weeks}주 차 만들기`}
          </ActBtn>
        </div>
      )}
    </Panel>
  );
}

/* ── 가운데: 선택한 회차의 활동 편성 ── */
function SessionPane({ session, editable, library, sessionActIds, onSave }: {
  session?: StudioVersionDetail["sessions"][number]; editable: boolean;
  library: StudioActivity[]; sessionActIds: string[]; onSave: (ids: string[]) => void;
}) {
  const [q, setQ] = useState("");
  if (!session) {
    return <Panel title="회차 편성"><Note inPanel>왼쪽에서 회차(주차)를 선택하면 활동을 배치할 수 있어요.</Note></Panel>;
  }
  const placed = new Set(sessionActIds);
  const candidates = library.filter((a) =>
    a.status === "ACTIVE" && !placed.has(a.activityId) && (!q || a.name.includes(q)));
  return (
    <Panel title={`회차 편성 · ${session.name}`} hnote={editable ? "배치는 바로 저장돼요" : "읽기 전용"}>
      <div className="grid gap-1.5">
        {session.activities.length === 0 && <Note inPanel>아직 배치된 활동이 없어요.</Note>}
        {session.activities.map((a, i) => (
          <div key={a.activityRevisionId} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-fill">
            <span className="text-[11px] font-extrabold text-ink3 w-4">{i + 1}</span>
            <span className="text-[13px] font-bold text-ink flex-1">{a.name}</span>
            {a.recommendedMinutes && <span className="text-[11px] text-ink3">{a.recommendedMinutes}분</span>}
            {editable && (
              <button
                className="text-[11px] font-bold text-ink3 hover:text-ink"
                onClick={() => onSave(sessionActIds.filter((_, j) => j !== i))}
              >
                빼기
              </button>
            )}
          </div>
        ))}
      </div>
      {editable && (
        <div className="mt-3 border-t border-line pt-3">
          <input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="활동 검색해서 추가…" />
          <div className="mt-2 grid gap-1 max-h-56 overflow-auto">
            {candidates.slice(0, 20).map((a) => (
              <button
                key={a.activityId}
                className="text-left px-3 py-1.5 rounded-lg text-[12px] font-bold text-ink2 hover:bg-fill flex items-center gap-2"
                onClick={() => onSave([...sessionActIds, a.activityId])}
              >
                ＋ {a.name}
                {a.difficultyLabel && <span className="text-[10.5px] text-ink3 font-medium">{a.difficultyLabel}</span>}
              </button>
            ))}
            {candidates.length === 0 && (
              <div className="text-[12px] text-ink3 px-1 py-2">
                추가할 활동이 없어요. <a href="/pc/activities" className="text-accent font-bold">활동 라이브러리</a>에서 먼저 만들어 주세요.
              </div>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}

/* ── 오른쪽: 단계(레벨) — 학원이 직접 만드는 데이터 ── */
function LevelsPane({ detail, editable, academyId, onChanged }: {
  detail: StudioVersionDetail; editable: boolean; academyId: string; onChanged: () => void;
}) {
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>();

  const add = async () => {
    if (!name.trim() || busy) return;
    setBusy(true); setMsg(undefined);
    try {
      await api.createProgramLevel(academyId, detail.versionId, {
        name: name.trim(), ...(age.trim() ? { targetAgeLabel: age.trim() } : {}),
        sortOrder: detail.levels.length,
      });
      setName(""); setAge("");
      onChanged();
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };

  return (
    <Panel title="단계" hnote="단계 이름은 자유예요 — 우리 학원의 말로">
      {detail.levels.length === 0 && <Note inPanel>아직 단계가 없어요. 예: 입문·초급, 1단계…</Note>}
      <div className="grid gap-1.5">
        {detail.levels.map((lv) => (
          <div key={lv.levelId} className="px-3 py-2 rounded-lg bg-fill flex items-center gap-2">
            <span className="text-[13px] font-bold text-ink flex-1">{lv.name}</span>
            {lv.targetAgeLabel && <span className="text-[11px] text-ink3">{lv.targetAgeLabel}</span>}
          </div>
        ))}
      </div>
      {editable && (
        <div className="mt-3 border-t border-line pt-3 grid gap-2">
          <Field label="단계 이름">
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 입문" />
          </Field>
          <Field label="대상 연령(선택)">
            <input className={inputCls} value={age} onChange={(e) => setAge(e.target.value)} placeholder="예: 6~7세" />
          </Field>
          {msg && <Note inPanel>추가하지 못했어요. ({msg})</Note>}
          <ActBtn soft disabled={!name.trim() || busy} onClick={() => void add()}>단계 추가</ActBtn>
        </div>
      )}
    </Panel>
  );
}

/* ── 반에 적용(PS7 준비) — 게시된 버전만·중복 적용은 서버가 거부 ── */
function ApplyToClassPane({ academyId, versionId, onDone }: {
  academyId: string; versionId: string; onDone: (msg: string) => void;
}) {
  const [classes, setClasses] = useState<{ classId: string; name: string }[]>([]);
  const [sel, setSel] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    api.listClasses(academyId).then((r) => {
      if (alive) setClasses(r.classes.map((c) => ({ classId: c.classId, name: c.name })));
    }).catch(() => {});
    return () => { alive = false; };
  }, [academyId]);
  const apply = async () => {
    if (!sel || busy) return;
    setBusy(true);
    try {
      await api.assignProgramToClass(academyId, sel, {
        programVersionId: versionId,
        effectiveFrom: new Date().toISOString().slice(0, 10),
      });
      onDone("반에 적용했어요. 코치 화면에 오늘 수업 계획이 떠요.");
      setSel("");
    } catch (e) { onDone(`적용하지 못했어요. (${e instanceof Error ? e.message : e})`); }
    setBusy(false);
  };
  return (
    <div className="mb-3 rounded-xl border border-line bg-surface px-4 py-3 flex items-center gap-2 flex-wrap">
      <span className="text-[12.5px] font-extrabold text-ink">이 버전을 반에 적용</span>
      <select className={inputCls + " !w-56 !h-8"} value={sel} onChange={(e) => setSel(e.target.value)}>
        <option value="">— 반 선택 —</option>
        {classes.map((c) => <option key={c.classId} value={c.classId}>{c.name}</option>)}
      </select>
      <ActBtn soft disabled={!sel || busy} onClick={() => void apply()}>
        {busy ? "적용 중…" : "적용"}
      </ActBtn>
    </div>
  );
}
