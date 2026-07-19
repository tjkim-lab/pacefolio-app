"use client";

/* 코치 기술 기록(AS) — PS5 UI (지시서 §9)
   같은 반 아이별 다른 진도 → 연습 관찰 기록 → READY 면 클리어 기준 확인 →
   확정(뱃지·보호자 알림은 서버 동일 tx). 반복 횟수만으로 자동 클리어 없음. */
import { useCallback, useEffect, useState } from "react";
import { createApiClient, ApiError, type SkillBoard, type VersionSkillList } from "@pacefolio/api-client";

const api = createApiClient({ baseUrl: "/api" });
const OBS = ["INTRODUCED", "ASSISTED", "PRACTICING", "INDEPENDENT", "READY_FOR_CLEARANCE"] as const;
const OBS_LABEL: Record<string, string> = {
  NOT_STARTED: "시작 전", INTRODUCED: "처음", ASSISTED: "도움", PRACTICING: "연습",
  INDEPENDENT: "혼자", READY_FOR_CLEARANCE: "검토", CLEARED: "클리어",
};

export default function CoachSkills() {
  const [state, setState] = useState<"LOADING" | "READY" | "NO_ACCESS" | "ERROR">("LOADING");
  const [academyId, setAcademyId] = useState<string>();
  const [classes, setClasses] = useState<{ classId: string; name: string }[]>([]);
  const [selClass, setSelClass] = useState<string>();
  const [board, setBoard] = useState<SkillBoard | null>(null);
  const [skills, setSkills] = useState<VersionSkillList["skills"]>([]);
  const [selKid, setSelKid] = useState<string>();
  const [selSkill, setSelSkill] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>();
  const [clearing, setClearing] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    api.me().then(async (me) => {
      const m = me.memberships.find((x) => x.status === "ACTIVE" && (x.roles.includes("COACH") || x.roles.includes("OWNER")));
      if (!m) { if (alive) setState("NO_ACCESS"); return; }
      const cls = await api.listClasses(m.academyId);
      if (!alive) return;
      setAcademyId(m.academyId);
      const mine = cls.classes.filter((c) => c.coachUserIds.includes(me.user.id) || m.roles.includes("OWNER"));
      setClasses(mine.map((c) => ({ classId: c.classId, name: c.name })));
      if (mine[0]) setSelClass(mine[0].classId);
      setState("READY");
    }).catch((e) => {
      if (alive) setState(e instanceof ApiError && e.status === 401 ? "NO_ACCESS" : "ERROR");
    });
    return () => { alive = false; };
  }, []);

  const load = useCallback(async () => {
    if (!academyId || !selClass) return;
    try {
      const [b, assigns] = await Promise.all([
        api.classSkillBoard(academyId, selClass),
        api.listClassProgramAssignments(academyId, selClass),
      ]);
      setBoard(b);
      if (!selKid && b.participants[0]) setSelKid(b.participants[0].participantId);
      const allSkills: VersionSkillList["skills"] = [];
      for (const a of assigns.assignments) {
        const r = await api.listVersionSkills(academyId, a.programVersionId);
        allSkills.push(...r.skills.filter((x) => x.active));
      }
      setSkills(allSkills);
      if (!selSkill && allSkills[0]) setSelSkill(allSkills[0].skillId);
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
  }, [academyId, selClass, selKid, selSkill]);
  useEffect(() => { (async () => { await load().catch(() => {}); })(); }, [load]);

  const practice = async (observed: string) => {
    if (!academyId || !selKid || !selSkill || busy) return;
    setBusy(true);
    try {
      const r = await api.recordSkillPractice(academyId, selKid, selSkill, { result: observed });
      setMsg(`기록했어요 — ${OBS_LABEL[r.status]} · ${r.practiceCount}번째 연습`);
      await load();
    } catch (e) { setMsg(`기록하지 못했어요. (${e instanceof Error ? e.message : e})`); }
    setBusy(false);
  };

  const doClear = async () => {
    if (!academyId || !selKid || !selSkill || busy) return;
    setBusy(true);
    try {
      const r = await api.clearSkill(academyId, selKid, selSkill, { checkedCriteriaIds: [...checked] });
      setMsg(r.alreadyCleared
        ? "이미 클리어한 기술이에요."
        : r.badgeAwarded ? "클리어 확정! 뱃지가 발급되고 보호자에게 소식이 갔어요 🎉" : "클리어 확정!");
      setClearing(false); setChecked(new Set());
      await load();
    } catch (e) { setMsg(`확정하지 못했어요. (${e instanceof Error ? e.message : e})`); }
    setBusy(false);
  };

  if (state === "LOADING") return <Wrap><Hint>불러오는 중…</Hint></Wrap>;
  if (state === "NO_ACCESS") return <Wrap><Hint>코치 계정으로 로그인하면 기술을 기록할 수 있어요.</Hint></Wrap>;
  if (state === "ERROR") return <Wrap><Hint>지금 기술 정보를 불러오지 못했어요.</Hint></Wrap>;

  const kid = board?.participants.find((p) => p.participantId === selKid);
  const skill = skills.find((x) => x.skillId === selSkill);
  const kidSkill = kid?.skills.find((x) => x.skillId === selSkill);

  return (
    <Wrap>
      <h1 className="text-[19px] font-extrabold text-ink tracking-tight">기술 기록</h1>
      <div className="flex gap-1.5 mt-3 flex-wrap">
        {classes.map((c) => (
          <Chip key={c.classId} on={selClass === c.classId} onClick={() => { setSelClass(c.classId); setSelKid(undefined); }}>
            {c.name}
          </Chip>
        ))}
      </div>
      {/* 같은 반, 아이별 다른 진도 */}
      {board && (
        <div className="mt-3 grid gap-1.5">
          {board.participants.map((p) => (
            <button key={p.participantId} onClick={() => setSelKid(p.participantId)}
              className={`text-left rounded-xl border px-3.5 py-2.5 ${
                selKid === p.participantId ? "border-accent bg-accent/5" : "border-line bg-surface"
              }`}>
              <div className="text-[13px] font-bold text-ink">{p.name}</div>
              <div className="flex gap-1.5 mt-1 flex-wrap">
                {p.skills.length === 0 && <span className="text-[11px] text-ink3">아직 기록 없음</span>}
                {p.skills.map((x) => (
                  <span key={x.skillId}
                    className={`text-[10.5px] font-bold rounded-md px-1.5 py-0.5 ${
                      x.status === "CLEARED" ? "bg-accent/15 text-accent" : "bg-fill text-ink2"
                    }`}>
                    {x.name} · {OBS_LABEL[x.status] ?? x.status}
                  </span>
                ))}
              </div>
            </button>
          ))}
          {board.participants.length === 0 && <Hint>이 반에 등록된 아이가 없어요.</Hint>}
        </div>
      )}
      {/* 기술 선택 + 기록 */}
      {kid && skills.length > 0 && (
        <section className="mt-4 pb-24">
          <div className="flex gap-1.5 flex-wrap">
            {skills.map((x) => (
              <Chip key={x.skillId} on={selSkill === x.skillId} onClick={() => { setSelSkill(x.skillId); setClearing(false); }}>
                {x.name}
              </Chip>
            ))}
          </div>
          {skill && (
            <div className="mt-3 rounded-xl border border-line bg-surface px-3.5 py-3">
              <div className="text-[13px] font-extrabold text-ink">
                {kid.name} · {skill.name}
                {kidSkill && <span className="text-ink3 font-bold text-[11.5px]"> — {OBS_LABEL[kidSkill.status]} · {kidSkill.practiceCount}회</span>}
              </div>
              {kidSkill?.status !== "CLEARED" && !clearing && (
                <>
                  <p className="text-[11px] text-ink3 mt-1">오늘의 관찰을 기록해요 — 횟수가 아니라 관찰이 정본이에요.</p>
                  <div className="flex gap-1.5 mt-2 flex-wrap">
                    {OBS.map((o) => (
                      <button key={o} disabled={busy} onClick={() => void practice(o)}
                        className="h-8 px-3 rounded-lg text-[11.5px] font-bold border bg-surface text-ink2 border-line disabled:opacity-60">
                        {OBS_LABEL[o]}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => setClearing(true)}
                    className="mt-3 h-9 px-4 rounded-lg bg-ink text-white text-[12px] font-bold">
                    클리어 확정하기
                  </button>
                </>
              )}
              {clearing && (
                <div className="mt-2">
                  <p className="text-[11.5px] font-bold text-ink2">기준을 직접 확인해 주세요 — 확인해야 확정돼요.</p>
                  <div className="grid gap-1.5 mt-2">
                    {skill.criteria.map((c) => (
                      <label key={c.criterionId} className="flex items-center gap-2 text-[12.5px] font-medium text-ink">
                        <input type="checkbox" checked={checked.has(c.criterionId)}
                          onChange={(e) => setChecked((prev) => {
                            const n = new Set(prev);
                            if (e.target.checked) n.add(c.criterionId); else n.delete(c.criterionId);
                            return n;
                          })} />
                        {c.label}{c.required ? "" : " (선택)"}
                      </label>
                    ))}
                    {skill.criteria.length === 0 && <span className="text-[11.5px] text-ink3">등록된 기준이 없어요 — 코치 판단으로 확정해요.</span>}
                  </div>
                  <div className="flex gap-1.5 mt-3">
                    <button disabled={busy} onClick={() => void doClear()}
                      className="h-9 px-4 rounded-lg bg-accent text-white text-[12px] font-bold disabled:opacity-60">
                      {busy ? "확정 중…" : "클리어 확정"}
                    </button>
                    <button onClick={() => { setClearing(false); setChecked(new Set()); }}
                      className="h-9 px-3 rounded-lg border border-line text-[12px] font-bold text-ink2">취소</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}
      {kid && skills.length === 0 && <Hint>이 반에 적용된 프로그램의 기술이 없어요.</Hint>}
      {msg && <p className="mt-3 text-[12.5px] font-bold text-accent">{msg}</p>}
    </Wrap>
  );
}

const Wrap = ({ children }: { children: React.ReactNode }) => <div className="px-5 pt-6 min-h-full">{children}</div>;
const Hint = ({ children }: { children: React.ReactNode }) => <p className="text-[12.5px] text-ink3 py-2">{children}</p>;
function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`h-8 px-3 rounded-full text-[12px] font-bold border ${on ? "bg-ink text-white border-ink" : "bg-surface text-ink2 border-line"}`}>
      {children}
    </button>
  );
}
