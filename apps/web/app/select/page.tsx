"use client";

/* OAuth callback 이후: 약관·동의 → 학원/역할 선택 (R3 P1-7 목업)
   실서비스: 역할은 이 화면의 "선택"이 아니라 GET /sessions/me 의
   memberships(서버 도출)로 결정 — 다중 학원/역할일 때만 선택 UI 노출.

   R4 §14 P1 반영:
   - P1-1 약관 "보기" 를 행 동의 클릭과 분리(별도 버튼 → 내용 펼침)
   - P1-2 체크박스 접근성: role="checkbox" + aria-checked (전체동의 부분선택 = "mixed")
   - P1-3 필수 전체동의 ≠ 마케팅 동의 — 전체동의가 선택 항목을 켜지 않도록 분리 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const REQUIRED_CONSENTS = [
  {
    key: "tos", label: "서비스 이용약관 (필수)", ver: "v1.0",
    body: "페이스폴리오 서비스 이용 조건·계정·책임 범위를 정합니다. (목업 — 실서비스에서 전문 표시, consentPolicyVersion 기록)",
  },
  {
    key: "privacy", label: "개인정보 수집·이용 동의 (필수)", ver: "v1.0",
    body: "서비스 제공에 필요한 최소 정보(이름·연락처·자녀 연결 정보)를 수집·이용합니다. 목적 외 이용 금지. (목업 — 실서비스에서 전문 표시)",
  },
];
const MARKETING_CONSENT = {
  key: "marketing", label: "혜택·광고 알림 동의 — 선택", ver: "v1.0",
  body: "이벤트·혜택 소식을 받아요. 동의하지 않아도 모든 기능을 쓸 수 있고, 언제든 알림 설정에서 끌 수 있어요. (목업)",
};

const ROLES = [
  { href: "/parent", emoji: "👨‍👩‍👧", label: "학부모", desc: "김도담·김서준 보호자", tone: "#3b82f6" },
  { href: "/coach", emoji: "🏃", label: "코치", desc: "박코치 · 인라인 A반 담당", tone: "#f97316" },
  { href: "/owner", emoji: "🏫", label: "원장", desc: "원더짐 아카데미", tone: "#12b5a5" },
];

/* 접근 가능한 체크박스(시각은 기존과 동일) */
function CheckBox({ checked, mixed, label, onToggle }: {
  checked: boolean; mixed?: boolean; label: string; onToggle: () => void;
}) {
  return (
    <span
      role="checkbox"
      aria-checked={mixed ? "mixed" : checked}
      aria-label={label}
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); onToggle(); } }}
      className={`w-5 h-5 rounded-md grid place-items-center text-white text-[12px] font-bold shrink-0 cursor-pointer ${checked || mixed ? "bg-accent-strong" : "bg-line"}`}
    >
      {mixed ? "−" : "✓"}
    </span>
  );
}

interface ConsentDef { key: string; label: string; ver: string; body: string }

function ConsentRow({ c, checked, expanded, onToggle, onView }: {
  c: ConsentDef; checked: boolean; expanded: boolean;
  onToggle: () => void; onView: () => void;
}) {
  return (
    <div className="pt-3">
      <div className="flex w-full items-center gap-2.5">
        <CheckBox checked={checked} label={c.label} onToggle={onToggle} />
        <button onClick={onToggle} className="flex-1 text-left text-[13px] font-semibold text-ink2">
          {c.label}
        </button>
        <span className="text-[12px] text-ink3">{c.ver}</span>
        {/* P1-1: "보기" 는 동의와 다른 조작 — 별도 버튼 */}
        <button
          onClick={onView}
          aria-expanded={expanded}
          className="text-[12px] font-bold text-accent underline underline-offset-2 shrink-0"
        >
          보기
        </button>
      </div>
      {expanded && (
        <p className="mt-2 ml-[30px] text-[12px] leading-relaxed text-ink3 bg-bg rounded-lg p-2.5">
          {c.body}
        </p>
      )}
    </div>
  );
}

export default function SelectPage() {
  const router = useRouter();
  const [agreed, setAgreed] = useState<Record<string, boolean>>({ tos: false, privacy: false, marketing: false });
  const [viewing, setViewing] = useState<string | null>(null); // 펼쳐진 약관 key
  const requiredOk = agreed.tos && agreed.privacy;
  const someRequired = agreed.tos || agreed.privacy;

  const toggle = (key: string) => setAgreed((p) => ({ ...p, [key]: !p[key] }));
  const view = (key: string) => setViewing((v) => (v === key ? null : key));
  // P1-3: "전체 동의" 는 필수 항목만 — 선택(마케팅)은 건드리지 않는다
  const toggleAllRequired = () => {
    const on = !requiredOk;
    setAgreed((p) => ({ ...p, tos: on, privacy: on }));
  };

  return (
    <div className="min-h-screen flex flex-col items-center px-6 py-14">
      <div className="w-full max-w-sm">
        <h1 className="text-[22px] font-extrabold text-ink">거의 다 왔어요</h1>
        <p className="text-ink3 mt-1 text-[13.5px]">동의하고, 어떤 역할로 들어갈지 골라주세요.</p>

        {/* 필수 약관 (정책 버전 명시 — consentPolicyVersion) */}
        <div className="mt-6 rounded-2xl border border-line bg-surface p-4">
          <div className="flex w-full items-center gap-2.5 pb-3 border-b border-line2">
            <CheckBox
              checked={requiredOk}
              mixed={!requiredOk && someRequired}
              label="필수 항목 전체 동의"
              onToggle={toggleAllRequired}
            />
            <button onClick={toggleAllRequired} className="flex-1 text-left text-[14px] font-extrabold text-ink">
              필수 항목 전체 동의
            </button>
          </div>
          {REQUIRED_CONSENTS.map((c) => (
            <ConsentRow key={c.key} c={c} checked={!!agreed[c.key]} expanded={viewing === c.key}
              onToggle={() => toggle(c.key)} onView={() => view(c.key)} />
          ))}
        </div>

        {/* 선택 동의 — 필수와 분리(전체동의에 포함되지 않음) */}
        <div className="mt-3 rounded-2xl border border-line bg-surface p-4">
          <ConsentRow c={MARKETING_CONSENT} checked={!!agreed.marketing} expanded={viewing === MARKETING_CONSENT.key}
            onToggle={() => toggle(MARKETING_CONSENT.key)} onView={() => view(MARKETING_CONSENT.key)} />
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
