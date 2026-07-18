"use client";

/* 프로그램 스튜디오 공용 훅 (PS2 · docs/20§1)
   ⚠️ fixture fallback 금지(지시서 §17) — live API 만.
   상태: LOADING / READY / ERROR / NO_ACCESS (오류 위장 금지). */
import { useEffect, useState, type ReactNode } from "react";
import { createApiClient, ApiError } from "@pacefolio/api-client";
import { Spinner, Note, ActBtn } from "../_ui";

export const api = createApiClient({ baseUrl: "/api" });

export type StudioState = "LOADING" | "READY" | "ERROR" | "NO_ACCESS";

export function useStudioAcademy() {
  const [state, setState] = useState<StudioState>("LOADING");
  const [errorMsg, setErrorMsg] = useState<string>();
  const [academyId, setAcademyId] = useState<string>();
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    let alive = true;
    api.me().then((me) => {
      if (!alive) return;
      const active = me.memberships.filter((m) => m.status === "ACTIVE");
      const ownerM = active.find((m) => m.roles.includes("OWNER"));
      const anyM = ownerM ?? active[0];
      if (!anyM) { setState("NO_ACCESS"); return; }
      setAcademyId(anyM.academyId);
      setIsOwner(!!ownerM);
      setState("READY");
    }).catch((e) => {
      if (!alive) return;
      if (e instanceof ApiError && e.status === 401) setState("NO_ACCESS");
      else { setErrorMsg(e instanceof Error ? e.message : String(e)); setState("ERROR"); }
    });
    return () => { alive = false; };
  }, []);

  return { state, errorMsg, academyId, isOwner };
}

/** 게이트 — READY 전 상태를 정직하게 표시(fixture 위장 없음) */
export function StudioGate({ state, errorMsg, children }: {
  state: StudioState; errorMsg?: string; children: ReactNode;
}) {
  if (state === "LOADING") {
    return <div className="flex items-center gap-2 py-16 justify-center text-ink3 text-[13px]"><Spinner /> 불러오는 중…</div>;
  }
  if (state === "NO_ACCESS") {
    return (
      <Note>
        로그인이 필요해요. 학원 계정으로 로그인하면 프로그램 스튜디오를 쓸 수 있어요.
        <div className="mt-2">
          <ActBtn onClick={() => { void api.devLogin("원장").then(() => location.reload()).catch(() => alert("개발용 로그인 사용 불가(프로덕션)")); }}>
            개발용 로그인
          </ActBtn>
        </div>
      </Note>
    );
  }
  if (state === "ERROR") {
    return <Note>지금 프로그램 정보를 불러오지 못했어요. 잠시 후 새로고침해 주세요.{errorMsg ? ` (${errorMsg})` : ""}</Note>;
  }
  return <>{children}</>;
}

/** 입력 필드 — 스튜디오 공통 스타일 */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <div className="text-[11px] font-bold text-ink3 mb-1">{label}</div>
      {children}
    </label>
  );
}

export const inputCls =
  "w-full h-9 px-3 rounded-lg border border-line bg-surface text-[13px] text-ink outline-none focus:border-accent";
export const textareaCls =
  "w-full px-3 py-2 rounded-lg border border-line bg-surface text-[13px] text-ink outline-none focus:border-accent min-h-[72px]";

export const MODE_LABELS: Record<string, string> = {
  EXPERIENCE: "경험 누적형",
  SKILL_MASTERY: "기술 클리어형",
  SEASONAL: "단계·시즌형",
  MEASUREMENT: "기록 측정형",
  COURSE: "과정 이수형",
};

export function statusPill(status: string): { kind: "ok" | "due" | "wait"; label: string } {
  if (status === "PUBLISHED") return { kind: "ok", label: "게시됨" };
  if (status === "DRAFT") return { kind: "wait", label: "작성 중" };
  if (status === "IN_REVIEW") return { kind: "wait", label: "검토 중" };
  return { kind: "due", label: "보관됨" };
}
