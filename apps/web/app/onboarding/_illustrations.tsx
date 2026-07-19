/* 보호자 온보딩 — 추상 일러스트(인라인 SVG · 브랜드 중립).
   ⚠️ ZEM 에셋 미사용. PACEFOLIO 고유 모티프(움직임·경험·뱃지·성장 기록)를
   토큰 색으로 단순 도형화. 장식이므로 aria-hidden. */

import type { IllustKey } from "./_data";

function tint(hex: string, alpha: number) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function Illust({ id, accent }: { id: IllustKey; accent: string }) {
  const soft = tint(accent, 0.14);
  const mid = tint(accent, 0.35);
  return (
    <div
      aria-hidden
      className="mx-auto grid place-items-center rounded-[28px]"
      style={{ width: "100%", maxWidth: 300, height: 220, background: soft }}
    >
      <svg width="180" height="150" viewBox="0 0 180 150" fill="none">
        {id === "lesson" && (
          <>
            <rect x="26" y="24" width="128" height="90" rx="16" fill="#fff" />
            <rect x="42" y="44" width="52" height="10" rx="5" fill={accent} />
            <rect x="42" y="64" width="96" height="8" rx="4" fill={mid} />
            <rect x="42" y="82" width="72" height="8" rx="4" fill={mid} />
            <circle cx="132" cy="112" r="20" fill={accent} />
            <path d="M124 112l6 6 12-13" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          </>
        )}
        {id === "movement" && (
          <>
            <circle cx="66" cy="66" r="34" fill={mid} />
            <circle cx="114" cy="66" r="34" fill={accent} opacity="0.85" />
            <circle cx="90" cy="104" r="34" fill={tint(accent, 0.55)} />
            <circle cx="66" cy="66" r="6" fill="#fff" />
            <circle cx="114" cy="66" r="6" fill="#fff" />
            <circle cx="90" cy="104" r="6" fill="#fff" />
          </>
        )}
        {id === "badge" && (
          <>
            <path d="M90 20l16 10 19-2 6 18 15 12-9 17 3 19-19 4-11 15-18-7-18 7-11-15-19-4 3-19-9-17 15-12 6-18 19 2z" fill={accent} />
            <circle cx="90" cy="70" r="26" fill="#fff" />
            <path d="M78 70l8 8 18-18" stroke={accent} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
          </>
        )}
        {id === "report" && (
          <>
            <rect x="30" y="30" width="120" height="90" rx="14" fill="#fff" />
            <rect x="46" y="86" width="16" height="20" rx="4" fill={mid} />
            <rect x="72" y="72" width="16" height="34" rx="4" fill={mid} />
            <rect x="98" y="56" width="16" height="50" rx="4" fill={accent} />
            <rect x="124" y="44" width="14" height="62" rx="4" fill={accent} />
            <path d="M46 78l26-14 26-12 26-10" stroke={accent} strokeWidth="3" strokeLinecap="round" opacity="0.5" />
          </>
        )}
        {id === "finish" && (
          <>
            <circle cx="90" cy="72" r="46" fill={mid} />
            <path d="M74 72l12 12 24-26" stroke="#fff" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="40" cy="34" r="6" fill={accent} />
            <circle cx="146" cy="46" r="5" fill={accent} />
            <circle cx="140" cy="110" r="7" fill={accent} />
            <circle cx="36" cy="104" r="5" fill={accent} />
          </>
        )}
      </svg>
    </div>
  );
}
