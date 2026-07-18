/* rate limit (#39-⑤, 체크리스트 §32) — 인메모리 슬라이딩 윈도.
   대상: 인증 표면(무차별 대입·OTP 남용 방지). 프로덕션 다중 인스턴스 전환 시
   Redis 등 공유 스토어로 교체 — 인터페이스는 미들웨어 그대로. */
import type { Context, Next } from "hono";

interface Bucket { times: number[] }

export function rateLimit(opts: { windowMs: number; max: number; keyPrefix: string }) {
  const buckets = new Map<string, Bucket>();
  let lastSweep = 0;
  return async (c: Context, next: Next) => {
    const now = Date.now();
    // 주기적 청소 — 무한 성장 방지
    if (now - lastSweep > opts.windowMs) {
      for (const [k, b] of buckets) {
        b.times = b.times.filter((t) => now - t < opts.windowMs);
        if (b.times.length === 0) buckets.delete(k);
      }
      lastSweep = now;
    }
    const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim()
      ?? c.req.header("x-real-ip") ?? "local";
    const key = `${opts.keyPrefix}:${ip}`;
    const b = buckets.get(key) ?? { times: [] };
    b.times = b.times.filter((t) => now - t < opts.windowMs);
    if (b.times.length >= opts.max) {
      return c.json({ error: "RATE_LIMITED", retryAfterMs: opts.windowMs }, 429);
    }
    b.times.push(now);
    buckets.set(key, b);
    await next();
  };
}
