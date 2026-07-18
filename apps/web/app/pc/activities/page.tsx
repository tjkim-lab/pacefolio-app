"use client";

/* 활동 라이브러리 (PS2 · docs/22) — 목록·검색 + 생성/수정 사이드패널 + 성장영역 태그.
   live API 전용. 이름은 식별자가 아니다 — 수정 시 서버가 개정 정책을 적용
   (게시 커리큘럼 참조 중이면 자동 새 개정판 → UI 는 결과를 그대로 알려줌). */
import { useCallback, useEffect, useMemo, useState } from "react";
import { PCShell } from "../_shell";
import { Panel, Pill, Note, ActBtn, Spinner, useOverlays } from "../_ui";
import {
  api, useStudioAcademy, StudioGate, Field, inputCls, textareaCls,
} from "../programs/_studio";
import type { StudioActivity, StudioGrowthDomain } from "@pacefolio/api-client";

export default function PCActivities() {
  const gate = useStudioAcademy();
  const { confirm, toast, overlays } = useOverlays();
  const [items, setItems] = useState<StudioActivity[] | null>(null);
  const [domains, setDomains] = useState<StudioGrowthDomain[]>([]);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string | null>(null); // activityId | "NEW"
  const [err, setErr] = useState<string>();

  const refresh = useCallback(async () => {
    if (!gate.academyId) return;
    try {
      const [a, d] = await Promise.all([
        api.listStudioActivities(gate.academyId),
        api.listGrowthDomains(gate.academyId),
      ]);
      setItems(a.activities); setDomains(d.domains); setErr(undefined);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, [gate.academyId]);
  useEffect(() => { (async () => { await refresh(); })(); }, [refresh]);

  const list = useMemo(
    () => (items ?? []).filter((a) => !q || a.name.includes(q)),
    [items, q],
  );
  const selected = useMemo(
    () => (sel && sel !== "NEW" ? items?.find((a) => a.activityId === sel) : undefined),
    [sel, items],
  );
  const domainName = useMemo(() => new Map(domains.map((d) => [d.domainId, d.name])), [domains]);

  const archive = (a: StudioActivity) => {
    if (!gate.academyId) return;
    const academyId = gate.academyId;
    confirm({
      title: "이 활동을 보관할까요?",
      sub: "보관하면 새 커리큘럼에 배치할 수 없어요. 이미 쓰인 과거 기록은 그대로 남아요.",
      label: "보관하기",
      onConfirm: () => {
        api.archiveStudioActivity(academyId, a.activityId)
          .then(async () => {
            toast("보관했어요. 과거 기록은 그대로예요.");
            setSel(null);
            await refresh();
          })
          .catch((e) => toast(`보관하지 못했어요. (${e instanceof Error ? e.message : e})`));
      },
    });
  };

  return (
    <PCShell
      title="활동 라이브러리"
      actions={gate.isOwner ? <ActBtn onClick={() => setSel("NEW")}>＋ 새 활동</ActBtn> : undefined}
    >
      <StudioGate state={gate.state} errorMsg={gate.errorMsg}>
        {err && <Note>불러오지 못했어요. ({err})</Note>}
        {!items && !err && <div className="flex items-center gap-2 py-10 justify-center text-ink3 text-[13px]"><Spinner /> 활동 불러오는 중…</div>}
        {items && (
          <div className="grid gap-3 lg:grid-cols-[1fr_340px] items-start">
            <Panel title={`활동 ${list.length}개`} hnote="이름·내용은 언제든 바꿀 수 있어요 — 과거 기록은 안 바뀌어요">
              <input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="활동 이름 검색…" />
              <div className="mt-2 grid gap-1.5">
                {list.length === 0 && <Note inPanel>활동이 없어요. ‘새 활동’으로 첫 활동을 만들어 보세요.</Note>}
                {list.map((a) => (
                  <button
                    key={a.activityId}
                    onClick={() => setSel(a.activityId)}
                    className={`text-left px-3 py-2.5 rounded-lg border transition flex items-center gap-2 flex-wrap ${
                      sel === a.activityId ? "border-accent bg-accent/5" : "border-line bg-surface hover:border-ink3"
                    }`}
                  >
                    <span className="text-[13px] font-bold text-ink">{a.name}</span>
                    {a.revisionNumber && a.revisionNumber > 1 && (
                      <span className="text-[10.5px] text-ink3 font-bold">개정 {a.revisionNumber}</span>
                    )}
                    {a.status === "ARCHIVED" && <Pill kind="due">보관됨</Pill>}
                    <span className="flex-1" />
                    {a.growthTags.map((t) => (
                      <span
                        key={t.growthDomainId}
                        className={`text-[10.5px] font-bold rounded-md px-1.5 py-0.5 ${
                          t.role === "PRIMARY" ? "bg-accent/15 text-accent" : "bg-fill text-ink3"
                        }`}
                      >
                        {domainName.get(t.growthDomainId) ?? "?"}
                      </span>
                    ))}
                  </button>
                ))}
              </div>
            </Panel>
            {(sel === "NEW" || selected) && gate.academyId && (
              <ActivityEditor
                key={sel}
                academyId={gate.academyId}
                activity={selected}
                domains={domains}
                editable={gate.isOwner}
                onSaved={(msg) => { toast(msg); void refresh(); }}
                onArchive={selected ? () => archive(selected) : undefined}
                onClose={() => setSel(null)}
              />
            )}
          </div>
        )}
      </StudioGate>
      {overlays}
    </PCShell>
  );
}

/* 사이드패널 — 생성/수정 + 성장영역 태그(대표 1 + 보조 N) */
function ActivityEditor({ academyId, activity, domains, editable, onSaved, onArchive, onClose }: {
  academyId: string; activity?: StudioActivity; domains: StudioGrowthDomain[];
  editable: boolean; onSaved: (msg: string) => void; onArchive?: () => void; onClose: () => void;
}) {
  const isNew = !activity;
  const [name, setName] = useState(activity?.name ?? "");
  const [desc, setDesc] = useState(activity?.description ?? "");
  const [minutes, setMinutes] = useState(activity?.recommendedMinutes?.toString() ?? "");
  const [difficulty, setDifficulty] = useState(activity?.difficultyLabel ?? "");
  const [primary, setPrimary] = useState<string>(
    activity?.growthTags.find((t) => t.role === "PRIMARY")?.growthDomainId ?? "");
  const [secondary, setSecondary] = useState<Set<string>>(
    new Set(activity?.growthTags.filter((t) => t.role === "SECONDARY").map((t) => t.growthDomainId) ?? []));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();

  const activeDomains = domains.filter((d) => d.active && d.parentId); // 소분류만 태그 대상
  const toggleSecondary = (id: string) => setSecondary((prev) => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const save = async () => {
    if (!name.trim() || busy) return;
    setBusy(true); setErr(undefined);
    const content = {
      name: name.trim(),
      ...(desc.trim() ? { description: desc.trim() } : {}),
      ...(minutes && Number(minutes) > 0 ? { recommendedMinutes: Number(minutes) } : {}),
      ...(difficulty.trim() ? { difficultyLabel: difficulty.trim() } : {}),
    };
    const tags = [
      ...(primary ? [{ growthDomainId: primary, role: "PRIMARY" as const }] : []),
      ...[...secondary].filter((id) => id !== primary)
        .map((id) => ({ growthDomainId: id, role: "SECONDARY" as const })),
    ];
    try {
      if (isNew) {
        const r = await api.createStudioActivity(academyId, content);
        if (tags.length) await api.setActivityGrowthTags(academyId, r.activityId, tags);
        onSaved("활동을 만들었어요.");
      } else {
        const r = await api.updateStudioActivity(academyId, activity!.activityId, content);
        await api.setActivityGrowthTags(academyId, activity!.activityId, tags);
        onSaved(r.newRevision
          ? "수정했어요. 게시된 커리큘럼이 쓰고 있어서 새 개정판으로 저장됐어요 — 과거 기록은 그대로예요."
          : "수정했어요.");
      }
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <Panel
      title={isNew ? "새 활동" : `활동 편집${activity?.revisionNumber ? ` · 개정 ${activity.revisionNumber}` : ""}`}
      hnote={editable ? undefined : "원장만 수정할 수 있어요"}
    >
      <div className="grid gap-2.5">
        <Field label="활동 이름">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} disabled={!editable} />
        </Field>
        <Field label="설명(선택)">
          <textarea className={textareaCls} value={desc} onChange={(e) => setDesc(e.target.value)} disabled={!editable} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="권장 시간(분)">
            <input className={inputCls} type="number" min={1} value={minutes} onChange={(e) => setMinutes(e.target.value)} disabled={!editable} />
          </Field>
          <Field label="난이도 표기(선택)">
            <input className={inputCls} value={difficulty} onChange={(e) => setDifficulty(e.target.value)} placeholder="예: 쉬움" disabled={!editable} />
          </Field>
        </div>
        <div>
          <div className="text-[11px] font-bold text-ink3 mb-1">대표 성장영역(1개)</div>
          <div className="flex gap-1 flex-wrap">
            {activeDomains.map((d) => (
              <button
                key={d.domainId}
                disabled={!editable}
                onClick={() => setPrimary((p) => (p === d.domainId ? "" : d.domainId))}
                className={`h-7 px-2.5 rounded-lg text-[11px] font-bold border transition ${
                  primary === d.domainId ? "bg-accent text-white border-accent" : "bg-surface text-ink2 border-line"
                }`}
              >
                {d.name}
              </button>
            ))}
            {activeDomains.length === 0 && (
              <span className="text-[11.5px] text-ink3">
                성장영역이 없어요 — <a href="/pc/growth-domains" className="text-accent font-bold">성장영역</a>에서 먼저 만들어 주세요.
              </span>
            )}
          </div>
        </div>
        <div>
          <div className="text-[11px] font-bold text-ink3 mb-1">보조 성장영역(여러 개)</div>
          <div className="flex gap-1 flex-wrap">
            {activeDomains.filter((d) => d.domainId !== primary).map((d) => (
              <button
                key={d.domainId}
                disabled={!editable}
                onClick={() => toggleSecondary(d.domainId)}
                className={`h-7 px-2.5 rounded-lg text-[11px] font-bold border transition ${
                  secondary.has(d.domainId) ? "bg-ink text-white border-ink" : "bg-surface text-ink2 border-line"
                }`}
              >
                {d.name}
              </button>
            ))}
          </div>
        </div>
        {err && <Note inPanel>저장하지 못했어요. ({err})</Note>}
        {editable && (
          <div className="flex gap-1.5 justify-end pt-1">
            {!isNew && activity?.status === "ACTIVE" && onArchive && (
              <ActBtn soft onClick={onArchive}>보관</ActBtn>
            )}
            <ActBtn soft onClick={onClose}>닫기</ActBtn>
            <ActBtn disabled={!name.trim() || busy} onClick={() => void save()}>
              {busy ? "저장 중…" : "저장"}
            </ActBtn>
          </div>
        )}
      </div>
    </Panel>
  );
}
