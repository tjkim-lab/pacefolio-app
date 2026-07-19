import { NextResponse, type NextRequest } from "next/server";

/* B5(#54): 관제 콘솔 웹 경계 — web proxy.ts 의 admin 규칙만 물려받아 강화.
   - 프로덕션 mock 차단(플래그 없으면 404) · 세션 요구 시 PLATFORM_ADMIN 정본 검증
   - 전 응답 no-store + noindex. 분리 배포라 이 앱엔 admin 외 표면이 없다. */

export async function proxy(req: NextRequest) {
  if (process.env.NODE_ENV === "production" &&
      process.env.NEXT_PUBLIC_PACEFOLIO_PG_SIMULATION !== "1") {
    return new NextResponse(null, { status: 404 });
  }

  if (process.env.NEXT_PUBLIC_PACEFOLIO_REQUIRE_SESSION === "1") {
    const session = req.cookies.get("pf_session");
    if (!session) return new NextResponse(null, { status: 404 }); // 관제는 로그인 유도도 없음 — 은닉
    try {
      const apiOrigin = process.env.PACEFOLIO_API_ORIGIN ?? "http://localhost:3001";
      const me = await fetch(`${apiOrigin}/sessions/me`, {
        headers: { cookie: `pf_session=${session.value}` },
        signal: AbortSignal.timeout(2000),
      });
      if (!me.ok) return new NextResponse(null, { status: 404 }); // 만료·판정 불가 = fail-closed
      const body = (await me.json()) as { memberships?: { roles: string[]; status: string }[] };
      const allowed = (body.memberships ?? []).some(
        (m) => m.status === "ACTIVE" && m.roles.includes("PLATFORM_ADMIN"),
      );
      if (!allowed) return new NextResponse(null, { status: 404 }); // 표면 은닉
    } catch {
      return new NextResponse(null, { status: 404 });
    }
  }

  const res = NextResponse.next();
  res.headers.set("Cache-Control", "private, no-store");
  res.headers.set("X-Robots-Tag", "noindex, noarchive");
  return res;
}

export const config = {
  matcher: ["/", "/admin/:path*"],
};
