"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppScroll } from "@/components/mobile/MobileShell";
import { Card, Tag, cn } from "@/components/ui";
import { IconBell, IconChevron } from "@/components/ui/icons";
import {
  useToast,
  useConfirm,
  Greeting,
  CardH4,
  RLRow,
  Meter,
  SentNote,
  Spinner,
} from "../_kit";
import { NOTICE_TARGETS, COACHES, SETTINGS_ROWS, CMP_INVITES } from "../_data";

const Mega = () => (
  <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 11v2a1 1 0 0 0 1 1h2l9 5V5L6 10H4a1 1 0 0 0-1 1z" />
    <path d="M18 8a4 4 0 0 1 0 8" />
  </svg>
);

export default function OwnerAcademy() {
  const { toast, toastNode } = useToast();
  const { confirm, confirmNode } = useConfirm();
  const router = useRouter();

  return (
    <>
      <AppScroll>
        <Greeting title={<>학원 🏫</>} sub="원더짐 아카데미 · 코치 3명" bell={<IconBell size={20} />} />
        <NoticeComposer confirm={confirm} toast={toast} />
        <RecentNotices />
        {/* 강사 관리 */}
        <Card>
          <CardH4 note="3명">강사 관리</CardH4>
          {COACHES.map((c) => (
            <div key={c.name} className="flex items-center gap-2.5 border-b border-line2 py-3 last:border-b-0">
              <div className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full text-[12.5px] font-bold", c.gold ? "bg-warn-weak text-warn-ink" : "bg-fill text-ink2")}>
                {c.ini}
              </div>
              <div className="min-w-0 flex-1 text-[13px] font-bold text-ink">
                {c.name}
                <small className="block text-[11.5px] font-medium text-ink3">{c.sub}</small>
              </div>
              {c.swap ? (
                <button
                  onClick={() => router.push("/owner/academy/swap")}
                  className="shrink-0 rounded-[10px] bg-accent-strong px-3.5 py-2.5 text-[12px] font-bold text-white"
                >
                  교체
                </button>
              ) : (
                <Tag tone="accent">{c.state}</Tag>
              )}
            </div>
          ))}
        </Card>

        <CompetitionCard confirm={confirm} toast={toast} router={router} />

        {/* 설정 */}
        <Card>
          <CardH4>설정 ⚙️</CardH4>
          {SETTINGS_ROWS.map((r) => (
            <RLRow
              key={r.label}
              label={r.label}
              small={r.sub}
              amount={<IconChevron size={16} className="text-ink3" />}
            />
          ))}
          <div className="mt-2 text-[11.5px] font-medium leading-normal text-ink3">
            원장: 전체 접근·수납·환불·권한 승인 / 데스크: 원생·출결 운영, 제한된 수납 / 코치: 담당 반 원생과 안전 정보만 / 차량 담당: 해당 운행 탑승 정보만. 강사 교체의 <b className="font-bold text-ink">권한 회수</b>도 이 권한 시스템과 연결돼요.
          </div>
        </Card>
        <div className="h-2" />
      </AppScroll>
      {toastNode}
      {confirmNode}
    </>
  );
}

/* ───── 공지 작성 ───── */
function NoticeComposer({
  confirm,
  toast,
}: {
  confirm: (o: import("../_kit").ConfirmOpts) => void;
  toast: (m: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState(
    "11월 첫째 주 화요일은 시설 점검으로 휴무예요. 해당 회차는 분기 회차에서 자동 차감됩니다.",
  );
  const [target, setTarget] = useState(0);
  const [sent, setSent] = useState(false);
  const [read, setRead] = useState(0);
  const t = NOTICE_TARGETS[target];

  function send() {
    if (sent) return;
    if (!title.trim()) {
      toast("공지 제목을 입력해 주세요");
      return;
    }
    if (!body.trim()) {
      toast("공지 내용을 입력해 주세요");
      return;
    }
    confirm({
      title: "공지를 발송할까요?",
      rows: [
        ["제목", title.trim()],
        ["대상 원생", `${t.n}명`],
        ["알림 수신 보호자", `${t.p}명`],
        ["채널", "알림톡 + 앱 푸시"],
      ],
      label: "발송",
      onConfirm: () => {
        setSent(true);
        toast(`원생 ${t.n}명의 보호자 ${t.p}명에게 발송`);
        const cap = Math.round(t.p * 0.4);
        const tick = setInterval(() => {
          setRead((prev) => {
            const next = Math.min(cap, prev + 3);
            if (next >= cap) clearInterval(tick);
            return next;
          });
        }, 800);
      },
    });
  }

  return (
    <Card>
      <CardH4 note="알림톡 + 앱 푸시 동시">공지 보내기 📣</CardH4>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        aria-label="공지 제목"
        placeholder="제목 — 예: 11월 휴무 안내"
        disabled={sent}
        className="mb-2 w-full rounded-xl border border-line bg-fill px-3 py-3 text-[13.5px] font-medium text-ink outline-none focus:border-accent focus:bg-surface disabled:opacity-70"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        aria-label="공지 내용"
        placeholder="내용을 적어주세요"
        disabled={sent}
        className="h-[76px] w-full resize-none rounded-xl border border-line bg-fill p-3 text-[13.5px] font-medium leading-normal text-ink outline-none focus:border-accent focus:bg-surface disabled:opacity-70"
      />
      <div className="mt-2.5 flex flex-wrap gap-2" role="group" aria-label="공지 대상 선택">
        {NOTICE_TARGETS.map((nt, i) => (
          <button
            key={nt.label}
            aria-pressed={target === i}
            disabled={sent}
            onClick={() => setTarget(i)}
            className={cn(
              "rounded-full border-[1.5px] px-3.5 py-2 text-[12.5px] font-semibold transition disabled:opacity-60",
              target === i ? "border-accent-strong bg-accent-strong text-white" : "border-line bg-surface text-ink2",
            )}
          >
            {nt.label}
          </button>
        ))}
      </div>
      <div className="mt-2 text-[11.5px] font-medium text-ink3">
        대상 원생 {t.n}명 · 알림 수신 보호자 {t.p}명
      </div>
      <button
        onClick={send}
        disabled={sent}
        className={cn("mt-3 h-12 w-full rounded-2xl text-[14px] font-bold text-white", sent ? "bg-accent-ink" : "bg-accent-strong")}
      >
        {sent ? "발송 완료 ✓ · 도달 추적 중" : `원생 ${t.n}명의 보호자에게 보내기`}
      </button>
      {sent && (
        <SentNote>
          ✓ 발송 완료 · 도달 {t.p}/{t.p} · 읽음 {read}/{t.p}
        </SentNote>
      )}
    </Card>
  );
}

/* ───── 최근 공지 · 읽음 추적 ───── */
function RecentNotices() {
  return (
    <Card>
      <CardH4 note="안 읽은 사람에게만 재발송" noteAc>
        최근 공지 · 읽음 추적
      </CardH4>
      {[
        { t: "가을 대회 참가 안내", s: "어제 · 읽음 81/87 보호자 · 관련 원생 7명", action: "안 읽은 보호자 6명" },
        { t: "10월 휴무일 안내", s: "지난주 · 읽음 85/87 보호자", action: "보기" },
      ].map((n) => (
        <div key={n.t} className="flex items-center gap-2.5 border-b border-line2 py-3 last:border-b-0">
          <div className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-xl bg-fill text-ink2">
            <Mega />
          </div>
          <div className="min-w-0 flex-1 text-[13.5px] font-semibold text-ink">
            {n.t}
            <small className="block text-[12px] font-medium text-ink3">{n.s}</small>
          </div>
          <button className="shrink-0 rounded-[10px] border-[1.5px] border-line bg-surface px-3 py-2.5 text-[12px] font-bold text-accent-ink">
            {n.action}
          </button>
        </div>
      ))}
    </Card>
  );
}

/* ───── 대회 ───── */
function CompetitionCard({
  confirm,
  toast,
  router,
}: {
  confirm: (o: import("../_kit").ConfirmOpts) => void;
  toast: (m: string) => void;
  router: ReturnType<typeof useRouter>;
}) {
  const [teams, setTeams] = useState(4);
  const [busy, setBusy] = useState(false);

  function invite() {
    if (busy || teams >= 6) return;
    const team = CMP_INVITES[Math.min(teams - 4, CMP_INVITES.length - 1)];
    confirm({
      title: "팀 초대를 보낼까요?",
      rows: [
        ["대회", "강동 유소년 챔피언십"],
        ["초대 팀", team],
        ["참가비", "팀당 120,000원"],
        ["참가 관리", "원생 기준 · 보호자에게 동의 알림"],
      ],
      label: "초대 발송",
      onConfirm: () => {
        setBusy(true);
        toast("초대 발송 완료 · 응답 대기");
        setTimeout(() => {
          setTeams((prev) => {
            const next = prev + 1;
            toast(`${team} 참가 수락 — 팀 ${next}/6 확정`);
            return next;
          });
          setBusy(false);
        }, 1600);
      },
    });
  }

  return (
    <Card>
      <CardH4 note="개최 중">대회 🏆</CardH4>
      <div className="mt-0.5 text-[16.5px] font-extrabold tracking-tight">
        강동 유소년 챔피언십
        <small className="mt-0.5 block text-[12px] font-medium text-ink3">11/22 (토) · 축구 · 참가비 팀당 120,000원</small>
      </div>
      <div className="mt-2.5 flex items-center gap-2.5 text-[12px] font-semibold text-ink3">
        <div className="flex-1">
          <Meter pct={Math.round((teams / 6) * 100)} />
        </div>
        <span>팀 {teams}/6 확정</span>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          onClick={invite}
          disabled={busy || teams >= 6}
          className="flex-1 rounded-[10px] bg-accent-strong px-2 py-2.5 text-[12px] font-bold text-white disabled:opacity-65"
        >
          {teams >= 6 ? "팀 확정 완료" : busy ? <><Spinner />응답 대기 중...</> : "팀 초대"}
        </button>
        <button
          onClick={() => router.push("/owner/academy/bracket")}
          className="flex-1 rounded-[10px] border-[1.5px] border-line bg-surface px-2 py-2.5 text-[12px] font-bold text-accent-ink"
        >
          대진표 보기
        </button>
      </div>
    </Card>
  );
}
