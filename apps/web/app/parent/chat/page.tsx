"use client";

import { useRouter } from "next/navigation";
import { AppHeader, AppScroll } from "@/components/mobile/MobileShell";
import { Ic } from "../_icons";
import { useParent } from "../_state";
import { Bell, CtxBar, NoteRow } from "../_components";

export default function ParentChat() {
  const { st, content, cur } = useParent();
  const router = useRouter();
  return (
    <>
      <AppHeader title={<span className="text-[17px] font-extrabold text-ink">채팅</span>} right={<Bell />} />
      <AppScroll>
        <div className="text-[13px] text-ink3 -mt-1">{content.chat.sub} · 자동 개설 채널</div>
        <CtxBar />

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
