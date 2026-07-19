"use client";

/* 보호자 온보딩 전역 상태 — 스텝 머신 + 실 API 연결(슬라이스 A).
   모델: 초대코드로 학원 진입 → 휴대폰 본인인증(세션) → 부모가 아이 직접 등록.
   LIVE = 실 서버/DB(초대코드 검증·인증세션·아이 등록). API 불통·데모 플래그면 FIXTURE 폴백.
   ⚠️ SMS/PASS 는 스텁(dev). docs/design/guardian-zem-benchmark.md §6. */

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from "react";
import { createApiClient, ApiError } from "@pacefolio/api-client";
import {
  academyByCode, OTP_WRONG_DEMO, type Academy, type ChildDraft,
} from "./_data";

const api = createApiClient({ baseUrl: "/api" });
const CONSENT_VERSION = "v1.0";
const INVITE_ERR = "초대코드를 확인할 수 없어요. 학원에서 받은 코드가 맞는지 확인해 주세요.";
const OTP_ERR = "인증번호가 일치하지 않아요. 다시 확인해 주세요.";
const RETRY_ERR = "잠시 후 다시 시도해 주세요.";

export type Step = "intro" | "invite" | "phone" | "otp" | "agree" | "register" | "notify";
export const FLOW: Step[] = ["invite", "phone", "otp", "agree", "register", "notify"];
type Mode = "PROBING" | "LIVE" | "FIXTURE";

interface Ctx {
  step: Step;
  go: (s: Step) => void;
  flowIndex: number;
  mode: Mode;
  busy: boolean;
  /* 학원(초대코드) */
  code: string;
  setCode: (v: string) => void;
  academy: Academy | null;
  resolveInvite: (raw?: string) => Promise<boolean>;
  pickAcademy: (a: Academy) => Promise<void>;
  clearAcademy: () => void;
  /* 본인인증 */
  phone: string; setPhone: (v: string) => void;
  carrier: string; setCarrier: (v: string) => void;
  submitOtp: (code: string) => Promise<void>;
  /* 약관 */
  agreed: Record<string, boolean>;
  toggleAgree: (id: string) => void;
  setAll: (on: boolean) => void;
  /* 아이 등록 */
  children: ChildDraft[];
  addChild: () => void;
  updateChild: (id: string, patch: Partial<ChildDraft>) => void;
  removeChild: (id: string) => void;
  runRegister: () => Promise<void>;
  /* 공통 */
  error: string | null;
  clearError: () => void;
}

const OnboardCtx = createContext<Ctx | null>(null);

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [step, setStep] = useState<Step>("intro");
  const [code, setCode] = useState("");
  const [academy, setAcademy] = useState<Academy | null>(null);
  const [phone, setPhone] = useState("");
  const [carrier, setCarrier] = useState("SKT");
  const [agreed, setAgreed] = useState<Record<string, boolean>>({});
  const [kids, setKids] = useState<ChildDraft[]>(() => [{ id: "c0", name: "", birth: "", programId: "" }]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<Mode>("PROBING");
  const [verificationSessionId, setVsid] = useState<string | null>(null);
  const seq = useRef(1);

  const modeRef = useRef<Mode>("PROBING");
  const probed = useRef(false);
  // ready = 세션·모드 결정 완료 신호. 액션은 이 promise 를 await 후 mode 확정값 사용.
  const [ready] = useState(() => {
    let resolve!: () => void;
    const p = new Promise<void>((r) => { resolve = r; });
    return { p, resolve };
  });

  // 세션·모드 결정: /api 도달 시 devLogin(dev) → LIVE, 불통·데모 플래그면 FIXTURE
  useEffect(() => {
    if (probed.current) return;
    probed.current = true;
    (async () => {
      try {
        if (process.env.NEXT_PUBLIC_PACEFOLIO_DEMO_FIXTURE === "1") { modeRef.current = "FIXTURE"; }
        else {
          const ctl = new AbortController();
          const t = setTimeout(() => ctl.abort(), 1500);
          const res = await fetch("/api/sessions/me", { signal: ctl.signal, credentials: "include" });
          clearTimeout(t);
          if (res.status === 401) { await api.devLogin("박서연"); modeRef.current = "LIVE"; }
          else if (res.ok) modeRef.current = "LIVE";
          else modeRef.current = "FIXTURE";
        }
      } catch { modeRef.current = "FIXTURE"; }
      finally { setMode(modeRef.current); ready.resolve(); }
    })();
  }, [ready]);

  const go = useCallback((s: Step) => { setError(null); setStep(s); }, []);
  const clearError = useCallback(() => setError(null), []);

  const resolveInvite = useCallback(async (raw?: string) => {
    const codeStr = raw ?? code;
    setError(null);
    await ready.p;
    if (modeRef.current === "LIVE") {
      setBusy(true);
      try {
        const r = await api.resolveInvite(codeStr);
        setAcademy({ id: r.academyId, name: r.academyName, theme: r.themeColor, programs: r.programs });
        return true;
      } catch (e) {
        setError(e instanceof ApiError && e.status === 404 ? INVITE_ERR : RETRY_ERR);
        return false;
      } finally { setBusy(false); }
    }
    const found = academyByCode(codeStr);
    if (!found) { setError(INVITE_ERR); return false; }
    setAcademy(found); return true;
  }, [code, ready]);

  const pickAcademy = useCallback(async (a: Academy) => {
    setError(null);
    await ready.p;
    // LIVE: 정적 학원 선택도 서버 resolve 로 실 academyId 확보(seed 된 학원만)
    if (modeRef.current === "LIVE" && a.code) { await resolveInvite(a.code); return; }
    if (modeRef.current === "LIVE") { setError("이 학원은 아직 연결할 수 없어요. 초대코드로 시작해 주세요."); return; }
    setAcademy(a);
  }, [resolveInvite, ready]);

  const clearAcademy = useCallback(() => { setError(null); setAcademy(null); }, []);

  const toggleAgree = useCallback((id: string) => setAgreed((a) => ({ ...a, [id]: !a[id] })), []);
  const setAll = useCallback((on: boolean) => {
    const next: Record<string, boolean> = {};
    ["tos", "privacy", "age", "marketing"].forEach((k) => { next[k] = on; });
    setAgreed(next);
  }, []);

  const submitOtp = useCallback(async (otp: string) => {
    setError(null);
    await ready.p;
    if (modeRef.current === "LIVE") {
      setBusy(true);
      try {
        await api.issueGuardianOtp(phone);          // 스텁 발송(멱등)
        const r = await api.verifyGuardianOtp(phone, otp);
        setVsid(r.verificationSessionId);
        setStep("agree");
      } catch (e) {
        setError(e instanceof ApiError && e.status === 422 ? OTP_ERR : RETRY_ERR);
      } finally { setBusy(false); }
      return;
    }
    if (otp === OTP_WRONG_DEMO) { setError(OTP_ERR); return; }
    setStep("agree");
  }, [phone, ready]);

  const addChild = useCallback(() => {
    const id = `c${seq.current++}`;
    setKids((ks) => [...ks, { id, name: "", birth: "", programId: "" }]);
  }, []);
  const updateChild = useCallback((id: string, patch: Partial<ChildDraft>) =>
    setKids((ks) => ks.map((k) => (k.id === id ? { ...k, ...patch } : k))), []);
  const removeChild = useCallback((id: string) =>
    setKids((ks) => ks.filter((k) => k.id !== id)), []);

  const runRegister = useCallback(async () => {
    setError(null);
    await ready.p;
    if (modeRef.current === "LIVE") {
      if (!academy || !verificationSessionId) { setError("본인인증이 필요해요. 처음부터 다시 시도해 주세요."); return; }
      setBusy(true);
      try {
        await api.selfRegisterChildren(academy.id, {
          verificationSessionId, consentPolicyVersion: CONSENT_VERSION, consentAgreed: true,
          children: kids.map((k) => ({ name: k.name.trim(), birth: k.birth, programId: k.programId || undefined })),
        });
        setStep("notify");
      } catch (e) {
        setError(e instanceof ApiError && e.status === 409 ? "이미 처리된 요청이에요. 처음부터 다시 시도해 주세요." : "등록 중 문제가 생겼어요. 다시 시도해 주세요.");
      } finally { setBusy(false); }
      return;
    }
    setStep("notify");
  }, [academy, verificationSessionId, kids, ready]);

  const flowIndex = Math.max(0, FLOW.indexOf(step as (typeof FLOW)[number]));

  const value = useMemo<Ctx>(() => ({
    step, go, flowIndex, mode, busy,
    code, setCode, academy, resolveInvite, pickAcademy, clearAcademy,
    phone, setPhone, carrier, setCarrier, submitOtp,
    agreed, toggleAgree, setAll,
    children: kids, addChild, updateChild, removeChild, runRegister,
    error, clearError,
  }), [step, go, flowIndex, mode, busy, code, academy, resolveInvite, pickAcademy, clearAcademy,
    phone, carrier, submitOtp, agreed, toggleAgree, setAll, kids, addChild, updateChild, removeChild,
    runRegister, error, clearError]);

  return <OnboardCtx.Provider value={value}>{children}</OnboardCtx.Provider>;
}

export function useOnboarding() {
  const c = useContext(OnboardCtx);
  if (!c) throw new Error("useOnboarding must be used within OnboardingProvider");
  return c;
}
