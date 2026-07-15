"use client";

import { AppHeader, AppScroll } from "@/components/mobile/MobileShell";
import { cn } from "@/components/ui";
import { Note } from "../../_kit";

interface M {
  a: string;
  as: string;
  b: string;
  bs: string;
  winA?: boolean;
  q?: boolean;
}
const ROUNDS: { rh: string; matches: M[] }[] = [
  {
    rh: "8강 (2경기)",
    matches: [
      { a: "원더짐 FC", as: "2", b: "송파리틀킥", bs: "1", winA: true },
      { a: "천호FC", as: "-", b: "하남 Utd", bs: "-" },
    ],
  },
  {
    rh: "4강",
    matches: [
      { a: "원더짐 FC", as: "-", b: "강동드리블", bs: "-" },
      { a: "?", as: "", b: "?", bs: "", q: true },
    ],
  },
  {
    rh: "결승",
    matches: [{ a: "?", as: "", b: "?", bs: "", q: true }],
  },
];

const Trophy = () => (
  <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M7 4h10v4a5 5 0 0 1-10 0z" />
    <path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M9 20h6M12 13v4" />
  </svg>
);

export default function Bracket() {
  return (
    <>
      <AppHeader
        title={
          <span>
            대진표
            <small className="block text-[11.5px] font-medium text-ink3">강동 유소년 챔피언십 · 자동 생성</small>
          </span>
        }
        back="/owner/academy"
      />
      <AppScroll>
        <div className="flex gap-2.5 overflow-x-auto pb-1.5">
          {ROUNDS.map((r) => (
            <div key={r.rh} className="flex w-32 shrink-0 flex-col justify-around gap-2">
              <div className="text-center text-[10.5px] font-extrabold tracking-wide text-ink3">{r.rh}</div>
              {r.matches.map((m, i) => (
                <div key={i} className="overflow-hidden rounded-xl border border-line bg-surface">
                  {m.q ? (
                    <div className="grid h-[68px] place-items-center text-[12px] font-bold text-ink3">?</div>
                  ) : (
                    <>
                      <Row name={m.a} score={m.as} win={m.winA} />
                      <Row name={m.b} score={m.bs} win={!m.winA && m.bs !== "-" && m.bs !== "" && +m.bs > +m.as} />
                    </>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
        <Note icon={<Trophy />}>
          결과를 입력하면 <b className="font-bold text-ink">다음 대진·타임테이블이 자동 갱신</b>되고 참가 학부모 전원에게 실시간 공유돼요. 참가비는 청구 엔진 재사용.
        </Note>
      </AppScroll>
    </>
  );
}

function Row({ name, score, win }: { name: string; score: string; win?: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center justify-between border-b border-line2 px-3 py-2 text-[12px] font-bold last:border-b-0",
        win ? "bg-accent-weak text-accent-ink" : "text-ink",
      )}
    >
      <span>{name}</span>
      <span className="text-[11px] font-semibold text-ink3">{score}</span>
    </div>
  );
}
