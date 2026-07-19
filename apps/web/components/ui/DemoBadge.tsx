"use client";

/* #33: 데모 정직 표시 — fixture 화면임을 화면 스스로 밝힌다(위장 금지 원칙의 시각화).
   시각 규약(색·위치·문구 톤)은 디자인 터미널 확정 대상 — 여기는 중립 최소형만. */
export function DemoBadge({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="pointer-events-none fixed bottom-3 right-3 z-[999] rounded-full bg-ink/85 px-3 py-1.5 text-[11px] font-bold text-white shadow-lg">
      데모 미리보기 · 실제 데이터 아님
    </div>
  );
}
