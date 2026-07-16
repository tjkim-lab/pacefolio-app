"use client";

/* OAuth callback 이후: 약관·동의 → 학원/역할 선택 (R3 P1-7 목업)
   실서비스: 역할은 이 화면의 "선택"이 아니라 GET /sessions/me 의
   memberships(서버 도출)로 결정 — 다중 학원/역할일 때만 선택 UI 노출. */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const CONSENTS = [
  { key: "tos", label: "서비스 이용약관 (필수)", ver: "v1.0" },
  { key: "privacy", label: "개인정보 수집·이용 동의 (필수)", ver: "v1.0" },
  { key: "marketing", label: "혜택·소식 알림 (선택)", ver: "v1.0", optional: true },
];

const ROLES = [
  { href: "/parent", emoji: "👨‍👩‍👧", label: "학부모", desc: "김도담·김서준 보호자", tone: "#3b82f6" },
  { href: "/coach", emoji: "🏃", label: "코치", desc: "박코치 · 인라인 A반 담당", tone: "#f97316" },
  { href: "/owner", emoji: "🏫", label: "원장", desc: "원더짐 아카데미", tone: "#12b5a5" },
];

export default function SelectPage() {
  const router = useRouter();
  const [agreed, setAgreed] = useState<Record<string, boolean>>({ tos: false, privacy: false, marketing: false });
  const requiredOk = agreed.tos && agreed.privacy;
  const allOn = CONSENTS.every((c) => agreed[c.key]);
  const toggleAll = () => {
    const on = !allOn;
    setAgreed({ tos: on, privacy: on, marketing: on });
  };

  return (
    <div className="min-h-screen flex flex-col items-center px-6 py-14">
      <div className="w-full max-w-sm">
        <h1 className="text-[22px] font-extrabold text-ink">거의 다 왔어요</h1>
        <p className="text-ink3 mt-1 text-[13.5px]">동의하고, 어떤 역할로 들어갈지 골라주세요.</p>

        {/* 약관 (정책 버전 명시 — consentPolicyVersion) */}
        <div className="mt-6 rounded-2xl border border-line bg-surface p-4">
          <button onClick={toggleAll} className="flex w-full items-center gap-2.5 pb-3 border-b border-line2">
            <span className={`w-5 h-5 rounded-md grid place-items-center text-white text-[12px] font-bold ${allOn ? "bg-accent-strong" : "bg-line"}`}>✓</span>
            <span className="text-[14px] font-extrabold text-ink">전체 동의</span>
          </button>
          {CONSENTS.map((c) => (
            <button key={c.key}
              onClick={() => setAgreed((p) => ({ ...p, [c.key]: !p[c.key] }))}
              className="flex w-full items-center gap-2.5 pt-3 text-left">
              <span className={`w-5 h-5 rounded-md grid place-items-center text-white text-[12px] font-bold shrink-0 ${agreed[c.key] ? "bg-accent-strong" : "bg-line"}`}>✓</span>
              <span className="flex-1 text-[13px] font-semibold text-ink2">{c.label}</span>
              <span className="text-[11px] text-ink3">{c.ver}</span>
            </button>
          ))}
        </div>

        {/* 학원 (단일 소속 — 다중이면 선택 리스트) */}
        <div className="mt-4 rounded-2xl border border-accent bg-accent-weak/40 p-4 flex items-center gap-3">
          <span className="text-2xl">🤸</span>
          <div className="flex-1">
            <div className="text-[14px] font-extrabold text-ink">원더짐 아카데미</div>
            <div className="text-[12px] text-ink3">소속 학원 1곳 — 자동 선택</div>
          </div>
          <span className="text-[11px] font-bold text-accent">ACTIVE</span>
        </div>

        {/* 역할 */}
        <h2 className="text-[13px] font-bold text-ink3 mt-6 mb-2.5 px-1">역할 선택 (시뮬레이션)</h2>
        <div className="space-y-2">
          {ROLES.map((r) => (
            <button key={r.href}
              disabled={!requiredOk}
              onClick={() => router.push(r.href)}
              className="flex w-full items-center gap-3.5 rounded-2xl bg-surface border border-line p-3.5 text-left transition hover:border-accent disabled:opacity-40">
              <span className="grid place-items-center w-11 h-11 rounded-xl text-white text-xl shrink-0" style={{ background: r.tone }}>{r.emoji}</span>
              <span className="flex-1">
                <span className="block text-[15px] font-bold text-ink">{r.label}</span>
                <span className="block text-[12px] text-ink3 mt-0.5">{r.desc}</span>
              </span>
              <span className="text-ink3">→</span>
            </button>
          ))}
        </div>
        {!requiredOk && (
          <p className="text-[12px] text-ink3 mt-3 text-center">필수 약관 2개에 동의하면 들어갈 수 있어요.</p>
        )}

        <p className="text-[11px] text-ink3 mt-8 text-center leading-relaxed">
          실서비스: 역할은 서버 세션(memberships)에서 도출 — 클라이언트 선택을 신뢰하지 않아요.
          <br /><Link href="/" className="underline">← 로그인으로</Link>
        </p>
      </div>
    </div>
  );
}
