import type { NextConfig } from "next";

/* B5(#54): admin 콘솔 물리 분리 — 교차테넌트 개인정보 최대 리스크 표면을
   학원 앱(web)과 별도 앱·별도 배포로 격리(아키텍처 B). dev :3002. */
const nextConfig: NextConfig = {
  transpilePackages: ["@pacefolio/domain", "@pacefolio/api-client"],
  // /api/* → apps/api 프록시 — web 과 동일 계약(세션·CSRF 쿠키는 이 오리진으로)
  async rewrites() {
    const apiOrigin = process.env.PACEFOLIO_API_ORIGIN ?? "http://localhost:3001";
    return [{ source: "/api/:path*", destination: `${apiOrigin}/:path*` }];
  },
};

export default nextConfig;
