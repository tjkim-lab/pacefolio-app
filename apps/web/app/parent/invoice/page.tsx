"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppScroll } from "@/components/mobile/MobileShell";
import { cn } from "@/components/ui";
import { useParent } from "../_state";
import { useLive, LiveBadge } from "../_live";
import { NoteRow, PushHeader } from "../_components";
import { won, type ChildName } from "../_data";

export default function InvoicePage() {
  const live = useLive();
  if (live.live) return <LiveInvoicePage />;
  return <FixtureInvoicePage />;
}

/* ── Gate 2: 실 API 청구서 — 금액·상태·구성 전부 서버 정본 ── */
function LiveInvoicePage() {
  const live = useLive();
  const router = useRouter();
  return (
    <>
      <PushHeader title="9~11월 청구서" sub={`실 DB ${live.invoices.length}건`} />
      <LiveBadge />
      <AppScroll>
        <div className="rounded-2xl border border-line overflow-hidden bg-surface">
          <div className="bg-side text-white p-4">
            <div className="text-[11px] font-semibold opacity-75">원더짐 아카데미 · 9~11월 수강료</div>
            <h3 className="text-[17px] font-extrabold mt-1.5">
              {live.invoices.map((i) => i.participantName.slice(1)).join("·")} 합산 결제
            </h3>
            <div className="text-[12px] opacity-80 font-medium mt-0.5">청구 {live.invoices.length}건 · 서버가 계산한 정본 금액</div>
          </div>
          <div className="px-4 pb-3">
            {live.invoices.map((iv) => (
              <div key={iv.invoiceId}>
                <Sub>{iv.participantName} 청구 {iv.status === "PAID" ? "· 완납 ✓" : iv.status === "REFUNDED" ? "· 환불됨" : ""}</Sub>
                {iv.lines.map((l) => (
                  <Line key={l.label} label={l.label} small={l.type === "DISCOUNT" ? "할인" : "수업기간 9/1~11/30"}
                    amt={`${l.amount < 0 ? "−" : l.type === "VEHICLE" ? "+" : ""}${Math.abs(l.amount).toLocaleString()}`}
                    disc={l.amount < 0} />
                ))}
                <InvSel
                  name={iv.participantName.slice(1)}
                  amt={iv.total.toLocaleString()}
                  paid={iv.status !== "ISSUED"}
                  sel={!!live.sel[iv.invoiceId]}
                  onToggle={() => iv.status === "ISSUED" && live.toggle(iv.invoiceId)}
                />
              </div>
            ))}
            <div className="flex justify-between items-center py-3.5 border-t border-line">
              <span className="text-[15px] font-bold text-ink">선택 결제액 <small className="text-[11.5px] font-medium text-ink3">체크한 원생만 결제</small></span>
              <span className="text-[20px] font-extrabold tracking-tight text-ink">{won(live.selAmount)}</span>
            </div>
          </div>
        </div>
        <button onClick={() => router.push("/parent/pay")} disabled={live.selAmount === 0}
          className="w-full rounded-xl bg-accent-strong text-white text-[15px] font-bold py-3.5 disabled:opacity-50">
          결제하러 가기
        </button>
        <NoteRow icon="bulb">이 화면은 <b className="text-ink">실 API 정본</b>이에요 — 결제·환불이 서버 정산에 즉시 반영돼요. 청구는 원생별, 형제는 합산 결제.</NoteRow>
      </AppScroll>
    </>
  );
}

function FixtureInvoicePage() {
  const { st, isPaid, selAmt, dispatch, toast } = useParent();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <PushHeader title="9~11월 청구서" sub="원생별 2건 · 합산" />
      <AppScroll>
        <div className="rounded-2xl border border-line overflow-hidden bg-surface">
          <div className="bg-side text-white p-4">
            <div className="text-[11px] font-semibold opacity-75">원더짐 아카데미 · 9~11월 수강료</div>
            <h3 className="text-[17px] font-extrabold mt-1.5">도담·서준 합산 결제</h3>
            <div className="text-[12px] opacity-80 font-medium mt-0.5">수업기간 9/1~11/30 · 결제 마감 11/10 (월) <span className="text-[11px] font-bold bg-white/[0.18] px-2 py-0.5 rounded-full ml-1.5">D-14</span></div>
          </div>
          <div className="px-4 pb-3">
            <Sub>도담 청구</Sub>
            <Line label="플레이2 수강료" small="수업기간 9/1~11/30 · 최종 23회 · 주 2회" amt="360,000" />
            <Line label="차량비" small="기간 · 별도 · 할인 없음" amt="+45,000" />
            <InvSel name="도담" amt="405,000" paid={isPaid("도담")} sel={st.invSel["도담"]} onToggle={() => tog("도담")} />
            <Sub>서준 청구</Sub>
            <Line label="플레이2 수강료" small="수업기간 9/1~11/30 · 최종 23회 · 주 2회" amt="360,000" />
            <Line label="형제할인 20%" small="둘째(서준) 수강료에 적용" amt="−72,000" disc />
            <Line label="차량비" small="기간 · 별도 · 할인 없음" amt="+45,000" />
            <InvSel name="서준" amt="333,000" paid={isPaid("서준")} sel={st.invSel["서준"]} onToggle={() => tog("서준")} />
            <div className="flex justify-between items-center py-3.5 border-t border-line">
              <span className="text-[15px] font-bold text-ink">선택 결제액 <small className="text-[11.5px] font-medium text-ink3">체크한 원생만 결제</small></span>
              <span className="text-[20px] font-extrabold tracking-tight text-ink">{won(selAmt())}</span>
            </div>
          </div>
        </div>

        <button onClick={() => setOpen((v) => !v)} className="w-full rounded-xl bg-fill border border-line text-ink2 text-[15px] font-bold py-3.5">
          {open ? "회차 계산 기준 접기" : "회차 계산 기준 보기 (예정 24 − 휴무 1 = 23회)"}
        </button>
        {open && (
          <div>
            <div className="rounded-2xl border border-line px-4">
              {[["예정 수업", "24회"], ["학원 휴무 차감", "−1회 (10/13(월) 시설 점검)"], ["최종 청구 회차", "23회"]].map(([k, v], i) => (
                <div key={i} className={cn("flex justify-between py-2.5 text-[13.5px]", i < 2 && "border-b border-line2")}>
                  <span className="text-ink3 font-medium">{k}</span><span className="font-bold text-ink">{v}</span>
                </div>
              ))}
            </div>
            <div className="text-[11px] text-ink3 font-medium mt-1.5">회차·금액은 원장 앱이 반별 실제 수업 캘린더로 확정한 값과 동일한 청구서예요.</div>
          </div>
        )}

        <button onClick={() => router.push("/parent/pay")} className="w-full rounded-xl bg-accent-strong text-white text-[15px] font-bold py-3.5">결제하러 가기</button>
        <div className="text-center">
          <button onClick={() => toast("수정요청을 원장님께 보냈어요 — 확인 후 알려드릴게요")}
            className="text-[12.5px] font-bold text-ink3 underline underline-offset-2">금액이 이상해요 — 수정요청 보내기</button>
        </div>
        <NoteRow icon="bulb">청구는 <b className="text-ink">원생별</b>로 나뉘고, 같은 학원 형제는 <b className="text-ink">합산 결제</b>할 수 있어요. 환불·정산은 원생별 소계 기준으로 처리돼요. 이상하면 수정요청 — 전화 없이 원장님께 접수돼요.</NoteRow>
      </AppScroll>
    </>
  );

  function tog(name: ChildName) {
    if (isPaid(name)) { toast(`${name} 청구서는 이미 완납됐어요`); return; }
    dispatch({ t: "toggleInv", name });
  }
}

function Sub({ children }: { children: React.ReactNode }) {
  return <div className="text-[12px] font-extrabold text-ink3 pt-3">{children}</div>;
}
function Line({ label, small, amt, disc }: { label: string; small: string; amt: string; disc?: boolean }) {
  return (
    <div className="flex justify-between items-center gap-2.5 py-3 border-b border-line2">
      <span className="flex-1 text-[14px] font-medium text-ink2">{label} <small className="block text-[11.5px] text-ink3 font-medium mt-0.5">{small}</small></span>
      <span className={cn("text-[14px] font-semibold whitespace-nowrap", disc ? "text-accent-ink" : "text-ink")}>{amt}</span>
    </div>
  );
}
function InvSel({ name, amt, paid, sel, onToggle }: { name: string; amt: string; paid: boolean; sel: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle} role="checkbox" aria-checked={paid || sel}
      className={cn("flex w-full justify-between items-center gap-2.5 py-3 border-b border-line2 text-left", paid && "opacity-55 cursor-default")}>
      <span className="flex-1 text-[14px] font-bold text-ink flex items-center gap-1.5">
        <span className="text-[13px]">{paid ? "완납✓" : sel ? "☑" : "☐"}</span> {name} 소계 결제
      </span>
      <span className="text-[14px] font-bold text-ink whitespace-nowrap">{amt}</span>
    </button>
  );
}
