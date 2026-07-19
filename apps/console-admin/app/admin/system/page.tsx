"use client";

import { useState } from "react";
import { AdminShell } from "../_shell";
import { Tag } from "@/components/ui";
import { SubTabs, Panel, Note, MetricRow, ServiceDot } from "../_ui";
import { SYS_SERVICES, SLA_METRICS, FEATURE_FLAGS, AUDIT } from "../_data";

type Tab = "status" | "audit";

export default function AdminSystem() {
  const [tab, setTab] = useState<Tab>("status");

  return (
    <AdminShell title="시스템 · 감사">
      <div className="space-y-3">
        <div>
          <h2 className="text-[19px] font-extrabold tracking-tight">시스템 · 감사</h2>
          <p className="text-[12.5px] text-ink3 font-medium mt-0.5">
            서버 지표보다 &quot;사용자에게 약속한 기능&quot;이 정상인지 · 모든 민감 행위는 로그로 남김
          </p>
        </div>

        <SubTabs<Tab>
          value={tab}
          onChange={setTab}
          tabs={[
            { key: "status", label: "서비스 상태" },
            { key: "audit", label: "감사 로그" },
          ]}
        />

        {tab === "status" && (
          <>
            <div className="grid grid-cols-2 gap-3 items-start">
              <Panel title="서비스 상태" note="사용자에게 약속한 기능">
                {SYS_SERVICES.map((s) => (
                  <div key={s.name} className="flex items-center gap-2.5 py-2 border-b border-line2 last:border-0 text-[12.5px] font-semibold">
                    <ServiceDot state={s.state} />
                    {s.name}
                    <span className={`ml-auto text-[11px] font-bold ${s.state === "ok" ? "text-accent-ink" : s.state === "warn" ? "text-warn-ink" : "text-danger-ink"}`}>
                      {s.label}
                    </span>
                  </div>
                ))}
              </Panel>
              <Panel title="업무 SLA" note="전화를 없앤다 · 알림 실패 = 전화 부활">
                {SLA_METRICS.map((m) => (
                  <MetricRow key={m.label} label={m.label} value={m.value} pct={m.pct} tone={m.tone} />
                ))}
                <Note tone="warn">
                  <AlertMini className="text-warn-ink" />
                  <span>3시간 전 알림 실패 14건 — 연락처 오류 9 · 알림톡 지연 5. <b className="font-bold">알림이 실패하면 전화가 다시 생깁니다.</b></span>
                </Note>
              </Panel>
            </div>

            <Panel title="기능 플래그" note="원더짐 = 고객 0번 · 파일럿 우선">
              {FEATURE_FLAGS.map((f) => (
                <div key={f.name} className="flex items-center gap-2.5 py-2 border-b border-line2 last:border-0 text-[12.5px] font-semibold">
                  <FlagMini tone={f.tone} />
                  <span className="font-mono text-[12px]">{f.name}</span>
                  {f.desc && <span className="text-ink3 font-medium text-[11.5px]">· {f.desc}</span>}
                  <span className={`ml-auto text-[11px] font-bold ${f.tone === "accent" ? "text-accent-ink" : f.tone === "warn" ? "text-warn-ink" : "text-ink3"}`}>
                    {f.scope}
                  </span>
                </div>
              ))}
            </Panel>
          </>
        )}

        {tab === "audit" && (
          <>
            <div className="rounded-2xl bg-surface border border-line px-4">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-ink3 text-[11px] border-b border-line">
                    <th className="text-left font-bold py-2.5">시각</th>
                    <th className="text-left font-bold py-2.5">운영자</th>
                    <th className="text-left font-bold py-2.5">학원</th>
                    <th className="text-left font-bold py-2.5">행위</th>
                    <th className="text-left font-bold py-2.5">대상</th>
                    <th className="text-left font-bold py-2.5">사유</th>
                  </tr>
                </thead>
                <tbody>
                  {AUDIT.map((r, i) => (
                    <tr key={i} className="border-b border-line2 last:border-0 align-top">
                      <td className="py-3 text-ink2 whitespace-nowrap">{r.t}</td>
                      <td className="py-3 text-ink2 whitespace-nowrap">{r.op}</td>
                      <td className="py-3 text-ink2 whitespace-nowrap">{r.acad}</td>
                      <td className="py-3 text-ink font-semibold whitespace-nowrap">{r.act}</td>
                      <td className="py-3 text-ink2">{r.tgt}</td>
                      <td className="py-3 text-ink3 text-[11.5px]">{r.why}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Note>
              <ShieldMini />
              <span>
                <b className="text-ink font-bold">개인정보 접근·정책 변경·지원 보기·데이터 내보내기</b>는 누가·언제·어느 학원·무엇을·왜 했는지 모두 기록됩니다. 지원 보기 세션은 이 로그에 실시간으로 쌓여요.
              </span>
            </Note>
          </>
        )}
      </div>
    </AdminShell>
  );
}

function AlertMini({ className = "" }: { className?: string }) {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className}`}>
      <path d="M12 3 2.5 20h19z" /><path d="M12 10v4M12 17.2h.01" />
    </svg>
  );
}
function ShieldMini() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="text-accent shrink-0">
      <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" /><path d="M9.5 12l1.8 1.8 3.2-3.6" />
    </svg>
  );
}
function FlagMini({ tone }: { tone: string }) {
  const c = tone === "accent" ? "text-accent-ink" : tone === "warn" ? "text-warn-ink" : "text-ink3";
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${c}`}>
      <path d="M5 21V4h11l-1.5 4L16 12H5" />
    </svg>
  );
}
