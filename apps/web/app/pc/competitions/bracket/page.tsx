"use client";

import Link from "next/link";
import { PCShell } from "../../_shell";
import { Card } from "@/components/ui";
import { IconArrowLeft, IconSpark } from "@/components/ui/icons";
import { Note } from "../../_ui";

interface Match { rows: { name: string; score: string; win?: boolean }[]; }
const ROUNDS: { head: string; matches: Match[] }[] = [
  {
    head: "8강 (2경기)",
    matches: [
      { rows: [{ name: "원더짐 FC", score: "2", win: true }, { name: "송파리틀킥", score: "1" }] },
      { rows: [{ name: "천호FC", score: "-" }, { name: "하남 Utd", score: "-" }] },
    ],
  },
  {
    head: "4강",
    matches: [
      { rows: [{ name: "원더짐 FC", score: "-" }, { name: "강동드리블", score: "-" }] },
      { rows: [{ name: "?", score: "" }, { name: "?", score: "" }] },
    ],
  },
  {
    head: "결승",
    matches: [{ rows: [{ name: "?", score: "" }, { name: "?", score: "" }] }],
  },
];

export default function PCBracket() {
  return (
    <PCShell title="대진표" actions={<span className="text-[12.5px] text-ink3 font-medium">강동 유소년 챔피언십 · 자동 생성</span>}>
      <Link href="/pc/competitions" className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-ink2 border border-line rounded-lg px-3 py-2 hover:bg-fill transition">
        <IconArrowLeft size={14} /> 대회
      </Link>

      <Card className="overflow-x-auto">
        <div className="flex gap-3 pb-1.5">
          {ROUNDS.map((r) => (
            <div key={r.head} className="flex-[0_0_180px] flex flex-col gap-2 justify-around">
              <div className="text-[10.5px] font-extrabold text-ink3 text-center tracking-wider">{r.head}</div>
              {r.matches.map((m, i) => (
                <div key={i} className="rounded-xl border border-line overflow-hidden bg-surface">
                  {m.rows.map((row, j) => (
                    <div
                      key={j}
                      className={`flex justify-between items-center px-3 py-2 text-[12px] font-bold border-b border-line2 last:border-0 ${row.win ? "bg-accent-weak text-brand" : "text-ink"}`}
                    >
                      {row.name}
                      {row.score && <small className="text-ink3 font-semibold text-[11px]">{row.score}</small>}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      </Card>

      <Note icon={<IconSpark size={16} />}>
        결과를 입력하면 <b className="text-ink font-bold">다음 대진·타임테이블이 자동 갱신</b>되고 참가 원생의 보호자 전원에게 실시간 공유돼요.
      </Note>
    </PCShell>
  );
}
