/* 본부(HQ) 콘솔 ← crawler-tool 연동 (#37 HQ-1, docs/19 §① 1단계)
   원칙: 크롤러 FastAPI(NCP VM :8000)는 "수집·AI 엔진"으로 존속 — 콘솔은 조회 프록시만.
   크롤러 저장소는 읽기 전용(수정은 별도 승인) — 현 인증은 세션 쿠키 + IP 화이트리스트라
   콘솔 서버가 로그인 세션 쿠키를 env 로 주입받아 전달한다(서비스 토큰 전환은 승인 후).
   naver/service.ts 와 같은 경계 패턴: env 미설정 = 501(침묵 실패 금지), fetch 주입 테스트. */

export interface HqCrawlerConfig {
  baseUrl: string;          // 예: http://110.165.17.234:8000 (내부망/터널 경유)
  sessionCookie: string;    // 크롤러 로그인 세션 쿠키(예: "session=...")
  fetchFn?: typeof fetch;
}

export interface HqCrawlerClient {
  health(): Promise<unknown>;
  products(params: {
    brand?: string; search?: string; page?: number; limit?: number;
    regStatus?: "done" | "pending"; sort?: string; order?: "asc" | "desc";
  }): Promise<unknown>;
  activeJobs(): Promise<unknown>;
  recentJobs(limit?: number): Promise<unknown>;
  lastCrawlSummary(): Promise<unknown>;
}

export class HqCrawlerError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function createHqCrawlerClient(cfg: HqCrawlerConfig): HqCrawlerClient {
  const f = cfg.fetchFn ?? fetch;
  const base = cfg.baseUrl.replace(/\/$/, "");
  const get = async (path: string) => {
    const res = await f(`${base}${path}`, {
      headers: { cookie: cfg.sessionCookie, accept: "application/json" },
    });
    if (res.status === 401) throw new HqCrawlerError(401, "크롤러 세션 만료 — HQ 쿠키 재발급 필요");
    if (!res.ok) throw new HqCrawlerError(res.status, `크롤러 응답 오류(${res.status})`);
    return res.json();
  };
  return {
    // /api/v1/health 는 크롤러 쪽 인증 우회 경로 — 연동 상태 점검의 기본선
    health: () => get("/api/v1/health"),
    products: (p) => {
      const q = new URLSearchParams();
      if (p.brand) q.set("brand", p.brand);
      if (p.search) q.set("search", p.search);
      if (p.page) q.set("page", String(p.page));
      if (p.limit) q.set("limit", String(Math.min(p.limit, 200))); // 크롤러 상한 준수
      if (p.regStatus) q.set("reg_status", p.regStatus);
      if (p.sort) q.set("sort", p.sort);
      if (p.order) q.set("order", p.order);
      const qs = q.toString();
      return get(`/api/v1/products${qs ? `?${qs}` : ""}`);
    },
    activeJobs: () => get("/api/v1/jobs/active"),
    recentJobs: (limit = 5) => get(`/api/v1/jobs/recent?limit=${limit}`),
    lastCrawlSummary: () => get("/api/v1/last-crawl-summary"),
  };
}

/** env 로부터 생성 — 미설정이면 null(라우트가 501 로 응답: 연동 전 상태를 정직하게) */
export function hqCrawlerFromEnv(env: Record<string, string | undefined>): HqCrawlerClient | null {
  const baseUrl = env.PACEFOLIO_HQ_CRAWLER_BASE_URL;
  const sessionCookie = env.PACEFOLIO_HQ_CRAWLER_COOKIE;
  if (!baseUrl || !sessionCookie) return null;
  return createHqCrawlerClient({ baseUrl, sessionCookie });
}
