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
      /* 13차 B P0-1: 완료 판정 = webhook APPLY + Payment CAPTURED +
         청구서 PAID 서버 확인 후에만. 실패·확인중은 사유와 함께 표시. */
      setProcessing(true);
      const r = await live.pay();
      setProcessing(false);
      if (r.ok) toast("결제 확정 — 서버가 CAPTURED·PAID 를 확인했어요");
      else toast(r.message ?? "결제 실패 — 재시도하면 같은 멱등키로 안전하게 이어져요");
      return;
    }
    setProcessing(true);
    // PG 시뮬레이션: 제출(AUTHORIZED)만 기록 — 승인 확정(CAPTURED)은 완료 화면의
    // 시뮬 webhook 이 처리. 실서비스: 결제준비 API → PG SDK → 서버 상태 재조회.
    dispatch({ t: "paymentSubmitted", names: selNames(), method });
    router.push("/parent/pay/done");
  };

  /* 14차 B P0: 결제 페이지는 상태별로 명시 분기 — LIVE_ERROR·LOADING 에서
     fixture 금액·모의 결제 진입 금지(fail-closed). fixture 결제는 FIXTURE_PREVIEW 만. */
  if (live.state === "LIVE_LOADING") {
    return (
      <>
        <PushHeader title="결제하기" sub="연결 확인 중" />
        <AppScroll>
          <div className="rounded-2xl border border-line bg-surface p-6 text-center text-[13px] font-semibold text-ink3">
            서버 연결을 확인하고 있어요 — 결제는 확인 후에만 진행돼요
          </div>
        </AppScroll>
      </>
    );
  }
  if (live.state === "LIVE_ERROR") {
    return (
      <>
        <PushHeader title="결제하기" sub="연결 오류" />
        <AppScroll>
          <div className="rounded-2xl border border-danger-weak bg-danger-weak p-5 text-center">
            <div className="text-[15px] font-extrabold text-danger-ink">결제를 진행할 수 없어요</div>
            <div className="mt-1.5 text-[12.5px] font-medium text-ink2 leading-normal">
              서버 오류({live.errorMsg}) — 데모 화면으로 대체하지 않아요. 잠시 후 다시 시도해주세요.
            </div>
            <button
              onClick={live.retry}
              className="mt-4 h-11 w-full rounded-xl bg-accent-strong text-[14px] font-bold text-white"
            >
              다시 연결
            </button>
          </div>
        </AppScroll>
      </>
    );
  }

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
