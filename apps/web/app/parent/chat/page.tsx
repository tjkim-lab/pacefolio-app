"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader, AppScroll } from "@/components/mobile/MobileShell";
import { Ic } from "../_icons";
import { useParent } from "../_state";
import { Bell, CtxBar, NoteRow } from "../_components";
import { ParentChatLiveProvider, useParentChatLive } from "./_live";

export default function ParentChat() {
  return (
    <ParentChatLiveProvider>
      <ParentChatBody />
    </ParentChatLiveProvider>
  );
}

function ParentChatBody() {
  const { content, cur } = useParent();
  const router = useRouter();
  const live = useParentChatLive();
  return (
    <>
      <AppHeader title={<span className="text-[17px] font-extrabold text-ink">채팅</span>} right={<Bell />} />
      <AppScroll>
        <div className="text-[13px] text-ink3 -mt-1">{content.chat.sub} · 자동 개설 채널</div>
        <CtxBar />

        {/* #46 양방향: READY = 학원 1:1(GUARDIAN_DM) 실 대화 — 자녀 컨텍스트로 열려요 */}
        {live.state === "READY" && <LiveDmSection />}

        <button onClick={() => router.push("/parent/chat/room")}
          className="flex w-full items-center gap-3 rounded-2xl bg-surface border border-line p-3.5 text-left">
          <span className="grid place-items-center w-11 h-11 rounded-2xl bg-fill text-ink2 shrink-0"><Ic name="mega" size={20} /></span>
          <span className="flex-1 min-w-0">
            <span className="block text-[14.5px] font-bold text-ink">{content.chat.room}</span>
            <span className="block text-[13px] text-ink3 font-medium mt-0.5 truncate">{content.chat.preview}</span>
          </span>
          <span className="text-right shrink-0">
            <span className="block text-[11.5px] text-ink3 font-medium">10/20(월)</span>
            {cur.chatUnread > 0 && <span className="inline-grid place-items-center min-w-5 h-5 px-1.5 mt-1.5 rounded-full bg-danger text-white text-[11px] font-bold">{cur.chatUnread}</span>}
          </span>
        </button>

        <button onClick={() => router.push("/parent/chat/coach")}
          className="flex w-full items-center gap-3 rounded-2xl bg-surface border border-line p-3.5 text-left">
          <span className="grid place-items-center w-11 h-11 rounded-2xl bg-fill text-ink2 shrink-0"><Ic name="user" size={20} /></span>
          <span className="flex-1 min-w-0">
            <span className="block text-[14.5px] font-bold text-ink">{content.chat.coach}</span>
            <span className="block text-[13px] text-ink3 font-medium mt-0.5 truncate">{content.chat.coachPrev}</span>
          </span>
          <span className="text-[11.5px] text-ink3 font-medium shrink-0">어제</span>
        </button>

        <NoteRow icon="chat">채널은 반 개설 시 <b className="text-ink">자동으로</b> 만들어져요. 금액·개별 원생 기록 같은 개인정보는 전체방에 표시되지 않아요.</NoteRow>
        <NoteRow icon="bell"><b className="text-ink">긴급한 안전·차량 변경</b>은 채팅이 아니라 학원 대표번호로 연락해 주세요.</NoteRow>
      </AppScroll>
    </>
  );
}

/* 서버 정본 섹션 — 자녀별 학원 1:1 진입(find-or-create) + 열린 방 목록(미확인 배지) */
function LiveDmSection() {
  const live = useParentChatLive();
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [note, setNote] = useState<string>();

  const open = (participantId: string) => {
    if (busyId) return;
    setBusyId(participantId);
    void live.openChildDm(participantId).then((r) => {
      setBusyId(null);
      if (r.ok && r.roomId) router.push(`/parent/chat/live/${r.roomId}`);
      else setNote(r.message);
    });
  };

  return (
    <div className="rounded-2xl border border-accent bg-surface p-3.5">
      <div className="flex items-center gap-1.5 text-[11px] font-extrabold text-brand">
        <span className="w-[7px] h-[7px] rounded-full bg-accent" />학원 1:1 문의 · 실 대화
      </div>
      <div className="mt-0.5 text-[12px] font-medium text-ink3">
        자녀 기준으로 열려요 — 원장님이 답하고, 읽음·확인이 서버에 남아요
      </div>
      <div className="mt-2.5 space-y-2">
        {live.rooms.filter((r) => r.type === "GUARDIAN_DM").map((r) => (
          <button key={r.roomId} onClick={() => router.push(`/parent/chat/live/${r.roomId}`)}
            className="flex w-full items-center gap-2.5 rounded-xl bg-fill px-3 py-2.5 text-left">
            <span className="flex-1 min-w-0 text-[13.5px] font-bold text-ink truncate">{r.title}</span>
            {r.unacked > 0 && (
              <span className="inline-grid place-items-center min-w-5 h-5 px-1.5 rounded-full bg-danger text-white text-[11px] font-bold">{r.unacked}</span>
            )}
            <span className="text-[11.5px] font-semibold text-ink3 shrink-0">열기</span>
          </button>
        ))}
        {live.kids
          .filter((k) => !live.rooms.some((r) => r.type === "GUARDIAN_DM" && r.title.startsWith(k.name)))
          .map((k) => (
            <button key={k.participantId} onClick={() => open(k.participantId)} disabled={busyId !== null}
              className="flex w-full items-center gap-2.5 rounded-xl border border-line px-3 py-2.5 text-left disabled:opacity-50">
              <span className="flex-1 text-[13.5px] font-bold text-ink">{k.name} <small className="text-ink3 font-medium">({k.ageLabel})</small></span>
              <span className="text-[11.5px] font-bold text-brand shrink-0">
                {busyId === k.participantId ? "여는 중..." : "1:1 열기"}
              </span>
            </button>
          ))}
        {live.kids.length === 0 && (
          <p className="text-[12px] font-medium text-ink3">연결된 자녀가 없어요 — 자녀 연결 후 이용할 수 있어요.</p>
        )}
      </div>
      {note && <p className="mt-2 text-[12px] font-semibold text-danger-ink">{note}</p>}
    </div>
  );
}
