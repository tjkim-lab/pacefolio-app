"use client";

/* 공용 모바일 홈 배너 (docs/13-owner-product-plan.md §A — 12차 확정 규격)
   full width · 높이 144px · radius 18px · 좌우 swipe + 하단 indicator ·
   최대 5장 · 텍스트 안전영역 = 슬라이드 내부 p-4.
   학부모·코치·원장 홈이 같은 규격을 쓴다 — 같은 디자인 원본(1200×500,
   ≈2.4:1)으로 광고·공지·운영 메시지를 세 홈에 배포. 업무 숫자만 역할별. */
import { useRef, useState, type ReactNode } from "react";
import { cn } from "@/components/ui";

export function HomeBanner({
  slides,
  ariaLabel = "홈 배너",
}: {
  slides: ReactNode[];
  ariaLabel?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [cur, setCur] = useState(0);
  const n = Math.min(slides.length, 5);
  const onScroll = () => {
    const el = trackRef.current;
    if (!el) return;
    setCur(Math.max(0, Math.min(n - 1, Math.round(el.scrollLeft / el.clientWidth))));
  };
  const go = (i: number) => {
    const el = trackRef.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  };
  return (
    <div>
      <div
        ref={trackRef}
        onScroll={onScroll}
        role="group"
        aria-label={ariaLabel}
        className="flex snap-x snap-mandatory overflow-x-auto rounded-[18px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {slides.slice(0, 5).map((s, i) => (
          <div key={i} className="h-[144px] min-w-full shrink-0 snap-start overflow-hidden rounded-[18px]">
            {s}
          </div>
        ))}
      </div>
      <div className="mt-2.5 flex justify-center gap-1.5">
        {Array.from({ length: n }, (_, i) => (
          <button
            key={i}
            aria-label={`슬라이드 ${i + 1}`}
            onClick={() => go(i)}
            className={cn("h-1.5 rounded-full transition-all", i === cur ? "w-[18px] bg-accent" : "w-1.5 bg-line")}
          />
        ))}
      </div>
    </div>
  );
}
