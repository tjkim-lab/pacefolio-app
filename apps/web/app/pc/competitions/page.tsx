"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PCShell } from "../_shell";
import { Button } from "@/components/ui";
import { useOverlays, Panel, RL, Pill, Meter, FilterChip } from "../_ui";
import { COMP_TEAMS_INIT, COMP_INVITES } from "../_data";
import { OwnerLiveProvider, useOwnerLive } from "../_live";

interface Pending { init: string; nm: string; status: "wait" | "ok"; }

export default function PCCompetitions() {
  return (
    <OwnerLiveProvider>
      <PCCompetitionsBody />
    </OwnerLiveProvider>
  );
}

/* #44: 참가 대상 선정 — AudienceFilter 공용 리졸버 재사용(원생·공지·청구와 같은 정본).
   동의 안내 발송 = 공지 엔진(audienceFilter) 재사용 — 수신자 산정·receipt 전부 서버. */
function InviteAudience() {
  const ownerLive = useOwnerLive();
  const { confirm, toast, overlays } = useOverlays();
  const [classIds, setClassIds] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [guardians, setGuardians] = useState(0);
  const [names, setNames] = useState<string[]>([]);
  const [sent, setSent] = useState(false);
  const toggle = (id: string) =>
    setClassIds((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));

  const { audiencePreview } = ownerLive;
  useEffect(() => {
    let alive = true;
    const filter = {
      classIds: classIds.length ? classIds : undefined,
      statuses: ["ENROLLED"], // 대회 초대 = 재원 원생만
    };
    void audiencePreview(filter).then((r) => {
      if (!alive || !r.ok) return;
      setTotal(r.total ?? 0);
      setGuardians(r.guardianRecipients ?? 0);
      setNames((r.members ?? []).map((m) => m.name));
    });
    return () => { alive = false; };
  }, [classIds, audiencePreview]);

  const send = () => {
    confirm({
      title: `참가 동의 안내를 보낼까요?`,
      rows: [
        ["대상 원생", `${total}명 (재원${classIds.length ? " · 선택 반" : " · 전체"})`],
        ["수신 보호자", `${guardians}명 (VERIFIED 연결만)`],
        ["방식", "공지 발행 — 읽음 추적·receipt 서버 기록"],
      ],
      label: "동의 안내 발송",
      onConfirm: () => {
        void ownerLive.publish({
          title: "강동 유소년 챔피언십 참가 동의 안내",
          body: "11/22(토) 강동 유소년 챔피언십 참가 동의를 부탁드려요. 참가비는 팀당 120,000원이며, 동의하신 원생만 명단에 포함됩니다.",
          audience: "대회 대상",
          audienceFilter: {
            classIds: classIds.length ? classIds : undefined,
            statuses: ["ENROLLED"],
          },
        }).then((r) => {
          toast(r.message);
          if (r.ok) setSent(true);
        });
      },
    });
  };

  return (
    <Panel title="참가 대상 선정" hnote="원생·공지·청구와 같은 공용 필터(서버 정본)">
      <div className="text-[11px] font-bold text-ink3 mb-1">반 (미선택 = 전체 · 재원만)</div>
      <div className="flex gap-2 flex-wrap">
        {ownerLive.classes.map((c) => (
          <FilterChip key={c.classId} active={classIds.includes(c.classId)} onClick={() => toggle(c.classId)}>{c.name}</FilterChip>
        ))}
      </div>
      <div className="mt-2.5 bg-fill rounded-xl px-3.5 py-2.5 text-[12px] font-semibold text-ink2 leading-relaxed">
        대상 <b className="text-brand">{total}명</b> · 수신 보호자 <b className="text-brand">{guardians}명</b>
        {names.length > 0 && <span className="block text-[11px] text-ink3 font-medium mt-0.5">{names.join(" · ")}</span>}
      </div>
      <Button variant="primary" full className="mt-2.5 h-11" onClick={send} disabled={sent || total === 0}>
        {sent ? "발송 완료 — 읽음은 공지 목록에서" : "참가 동의 안내 발송"}
      </Button>
      {overlays}
    </Panel>
  );
}

function PCCompetitionsBody() {
  const ownerLive = useOwnerLive();
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
      {ownerLive.state === "READY" && <InviteAudience />}
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
