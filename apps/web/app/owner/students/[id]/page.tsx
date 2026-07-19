"use client";

/* owner 원생 상세(#52·#53) — READY = getParticipantDetail 서버 정본(기본 정보·반/담당·
   보호자 연결(관계·검증·결제권한 — 이름·연락처 미포함)·출석 집계(실제 기록 기준)·수납).
   서버 정본이 없는 차량·보강 카드는 READY 에서 미표시(위장 금지). FIXTURE = 기존 데모 유지. */
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AppHeader, AppScroll } from "@/components/mobile/MobileShell";
import { Card } from "@/components/ui";
import { useToast, useConfirm, CardH4, RLRow, CheckRow } from "../../_kit";
import { kidById, type Makeup } from "../../_data";
import { OwnerLiveProvider, useOwnerLive, type ParticipantDetailData } from "../../../pc/_live";

const ST_KO: Record<string, string> = { ENROLLED: "재원", TRIAL: "체험", ON_BREAK: "휴원", WITHDRAWN: "퇴원" };
const REL_KO: Record<string, string> = {
  MOTHER: "어머님", FATHER: "아버님", GRANDPARENT: "조부모님", LEGAL_GUARDIAN: "법정대리인", OTHER: "보호자",
};
const VS_KO: Record<string, string> = {
  VERIFIED: "연결 완료", PENDING: "확인 중", UNVERIFIED: "미연결", REJECTED: "거절됨", REVOKED: "해제됨",
};
const INV_KO: Record<string, string> = {
  DRAFT: "초안", ISSUED: "청구 발행", PARTIALLY_PAID: "부분 수납", PAID: "완납",
  OVERDUE: "미납", VOID: "취소", REFUNDED: "환불 완료",
};
const fmt = (n: number) => Math.round(n).toLocaleString("ko-KR");

export default function KidDetail() {
  return (
    <OwnerLiveProvider>
      <KidDetailBody />
    </OwnerLiveProvider>
  );
}

function KidDetailBody() {
  const params = useParams<{ id: string }>();
  const live = useOwnerLive();
  const kid = kidById(params.id);
  const { toast, toastNode } = useToast();
  const { confirm, confirmNode } = useConfirm();

  // 보강 처리 상태 (완료 기록) — FIXTURE 데모 전용
  const [records, setRecords] = useState<Record<number, string>>({});
  const makeups: Makeup[] = kid?.makeups ?? [];
  const remaining = makeups.length - Object.keys(records).length;

  /* READY — 서버 상세 */
  const [detail, setDetail] = useState<ParticipantDetailData | null>(null);
  const [detailState, setDetailState] = useState<"loading" | "ready" | "notfound" | "error">("loading");
  const [detailMsg, setDetailMsg] = useState("");
  const fetchDetail = live.participantDetail;
  useEffect(() => {
    if (live.state !== "READY") return;
    let stale = false;
    void fetchDetail(params.id).then((r) => {
      if (stale) return;
      if (r.ok && r.detail) {
        setDetail(r.detail);
        setDetailState("ready");
      } else {
        setDetailMsg(r.message);
        setDetailState(r.message.includes("찾을 수 없") ? "notfound" : "error");
      }
    });
    return () => { stale = true; };
  }, [live.state, fetchDetail, params.id]);

  if (live.state !== "FIXTURE") {
    const p = detail?.participant;
    const clsLabel = detail?.enrollments.map((e) => e.className).join(" · ") || "반 미배정";
    return (
      <>
        <AppHeader
          title={
            p ? (
              <span>
                {p.name}
                <small className="block text-[11.5px] font-medium text-ink3">
                  {p.ageLabel} · {clsLabel} · {ST_KO[p.status] ?? p.status}
                </small>
              </span>
            ) : (
              "원생"
            )
          }
          back="/owner/students"
        />
        <AppScroll>
          {detailState === "ready" && detail && p ? (
            <>
              {/* 기본 정보 — 서버 정본 */}
              <Card>
                <CardH4 note="서버 정본">기본 정보</CardH4>
                {detail.enrollments.length ? (
                  detail.enrollments.map((e) => (
                    <RLRow
                      key={e.classId}
                      label="반 · 담당"
                      amount={`${e.className}${e.coachNames.length ? ` · ${e.coachNames.join("·")} 코치` : ""}`}
                    />
                  ))
                ) : (
                  <RLRow label="반 · 담당" amount="반 미배정" />
                )}
                <RLRow label="상태" small="이 학원에서의 등록 기준" amount={ST_KO[p.status] ?? p.status} />
                <RLRow label="생년월일" amount={p.birth} />
                <RLRow
                  label="출석"
                  small={
                    detail.attendance.total > 0
                      ? `실제 기록 ${detail.attendance.total}회 · 결석 ${detail.attendance.absent}회 · 지각 ${detail.attendance.late}회`
                      : "코치가 확정한 실제 출결 기준"
                  }
                  amount={detail.attendance.ratePct !== null ? `${detail.attendance.ratePct}%` : "기록 없음"}
                />
                {detail.guardians.length ? (
                  detail.guardians.map((g, i) => (
                    <RLRow
                      key={i}
                      label={i === 0 ? "보호자 연결" : " "}
                      small={g.canPay ? "결제 권한 있음" : "결제 권한 없음"}
                      amount={`${REL_KO[g.relationshipType] ?? g.relationshipType}${g.isPrimaryGuardian ? " (주 보호자)" : ""} · ${VS_KO[g.verificationStatus] ?? g.verificationStatus}`}
                    />
                  ))
                ) : (
                  <RLRow label="보호자 연결" small="폰번호 클레임으로 연결돼요" amount="미연결" />
                )}
              </Card>

              {/* 수납 — 원장 화면(금액 표시) */}
              <Card>
                <CardH4 note={`${detail.invoices.length}건`}>수납 상태</CardH4>
                {detail.invoices.length === 0 ? (
                  <div className="py-4 text-center text-[12.5px] font-medium text-ink3">청구 내역이 없어요</div>
                ) : (
                  detail.invoices.map((inv) => (
                    <RLRow
                      key={inv.invoiceId}
                      label={INV_KO[inv.status] ?? inv.status}
                      small={`마감 ${inv.dueDate} · ${inv.lines.map((l) => l.label).join(" · ") || "내역 없음"}`}
                      amount={`${fmt(inv.total)}원`}
                      amountClass={inv.status === "OVERDUE" || inv.status === "ISSUED" ? "text-danger" : "text-accent-ink"}
                    />
                  ))
                )}
              </Card>
            </>
          ) : live.state === "ERROR" ? (
            <div className="py-10 text-center text-[13px] font-medium text-danger">
              서버 연결 오류 — {live.errorMsg ?? "데이터를 불러오지 못했어요"}
            </div>
          ) : detailState === "notfound" ? (
            <div className="py-10 text-center text-[14px] text-ink3">원생을 찾을 수 없어요.</div>
          ) : detailState === "error" ? (
            <div className="py-10 text-center text-[13px] font-medium text-danger">{detailMsg}</div>
          ) : (
            <div className="py-10 text-center text-[13px] font-medium text-ink3">불러오는 중…</div>
          )}
        </AppScroll>
        {toastNode}
        {confirmNode}
      </>
    );
  }

  if (!kid) {
    return (
      <>
        <AppHeader title="원생" back="/owner/students" />
        <AppScroll>
          <div className="py-10 text-center text-[14px] text-ink3">원생을 찾을 수 없어요.</div>
        </AppScroll>
      </>
    );
  }

  function markMakeup(i: number, m: Makeup) {
    if (records[i]) return;
    confirm({
      title: "보강 처리 완료",
      sub: m.t,
      rows: [["기록", "이 보강 건을 처리 완료로 기록"]],
      warn:
        "PACEFOLIO는 실제 보강 일정이나 진행 방식을 관리하지 않아요. 원장님이 학원 운영 방식에 따라 처리를 마친 뒤 기록해 주세요.",
      memo: "처리 메모 (선택) — 예: 다음 달 수업으로 대체",
      label: "처리 완료",
      onConfirm: (memo) => {
        const rec = "처리 완료 · 원장님 · 오늘 14:20" + (memo ? " · " + memo : "");
        setRecords((prev) => {
          const next = { ...prev, [i]: rec };
          if (Object.keys(next).length === makeups.length) toast("보강 미처리가 모두 기록됐어요");
          else toast("보강 1건 처리 완료로 기록");
          return next;
        });
      },
    });
  }

  const rideParts = kid.veh?.ride.split(" · ") ?? [];
  const dropParts = kid.veh?.drop.split(" · ") ?? [];

  return (
    <>
      <AppHeader
        title={
          <span>
            {kid.nm}
            <small className="block text-[11.5px] font-medium text-ink3">
              {kid.age}세 · {kid.cls} · {kid.status}
            </small>
          </span>
        }
        back="/owner/students"
      />
      <AppScroll>
        {/* 기본 정보 */}
        <Card>
          <CardH4>기본 정보</CardH4>
          <RLRow label="반 · 담당" amount={`${kid.cls} · ${kid.coach} 코치`} />
          <RLRow label="상태" small="이 학원(원더짐)에서의 등록 기준" amount={kid.status} />
          <RLRow label="학부모" amount={kid.parent} />
          {kid.sib && <RLRow label="형제" small="합산 결제 편의 — 수납 기록은 각자 분리" amount={kid.sib} />}
          <RLRow label="출석 (이번 분기)" amount={kid.id === "ian" ? "입회 첫 주" : "92%"} />
          {kid.alert && <RLRow label="안전 특이사항" amount={kid.alert} amountClass="text-danger" />}
        </Card>

        {/* 차량 */}
        {kid.veh && (
          <Card>
            <CardH4 note="이용">차량 🚌</CardH4>
            <RLRow label="탑승" small={rideParts[1]} amount={rideParts[0]} />
            <RLRow label="하원" small={dropParts[1]} amount={dropParts[0]} />
            <RLRow
              label="카시트·특이사항"
              amount={<span className="block max-w-[56%] whitespace-normal text-right text-[13px] font-semibold">{kid.veh.seat}</span>}
            />
          </Card>
        )}

        {/* 수납 상태 */}
        <Card>
          <CardH4 note="9월 시작 기간">수납 상태</CardH4>
          <RLRow
            label="상태"
            small={kid.payDetail}
            amount={kid.pay}
            amountClass={kid.pay === "미납" ? "text-danger" : "text-accent-ink"}
          />
        </Card>

        {/* 보강 미처리 */}
        {makeups.length > 0 && (
          <Card>
            <CardH4 note={`${remaining}건`}>보강 미처리</CardH4>
            {remaining === 0 ? (
              <div className="py-4 text-center">
                <div className="text-[34px]">✅</div>
                <div className="mt-1 text-[13.5px] font-extrabold text-accent-ink">보강이 모두 처리됐어요</div>
              </div>
            ) : (
              makeups.map((m, i) => {
                const done = !!records[i];
                return (
                  <CheckRow
                    key={i}
                    checked={done}
                    title={m.t}
                    sub={m.s}
                    onClick={() => markMakeup(i, m)}
                    trailing={
                      <span
                        className={`block max-w-[7rem] text-[11px] font-extrabold leading-tight ${done ? "text-accent-ink" : "text-ink3"}`}
                      >
                        {done ? records[i] : "보강 처리 완료"}
                      </span>
                    }
                  />
                );
              })
            )}
          </Card>
        )}
        <div className="h-2" />
      </AppScroll>
      {toastNode}
      {confirmNode}
    </>
  );
}
