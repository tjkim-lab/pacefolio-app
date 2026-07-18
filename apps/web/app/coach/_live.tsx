"use client";

/* 코치 출결 실 API 연결(#25) — LiveBillingProvider 패턴 복제.
   API 감지 시: 김선재 코치 세션 → 담당 반 → 오늘 세션 + 서버 명단.
   수업 모드에서 출석 저장 = recordAttendance / 발송 확정 = completeSession.
   API 부재 = fixture 데모 유지(디자인 검수 안전) · 실연결 후 오류 = 오류 표시. */
import {
  createContext, useCallback, useContext, useEffect, useState, type ReactNode,
} from "react";
import { createApiClient, ApiError } from "@pacefolio/api-client";
import type { AttStatus } from "./_data";

const api = createApiClient({ baseUrl: "/api" });

export interface LiveRosterKid {
  participantId: string;
  name: string;       // 정본 전체 이름
  short: string;      // 화면 표시(성 제외)
  ageLabel: string;
}
export type CoachLiveState = "FIXTURE" | "LOADING" | "READY" | "ERROR";

/* 화면 출결 상태 → 서버 enum */
const ATT_TO_SERVER: Record<Exclude<AttStatus, "">, string> = {
  p: "PRESENT", a: "ABSENT", l: "LATE", e: "EARLY_LEAVE",
};

/* #31: 원장 전달사항 — chat 서버 정본(READ ≠ ACKNOWLEDGED 는 코치의 실제 행동으로만) */
export interface LiveBrief {
  messageId: string;
  body: string;
  status: string;   // SENT/DELIVERED/READ → 확인 대기, ACKNOWLEDGED/RESOLVED → 확인됨
  createdAt: string;
  urgent: boolean;
}

interface CoachLiveCtx {
  state: CoachLiveState;
  errorMsg?: string;
  academyId?: string;
  sessionId?: string;
  sessionLabel?: string;
  roster: LiveRosterKid[];
  saveAttendance: (att: Record<string, AttStatus>) => Promise<{ ok: boolean; message: string }>;
  complete: () => Promise<{ ok: boolean; message: string }>;
  brief: LiveBrief | null;
  ackBrief: () => Promise<{ ok: boolean; message: string }>;
  reportIncident: (input: {
    participantId: string; type: string; severity: string; situation: string;
    location?: string; firstAid?: string; classContinued: boolean;
    followUpNeeded: boolean; guardianContact: string;
  }) => Promise<{ ok: boolean; message: string; occurredAt?: string }>;
}

const Ctx = createContext<CoachLiveCtx | null>(null);
export const useCoachLive = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCoachLive must be used within CoachLiveProvider");
  return c;
};

export function CoachLiveProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CoachLiveState>("LOADING");
  const [errorMsg, setErrorMsg] = useState<string>();
  const [academyId, setAcademyId] = useState<string>();
  const [sessionId, setSessionId] = useState<string>();
  const [sessionLabel, setSessionLabel] = useState<string>();
  const [roster, setRoster] = useState<LiveRosterKid[]>([]);
  const [brief, setBrief] = useState<LiveBrief | null>(null);

  /* 원장 DM 에서 최신 확인 필요/확인됨 전달사항을 찾는다 — 서버 상태가 정본 */
  const loadBrief = useCallback(async (aid: string, myUserId: string) => {
    const rooms = await api.listChatRooms(aid);
    const dm = rooms.rooms.find((r) => r.type === "OWNER_COACH_DM");
    if (!dm) { setBrief(null); return; }
    const msgs = await api.listChatMessages(aid, dm.roomId);
    const directives = msgs.messages.filter(
      (m) => (m.kind === "ACK_REQUIRED" || m.kind === "URGENT_ACK_REQUIRED") &&
             m.senderUserId !== myUserId && m.status !== "CANCELLED",
    );
    const last = directives[directives.length - 1];
    setBrief(last ? {
      messageId: last.messageId, body: last.body, status: last.status,
      createdAt: last.createdAt, urgent: last.kind === "URGENT_ACK_REQUIRED",
    } : null);
  }, []);

  useEffect(() => {
    (async () => {
      let reachable = false;
      try {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 1500);
        const probe = await fetch("/api/sessions/me", { signal: ctl.signal, credentials: "include" });
        clearTimeout(t);
        if (probe.status !== 401 && !probe.ok) { setState("FIXTURE"); return; }
        reachable = true;
        if (probe.status === 401) await api.devLogin("김선재");
        let me = await api.me();
        let ms = me.memberships.find((m) => m.roles.includes("COACH") && m.status === "ACTIVE");
        if (!ms) {
          await api.logout().catch(() => undefined);
          await api.devLogin("김선재");
          me = await api.me();
          ms = me.memberships.find((m) => m.roles.includes("COACH") && m.status === "ACTIVE");
        }
        if (!ms) { setState("FIXTURE"); return; } // 코치 seed 없음 = 데모
        const aid = ms.academyId;
        const classes = await api.listClasses(aid);
        const mine = classes.classes.find((c) => c.coachUserIds.includes(me.user.id));
        if (!mine) { setState("FIXTURE"); return; }
        const sessions = await api.listClassSessions(aid, mine.classId);
        const target = sessions.sessions.find((x) => x.status === "SCHEDULED")
          ?? sessions.sessions.find((x) => x.status === "COMPLETED");
        if (!target) { setState("FIXTURE"); return; }
        const rosterRes = await api.listClassRoster(aid, mine.classId);
        setAcademyId(aid);
        setSessionId(target.sessionId);
        setSessionLabel(`${mine.name} · ${target.date} ${target.startTime}`);
        setRoster(rosterRes.roster.map((r) => ({
          participantId: r.participantId, name: r.name,
          short: r.name.length >= 3 ? r.name.slice(1) : r.name,
          ageLabel: r.ageLabel,
        })));
        await loadBrief(aid, me.user.id).catch(() => setBrief(null)); // 전달사항은 보조 — 실패해도 READY
        setState("READY");
      } catch (e) {
        if (!reachable) setState("FIXTURE");
        else {
          setErrorMsg(e instanceof ApiError ? `${e.status} ${e.code}` : String(e));
          setState("ERROR"); // 실연결 후 오류 — fixture 로 위장 금지(13차 B P0-2 원칙)
        }
      }
    })();
  }, []);

  const saveAttendance = useCallback(async (att: Record<string, AttStatus>) => {
    if (state !== "READY" || !academyId || !sessionId) return { ok: false, message: "실연결 아님" };
    const records = roster
      .filter((k) => att[k.short] && att[k.short] !== "")
      .map((k) => ({ participantId: k.participantId, status: ATT_TO_SERVER[att[k.short] as Exclude<AttStatus, "">] }));
    if (records.length === 0) return { ok: false, message: "기록할 출결 없음" };
    try {
      const r = await api.recordAttendance(academyId, sessionId, records);
      return { ok: true, message: `서버 저장 완료 — 신규 ${r.recorded}·수정 ${r.updated} (감사 이력 기록)` };
    } catch (e) {
      return { ok: false, message: e instanceof ApiError ? `${e.status} ${e.code}` : String(e) };
    }
  }, [state, academyId, sessionId, roster]);

  const complete = useCallback(async () => {
    if (state !== "READY" || !academyId || !sessionId) return { ok: false, message: "실연결 아님" };
    try {
      const r = await api.completeSession(academyId, sessionId);
      return { ok: true, message: `수업 완료 확정(${r.status}) — 전원 출결 검증 통과` };
    } catch (e) {
      // 409 = 미체크 원생 존재(서버 검증) — 그대로 안내
      return { ok: false, message: e instanceof ApiError ? `${e.status} ${e.code} — 전원 출결 지정 후 완료해주세요` : String(e) };
    }
  }, [state, academyId, sessionId]);

  const ackBrief = useCallback(async () => {
    if (state !== "READY" || !academyId || !brief) return { ok: false, message: "실연결 아님" };
    try {
      const r = await api.ackChatMessage(academyId, brief.messageId);
      setBrief({ ...brief, status: r.status }); // 서버가 돌려준 상태로만 갱신
      return { ok: true, message: "확인 완료 — 원장님 화면에 서버 확인 시각이 표시돼요" };
    } catch (e) {
      return { ok: false, message: e instanceof ApiError ? `확인 실패(${e.status}: ${e.code})` : "확인 실패 — 네트워크 확인" };
    }
  }, [state, academyId, brief]);

  /* #32: 안전 기록 = 서버 정본 — 발생 시각은 서버가 기록, 감사·원장 알림 Outbox 동반 */
  const reportIncident = useCallback(async (input: {
    participantId: string; type: string; severity: string; situation: string;
    location?: string; firstAid?: string; classContinued: boolean;
    followUpNeeded: boolean; guardianContact: string;
  }) => {
    if (state !== "READY" || !academyId) return { ok: false, message: "실연결 아님" };
    try {
      const r = await api.reportIncident(academyId, { ...input, sessionId });
      const t = new Date(r.occurredAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
      return { ok: true, occurredAt: r.occurredAt, message: `서버 기록 완료(${t}) — 원장 알림 발행·감사 이력 기록` };
    } catch (e) {
      return { ok: false, message: e instanceof ApiError ? `기록 실패(${e.status}: ${e.code})` : "기록 실패 — 네트워크 확인" };
    }
  }, [state, academyId, sessionId]);

  return (
    <Ctx.Provider value={{ state, errorMsg, academyId, sessionId, sessionLabel, roster, saveAttendance, complete, brief, ackBrief, reportIncident }}>
      {children}
    </Ctx.Provider>
  );
}

export function CoachLiveBadge() {
  const { state, sessionLabel, errorMsg } = useCoachLive();
  if (state === "READY") {
    return (
      <div className="mx-4 mt-1 rounded-lg bg-emerald-100 px-3 py-1.5 text-center text-[11px] font-bold text-emerald-800">
        🔌 실연결 — {sessionLabel} · 출석 저장·완료가 실 서버에 기록돼요
      </div>
    );
  }
  if (state === "ERROR") {
    return (
      <div className="mx-4 mt-1 rounded-lg bg-red-100 px-3 py-1.5 text-center text-[11px] font-bold text-red-800">
        ⚠️ 실연결 오류({errorMsg}) — 가짜 데이터로 위장하지 않았어요
      </div>
    );
  }
  return null;
}
