"use client";

/* Gate 2 — UI-API 실연결 검증 surface (제품 화면 아님 · 개발 검증용)
   fixture 가 아니라 apps/api(:3001, /api rewrite)의 실 API + 실 DB 로
   "로그인 → 청구 → 결제 → 웹훅 → 환불 → 양측 승인 → 웹훅 → 재계산"
   전체 수명주기를 브라우저에서 실행한다.
   전제: `npm run dev:api` (DATABASE_URL 없으면 PGlite 자동 기동+seed). */

import { useRef, useState } from "react";
import Link from "next/link";
import { createApiClient, ApiError } from "@pacefolio/api-client";

const ACADEMY = "a_wondergym";
type StepState = "idle" | "running" | "pass" | "fail";
interface StepLog { name: string; state: StepState; detail: string }

const api = createApiClient({ baseUrl: "/api" });

async function pgWebhook(body: Record<string, unknown>) {
  const res = await fetch("/api/webhooks/pg/mockpg", {
    method: "POST",
    headers: { "content-type": "application/json", "x-webhook-secret": "dev-mockpg-secret" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`webhook ${res.status} ${JSON.stringify(json)}`);
  return json as { decision?: string };
}

export default function Gate2Live() {
  const [logs, setLogs] = useState<StepLog[]>([]);
  const [running, setRunning] = useState(false);
  const runId = useRef(0);

  const push = (name: string, state: StepState, detail = "") =>
    setLogs((l) => [...l, { name, state, detail }]);
  const update = (state: StepState, detail: string) =>
    setLogs((l) => l.map((x, i) => (i === l.length - 1 ? { ...x, state, detail } : x)));

  async function step(name: string, fn: () => Promise<string>) {
    push(name, "running");
    try {
      const detail = await fn();
      update("pass", detail);
    } catch (e) {
      update("fail", e instanceof ApiError ? `${e.status} ${e.code}` : String(e));
      throw e;
    }
  }

  async function runAll() {
    if (running) return;
    setRunning(true);
    setLogs([]);
    runId.current += 1;
    const uniq = `g2-${runId.current}-${Date.now()}`;
    try {
      await step("① 미로그인 접근 차단 (GET /sessions/me → 401)", async () => {
        try {
          await api.logout().catch(() => undefined); // 이전 실행 세션 정리
          await api.me();
          throw new Error("401 이어야 하는데 성공함");
        } catch (e) {
          if (e instanceof ApiError && e.status === 401) return "401 UNAUTHENTICATED ✓ (게이트 정상)";
          throw e;
        }
      });

      await step("② dev 로그인 — 박서연(보호자)", async () => {
        const r = await api.devLogin("박서연");
        return `userId=${r.userId} · 세션·CSRF 쿠키 발급`;
      });

      let academy = ACADEMY;
      await step("③ 세션 확인 (me) — GUARDIAN membership (academyId 는 세션에서 도출)", async () => {
        const me = await api.me();
        const m = me.memberships.find((x) => x.roles.includes("GUARDIAN") && x.status === "ACTIVE");
        if (!m) throw new Error("GUARDIAN membership 없음");
        academy = m.academyId; // P1-4: 하드코딩 대신 membership 도출
        return `${me.user.name} · ${academy} ${m.roles.join(",")} ${m.status}`;
      });

      let invoiceId = "", participantId = "", total = 0;
      await step("④ 내 아이 청구서 목록 (실 DB)", async () => {
        const list = await api.listInvoices(academy);
        const iv = list.invoices.find((x) => x.status === "ISSUED");
        if (!iv) throw new Error("ISSUED 청구서 없음 — API 재시작(seed 초기화) 필요");
        invoiceId = iv.invoiceId; participantId = iv.participantId; total = iv.total;
        return `${list.invoices.length}건 · ${iv.participantName} ${iv.total.toLocaleString()}원 ${iv.status} (lines ${iv.lines.length})`;
      });

      let paymentId = "";
      await step("⑤ 결제 준비 (서버 금액 계산 · 멱등키)", async () => {
        const r = await api.preparePayment(academy, [invoiceId], `pay-${uniq}`);
        paymentId = r.paymentId;
        if (r.amount !== total) throw new Error(`금액 불일치 ${r.amount} ≠ ${total}`);
        if (r.status !== "PENDING") throw new Error(`상태 이상: ${r.status} (PENDING 이어야)`); // P0-3
        return `${r.paymentId} · ${r.amount.toLocaleString()}원 · ${r.status}`;
      });

      await step("⑥ PG 웹훅 CAPTURED → 청구서 PAID", async () => {
        const w = await pgWebhook({
          kind: "payment", providerEventId: `evt-${uniq}-cap`, paymentId,
          targetStatus: "CAPTURED", occurredAt: new Date().toISOString(),
        });
        const list = await api.listInvoices(academy);
        if (w.decision !== "APPLY") throw new Error(`decision=${w.decision} (APPLY 이어야)`); // P0-3
        const iv = list.invoices.find((x) => x.invoiceId === invoiceId);
        if (iv?.status !== "PAID") throw new Error(`webhook=${w.decision} 인데 invoice=${iv?.status}`);
        return `inbox=${w.decision ?? "?"} · invoice → PAID ✓ (정산 재계산)`;
      });

      let refundId = "";
      await step("⑦ 환불 요청 (요청자 = 실제 결제자)", async () => {
        const r = await api.requestRefund(
          academy,
          { paymentId, participantId, reasonCode: "PERSONAL", reasonText: "Gate2 수명주기 검증" },
          `ref-${uniq}`,
        );
        refundId = r.refundId;
        if (r.requestedAmount !== total) throw new Error(`환불액 불일치 ${r.requestedAmount}`);
        return `${r.refundId} · ${r.requestedAmount.toLocaleString()}원 · ${r.status}`;
      });

      await step("⑧ 보호자 측 승인 (링크 재검증 포함)", async () => {
        const r = await api.approveRefund(academy, refundId);
        if (r.status !== "REQUESTED") throw new Error(`한쪽 승인 후 상태 이상: ${r.status}`); // P0-3
        return `status=${r.status} (보호자 승인 기록 — 아직 상호 승인 아님)`;
      });

      await step("⑨ 원장 로그인 전환 — 김도윤", async () => {
        await api.logout();
        const r = await api.devLogin("김도윤");
        return `userId=${r.userId} · OWNER 세션`;
      });

      await step("⑩ 원장 측 승인 → MUTUALLY_APPROVED (동일인 승인 금지 통과)", async () => {
        const r = await api.approveRefund(academy, refundId);
        if (r.status !== "MUTUALLY_APPROVED") throw new Error(`status=${r.status}`);
        return `양측 승인 완료 · ${r.status}`;
      });

      let completedAt = "";
      await step("⑪ 환불 웹훅 PROCESSING → COMPLETED (시각 분리 · 각 APPLY 검증)", async () => {
        // P0-3: 두 이벤트의 occurredAt 을 명확히 분리 — 같은 밀리초 경계 제거
        const t0 = Date.now();
        const w1 = await pgWebhook({
          kind: "refund", providerEventId: `evt-${uniq}-prc`, refundId,
          targetStatus: "PROCESSING", occurredAt: new Date(t0).toISOString(),
        });
        if (w1.decision !== "APPLY") throw new Error(`PROCESSING decision=${w1.decision}`);
        completedAt = new Date(t0 + 1000).toISOString();
        const w2 = await pgWebhook({
          kind: "refund", providerEventId: `evt-${uniq}-cpl`, refundId,
          targetStatus: "COMPLETED", occurredAt: completedAt,
        });
        if (w2.decision !== "APPLY") throw new Error(`COMPLETED decision=${w2.decision}`);
        return `PROCESSING=APPLY · COMPLETED=APPLY ✓ (occurredAt +1s 분리)`;
      });

      await step("⑫ 정산 재계산 — 정확히 REFUNDED + Payment 서버 재조회", async () => {
        await api.logout();
        await api.devLogin("박서연");
        const list = await api.listInvoices(academy);
        const iv = list.invoices.find((x) => x.invoiceId === invoiceId);
        if (!iv) throw new Error("청구서 조회 실패");
        // P0-3: "PAID 아님"이 아니라 전액 환불의 기대 상태를 정확히 검사
        if (iv.status !== "REFUNDED") throw new Error(`invoice=${iv.status} (REFUNDED 이어야)`);
        const ps = await api.getPayment(academy, paymentId);
        if (ps.status !== "REFUNDED") throw new Error(`payment=${ps.status} (REFUNDED 이어야)`);
        return `invoice → REFUNDED · payment → REFUNDED ✓ (서버 진실 이중 확인)`;
      });

      await step("⑬ 웹훅 멱등 — 같은 eventId 재전송 = 정확히 IGNORE_ALREADY_SEEN", async () => {
        const w = await pgWebhook({
          kind: "refund", providerEventId: `evt-${uniq}-cpl`, refundId,
          targetStatus: "COMPLETED", occurredAt: completedAt,
        });
        // P0-3: "APPLY 아님"은 느슨 — RECONCILE·REJECT 도 실패다
        if (w.decision !== "IGNORE_ALREADY_SEEN") {
          throw new Error(`decision=${w.decision} (IGNORE_ALREADY_SEEN 이어야)`);
        }
        return `decision=IGNORE_ALREADY_SEEN ✓ (inbox UNIQUE)`;
      });
    } catch {
      /* 실패 스텝에 이미 기록됨 — 이후 스텝 중단 */
    } finally {
      setRunning(false);
    }
  }

  const passCount = logs.filter((l) => l.state === "pass").length;
  const failCount = logs.filter((l) => l.state === "fail").length;

  return (
    <div className="min-h-screen bg-[#0e1116] px-5 py-8 text-white">
      <div className="mx-auto max-w-3xl">
        <div className="mb-1 flex flex-wrap items-center gap-3">
          <span className="text-xl">🔌</span>
          <h1 className="text-[19px] font-extrabold tracking-tight">Gate 2 — UI-API 실연결 수명주기</h1>
          <span className="rounded-full bg-emerald-400/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
            실 API + 실 DB (fixture 아님)
          </span>
          <div className="flex-1" />
          <Link href="/stage" className="flex h-8 items-center rounded-lg bg-white/10 px-3 text-[12px] font-semibold hover:bg-white/15">← 스테이지</Link>
        </div>
        <p className="mb-5 text-[13px] text-white/50">
          로그인 → 청구 → 결제 준비 → CAPTURE 웹훅 → 환불 요청 → 양측 승인(세션 전환) → COMPLETED 웹훅 → 정산 재계산 → 웹훅 멱등.
          전제: <code className="text-emerald-300">npm run dev:api</code> (DATABASE_URL 없으면 PGlite 자동 seed).
          결제·환불이 이미 처리된 상태면 API 를 재시작해 초기화하세요.
        </p>

        <div className="mb-5 flex items-center gap-3">
          <button
            onClick={runAll}
            disabled={running}
            className="h-11 rounded-xl bg-emerald-400/90 px-5 text-[13.5px] font-extrabold text-black transition hover:bg-emerald-300 disabled:opacity-40"
          >
            {running ? "실행 중..." : "전체 수명주기 실행 ▶"}
          </button>
          {logs.length > 0 && (
            <span className={`text-[13px] font-bold ${failCount ? "text-rose-300" : "text-emerald-300"}`}>
              {passCount}/{logs.length} PASS{failCount ? ` · ${failCount} FAIL` : passCount === 13 ? " — 전 구간 통과 🎉" : ""}
            </span>
          )}
        </div>

        <div className="space-y-2">
          {logs.map((l, i) => (
            <div key={i} className={`rounded-xl border p-3 ${
              l.state === "pass" ? "border-emerald-400/30 bg-emerald-400/5"
              : l.state === "fail" ? "border-rose-400/40 bg-rose-400/10"
              : "border-white/10 bg-white/[0.04]"
            }`}>
              <div className="flex items-center gap-2 text-[13px] font-bold">
                <span>{l.state === "pass" ? "✅" : l.state === "fail" ? "❌" : "⏳"}</span>
                {l.name}
              </div>
              {l.detail && <div className="mt-1 pl-7 font-mono text-[11.5px] text-white/60">{l.detail}</div>}
            </div>
          ))}
        </div>

        <p className="mt-6 text-[11px] leading-relaxed text-white/30">
          이 화면은 개발 검증 surface — 제품 UI 의 실 API 전환(학부모 결제 화면 등)은 이 연결(api-client·rewrite·세션)을 그대로 사용한다.
          웹 라우트 가드: NEXT_PUBLIC_PACEFOLIO_REQUIRE_SESSION=1 이면 /parent 등은 pf_session 쿠키 없이 이 페이지로 리다이렉트(유효성 최종 판정은 API 401).
        </p>
      </div>
    </div>
  );
}
