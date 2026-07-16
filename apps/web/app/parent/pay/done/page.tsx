"use client";

import { useRouter } from "next/navigation";
import { AppScroll } from "@/components/mobile/MobileShell";
import { Button } from "@/components/ui";
import { Ic } from "../../_icons";
import { useParent } from "../../_state";
import { PushHeader } from "../../_components";
import { won } from "../../_data";

export default function PayDonePage() {
  const { st, toast } = useParent();
  const router = useRouter();
  const r = st.receipt;

  const msg = !r
    ? "결제가 완료됐어요."
    : r.allPaid
      ? "도담·서준 청구서 2건 결제가 완료됐어요. 영수증은 우리 아이 탭에서 볼 수 있어요."
      : `${r.names.join("·")} 청구서 결제가 완료됐어요. ${r.pend.join("·")} 청구서는 결제 대기 중이에요.`;

  const rows: [string, string][] = [
    ["결제 금액", r ? won(r.amount) : "-"],
    ["결제 수단", r ? r.method : "-"],
    ["자동결제", r?.auto ? "등록 ✓ (다음 수납기간부터)" : "미등록"],
    ["결제 증빙", r ? r.proof : "간편결제 영수증 발급 ✓"],
  ];

  return (
    <>
      <PushHeader title="결제 완료" />
      <AppScroll>
        <div className="text-center pt-6">
          <div className="mx-auto mb-4 w-20 h-20 rounded-full bg-accent-weak text-accent grid place-items-center"><Ic name="check" size={40} /></div>
          <h3 className="text-[21px] font-extrabold text-ink mb-1.5">결제 완료! 🎉</h3>
          <p className="text-ink3 text-[13.5px] leading-relaxed mb-4 font-medium">{msg}</p>
          <div className="text-left rounded-2xl border border-line px-4">
            {rows.map(([k, v], i) => (
              <div key={i} className={i < rows.length - 1 ? "flex justify-between py-2.5 text-[13.5px] border-b border-line2" : "flex justify-between py-2.5 text-[13.5px]"}>
                <span className="text-ink3 font-medium">{k}</span><span className="font-bold text-ink">{v}</span>
              </div>
            ))}
          </div>
          <Button full variant="primary" className="mt-4"
            onClick={() => { router.push("/parent"); toast("9~11월 수강료 결제 완료 — 등록이 확정됐어요 🎉"); }}>
            홈으로
          </Button>
        </div>
      </AppScroll>
    </>
  );
}
