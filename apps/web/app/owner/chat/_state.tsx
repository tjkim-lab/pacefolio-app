"use client";

/* 원장 앱 소통 상태 — 목업 in-memory (코치 앱 _state 채팅부와 같은 패턴).
   owner/layout 에서 OwnerChatProvider 로 감싸 탭 이동 간 상태 유지 +
   하단탭 안읽음 뱃지 공유.
   계약(docs/12-communication.md) 반영:
   - watch방(코치↔학부모)은 열람 모드로 열리고, 열람·참여가 기록으로 남는다
   - 참여 / 이관(원장이 이어받기) 두 진입
   - docs/12 개정(12차): 금액 = 자유 텍스트 금지·서버 청구서 카드로만(조건부 허용) —
     자유 텍스트 차단은 유지, 카드 전송은 실 API(BILLING+invoiceId) 연결 시 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { OWNER_ROOMS, type OMsg } from "./_data";

/* 금액 패턴 — 서버 발송 단계 제외 규칙의 목업 재현 (₩ · 1,000원 · 3만원) */
const MONEY_RE = /(₩|[0-9][\d,.]*\s*원|[0-9]+\s*만\s*원)/;

export type WatchMode = "observe" | "joined" | "taken";

interface OwnerChatCtx {
  toast: string | null;
  showToast: (m: string) => void;

  messages: Record<string, OMsg[]>;
  unread: Record<string, number>;
  preview: Record<string, { text: string; time: string }>;
  totalUnread: number;

  /* watch방 상태: 열람 → 참여/이관 */
  watchMode: Record<string, WatchMode>;
  joinRoom: (room: string, mode: "joined" | "taken") => void;

  enterRoom: (room: string) => void;
  sendMessage: (room: string, text: string) => "ok" | "blocked" | "empty";
  completeTask: (room: string, msgIndex: number) => void;
}

const Ctx = createContext<OwnerChatCtx | null>(null);
export const useOwnerChat = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useOwnerChat must be used within OwnerChatProvider");
  return c;
};

const seededMessages = () =>
  Object.fromEntries(OWNER_ROOMS.map((r) => [r.id, r.seed.map((m) => ({ ...m, task: m.task && { ...m.task } }))])) as Record<
    string,
    OMsg[]
  >;
const seededUnread = () =>
  Object.fromEntries(OWNER_ROOMS.map((r) => [r.id, r.unread])) as Record<string, number>;
const seededPreview = () =>
  Object.fromEntries(
    OWNER_ROOMS.map((r) => [r.id, { text: r.preview, time: r.previewTime }]),
  ) as Record<string, { text: string; time: string }>;

export function OwnerChatProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((m: string) => {
    setToast(m);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2300);
  }, []);

  const [messages, setMessages] = useState<Record<string, OMsg[]>>(seededMessages);
  const [unread, setUnread] = useState<Record<string, number>>(seededUnread);
  const [preview, setPreview] = useState<Record<string, { text: string; time: string }>>(seededPreview);
  const [watchMode, setWatchMode] = useState<Record<string, WatchMode>>({});
  const viewLogged = useRef<Record<string, boolean>>({});

  const enterRoom = useCallback((room: string) => {
    setUnread((u) => (u[room] ? { ...u, [room]: 0 } : u));
    /* watch방 첫 열람 = chat.owner_viewed 기록 (계약 §권한 정책) */
    const def = OWNER_ROOMS.find((r) => r.id === room);
    if (def?.group === "watch" && !viewLogged.current[room]) {
      viewLogged.current[room] = true;
      setMessages((m) => ({
        ...m,
        [room]: [
          ...m[room],
          { side: "sys", text: "오후 2:05 · 원장님이 대화를 열람했어요 — 열람 기록이 남아요" },
        ],
      }));
    }
  }, []);

  const joinRoom = useCallback(
    (room: string, mode: "joined" | "taken") => {
      setWatchMode((w) => ({ ...w, [room]: mode }));
      setMessages((m) => ({
        ...m,
        [room]: [
          ...m[room],
          mode === "joined"
            ? { side: "sys", text: "오후 2:06 · 원장님이 대화에 참여했어요 — 두 분 모두에게 표시돼요" }
            : { side: "sys", text: "오후 2:06 · 대화가 원장님께 이관됐어요 — 담당 코치는 읽기 전용이 돼요" },
        ],
      }));
      showToast(
        mode === "joined"
          ? "참여 완료 — 참여 이력이 기록에 남아요"
          : "이관 완료 — 이후 답변은 원장님이 이어가요",
      );
    },
    [showToast],
  );

  const sendMessage = useCallback(
    (room: string, text: string): "ok" | "blocked" | "empty" => {
      const t = text.trim();
      if (!t) return "empty";
      if (MONEY_RE.test(t)) {
        showToast("금액은 자유 텍스트로 보낼 수 없어요 — 청구서 카드로 공유돼요(수납 탭)");
        return "blocked";
      }
      setMessages((m) => ({ ...m, [room]: [...m[room], { side: "me", text: t, time: "오후 2:10" }] }));
      setPreview((p) => ({ ...p, [room]: { text: "나: " + t, time: "오후 2:10" } }));
      return "ok";
    },
    [showToast],
  );

  const completeTask = useCallback(
    (room: string, msgIndex: number) => {
      setMessages((m) => {
        const arr = [...m[room]];
        const msg = arr[msgIndex];
        if (!msg?.task || msg.task.done) return m;
        arr[msgIndex] = { ...msg, task: { ...msg.task, done: true } };
        return { ...m, [room]: arr };
      });
      const t = messages[room]?.[msgIndex]?.task;
      if (t && !t.done) showToast(t.doneNote + " — 업무 이력이 남았어요");
    },
    [messages, showToast],
  );

  const totalUnread = useMemo(
    () => Object.values(unread).reduce((s, n) => s + n, 0),
    [unread],
  );

  const value: OwnerChatCtx = {
    toast, showToast,
    messages, unread, preview, totalUnread,
    watchMode, joinRoom,
    enterRoom, sendMessage, completeTask,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
