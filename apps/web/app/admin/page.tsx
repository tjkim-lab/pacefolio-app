import Link from "next/link";
import { AdminShell } from "./_shell";
import { Tag } from "@/components/ui";
import { Panel, MetricRow, Note, ServiceDot } from "./_ui";
import { TaskList } from "./_tasks";
import {
  DASH_SERVICES,
  KEY_METRICS,
  QUARTER_STEPS,
  CALENDAR_ROWS,
  AT_RISK,
  ONBOARD_FUNNEL,
  PREP_MODULES,
} from "./_data";

export default function AdminDashboard() {
  return (
    <AdminShell title="통합 홈">
      <div className="space-y-3">
        <div>
          <h2 className="text-[19px] font-extrabold tracking-tight">통합 대시보드</h2>
          <p className="text-[12.5px] text-ink3 font-medium mt-0.5">
            오늘 무엇을 해결해야 하는지 보여주는 관제 화면 · 운영자 김운영
          </p>
        </div>

        {/* KPI */}
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

        {/* 작업함 + 상태/지표 */}
        <div className="grid grid-cols-[1.6fr_1fr] gap-3">
          <Panel title="오늘의 운영 작업함" note={<Link href="/admin/tasks" className="text-brand font-bold">전체 보기 →</Link>}>
            <TaskList limit={5} />
          </Panel>
          <div className="space-y-3">
            <Panel title="서비스 상태" note={<Link href="/admin/system" className="text-brand font-bold">자세히 →</Link>}>
              {DASH_SERVICES.map((s) => (
                <div key={s.name} className="flex items-center gap-2.5 py-2 border-b border-line2 last:border-0 text-[12.5px] font-semibold">
                  <ServiceDot state={s.state} />
                  {s.name}
                  <span className={`ml-auto text-[11px] font-bold ${s.state === "ok" ? "text-accent-ink" : s.state === "warn" ? "text-warn-ink" : "text-danger-ink"}`}>
                    {s.label}
                  </span>
                </div>
              ))}
            </Panel>
            <Panel title="핵심 지표" note="전화를 없앤다 · 주간">
              {KEY_METRICS.map((m) => (
                <MetricRow key={m.label} label={m.label} value={m.value} pct={m.pct} tone={m.tone} />
              ))}
            </Panel>
          </div>
        </div>

        {/* 분기 청구 관제 캘린더 */}
        <Panel title="분기 청구 관제 캘린더" note={<Link href="/admin/payments" className="text-brand font-bold">수강료 관제 →</Link>}>
          <div className="text-[12.5px] font-bold text-ink mb-2">
            다음 <span className="text-accent-ink">12월 시작 수납기간</span> · 대량 청구가 몰리기 전 관제
            <span className="ml-2 inline-flex items-center gap-1 text-[10.5px] font-extrabold text-accent-ink">
              <span className="w-[7px] h-[7px] rounded-full bg-accent inline-block animate-pulse" />D-21
            </span>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {QUARTER_STEPS.map((s) => (
              <div
                key={s.d}
                className={`flex-1 min-w-[70px] text-center rounded-xl border px-1 py-2 text-[10.5px] font-bold leading-tight ${
                  s.now ? "border-accent bg-accent-weak text-accent-ink" : "border-line bg-fill text-ink2"
                }`}
              >
                <b className={`block text-[12.5px] font-extrabold mb-0.5 ${s.now ? "text-accent-ink" : "text-accent-ink"}`}>{s.d}</b>
                {s.label}
              </div>
            ))}
          </div>
          <table className="w-full text-[13px] mt-3.5">
            <thead>
              <tr className="text-ink3 text-[11px] border-b border-line">
                <th className="text-left font-bold py-2">학원</th>
                <th className="text-left font-bold py-2">청구 초안</th>
                <th className="text-left font-bold py-2">원장 검토</th>
                <th className="text-left font-bold py-2">발송</th>
                <th className="text-left font-bold py-2"></th>
              </tr>
            </thead>
            <tbody>
              {CALENDAR_ROWS.map((r) => (
                <tr key={r.acad} className="border-b border-line2 last:border-0">
                  <td className="py-2.5">{r.acad}</td>
                  <td className="py-2.5"><Tag tone={r.draft.tone}>{r.draft.label}</Tag></td>
                  <td className="py-2.5"><Tag tone={r.ownerCheck.tone}>{r.ownerCheck.label}</Tag></td>
                  <td className="py-2.5"><Tag tone={r.send.tone}>{r.send.label}</Tag></td>
                  <td className={`py-2.5 text-[11.5px] font-bold ${r.noteTone === "danger" ? "text-danger-ink" : r.noteTone === "warn" ? "text-warn-ink" : "text-ink3"}`}>
                    {r.note}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        {/* 이탈 위험 + 온보딩 퍼널 */}
        <div className="grid grid-cols-2 gap-3 items-start">
          <Panel title="이탈 위험 학원" note="헬스 스코어 규칙 기반">
            {AT_RISK.map((a) => (
              <div key={a.id} className="flex gap-3 items-center py-3 border-b border-line2 last:border-0">
                <div className={`w-[34px] h-[34px] rounded-xl grid place-items-center shrink-0 ${a.tone === "hot" ? "bg-danger-weak text-danger-ink" : "bg-warn-weak text-warn-ink"}`}>
                  <AlertMini />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-ink">{a.name}</div>
                  <div className="text-[11px] text-ink3 font-medium">{a.sub}</div>
                </div>
                <Link href={`/admin/academies/${a.id}`} className="shrink-0 rounded-lg border border-line text-brand text-[11px] font-bold px-2.5 py-1.5">
                  상세
                </Link>
              </div>
            ))}
          </Panel>
          <Panel title="온보딩 퍼널" note="가입 → 첫 자동결제 등록">
            {ONBOARD_FUNNEL.map((m) => (
              <MetricRow key={m.label} label={m.label} value={m.value} pct={m.pct} tone={m.tone} labelWidth={150} />
            ))}
            <Note tone="inpanel">
              <FlagMini />
              <span>
                퍼널 종착점 = <b className="text-ink font-bold">첫 자동결제 등록</b>. 여기서 멈춘 학원이 &quot;전화 한 통 필요한&quot; 리스트로 작업함에 올라옵니다.
              </span>
            </Note>
          </Panel>
        </div>

        {/* 확장 · 준비 중 */}
        <Panel title="확장 · 준비 중" note="파일럿 이후 오픈 · 돈 흐름 3종은 메뉴 분리 유지">
          <div className="grid grid-cols-3 gap-2.5">
            {PREP_MODULES.map((m) => {
              const inner = (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-bold text-ink">{m.name}</span>
                    <Tag tone="muted">준비중</Tag>
                  </div>
                  <div className="text-[11.5px] text-ink3 font-medium mt-1">{m.desc}</div>
                </>
              );
              return m.href ? (
                <Link key={m.name} href={m.href} className="rounded-xl border border-line bg-fill px-3 py-3 hover:bg-line2 transition">
                  {inner}
                </Link>
              ) : (
                <div key={m.name} className="rounded-xl border border-line bg-fill px-3 py-3 opacity-70">
                  {inner}
                </div>
              );
            })}
          </div>
        </Panel>
      </div>
    </AdminShell>
  );
}

function Kpi({
  label,
  tag,
  value,
  sub,
  subTone,
}: {
  label: string;
  tag?: string;
  value: string;
  sub: string;
  subTone?: "up" | "dn";
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

function AlertMini() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3 2.5 20h19z" /><path d="M12 10v4M12 17.2h.01" />
    </svg>
  );
}
function FlagMini() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="text-accent shrink-0">
      <path d="M5 21V4h11l-1.5 4L16 12H5" />
    </svg>
  );
}
