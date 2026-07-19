"use client";

/* 학원 관리 — 실연결(#29): READY = 서버 학원 목록(구독·재원·미납·정지) +
   통제 액션(정지 = 사유 필수·전 멤버 세션 폐기 / 해제). LOADING/ERROR 구분 표시,
   FIXTURE = 기존 데모 테이블 유지(디자인 검수 안전). */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminShell } from "../_shell";
import { Tag } from "@/components/ui";
import { IconChevron } from "@/components/ui/icons";
import { FilterChips, SearchBox, Empty, Panel, Note } from "../_ui";
import { GATED_FEATURES, FEATURE_LABEL_KO } from "@pacefolio/domain";
import { ACADEMIES, STATUS_META, hsClass, type AcademyStatus } from "../_data";
import { AdminLiveProvider, useAdminLive, type AdminAcademyRow, type AdminFeatureGrantRow } from "../_live";

type F = AcademyStatus | "all";

const won = (n: number) => `${n.toLocaleString()}원`;

/* ── 실 데이터 행 — 정지/해제는 행 확장으로 사유부터 ── */
function LiveRow({ a }: { a: AdminAcademyRow }) {
  const live = useAdminLive();
  const [openReason, setOpenReason] = useState(false);
  const [openGrants, setOpenGrants] = useState(false); // #50 기능 예외 패널
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>();

  const doSuspend = async () => {
    if (!reason.trim() || busy) return;
    setBusy(true);
    const r = await live.suspend(a.academyId, reason.trim());
    setMsg(r.message);
    setBusy(false);
    if (r.ok) { setOpenReason(false); setReason(""); }
  };
  const doUnsuspend = async () => {
    if (busy) return;
    setBusy(true);
    const r = await live.unsuspend(a.academyId);
    setMsg(r.message);
    setBusy(false);
  };

  return (
    <>
      <tr className="border-b border-line2 last:border-0">
        <td className="py-3">
          <div className="flex items-center gap-2.5">
            <span className="w-[30px] h-[30px] rounded-lg bg-fill grid place-items-center text-[13px] font-extrabold text-ink2 shrink-0">
              {a.name.charAt(0)}
            </span>
            <div>
              <div className="font-bold text-ink">{a.name}</div>
              <div className="text-[10.5px] text-ink3 font-medium">{a.academyId}</div>
            </div>
          </div>
        </td>
        <td className="py-3">
          {a.suspended
            ? <Tag tone="danger">정지</Tag>
            : a.subscription?.status === "ACTIVE"
              ? <Tag tone="accent">구독중 · {a.subscription.plan}</Tag>
              : <Tag tone="muted">{a.subscription ? "해지" : "미구독"}</Tag>}
        </td>
        <td className="py-3 text-ink2">{a.ownerName}</td>
        <td className="py-3 text-ink2">{a.activeParticipants > 0 ? `${a.activeParticipants}명` : "–"}</td>
        <td className="py-3 text-ink2">
          {a.subscription?.status === "ACTIVE" ? won(a.subscription.priceKrwMonthly) : "–"}
        </td>
        <td className="py-3 text-ink2">{a.unpaidKrw > 0 ? won(a.unpaidKrw) : "–"}</td>
        <td className="py-3 text-right whitespace-nowrap">
          <button
            onClick={() => { setOpenGrants((v) => !v); setMsg(undefined); }}
            className="px-2.5 py-1.5 mr-1.5 rounded-lg text-[11.5px] font-bold border border-line bg-surface text-brand hover:bg-fill"
          >
            기능 예외…
          </button>
          {a.suspended ? (
            <button
              onClick={doUnsuspend}
              disabled={busy}
              className={`px-2.5 py-1.5 rounded-lg text-[11.5px] font-bold border border-line bg-surface text-ink2 hover:text-ink ${busy ? "opacity-50" : ""}`}
            >
              정지 해제
            </button>
          ) : (
            <button
              onClick={() => { setOpenReason((v) => !v); setMsg(undefined); }}
              className="px-2.5 py-1.5 rounded-lg text-[11.5px] font-bold border border-line bg-surface text-danger-ink hover:bg-fill"
            >
              정지…
            </button>
          )}
        </td>
      </tr>
      {openGrants && (
        <tr className="border-b border-line2 last:border-0 bg-fill/40">
          <td colSpan={7} className="py-2.5">
            <GrantPanel academyId={a.academyId} onMsg={setMsg} />
          </td>
        </tr>
      )}
      {(openReason || msg) && (
        <tr className="border-b border-line2 last:border-0">
          <td colSpan={7} className="py-2.5">
            {openReason && !a.suspended && (
              <div className="flex items-center gap-2">
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="정지 사유(필수) — 감사 로그에 남아요"
                  className="flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-[12.5px] font-medium outline-none focus:border-accent"
                />
                <button
                  onClick={doSuspend}
                  disabled={busy || !reason.trim()}
                  className={`px-3 py-2 rounded-lg text-[12px] font-bold bg-danger text-white ${busy || !reason.trim() ? "opacity-50" : ""}`}
                >
                  정지 실행
                </button>
                <button
                  onClick={() => { setOpenReason(false); setReason(""); }}
                  className="px-3 py-2 rounded-lg text-[12px] font-bold border border-line bg-surface text-ink3"
                >
                  취소
                </button>
              </div>
            )}
            {msg && <div className="text-[11.5px] font-semibold text-ink2 mt-1.5">{msg}</div>}
          </td>
        </tr>
      )}
    </>
  );
}

/* #50: 기능 예외 패널 — 영업 "한두 달 열어주기". 발급(기간·사유 필수)·철회·이력.
   만료는 서버가 판정 시점에 자동 잠금 — 여기선 상태 표시만. */
const GRANT_DAYS = [
  { label: "30일", days: 30 }, { label: "60일", days: 60 },
  { label: "90일", days: 90 }, { label: "무기한", days: undefined },
] as const;

function GrantPanel({ academyId, onMsg }: { academyId: string; onMsg: (m: string) => void }) {
  const live = useAdminLive();
  const [grants, setGrants] = useState<AdminFeatureGrantRow[] | null>(null);
  const [feature, setFeature] = useState<string>(GATED_FEATURES[0]);
  const [daysIdx, setDaysIdx] = useState(0);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const { listGrants } = live;
  const reload = async () => setGrants(await listGrants(academyId));
  useEffect(() => {
    void listGrants(academyId).then(setGrants);
  }, [academyId, listGrants]);

  const doGrant = async () => {
    if (busy || !reason.trim()) return;
    setBusy(true);
    const r = await live.grant(academyId, {
      feature, reason: reason.trim(), days: GRANT_DAYS[daysIdx].days,
    });
    setBusy(false);
    onMsg(r.message);
    if (r.ok) { setReason(""); await reload(); }
  };
  /* #50b: 전 기능 체험 — 기간 필수(무기한 전체 개방은 플랜 지정으로) */
  const doTrialAll = async () => {
    if (busy || !reason.trim()) return;
    const days = GRANT_DAYS[daysIdx].days;
    if (days == null) { onMsg("전 기능 열기는 기간이 필요해요 — 무기한 전체 개방은 플랜을 PRO 로 지정하세요"); return; }
    setBusy(true);
    const r = await live.trialAll(academyId, { reason: reason.trim(), days });
    setBusy(false);
    onMsg(r.message);
    if (r.ok) { setReason(""); await reload(); }
  };
  const doRevoke = async (grantId: string) => {
    if (busy) return;
    setBusy(true);
    const r = await live.revokeGrant(academyId, grantId);
    setBusy(false);
    onMsg(r.message);
    if (r.ok) await reload();
  };
  const label = (f: string) => FEATURE_LABEL_KO[f as keyof typeof FEATURE_LABEL_KO] ?? f;

  return (
    <div className="space-y-2">
      <div className="text-[11.5px] font-bold text-ink2">
        기능 예외 — 플랜과 무관하게 이 학원에만 열어줘요. 만료되면 자동으로 잠기고, 발급·철회는 감사에 남아요.
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <select value={feature} onChange={(e) => setFeature(e.target.value)}
          className="rounded-lg border border-line bg-surface px-2.5 py-2 text-[12px] font-semibold">
          {GATED_FEATURES.map((f) => <option key={f} value={f}>{label(f)}</option>)}
        </select>
        {GRANT_DAYS.map((d, i) => (
          <button key={d.label} onClick={() => setDaysIdx(i)}
            className={`px-2.5 py-1.5 rounded-lg text-[11.5px] font-bold border ${daysIdx === i ? "border-accent bg-accent-weak text-brand" : "border-line bg-surface text-ink2"}`}>
            {d.label}
          </button>
        ))}
        <input value={reason} onChange={(e) => setReason(e.target.value)}
          placeholder="사유(필수) — 예: 영업 프로모션 2개월"
          className="flex-1 min-w-[200px] rounded-lg border border-line bg-surface px-3 py-2 text-[12px] font-medium outline-none focus:border-accent" />
        <button onClick={doGrant} disabled={busy || !reason.trim()}
          className={`px-3 py-2 rounded-lg text-[12px] font-bold bg-accent-strong text-white ${busy || !reason.trim() ? "opacity-50" : ""}`}>
          열어주기
        </button>
        <button onClick={doTrialAll} disabled={busy || !reason.trim()}
          title="게이트 전 기능을 같은 만료일로 한 번에 — 만료되면 자동으로 잠겨요(전환 유도)"
          className={`px-3 py-2 rounded-lg text-[12px] font-bold border-[1.5px] border-accent bg-accent-weak text-brand ${busy || !reason.trim() ? "opacity-50" : ""}`}>
          ⚡ 전 기능 한 번에
        </button>
      </div>
      <div className="space-y-1">
        {grants === null && <div className="text-[11.5px] text-ink3 font-medium">불러오는 중...</div>}
        {grants?.length === 0 && <div className="text-[11.5px] text-ink3 font-medium">예외 이력 없음 — 플랜 기준으로만 동작 중</div>}
        {grants?.map((g) => (
          <div key={g.grantId} className="flex items-center gap-2 text-[12px]">
            <Tag tone={g.active ? "accent" : "muted"}>{g.active ? "열림" : g.revokedAt ? "철회됨" : "만료됨"}</Tag>
            <span className="font-bold text-ink">{label(g.feature)}</span>
            <span className="text-ink3 font-medium">
              {g.expiresAt ? `~${g.expiresAt.slice(0, 10)}` : "무기한"} · {g.reason}
            </span>
            {g.active && (
              <button onClick={() => doRevoke(g.grantId)} disabled={busy}
                className="ml-auto px-2 py-1 rounded-lg text-[11px] font-bold border border-line bg-surface text-danger-ink hover:bg-fill">
                철회
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function LiveBody() {
  const live = useAdminLive();
  const [q, setQ] = useState("");
  const list = live.academies.filter(
    (a) => !q || a.name.includes(q) || a.ownerName.includes(q),
  );
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-[19px] font-extrabold tracking-tight">학원 관리</h2>
        <p className="text-[12.5px] text-ink3 font-medium mt-0.5">
          실 데이터 · 전체 {live.academies.length}곳 · 정지는 전 멤버 세션 즉시 폐기 + 접근 차단(감사 기록)
        </p>
      </div>
      <div className="flex gap-2 items-center">
        <div className="ml-auto">
          <SearchBox value={q} onChange={setQ} placeholder="학원명·원장명 검색" />
        </div>
      </div>
      <div className="rounded-2xl bg-surface border border-line px-4 overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-ink3 text-[11px] border-b border-line">
              <th className="text-left font-bold py-2.5">학원</th>
              <th className="text-left font-bold py-2.5">구독</th>
              <th className="text-left font-bold py-2.5">원장</th>
              <th className="text-left font-bold py-2.5">재원</th>
              <th className="text-left font-bold py-2.5">월 요금</th>
              <th className="text-left font-bold py-2.5">미납</th>
              <th className="py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {list.map((a) => <LiveRow key={a.academyId} a={a} />)}
          </tbody>
        </table>
        {list.length === 0 && <Empty emoji="🔍" title="조건에 맞는 학원이 없어요" sub="검색어를 바꿔보세요" />}
      </div>
      <Note>
        학원 상세·플랜 변경은 <b>PACEFOLIO 구독</b> 메뉴에서. 온보딩·헬스스코어 등 나머지 지표는
        데이터가 쌓이면 이 표로 합류해요.
      </Note>
    </div>
  );
}

/* ── 기존 데모 테이블(API 부재 시) — 디자인 검수 기준 유지 ── */
function FixtureBody() {
  const router = useRouter();
  const [filter, setFilter] = useState<F>("all");
  const [q, setQ] = useState("");

  const list = ACADEMIES.filter((a) => {
    if (filter !== "all" && a.status !== filter) return false;
    if (q && !a.name.includes(q) && !a.owner.includes(q)) return false;
    return true;
  });

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-[19px] font-extrabold tracking-tight">학원 관리</h2>
        <p className="text-[12.5px] text-ink3 font-medium mt-0.5">
          전체 12곳 · 아래는 샘플 8곳 · 모든 지표·작업은 학원 단위로 귀속
        </p>
      </div>

      <div className="flex gap-2 flex-wrap items-center">
        <FilterChips<F>
          value={filter}
          onChange={setFilter}
          options={[
            { key: "all", label: "전체" },
            { key: "ACTIVE", label: "활성" },
            { key: "ONBOARDING", label: "온보딩" },
            { key: "TRIAL", label: "체험" },
            { key: "AT_RISK", label: "이탈위험" },
            { key: "SUSPENDED", label: "정지" },
          ]}
        />
        <div className="ml-auto">
          <SearchBox value={q} onChange={setQ} placeholder="학원명·원장명 검색" />
        </div>
      </div>

      <div className="rounded-2xl bg-surface border border-line px-4">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-ink3 text-[11px] border-b border-line">
              <th className="text-left font-bold py-2.5">학원</th>
              <th className="text-left font-bold py-2.5">상태</th>
              <th className="text-left font-bold py-2.5">원장</th>
              <th className="text-left font-bold py-2.5">활성 원생</th>
              <th className="text-left font-bold py-2.5">자동결제</th>
              <th className="text-left font-bold py-2.5">리포트</th>
              <th className="text-left font-bold py-2.5">헬스</th>
              <th className="text-left font-bold py-2.5">담당</th>
              <th className="py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {list.map((a) => {
              const s = STATUS_META[a.status];
              const showNum = a.status === "ACTIVE" || a.status === "AT_RISK";
              return (
                <tr
                  key={a.id}
                  tabIndex={0}
                  role="button"
                  onClick={() => router.push(`/admin/academies/${a.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      router.push(`/admin/academies/${a.id}`);
                    }
                  }}
                  className="border-b border-line2 last:border-0 cursor-pointer hover:bg-fill outline-none focus-visible:bg-fill"
                >
                  <td className="py-3">
                    <div className="flex items-center gap-2.5">
                      <span className="w-[30px] h-[30px] rounded-lg bg-fill grid place-items-center text-[13px] font-extrabold text-ink2 shrink-0">
                        {a.name.charAt(0)}
                      </span>
                      <div>
                        <div className="font-bold text-ink">{a.name}</div>
                        <div className="text-[10.5px] text-ink3 font-medium">{a.region} · {a.last}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3">
                    <Tag tone={s.tone}>
                      {s.ko}
                      {a.status === "ONBOARDING" && a.onboard ? " " + a.onboard.split(" ")[0] : ""}
                    </Tag>
                  </td>
                  <td className="py-3 text-ink2">{a.owner}</td>
                  <td className="py-3 text-ink2">{a.kids > 0 ? a.kids + "명" : "–"}</td>
                  <td className="py-3 text-ink2">{showNum ? a.auto + "%" : "–"}</td>
                  <td className="py-3 text-ink2">{showNum ? a.report + "%" : "–"}</td>
                  <td className="py-3">
                    {a.health > 0 ? (
                      <span className={`font-extrabold tabular-nums ${hsClass(a.health)}`}>{a.health}</span>
                    ) : (
                      <span className="text-ink3">–</span>
                    )}
                  </td>
                  <td className="py-3 text-ink2">{a.cs}</td>
                  <td className="py-3 text-right">
                    <IconChevron size={15} className="text-ink3 inline" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {list.length === 0 && <Empty emoji="🔍" title="조건에 맞는 학원이 없어요" sub="필터·검색어를 바꿔보세요" />}
      </div>
    </div>
  );
}

function AcademiesBody() {
  const live = useAdminLive();
  if (live.state === "LOADING") {
    return <Empty emoji="⏳" title="관제 데이터 불러오는 중" sub="API 연결을 확인하고 있어요" />;
  }
  if (live.state === "ERROR") {
    return (
      <Panel title="관제 데이터를 불러오지 못했어요">
        <p className="text-[13px] text-ink2">{live.errorMsg} — 새로고침하거나 API 로그를 확인해 주세요.</p>
      </Panel>
    );
  }
  if (live.state === "READY") return <LiveBody />;
  return <FixtureBody />; // API 부재 = 데모(디자인 검수 기준)
}

export default function AdminAcademies() {
  return (
    <AdminShell title="학원 관리">
      <AdminLiveProvider>
        <AcademiesBody />
      </AdminLiveProvider>
    </AdminShell>
  );
}
