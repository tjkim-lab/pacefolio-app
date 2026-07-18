"use client";

/* 가져오기(CSV) — PS3 (docs/22 · 지시서 §8)
   흐름: 파일 선택 → 스테이징(운영 무변경) → 미리보기(검증·중복 후보) →
   행 수정·SKIP → 원장 확인 후 커밋 → 필요 시 batch 되돌리기(archive).
   live API 전용. */
import { useCallback, useEffect, useState } from "react";
import { PCShell } from "../_shell";
import { Panel, Pill, Note, ActBtn, Spinner, useOverlays } from "../_ui";
import { api, useStudioAcademy, StudioGate, inputCls } from "../programs/_studio";
import type { ImportBatchDetail, ImportRow } from "@pacefolio/api-client";

export default function PCProgramImports() {
  const gate = useStudioAcademy();
  const { confirm, toast, overlays } = useOverlays();
  const [batches, setBatches] = useState<{ batchId: string; fileName: string; status: string }[] | null>(null);
  const [detail, setDetail] = useState<ImportBatchDetail | null>(null);
  const [err, setErr] = useState<string>();
  const [busy, setBusy] = useState(false);

  const refreshList = useCallback(async () => {
    if (!gate.academyId) return;
    try { setBatches((await api.listImports(gate.academyId)).batches); setErr(undefined); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, [gate.academyId]);
  useEffect(() => { (async () => { await refreshList(); })(); }, [refreshList]);

  const openBatch = async (batchId: string) => {
    if (!gate.academyId) return;
    try { setDetail(await api.getImportBatch(gate.academyId, batchId)); }
    catch (e) { toast(`불러오지 못했어요. (${e instanceof Error ? e.message : e})`); }
  };

  const onFile = async (f: File) => {
    if (!gate.academyId || busy) return;
    setBusy(true);
    try {
      const text = await f.text();
      const r = await api.stageImport(gate.academyId, { fileName: f.name, csvText: text });
      toast(r.reuploadOfCommitted
        ? "올렸어요 — 이미 커밋된 것과 같은 파일이라 커밋은 막혀 있어요."
        : `올렸어요. ${r.total}행(정상 ${r.valid}·오류 ${r.invalid}·중복 후보 ${r.withDuplicates}) — 미리보기에서 확인하세요.`);
      await refreshList();
      await openBatch(r.batchId);
    } catch (e) { toast(`올리지 못했어요. (${e instanceof Error ? e.message : e})`); }
    setBusy(false);
  };

  const commit = () => {
    if (!gate.academyId || !detail) return;
    const academyId = gate.academyId;
    const batchId = detail.batchId;
    const valid = detail.rows.filter((r) => r.validationStatus === "VALID" && r.resolution === "CREATE").length;
    confirm({
      title: `${valid}개 활동을 라이브러리에 넣을까요?`,
      sub: "오류 행과 건너뛰기(SKIP) 행은 넣지 않아요. 커밋 후엔 배치 단위로 되돌릴 수 있어요(보관 처리).",
      label: "커밋",
      onConfirm: () => {
        api.commitImport(academyId, batchId)
          .then(async (r) => {
            toast(`커밋했어요 — 생성 ${r.created}·건너뜀 ${r.skipped}·오류 제외 ${r.invalid}.`);
            await refreshList(); await openBatch(batchId);
          })
          .catch((e) => toast(`커밋하지 못했어요. (${e instanceof Error ? e.message : e})`));
      },
    });
  };

  const revert = () => {
    if (!gate.academyId || !detail) return;
    const academyId = gate.academyId;
    const batchId = detail.batchId;
    confirm({
      title: "이 가져오기를 되돌릴까요?",
      sub: "이 배치로 만든 활동을 보관(archive) 처리해요. 삭제가 아니라 과거 기록은 남아요.",
      label: "되돌리기",
      onConfirm: () => {
        api.revertImport(academyId, batchId)
          .then(async (r) => {
            toast(`되돌렸어요 — ${r.archived}개 활동을 보관했어요.`);
            await refreshList(); await openBatch(batchId);
          })
          .catch((e) => toast(`되돌리지 못했어요. (${e instanceof Error ? e.message : e})`));
      },
    });
  };

  const patchRow = async (row: ImportRow, body: Parameters<typeof api.updateImportRow>[3]) => {
    if (!gate.academyId || !detail) return;
    try {
      await api.updateImportRow(gate.academyId, detail.batchId, row.rowId, body);
      await openBatch(detail.batchId);
    } catch (e) { toast(`수정하지 못했어요. (${e instanceof Error ? e.message : e})`); }
  };

  return (
    <PCShell title="가져오기(CSV)">
      <StudioGate state={gate.state} errorMsg={gate.errorMsg}>
        {err && <Note>불러오지 못했어요. ({err})</Note>}
        {gate.isOwner && (
          <Panel title="새 가져오기" hnote="올려도 바로 반영되지 않아요 — 미리보기에서 확인한 뒤 커밋해요" className="mb-3">
            <label className="inline-flex items-center gap-2">
              <input
                type="file" accept=".csv,text/csv" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ""; }}
              />
              <span className="inline-flex items-center justify-center h-9 px-4 rounded-lg text-[12px] font-bold bg-ink text-white cursor-pointer">
                {busy ? "올리는 중…" : "CSV 파일 선택"}
              </span>
            </label>
            <Note inPanel>열 이름(Name·설명·Key FMS·Level·Age)을 자동으로 알아봐요. 원본 행은 그대로 보존돼요.</Note>
          </Panel>
        )}
        {!batches && !err && <div className="flex items-center gap-2 py-8 justify-center text-ink3 text-[13px]"><Spinner /> 불러오는 중…</div>}
        {batches && batches.length > 0 && (
          <Panel title="가져오기 이력" className="mb-3">
            <div className="flex gap-1.5 flex-wrap">
              {batches.map((b) => (
                <button key={b.batchId} onClick={() => void openBatch(b.batchId)}
                  className={`h-8 px-3 rounded-lg text-[12px] font-bold border transition ${
                    detail?.batchId === b.batchId ? "bg-ink text-white border-ink" : "bg-surface text-ink2 border-line hover:border-ink3"
                  }`}>
                  {b.fileName}
                  <span className="opacity-70"> · {b.status === "STAGED" ? "대기" : b.status === "COMMITTED" ? "커밋됨" : "되돌림"}</span>
                </button>
              ))}
            </div>
          </Panel>
        )}
        {detail && (
          <Panel
            title={`미리보기 · ${detail.fileName}`}
            hnote={detail.status === "STAGED" ? "행을 고치거나 건너뛴 뒤 커밋하세요" : detail.status === "COMMITTED" ? "커밋된 배치예요" : "되돌린 배치예요"}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-left text-ink3 font-bold">
                    <th className="py-1.5 pr-2">행</th><th className="pr-2">이름(정규화)</th>
                    <th className="pr-2">대표 영역</th><th className="pr-2">상태</th><th className="pr-2">처리</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.rows.map((r) => (
                    <tr key={r.rowId} className="border-t border-line align-top">
                      <td className="py-2 pr-2 text-ink3 font-bold">{r.sourceRowNumber}</td>
                      <td className="pr-2">
                        {detail.status === "STAGED" && gate.isOwner ? (
                          <input
                            className={inputCls} defaultValue={r.normalized.name}
                            onBlur={(e) => {
                              const v = e.target.value.trim();
                              if (v !== r.normalized.name) void patchRow(r, { normalized: { name: v } });
                            }}
                          />
                        ) : <span className="font-bold text-ink">{r.normalized.name || "(비어 있음)"}</span>}
                        {r.validationMessages.length > 0 && (
                          <div className="mt-1 text-[11px] text-ink3">{r.validationMessages.join(" · ")}</div>
                        )}
                      </td>
                      <td className="pr-2 text-ink2">{r.normalized.primaryDomainName ?? "—"}</td>
                      <td className="pr-2">
                        {r.validationStatus === "VALID"
                          ? <Pill kind="ok">정상</Pill>
                          : <Pill kind="due">오류</Pill>}
                        {r.duplicateCandidateIds.length > 0 && <div className="mt-1"><Pill kind="wait">중복 후보</Pill></div>}
                        {r.committedEntityId && <div className="mt-1"><Pill kind="ok">생성됨</Pill></div>}
                      </td>
                      <td className="pr-2">
                        {detail.status === "STAGED" && gate.isOwner && (
                          <button
                            className={`h-7 px-2.5 rounded-lg text-[11px] font-bold border ${
                              r.resolution === "SKIP" ? "bg-fill text-ink3 border-line" : "bg-surface text-ink2 border-line"
                            }`}
                            onClick={() => void patchRow(r, { resolution: r.resolution === "SKIP" ? "CREATE" : "SKIP" })}
                          >
                            {r.resolution === "SKIP" ? "건너뜀" : "가져옴"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {gate.isOwner && (
              <div className="mt-3 flex justify-end gap-1.5">
                {detail.status === "COMMITTED" && <ActBtn soft onClick={revert}>되돌리기(보관)</ActBtn>}
                {detail.status === "STAGED" && <ActBtn onClick={commit}>커밋 — 라이브러리에 넣기</ActBtn>}
              </div>
            )}
          </Panel>
        )}
      </StudioGate>
      {overlays}
    </PCShell>
  );
}
