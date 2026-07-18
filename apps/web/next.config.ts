import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@pacefolio/domain", "@pacefolio/api-client"],
  // Gate 2: /api/* → apps/api(:3001) 프록시 — same-origin 이라 CORS 불필요,
  // 세션·CSRF 쿠키가 :3000 오리진으로 흐른다 (Origin allowlist 는 API 쪽 검증)
  async rewrites() {
    const apiOrigin = process.env.PACEFOLIO_API_ORIGIN ?? "http://localhost:3001";
    return [{ source: "/api/:path*", destination: `${apiOrigin}/:path*` }];
  },
};

export default nextConfig;
