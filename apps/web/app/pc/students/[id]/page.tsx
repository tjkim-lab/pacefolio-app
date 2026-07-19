"use client";

/* PC 원생 상세(#54) — READY = getParticipantDetail 서버 정본(#52·#53 재사용):
   기본 정보·반/담당·보호자 연결(관계·검증·결제권한 — 이름·연락처 미포함)·출석 집계·수납.
   서버 정본 없는 차량·보강 카드는 READY 미표시(위장 금지). FIXTURE = 기존 데모 유지. */
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PCShell } from "../../_shell";
import { Panel, RL, ActBtn, CheckMark, Spinner, useOverlays } from "../../_ui";
import { IconArrowLeft } from "@/components/ui/icons";
import { KIDS } from "../../_data";
import { OwnerLiveProvider, useOwnerLive, type ParticipantDetailData } from "../../_live";

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
  const live = useOwnerLive();
  const params = useParams<{ id: string }>();
  const router = useRouter();

  if (live.state !== "FIXTURE") {
    return <KidDetailLive live={live} id={params.id} onBack={() => router.push("/pc/students")} />;
  }
  return <KidDetailFixture id={params.id} onBack={() => router.push("/pc/students")} />;
}

function KidDetailLive({
  live, id, onBack,
}: {
  live: ReturnType<typeof useOwnerLive>;
  id: string;
  onBack: () => void;
}) {
  const [detail, setDetail] = useState<ParticipantDetailData | null>(null);
  const [detailState, setDetailState] = useState<"loading" | "ready" | "notfound" | "error">("loading");
  const [detailMsg, setDetailMsg] = useState("");
  const fetchDetail = live.participantDetail;
  useEffect(() => {
    if (live.state !== "READY") return;
    let stale = false;
    void fetchDetail(id).then((r) => {
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
  }, [live.state, fetchDetail, id]);

  const p = detail?.participant;
  const backBtn = (
    <button onClick={onBack} className="inline-flex items-center gap-1.5 border border-line bg-surface text-[12.5px] font-bold px-3 py-1.5 rounded-lg text-ink2 hover:bg-fill">
      <IconArrowLeft size={14} /> 목록
    </button>
  );

  if (detailState === "ready" && detail && p) {
    return (
      <PCShell
        title={<span className="flex items-center gap-3">{backBtn}{p.name}</span>}
        actions={
          <span className="text-[12px] text-ink3 font-medium">
            {p.ageLabel} · {detail.enrollments.map((e) => e.className).join(" · ") || "반 미배정"} · {ST_KO[p.status] ?? p.status} · 서버 정본
          </span>
        }
      >
        <div className="grid grid-cols-2 gap-3 items-start">
          <div className="space-y-3">
            <Panel title="기본 정보" hnote="이 학원에서의 등록 기준">
              {detail.enrollments.length ? (
                detail.enrollments.map((e) => (
                  <RL
                    key={e.classId}
                    label="반 · 담당"
                    amount={`${e.className}${e.coachNames.length ? ` · ${e.coachNames.join("·")} 코치` : ""}`}
                  />
                ))
              ) : (
                <RL label="반 · 담당" amount="반 미배정" />
              )}
              <RL label="상태" amount={ST_KO[p.status] ?? p.status} />
              <RL label="생년월일" amount={p.birth} />
              <RL
                label="출석"
                sub={
                  detail.attendance.total > 0
                    ? `실제 기록 ${detail.attendance.total}회 · 결석 ${detail.attendance.absent}회 · 지각 ${detail.attendance.late}회`
                    : "코치가 확정한 실제 출결 기준"
                }
                amount={detail.attendance.ratePct !== null ? `${detail.attendance.ratePct}%` : "기록 없음"}
              />
            </Panel>

            <Panel title="보호자 연결" hnote={`${detail.guardians.length}명`}>
              {detail.guardians.length ? (
                detail.guardians.map((g, i) => (
                  <RL
                    key={i}
                    label={`${REL_KO[g.relationshipType] ?? g.relationshipType}${g.isPrimaryGuardian ? " (주 보호자)" : ""}`}
                    sub={g.canPay ? "결제 권한 있음" : "결제 권한 없음"}
                    amount={VS_KO[g.verificationStatus] ?? g.verificationStatus}
                    tone={g.verificationStatus === "VERIFIED" ? "accent" : "warn"}
                  />
                ))
              ) : (
                <RL label="연결된 보호자" sub="폰번호 클레임으로 연결돼요" amount="미연결" tone="warn" />
              )}
            </Panel>
          </div>

          <div className="space-y-3">
            <Panel title="수납 상태" hnote={`${detail.invoices.length}건`}>
              {detail.invoices.length === 0 ? (
                <div className="text-center py-6 text-[12.5px] text-ink3 font-medium">청구 내역이 없어요</div>
              ) : (
                detail.invoices.map((inv) => (
                  <div key={inv.invoiceId} className="mb-3 last:mb-0 border-b border-line2 last:border-0 pb-3 last:pb-0">
                    {inv.lines.map((l, i) => (
                      <RL key={i} label={l.label} amount={`${fmt(l.amount)}원`} disc={l.amount < 0} />
                    ))}
                    <RL
                      label={INV_KO[inv.status] ?? inv.status}
                      sub={`마감 ${inv.dueDate}`}
                      amount={`${fmt(inv.total)}원`}
                      tone={inv.status === "OVERDUE" || inv.status === "ISSUED" ? "danger" : "accent"}
                      total
                    />
                  </div>
                ))
              )}
            </Panel>
          </div>
        </div>
      </PCShell>
    );
  }

  return (
    <PCShell title={<span className="flex items-center gap-3">{backBtn}원생 상세</span>}>
      <Panel title={null}>
        <div className="text-center py-10">
          {live.state === "ERROR" ? (
            <div className="text-[13px] font-medium text-danger">서버 연결 오류 — {live.errorMsg ?? "데이터를 불러오지 못했어요"}</div>
          ) : detailState === "notfound" ? (
            <div className="text-[13.5px] text-ink3">원생을 찾을 수 없어요.</div>
          ) : detailState === "error" ? (
            <div className="text-[13px] font-medium text-danger">{detailMsg}</div>
          ) : (
            <div className="inline-flex items-center gap-2 text-[13px] font-medium text-ink3"><Spinner /> 불러오는 중…</div>
          )}
        </div>
      </Panel>
    </PCShell>
  );
}

function KidDetailFixture({ id, onBack }: { id: string; onBack: () => void }) {
  const { confirm, toast, overlays } = useOverlays();
  const base = KIDS.find((x) => x.id === id);
  const [makeups, setMakeups] = useState(() => (base?.makeups ?? []).map((m) => ({ ...m })));

  if (!base) {
    return (
      <PCShell title="원생 상세">
        <Panel title={null}>
          <div className="text-center py-8 text-ink3">원생을 찾을 수 없어요.</div>
          <div className="text-center"><ActBtn soft onClick={onBack}>← 원생 목록</ActBtn></div>
        </Panel>
      </PCShell>
    );
  }
  const k = base;
  const makeupLeft = makeups.filter((m) => !m.done).length;

  function processMakeup(idx: number) {
    const m = makeups[idx];
    if (m.done) return;
    confirm({
      title: "보강 처리 완료",
      sub: m.t,
      rows: [["기록", "이 보강 건을 처리 완료로 기록"]],
      warn: "PACEFOLIO는 실제 보강 일정이나 진행 방식을 관리하지 않아요. 원장님이 학원 운영 방식에 따라 처리를 마친 뒤 기록해 주세요.",
      memo: "처리 메모 (선택) — 예: 다음 달 수업으로 대체",
      label: "처리 완료",
      onConfirm: (memo) => {
        setMakeups((prev) => prev.map((x, i) => i === idx ? { ...x, done: true, record: "처리 완료 · 원장님 · 오늘 14:20" + (memo ? " · " + memo : "") } : x));
        toast(makeupLeft <= 1 ? "보강 미처리가 모두 기록됐어요" : "보강 1건 처리 완료로 기록");
      },
    });
  }

  return (
    <PCShell
      title={
        <span className="flex items-center gap-3">
          <button onClick={onBack} className="inline-flex items-center gap-1.5 border border-line bg-surface text-[12.5px] font-bold px-3 py-1.5 rounded-lg text-ink2 hover:bg-fill">
            <IconArrowLeft size={14} /> 목록
          </button>
          {k.nm}
        </span>
      }
      actions={<span className="text-[12px] text-ink3 font-medium">{k.age}세 · {k.cls} · {k.status}</span>}
    >
      <div className="grid grid-cols-2 gap-3 items-start">
        {/* 좌: 기본 + 차량 */}
        <div className="space-y-3">
          <Panel title="기본 정보" hnote="이 학원(원더짐)에서의 등록 기준">
            <RL label="반 · 담당" amount={`${k.cls} · ${k.coach} 코치`} />
            <RL label="상태" amount={k.status} />
            <RL label="학부모" amount={k.parent} />
            {k.sib && <RL label="형제" sub="합산 결제 편의 — 수납 기록은 각자 분리" amount={k.sib} />}
            <RL label="출석 (이번 분기)" amount={k.id === "ian" ? "입회 첫 주" : "92%"} />
            {k.alert && <RL label="안전 특이사항" amount={k.alert} tone="danger" />}
          </Panel>

          {k.veh && (
            <Panel title="차량" hnote="이용">
              <RL label="탑승" sub={k.veh.ride.split(" · ")[1]} amount={k.veh.ride.split(" · ")[0]} />
              <RL label="하원" sub={k.veh.drop.split(" · ")[1]} amount={k.veh.drop.split(" · ")[0]} />
              <div className="flex items-baseline justify-between gap-2.5 py-2">
                <span className="text-[13px] text-ink2 font-medium">카시트·특이사항</span>
                <span className="text-[13px] font-semibold text-ink text-right max-w-[56%]">{k.veh.seat}</span>
              </div>
            </Panel>
          )}
        </div>

        {/* 우: 수납 + 보강 */}
        <div className="space-y-3">
          <Panel title="수납 상태" hnote="3분기 · 원생별 분리 청구">
            {k.bill.map((r, i) => (
              <RL key={i} label={r[0]} amount={r[1]} disc={r[0].indexOf("할인") >= 0} />
            ))}
            <RL
              label="총 청구액"
              sub={k.payDetail}
              amount={`${k.total} · ${k.pay}`}
              tone={k.pay === "미납" ? "danger" : "accent"}
              total
            />
          </Panel>

          {makeups.length > 0 && (
            <Panel title="보강 미처리" hnote={`${makeupLeft}건`}>
              {makeups.map((m, i) => (
                <button
                  key={i}
                  onClick={() => processMakeup(i)}
                  disabled={m.done}
                  className={`w-full flex gap-3 items-center rounded-xl border-[1.5px] px-3 py-2.5 mt-2 first:mt-0 text-left transition ${m.done ? "border-accent bg-accent-weak cursor-default" : "border-line bg-surface hover:bg-fill"}`}
                >
                  <span className={`w-[22px] h-[22px] rounded-md grid place-items-center shrink-0 ${m.done ? "bg-accent text-white" : "border-2 border-line2"}`}>
                    {m.done && <CheckMark size={13} />}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] font-bold text-ink">{m.t}</span>
                    <span className="block text-[11px] text-ink3 font-medium">{m.s}</span>
                  </span>
                  <span className={`text-[11px] font-extrabold text-right max-w-[42%] leading-tight ${m.done ? "text-brand" : "text-ink3"}`}>
                    {m.done ? m.record : "보강 처리 완료"}
                  </span>
                </button>
              ))}
              {makeupLeft === 0 && (
                <div className="text-center py-3.5">
                  <div className="text-[30px]">✅</div>
                  <div className="text-[13px] font-extrabold text-brand mt-1">보강이 모두 처리됐어요</div>
                </div>
              )}
              <div className="text-[11.5px] text-ink3 font-medium leading-relaxed mt-2">
                PACEFOLIO는 보강 일정·방식을 관리하지 않아요 — 원장님이 처리한 뒤 <b className="text-brand font-bold">기록만</b> 남깁니다.
              </div>
            </Panel>
          )}
        </div>
      </div>
      {overlays}
    </PCShell>
  );
}
