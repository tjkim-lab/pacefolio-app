"use client";

/* 코치 앱 전역 상태 — 목업의 in-memory `S` + 모든 액션을 Context로.
   layout 에서 CoachProvider 로 감싸 라우트 간(오늘·수업·채팅) 상태 공유.
   (Next 레이아웃은 네비게이션 시 재마운트되지 않으므로 상태가 유지됨) */

import {
  createContext,
  useContext,
  useState,
  useRef,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import {
  KIDS,
  ATT_CYCLE,
  ATT_TXT,
  GUARDIAN_GID,
  DEFAULT_TOMORROW,
  POLICIES,
  ROOMS,
  BYE_KIDS,
  type AttStatus,
  type PolicyKey,
  type Msg,
  type ByeKid,
} from "./_data";

/* ---------------- helpers ---------------- */
export function attCounts(att: Record<string, AttStatus>) {
  const c = { p: 0, l: 0, a: 0, none: 0 };
  KIDS.forEach((k) => {
    if (k.paused) return;
    const s = att[k.n] || "";
    if (s) c[s]++;
    else c.none++;
  });
  return c;
}
export function uniqGuardians() {
  const s = new Set<string>();
  KIDS.forEach((k) => {
    if (k.paused) return;
    const g = GUARDIAN_GID[k.n];
    if (g) s.add(g);
  });
  return s.size;
}

/* ---------------- context type ---------------- */
interface CoachCtx {
  toast: string | null;
  showToast: (m: string) => void;

  briefAcked: boolean;
  ackBrief: () => void;

  policy: PolicyKey;
  setPolicy: (p: PolicyKey) => void;
  tomorrow: number[];
  tomorrowConfirmed: boolean;
  confirmTomorrow: () => void;
  toggleTomorrow: (id: number) => void;
  proposeTag: boolean;
  setProposeTag: (v: boolean) => void;

  libOpen: boolean;
  openLib: () => void;
  closeLib: () => void;

  /* 수업 모드 */
  classOpen: boolean;
  openClass: () => void;
  closeClass: () => void;
  classStep: number;
  goStep: (n: number) => void;

  att: Record<string, AttStatus>;
  overridden: Record<string, boolean>;
  attSaved: boolean;
  attLog: string[];
  cycleAtt: (name: string) => void;
  allPresent: () => void;
  saveAtt: () => void;

  absKid: string | null;
  openAbs: (name: string) => void;
  closeAbs: () => void;
  resolveAbs: (st: AttStatus, label: string, why: string) => void;

  actsDone: boolean[];
  actWhy: (string | undefined)[];
  toggleAct: (i: number) => void;
  setWhy: (i: number, why: string) => void;
  showWhy: boolean[];
  requestStep3: () => void;

  recordValue: number;
  newRecord: number;
  saveRecord: (v: number) => "record" | "coach" | "err";

  coachSay: string;
  setCoachSay: (v: string) => void;
  photoChecked: boolean;
  photoScope: string;
  checkPhoto: () => void;
  setPhotoScope: (s: string) => void;

  incOpen: boolean;
  openInc: () => void;
  closeInc: () => void;
  saveInc: (summary: string, kid: string, sev: string) => void;

  reviewOpen: boolean;
  requestSend: () => void;
  closeReview: () => void;
  confirmSend: () => void;
  reportSent: boolean;
  sending: boolean;
  elapsedText: string;

  /* 채팅 */
  messages: Record<string, Msg[]>;
  unread: Record<string, number>;
  preview: Record<string, { text: string; time: string }>;
  sendMessage: (room: string, text: string) => void;
  enterRoom: (room: string) => void;
  totalChatUnread: number;

  /* 인수인계 */
  byeKids: ByeKid[];
  completeBye: (id: string, msg: string) => "ok" | "empty";
  byeDone: number;
}

const Ctx = createContext<CoachCtx | null>(null);
export const useCoach = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCoach must be used within CoachProvider");
  return c;
};

const seededMessages = () =>
  Object.fromEntries(ROOMS.map((r) => [r.id, [...r.seed]])) as Record<string, Msg[]>;
const seededUnread = () =>
  Object.fromEntries(ROOMS.map((r) => [r.id, r.unread])) as Record<string, number>;
const seededPreview = () =>
  Object.fromEntries(
    ROOMS.map((r) => [r.id, { text: r.preview, time: r.previewTime }]),
  ) as Record<string, { text: string; time: string }>;

export function CoachProvider({ children }: { children: ReactNode }) {
  /* toast */
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((m: string) => {
    setToast(m);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2300);
  }, []);

  /* brief */
  const [briefAcked, setBriefAcked] = useState(false);

  /* 채팅 상태 (brief ack 이 원장방에 기록되므로 먼저 선언) */
  const [messages, setMessages] = useState<Record<string, Msg[]>>(seededMessages);
  const [unread, setUnread] = useState<Record<string, number>>(seededUnread);
  const [preview, setPreview] = useState<Record<string, { text: string; time: string }>>(seededPreview);
  const clapsPlayed = useRef(false);

  const ackBrief = useCallback(() => {
    setBriefAcked((prev) => {
      if (prev) return prev;
      setMessages((m) => ({
        ...m,
        owner: [
          ...m.owner,
          { side: "sys", text: "오후 1:52 · 김선재 코치가 전달사항을 확인했어요 ✓" },
        ],
      }));
      setPreview((p) => ({ ...p, owner: { text: "전달사항 확인함 ✓ (오후 1:52)", time: "오후 1:52" } }));
      setUnread((u) => ({ ...u, owner: 0 }));
      showToast("확인 완료 — 원장님 화면에 확인 시각이 표시돼요");
      return true;
    });
  }, [showToast]);

  /* 다음 수업 확정 + 편집 권한 */
  const [policy, setPolicyState] = useState<PolicyKey>("FLEX");
  const [tomorrow, setTomorrow] = useState<number[]>([...DEFAULT_TOMORROW]);
  const [tomorrowConfirmed, setTomorrowConfirmed] = useState(false);
  const [proposeTag, setProposeTag] = useState(false);

  const setPolicy = useCallback(
    (p: PolicyKey) => {
      setPolicyState(p);
      const pol = POLICIES[p];
      if (!pol.full && pol.pool.length) {
        setTomorrow((t) => {
          const filtered = t.filter((id) => pol.pool.includes(id));
          return filtered.length ? filtered : DEFAULT_TOMORROW.filter((id) => pol.pool.includes(id));
        });
      }
      showToast("편집 권한: " + pol.nm + " — " + pol.d);
    },
    [showToast],
  );
  const confirmTomorrow = useCallback(() => {
    setTomorrowConfirmed((prev) => {
      if (prev) return prev;
      showToast("다음 수업 확정 — 10초 컷 ⚡ 아침 8시에 안내 나가요");
      return true;
    });
  }, [showToast]);
  const toggleTomorrow = useCallback((id: number) => {
    setTomorrowConfirmed(false);
    setTomorrow((t) =>
      t.includes(id) ? t.filter((x) => x !== id) : [...t, id].sort((a, b) => a - b),
    );
  }, []);

  const [libOpen, setLibOpen] = useState(false);
  const openLib = useCallback(() => setLibOpen(true), []);
  const closeLib = useCallback(() => setLibOpen(false), []);

  /* ---------- 수업 모드 ---------- */
  const [classOpen, setClassOpen] = useState(false);
  const [classStep, setClassStep] = useState(1);
  const classStart = useRef(0);
  const [reportSent, setReportSent] = useState(false);

  const openClass = useCallback(() => {
    if (!classStart.current) classStart.current = Date.now();
    setClassOpen(true);
  }, []);
  const closeClass = useCallback(() => setClassOpen(false), []);
  const goStep = useCallback((n: number) => setClassStep(n), []);

  /* 출석 */
  const [att, setAtt] = useState<Record<string, AttStatus>>({});
  const [overridden, setOverridden] = useState<Record<string, boolean>>({});
  const [attSaved, setAttSaved] = useState(false);
  const [attLog, setAttLog] = useState<string[]>([]);
  const wentStep2 = useRef(false);

  const cycleAtt = useCallback(
    (name: string) => {
      if (reportSent) {
        showToast("리포트 발송 후에는 원장 승인으로만 수정할 수 있어요");
        return;
      }
      setAtt((prev) => {
        const cur = prev[name] || "";
        const next = ATT_CYCLE[cur];
        if (attSaved) {
          setAttSaved(false);
          setAttLog((l) => [...l, `${name} · ${ATT_TXT[cur]} → ${ATT_TXT[next]} · 김선재 코치 · 오후 2:42`]);
        }
        return { ...prev, [name]: next };
      });
    },
    [reportSent, attSaved, showToast],
  );
  const allPresent = useCallback(() => {
    if (reportSent) return;
    setAtt((prev) => {
      const next = { ...prev };
      KIDS.forEach((k) => {
        if (k.paused) return;
        if (k.planned && !overridden[k.n]) return;
        if (!next[k.n]) next[k.n] = "p";
      });
      return next;
    });
    showToast("휴원·결석 예정 원생은 제외 — 나머지 출석 대상만 출석 처리됨");
  }, [reportSent, overridden, showToast]);
  const saveAtt = useCallback(() => {
    setAttSaved(true);
    showToast("임시 저장됨 — 최종 확정은 리포트 발송 때 · 결석·지각만 즉시 알림 (학원 설정)");
    if (!wentStep2.current) {
      wentStep2.current = true;
      setTimeout(() => setClassStep(2), 600);
    }
  }, [showToast]);

  /* 결석 예정 → 실제 확정 */
  const [absKid, setAbsKid] = useState<string | null>(null);
  const openAbs = useCallback((name: string) => setAbsKid(name), []);
  const closeAbs = useCallback(() => setAbsKid(null), []);
  const resolveAbs = useCallback(
    (st: AttStatus, label: string, why: string) => {
      if (!absKid) return;
      const name = absKid;
      setOverridden((o) => ({ ...o, [name]: true }));
      setAtt((a) => ({ ...a, [name]: st }));
      setAttSaved(false);
      setAttLog((l) => [
        ...l,
        `${name} · 결석 예정(학부모 접수) → 실제 ${label} · 사유: ${why} · 김선재 코치 · 오후 2:34`,
      ]);
      setAbsKid(null);
      showToast(`실제 ${label}(으)로 확정 — 이력이 남고 학부모·원장 화면에도 반영돼요`);
    },
    [absKid, showToast],
  );

  /* STEP2 활동 */
  const [actsDone, setActsDone] = useState<boolean[]>([false, false, false]);
  const [actWhy, setActWhy] = useState<(string | undefined)[]>([undefined, undefined, undefined]);
  const [showWhy, setShowWhy] = useState<boolean[]>([false, false, false]);
  const [recordValue, setRecordValue] = useState(0);
  const [newRecord, setNewRecord] = useState(0);

  const toggleAct = useCallback((i: number) => {
    setActsDone((d) => {
      const next = [...d];
      next[i] = !next[i];
      return next;
    });
    setActWhy((w) => {
      const next = [...w];
      next[i] = undefined;
      return next;
    });
    setShowWhy((s) => {
      const next = [...s];
      next[i] = false;
      return next;
    });
  }, []);
  const setWhy = useCallback(
    (i: number, why: string) => {
      setActWhy((w) => {
        const next = [...w];
        next[i] = why;
        return next;
      });
      showToast(
        why === "다음 시간에 이어서"
          ? "코치가 선택한 경우에만 다음 차시 계획에 연결돼요"
          : '리포트에 "' + why + '"로 기록돼요',
      );
    },
    [showToast],
  );
  const requestStep3 = useCallback(() => {
    const pending = actsDone.map((d, i) => (!d && !actWhy[i] ? i : -1)).filter((i) => i >= 0);
    if (pending.length) {
      setShowWhy((s) => {
        const next = [...s];
        pending.forEach((i) => (next[i] = true));
        return next;
      });
      showToast("진행 못 한 활동 " + pending.length + "개의 사유를 선택해주세요");
      return;
    }
    setClassStep(3);
  }, [actsDone, actWhy, showToast]);
  const saveRecord = useCallback(
    (v: number): "record" | "coach" | "err" => {
      if (!v || v < 1 || v > 300) {
        showToast("초 단위 숫자를 입력해주세요 (1~300초)");
        return "err";
      }
      setRecordValue(v);
      if (v > 15) {
        setNewRecord(v);
        showToast("신기록으로 저장됐어요 — 도담이의 성장 기록에 자동 반영됩니다 📈");
        return "record";
      }
      setNewRecord(0);
      showToast("코치 기록 저장 — 성장 데이터에 자동 반영돼요");
      return "coach";
    },
    [showToast],
  );

  /* STEP3 */
  const [coachSay, setCoachSay] = useState("");
  const [photoChecked, setPhotoChecked] = useState(false);
  const [photoScope, setPhotoScope] = useState("individual");
  const checkPhoto = useCallback(() => {
    setPhotoChecked(true);
    showToast("사진 확인 완료 — 공개 범위대로만 전달돼요");
  }, [showToast]);

  /* 특이사항·안전사고 */
  const [incOpen, setIncOpen] = useState(false);
  const openInc = useCallback(() => setIncOpen(true), []);
  const closeInc = useCallback(() => setIncOpen(false), []);
  const saveInc = useCallback(
    (summary: string, kid: string, sev: string) => {
      setMessages((m) => ({
        ...m,
        owner: [...m.owner, { side: "me", text: summary, time: "오후 3:05" }],
      }));
      setPreview((p) => ({ ...p, owner: { text: "나: ⚠ 안전기록 [" + sev + "] " + kid, time: "오후 3:05" } }));
      setIncOpen(false);
      showToast(kid + " 안전 기록 저장 — 원장 즉시 공유 · 원생 안전 기록에 남았어요");
    },
    [showToast],
  );

  /* 발송 */
  const [reviewOpen, setReviewOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [elapsedText, setElapsedText] = useState("");
  const requestSend = useCallback(() => {
    if (reportSent) return;
    if (!attSaved) {
      showToast("출석 변경사항이 저장되지 않았어요 — 출석부터 저장해주세요");
      setClassStep(1);
      return;
    }
    if (!photoChecked) {
      showToast("발송 전에 사진 확인이 필요해요 📷");
      return;
    }
    setReviewOpen(true);
  }, [reportSent, attSaved, photoChecked, showToast]);
  const closeReview = useCallback(() => setReviewOpen(false), []);
  const confirmSend = useCallback(() => {
    setReviewOpen(false);
    setSending(true);
    setTimeout(() => {
      setSending(false);
      setReportSent(true);
      const sec = Math.max(1, Math.round((Date.now() - classStart.current) / 1000));
      const txt = (sec >= 60 ? Math.floor(sec / 60) + "분 " : "") + (sec % 60) + "초";
      setElapsedText(txt);
      const nr = newRecord;
      /* 반 채팅방 — 공통 완료 카드만 */
      setMessages((m) => ({
        ...m,
        class: [
          ...m.class,
          { side: "sys", text: "오후 3:32 · 각 보호자 앱으로 원생별 리포트가 발송됐어요" },
          {
            side: "rep",
            claps: 1,
            text:
              "플레이2 · 14회차 · 균형과 리듬 ② — 각 원생의 수업 리포트가 보호자 앱으로 발송됐어요" +
              (nr ? " · 오늘 새로운 성장 기록 1건이 등록됐어요 📈" : ""),
          },
        ],
      }));
      setPreview((p) => ({ ...p, class: { text: "🎉 오늘 수업이 끝났어요 · 공통 완료 카드", time: "오후 3:32" } }));
      setUnread((u) => ({ ...u, class: 1 }));
      setClassStep(4);
    }, 1500);
  }, [newRecord]);

  /* 채팅 */
  const sendMessage = useCallback((room: string, text: string) => {
    const t = text.trim();
    if (!t) return;
    setMessages((m) => ({ ...m, [room]: [...m[room], { side: "me", text: t, time: "오후 3:40" }] }));
    setPreview((p) => ({ ...p, [room]: { text: "나: " + t, time: "오후 3:40" } }));
  }, []);
  const enterRoom = useCallback(
    (room: string) => {
      setUnread((u) => (u[room] ? { ...u, [room]: 0 } : u));
      if (room === "class" && reportSent && !clapsPlayed.current) {
        clapsPlayed.current = true;
        let n = 1;
        const iv = setInterval(() => {
          n++;
          setMessages((m) => {
            const arr = [...m.class];
            for (let i = arr.length - 1; i >= 0; i--) {
              if (arr[i].side === "rep") {
                arr[i] = { ...arr[i], claps: n };
                break;
              }
            }
            return { ...m, class: arr };
          });
          if (n >= 5) clearInterval(iv);
        }, 900);
        setTimeout(() => {
          setMessages((m) => ({
            ...m,
            class: [...m.class, { side: "them", who: "하윤맘", text: "코치님 오늘도 고생하셨어요~ 👏👏", time: "오후 3:35" }],
          }));
        }, 2400);
        setTimeout(() => {
          setMessages((m) => ({
            ...m,
            class: [...m.class, { side: "them", who: "서준맘", text: "사진 너무 잘 나왔어요! 감사합니다 😊", time: "오후 3:36" }],
          }));
        }, 3900);
      }
    },
    [reportSent],
  );
  const totalChatUnread = useMemo(
    () => Object.values(unread).reduce((s, n) => s + n, 0),
    [unread],
  );

  /* 인수인계 */
  const [byeKids, setByeKids] = useState<ByeKid[]>(BYE_KIDS);
  const completeBye = useCallback(
    (id: string, msg: string): "ok" | "empty" => {
      const val = msg.trim();
      if (!val) return "empty";
      setByeKids((ks) => ks.map((k) => (k.id === id ? { ...k, done: true, msg: val } : k)));
      const doneCount = byeKids.filter((k) => k.done).length + 1;
      if (doneCount >= 4) showToast("작별 피드백 4/4 완료 🌱 — 새 코치 브리핑에 담겼어요");
      else showToast("저장됨 — 브리핑에 포함돼요");
      return "ok";
    },
    [byeKids, showToast],
  );
  const byeDone = byeKids.filter((k) => k.done).length;

  const value: CoachCtx = {
    toast, showToast,
    briefAcked, ackBrief,
    policy, setPolicy, tomorrow, tomorrowConfirmed, confirmTomorrow, toggleTomorrow,
    proposeTag, setProposeTag,
    libOpen, openLib, closeLib,
    classOpen, openClass, closeClass, classStep, goStep,
    att, overridden, attSaved, attLog, cycleAtt, allPresent, saveAtt,
    absKid, openAbs, closeAbs, resolveAbs,
    actsDone, actWhy, toggleAct, setWhy, showWhy, requestStep3,
    recordValue, newRecord, saveRecord,
    coachSay, setCoachSay, photoChecked, photoScope, checkPhoto, setPhotoScope,
    incOpen, openInc, closeInc, saveInc,
    reviewOpen, requestSend, closeReview, confirmSend, reportSent, sending, elapsedText,
    messages, unread, preview, sendMessage, enterRoom, totalChatUnread,
    byeKids, completeBye, byeDone,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
