"use client";

/* 학부모 앱 전역 상태 — layout 에 마운트되어 탭·푸시 라우트 이동에도 유지.
   목업의 S / PS / PAY / invStatus / invSel / 컨텍스트 선택을 React 상태로 이식. */

import { createContext, useCallback, useContext, useMemo, useReducer, useRef, useState } from "react";
import {
  CHILDREN, CONTENT, DETAIL, INV_AMT, initialPS, initialPay, pkeyOf,
  type AcademyName, type ChildName, type ChildSeg, type Content, type Detail,
  type PState, type PayState,
} from "./_data";

export type SheetId = "noti" | "abs" | "contest" | "mk" | "auto" | "autoOff" | "child" | "acad" | null;

/* ⚠️ PG 시뮬레이션 (R3 P1-6): UI 성공 ≠ PG CAPTURED.
   paymentSubmitted = 제출(AUTHORIZED, 청구서 미변경) → paymentCaptured = 승인 확정(PAID).
   실서비스: 승인 확정은 webhook/PG 재조회로만 — 이 시뮬레이션은 실결제 전이 근거 아님.
   R4 §15: 프로덕션 빌드에서 강제 false(상수 활성 금지) — dev 이거나
   검토 프리뷰 플래그(빌드 시점 env)일 때만 시뮬레이터 동작. 실결제 화면은
   서버 payment ID polling + webhook 결과만 신뢰하는 경로로 대체 예정. */
export const PG_SIMULATION =
  process.env.NODE_ENV !== "production" ||
  process.env.NEXT_PUBLIC_PACEFOLIO_PG_SIMULATION === "1";
export const PG_SIMULATION_CAPTURE_MS = 1200; // 가짜 webhook 지연

export interface Receipt {
  status: "AUTHORIZED" | "CAPTURED"; // AUTHORIZED = 승인 확인 중(완료 아님)
  amount: number; method: string; auto: boolean; proof: string;
  allPaid: boolean; names: ChildName[]; pend: ChildName[];
}

interface State {
  child: ChildName;
  academy: AcademyName;
  ps: Record<string, PState>;
  pay: Record<AcademyName, PayState>;
  invStatus: Record<ChildName, "PENDING" | "PAID">;
  invSel: Record<ChildName, boolean>;
  payMethod: string;
  selDay: string;
  seg: ChildSeg;
  receipt: Receipt | null;
}

type Action =
  | { t: "child"; name: ChildName }
  | { t: "academy"; name: AcademyName }
  | { t: "confirm" }
  | { t: "absent"; reason: string }
  | { t: "cancelAbs" }
  | { t: "makeupReq" }
  | { t: "makeupDone" }
  | { t: "clap" }
  | { t: "clearUnread" }
  | { t: "toggleInv"; name: ChildName }
  | { t: "payMethod"; method: string }
  | { t: "paymentSubmitted"; names: ChildName[]; method: string } // 제출 — AUTHORIZED
  | { t: "paymentCaptured" }                                       // 승인 확정 — 시뮬 webhook
  | { t: "contestMethod"; method: string }
  | { t: "registerContest" }
  | { t: "autopay"; on: boolean }
  | { t: "selDay"; day: string }
  | { t: "seg"; seg: ChildSeg };

const INV_NAMES: ChildName[] = ["도담", "서준"];

function init(): State {
  return {
    child: "도담", academy: "원더짐 아카데미",
    ps: initialPS(), pay: initialPay(),
    invStatus: { "도담": "PENDING", "서준": "PENDING" },
    invSel: { "도담": true, "서준": true },
    payMethod: "카카오페이", selDay: "27", seg: "grow", receipt: null,
  };
}

function patchPS(st: State, patch: Partial<PState>): State {
  const key = pkeyOf(st.child, st.academy);
  return { ...st, ps: { ...st.ps, [key]: { ...st.ps[key], ...patch } } };
}
function patchPay(st: State, patch: Partial<PayState>): State {
  return { ...st, pay: { ...st.pay, [st.academy]: { ...st.pay[st.academy], ...patch } } };
}
const isPaidIn = (st: State, n: ChildName) => st.invStatus[n] === "PAID";

function reducer(st: State, a: Action): State {
  const key = pkeyOf(st.child, st.academy);
  const cur = st.ps[key];
  switch (a.t) {
    case "child": {
      if (a.name === st.child) return st;
      const acads = CHILDREN[a.name].acads;
      const academy = acads.includes(st.academy) ? st.academy : acads[0];
      return { ...st, child: a.name, academy };
    }
    case "academy":
      return a.name === st.academy ? st : { ...st, academy: a.name };
    case "confirm":
      return patchPS(st, { attend: "confirm" });
    case "absent": {
      const was = cur.attend === "absent";
      const log = [...cur.absLog];
      if (was && cur.absReason !== a.reason) log.push(`사유 변경: ${cur.absReason} → ${a.reason} · 오후 1:20`);
      else if (!was) log.push(`결석 접수 · 사유: ${a.reason} · 오후 1:15`);
      return patchPS(st, { attend: "absent", absReason: a.reason, absLog: log });
    }
    case "cancelAbs":
      return patchPS(st, { attend: null, absReason: null, absLog: [...cur.absLog, "결석 취소 — 참석 예정으로 되돌림 · 오후 1:25"] });
    case "makeupReq":
      return patchPS(st, { makeupReq: true });
    case "makeupDone":
      return patchPS(st, { makeupDone: true });
    case "clap":
      return cur.myClap ? st : patchPS(st, { myClap: true, claps: cur.claps + 1 });
    case "clearUnread":
      return cur.chatUnread > 0 ? patchPS(st, { chatUnread: 0 }) : st;
    case "toggleInv": {
      if (isPaidIn(st, a.name)) return st;
      const next = { ...st.invSel, [a.name]: !st.invSel[a.name] };
      const anySel = INV_NAMES.some((n) => next[n] && !isPaidIn(st, n));
      if (!anySel) return st; // 최소 한 명 유지
      return { ...st, invSel: next };
    }
    case "payMethod":
      return { ...st, payMethod: a.method };
    case "paymentSubmitted": {
      // 제출만 — 청구서 상태는 건드리지 않는다(UI 성공 ≠ CAPTURED)
      const amount = a.names.reduce((s, n) => s + INV_AMT[n], 0);
      const receipt: Receipt = {
        status: "AUTHORIZED",
        amount, method: a.method, auto: st.pay[st.academy].autoPay,
        proof: a.method === "신용카드" ? "카드 매출전표 발급 ✓" : "간편결제 영수증 발급 ✓",
        allPaid: false, names: a.names, pend: [],
      };
      return { ...st, receipt };
    }
    case "paymentCaptured": {
      // 시뮬 webhook 이 승인 확정 — 이때만 청구서가 PAID 로
      const r = st.receipt;
      if (!r || r.status === "CAPTURED") return st;
      const invStatus = { ...st.invStatus };
      const invSel = { ...st.invSel };
      r.names.forEach((n) => { invStatus[n] = "PAID"; invSel[n] = false; });
      const allPaid = INV_NAMES.every((n) => invStatus[n] === "PAID");
      const pend = INV_NAMES.filter((n) => invStatus[n] !== "PAID");
      const receipt: Receipt = { ...r, status: "CAPTURED", allPaid, pend };
      return { ...patchPay(st, { paid: allPaid, payMethod: r.method }), invStatus, invSel, receipt };
    }
    case "contestMethod":
      return patchPS(st, { contestPayMethod: a.method });
    case "registerContest":
      return cur.contest ? st : patchPS(st, { contest: true });
    case "autopay":
      return patchPay(st, { autoPay: a.on });
    case "selDay":
      return { ...st, selDay: a.day };
    case "seg":
      return { ...st, seg: a.seg };
    default:
      return st;
  }
}

interface Ctx {
  st: State;
  key: string;
  cur: PState;
  payCur: PayState;
  content: Content;
  detail: Detail;
  isPaid: (n: ChildName) => boolean;
  pendNames: () => ChildName[];
  pendAmt: () => number;
  anyPending: () => boolean;
  selNames: () => ChildName[];
  selAmt: () => number;
  dispatch: React.Dispatch<Action>;
  /* UI */
  sheet: SheetId;
  openSheet: (id: Exclude<SheetId, null>) => void;
  closeSheet: () => void;
  toast: (msg: string) => void;
  toastMsg: string | null;
}

const ParentCtx = createContext<Ctx | null>(null);

export function ParentProvider({ children }: { children: React.ReactNode }) {
  const [st, dispatch] = useReducer(reducer, undefined, init);
  const [sheet, setSheet] = useState<SheetId>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const key = pkeyOf(st.child, st.academy);
  const cur = st.ps[key];
  const payCur = st.pay[st.academy];
  const content = CONTENT[key];
  const detail = DETAIL[key] ?? DETAIL["도담|원더짐 아카데미"];

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToastMsg(null), 2400);
  }, []);
  const openSheet = useCallback((id: Exclude<SheetId, null>) => setSheet(id), []);
  const closeSheet = useCallback(() => setSheet(null), []);

  const isPaid = useCallback((n: ChildName) => st.invStatus[n] === "PAID", [st.invStatus]);
  const pendNames = useCallback(() => INV_NAMES.filter((n) => st.invStatus[n] !== "PAID"), [st.invStatus]);
  const pendAmt = useCallback(() => pendNames().reduce((s, n) => s + INV_AMT[n], 0), [pendNames]);
  const anyPending = useCallback(() => pendNames().length > 0, [pendNames]);
  const selNames = useCallback(() => INV_NAMES.filter((n) => st.invSel[n] && st.invStatus[n] !== "PAID"), [st.invSel, st.invStatus]);
  const selAmt = useCallback(() => selNames().reduce((s, n) => s + INV_AMT[n], 0), [selNames]);

  const value = useMemo<Ctx>(() => ({
    st, key, cur, payCur, content, detail,
    isPaid, pendNames, pendAmt, anyPending, selNames, selAmt,
    dispatch, sheet, openSheet, closeSheet, toast, toastMsg,
  }), [st, key, cur, payCur, content, detail, isPaid, pendNames, pendAmt, anyPending, selNames, selAmt, sheet, openSheet, closeSheet, toast, toastMsg]);

  return <ParentCtx.Provider value={value}>{children}</ParentCtx.Provider>;
}

export function useParent() {
  const c = useContext(ParentCtx);
  if (!c) throw new Error("useParent must be used within ParentProvider");
  return c;
}
