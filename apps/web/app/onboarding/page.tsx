"use client";

/* 보호자 온보딩·가입 (신규 흐름) — ZEM 벤치마크 변환.
   모델(2026-07-19 개정): 초대코드로 학원 진입 → 본인인증(시뮬) → 약관 → 아이 직접 등록.
   학원 선등록 원생을 매칭하지 않는다. 아이 검색·연결코드(아이용)·QR·승인 없음.
   초대코드 = 학원(테넌트) 지정용. docs/design/guardian-zem-benchmark.md */

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui";
import {
  OnboardingLayout, OnboardingTopBar, PageHeader, BottomCTA, Dots, InlineError,
} from "./_components";
import {
  PhoneField, OtpField, AgreementList, InviteCodeField, AcademyBadge,
  AcademyPickRow, ChildFormCard, PermissionGuide, NoteCard,
} from "./_fields";
import { Illust } from "./_illustrations";
import { OnboardingProvider, useOnboarding, FLOW } from "./_state";
import {
  SLIDES, AGREEMENTS, ACADEMIES, OTP_LEN, OTP_RESEND_SEC, ONBOARDED_KEY,
} from "./_data";

export default function OnboardingPage() {
  return (
    <OnboardingProvider>
      <Suspense fallback={null}>
        <Flow />
      </Suspense>
    </OnboardingProvider>
  );
}

function Flow() {
  const { step, setCode, resolveInvite } = useOnboarding();
  const router = useRouter();
  const params = useSearchParams();
  const initCode = useRef(false);

  // 재방문 반복 강제 안 함 + 초대링크(?code=) 자동 인식
  useEffect(() => {
    if (params.get("again") !== "1") {
      try { if (localStorage.getItem(ONBOARDED_KEY) === "1") { router.replace("/parent"); return; } } catch { /* noop */ }
    }
    if (!initCode.current) {
      initCode.current = true;
      const c = params.get("code");
      if (c) { setCode(c.toUpperCase()); resolveInvite(c); }
    }
  }, [params, router, setCode, resolveInvite]);

  switch (step) {
    case "intro": return <IntroCarousel />;
    case "invite": return <InviteStep />;
    case "phone": return <PhoneStep />;
    case "otp": return <OtpStep />;
    case "agree": return <AgreeStep />;
    case "register": return <RegisterStep />;
    case "notify": return <NotifyStep />;
    default: return null;
  }
}

const flowTotal = FLOW.length;
const flowIdxOf = (name: string) => FLOW.indexOf(name as (typeof FLOW)[number]);

/* ============================ O1 캐러셀 ============================ */
function IntroCarousel() {
  const { go } = useOnboarding();
  const ref = useRef<HTMLDivElement>(null);
  const [cur, setCur] = useState(0);
  const last = SLIDES.length - 1;

  const onScroll = () => {
    const el = ref.current; if (!el) return;
    const cards = el.querySelectorAll<HTMLElement>("[data-slide]");
    if (!cards.length) return;
    setCur(Math.max(0, Math.min(cards.length - 1, Math.round(el.scrollLeft / cards[0].offsetWidth))));
  };
  const goTo = (i: number) => {
    const el = ref.current; if (!el) return;
    const cards = el.querySelectorAll<HTMLElement>("[data-slide]");
    if (cards.length) el.scrollTo({ left: i * cards[0].offsetWidth, behavior: "smooth" });
  };
  const next = () => (cur < last ? goTo(cur + 1) : go("invite"));

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="h-14 flex items-center justify-end px-4 shrink-0">
        <button onClick={() => go("invite")} className="min-h-11 px-2 text-[13.5px] font-semibold text-ink3 hover:text-ink2 transition">건너뛰기</button>
      </div>
      <div ref={ref} onScroll={onScroll}
        className="flex-1 flex overflow-x-auto snap-x snap-mandatory overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {SLIDES.map((s) => (
          <section key={s.key} data-slide className="shrink-0 basis-full snap-center flex flex-col items-center justify-center px-7 text-center">
            <Illust id={s.key} accent={s.accent} />
            <h1 className="mt-9 text-[24px] font-extrabold leading-[1.35] tracking-tight text-ink whitespace-pre-line">{s.title}</h1>
            <p className="mt-3.5 text-[15px] leading-relaxed text-ink2 font-medium whitespace-pre-line">{s.body}</p>
          </section>
        ))}
      </div>
      <div className="shrink-0 px-5 pt-4 pb-7">
        <div className="mb-5"><Dots index={cur} total={SLIDES.length} /></div>
        <Button full variant="primary" onClick={next}>{cur < last ? "다음" : "시작하기"}</Button>
      </div>
    </div>
  );
}

/* ============================ O2 초대코드/학원 확인 ============================ */
function InviteStep() {
  const { go, code, setCode, academy, resolveInvite, pickAcademy, clearAcademy, error, clearError, busy } = useOnboarding();
  const [finding, setFinding] = useState(false);

  if (academy) {
    return (
      <OnboardingLayout
        top={<OnboardingTopBar onBack={() => go("intro")} index={flowIdxOf("invite")} total={flowTotal} />}
        cta={<BottomCTA primary="네, 시작할게요" onPrimary={() => go("phone")}
          secondary="학원 다시 선택" onSecondary={() => { setFinding(false); clearAcademy(); }} />}
      >
        <PageHeader title={"학원을\n확인했어요"} sub="이 학원이 맞는지 확인해 주세요." />
        <AcademyBadge academy={academy} />
      </OnboardingLayout>
    );
  }

  if (finding) {
    return (
      <OnboardingLayout
        top={<OnboardingTopBar onBack={() => setFinding(false)} index={flowIdxOf("invite")} total={flowTotal} />}
        cta={<BottomCTA primary="초대코드로 입력하기" onPrimary={() => setFinding(false)} />}
      >
        <PageHeader title={"어느 학원인가요?"} sub="다니는 학원을 골라주세요." />
        <div className="space-y-2.5">
          {ACADEMIES.map((a) => <AcademyPickRow key={a.id} academy={a} selected={false} onSelect={() => pickAcademy(a)} />)}
        </div>
      </OnboardingLayout>
    );
  }

  return (
    <OnboardingLayout
      top={<OnboardingTopBar onBack={() => go("intro")} index={flowIdxOf("invite")} total={flowTotal} />}
      cta={<BottomCTA primary="학원 확인" onPrimary={() => resolveInvite()} primaryDisabled={code.length < 4} loading={busy}
        secondary="초대코드가 없어요 · 학원 찾기" onSecondary={() => { clearError(); setFinding(true); }} />}
    >
      <PageHeader title={"어느 학원에\n등록하나요?"} sub={"학원에서 받은 초대코드를 입력하면\n자동으로 연결돼요."} />
      <InviteCodeField value={code} onChange={(v) => { if (error) clearError(); setCode(v); }} invalid={!!error} />
      {error && <InlineError>{error}</InlineError>}
      <div className="mt-3"><NoteCard icon="💡">데모 초대코드 — <b className="text-ink2">WG2025</b>(원더짐) · <b className="text-ink2">GD2025</b>(강동). 학원이 명단을 올리면 학부모님께 코드가 자동 발송돼요.</NoteCard></div>
    </OnboardingLayout>
  );
}

/* ============================ O3 휴대폰 번호 ============================ */
function PhoneStep() {
  const { go, phone, setPhone, carrier, setCarrier } = useOnboarding();
  const ok = phone.replace(/\D/g, "").length >= 10;
  return (
    <OnboardingLayout
      top={<OnboardingTopBar onBack={() => go("invite")} index={flowIdxOf("phone")} total={flowTotal} />}
      cta={<BottomCTA primary="인증번호 받기" onPrimary={() => go("otp")} primaryDisabled={!ok} />}
    >
      <PageHeader title={"본인 명의 휴대폰 번호를\n알려주세요"} sub={"안전하게 아이 성장기록을 관리하려면\n보호자 본인확인이 필요해요."} />
      <PhoneField phone={phone} onPhone={setPhone} carrier={carrier} onCarrier={setCarrier} />
      <div className="mt-3"><NoteCard icon="🔒">본인확인 정보는 보호자 확인에만 쓰여요. (데모 — 아무 번호나 입력하면 넘어가요)</NoteCard></div>
    </OnboardingLayout>
  );
}

/* ============================ O4 인증번호 ============================ */
function OtpStep() {
  const { go, phone, submitOtp, error, clearError, busy } = useOnboarding();
  const [code, setCode] = useState("");
  const [left, setLeft] = useState(OTP_RESEND_SEC);

  useEffect(() => {
    if (left <= 0) return;
    const t = window.setInterval(() => setLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => window.clearInterval(t);
  }, [left]);

  const mmss = useMemo(() => `${Math.floor(left / 60)}:${(left % 60).toString().padStart(2, "0")}`, [left]);
  const onChange = (v: string) => { if (error) clearError(); setCode(v); };

  return (
    <OnboardingLayout
      top={<OnboardingTopBar onBack={() => go("phone")} index={flowIdxOf("otp")} total={flowTotal} />}
      cta={<BottomCTA primary="확인" onPrimary={() => submitOtp(code)} primaryDisabled={code.length < OTP_LEN} loading={busy}
        secondary="번호 다시 입력" onSecondary={() => go("phone")} />}
    >
      <PageHeader title={"문자로 받은 인증번호\n6자리를 입력해요"} sub={<><b className="text-ink font-bold">{phone || "휴대폰"}</b> 로 인증번호를 보냈어요.</>} />
      <OtpField value={code} onChange={onChange} error={!!error} />
      {error && <InlineError>{error}</InlineError>}
      <div className="flex items-center justify-between mt-4">
        <span className="text-[13px] font-semibold text-ink3">남은 시간 <b className="text-accent-ink">{mmss}</b></span>
        <button onClick={() => { setLeft(OTP_RESEND_SEC); setCode(""); clearError(); }} className="min-h-11 text-[13px] font-bold text-ink2 hover:text-ink transition">인증번호 다시 받기</button>
      </div>
      <div className="mt-1"><NoteCard icon="💡">데모 — 아무 6자리나 입력하면 넘어가요. <b className="text-ink2">000000</b>은 오류 예시예요.</NoteCard></div>
    </OnboardingLayout>
  );
}

/* ============================ O5 약관 동의 ============================ */
function AgreeStep() {
  const { go, agreed, toggleAgree, setAll } = useOnboarding();
  const requiredOk = AGREEMENTS.filter((a) => a.required).every((a) => agreed[a.id]);
  return (
    <OnboardingLayout
      top={<OnboardingTopBar onBack={() => go("otp")} index={flowIdxOf("agree")} total={flowTotal} />}
      cta={<BottomCTA primary="동의하고 계속하기" onPrimary={() => go("register")} primaryDisabled={!requiredOk}
        note="필수 약관에 동의해야 계속할 수 있어요. 마케팅 수신은 동의하지 않아도 돼요." />}
    >
      <PageHeader title={"시작하기 전,\n약관에 동의해 주세요"} />
      <AgreementList items={AGREEMENTS} agreed={agreed} onToggle={toggleAgree} onAll={setAll} />
    </OnboardingLayout>
  );
}

/* ============================ O6 아이 등록(직접 입력) ============================ */
function RegisterStep() {
  const { go, academy, children, addChild, updateChild, removeChild, runRegister, busy, error } = useOnboarding();
  const programs = academy?.programs ?? ACADEMIES[0].programs;
  const allValid = children.length > 0 && children.every((c) => c.name.trim() && c.birth && c.programId);

  return (
    <OnboardingLayout
      top={<OnboardingTopBar onBack={() => go("agree")} index={flowIdxOf("register")} total={flowTotal} />}
      cta={<BottomCTA primary="등록 완료" onPrimary={runRegister} primaryDisabled={!allValid} loading={busy} />}
    >
      <PageHeader title={"우리 아이를\n등록해요"} sub={academy ? `${academy.name} · 아이 정보를 입력하면 바로 시작해요.` : "아이 정보를 입력하면 바로 시작해요."} />
      <div className="space-y-3">
        {children.map((c, i) => (
          <ChildFormCard key={c.id} index={i} child={c} programs={programs}
            onChange={(patch) => updateChild(c.id, patch)}
            onRemove={children.length > 1 ? () => removeChild(c.id) : undefined} />
        ))}
        <button onClick={addChild}
          className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-line bg-fill min-h-12 text-[14px] font-bold text-ink2 hover:bg-line2 transition">
          <span aria-hidden className="text-[17px] leading-none">＋</span> 아이 추가 (형제·자매)
        </button>
        {error && <InlineError>{error}</InlineError>}
        <NoteCard icon="✅">아이는 계정을 따로 만들지 않아요. 등록한 정보는 나중에 학원과 함께 확인·수정할 수 있어요.</NoteCard>
      </div>
    </OnboardingLayout>
  );
}

/* ============================ O7 알림 권한 안내 ============================ */
function NotifyStep() {
  const router = useRouter();
  const finish = () => {
    try { localStorage.setItem(ONBOARDED_KEY, "1"); } catch { /* noop */ }
    router.replace("/parent");
  };
  return (
    <OnboardingLayout
      top={<OnboardingTopBar index={flowIdxOf("notify")} total={flowTotal} />}
      cta={<BottomCTA primary="성장 알림 받기" onPrimary={finish} secondary="나중에 할게요" onSecondary={finish}
        note="알림을 꺼도 앱은 그대로 이용할 수 있어요." />}
    >
      <PageHeader title={"아이의 새로운 성장을\n놓치지 않도록 알려드릴게요"} sub={"새 수업 기록과 기술 뱃지가 도착하면\nPACEFOLIO가 알려드려요."} />
      <PermissionGuide items={["새로운 수업 기록", "기술 클리어와 뱃지", "코치의 성장 이야기"]} />
    </OnboardingLayout>
  );
}
