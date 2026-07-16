"use client";

/* 라이브 스테이지 — 원장·학부모·코치 3개 모바일 앱을 한 화면에 나란히.
   각 폰은 iframe이라 내부 하단탭으로 자유 이동 가능.
   ⚠️ 서로 연동(실시간 동기화)은 아직 없음 — 각자 독립 mock. */

import { useState } from "react";

interface Stage {
  key: string;
  href: string;
  label: string;
  emoji: string;
  tone: string;
  desc: string;
}

const STAGES: Stage[] = [
  { key: "owner", href: "/owner", label: "원장 앱", emoji: "🏫", tone: "#12b5a5", desc: "수납·원생·수업을 손안에서" },
  { key: "parent", href: "/parent", label: "학부모 앱", emoji: "👨‍👩‍👧", tone: "#3b82f6", desc: "아이 · 결제 · 알림" },
  { key: "coach", href: "/coach", label: "코치 앱", emoji: "🏃", tone: "#f97316", desc: "수업 · 커리큘럼 · 출결" },
];

export default function StagePage() {
  // key를 바꾸면 해당 iframe이 홈으로 리셋됨
  const [nonce, setNonce] = useState<Record<string, number>>({});
  const reset = (k: string) =>
    setNonce((n) => ({ ...n, [k]: (n[k] ?? 0) + 1 }));
  const resetAll = () =>
    setNonce((n) => {
      const next = { ...n };
      STAGES.forEach((s) => (next[s.key] = (n[s.key] ?? 0) + 1));
      return next;
    });

  return (
    <div className="min-h-screen bg-[#0e1116] text-white flex flex-col">
      {/* 상단바 */}
      <header className="shrink-0 h-16 flex items-center gap-4 px-6 border-b border-white/10">
        <div className="flex items-center gap-2">
          <span className="text-xl">🎬</span>
          <span className="font-extrabold tracking-tight text-[17px]">
            PACEFOLIO 라이브 스테이지
          </span>
          <span className="text-[11px] font-semibold text-amber-300 bg-amber-400/10 px-2 py-0.5 rounded-full">
            3개 앱 동시 보기
          </span>
        </div>
        <div className="flex-1" />
        <a
          href="/stage/live"
          className="text-[12px] font-bold px-3 h-8 rounded-lg bg-emerald-400/90 text-black hover:brightness-105 transition flex items-center gap-1"
        >
          🔗 라이브 연결 데모
        </a>
        <span className="hidden lg:block text-[12px] text-white/45">
          각 폰 안에서 하단탭으로 이동 · 3앱 병렬(독립 mock)
        </span>
        <button
          onClick={resetAll}
          className="text-[12px] font-semibold px-3 h-8 rounded-lg bg-white/10 hover:bg-white/15 transition"
        >
          ↻ 전체 홈으로
        </button>
        <a
          href="/"
          className="text-[12px] font-semibold px-3 h-8 rounded-lg bg-white/10 hover:bg-white/15 transition flex items-center"
        >
          허브
        </a>
      </header>

      {/* 스테이지 */}
      <div className="flex-1 overflow-x-auto">
        <div className="flex gap-6 justify-center items-start p-6 min-w-max mx-auto">
          {STAGES.map((s) => (
            <section key={s.key} className="flex flex-col items-center gap-3">
              <div className="flex items-center gap-2.5 w-[390px] px-1">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-lg shrink-0"
                  style={{ background: s.tone }}
                >
                  {s.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-[15px] leading-none">
                    {s.label}
                  </div>
                  <div className="text-[11px] text-white/45 mt-1 truncate">
                    {s.desc}
                  </div>
                </div>
                <button
                  onClick={() => reset(s.key)}
                  className="text-[11px] font-semibold text-white/60 hover:text-white px-2 h-7 rounded-md bg-white/5 hover:bg-white/10 transition"
                  aria-label={`${s.label} 홈으로`}
                >
                  ↻ 홈
                </button>
              </div>
              <div
                className="rounded-[28px] overflow-hidden shadow-2xl ring-1 ring-white/10"
                style={{ boxShadow: `0 20px 60px -20px ${s.tone}55` }}
              >
                <iframe
                  key={nonce[s.key] ?? 0}
                  src={s.href}
                  title={s.label}
                  className="block bg-white border-0"
                  style={{ width: 414, height: 860 }}
                />
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
