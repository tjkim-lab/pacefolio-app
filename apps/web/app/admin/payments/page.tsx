"use client";

import { useState } from "react";
import { AdminShell } from "../_shell";
import { Tag } from "@/components/ui";
import { SubTabs, Panel, Note, MetricRow, useToast } from "../_ui";
import { BATCHES, FAILS, AUTOPAY, REFUNDS } from "../_data";

type Tab = "batch" | "fail" | "auto" | "refund";

export default function AdminPayments() {
  const [tab, setTab] = useState<Tab>("batch");
  const { toast, toastView } = useToast();
  const [retried, setRetried] = useState<Record<number, boolean>>({});

  return (
    <AdminShell title="수강료 관제">
      <div className="space-y-3">
        <div>
          <h2 className="text-[19px] font-extrabold tracking-tight">수강료 관제</h2>
          <p className="text-[12.5px] text-ink3 font-medium mt-0.5">
            학부모 → 학원 흐름 · 운영자는 상태·예외를 관리(카드정보 열람·직접 변경 불가)
          </p>
        </div>

        <SubTabs<Tab>
          value={tab}
          onChange={setTab}
          tabs={[
            { key: "batch", label: "청구 배치" },
            { key: "fail", label: "결제 실패" },
            { key: "auto", label: "자동결제" },
            { key: "refund", label: "환불" },
          ]}
        />

        {tab === "batch" && (
          <>
            <div className="rounded-2xl bg-surface border border-line px-4">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-ink3 text-[11px] border-b border-line">
                    <th className="text-left font-bold py-2.5">학원</th>
                    <th className="text-left font-bold py-2.5">청구기간</th>
                    <th className="text-left font-bold py-2.5">원생</th>
                    <th className="text-left font-bold py-2.5">총 청구액</th>
                    <th className="text-left font-bold py-2.5">원장 확정</th>
                    <th className="text-left font-bold py-2.5">도달/열람</th>
                    <th className="text-left font-bold py-2.5">결제완료</th>
                    <th className="text-left font-bold py-2.5">미납</th>
                  </tr>
                </thead>
                <tbody>
                  {BATCHES.map((b) => (
                    <tr key={b.acad} className="border-b border-line2 last:border-0">
                      <td className="py-3 text-ink">{b.acad}</td>
                      <td className="py-3 text-ink2">{b.period}</td>
                      <td className="py-3 text-ink2">{b.kids}</td>
                      <td className="py-3 font-semibold text-ink">{b.amount}</td>
                      <td className="py-3"><Tag tone={b.confirm.tone}>{b.confirm.label}</Tag></td>
                      <td className="py-3 text-ink2">{b.reach}</td>
                      <td className="py-3">{b.paidTone ? <span className="text-accent-ink font-bold">{b.paid}</span> : <span className="text-ink2">{b.paid}</span>}</td>
                      <td className="py-3">{b.unpaid ? <Tag tone={b.unpaid.tone}>{b.unpaid.label}</Tag> : <span className="text-ink3">-</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Note tone="warn">
              <AlertMini className="text-warn-ink" />
              <span><b className="font-bold">강동 스포츠클럽</b> 청구 초안에서 오류 2건(일할계산 회차 불일치). D-Day 전 원장 확인 필요 — CS로 연결됩니다.</span>
            </Note>
          </>
        )}

        {tab === "fail" && (
          <>
            <div className="rounded-2xl bg-surface border border-line px-4">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-ink3 text-[11px] border-b border-line">
                    <th className="text-left font-bold py-2.5">보호자(마스킹)</th>
                    <th className="text-left font-bold py-2.5">학원</th>
                    <th className="text-left font-bold py-2.5">실패 사유</th>
                    <th className="text-left font-bold py-2.5">금액</th>
                    <th className="text-left font-bold py-2.5">상태</th>
                    <th className="py-2.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {FAILS.map((f, i) => (
                    <tr key={i} className="border-b border-line2 last:border-0">
                      <td className="py-3 text-ink">{f.who}</td>
                      <td className="py-3 text-ink2">{f.acad}</td>
                      <td className="py-3"><span className="text-danger-ink font-semibold">{f.reason}</span></td>
                      <td className="py-3 text-ink2">{f.amt}</td>
                      <td className="py-3 text-ink2">{f.st}</td>
                      <td className="py-3 text-right">
                        <button
                          disabled={retried[i]}
                          onClick={() => {
                            setRetried((p) => ({ ...p, [i]: true }));
                            toast("재시도를 요청했어요 — 보호자에게 안내 발송 (카드정보 열람·변경 아님)");
                          }}
                          className={`rounded-lg text-[11px] font-bold px-2.5 py-1.5 border ${
                            retried[i] ? "bg-accent-strong text-white border-accent-strong cursor-default" : "border-accent text-brand"
                          }`}
                        >
                          {retried[i] ? "요청됨" : "재시도 요청"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Note>
              <CardMini />
              <span>운영자는 <b className="text-ink font-bold">카드정보를 보거나 직접 변경할 수 없습니다.</b> 재시도 요청·원장/보호자 안내만 가능해요.</span>
            </Note>
          </>
        )}

        {tab === "auto" && (
          <Panel title="학원별 자동결제 등록률" note="결제·리텐션 핵심 지표">
            {AUTOPAY.map((r) => (
              <MetricRow key={r.acad} label={r.acad} value={r.pct + "%"} pct={r.pct} tone={r.tone} />
            ))}
            <Note tone="inpanel">
              <FlagMini />
              <span>
                자동결제를 쓰지 않는 학원(월결제·계좌이체·PG 미연결)도 있어, 이 지표 하나만 보지 않고 <b className="text-ink font-bold">자가처리 완료율·유지율·리포트 발송률</b>과 함께 봅니다.
              </span>
            </Note>
          </Panel>
        )}

        {tab === "refund" && (
          <>
            <div className="rounded-2xl bg-surface border border-line px-4">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-ink3 text-[11px] border-b border-line">
                    <th className="text-left font-bold py-2.5">보호자(마스킹)</th>
                    <th className="text-left font-bold py-2.5">학원</th>
                    <th className="text-left font-bold py-2.5">예상 환불액</th>
                    <th className="text-left font-bold py-2.5">진행 단계</th>
                    <th className="text-left font-bold py-2.5">지연</th>
                  </tr>
                </thead>
                <tbody>
                  {REFUNDS.map((r, i) => (
                    <tr key={i} className="border-b border-line2 last:border-0">
                      <td className="py-3 text-ink">{r.who}</td>
                      <td className="py-3 text-ink2">{r.acad}</td>
                      <td className="py-3 text-ink2">{r.amount}</td>
                      <td className="py-3"><Tag tone={r.stage.tone}>{r.stage.label}</Tag></td>
                      <td className="py-3">{r.delay === "-" ? <span className="text-ink3">-</span> : <span className="text-danger-ink font-bold">{r.delay}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Note>
              <CheckMini />
              <span>
                환불은 <b className="text-ink font-bold">보호자 요청 → 시스템 예상액 → 보호자 확인 → 원장 확인 → PG 접수 → 완료</b>. 각 단계가 어디서 멈췄는지 추적하고, 법정 기준 위반 여부를 자동 검증합니다.
              </span>
            </Note>
          </>
        )}
      </div>
      {toastView}
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
function CardMini() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="text-accent shrink-0">
      <rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="M3 10h18M7 15h4" />
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
function CheckMini() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="text-accent shrink-0">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
