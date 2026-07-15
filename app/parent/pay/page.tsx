"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppScroll } from "@/components/mobile/MobileShell";
import { cn } from "@/components/ui";
import { useParent } from "../_state";
import { AutoToggle, MethodChip, NoteRow, PushHeader } from "../_components";
import { won } from "../_data";

export default function PayPage() {
  const { st, selAmt, selNames, dispatch } = useParent();
  const router = useRouter();
  const [processing, setProcessing] = useState(false);
  const amt = selAmt();
  const method = st.payMethod;

  const go = () => {
    if (processing || amt === 0) return;
    setProcessing(true);
    const names = selNames();
    setTimeout(() => { dispatch({ t: "paySuccess", names, method }); setProcessing(false); router.push("/parent/pay/done"); }, 900);
  };

  return (
    <>
      <PushHeader title="결제하기" sub={won(amt)} />
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
