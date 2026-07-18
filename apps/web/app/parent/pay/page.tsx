"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppScroll } from "@/components/mobile/MobileShell";
import { cn } from "@/components/ui";
import { useParent } from "../_state";
import { useLive, LiveBadge } from "../_live";
import { AutoToggle, MethodChip, NoteRow, PushHeader } from "../_components";
import { won } from "../_data";

export default function PayPage() {
  const { st, selAmt, selNames, dispatch, toast } = useParent();
  const live = useLive();
  const router = useRouter();
  const [processing, setProcessing] = useState(false);
  const amt = live.live ? live.selAmount : selAmt();
  const method = st.payMethod;

  const go = async () => {
    if (processing || amt === 0) return;
    if (live.live) {
      // Gate 2: 실 API — 결제 준비(서버 금액·멱등키) → PG 시뮬 웹훅 CAPTURED → 정산 반영
      setProcessing(true);
      try {
        const ok = await live.pay();
        if (ok) toast("결제 완료 — 서버 웹훅(CAPTURED)이 청구서를 PAID 로 확정했어요");
      } catch {
        toast("결제 실패 — API 로그를 확인하세요");
      } finally {
        setProcessing(false);
      }
      return;
    }
    setProcessing(true);
    // PG 시뮬레이션: 제출(AUTHORIZED)만 기록 — 승인 확정(CAPTURED)은 완료 화면의
    // 시뮬 webhook 이 처리. 실서비스: 결제준비 API → PG SDK → 서버 상태 재조회.
    dispatch({ t: "paymentSubmitted", names: selNames(), method });
    router.push("/parent/pay/done");
  };

  if (live.live && live.payResult) {
    return (
      <>
        <PushHeader title="결제 완료" sub={won(live.payResult.amount)} />
        <LiveBadge />
        <AppScroll>
          <div className="rounded-2xl border border-line bg-surface p-5 text-center">
            <div className="text-[40px]">✅</div>
            <div className="mt-2 text-[17px] font-extrabold text-ink">{won(live.payResult.amount)} 결제 확정</div>
            <div className="mt-1.5 text-[12.5px] font-medium leading-normal text-ink3">
              결제 준비(서버 금액 계산) → PG 웹훅 CAPTURED → 정산 재계산까지
              <b className="text-ink"> 실 API·실 DB</b> 로 처리됐어요
              <div className="mt-1 font-mono text-[11px]">{live.payResult.paymentId}</div>
            </div>
            <button
              onClick={() => { live.resetPay(); router.push("/parent/invoice"); }}
              className="mt-4 h-11 w-full rounded-xl bg-accent-strong text-[14px] font-bold text-white"
            >
              청구서에서 PAID 확인
            </button>
          </div>
          <NoteRow icon="shield">실 PG 연동(Gate 3) 시 이 자리에서 PG SDK 결제창이 열려요 — 서버 확정은 지금과 동일하게 웹훅만 신뢰해요.</NoteRow>
        </AppScroll>
      </>
    );
  }

  return (
    <>
      <PushHeader title="결제하기" sub={won(amt)} />
      <LiveBadge />
      <div className="mx-4 mt-2 rounded-lg bg-amber-100 text-amber-800 text-[11.5px] font-bold px-3 py-1.5 text-center">
        {live.live ? "결제대행(PG)만 시뮬 — 청구·정산은 실 서버" : "PG 시뮬레이션 — 실제 결제가 아니에요"}
      </div>
      <AppScroll>
        <div className="space-y-2.5">
          <MethodChip label="카카오페이" pico="pay" picoBg="#FEE500" picoInk="#191600" selected={method === "카카오페이"} onSelect={() => dispatch({ t: "payMethod", method: "카카오페이" })} />
          <MethodChip label="토스" pico="toss" picoBg="#0064FF" picoInk="#fff" selected={method === "토스"} onSelect={() => dispatch({ t: "payMethod", method: "토스" })} />
          <MethodChip label="신용·체크카드" pico="카드" selected={method === "신용카드"} onSelect={() => dispatch({ t: "payMethod", method: "신용카드" })} />
        </div>

        <AutoToggle />

        <button onClick={go} disabled={processing || amt === 0}
          className={cn("w-full rounded-2xl py-3.5 text-[15px] font-bold disabled:opacity-60",
            method === "카카오페이" ? "bg-[#FEE500] text-[#191600]" : "bg-accent-strong text-white")}>
          {processing ? "결제 처리 중..." : `${method === "카카오페이" ? "카카오페이" : method}로 ${won(amt)} 결제`}
        </button>

        <NoteRow icon="shield">결제는 PG 화면에서 진행 — <b className="text-ink">카드번호는 저장하지 않아요.</b> 자동결제도 PG 정기결제로 등록돼요.</NoteRow>
      </AppScroll>
    </>
  );
}
