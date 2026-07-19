"use client";

/* 코치 수업 실행(BS) — PS4 UI (지시서 §9)
   오늘 계획 확인 → 활동 완료/부분/미진행 처리 → 확정(참석자 기본 반영,
   예외는 서버 overrides — v1 UI 는 기본 반영 그대로). live API 전용. */
import { useCallback, useEffect, useState } from "react";
import { createApiClient, ApiError, type SessionPlanView } from "@pacefolio/api-client";

const api = createApiClient({ baseUrl: "/api" });
type Result = "COMPLETED" | "PARTIAL" | "NOT_DONE";
const RESULT_LABEL: Record<Result, string> = { COMPLETED: "완료", PARTIAL: "일부", NOT_DONE: "안 함" };

export default function CoachRun() {
  const [state, setState] = useState<"LOADING" | "READY" | "NO_ACCESS" | "ERROR">("LOADING");
  const [academyId, setAcademyId] = useState<string>();
  const [userId, setUserId] = useState<string>();
  const [classes, setClasses] = useState<{ classId: string; name: string }[]>([]);
  const [selClass, setSelClass] = useState<string>();
  const [sessions, setSessions] = useState<{ sessionId: string; date: string; startTime: string; status: string }[]>([]);
  const [selSession, setSelSession] = useState<string>();
  const [plan, setPlan] = useState<SessionPlanView | null>(null);
  const [marks, setMarks] = useState<Record<string, Result>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>();

  useEffect(() => {
    let alive = true;
    api.me().then(async (me) => {
      const m = me.memberships.find((x) => x.status === "ACTIVE" && x.roles.includes("COACH"))
        ?? me.memberships.find((x) => x.status === "ACTIVE" && x.roles.includes("OWNER"));
      if (!m) { if (alive) setState("NO_ACCESS"); return; }
      const cls = await api.listClasses(m.academyId);
      if (!alive) return;
      setAcademyId(m.academyId);
      setUserId(me.user.id);
      const mine = cls.classes.filter((c) =>
        c.coachUserIds.includes(me.user.id) || m.roles.includes("OWNER"));
      setClasses(mine.map((c) => ({ classId: c.classId, name: c.name })));
      if (mine[0]) setSelClass(mine[0].classId);
      setState("READY");
    }).catch((e) => {
      if (alive) setState(e instanceof ApiError && e.status === 401 ? "NO_ACCESS" : "ERROR");
    });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!academyId || !selClass) return;
    let alive = true;
    api.listClassSessions(academyId, selClass).then((r) => {
      if (!alive) return;
      const upcoming = r.sessions.filter((x) => x.status === "SCHEDULED" || x.status === "COMPLETED");
      setSessions(upcoming);
      setSelSession(upcoming[0]?.sessionId);
    }).catch(() => {});
    return () => { alive = false; };
  }, [academyId, selClass]);

  const loadPlan = useCallback(async () => {
    if (!academyId || !selSession) return;
    try {
      const p = await api.getSessionPlan(academyId, selSession);
      setPlan(p);
      const first = p.plans[0];
      const init: Record<string, Result> = {};
      for (const a of first?.activities ?? []) {
        init[a.activityRevisionId] = (a.result as Result) ?? "COMPLETED";
      }
      setMarks(init);
      setMsg(undefined);
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
  }, [academyId, selSession]);
  useEffect(() => { (async () => { await loadPlan().catch(() => {}); })(); }, [loadPlan]);

  const startPlan = async () => {
    const p0 = plan?.plans[0];
    if (!academyId || !selSession || !p0 || busy) return;
    setBusy(true);
    try {
      await api.createSessionPlan(academyId, selSession, { assignmentId: p0.assignmentId });
      await loadPlan();
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };

  const confirm = async () => {
    const p0 = plan?.plans[0];
    if (!academyId || !p0?.planId || busy) return;
    setBusy(true);
    try {
      const r = await api.confirmSessionResults(academyId, p0.planId, {
        results: p0.activities.map((a) => ({
          activityRevisionId: a.activityRevisionId,
          result: marks[a.activityRevisionId] ?? "COMPLETED",
        })),
      });
      setMsg(`확정했어요 — 참여 ${r.participants}명, 경험 ${r.experienceEvents}건이 기록됐어요.`);
      await loadPlan();
    } catch (e) { setMsg(`확정하지 못했어요. (${e instanceof Error ? e.message : e})`); }
    setBusy(false);
  };

  if (state === "LOADING") return <Wrap><Hint>불러오는 중…</Hint></Wrap>;
  if (state === "NO_ACCESS") return <Wrap><Hint>코치 계정으로 로그인하면 수업을 실행할 수 있어요.</Hint></Wrap>;
  if (state === "ERROR") return <Wrap><Hint>지금 수업 정보를 불러오지 못했어요.</Hint></Wrap>;
  const p0 = plan?.plans[0];

  return (
    <Wrap>
      <h1 className="text-[19px] font-extrabold text-ink tracking-tight">수업 실행</h1>
      <div className="flex gap-1.5 mt-3 flex-wrap">
        {classes.map((c) => (
          <Chip key={c.classId} on={selClass === c.classId} onClick={() => setSelClass(c.classId)}>{c.name}</Chip>
        ))}
        {classes.length === 0 && <Hint>담당 반이 없어요.</Hint>}
      </div>
      {sessions.length > 0 && (
        <div className="flex gap-1.5 mt-2 flex-wrap">
          {sessions.slice(0, 6).map((x) => (
            <Chip key={x.sessionId} on={selSession === x.sessionId} onClick={() => setSelSession(x.sessionId)}>
              {x.date.slice(5)} {x.startTime}
            </Chip>
          ))}
        </div>
      )}
      {userId && plan && !p0 && <Hint>이 반에 적용된 프로그램이 없어요. 원장님이 PC 스튜디오에서 적용하면 계획이 떠요.</Hint>}
      {p0 && (
        <section className="mt-4 pb-24">
          <div className="rounded-xl border border-line bg-surface px-3.5 py-3">
            <div className="text-[13px] font-extrabold text-ink">
              {p0.curriculumSession ? p0.curriculumSession.name : "자유 수업"}
            </div>
            {!p0.planned ? (
              <button onClick={() => void startPlan()} disabled={busy}
                className="mt-2 h-9 px-4 rounded-lg bg-ink text-white text-[12px] font-bold disabled:opacity-60">
                이 계획으로 수업 시작
              </button>
            ) : (
              <div className="mt-2 grid gap-2">
                {p0.activities.map((a, i) => (
                  <div key={a.activityRevisionId} className="rounded-lg bg-fill px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-extrabold text-ink3">{i + 1}</span>
                      <span className="text-[13px] font-bold text-ink flex-1">{a.name}</span>
                      {a.recommendedMinutes && <span className="text-[11px] text-ink3">{a.recommendedMinutes}분</span>}
                    </div>
                    <div className="flex gap-1.5 mt-2">
                      {(Object.keys(RESULT_LABEL) as Result[]).map((r) => (
                        <button key={r}
                          onClick={() => setMarks((m) => ({ ...m, [a.activityRevisionId]: r }))}
                          className={`h-7 px-2.5 rounded-lg text-[11px] font-bold border ${
                            marks[a.activityRevisionId] === r
                              ? "bg-accent text-white border-accent"
                              : "bg-surface text-ink2 border-line"
                          }`}>
                          {RESULT_LABEL[r]}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                <button onClick={() => void confirm()} disabled={busy}
                  className="mt-1 h-10 rounded-xl bg-ink text-white text-[13px] font-bold disabled:opacity-60">
                  {busy ? "확정 중…" : "수업 결과 확정 — 참석 아이들 경험 반영"}
                </button>
                <p className="text-[11px] text-ink3">출석한 아이들에게 기본 반영돼요. 예외가 있으면 확정 후 원장님과 조정할 수 있어요.</p>
              </div>
            )}
          </div>
        </section>
      )}
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
