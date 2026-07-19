/* HQ 크롤러 프록시(#37 HQ-1) — fetch 주입 단위 테스트 (실 크롤러 무접촉) */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHqCrawlerClient, hqCrawlerFromEnv, HqCrawlerError } from "../src/hq/service";

const fakeFetch = (log: string[], status = 200, body: unknown = { ok: true }) =>
  (async (url: string | URL | Request, init?: RequestInit) => {
    log.push(`${String(url)}|cookie=${(init?.headers as Record<string, string>)?.cookie ?? ""}`);
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;

test("env 미설정 = null(라우트 501 경로) · 설정 시 생성", () => {
  assert.equal(hqCrawlerFromEnv({}), null);
  assert.equal(hqCrawlerFromEnv({ PACEFOLIO_HQ_CRAWLER_BASE_URL: "http://x" }), null); // 쿠키 없음
  assert.ok(hqCrawlerFromEnv({
    PACEFOLIO_HQ_CRAWLER_BASE_URL: "http://x", PACEFOLIO_HQ_CRAWLER_COOKIE: "session=s",
  }));
});

test("products: 크롤러 쿼리 규약(reg_status·limit 상한 200) + 세션 쿠키 전달", async () => {
  const log: string[] = [];
  const hq = createHqCrawlerClient({
    baseUrl: "http://crawler:8000/", sessionCookie: "session=abc", fetchFn: fakeFetch(log),
  });
  await hq.products({ brand: "titleist", regStatus: "pending", page: 2, limit: 500 });
  assert.equal(log.length, 1);
  const [url, cookie] = log[0].split("|");
  assert.ok(url.startsWith("http://crawler:8000/api/v1/products?")); // 끝 슬래시 정규화
  assert.ok(url.includes("reg_status=pending"));
  assert.ok(url.includes("limit=200")); // 크롤러 상한 준수
  assert.equal(cookie, "cookie=session=abc");
});

test("401 = 세션 만료 오류로 명시 · 5xx = 상태 보존", async () => {
  const hq401 = createHqCrawlerClient({
    baseUrl: "http://c", sessionCookie: "s", fetchFn: fakeFetch([], 401),
  });
  await assert.rejects(() => hq401.health(), (e: unknown) =>
    e instanceof HqCrawlerError && e.status === 401 && /세션 만료/.test(e.message));
  const hq503 = createHqCrawlerClient({
    baseUrl: "http://c", sessionCookie: "s", fetchFn: fakeFetch([], 503),
  });
  await assert.rejects(() => hq503.health(), (e: unknown) =>
    e instanceof HqCrawlerError && e.status === 503);
});

test("jobs 3종 경로 — active·recent(limit)·last-crawl-summary", async () => {
  const log: string[] = [];
  const hq = createHqCrawlerClient({
    baseUrl: "http://c", sessionCookie: "s", fetchFn: fakeFetch(log),
  });
  await hq.activeJobs(); await hq.recentJobs(7); await hq.lastCrawlSummary();
  assert.ok(log[0].startsWith("http://c/api/v1/jobs/active|"));
  assert.ok(log[1].startsWith("http://c/api/v1/jobs/recent?limit=7|"));
  assert.ok(log[2].startsWith("http://c/api/v1/last-crawl-summary|"));
});
