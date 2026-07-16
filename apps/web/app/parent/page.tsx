"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader, AppScroll } from "@/components/mobile/MobileShell";
import { cn } from "@/components/ui";
import { Ic } from "./_icons";
import { useParent } from "./_state";
import { Bell, CtxBar, Html, ROUTES } from "./_components";
import { BANNERS, BILL, INV_AMT, QA, won } from "./_data";

export default function ParentHome() {
  const { st } = useParent();
  return (
    <>
      <AppHeader
        title={<span className="text-[17px] font-extrabold text-ink">안녕하세요, 보호자님 👋</span>}
        right={<Bell />}
      />
      <AppScroll>
        <div className="text-[13px] text-ink3 -mt-1">확인할 아이·학원을 골라주세요</div>
        <CtxBar />
        <Hero />
        <Tiles />
        <PayBanner />
        <FeedCard key={`feed-${st.child}-${st.academy}`} />
        <NoticeCard key={`notice-${st.child}-${st.academy}`} />
        <QACard />
        <BannerCarousel key={`bn-${st.academy}`} />
      </AppScroll>
    </>
  );
}

/* ---------------- 히어로: 오늘 수업 / 결석 접수 ---------------- */
function Hero() {
  const { content, cur, dispatch, openSheet, toast } = useParent();
  const h = content.hero;
  const absent = cur.attend === "absent";

  if (absent) {
    return (
      <div className="rounded-[18px] bg-side text-white p-[18px]">
        <div className="flex justify-between items-start gap-2.5">
          <div>
            <div className="text-[18px] font-extrabold tracking-tight">결석 접수됨 · 오늘 {h.absCls}</div>
            <div className="text-[13.5px] opacity-90 mt-1 font-medium">사유: {cur.absReason} · 김코치·원장님께 바로 알렸어요</div>
          </div>
          <span className="text-[12px] font-bold bg-white/20 px-2.5 py-1 rounded-full whitespace-nowrap">접수 완료</span>
        </div>
        <div className="text-[13px] font-semibold mt-3 opacity-90">전화 안 하셔도 돼요 — 수업 시작 전까지 취소·변경할 수 있어요.</div>
        <div className="flex gap-2.5 mt-4">
          <button onClick={() => { dispatch({ t: "cancelAbs" }); toast("결석을 취소했어요 — 참석 예정으로 되돌렸어요"); }}
            className="flex-1 rounded-xl bg-white/20 text-white text-[14.5px] font-bold py-3">결석 취소</button>
          <button onClick={() => openSheet("abs")}
            className="rounded-xl bg-white/10 text-white text-[14.5px] font-bold py-3 px-4">사유 변경</button>
        </div>
        {cur.absLog.length > 0 && (
          <div className="text-[11px] opacity-80 mt-3 leading-relaxed">
            {cur.absLog.slice(-2).map((x, i) => <div key={i}>· {x}</div>)}
          </div>
        )}
      </div>
    );
  }

  let line = "참석 예정 — 별도 응답 없이 오시면 돼요";
  let buttons: React.ReactNode = <HeroBtn onClick={() => openSheet("abs")}>결석 알려주기</HeroBtn>;
  if (!h.canAbsent) {
    line = "참석 예정 — 결석할 때만 알려주시면 돼요";
    buttons = null;
  } else if (cur.attend === "confirm") {
    line = "참석 확인 완료 — 코치님께 전달됐어요";
    buttons = <HeroBtn onClick={() => openSheet("abs")}>결석 알려주기</HeroBtn>;
  } else if (h.rsvpRequested) {
    line = "학원에서 참석 확인을 요청했어요";
    buttons = (
      <>
        <HeroBtn primary onClick={() => { dispatch({ t: "confirm" }); toast("참석 확인을 전달했어요 — 안 하셔도 참석 예정으로 처리돼요"); }}>참석</HeroBtn>
        <HeroBtn onClick={() => openSheet("abs")}>결석</HeroBtn>
      </>
    );
  }

  return (
    <div className="rounded-[18px] bg-accent-strong text-white p-[18px]">
      <div className="flex justify-between items-start gap-2.5">
        <div>
          <div className="text-[18px] font-extrabold tracking-tight">{h.cls}</div>
          <div className="text-[13.5px] opacity-90 mt-1 font-medium">{h.when}</div>
        </div>
        <span className="text-[12px] font-bold bg-white/20 px-2.5 py-1 rounded-full whitespace-nowrap">{h.dd}</span>
      </div>
      <div className="text-[13px] font-bold mt-3">{line}</div>
      {buttons && <div className="flex gap-2.5 mt-4">{buttons}</div>}
    </div>
  );
}
function HeroBtn({ children, onClick, primary }: { children: React.ReactNode; onClick: () => void; primary?: boolean }) {
  return (
    <button onClick={onClick}
      className={cn("flex-1 rounded-xl text-[14.5px] font-bold py-3", primary ? "bg-white text-accent-ink" : "bg-white/[0.18] text-white")}>
      {children}
    </button>
  );
}

/* ---------------- 타일 3개 ---------------- */
function Tiles() {
  const { content } = useParent();
  const router = useRouter();
  return (
    <div className="grid grid-cols-3 gap-2.5">
      {content.tiles.map((t, i) => (
        <button key={i} onClick={() => t.tab && router.push("/parent/child")}
          className={cn("rounded-2xl bg-surface border border-line px-3 py-3.5 text-left", !t.tab && "cursor-default")}>
          <div className={cn("text-[17px] font-extrabold tracking-tight", t.cls === "good" ? "text-accent-ink" : t.cls === "warn" ? "text-warn-ink" : "text-ink")}>{t.v}</div>
          <div className="text-[11.5px] text-ink3 font-medium mt-1 leading-snug">{t.k}</div>
        </button>
      ))}
    </div>
  );
}

/* ---------------- 결제 배너 / 완납 칩 ---------------- */
function PayBanner() {
  const { st, content, payCur, anyPending, pendNames, pendAmt } = useParent();
  const router = useRouter();
  const bill = BILL[content.bill];
  const wgCtx = st.academy === "원더짐 아카데미";
  const showPay = !!bill && (wgCtx ? anyPending() : !payCur.paid);

  if (showPay) {
    const names = pendNames();
    const v = wgCtx ? `${bill.title} · ${won(pendAmt())}` : `${bill.title} · ${bill.amount}`;
    const d = wgCtx
      ? `${names.map((n) => `${n} ${won(INV_AMT[n]).replace("원", "")}`).join(" + ")} · 원생별 청구 ${names.length}건 · 결제 마감 ${bill.due} (${bill.dday}) · 탭해서 내역 보기 →`
      : `${bill.detail} · 결제 마감 ${bill.due} (${bill.dday}) · 탭해서 내역 보기 →`;
    return (
      <button onClick={() => router.push("/parent/invoice")} className="w-full text-left rounded-2xl bg-side text-white p-4">
        <div className="text-[12px] font-semibold opacity-85">{bill.k}</div>
        <div className="text-[18px] font-extrabold mt-1 tracking-tight">{v}</div>
        <div className="text-[12.5px] font-medium mt-1 opacity-85">{d}</div>
      </button>
    );
  }
  if (bill && payCur.paid) {
    return (
      <div className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-ink3 bg-fill rounded-full px-3 py-1.5">
        <span className="text-accent-ink"><Ic name="check" size={14} /></span>
        {bill.title} 완납{payCur.autoPay ? " · 자동결제 등록" : ""}
      </div>
    );
  }
  return null;
}

/* ---------------- 아이 소식 + 마일스톤 ---------------- */
function FeedCard() {
  const { st, content } = useParent();
  const router = useRouter();
  const [read, setRead] = useState<Set<number>>(new Set());
  return (
    <div className="rounded-2xl bg-surface border border-line p-4">
      <h4 className="flex justify-between items-center text-[14px] font-bold text-ink mb-1.5">
        {st.child}이 소식 <span className="text-[12px] text-ink3 font-semibold">전체보기</span>
      </h4>
      {content.feed.map((f, i) => (
        <button key={i} onClick={() => { setRead((s) => new Set(s).add(i)); router.push(ROUTES[f.push]); }}
          className="flex w-full items-start gap-3 py-3.5 text-left border-b border-line2 last:border-0">
          <span className="grid place-items-center w-[38px] h-[38px] rounded-xl bg-fill text-ink2 shrink-0"><Ic name={f.ic} size={20} /></span>
          <span className="flex-1 text-[14px] font-medium text-ink leading-snug">
            <Html html={f.html} />
            {f.neu && !read.has(i) && <span className="inline-block w-1.5 h-1.5 rounded-full bg-danger ml-1.5 align-middle" />}
            <small className="block text-ink3 font-medium text-[12px] mt-0.5">{f.sub}</small>
          </span>
        </button>
      ))}
      {content.mstone && (
        <button onClick={() => router.push("/parent/child")}
          className="flex w-full text-left gap-3 rounded-xl border border-line bg-fill p-3.5 mt-3">
          <span className="grid place-items-center w-11 h-11 rounded-full bg-accent-weak text-accent-ink shrink-0"><Ic name="award" size={22} /></span>
          <span className="flex-1">
            <span className="block text-[14px] font-extrabold text-ink">{content.mstone.title}</span>
            <span className="block text-[11.5px] text-ink3 font-medium mt-0.5">{content.mstone.sub}</span>
            <span className="block h-1.5 rounded bg-line2 mt-2 overflow-hidden"><span className="block h-full bg-accent rounded" style={{ width: `${content.mstone.prog}%` }} /></span>
            <span className="block text-[11.5px] text-ink2 font-semibold mt-1.5"><Html html={content.mstone.next} /></span>
          </span>
        </button>
      )}
    </div>
  );
}

/* ---------------- 학원 공지 (탭하면 읽음) ---------------- */
function NoticeCard() {
  const { st, content } = useParent();
  const [read, setRead] = useState<Set<number>>(() => new Set(content.notices.flatMap((n, i) => (n.read ? [i] : []))));
  return (
    <div className="rounded-2xl bg-surface border border-line p-4">
      <h4 className="flex justify-between items-center text-[14px] font-bold text-ink mb-1">
        {st.academy} 공지 <span className="text-[12px] text-ink3 font-semibold">탭하면 읽음 처리 · 기록 보존</span>
      </h4>
      {content.notices.map((n, i) => {
        const isRead = read.has(i);
        return (
          <button key={i} onClick={() => setRead((s) => new Set(s).add(i))}
            className="flex w-full items-start gap-2.5 py-3 text-left border-b border-line2 last:border-0">
            <span className="w-[7px] h-[7px] rounded-full mt-2 shrink-0" style={{ background: isRead ? "transparent" : "#E06A4B" }} />
            <span className={cn("flex-1 text-[14px] leading-snug", isRead ? "font-medium text-ink3" : "font-bold text-ink")}>
              {n.t}<small className={cn("block text-[12px] font-medium mt-0.5", isRead ? "text-[#B4BCC4]" : "text-ink3")}>{n.s} · {isRead ? "읽음" : "안 읽음"}</small>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ---------------- 학원 Q&A 아코디언 + 딥링크 ---------------- */
function QACard() {
  const { st, dispatch } = useParent();
  const router = useRouter();
  const [open, setOpen] = useState<number | null>(null);
  const d = QA[st.academy];
  const goSeg = (item: (typeof d.items)[number]) => {
    if (item.goSeg) dispatch({ t: "seg", seg: item.goSeg });
    router.push(ROUTES[item.goTab ?? "home"] ?? "/parent");
  };
  return (
    <div className="rounded-2xl bg-surface border border-line p-4">
      <h4 className="flex justify-between items-center text-[14px] font-bold text-ink mb-1">
        {st.academy} Q&amp;A <span className="text-[12px] text-ink3 font-semibold">자주 묻는 질문 · 탭하면 답이 펼쳐져요</span>
      </h4>
      <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-ink3 my-1">
        <span className="text-accent-ink"><Ic name="help" size={14} /></span>원장님이 등록한 안내예요 · {d.updated}
      </div>
      {d.items.map((it, i) => (
        <div key={i} className="border-b border-line2 last:border-0">
          <button onClick={() => setOpen(open === i ? null : i)} className="flex w-full items-center gap-3 py-3 text-left">
            <span className="grid place-items-center w-6 h-6 rounded-lg bg-accent-weak text-accent-ink text-[13px] font-extrabold shrink-0">Q</span>
            <span className="flex-1 text-[13.5px] font-bold text-ink leading-snug">{it.q}</span>
            <span className={cn("text-ink3 shrink-0 transition-transform", open === i && "rotate-180")}><Ic name="chev" size={16} /></span>
          </button>
          {open === i && (
            <div className="pl-9 pr-0.5 pb-3.5">
              <p className="text-[12.5px] text-ink2 font-medium leading-relaxed m-0"><Html html={it.a} /></p>
              {it.goTab && (
                <button onClick={() => goSeg(it)} className="mt-2.5 inline-flex items-center gap-1 text-[12px] font-bold text-accent-ink bg-accent-weak rounded-lg px-3 py-1.5">
                  {it.goTxt} →
                </button>
              )}
            </div>
          )}
        </div>
      ))}
      <button onClick={() => router.push("/parent/chat")}
        className="flex w-full items-center gap-3 mt-3 rounded-xl border border-dashed border-line bg-fill p-3.5 text-left">
        <span className="grid place-items-center w-9 h-9 rounded-xl bg-surface border border-line text-accent-ink shrink-0"><Ic name="chat" size={18} /></span>
        <span className="flex-1 text-[12.5px] font-bold text-ink">찾는 답이 없나요?<small className="block text-[11px] text-ink3 font-medium mt-0.5">채팅으로 바로 물어보세요 — 전화 안 하셔도 돼요</small></span>
        <span className="text-ink3 text-[15px] font-extrabold">→</span>
      </button>
    </div>
  );
}

/* ---------------- 발견 배너 캐러셀 ---------------- */
function BannerCarousel() {
  const { st, toast } = useParent();
  const list = BANNERS[st.academy] ?? [];
  const carRef = useRef<HTMLDivElement>(null);
  const [cur, setCur] = useState(0);

  // 학원 전환 리셋은 사용처의 key={`bn-${st.academy}`} 리마운트로 처리 — effect 불필요
  if (!list.length) return null;

  const onScroll = () => {
    const car = carRef.current; if (!car) return;
    const cards = car.querySelectorAll<HTMLElement>("[data-bncard]");
    if (!cards.length) return;
    const w = cards[0].offsetWidth + 11;
    setCur(Math.max(0, Math.min(cards.length - 1, Math.round(car.scrollLeft / w))));
  };
  const onKey = (e: React.KeyboardEvent) => {
    const car = carRef.current; if (!car) return;
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const cards = car.querySelectorAll<HTMLElement>("[data-bncard]");
      const idx = Math.max(0, Math.min(cards.length - 1, cur + (e.key === "ArrowRight" ? 1 : -1)));
      car.scrollTo({ left: idx * (cards[0].offsetWidth + 11), behavior: "smooth" });
    }
  };

  return (
    <div className="mt-1">
      <div className="flex justify-between items-center px-0.5 pb-2">
        <span className="text-[12px] font-extrabold text-ink3">추천 · 소식</span>
        <button onClick={() => toast("맞춤 추천은 핵심 서비스와 별개로 켜고 끌 수 있어요 (개인화 동의 분리 · 데모)")}
          className="text-[11.5px] font-bold text-accent-ink px-1 py-0.5">맞춤 추천 설정</button>
      </div>
      <div ref={carRef} onScroll={onScroll} onKeyDown={onKey} tabIndex={0} role="group" aria-label="학원 소식과 추천"
        className="flex gap-2.5 overflow-x-auto snap-x snap-mandatory pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {list.map((b, i) => (
          <button key={i} data-bncard onClick={() => toast(`[${b.label}] ${b.t} — 상세로 이동 (데모)`)}
            className="relative shrink-0 basis-[84%] snap-center rounded-[17px] overflow-hidden min-h-[138px] flex flex-col justify-end p-[15px] text-white text-left">
            <div className="absolute inset-0 z-0" style={{ background: b.bg }} />
            <span className={cn("relative z-[1] self-start text-[9.5px] font-extrabold px-2.5 py-1 rounded-full mb-auto backdrop-blur-sm", b.ad ? "bg-black/35" : "bg-white/25")}>{b.label}</span>
            <div className="relative z-[1] text-[15.5px] font-extrabold tracking-tight leading-tight mt-2.5">{b.t}</div>
            <div className="relative z-[1] text-[12px] font-medium opacity-95 mt-1 leading-snug">{b.s}</div>
            <div className="relative z-[1] text-[11.5px] font-extrabold mt-2.5">{b.cta} →</div>
          </button>
        ))}
      </div>
      <div className="flex gap-1.5 justify-center mt-3">
        {list.map((_, i) => (
          <span key={i} className={cn("h-1.5 rounded-full transition-all", i === cur ? "w-[18px] bg-accent-ink" : "w-1.5 bg-[#D1D6DB]")} />
        ))}
      </div>
    </div>
  );
}
