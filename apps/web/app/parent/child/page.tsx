"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader, AppScroll } from "@/components/mobile/MobileShell";
import { cn, Tag } from "@/components/ui";
import { Ic } from "../_icons";
import { useParent } from "../_state";
import { Bell, CtxBar, NoteRow } from "../_components";
import { CHILDREN, INV_AMT, won, type ChildName, type ChildSeg } from "../_data";

const SEGS: { k: ChildSeg; label: string }[] = [
  { k: "grow", label: "성장" }, { k: "pay", label: "결제" }, { k: "contest", label: "대회" },
];

export default function ParentChild() {
  const { st, content, dispatch } = useParent();
  return (
    <>
      <AppHeader title={<span className="text-[17px] font-extrabold text-ink">우리 아이</span>} right={<Bell />} />
      <AppScroll>
        <div className="text-[13px] text-ink3 -mt-1">{st.academy}</div>
        <CtxBar />

        {/* 프로필 */}
        <div className="flex gap-3.5 items-center">
          <div className="grid place-items-center w-16 h-16 rounded-[22px] bg-accent-weak text-accent-ink text-[25px] font-extrabold shrink-0">{st.child.charAt(0)}</div>
          <div>
            <div className="text-[19px] font-extrabold tracking-tight text-ink">{st.child} <span className="text-[12px] font-semibold text-ink3">{CHILDREN[st.child].age}</span></div>
            <div className="text-[12.5px] text-ink3 font-medium mt-0.5">{content.profile.desc}</div>
            <div className="flex gap-1.5 flex-wrap mt-2">
              {content.profile.chips.map((c) => <span key={c} className="text-[11px] font-bold bg-fill border border-line text-ink2 px-2.5 py-1 rounded-full">{c}</span>)}
            </div>
          </div>
        </div>

        {/* 세그먼트 */}
        <div className="flex gap-1 bg-fill rounded-xl p-1">
          {SEGS.map((s) => (
            <button key={s.k} onClick={() => dispatch({ t: "seg", seg: s.k })}
              className={cn("flex-1 py-2.5 rounded-lg text-[13px] font-bold transition", st.seg === s.k ? "bg-surface text-ink shadow-sm" : "text-ink3")}>
              {s.label}
            </button>
          ))}
        </div>

        {st.seg === "grow" && <GrowPane />}
        {st.seg === "pay" && <PayPane />}
        {st.seg === "contest" && <ContestPane />}
      </AppScroll>
    </>
  );
}

/* ---------------- 성장 ---------------- */
function MilestoneRow({ icon, dim, title, sub, prog, next }: { icon: "award" | "check" | "clock"; dim?: boolean; title: string; sub: string; prog: number; next: React.ReactNode }) {
  return (
    <div className="flex gap-3 rounded-xl border border-line bg-fill p-3.5 mt-2.5 first:mt-3">
      <span className={cn("grid place-items-center w-11 h-11 rounded-full shrink-0", dim ? "bg-fill border-[1.5px] border-dashed border-line text-ink3" : "bg-accent-weak text-accent-ink")}><Ic name={icon} size={22} /></span>
      <div className="flex-1">
        <div className="text-[14px] font-extrabold text-ink">{title}</div>
        <div className="text-[11.5px] text-ink3 font-medium mt-0.5">{sub}</div>
        <div className="h-1.5 rounded bg-line2 mt-2 overflow-hidden"><div className="h-full bg-accent rounded" style={{ width: `${prog}%` }} /></div>
        <div className="text-[11.5px] text-ink2 font-semibold mt-1.5">{next}</div>
      </div>
    </div>
  );
}
function Rec({ value, children }: { value: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3.5">
      <div className="text-[36px] font-extrabold tracking-tighter text-accent-ink">{value}</div>
      <div className="text-[12px] text-ink2 font-medium leading-relaxed">{children}</div>
    </div>
  );
}
function GrowCard({ title, more, children }: { title: string; more?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-surface border border-line p-4">
      <h4 className="flex justify-between items-center text-[14px] font-bold text-ink mb-1">{title} {more && <span className="text-[12px] text-ink3 font-semibold">{more}</span>}</h4>
      {children}
    </div>
  );
}
function GrowPane() {
  const { content } = useParent();
  if (content.growth === "dodam") {
    return (
      <div className="space-y-4">
        <GrowCard title="마일스톤" more="코치가 기록 → 리포트에 자동 반영">
          <MilestoneRow icon="award" title="드리블 스텝2 달성 🎉" sub="10/25(토) · 김코치 기록" prog={60} next={<>다음 목표 <b className="text-ink">스텝3</b>까지 2회 남았어요</>} />
          <MilestoneRow icon="check" title="한발 서기 15초 달성" sub="10/20(월) 18초 신기록으로 갱신 · 김코치 기록" prog={100} next={<><b className="text-ink">완료</b> — 다음 배지: 25초 도전</>} />
          <MilestoneRow icon="clock" dim title="리프팅 10회" sub="진행 중 · 지금 4회" prog={40} next={<><b className="text-ink">6회</b> 더 하면 배지를 받아요</>} />
        </GrowCard>
        <GrowCard title="이번 기간 참여" more="학원 기준에 따라 집계">
          <Rec value="92%">보강 처리 포함 참여율<br /><b className="text-ink">정규 수업 출석률 88%</b> · 결석 1회 · 보강 처리 1회</Rec>
          <NoteRow icon="award"><b className="text-ink">최근 3주 꾸준히 참여했어요.</b> 보강을 출석률에 반영할지는 학원 설정을 따라요.</NoteRow>
        </GrowCard>
      </div>
    );
  }
  if (content.growth === "seojun") {
    return (
      <div className="space-y-4">
        <GrowCard title="마일스톤" more="코치가 기록">
          <MilestoneRow icon="clock" dim title="제자리 균형 5초" sub="이코치 기록 · 10/23(목)" prog={40} next={<>다음 목표까지 <b className="text-ink">3회</b> 남았어요</>} />
        </GrowCard>
        <GrowCard title="이번 기간 참여">
          <Rec value="96%">정규 수업 출석률 96% · 결석 0회<br />2주째 꾸준히 나오고 있어요 🌱</Rec>
        </GrowCard>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <GrowCard title="수영 진도" more="박코치 기록">
        <MilestoneRow icon="award" title="자유형 발차기 완료 🎉" sub="박코치 기록 · 10/25(토)" prog={70} next={<>다음 단계 <b className="text-ink">호흡 연결</b></>} />
      </GrowCard>
      <GrowCard title="이번 기간 참여">
        <Rec value="100%">6주째 개근 중 · 결석 0회<br />물 무서움이 많이 줄었어요 🌱</Rec>
      </GrowCard>
    </div>
  );
}

/* ---------------- 결제 ---------------- */
function BillRow({ name, sub, amount, paid, onClick }: { name: string; sub: string; amount: string; paid: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full justify-between items-center gap-2.5 py-3 text-left border-b border-line2 last:border-0">
      <span className="flex-1 min-w-0">
        <span className="block text-[14px] font-bold text-ink">{name}</span>
        <span className="block text-[11.5px] text-ink3 font-medium mt-0.5">{sub}</span>
      </span>
      <span className="flex items-center gap-2 shrink-0">
        <span className="text-[14px] font-bold text-ink whitespace-nowrap">{amount}</span>
        <Tag tone={paid ? "accent" : "danger"}>{paid ? "완납 ✓" : "결제 대기"}</Tag>
      </span>
    </button>
  );
}
function PayPane() {
  const { content, payCur, cur, isPaid, toast } = useParent();
  const router = useRouter();
  const [tax, setTax] = useState(false);

  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-surface border border-line p-4">
        <h4 className="flex justify-between items-center text-[14px] font-bold text-ink mb-0.5">결제 내역 <span className="text-[12px] text-ink3 font-semibold">{content.bill === "wg" ? "보호자 계정 단위 · 원생별 구분" : "강동 스포츠클럽"}</span></h4>
        {content.bill === "wg" ? (
          <>
            <div className="text-[11.5px] text-ink3 font-medium mb-2">이 보호자 계정에 도착한 결제 · 원더짐 아카데미 · 도담·서준 청구 2건(원생별)</div>
            {(["도담", "서준"] as ChildName[]).map((n) => {
              const paid = isPaid(n);
              return <BillRow key={n} name={`${n} · 9~11월 수강료`} sub={paid ? `완납 · ${payCur.payMethod || "카카오페이"}` : "결제 대기 · 마감 11/10"} amount={won(INV_AMT[n])} paid={paid}
                onClick={() => paid ? toast("영수증을 저장했어요 (데모)") : router.push("/parent/invoice")} />;
            })}
            <BillRow name="7~9월 수강료" sub="원생별 청구 2건 합산 · 완납 · 카카오페이" amount="738,000원" paid onClick={() => toast("영수증을 저장했어요 (데모)")} />
            {cur.contest && <BillRow name="대회 참가비" sub={`강동 유소년 챔피언십 · ${cur.contestPayMethod}`} amount="19,900원" paid onClick={() => toast("영수증을 저장했어요 (데모)")} />}
          </>
        ) : (
          <BillRow name="9~11월 수영 수강료" sub="도담 수영 초급반 · 주1회 · 완납 · 카카오페이" amount="96,000원" paid onClick={() => toast("영수증을 저장했어요 (데모)")} />
        )}
      </div>

      <button onClick={() => { setTax(true); toast("수강료 납입확인서를 발급했어요 — 연말정산 적용 여부는 기관 유형을 확인하세요"); }}
        className={cn("w-full rounded-xl text-[15px] font-bold py-3.5", tax ? "bg-accent-strong text-white" : "bg-fill border border-line text-ink2")}>
        {tax ? "발급 완료 · 이메일로 보냈어요 ✓" : "📄 수강료 납입확인서 발급"}
      </button>
      <div className="text-[11px] text-ink3 font-medium text-center">연말정산 적용 여부는 교육기관 유형과 관련 기준을 확인해 주세요.</div>
      <NoteRow icon="lock"><b className="text-ink">금액은 개인정보</b> — 채팅방·잠금화면엔 표시되지 않고, 이 화면은 보호자 본인만 볼 수 있어요. 결제는 <b className="text-ink">보호자 계정 단위</b>로 도착하고, 청구 항목은 원생별로 구분돼요.</NoteRow>
    </div>
  );
}

/* ---------------- 대회 ---------------- */
function ContestPane() {
  const { content, cur, openSheet } = useParent();
  if (content.contest === "none") {
    return <div className="rounded-2xl bg-surface border border-line p-4 text-center text-[13px] text-ink3 font-semibold">이 학원에는 지금 신청할 수 있는 대회가 없어요</div>;
  }
  if (!cur.contest) {
    return (
      <div className="space-y-3">
        <div className="rounded-2xl border border-line overflow-hidden bg-surface">
          <div className="p-5 text-white" style={{ background: "linear-gradient(135deg,#0E9384,#12B5A5)" }}>
            <span className="text-[11px] font-bold bg-white/20 inline-block px-2.5 py-1 rounded-full">참가 신청 접수 중 · 마감 D-7</span>
            <h3 className="text-[18px] font-extrabold tracking-tight mt-2.5">강동 유소년 챔피언십 🏆</h3>
            <div className="text-[12.5px] opacity-90 font-medium">11/22(토) 오전 10:00 · 강동 체육관 · 7~9세부</div>
          </div>
          <div className="px-4 pt-2 pb-4">
            <div className="flex justify-between items-center py-3 border-b border-line2">
              <span className="text-[14px] font-bold text-ink">참가비<small className="block text-[11.5px] text-ink3 font-medium mt-0.5">기념 메달 · 간식 포함 (학원이 입력한 안내)</small></span>
              <span className="text-[14px] font-bold text-ink">19,900원</span>
            </div>
            <div className="text-[12.5px] text-ink2 font-medium leading-relaxed mt-1">도담이가 액티브 축구 대표로 추천됐어요. 동의 내용을 확인하고 결제하면 등번호 7번으로 접수돼요.</div>
            <button onClick={() => openSheet("contest")} className="w-full mt-3 rounded-xl bg-accent-strong text-white text-[15px] font-bold py-3.5">참가 동의 내용 확인하기</button>
          </div>
        </div>
        <NoteRow icon="shield"><b className="text-ink">동의 내용 확인 → 필수 동의 → 결제</b> 순서로 진행돼요. 취소·환불 기준과 보험 여부는 동의 화면에서 확인할 수 있어요.</NoteRow>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-line overflow-hidden bg-surface">
      <div className="p-5 text-white bg-side">
        <span className="text-[11px] font-bold bg-white/20 inline-block px-2.5 py-1 rounded-full">참가 확정 ✓</span>
        <h3 className="text-[18px] font-extrabold tracking-tight mt-2.5">강동 유소년 챔피언십 🏆</h3>
        <div className="text-[12.5px] opacity-90 font-medium">11/22(토) 오전 10:00 · 강동 체육관 · 7~9세부</div>
      </div>
      <div className="px-4 pt-2 pb-4">
        <div className="flex justify-between items-center py-3 border-b border-line2">
          <span className="text-[14px] font-bold text-ink">도담 · 등번호 7<small className="block text-[11.5px] text-ink3 font-medium mt-0.5">오전 9:30 집결 · 유니폼 지참</small></span>
          <Tag tone="accent">확정</Tag>
        </div>
        <div className="flex justify-between items-center py-3 border-b border-line2">
          <span className="text-[14px] font-bold text-ink">참가비 결제<small className="block text-[11.5px] text-ink3 font-medium mt-0.5">{cur.contestPayMethod} · 방금</small></span>
          <span className="text-[14px] font-bold text-ink">19,900원 ✓</span>
        </div>
        <div className="text-[12.5px] text-ink2 font-medium leading-relaxed mt-1">일정 탭에 추가됐어요. 대회 전날 준비물 안내가 자동으로 도착해요.</div>
      </div>
    </div>
  );
}
