"use client";

/* 통합 홈 KPI(#30) — READY 시 서버 진실(MRR·구독·재원·미납)로 교체,
   API 부재 시 기존 데모 KPI 유지(디자인 검수 기준). 오류는 오류로(위장 금지). */
import { AdminLiveProvider, useAdminLive } from "./_live";

const won = (n: number) => `${n.toLocaleString()}원`;

function Kpi({
  label, tag, value, sub, subTone,
}: {
  label: string; tag?: string; value: string; sub: string; subTone?: "up" | "dn";
}) {
  return (
    <div className="rounded-2xl bg-surface border border-line p-4">
      <div className="text-[11.5px] text-ink3 font-semibold">
        {label}
        {tag && <span className="ml-1 text-[9.5px] font-bold text-ink3">{tag}</span>}
      </div>
      <div className="text-[22px] font-extrabold tracking-tight mt-1 text-ink">{value}</div>
      <div className={`text-[11px] font-semibold mt-1 ${subTone === "up" ? "text-accent-ink" : subTone === "dn" ? "text-danger-ink" : "text-ink3"}`}>
        {sub}
      </div>
    </div>
  );
}

function KpiRow() {
  const live = useAdminLive();

  if (live.state === "READY" && live.overview) {
    const ov = live.overview;
    return (
      <div className="grid grid-cols-4 gap-3">
        <div className="rounded-2xl bg-accent-strong text-white p-4">
          <div className="text-[11.5px] text-white/80 font-semibold">MRR (우리 수익 · 실 데이터)</div>
          <div className="text-[22px] font-extrabold tracking-tight mt-1">{won(ov.subscription.mrrKrw)}</div>
          <div className="text-[11px] text-white/80 font-medium mt-1">
            BASIC {ov.subscription.activeByPlan.BASIC} · PRO {ov.subscription.activeByPlan.PRO} · 활성 구독 월요금 합
          </div>
        </div>
        <Kpi
          label="활성 학원" tag="실 데이터"
          value={`${ov.academies.total - ov.academies.suspended}곳`}
          sub={ov.academies.suspended > 0 ? `정지 ${ov.academies.suspended}곳` : "정지 0곳"}
        />
        <Kpi label="재원 원생" tag="전체" value={`${ov.participants}명`} sub="TRIAL·재원 포함" />
        <Kpi
          label="미납 · 환불 대기"
          value={won(ov.tuition.unpaidKrw)}
          sub={`환불 대기 ${ov.refundsPending}건 · 학부모→학원(관제)`}
          subTone={ov.tuition.unpaidKrw > 0 ? "dn" : undefined}
        />
      </div>
    );
  }

  if (live.state === "ERROR") {
    return (
      <div className="rounded-2xl bg-surface border border-line p-4 text-[12.5px] text-ink2 font-medium">
        관제 지표를 불러오지 못했어요 — {live.errorMsg}
      </div>
    );
  }

  /* LOADING·FIXTURE — 기존 데모 KPI(디자인 기준) */
  return (
    <div className="grid grid-cols-4 gap-3">
      <div className="rounded-2xl bg-accent-strong text-white p-4">
        <div className="text-[11.5px] text-white/80 font-semibold">디지털 자가처리 완료율 (북극성)</div>
        <div className="text-[22px] font-extrabold tracking-tight mt-1">76%</div>
        <div className="text-[11px] text-white/80 font-medium mt-1">전화 개입 없이 종료 · 결석·Q&amp;A·결제·공지·리포트</div>
      </div>
      <Kpi label="자동결제 등록률" tag="별도 핵심" value="64%" sub="▲ 3.2%p · 589 / 920명 · 결제·리텐션" subTone="up" />
      <Kpi label="활성 학원" tag="원생 1,284명" value="12곳" sub="온보딩 3 · 휴면 1 · 이탈위험 2" />
      <Kpi label="오늘 처리 필요" value="8건" sub="긴급 2 · 주의 3 · 일반 3" subTone="dn" />
    </div>
  );
}

export function DashboardKpis() {
  return (
    <AdminLiveProvider>
      <KpiRow />
    </AdminLiveProvider>
  );
}
