"use client";

/* 학부모 채팅 실 API 연결(#46 양방향) — owner chat _live 와 같은 4상태 패턴.
   READY: 박서연(GUARDIAN) 세션 → 자녀 목록·방 목록·학원 1:1 개설(GUARDIAN_DM,
   원생 컨텍스트)·메시지 송수신·읽음(READ ≠ ACK — 서버 수명주기).
   API 부재 = FIXTURE(데모 유지) · 실연결 후 오류 = ERROR(위장 금지). */
import {
  createContext, useCallback, useContext, useEffect, useState, type ReactNode,
} from "react";
import { createApiClient, ApiError } from "@pacefolio/api-client";
import { DemoBadge } from "@/components/ui/DemoBadge";

const api = createApiClient({ baseUrl: "/api" });

export type ParentChatLiveState = "FIXTURE" | "LOADING" | "READY" | "ERROR";
export type LiveChatRoom = Awaited<ReturnType<typeof api.listChatRooms>>["rooms"][number];
export type LiveChatMessage = Awaited<ReturnType<typeof api.listChatMessages>>["messages"][number];
export type LiveChild = Awaited<ReturnType<typeof api.myChildren>>["children"][number];

interface ParentChatLiveCtx {
  state: ParentChatLiveState;
  errorMsg?: string;
  academyId?: string;
  myUserId?: string;
  kids: LiveChild[];
  rooms: LiveChatRoom[];
  refreshRooms: () => Promise<void>;
  openChildDm: (participantId: string) => Promise<{ ok: boolean; roomId?: string; message: string }>;
  loadMessages: (roomId: string) => Promise<LiveChatMessage[]>;
  send: (roomId: string, body: string) => Promise<{ ok: boolean; message: string }>;
  markRead: (messageId: string) => Promise<void>;
}

const Ctx = createContext<ParentChatLiveCtx | null>(null);
export const useParentChatLive = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useParentChatLive must be used within ParentChatLiveProvider");
  return c;
};

export function ParentChatLiveProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ParentChatLiveState>("LOADING");
  const [errorMsg, setErrorMsg] = useState<string>();
  const [academyId, setAcademyId] = useState<string>();
  const [myUserId, setMyUserId] = useState<string>();
  const [kids, setKids] = useState<LiveChild[]>([]);
  const [rooms, setRooms] = useState<LiveChatRoom[]>([]);

  useEffect(() => {
    (async () => {
      if (process.env.NEXT_PUBLIC_PACEFOLIO_DEMO_FIXTURE === "1") {
        setState("FIXTURE"); return; // 명시적 데모 설정 — 유일한 의도된 fixture 진입로
      }
      let reachable = false;
      try {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 1500);
        const probe = await fetch("/api/sessions/me", { signal: ctl.signal, credentials: "include" });
        clearTimeout(t);
        /* 14차 B P0: 서버가 응답한 비-401 은 전부 장애 = ERROR */
        if (!probe.ok && probe.status !== 401) {
          reachable = true;
          throw new ApiError(probe.status, "PROBE_FAILED");
        }
        reachable = true;
        if (probe.status === 401) await api.devLogin("박서연");
        const isGuardian = (m: { roles: string[]; status: string }) =>
          m.roles.includes("GUARDIAN") && m.status === "ACTIVE";
        let me = await api.me();
        if (!me.memberships.some(isGuardian)) {
          await api.logout().catch(() => undefined);
          await api.devLogin("박서연");
          me = await api.me();
        }
        const ms = me.memberships.find(isGuardian);
        if (!ms) { setState("FIXTURE"); return; } // 보호자 seed 없음 = 데모
        setAcademyId(ms.academyId);
        setMyUserId(me.user.id);
        const [ch, r] = await Promise.all([
          api.myChildren(ms.academyId), api.listChatRooms(ms.academyId),
        ]);
        setKids(ch.children);
        setRooms(r.rooms);
        setState("READY");
      } catch (e) {
        if (!reachable) {
          if (process.env.NODE_ENV !== "production") { setState("FIXTURE"); return; }
          setErrorMsg("API 연결 불가"); setState("ERROR"); return;
        }
        setErrorMsg(e instanceof ApiError ? `서버 오류(${e.status}: ${e.code})` : "채팅을 불러오지 못했어요");
        setState("ERROR");
      }
    })();
  }, []);

  const refreshRooms = useCallback(async () => {
    if (!academyId) return;
    const r = await api.listChatRooms(academyId);
    setRooms(r.rooms);
  }, [academyId]);

  /* 학원 1:1 = GUARDIAN_DM find-or-create — 방 정체성은 (보호자, 원생), 서버 검증
     (VERIFIED 링크 없으면 403). 개설 성공 후 방 목록 갱신 실패는 성공으로 유지. */
  const openChildDm = useCallback(async (participantId: string) => {
    if (!academyId) return { ok: false, message: "학원 컨텍스트 없음" };
    let r;
    try { r = await api.openGuardianDm(academyId, participantId); }
    catch (e) {
      if (e instanceof ApiError && e.status === 403) {
        return { ok: false, message: "검증된 보호자 연결이 없어요 — 자녀 연결부터 확인해주세요" };
      }
      return { ok: false, message: e instanceof ApiError ? `개설 실패(${e.status}: ${e.code})` : "개설 실패 — 네트워크 확인" };
    }
    try { await refreshRooms(); } catch { /* 목록은 새로고침으로 */ }
    return { ok: true, roomId: r.roomId, message: r.created ? "학원 1:1 대화가 열렸어요" : "기존 대화로 이동해요" };
  }, [academyId, refreshRooms]);

  const loadMessages = useCallback(async (roomId: string) => {
    if (!academyId) return [];
    const r = await api.listChatMessages(academyId, roomId);
    return r.messages;
  }, [academyId]);

  const send = useCallback(async (roomId: string, body: string) => {
    if (!academyId) return { ok: false, message: "학원 컨텍스트 없음" };
    try {
      await api.sendChatMessage(academyId, roomId, {
        kind: "NORMAL_CHAT", body, clientMessageId: crypto.randomUUID(), // 전송 멱등
      });
      return { ok: true, message: "전송됨" };
    } catch (e) {
      return { ok: false, message: e instanceof ApiError ? `전송 실패(${e.status}: ${e.code})` : "전송 실패 — 네트워크 확인" };
    }
  }, [academyId]);

  /* 읽음 = READ 까지만(ACK 아님 — docs/12). 실패는 조용히(다음 열람에 재시도) */
  const markRead = useCallback(async (messageId: string) => {
    if (!academyId) return;
    await api.readChatMessage(academyId, messageId).catch(() => undefined);
  }, [academyId]);

  return (
    <Ctx.Provider value={{
      state, errorMsg, academyId, myUserId, kids, rooms,
      refreshRooms, openChildDm, loadMessages, send, markRead,
    }}>
      {children}
      <DemoBadge show={state === "FIXTURE"} />
    </Ctx.Provider>
  );
}
