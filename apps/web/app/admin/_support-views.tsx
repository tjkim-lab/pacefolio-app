"use client";

/* SupportView 패널(#30) — 테넌트 내부 열람의 유일한 문을 UI 로.
   발급(학원·사유 필수·기본 30분) · 이력(만료/철회 상태) · 철회.
   READY 에서만 동작 — API 부재 시 안내만(위장 금지). */
import { useCallback, useEffect, useState } from "react";
import { Tag } from "@/components/ui";
import { Panel, Note } from "./_ui";
import { adminApi, useAdminLive } from "./_live";

type SupportViewRow = Awaited<ReturnType<typeof adminApi.adminListSupportViews>>["supportViews"][number];

function svStatus(v: SupportViewRow, now: number): { label: string; tone: "accent" | "muted" | "danger" } {
  if (v.revokedAt) return { label: "철회됨", tone: "muted" };
  if (new Date(v.expiresAt).getTime() <= now) return { label: "만료", tone: "muted" };
  return { label: "활성", tone: "accent" };
}

export function SupportViewPanel() {
  const live = useAdminLive();
  const [views, setViews] = useState<SupportViewRow[]>([]);
  const [academyId, setAcademyId] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>();

  const load = useCallback(async () => {
    const r = await adminApi.adminListSupportViews();
    setViews(r.supportViews);
  }, []);

  useEffect(() => {
    if (live.state === "READY") load().catch(() => setMsg("이력을 불러오지 못했어요"));
  }, [live.state, load]);

  if (live.state !== "READY") {
    return (
      <Panel title="SupportView — 학원 내부 열람 세션">
        <Note tone="warn">
          API 미접속 — 실서버 연결 시 여기서 발급·철회해요. 열람은 세션 단위(사유 필수·30분 만료·전 이력 감사).
        </Note>
      </Panel>
    );
  }

  const issue = async () => {
    if (!academyId || !reason.trim() || busy) return;
    setBusy(true); setMsg(undefined);
    try {
      const r = await adminApi.adminIssueSupportView(academyId, reason.trim());
      setMsg(`발급 완료 — ${new Date(r.expiresAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })} 만료`);
      setReason("");
      await load();
    } catch {
      setMsg("발급 실패 — 사유·학원을 확인해 주세요");
    }
    setBusy(false);
  };

  const revoke = async (id: string) => {
    if (busy) return;
    setBusy(true);
    try { await adminApi.adminRevokeSupportView(id); await load(); } catch { setMsg("철회 실패"); }
    setBusy(false);
  };

  const now = Date.now();
  return (
    <Panel title="SupportView — 학원 내부 열람 세션" note="사유 필수 · 30분 만료 · 전 이력 감사">
      <div className="flex gap-2 items-center flex-wrap">
        <select
          value={academyId}
          onChange={(e) => setAcademyId(e.target.value)}
          className="rounded-lg border border-line bg-surface px-2.5 py-2 text-[12.5px] font-semibold text-ink outline-none focus:border-accent"
        >
          <option value="">학원 선택</option>
          {live.academies.map((a) => (
            <option key={a.academyId} value={a.academyId}>{a.name}</option>
          ))}
        </select>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="발급 사유(필수) — 예: CS-104 결제 오류 확인"
          className="flex-1 min-w-[220px] rounded-lg border border-line bg-surface px-3 py-2 text-[12.5px] font-medium outline-none focus:border-accent"
        />
        <button
          onClick={issue}
          disabled={busy || !academyId || !reason.trim()}
          className={`px-3.5 py-2 rounded-lg text-[12px] font-bold bg-accent-strong text-white ${busy || !academyId || !reason.trim() ? "opacity-50" : ""}`}
        >
          발급
        </button>
      </div>
      {msg && <div className="text-[11.5px] font-semibold text-ink2 mt-2">{msg}</div>}

      <div className="mt-3">
        {views.length === 0 ? (
          <div className="text-[12px] text-ink3 font-medium py-2">발급 이력이 없어요 — 첫 발급부터 감사 로그에 남아요.</div>
        ) : (
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-ink3 text-[11px] border-b border-line">
                <th className="text-left font-bold py-2">학원</th>
                <th className="text-left font-bold py-2">사유</th>
                <th className="text-left font-bold py-2">만료</th>
                <th className="text-left font-bold py-2">상태</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {views.map((v) => {
                const st = svStatus(v, now);
                return (
                  <tr key={v.id} className="border-b border-line2 last:border-0">
                    <td className="py-2 font-semibold">{v.academyName ?? v.academyId}</td>
                    <td className="py-2 text-ink2">{v.reason}</td>
                    <td className="py-2 text-ink2">
                      {new Date(v.expiresAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="py-2"><Tag tone={st.tone}>{st.label}</Tag></td>
                    <td className="py-2 text-right">
                      {st.label === "활성" && (
                        <button
                          onClick={() => revoke(v.id)}
                          disabled={busy}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border border-line bg-surface text-ink2 hover:text-ink ${busy ? "opacity-50" : ""}`}
                        >
                          철회
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </Panel>
  );
}
