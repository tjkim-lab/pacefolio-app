"use client";

/* 보호자 성장보고서 — PS6 (docs/20 §2 · 지시서 §10)
   BS 경험지도(경험 횟수·다양성·최근성 — 점수·순위 없음) + AS 뱃지북.
   live API 전용 — 서버가 보호자 경계(VERIFIED 링크)를 재검증한다. */
import { useCallback, useEffect, useState } from "react";
import { createApiClient, ApiError, type ExperienceMap, type SkillBook } from "@pacefolio/api-client";

const api = createApiClient({ baseUrl: "/api" });

const STATUS_LABEL: Record<string, string> = {
  NOT_STARTED: "시작 전", INTRODUCED: "처음 경험", ASSISTED: "도움 받아 연습",
  PRACTICING: "혼자 연습 중", INDEPENDENT: "혼자 해요", READY_FOR_CLEARANCE: "클리어 도전",
  CLEARED: "클리어 🎉",
};

export default function ParentGrowth() {
  const [state, setState] = useState<"LOADING" | "READY" | "NO_ACCESS" | "ERROR">("LOADING");
  const [academyId, setAcademyId] = useState<string>();
  const [children, setChildren] = useState<{ participantId: string; name: string; ageLabel: string }[]>([]);
  const [sel, setSel] = useState<string>();
  const [map, setMap] = useState<ExperienceMap | null>(null);
  const [book, setBook] = useState<SkillBook | null>(null);
  const [err, setErr] = useState<string>();

  useEffect(() => {
    let alive = true;
    api.me().then(async (me) => {
      const m = me.memberships.find((x) => x.status === "ACTIVE" && x.roles.includes("GUARDIAN"));
      if (!m) { if (alive) setState("NO_ACCESS"); return; }
      const kids = await api.myChildren(m.academyId);
      if (!alive) return;
      setAcademyId(m.academyId);
      setChildren(kids.children);
      if (kids.children[0]) setSel(kids.children[0].participantId);
      setState("READY");
    }).catch((e) => {
      if (!alive) return;
      setState(e instanceof ApiError && e.status === 401 ? "NO_ACCESS" : "ERROR");
    });
    return () => { alive = false; };
  }, []);

  const load = useCallback(async () => {
    if (!academyId || !sel) return;
    try {
      const [m, b] = await Promise.all([
        api.experienceMap(academyId, sel),
        api.skillBook(academyId, sel),
      ]);
      setMap(m); setBook(b); setErr(undefined);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  }, [academyId, sel]);
  useEffect(() => { (async () => { await load().catch(() => {}); })(); }, [load]);

  if (state === "LOADING") return <Screen><p className="text-[13px] text-ink3 text-center py-16">불러오는 중…</p></Screen>;
  if (state === "NO_ACCESS") return <Screen><p className="text-[13px] text-ink3 text-center py-16">보호자 계정으로 로그인하면 아이의 성장 기록을 볼 수 있어요.</p></Screen>;
  if (state === "ERROR") return <Screen><p className="text-[13px] text-ink3 text-center py-16">지금 성장 기록을 불러오지 못했어요. 잠시 후 다시 열어주세요.</p></Screen>;

  const child = children.find((c) => c.participantId === sel);
  const maxCount = Math.max(1, ...(map?.domains.map((d) => d.experienceCount) ?? [1]));

  return (
    <Screen>
      <h1 className="text-[19px] font-extrabold text-ink tracking-tight">성장 기록</h1>
      <p className="text-[12.5px] text-ink2 mt-1">한 걸음이, 한 페이지가 됩니다.</p>

      {children.length === 0 && (
        <p className="mt-6 text-[13px] text-ink3">아직 연결된 아이가 없어요. 학원에서 받은 초대로 아이를 연결해 주세요.</p>
      )}
      {children.length > 1 && (
        <div className="flex gap-1.5 mt-4 flex-wrap">
          {children.map((c) => (
            <button key={c.participantId} onClick={() => setSel(c.participantId)}
              className={`h-8 px-3 rounded-full text-[12px] font-bold border ${
                sel === c.participantId ? "bg-ink text-white border-ink" : "bg-surface text-ink2 border-line"
              }`}>
              {c.name}
            </button>
          ))}
        </div>
      )}
      {err && <p className="mt-4 text-[12.5px] text-ink3">기록을 불러오지 못했어요.</p>}

      {child && map && (
        <section className="mt-5">
          <h2 className="text-[14px] font-extrabold text-ink">움직임 경험지도</h2>
          <p className="text-[12px] text-ink3 mt-0.5">
            {child.name}(이)가 지금까지 {map.totalSessions}번의 수업에서 만난 움직임이에요.
          </p>
          <div className="mt-3 grid gap-2.5">
            {map.domains.length === 0 && (
              <p className="text-[12.5px] text-ink3">첫 경험이 쌓이면 여기에 나타나요.</p>
            )}
            {map.domains.map((d) => (
              <div key={d.growthDomainId} className="rounded-xl border border-line bg-surface px-3.5 py-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-[13px] font-bold text-ink">{d.name}</span>
                  <span className="text-[11.5px] text-ink3 font-medium">
                    {d.experienceCount}회 경험 · {d.distinctActivities}가지 활동
                  </span>
                </div>
                {/* 경험의 양 — 점수·비교가 아니라 "걸어온 걸음" */}
                <div className="mt-2 h-1.5 rounded-full bg-fill overflow-hidden">
                  <div className="h-full rounded-full bg-accent"
                    style={{ width: `${Math.round((d.experienceCount / maxCount) * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {child && book && (book.skills.length > 0 || book.badges.length > 0) && (
        <section className="mt-6 pb-24">
          <h2 className="text-[14px] font-extrabold text-ink">뱃지북</h2>
          {book.badges.length > 0 && (
            <div className="mt-2.5 grid gap-2">
              {book.badges.map((b) => (
                <div key={b.awardId} className="rounded-xl border border-line bg-surface px-3.5 py-3 flex items-center gap-3">
                  <span className="text-[22px]">🏅</span>
                  <div>
                    <div className="text-[13px] font-bold text-ink">{b.name}</div>
                    <div className="text-[11.5px] text-ink3">{b.awardedAt.slice(0, 10)} 획득</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {book.skills.length > 0 && (
            <div className="mt-3 grid gap-1.5">
              {book.skills.map((sk) => (
                <div key={sk.skillId} className="flex items-center justify-between rounded-lg bg-fill px-3 py-2.5">
                  <span className="text-[12.5px] font-bold text-ink">{sk.name}</span>
                  <span className="text-[11.5px] font-bold text-ink2">
                    {STATUS_LABEL[sk.status] ?? sk.status}
                    {sk.status !== "CLEARED" && sk.practiceCount > 0 && (
                      <span className="text-ink3 font-medium"> · {sk.practiceCount}번 연습</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </Screen>
  );
}

function Screen({ children }: { children: React.ReactNode }) {
  return <div className="px-5 pt-6 min-h-full">{children}</div>;
}
