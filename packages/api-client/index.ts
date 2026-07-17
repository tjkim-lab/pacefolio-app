/* =========================================================
   PACEFOLIO API 클라이언트 — 아키텍처 B 의 공유 패키지 (R5 Phase 6)
   ---------------------------------------------------------
   경계: API DTO → runtime validation(zod) → ViewModel adapter → UI.
   UI 는 이 클라이언트를 통해서만 서버와 대화 — fetch 직접 호출 금지.
   - fetchFn 주입: 브라우저=window.fetch / 테스트=Hono app.request 어댑터
   - 응답도 zod 로 파싱(R6 §6.2: 타입은 네트워크를 검증하지 못한다)
   - CSRF: pf_csrf 쿠키(double-submit)를 읽어 X-CSRF-Token 자동 첨부
   ========================================================= */
import { z } from "zod";

/* ── 응답 스키마 (OpenAPI 대응 — 생성 타입 도입 전 수동 정합) ── */
const Me = z.object({
  user: z.object({
    id: z.string(), name: z.string(), phone: z.string(), email: z.string().nullable(),
  }),
  memberships: z.array(z.object({
    academyId: z.string(), roles: z.array(z.string()), status: z.string(),
  })),
});
export type Me = z.infer<typeof Me>;

const InvoiceList = z.object({
  invoices: z.array(z.object({
    invoiceId: z.string(), participantId: z.string(), participantName: z.string(),
    status: z.string(), total: z.number().int(), dueDate: z.string(),
    lines: z.array(z.object({ type: z.string(), label: z.string(), amount: z.number().int() })),
  })),
});
export type InvoiceList = z.infer<typeof InvoiceList>;

const PrepareResult = z.object({
  paymentId: z.string(), amount: z.number().int().positive(), status: z.string(),
});
export type PrepareResult = z.infer<typeof PrepareResult>;

const DevLoginResult = z.object({ userId: z.string() });

/* ── 에러 — status 와 서버 error 코드 보존 ── */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message?: string,
  ) {
    super(message ?? `${status} ${code}`);
    this.name = "ApiError";
  }
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface ApiClientConfig {
  baseUrl?: string;                 // 브라우저 프록시면 "" (same-origin)
  fetchFn?: FetchLike;              // 미지정 = globalThis.fetch
  getCsrfToken?: () => string | undefined; // 미지정 = document.cookie 에서 pf_csrf
}

function cookieCsrf(): string | undefined {
  // DOM lib 의존 없이 브라우저 감지(node·edge 에서도 컴파일 가능)
  const doc = (globalThis as { document?: { cookie?: string } }).document;
  if (!doc?.cookie) return undefined;
  return doc.cookie.split("; ").find((c: string) => c.startsWith("pf_csrf="))?.split("=")[1];
}

export function createApiClient(cfg: ApiClientConfig = {}) {
  const base = cfg.baseUrl ?? "";
  const fetchFn: FetchLike = cfg.fetchFn ?? ((i, init) => fetch(i, init));
  const csrf = cfg.getCsrfToken ?? cookieCsrf;

  async function call<T>(
    schema: z.ZodType<T>,
    path: string,
    init: RequestInit & { csrf?: boolean; idempotencyKey?: string } = {},
  ): Promise<T> {
    const headers = new Headers(init.headers);
    if (init.body) headers.set("content-type", "application/json");
    if (init.csrf) {
      const token = csrf();
      if (token) headers.set("x-csrf-token", token);
    }
    if (init.idempotencyKey) headers.set("idempotency-key", init.idempotencyKey);
    const res = await fetchFn(`${base}${path}`, {
      ...init, headers, credentials: "include",
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string };
      throw new ApiError(res.status, body.error ?? "UNKNOWN");
    }
    if (res.status === 204) return schema.parse(undefined as never);
    return schema.parse(await res.json()); // 응답 runtime validation
  }

  return {
    /** 개발용 로그인(카카오 키 없이) — 프로덕션 API 는 404 를 반환 */
    devLogin: (name: string) =>
      call(DevLoginResult, "/auth/dev/login", { method: "POST", body: JSON.stringify({ name }) }),
    me: () => call(Me, "/sessions/me"),
    logout: () => call(z.void(), "/sessions/logout", { method: "POST", csrf: true }),
    listInvoices: (academyId: string) =>
      call(InvoiceList, `/academies/${academyId}/invoices`),
    preparePayment: (academyId: string, invoiceIds: string[], idempotencyKey: string) =>
      call(PrepareResult, `/academies/${academyId}/payments/prepare`, {
        method: "POST", csrf: true, idempotencyKey,
        body: JSON.stringify({ invoiceIds }),
      }),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
