"use client";

/* 로그인 (R3 P1-7 — 루트 = 인증의 출발점. 역할 허브는 /demo 로 분리)
   ⚠️ 시뮬레이션: 실제 OAuth 미연동. 버튼 → /select (약관·학원/역할 선택 목업).
   실서비스 흐름(docs/10-auth-route-guard.md):
   로그인 → callback → 약관·동의 → 학원/역할 선택 → 자녀연결 → 보호 route */

import Link from "next/link";
import { useRouter } from "next/navigation";

const SSO = [
  { key: "kakao", label: "카카오로 시작하기", bg: "#FEE500", ink: "#191600", anchor: true },
  { key: "naver", label: "네이버", bg: "#03C75A", ink: "#fff" },
  { key: "google", label: "Google", bg: "#fff", ink: "#1f1f1f", border: true },
  { key: "apple", label: "Apple", bg: "#111", ink: "#fff" },
];

export default function LoginPage() {
  const router = useRouter();
  const start = (provider: string) => {
    // PG·OAuth 시뮬레이션 — 실서비스: POST /auth/{provider}/start → authorizeUrl 리다이렉트
    router.push(`/select?provider=${provider}`);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <div className="text-4xl mb-3">🏃</div>
          <h1 className="text-[30px] font-extrabold tracking-tight text-ink">PACEFOLIO</h1>
          <p className="text-ink3 mt-2 text-[14px] leading-relaxed">
            한 걸음이, 한 페이지가 됩니다
          </p>
        </div>

        {/* 카카오 = 앵커 (헌법: 카카오·네이버·구글·애플) */}
        <button
          onClick={() => start("kakao")}
          className="w-full rounded-2xl py-3.5 text-[15px] font-bold transition hover:brightness-95"
          style={{ background: SSO[0].bg, color: SSO[0].ink }}
        >
          💬 {SSO[0].label}
        </button>

        <div className="grid grid-cols-3 gap-2 mt-2.5">
          {SSO.slice(1).map((s) => (
            <button
              key={s.key}
              onClick={() => start(s.key)}
              className={`rounded-2xl py-3 text-[13.5px] font-bold transition hover:brightness-95 ${s.border ? "border border-line" : ""}`}
              style={{ background: s.bg, color: s.ink }}
            >
              {s.label}
            </button>
          ))}
        </div>

        <p className="text-[11.5px] text-ink3 text-center mt-5 leading-relaxed">
          로그인하면 <b className="text-ink2">이용약관·개인정보 처리방침</b>에 동의 단계로 이동해요.
          <br />역할·학원 소속은 서버 세션에서 도출돼요 — 화면 선택은 UX일 뿐이에요.
        </p>

        <div className="mt-12 pt-5 border-t border-line text-center">
          <span className="text-[11px] font-semibold text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">
            프로토타입 — OAuth·세션 시뮬레이션
          </span>
          <div className="mt-3 flex items-center justify-center gap-4 text-[12.5px] font-semibold">
            <Link href="/demo" className="text-accent hover:underline">역할 허브(데모) →</Link>
            <Link href="/stage" className="text-ink3 hover:underline">라이브 스테이지 →</Link>
          </div>
          <div className="mt-2.5 text-center">
            <Link href="/onboarding?again=1" className="text-[12.5px] font-semibold text-accent hover:underline">보호자 온보딩(신규) →</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
