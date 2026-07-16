"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PCShell } from "../_shell";
import { Button } from "@/components/ui";
import { useOverlays, Panel, RL, Pill, Meter } from "../_ui";
import { COMP_TEAMS_INIT, COMP_INVITES } from "../_data";

interface Pending { init: string; nm: string; status: "wait" | "ok"; }

export default function PCCompetitions() {
  const { confirm, toast, overlays } = useOverlays();
  const [teams, setTeams] = useState(4);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending[]>([]);
  const timers = useRef<number[]>([]);
  useEffect(() => () => { timers.current.forEach((t) => window.clearTimeout(t)); }, []);

  const invite = () => {
    if (busy || teams >= 6) return;
    const team = COMP_INVITES[Math.min(teams - 4, COMP_INVITES.length - 1)];
    confirm({
      title: "팀 초대를 보낼까요?",
      rows: [["대회", "강동 유소년 챔피언십"], ["초대 팀", team], ["참가비", "팀당 120,000원"], ["참가 관리", "원생 기준 · 보호자에게 동의 알림"]],
      label: "초대 발송",
      onConfirm: () => {
        setBusy(true);
        setPending((p) => [...p, { init: team.charAt(0), nm: team, status: "wait" }]);
        toast("초대 발송 완료 · 응답 대기");
        const t = window.setTimeout(() => {
          setTeams((n) => n + 1);
          setBusy(false);
          setPending((p) => p.map((x) => (x.nm === team ? { ...x, status: "ok" } : x)));
          toast(`${team} 참가 수락 — 팀 확정`);
        }, 1600);
        timers.current.push(t);
      },
    });
  };

  return (
    <PCShell title="대회" actions={<span className="text-[12.5px] text-ink3 font-medium">참가 원생 18명 · 참가 팀 {teams}팀</span>}>
      <div className="grid grid-cols-2 gap-3 items-start">
        <Panel title="강동 유소년 챔피언십" hnote="개최 중">
          <RL label="일시 · 종목" amount="11/22 (토) · 축구" />
          <RL label="참가비" amount="팀당 120,000원 · 청구 엔진 재사용" />
          <RL label="참가 원생" sub="보호자 동의 알림 발송됨" amount="18명 · 미응답 4명" />
          <div className="flex items-center gap-2.5 mt-3">
            <Meter pct={Math.round((teams / 6) * 100)} />
            <span className="text-[12px] font-bold text-ink2 whitespace-nowrap">팀 {teams}/6 확정</span>
          </div>
          <div className="flex gap-2 mt-3">
            <Button variant="primary" full className="h-11" onClick={invite} disabled={busy || teams >= 6}>
              {teams >= 6 ? "팀 확정 완료" : busy ? "응답 대기 중..." : "팀 초대"}
            </Button>
            <Link href="/pc/competitions/bracket" className="flex-1">
              <Button variant="line" full className="h-11">대진표 보기</Button>
            </Link>
          </div>
        </Panel>

        <Panel title="초대 현황">
          {COMP_TEAMS_INIT.map((t) => (
            <div key={t.nm} className="flex gap-2.5 items-center py-2.5 border-b border-line2">
              <div className="w-[30px] h-[30px] rounded-full bg-accent-weak grid place-items-center text-[13px] font-bold text-brand shrink-0">{t.init}</div>
              <div className="flex-1 text-[13px] font-semibold text-ink">
                {t.nm}{t.sub && <small className="block text-[11px] text-ink3 font-medium">{t.sub}</small>}
              </div>
              <Pill kind="ok">{t.status}</Pill>
            </div>
          ))}
          {pending.map((t) => (
            <div key={t.nm} className="flex gap-2.5 items-center py-2.5 border-b border-line2 last:border-0">
              <div className="w-[30px] h-[30px] rounded-full bg-fill grid place-items-center text-[13px] font-bold text-ink2 shrink-0">{t.init}</div>
              <div className="flex-1 text-[13px] font-semibold text-ink">
                {t.nm}<small className="block text-[11px] text-ink3 font-medium">{t.status === "ok" ? "참가 수락" : "초대 발송 완료"}</small>
              </div>
              <Pill kind={t.status === "ok" ? "ok" : "wait"}>{t.status === "ok" ? "확정" : "응답 대기"}</Pill>
            </div>
          ))}
        </Panel>
      </div>
      {overlays}
    </PCShell>
  );
}
