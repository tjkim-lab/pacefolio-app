"use client";

/* 학부모 학원 1:1 대화방(#46 양방향) — 서버 정본.
   수신 메시지는 열람 시 read(READ ≠ ACK — docs/12 수명주기)로 기록되고,
   내 메시지는 원장이 읽으면 "읽음"으로 바뀐다. 전송은 clientMessageId 멱등. */
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { AppScroll } from "@/components/mobile/MobileShell";
import { cn } from "@/components/ui";
import { Ic } from "../../../_icons";
import { NoteRow, PushHeader } from "../../../_components";
import { ParentChatLiveProvider, useParentChatLive, type LiveChatMessage } from "../../_live";

export default function ParentLiveRoomPage() {
  return (
    <ParentChatLiveProvider>
      <RoomBody />
    </ParentChatLiveProvider>
  );
}

function RoomBody() {
  const params = useParams<{ room: string }>();
  const roomId = params.room;
  const live = useParentChatLive();
  const [msgs, setMsgs] = useState<LiveChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState<string>();
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const readSent = useRef(new Set<string>()); // 이번 열람에서 이미 read 보낸 메시지

  const { state, myUserId, loadMessages, markRead } = live;
  const refresh = useCallback(async () => {
    if (state !== "READY" || !roomId) return;
    try {
      const list = await loadMessages(roomId);
      setMsgs(list);
      /* 수신 메시지 열람 = read 기록(멱등) — 서버가 최초 시각 보존 */
      for (const m of list) {
        if (m.senderUserId !== myUserId && !readSent.current.has(m.messageId)) {
          readSent.current.add(m.messageId);
          void markRead(m.messageId);
        }
      }
    } catch {
      setNote("메시지를 불러오지 못했어요 — 새로고침 해주세요");
    }
  }, [state, roomId, loadMessages, markRead, myUserId]);

  useEffect(() => {
    void (async () => { await refresh(); })();
  }, [refresh]);
  useEffect(() => { bottom.current?.scrollIntoView({ block: "end" }); }, [msgs.length]);

  const title = live.rooms.find((r) => r.roomId === roomId)?.title ?? "학원 1:1";
  const send = () => {
    const body = draft.trim();
    if (!body || busy || live.state !== "READY" || !roomId) return;
    setBusy(true);
    void (async () => {
      const r = await live.send(roomId, body);
      setBusy(false);
      if (!r.ok) { setNote(r.message); return; }
      setDraft(""); setNote(undefined);
      await refresh();
    })();
  };

  return (
    <>
      <PushHeader title={`${title} (실 대화)`} sub="원장님과 1:1 · 읽음이 서버에 남아요" />
      <AppScroll>
        {live.state === "ERROR" && (
          <p className="text-[13px] font-semibold text-danger-ink px-1">서버 오류({live.errorMsg})</p>
        )}
        {live.state === "LOADING" && (
          <p className="text-[13px] font-medium text-ink3 px-1">연결 확인 중...</p>
        )}
        <div className="flex flex-col gap-2.5">
          {msgs.map((m) => {
            const mine = m.senderUserId === live.myUserId;
            return (
              <div key={m.messageId} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                <div className={cn(
                  "max-w-[78%] px-3.5 py-2.5 text-[13.5px] font-medium leading-relaxed",
                  mine
                    ? "bg-accent-strong text-white rounded-[16px_4px_16px_16px]"
                    : "bg-fill text-ink rounded-[4px_16px_16px_16px]",
                )}>
                  {m.body}
                  {mine && (
                    <span className="mt-0.5 block text-right text-[10.5px] font-semibold text-white/70">
                      {m.status === "READ" || m.status === "ACKNOWLEDGED" || m.status === "RESOLVED" ? "읽음" : "보냄"}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          {msgs.length === 0 && live.state === "READY" && (
            <p className="text-center text-[12px] font-medium text-ink3 py-4">
              첫 메시지를 보내보세요 — 원장님께 바로 전달돼요
            </p>
          )}
          <div ref={bottom} />
        </div>
        {note && <p className="text-[12px] font-semibold text-danger-ink px-1">{note}</p>}
        <button onClick={() => void refresh()}
          className="mx-auto rounded-full bg-fill px-3 py-1 text-[11px] font-semibold text-ink3">
          새 답장 확인
        </button>

        <NoteRow icon="lock">금액·건강정보는 자유 텍스트로 담기지 않아요 — 청구는 <b className="text-ink">청구서 카드</b>로만, 민감정보 열람은 서버가 권한을 재확인해요.</NoteRow>

        <div className="sticky bottom-0 flex gap-2 pt-3 pb-1 bg-gradient-to-t from-fill to-transparent">
          <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="학원에 1:1 메시지" aria-label="학원 1:1 메시지 입력"
            className="flex-1 rounded-full border-[1.5px] border-line px-4 py-2.5 text-[13.5px] outline-none bg-surface text-ink focus:border-accent" />
          <button onClick={send} disabled={busy} aria-label="보내기"
            className="grid place-items-center w-11 h-11 rounded-full bg-accent-strong text-white shrink-0 disabled:opacity-50">
            <Ic name="send" size={18} />
          </button>
        </div>
      </AppScroll>
    </>
  );
}
