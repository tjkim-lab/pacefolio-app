"use client";

/* 프로그램 목록 + 새 프로그램 마법사 (PS2 · docs/22 §화면 IA)
   live API 전용 — fixture fallback 금지. 원장이 "직접 만드는" 시작점. */
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PCShell } from "../_shell";
import { Panel, Pill, Note, ActBtn, Spinner, useOverlays } from "../_ui";
import {
  api, useStudioAcademy, StudioGate, Field, inputCls, MODE_LABELS, statusPill,
} from "./_studio";
import type { StudioProgram } from "@pacefolio/api-client";

export default function PCPrograms() {
  const router = useRouter();
  const { toast, overlays } = useOverlays();
  const gate = useStudioAcademy();
  const [programs, setPrograms] = useState<StudioProgram[] | null>(null);
  const [listError, setListError] = useState<string>();
  const [wizardOpen, setWizardOpen] = useState(false);

  const refresh = useCallback(async () => {
    if (!gate.academyId) return;
    try {
      const r = await api.listPrograms(gate.academyId);
      setPrograms(r.programs);
      setListError(undefined);
    } catch (e) {
      setListError(e instanceof Error ? e.message : String(e));
    }
  }, [gate.academyId]);
  useEffect(() => { (async () => { await refresh(); })(); }, [refresh]);

  return (
    <PCShell
      title="프로그램 스튜디오"
      actions={gate.isOwner ? (
        <div className="flex gap-1.5">
          <ActBtn soft onClick={() => router.push("/pc/program-imports")}>CSV 가져오기</ActBtn>
          <ActBtn onClick={() => setWizardOpen((v) => !v)}>{wizardOpen ? "닫기" : "＋ 새 프로그램"}</ActBtn>
        </div>
      ) : undefined}
    >
      <StudioGate state={gate.state} errorMsg={gate.errorMsg}>
        {wizardOpen && gate.academyId && (
          <NewProgramWizard
            academyId={gate.academyId}
            onDone={(programId) => {
              setWizardOpen(false);
              toast("프로그램을 만들었어요. 이제 단계와 커리큘럼을 채워보세요.");
              void refresh();
              router.push(`/pc/programs/${programId}`);
            }}
          />
        )}
        {listError && <Note>목록을 불러오지 못했어요. ({listError})</Note>}
        {!programs && !listError && (
          <div className="flex items-center gap-2 py-10 justify-center text-ink3 text-[13px]"><Spinner /> 프로그램 불러오는 중…</div>
        )}
        {programs && programs.length === 0 && !wizardOpen && (
          <Panel title="아직 만든 프로그램이 없어요">
            <Note inPanel>
              프로그램을 먼저 만들면 단계·활동·커리큘럼을 채울 수 있어요.
              {gate.isOwner ? " 오른쪽 위 ‘새 프로그램’으로 시작해 보세요." : " 원장 계정으로 만들 수 있어요."}
            </Note>
          </Panel>
        )}
        {programs && programs.length > 0 && (
          <div className="grid gap-3">
            {programs.map((p) => (
              <div
                key={p.programId}
                role="button" tabIndex={0}
                className="text-left rounded-xl border border-line bg-surface px-4 py-3.5 hover:border-accent transition cursor-pointer"
                onClick={() => router.push(`/pc/programs/${p.programId}`)}
                onKeyDown={(e) => { if (e.key === "Enter") router.push(`/pc/programs/${p.programId}`); }}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[14px] font-extrabold text-ink">{p.name}</span>
                  {p.targetAgeLabel && <span className="text-[11px] text-ink3 font-bold">{p.targetAgeLabel}</span>}
                  {p.archivedAt && <Pill kind="due">보관됨</Pill>}
                  <span className="flex-1" />
                  {p.versions.map((v) => {
                    const sp = statusPill(v.status);
                    return <Pill key={v.versionId} kind={sp.kind}>{v.versionLabel} · {sp.label}</Pill>;
                  })}
                  {gate.isOwner && (
                    <button
                      className="h-7 px-2.5 rounded-lg text-[11px] font-bold border border-line text-ink2 hover:border-ink3"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!gate.academyId) return;
                        api.duplicateProgram(gate.academyId, p.programId)
                          .then(() => { toast("프로그램을 복제했어요(초안으로)."); void refresh(); })
                          .catch((err2) => toast(`복제하지 못했어요. (${err2 instanceof Error ? err2.message : err2})`));
                      }}
                    >
                      복제
                    </button>
                  )}
                </div>
                <div className="mt-1.5 flex gap-1.5 flex-wrap">
                  {p.modes.map((m) => (
                    <span key={m} className="text-[10.5px] font-bold text-accent bg-accent/10 rounded-md px-2 py-0.5">
                      {MODE_LABELS[m] ?? m}
                    </span>
                  ))}
                  {p.description && <span className="text-[12px] text-ink3">{p.description}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </StudioGate>
      {overlays}
    </PCShell>
  );
}

/* 새 프로그램 마법사 — 기본정보 → 진행 방식(복수) → 생성. 템플릿은 도구일 뿐 고정 규칙 아님 */
function NewProgramWizard({ academyId, onDone }: { academyId: string; onDone: (programId: string) => void }) {
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [desc, setDesc] = useState("");
  const [modes, setModes] = useState<Set<string>>(new Set(["EXPERIENCE"]));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();

  const toggle = (m: string) => setModes((prev) => {
    const n = new Set(prev);
    if (n.has(m)) n.delete(m); else n.add(m);
    return n;
  });

  const submit = async () => {
    if (!name.trim() || modes.size === 0 || busy) return;
    setBusy(true); setErr(undefined);
    try {
      const r = await api.createProgram(academyId, {
        name: name.trim(),
        ...(desc.trim() ? { description: desc.trim() } : {}),
        ...(age.trim() ? { targetAgeLabel: age.trim() } : {}),
        modes: [...modes],
      });
      onDone(r.programId);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <Panel title="새 프로그램" hnote="이름·단계·활동은 나중에 언제든 바꿀 수 있어요" className="mb-3">
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="프로그램 이름">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 우리 학원 유아 체육" />
        </Field>
        <Field label="대상 연령(선택)">
          <input className={inputCls} value={age} onChange={(e) => setAge(e.target.value)} placeholder="예: 6~7세" />
        </Field>
        <div className="md:col-span-2">
          <Field label="한 줄 소개(선택)">
            <input className={inputCls} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="프로그램을 소개하는 한 줄" />
          </Field>
        </div>
      </div>
      <div className="mt-3">
        <div className="text-[11px] font-bold text-ink3 mb-1.5">성장 방식 — 여러 개를 함께 쓸 수 있어요</div>
        <div className="flex gap-1.5 flex-wrap">
          {Object.entries(MODE_LABELS).map(([m, label]) => (
            <button
              key={m}
              className={`h-8 px-3 rounded-lg text-[12px] font-bold border transition ${
                modes.has(m) ? "bg-accent text-white border-accent" : "bg-surface text-ink2 border-line hover:border-ink3"
              }`}
              onClick={() => toggle(m)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {err && <Note inPanel>만들지 못했어요. ({err})</Note>}
      <div className="mt-3 flex justify-end">
        <ActBtn disabled={!name.trim() || modes.size === 0 || busy} onClick={() => void submit()}>
          {busy ? "만드는 중…" : "프로그램 만들기"}
        </ActBtn>
      </div>
    </Panel>
  );
}
