"use client";

/* PACEFOLIO 구독 — 수익 관제 실연결(#28).
   가격정책 확정(2026-07-18): BASIC 월 29,000 / PRO 월 99,000 (기능 구분 TBD — docs/17).
   READY = 서버 진실(MRR·플랜 분포·학원별 구독 + 플랜 변경 액션).
   FIXTURE = API 부재 안내 · ERROR = 오류 표시(데모 위장 금지). */
import { useState } from "react";
import { AdminShell } from "../_shell";
import { Tag } from "@/components/ui";
import { Panel, Note, Empty } from "../_ui";
import { AdminLiveProvider, useAdminLive, type AdminAcademyRow } from "../_live";

const won = (n: number) => `${n.toLocaleString()}원`;

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl bg-surface border border-line px-4 py-3.5">
      <div className="text-[11.5px] font-bold text-ink3">{label}</div>
      <div className="text-[20px] font-extrabold tracking-tight mt-0.5">{value}</div>
      {sub ? <div className="text-[11.5px] text-ink3 font-medium mt-0.5">{sub}</div> : null}
    </div>
  );
}

function PlanSwitch({ row }: { row: AdminAcademyRow }) {
  const live = useAdminLive();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>();
  const current = row.subscription?.status === "ACTIVE" ? row.subscription.plan : null;
  const change = async (plan: "BASIC" | "PRO") => {
    if (busy || current === plan) return;
    setBusy(true); setMsg(undefined);
    const r = await live.setPlan(row.academyId, plan);
    setMsg(r.ok ? undefined : r.message);
    setBusy(false);
  };
  return (
    <div className="flex items-center gap-1.5">
      {(["BASIC", "PRO"] as const).map((p) => (
        <button
          key={p}
          onClick={() => change(p)}
          disabled={busy}
          className={`px-2 py-1 rounded-lg text-[11.5px] font-bold border transition-colors ${
            current === p
              ? "bg-accent-strong text-white border-accent"
              : "bg-surface text-ink3 border-line hover:text-ink"
          } ${busy ? "opacity-50" : ""}`}
        >
          {p}
        </button>
      ))}
      {msg ? <span className="text-[11px] text-danger-ink font-medium">{msg}</span> : null}
    </div>
  );
}

function BillingBody() {
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
  if (live.state === "FIXTURE" || !live.overview) {
    return (
      <div className="space-y-3">
        <Note tone="warn">
          API 미접속 — <b>npm run dev</b> 로 API(:3001)를 켜면 이 화면이 실 데이터(MRR·구독)로
          전환돼요. 가격정책은 확정: BASIC 월 29,000원 / PRO 월 99,000원.
        </Note>
        <Empty emoji="🔌" title="실 데이터 대기" sub="서버 연결 후 수익 관제가 여기 표시됩니다" />
      </div>
    );
  }

  const ov = live.overview;
  const subscribed = live.academies.filter((a) => a.subscription?.status === "ACTIVE").length;
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-[19px] font-extrabold tracking-tight">PACEFOLIO 구독</h2>
        <p className="text-[12.5px] text-ink3 font-medium mt-0.5">
          우리 수익의 정본 — MRR = 활성 구독 월요금 합 · 가격: BASIC 29,000 / PRO 99,000 (기능 구분 확정 대기)
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <StatCard label="MRR" value={won(ov.subscription.mrrKrw)} sub="활성 구독 월요금 합" />
        <StatCard
          label="활성 구독"
          value={`${subscribed} / ${ov.academies.total}곳`}
          sub={`BASIC ${ov.subscription.activeByPlan.BASIC} · PRO ${ov.subscription.activeByPlan.PRO}`}
        />
        <StatCard label="학원 수납(참고)" value={won(ov.tuition.capturedKrw)} sub="학부모→학원 — 우리 매출 아님" />
        <StatCard label="미납·환불 대기" value={`${won(ov.tuition.unpaidKrw)} · ${ov.refundsPending}건`} sub="관제 지표" />
      </div>

      <div className="rounded-2xl bg-surface border border-line px-4 overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-ink3 text-[11px] border-b border-line">
              <th className="text-left font-bold py-2.5">학원</th>
              <th className="text-left font-bold py-2.5">원장</th>
              <th className="text-left font-bold py-2.5">플랜</th>
              <th className="text-left font-bold py-2.5">월 요금</th>
              <th className="text-left font-bold py-2.5">재원</th>
              <th className="text-left font-bold py-2.5">미납</th>
              <th className="text-left font-bold py-2.5">상태</th>
            </tr>
          </thead>
          <tbody>
            {live.academies.map((a) => (
              <tr key={a.academyId} className="border-b border-line last:border-0">
                <td className="py-2.5 font-bold">{a.name}</td>
                <td className="py-2.5 text-ink2">{a.ownerName}</td>
                <td className="py-2.5"><PlanSwitch row={a} /></td>
                <td className="py-2.5 font-semibold">
                  {a.subscription?.status === "ACTIVE" ? won(a.subscription.priceKrwMonthly) : "—"}
                </td>
                <td className="py-2.5">{a.activeParticipants}명</td>
                <td className="py-2.5">{a.unpaidKrw > 0 ? won(a.unpaidKrw) : "—"}</td>
                <td className="py-2.5">
                  {a.suspended
                    ? <Tag tone="danger">정지</Tag>
                    : a.subscription?.status === "ACTIVE"
                      ? <Tag tone="accent">구독중</Tag>
                      : <Tag tone="muted">{a.subscription ? "해지" : "미구독"}</Tag>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Note>
        수강료(학부모→학원)·구독(학원→PACEFOLIO)·커머스 직영 — 돈 흐름 3종은 분리 유지.
        구독 실 결제(우리→학원 수납)는 미구현: 지금은 플랜 지정과 MRR 집계까지 (docs/17 §D).
      </Note>
    </div>
  );
}

export default function AdminBilling() {
  return (
    <AdminShell title="PACEFOLIO 구독">
      <AdminLiveProvider>
        <BillingBody />
      </AdminLiveProvider>
    </AdminShell>
  );
}
