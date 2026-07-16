"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppScroll } from "@/components/mobile/MobileShell";
import { Button } from "@/components/ui";
import { Ic } from "../../_icons";
import { useParent, PG_SIMULATION, PG_SIMULATION_CAPTURE_MS } from "../../_state";
import { PushHeader } from "../../_components";
import { won } from "../../_data";

/* 결제 결과 — UI 성공 ≠ PG CAPTURED (R3 P1-6).
   제출(AUTHORIZED) → "승인 확인 중" → 시뮬 webhook 이 CAPTURED 확정 → 완료.
   실서비스: 이 화면은 GET /payments/{id} 재조회가 진실 — URL 직접 접근 시에도. */

export default function PayDonePage() {
  const { st, toast, dispatch } = useParent();
  const router = useRouter();
  const r = st.receipt;

  // PG 시뮬레이션 webhook — 실서비스에서는 서버 webhook/재조회가 CAPTURED 를 확정.
  // R5 P0: 게이트 밖(프로덕션)에서는 타이머 자체를 걸지 않는다(reducer 도 무시함).
  useEffect(() => {
    if (!PG_SIMULATION) return;
    if (r?.status !== "AUTHORIZED") return;
    const t = setTimeout(() => dispatch({ t: "paymentCaptured" }), PG_SIMULATION_CAPTURE_MS);
    return () => clearTimeout(t);
  }, [r?.status, dispatch]);

  // 결제 기록 없음(완료 URL 직접 접근 등) — 성공으로 단정하지 않는다
  if (!r) {
    return (
      <>
        <PushHeader title="결제 상태 확인" />
        <AppScroll>
          <div className="text-center pt-10">
            <div className="mx-auto mb-4 w-20 h-20 rounded-full bg-fill text-ink3 grid place-items-center"><Ic name="doc" size={36} /></div>
            <h3 className="text-[19px] font-extrabold text-ink mb-1.5">결제 내역을 확인할 수 없어요</h3>
            <p className="text-ink3 text-[13.5px] leading-relaxed mb-6 font-medium">
              결제가 완료됐다고 단정하지 않아요.<br />청구서 화면에서 결제 상태를 다시 확인해 주세요.
            </p>
            <Button full variant="primary" onClick={() => router.push("/parent/invoice")}>결제 상태 다시 확인</Button>
          </div>
        </AppScroll>
      </>
    );
  }

  // 제출됨 — PG 승인 확인 중 (완료 아님)
  if (r.status === "AUTHORIZED") {
    return (
      <>
        <PushHeader title="승인 확인 중" />
        <AppScroll>
          <div className="text-center pt-10">
            <div className="mx-auto mb-4 w-20 h-20 rounded-full bg-accent-weak text-accent grid place-items-center animate-pulse"><Ic name="clock" size={36} /></div>
            <h3 className="text-[19px] font-extrabold text-ink mb-1.5">결제를 확인하고 있어요</h3>
            <p className="text-ink3 text-[13.5px] leading-relaxed font-medium">
              {won(r.amount)} · {r.method}<br />
              결제 제출은 완료 — <b className="text-ink">PG 승인 확인 중</b>이에요. 잠시만요.
            </p>
            <p className="text-[11px] text-amber-600 font-bold mt-5">PG 시뮬레이션 — 실서비스는 webhook/재조회로 확정</p>
          </div>
        </AppScroll>
      </>
    );
  }

  // CAPTURED — 승인 확정
  const msg = r.allPaid
    ? "도담·서준 청구서 2건 결제가 완료됐어요. 영수증은 우리 아이 탭에서 볼 수 있어요."
    : `${r.names.join("·")} 청구서 결제가 완료됐어요. ${r.pend.join("·")} 청구서는 결제 대기 중이에요.`;

  const rows: [string, string][] = [
    ["결제 금액", won(r.amount)],
    ["결제 수단", r.method],
    // R4 §15 P1-1: 1회 결제 CAPTURED ≠ 자동결제 수단 등록 성공(별도 결과).
    // 등록 확정은 AUTOPAY_REGISTERED 이벤트 수신 후에만 — 시뮬은 "확인 중"까지.
    ["자동결제", r.auto ? "신청됨 · 등록 확인 중" : "미신청"],
    ["결제 증빙", r.proof],
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
            /* R4 §15 P1-2: 결제 완료 ≠ 수강 등록 확정 — Enrollment 활성화
               정책(PENDING_PAYMENT→ACTIVE 전이·이벤트)이 정의되기 전까지
               문구를 결제 사실로 제한 */
            onClick={() => { router.push("/parent"); toast("9~11월 수강료 결제가 완료됐어요 🎉"); }}>
            홈으로
          </Button>
        </div>
      </AppScroll>
    </>
  );
}
