"use client";

/* 원장 앱 — 소통: 대화방 (docs/12-communication.md)
   - 일반 대화 버블 + "업무 전달 카드"(후속 조치 연결) 구분 표현
   - 코치↔학부모 대화(watch)는 열람 모드 → 참여 / 이관 진입 (이력 기록)
   - 금액 자유 텍스트는 전송 단계 차단 — 서버 청구서 카드로만(docs/12 개정 · _state MONEY_RE) */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AppHeader, AppScroll } from "@/components/mobile/MobileShell";
import { cn } from "@/components/ui";
import { IconCheck } from "@/components/ui/icons";
import { useConfirm } from "../../_kit";
import { useOwnerChat } from "../_state";
import { roomById, type OMsg } from "../_data";
import { useOwnerChatLive, type LiveChatMessage } from "../_live";

export default function OwnerChatRoom() {
  const params = useParams<{ room: string }>();
  const roomId = params.room;
  const live = useOwnerChatLive();
  /* #39-②: 서버 방(cr_*)은 실 데이터 화면으로 — fixture 방은 기존 데모 유지 */
  if (roomId.startsWith("cr_")) {
    return <LiveRoomView roomId={roomId} />;
  }
  return <FixtureRoomView roomId={roomId} liveState={live.state} />;
}

function FixtureRoomView({ roomId }: { roomId: string; liveState: string }) {
  const c = useOwnerChat();
  const room = roomById(roomId);
  const { confirm, confirmNode } = useConfirm();
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const msgs = c.messages[roomId] ?? [];
  const mode = c.watchMode[roomId] ?? "observe";
  const watching = room?.group === "watch" && mode === "observe";

  useEffect(() => {
    c.enterRoom(roomId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [msgs.length]);

  if (!room) {
    return (
      <>
        <AppHeader title="소통" back="/owner/chat" />
        <AppScroll>
          <p className="text-[14px] text-ink3">대화방을 찾을 수 없어요.</p>
        </AppScroll>
      </>
    );
  }

  const send = () => {
    if (c.sendMessage(roomId, draft) === "ok") setDraft("");
  };

  const askJoin = () =>
    confirm({
      title: "이 대화에 참여할까요?",
      sub: "참여하면 코치·보호자 두 분 모두에게 표시되고, 참여 이력이 기록에 남아요.",
      label: "참여하기",
      onConfirm: () => c.joinRoom(roomId, "joined"),
    });
  const askTake = () =>
    confirm({
      title: "대화를 이어받을까요?",
      sub: "수납·환불처럼 원장님 답변이 필요한 문의를 이관받아요. 담당 코치는 읽기 전용이 되고, 이관 이력이 남아요.",
      label: "나에게 이관",
      onConfirm: () => c.joinRoom(roomId, "taken"),
    });

  return (
    <>
      <AppHeader title={room.name} back="/owner/chat" />
      <AppScroll>
        <div className="-mt-1 mb-2 flex items-center gap-1.5 text-[11.5px] font-medium text-ink3">
          <span>{room.sub}</span>
          {room.context && (
            <span className="rounded-full bg-accent-weak px-2 py-0.5 text-[11px] font-bold text-accent-ink">
              {room.context}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-2.5 pb-2">
          {msgs.map((m, i) =>
            m.side === "task" && m.task ? (
              <TaskCardView key={i} m={m} onDone={() => c.completeTask(roomId, i)} />
            ) : (
              <Bubble key={i} m={m} />
            ),
          )}
          <div ref={endRef} />
        </div>

        {/* watch방 — 열람 모드 배너: 참여 / 이관 (계약 §권한 정책) */}
        {watching ? (
          <div className="sticky bottom-0 rounded-2xl border border-line bg-surface p-3.5 shadow-[0_4px_16px_rgba(25,31,40,0.1)]">
            <div className="text-[12.5px] font-bold text-ink">
              열람 중이에요 — 코치와 보호자의 대화예요
            </div>
            <div className="mt-0.5 text-[11.5px] font-medium leading-relaxed text-ink3">
              열람·참여·이관은 모두 기록에 남아요. 메시지를 보내려면 먼저 참여해주세요.
            </div>
            <div className="mt-2.5 flex gap-2">
              <button
                type="button"
                onClick={askTake}
                className="h-11 flex-1 rounded-xl bg-fill text-[13.5px] font-bold text-ink2"
              >
                나에게 이관
              </button>
              <button
                type="button"
                onClick={askJoin}
                className="h-11 flex-1 rounded-xl bg-accent-strong text-[13.5px] font-bold text-white"
              >
                대화 참여하기
              </button>
            </div>
          </div>
        ) : (
          <div className="sticky bottom-0 bg-fill pb-1 pt-2">
            <div className="flex gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                aria-label="메시지 입력"
                placeholder="메시지 입력…"
                className="flex-1 rounded-full border border-line bg-surface px-4 py-2.5 text-[13.5px] text-ink focus:outline-none focus:border-accent"
              />
              <button
                onClick={send}
                aria-label="전송"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent-strong text-[15px] text-white"
              >
                ➤
              </button>
            </div>
            <div className="mt-1.5 px-1 text-[11px] font-medium text-ink3">
              금액·건강정보는 채팅에 담을 수 없어요 — 수납은 청구서, 건강 메모는 원생 카드로
            </div>
          </div>
        )}
      </AppScroll>
      {confirmNode}
    </>
  );
}

/* ---------- 업무 전달 카드 — 일반 대화와 구분 (후속 조치 연결) ---------- */
function TaskCardView({ m, onDone }: { m: OMsg; onDone: () => void }) {
  const t = m.task!;
  return (
    <div
      className={cn(
        "w-full rounded-2xl border-[1.5px] p-3.5",
        t.done ? "border-line bg-surface" : "border-accent bg-accent-weak/60",
      )}
    >
      <div className="flex items-center gap-1.5 text-[11px] font-extrabold tracking-wide text-accent-ink">
        업무 전달
        {m.time && <span className="font-medium text-ink3">· {m.time}</span>}
      </div>
      <div className="mt-1 flex items-start gap-2.5">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface text-[16px]">
          {t.icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-extrabold text-ink">{t.title}</div>
          <div className="mt-0.5 text-[12px] font-medium leading-relaxed text-ink2">{t.sub}</div>
        </div>
      </div>
      {t.done ? (
        <div className="mt-2.5 flex items-center gap-1.5 rounded-xl bg-fill px-3 py-2.5 text-[12.5px] font-bold text-accent-ink">
          <IconCheck size={15} className="shrink-0" />
          {t.doneNote}
        </div>
      ) : (
        <div className="mt-2.5 flex gap-2">
          {t.href && (
            <Link
              href={t.href}
              className="grid h-11 flex-1 place-items-center rounded-xl bg-surface text-[13px] font-bold text-ink2"
            >
              {t.hrefLabel ?? "관련 화면"}
            </Link>
          )}
          <button
            type="button"
            onClick={onDone}
            className="h-11 flex-1 rounded-xl bg-accent-strong text-[13px] font-bold text-white"
          >
            {t.action}
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------- 대화 버블 (코치 앱과 동일 문법) ---------- */
function Bubble({ m }: { m: OMsg }) {
  if (m.side === "sys") {
    return (
      <span className="mx-auto rounded-full bg-fill px-3 py-1 text-center text-[11px] font-semibold leading-relaxed text-ink3">
        {m.text}
      </span>
    );
  }
  const me = m.side === "me";
  return (
    <div
      className={cn(
        "max-w-[80%] rounded-2xl px-3 py-2.5 text-[13.5px] font-medium leading-snug",
        me
          ? "self-end rounded-br-sm bg-accent-strong text-white"
          : "self-start rounded-bl-sm border border-line bg-surface text-ink",
      )}
    >
      {!me && m.who && (
        <span className="mb-0.5 block text-[11px] font-extrabold text-accent-ink">{m.who}</span>
      )}
      {m.text}
      {m.time && (
        <span className={cn("mt-1 block text-right text-[11px] font-medium", me ? "text-white/60" : "text-ink3")}>
          {m.time}
        </span>
      )}
    </div>
  );
}

/* #39-②: 서버 방 화면 — 메시지·전송이 chat 서버 정본. 금액 자유텍스트는 서버가 차단 대상
   아님(BILLING 카드 정책은 postMessage 검증) — 여기선 NORMAL_CHAT 만 전송. */
function LiveRoomView({ roomId }: { roomId: string }) {
  const live = useOwnerChatLive();
  const [msgs, setMsgs] = useState<LiveChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState<string>();
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const readSent = useRef(new Set<string>()); // #46: 이번 열람에서 read 보낸 메시지

  useEffect(() => {
    if (live.state !== "READY") return;
    (async () => {
      try {
        const list = await live.loadMessages(roomId);
        setMsgs(list);
        /* #46 양방향: 수신 메시지 열람 = read 기록 — 상대(보호자·코치)의 "읽음" 표시 정본 */
        for (const m of list) {
          if (m.senderUserId !== live.myUserId && !readSent.current.has(m.messageId)) {
            readSent.current.add(m.messageId);
            void live.markRead(m.messageId);
          }
        }
      }
      catch { setNote("메시지를 불러오지 못했어요"); }
    })();
  }, [live.state, roomId, live]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [msgs.length]);

  const title = live.rooms.find((r) => r.roomId === roomId)?.title ?? "대화";
  const send = () => {
    const body = draft.trim();
    if (!body || busy || live.state !== "READY") return;
    setBusy(true);
    void (async () => {
      const r = await live.send(roomId, body);
      setBusy(false);
      if (!r.ok) { setNote(r.message); return; }
      setDraft(""); setNote(undefined);
      setMsgs(await live.loadMessages(roomId).catch(() => msgs));
    })();
  };

  return (
    <>
      <AppHeader title={`${title} (실 데이터)`} back="/owner/chat" />
      <AppScroll>
        {live.state !== "READY" && (
          <p className="text-[13px] font-medium text-ink3 px-1">
            {live.state === "ERROR" ? `서버 오류(${live.errorMsg})` : "연결 확인 중..."}
          </p>
        )}
        <div className="space-y-2">
          {msgs.map((m) => {
            const mine = m.senderUserId === live.myUserId;
            return (
              <div key={m.messageId} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                <div className={cn(
                  "max-w-[78%] rounded-2xl px-3.5 py-2.5 text-[13.5px] font-medium leading-relaxed",
                  mine ? "bg-accent-strong text-white" : "bg-fill text-ink",
                )}>
                  {m.kind !== "NORMAL_CHAT" && (
                    <div className={cn("text-[10.5px] font-bold mb-0.5", mine ? "text-white/80" : "text-warn-ink")}>
                      {m.kind === "ACK_REQUIRED" || m.kind === "URGENT_ACK_REQUIRED" ? `확인 필수 · ${m.status}` : m.kind}
                    </div>
                  )}
                  {m.body}
                </div>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>
        {note && <p className="text-[12px] font-semibold text-danger-ink px-1 mt-2">{note}</p>}
        <div className="sticky bottom-0 mt-3 flex gap-2 bg-surface pt-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="메시지 입력 — 서버에 저장돼요"
            className="h-11 flex-1 rounded-xl border border-line bg-fill px-3.5 text-[13.5px] font-medium text-ink focus:outline-none focus:border-accent"
          />
          <button
            onClick={send}
            disabled={busy}
            className="h-11 rounded-xl bg-accent-strong px-4 text-[13.5px] font-bold text-white disabled:opacity-50"
          >
            {busy ? "..." : "전송"}
          </button>
        </div>
      </AppScroll>
    </>
  );
}
