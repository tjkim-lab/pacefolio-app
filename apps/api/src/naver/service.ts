/* 네이버 검색·데이터랩 래퍼 (#39-⑥ — HQ-2 이식, docs/19)
   crawler-tool 의 naver_search/datalab 사용 패턴을 TS 로 이식(저장소 불변 원칙 —
   코드 복사 아님, 같은 공개 API 를 우리 스택으로). 용도: 성장판 카드·매거진 키워드 검증.
   env 미설정 = 501 fail-closed. fetch 주입 = 테스트 격리. */

export interface NaverConfig {
  clientId: string;
  clientSecret: string;
  fetchFn?: typeof fetch;
}

export function naverFromEnv(fetchFn?: typeof fetch): NaverClient | null {
  const clientId = process.env.PACEFOLIO_NAVER_CLIENT_ID;
  const clientSecret = process.env.PACEFOLIO_NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return createNaverClient({ clientId, clientSecret, fetchFn });
}

export interface NaverClient {
  /** 검색(블로그·뉴스·웹) — display ≤ 20 */
  search(type: "blog" | "news" | "webkr", query: string, display?: number): Promise<unknown>;
  /** 데이터랩 검색어 트렌드 — 키워드 그룹 최대 5 */
  datalabTrend(input: {
    startDate: string; endDate: string; timeUnit: "date" | "week" | "month";
    keywordGroups: { groupName: string; keywords: string[] }[];
  }): Promise<unknown>;
}

export function createNaverClient(cfg: NaverConfig): NaverClient {
  const f = cfg.fetchFn ?? fetch;
  const headers = {
    "X-Naver-Client-Id": cfg.clientId,
    "X-Naver-Client-Secret": cfg.clientSecret,
  };
  return {
    async search(type, query, display = 10) {
      const url = `https://openapi.naver.com/v1/search/${type}.json?query=${encodeURIComponent(query)}&display=${Math.min(display, 20)}`;
      const res = await f(url, { headers });
      if (!res.ok) throw new Error(`naver search ${res.status}`);
      return res.json();
    },
    async datalabTrend(input) {
      if (input.keywordGroups.length === 0 || input.keywordGroups.length > 5) {
        throw new Error("keywordGroups 1~5");
      }
      const res = await f("https://openapi.naver.com/v1/datalab/search", {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(`naver datalab ${res.status}`);
      return res.json();
    },
  };
}
