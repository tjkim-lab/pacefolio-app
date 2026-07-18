"use client";

/* 성장 영역 관리 (PS2 · docs/21 결정 3) — 테넌트 소유 데이터.
   대분류(예: 이동·안정·조작) → 소분류(활동 태그 대상). 삭제 대신 비활성. */
import { useCallback, useEffect, useState } from "react";
import { PCShell } from "../_shell";
import { Panel, Note, ActBtn, Spinner, useOverlays } from "../_ui";
import { api, useStudioAcademy, StudioGate, Field, inputCls } from "../programs/_studio";
import type { StudioGrowthDomain } from "@pacefolio/api-client";

export default function PCGrowthDomains() {
  const gate = useStudioAcademy();
  const { toast, overlays } = useOverlays();
  const [domains, setDomains] = useState<StudioGrowthDomain[] | null>(null);
  const [err, setErr] = useState<string>();
  const [name, setName] = useState("");
  const [parent, setParent] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!gate.academyId) return;
    try {
      setDomains((await api.listGrowthDomains(gate.academyId)).domains);
      setErr(undefined);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, [gate.academyId]);
  useEffect(() => { (async () => { await refresh(); })(); }, [refresh]);

  const add = async () => {
    if (!gate.academyId || !name.trim() || busy) return;
    setBusy(true);
    try {
      await api.createGrowthDomain(gate.academyId, {
        name: name.trim(),
        ...(parent ? { parentId: parent } : {}),
        sortOrder: domains?.length ?? 0,
      });
      setName("");
      await refresh();
      toast("성장영역을 추가했어요.");
    } catch (e) { toast(`추가하지 못했어요. (${e instanceof Error ? e.message : e})`); }
    setBusy(false);
  };

  const roots = (domains ?? []).filter((d) => !d.parentId);
  const childrenOf = (id: string) => (domains ?? []).filter((d) => d.parentId === id);

  return (
    <PCShell title="성장 영역">
      <StudioGate state={gate.state} errorMsg={gate.errorMsg}>
        {err && <Note>불러오지 못했어요. ({err})</Note>}
        {!domains && !err && <div className="flex items-center gap-2 py-10 justify-center text-ink3 text-[13px]"><Spinner /> 불러오는 중…</div>}
        {domains && (
          <div className="grid gap-3 lg:grid-cols-[1fr_320px] items-start">
            <Panel title="우리 학원의 성장 영역" hnote="영역 이름은 자유예요 — 우리 학원의 말로">
              {roots.length === 0 && (
                <Note inPanel>
                  아직 성장영역이 없어요. 먼저 대분류(예: 이동·안정·조작)를 만들고, 그 아래
                  소분류(예: 달리기·균형 잡기)를 만들면 활동에 태그할 수 있어요.
                </Note>
              )}
              {roots.map((r) => (
                <div key={r.domainId} className="mt-2">
                  <div className="text-[12.5px] font-extrabold text-ink">{r.name}</div>
                  <div className="mt-1 flex gap-1.5 flex-wrap">
                    {childrenOf(r.domainId).map((c) => (
                      <span key={c.domainId}
                        className={`text-[11.5px] font-bold rounded-lg px-2.5 py-1 ${c.active ? "bg-fill text-ink2" : "bg-fill text-ink3 line-through"}`}>
                        {c.name}
                      </span>
                    ))}
                    {childrenOf(r.domainId).length === 0 && (
                      <span className="text-[11.5px] text-ink3">소분류가 아직 없어요</span>
                    )}
                  </div>
                </div>
              ))}
            </Panel>
            {gate.isOwner && (
              <Panel title="영역 추가">
                <div className="grid gap-2.5">
                  <Field label="이름">
                    <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 균형 잡기" />
                  </Field>
                  <Field label="상위 분류(비우면 대분류로)">
                    <select className={inputCls} value={parent} onChange={(e) => setParent(e.target.value)}>
                      <option value="">— 대분류로 만들기 —</option>
                      {roots.map((r) => <option key={r.domainId} value={r.domainId}>{r.name}</option>)}
                    </select>
                  </Field>
                  <ActBtn disabled={!name.trim() || busy} onClick={() => void add()}>
                    {busy ? "추가 중…" : "추가"}
                  </ActBtn>
                </div>
              </Panel>
            )}
          </div>
        )}
      </StudioGate>
      {overlays}
    </PCShell>
  );
}
