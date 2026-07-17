"use client";

/* 학부모 앱 공용 조각 — 컨텍스트바 · 벨 · 푸시헤더 · 하단탭 · 토스트 · 시트 · 결제수단칩 */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { cn, Button } from "@/components/ui";
import { IconArrowLeft } from "@/components/ui/icons";
import { Ic } from "./_icons";
import { useParent } from "./_state";
import {
  CHILDREN, DAY_LABEL, INV_AMT, won,
  type AcademyName, type ChildName, type IconKey,
} from "./_data";

/* 인라인 <b> 태그가 든 카피 안전 렌더 */
export function Html({ html, className }: { html: string; className?: string }) {
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

/* 푸시 대상 키 → 라우트 */
export const ROUTES: Record<string, string> = {
  home: "/parent", sched: "/parent/schedule", chat: "/parent/chat", child: "/parent/child",
  report: "/parent/report", photos: "/parent/photos", lesson: "/parent/lesson",
  invoice: "/parent/invoice", room: "/parent/chat/room", coachroom: "/parent/chat/coach",
  pay: "/parent/pay", paydone: "/parent/pay/done",
};

/* ---------- 상단: 알림 벨 (44px 히트영역 · 미읽음 점) ---------- */
export function Bell() {
  const { openSheet } = useParent();
  return (
    <button
      onClick={() => openSheet("noti")}
      aria-label="알림함 열기"
      className="relative grid place-items-center min-w-11 min-h-11 rounded-xl bg-fill text-ink2 hover:bg-line2 transition"
    >
      <Ic name="bell" size={22} />
      <span className="absolute top-2 right-2.5 w-[7px] h-[7px] rounded-full bg-danger ring-2 ring-fill" />
    </button>
  );
}

/* ---------- 원생·학원 컨텍스트 선택기 (전 탭 공통) ---------- */
export function CtxBar() {
  const { st, openSheet } = useParent();
  return (
    <div className="flex gap-2">
      <button
        onClick={() => openSheet("child")}
        className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-3.5 py-2 text-[12.5px] font-bold text-ink2"
      >
        <b className="text-ink font-extrabold">{st.child}</b> ▾
      </button>
      <button
        onClick={() => openSheet("acad")}
        className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-3.5 py-2 text-[12.5px] font-bold text-ink2"
      >
        <b className="text-ink font-extrabold">{st.academy}</b> ▾
      </button>
    </div>
  );
}

/* ---------- 푸시 화면 상단바 (뒤로 = 브라우저 스택) ---------- */
export function PushHeader({ title, sub }: { title: string; sub?: string }) {
  const router = useRouter();
  return (
    <header className="shrink-0 h-14 flex items-center gap-2 px-3 bg-fill/95 backdrop-blur border-b border-line2">
      <button onClick={() => router.back()} aria-label="뒤로" className="grid place-items-center min-w-11 min-h-11 rounded-xl text-ink hover:bg-fill transition">
        <IconArrowLeft size={24} />
      </button>
      <div className="flex-1 min-w-0 text-[16px] font-extrabold text-ink truncate">{title}</div>
      {sub && <span className="text-[11.5px] font-semibold text-ink3 shrink-0">{sub}</span>}
    </header>
  );
}

/* ---------- 하단 탭바 (채팅 미읽음 배지) ---------- */
const TABS: { href: string; label: string; icon: IconKey }[] = [
  { href: "/parent", label: "홈", icon: "home" },
  { href: "/parent/schedule", label: "일정", icon: "cal" },
  { href: "/parent/chat", label: "소통", icon: "chat" },
  { href: "/parent/child", label: "우리 아이", icon: "user" },
];
export function ParentNav() {
  const path = usePathname();
  const { cur } = useParent();
  return (
    <nav className="shrink-0 h-[68px] bg-surface border-t border-line flex items-stretch px-2 pb-2">
      {TABS.map((t) => {
        const active = t.href === "/parent" ? path === "/parent" : path.startsWith(t.href);
        const badge = t.href === "/parent/chat" && cur.chatUnread > 0 ? cur.chatUnread : 0;
        return (
          <Link key={t.href} href={t.href}
            className={cn("flex-1 flex flex-col items-center justify-center gap-1 pt-1 transition", active ? "text-accent" : "text-ink3")}>
            <span className="relative inline-flex">
              <Ic name={t.icon} size={24} />
              {badge > 0 && (
                <span className="absolute -top-1.5 -right-2.5 min-w-[17px] h-[17px] px-1 rounded-full bg-danger text-white text-[9.5px] font-extrabold grid place-items-center">
                  {badge}
                </span>
              )}
            </span>
            <span className="text-[11px] font-semibold">{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/* ---------- 토스트 ---------- */
export function Toast() {
  const { toastMsg } = useParent();
  return (
    <div
      role="status" aria-live="polite"
      className={cn(
        "absolute left-4 right-4 bottom-24 z-[400] rounded-2xl bg-side text-white text-[12.5px] font-semibold px-4 py-3 text-center transition-all",
        toastMsg ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3 pointer-events-none",
      )}
    >
      {toastMsg}
    </div>
  );
}

/* ---------- 결제수단 칩 (본결제·대회 공용) ---------- */
export function MethodChip({ label, pico, picoBg, picoInk, selected, onSelect }: {
  label: string; pico: string; picoBg?: string; picoInk?: string; selected: boolean; onSelect: () => void;
}) {
  return (
    <button onClick={onSelect}
      className={cn("flex w-full items-center gap-3 rounded-xl border-[1.5px] px-3.5 py-3.5 text-[14.5px] font-bold text-ink transition",
        selected ? "border-accent bg-accent-weak" : "border-line bg-surface")}>
      <span className="grid place-items-center w-[34px] h-[34px] rounded-lg text-[11px] font-extrabold"
        style={picoBg ? { background: picoBg, color: picoInk } : undefined}
        {...(!picoBg ? { "data-card": true } : {})}>
        <span className={cn(!picoBg && "bg-accent-weak text-accent-ink w-full h-full grid place-items-center rounded-lg")}>{pico}</span>
      </span>
      {label}
      <span className={cn("ml-auto w-5 h-5 rounded-full border-2", selected ? "border-accent bg-accent shadow-[inset_0_0_0_3px_#fff]" : "border-[#D1D6DB]")} />
    </button>
  );
}

/* =========================================================
   시트 (바텀시트) — 전역 오버레이. layout 에 1회 렌더.
   ========================================================= */
function SheetShell({ title, sub, children }: { title?: string; sub?: React.ReactNode; children: React.ReactNode }) {
  const { closeSheet } = useParent();
  return (
    <div className="absolute inset-0 z-[200] flex items-end bg-ink/45" onClick={closeSheet} role="presentation">
      <div className="w-full rounded-t-[24px] bg-surface px-5 pt-4 pb-7 max-h-[76%] overflow-y-auto" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="mx-auto mb-3.5 h-[5px] w-10 rounded-full bg-line" />
        {title && <h3 className="text-[18px] font-extrabold text-ink">{title}</h3>}
        {sub && <div className="text-[12.5px] text-ink3 mt-0.5 mb-3">{sub}</div>}
        {children}
      </div>
    </div>
  );
}

export function Sheets() {
  const p = useParent();
  switch (p.sheet) {
    case "abs": return <AbsSheet />;
    case "contest": return <ContestSheet />;
    case "noti": return <NotiSheet />;
    case "mk": return <MakeupSheet />;
    case "auto": return <AutoSheet />;
    case "autoOff": return <AutoOffSheet />;
    case "child": return <ChildSheet />;
    case "acad": return <AcadSheet />;
    default: return null;
  }
}

function AbsSheet() {
  const { cur, dispatch, closeSheet, toast } = useParent();
  const pick = (reason: string) => {
    const was = cur.attend === "absent";
    dispatch({ t: "absent", reason });
    closeSheet();
    toast(was ? "결석 사유를 변경했어요" : "결석 접수 — 코치·원장님께 알렸어요. 전화 안 하셔도 돼요");
  };
  return (
    <SheetShell title="못 가는 이유가 뭐예요?" sub="하나만 골라주세요 — 코치·원장님께 바로 전달돼요 (10초)">
      <div className="flex flex-wrap gap-2">
        {[["🤒 아파요", "아파요"], ["가족 일정", "가족 일정"], ["기타", "기타"]].map(([label, v]) => (
          <button key={v} onClick={() => pick(v)}
            className="rounded-full border-[1.5px] border-line bg-surface px-5 py-3 text-[14px] font-bold text-ink2 active:border-accent active:bg-accent-weak active:text-accent-ink">
            {label}
          </button>
        ))}
      </div>
    </SheetShell>
  );
}

function MakeupSheet() {
  const { dispatch, closeSheet, toast } = useParent();
  return (
    <SheetShell title="보강을 희망한다고 학원에 전달할까요?" sub="날짜·반을 예약하는 게 아니에요. 실제 일정과 처리 방식은 학원에서 안내합니다.">
      <div className="flex gap-2.5 mt-1">
        <Button full variant="ghost" onClick={closeSheet}>취소</Button>
        <Button full variant="primary" onClick={() => { dispatch({ t: "makeupReq" }); closeSheet(); toast("보강 희망을 학원에 전달했어요 — 실제 일정·방식은 학원에서 안내해요"); }}>희망 전달</Button>
      </div>
    </SheetShell>
  );
}

function ReceiptRows({ rows }: { rows: [string, string][] }) {
  return (
    <div className="rounded-2xl border border-line px-4">
      {rows.map(([k, v], i) => (
        <div key={i} className={cn("flex justify-between py-2.5 text-[13.5px]", i < rows.length - 1 && "border-b border-line2")}>
          <span className="text-ink3 font-medium">{k}</span><span className="font-bold text-ink">{v}</span>
        </div>
      ))}
    </div>
  );
}

function AutoSheet() {
  const { dispatch, closeSheet, toast } = useParent();
  return (
    <SheetShell title="다음 수납 기간부터 자동결제를 등록할까요?" sub="등록 전에 조건을 확인해 주세요">
      <ReceiptRows rows={[["대상", "도담·서준"], ["학원", "원더짐 아카데미"], ["주기·예정일", "분기 · 청구 마감 3일 전"], ["사전 안내", "결제 전 청구 금액을 먼저 알림"], ["해지", "언제든 이 화면에서 해지"], ["결제수단 등록", "PG 정기결제 동의 필요"], ["결제 실패 시", "알림 후 수동 결제로 전환"]]} />
      <div className="flex gap-2.5 mt-3.5">
        <Button full variant="ghost" onClick={closeSheet}>취소</Button>
        <Button full variant="primary" onClick={() => { dispatch({ t: "autopay", on: true }); closeSheet(); toast("자동결제 동의 완료 — 결제 전에 청구 금액을 먼저 알려드려요"); }}>동의하고 등록</Button>
      </div>
    </SheetShell>
  );
}

function AutoOffSheet() {
  const { dispatch, closeSheet, toast } = useParent();
  return (
    <SheetShell title="자동결제를 해지할까요?" sub={<span>이미 청구된 이번 결제에는 영향을 주지 않고, <b className="text-ink">다음 수납기간부터</b> 자동결제가 중단돼요. (대상: 도담·서준 · 원더짐 아카데미)</span>}>
      <div className="flex gap-2.5 mt-1">
        <Button full variant="ghost" onClick={closeSheet}>유지하기</Button>
        <Button full variant="primary" onClick={() => { dispatch({ t: "autopay", on: false }); closeSheet(); toast("자동결제를 해지했어요 — 다음 수납기간부터 중단돼요"); }}>해지</Button>
      </div>
    </SheetShell>
  );
}

function SelRow({ on, title, sub, onClick }: { on: boolean; title: string; sub: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={cn("flex w-full items-center gap-3 rounded-xl border-[1.5px] px-3.5 py-3.5 mt-2.5 text-left text-[14px] font-bold transition",
        on ? "border-accent bg-accent-weak" : "border-line bg-surface")}>
      <div className="flex-1">
        <div className="text-ink">{title}</div>
        <div className="text-[11.5px] font-medium text-ink3 mt-0.5">{sub}</div>
      </div>
      <span className={cn("w-5 h-5 rounded-full border-2 shrink-0", on ? "border-accent bg-accent shadow-[inset_0_0_0_3px_#fff]" : "border-[#D1D6DB]")} />
    </button>
  );
}

function ChildSheet() {
  const { st, dispatch, closeSheet, toast } = useParent();
  const pick = (name: ChildName) => {
    if (name !== st.child) { dispatch({ t: "child", name }); toast(`${name} 화면으로 바꿨어요 — 일정·소식·성장·수납이 함께 바뀌어요`); }
    closeSheet();
  };
  const subOf = (name: ChildName) =>
    CHILDREN[name].acads.map((a) => `${a === "원더짐 아카데미" ? "원더짐 아카데미 (플레이2" + (name === "도담" ? "·축구)" : ")") : "강동 스포츠클럽 (수영)"}`).join(" · ");
  return (
    <SheetShell title="어느 아이를 볼까요?" sub="아이를 바꾸면 일정·소식·성장·수납이 함께 바뀌어요">
      {(["도담", "서준"] as ChildName[]).map((n) => (
        <SelRow key={n} on={st.child === n} title={`${n} · ${CHILDREN[n].age}`} sub={subOf(n)} onClick={() => pick(n)} />
      ))}
    </SheetShell>
  );
}

function AcadSheet() {
  const { st, content, dispatch, closeSheet, toast } = useParent();
  const acads = CHILDREN[st.child].acads;
  const pick = (a: AcademyName) => {
    if (a !== st.academy) { dispatch({ t: "academy", name: a }); toast(`${a} 화면으로 바꿨어요 — 일정·채팅·성장·수납·대회가 함께 바뀌어요`); }
    closeSheet();
  };
  return (
    <SheetShell title="어느 학원을 볼까요?" sub="학원을 바꾸면 그 학원의 정보만 보여요">
      {acads.map((a) => {
        const c = a === st.academy ? content : undefined;
        const sub = c ? c.profile.desc : (a === "강동 스포츠클럽" ? "수영 초급반 (주1회)" : "플레이2 (주2회) · 액티브 축구");
        return <SelRow key={a} on={st.academy === a} title={a} sub={sub} onClick={() => pick(a)} />;
      })}
    </SheetShell>
  );
}

function NotiSheet() {
  const { detail, closeSheet } = useParent();
  const router = useRouter();
  const go = (target: string) => {
    closeSheet();
    if (target.charAt(0) === "@") router.push(ROUTES[target.slice(1)] ?? "/parent");
    else router.push(ROUTES[target] ?? "/parent");
  };
  return (
    <SheetShell title="알림" sub="탭하면 관련 화면으로 이동해요">
      <div>
        {detail.noti.map((n, i) => {
          const [target, icon, title, sub, group] = n;
          // 앞선 항목들의 마지막 그룹과 비교 — 렌더 중 지역변수 변이 없이 그룹 헤더 판정
          const prevGroup = detail.noti.slice(0, i).map((x) => x[4]).filter(Boolean).pop() ?? "";
          const showGroup = group && group !== prevGroup;
          return (
            <div key={i}>
              {showGroup && <div className="text-[12px] font-extrabold text-ink3 pt-3">{group}</div>}
              <button onClick={() => go(target)}
                className="flex w-full items-start gap-3 py-3 text-left border-b border-line2 last:border-0">
                <span className="text-ink3 shrink-0 mt-0.5"><Ic name={icon as IconKey} size={20} /></span>
                <span className="flex-1 text-[13.5px] font-medium text-ink leading-snug">
                  {title}<small className="block text-[11.5px] text-ink3 font-medium mt-0.5">{sub}</small>
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </SheetShell>
  );
}

/* ---------- 대회: 동의 확인 → 결제 → 확정 (참가 확정은 결제 성공 시점) ---------- */
function ContestSheet() {
  const { cur, dispatch, closeSheet, toast } = useParent();
  const [step, setStep] = useState(0);
  const [req, setReq] = useState(false);
  const [opt, setOpt] = useState(false);
  const [processing, setProcessing] = useState(false);
  const method = cur.contestPayMethod;

  const pay = () => {
    if (processing || cur.contest) return;
    setProcessing(true);
    setTimeout(() => { dispatch({ t: "registerContest" }); setProcessing(false); setStep(2); }, 900);
  };

  return (
    <SheetShell>
      {step === 0 && (
        <>
          <h3 className="text-[18px] font-extrabold text-ink">참가 동의 확인</h3>
          <div className="text-[12.5px] text-ink3 mt-0.5 mb-3">강동 유소년 챔피언십 · 도담 · 보호자 확인</div>
          <ReceiptRows rows={[["일시·장소", "11/22(토) 10:00 · 강동 체육관"], ["집결", "오전 9:30 · 유니폼 지참"], ["참가비", "19,900원"], ["취소·환불", "11/19까지 전액, 이후 환불 불가"], ["보험", "주최 측 안내 기준 (학원 입력)"], ["긴급 연락", "학원 대표번호"]]} />
          <ConsentRow on={req} onToggle={() => setReq((v) => !v)} label={<><b className="font-extrabold">[필수]</b> 참가·안전 안내와 취소·환불 기준을 확인했고 동의합니다</>} />
          <ConsentRow on={opt} onToggle={() => setOpt((v) => !v)} label={<>[선택] 대회 사진 촬영·게시에 동의합니다</>} />
          <Button full variant="primary" className="mt-3" disabled={!req} onClick={() => setStep(1)}>동의하고 결제 수단 선택</Button>
        </>
      )}
      {step === 1 && (
        <>
          <h3 className="text-[18px] font-extrabold text-ink">대회 참가비 결제</h3>
          <div className="text-[12.5px] text-ink3 mt-0.5 mb-3">강동 유소년 챔피언십 · 19,900원 · 동의 완료 ✓</div>
          <div className="space-y-2.5">
            <MethodChip label="카카오페이" pico="pay" picoBg="#FEE500" picoInk="#191600" selected={method === "카카오페이"} onSelect={() => dispatch({ t: "contestMethod", method: "카카오페이" })} />
            <MethodChip label="토스" pico="toss" picoBg="#0064FF" picoInk="#fff" selected={method === "토스"} onSelect={() => dispatch({ t: "contestMethod", method: "토스" })} />
          </div>
          <button onClick={pay} disabled={processing}
            className="w-full mt-3 rounded-2xl py-3.5 text-[15px] font-bold bg-[#FEE500] text-[#191600] disabled:opacity-60">
            {processing ? "결제 처리 중..." : `${method}로 19,900원 결제`}
          </button>
        </>
      )}
      {step === 2 && (
        <div className="text-center pt-2 pb-1">
          <div className="mx-auto mb-3.5 w-16 h-16 rounded-full bg-accent-weak text-accent grid place-items-center"><Ic name="check" size={32} /></div>
          <h3 className="text-[18px] font-extrabold text-ink">참가 확정 ✓</h3>
          <div className="text-[12.5px] text-ink3 mt-1 leading-relaxed">도담 · 등번호 7 · 11/22(토) 오전 9:30 집결<br />일정 탭에 자동으로 추가됐어요</div>
          <Button full variant="primary" className="mt-4" onClick={() => { closeSheet(); toast("참가 확정 — 11/22 일정에 추가됐어요 🏆"); }}>확인</Button>
        </div>
      )}
    </SheetShell>
  );
}

function ConsentRow({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: React.ReactNode }) {
  return (
    <button onClick={onToggle}
      className={cn("flex w-full items-start gap-2.5 rounded-xl border-[1.5px] px-3.5 py-3 mt-2.5 text-left text-[13px] font-semibold leading-normal transition",
        on ? "border-accent bg-accent-weak text-accent-ink" : "border-line bg-surface text-ink2")}>
      <span className={cn("grid place-items-center w-5 h-5 rounded-md shrink-0 mt-0.5 text-white", on ? "bg-accent" : "border-2 border-[#D1D6DB]")}>
        {on && <Ic name="check" size={13} />}
      </span>
      <span>{label}</span>
    </button>
  );
}

/* ---------- 자동결제 토글 스위치 ---------- */
export function AutoToggle() {
  const { payCur, openSheet } = useParent();
  const on = payCur.autoPay;
  return (
    <div className="flex items-center justify-between gap-2.5 rounded-2xl bg-accent-weak border border-accent/30 p-3.5">
      <div className="text-[13.5px] text-accent-ink">
        <b className="font-extrabold">다음 수납기간부터 자동결제</b>
        <small className="block text-[11.5px] opacity-85 font-medium mt-0.5">켜면 등록 조건을 먼저 확인하고 동의해요 · 언제든 해지</small>
      </div>
      <button role="switch" aria-checked={on} aria-label="자동결제 등록"
        onClick={() => openSheet(on ? "autoOff" : "auto")}
        className={cn("relative w-[46px] h-7 rounded-full shrink-0 transition", on ? "bg-accent" : "bg-[#D1D6DB]")}>
        <span className={cn("absolute top-[3px] w-[22px] h-[22px] rounded-full bg-white shadow transition-all", on ? "left-[21px]" : "left-[3px]")} />
      </button>
    </div>
  );
}

/* ---------- 안내 노트 (아이콘 + 카피) ---------- */
export function NoteRow({ icon, children }: { icon: IconKey; children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5 items-start rounded-2xl border border-line p-3.5 text-[12.5px] text-ink2 font-medium leading-relaxed">
      <span className="text-accent shrink-0 mt-0.5"><Ic name={icon} size={20} /></span>
      <span>{children}</span>
    </div>
  );
}

export { INV_AMT, won, DAY_LABEL };
