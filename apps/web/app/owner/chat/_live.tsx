"use client";

/* 원장 채팅 실 API 연결(#39-②, R8 잔여) — 4상태 패턴.
   READY: 김도윤(OWNER) 세션 → chat 방 목록·메시지·전송(Batch 14 서버 정본).
   서버 방(cr_*)만 실 데이터 — fixture 방(코치 열람방 데모 등)은 데모 유지. */
import {
  createContext, useCallback, useContext, useEffect, useState, type ReactNode,
} from "react";
import { createApiClient, ApiError } from "@pacefolio/api-client";
import { DemoBadge } from "@/components/ui/DemoBadge";

const api = createApiClient({ baseUrl: "/api" });

export type OwnerChatLiveState = "FIXTURE" | "LOADING" | "READY" | "ERROR";
export type LiveChatRoom = Awaited<ReturnType<typeof api.listChatRooms>>["rooms"][number];
export type LiveChatMessage = Awaited<ReturnType<typeof api.listChatMessages>>["messages"][number];

interface OwnerChatLiveCtx {
  state: OwnerChatLiveState;
  errorMsg?: string;
  academyId?: string;
  myUserId?: string;
  rooms: LiveChatRoom[];
  refreshRooms: () => Promise<void>;
  loadMessages: (roomId: string) => Promise<LiveChatMessage[]>;
  send: (roomId: string, body: string) => Promise<{ ok: boolean; message: string }>;
}

const Ctx = createContext<OwnerChatLiveCtx | null>(null);
export const useOwnerChatLive = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useOwnerChatLive must be used within OwnerChatLiveProvider");
  return c;
};

export function OwnerChatLiveProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<OwnerChatLiveState>("LOADING");
  const [errorMsg, setErrorMsg] = useState<string>();
  const [academyId, setAcademyId] = useState<string>();
  const [myUserId, setMyUserId] = useState<string>();
  const [rooms, setRooms] = useState<LiveChatRoom[]>([]);

  useEffect(() => {
    (async () => {
      if (process.env.NEXT_PUBLIC_PACEFOLIO_DEMO_FIXTURE === "1") {
        setState("FIXTURE"); return;
      }
      let reachable = false;
      try {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 1500);
        const probe = await fetch("/api/sessions/me", { signal: ctl.signal, credentials: "include" });
        clearTimeout(t);
        if (!probe.ok && probe.status !== 401) {
          reachable = true;
          throw new ApiError(probe.status, "PROBE_FAILED");
        }
        reachable = true;
        if (probe.status === 401) await api.devLogin("김도윤");
        const isOwner = (m: { roles: string[]; status: string }) =>
          m.roles.includes("OWNER") && m.status === "ACTIVE";
        let me = await api.me();
        if (!me.memberships.some(isOwner)) {
          await api.logout().catch(() => undefined);
          await api.devLogin("김도윤");
          me = await api.me();
        }
        const ms = me.memberships.find(isOwner);
        if (!ms) { setState("FIXTURE"); return; }
        setAcademyId(ms.academyId);
        setMyUserId(me.user.id);
        const r = await api.listChatRooms(ms.academyId);
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

  const loadMessages = useCallback(async (roomId: string) => {
    if (!academyId) return [];
    const r = await api.listChatMessages(academyId, roomId);
    return r.messages;
  }, [academyId]);

  const send = useCallback(async (roomId: string, body: string) => {
    if (!academyId) return { ok: false, message: "학원 컨텍스트 없음" };
    try {
      await api.sendChatMessage(academyId, roomId, {
        kind: "NORMAL_CHAT", body, clientMessageId: crypto.randomUUID(),
      });
      return { ok: true, message: "전송됨" };
    } catch (e) {
      return { ok: false, message: e instanceof ApiError ? `전송 실패(${e.status}: ${e.code})` : "전송 실패 — 네트워크 확인" };
    }
  }, [academyId]);

  return (
    <Ctx.Provider value={{ state, errorMsg, academyId, myUserId, rooms, refreshRooms, loadMessages, send }}>
      {children}
      <DemoBadge show={state === "FIXTURE"} />
    </Ctx.Provider>
  );
}
