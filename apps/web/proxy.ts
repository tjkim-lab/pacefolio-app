import { NextResponse, type NextRequest } from "next/server";

/* LCV1-P0-01·02 — 개인정보 화면의 웹 경계 (시나리오 1.4·1.5·3.6)
   현 단계(fixture mock)의 정직한 fail-closed:
   - 프로덕션에서 역할 화면(/parent 등)은 렌더링 자체를 차단(404) —
     mock 이라도 "인증 경계 없는 개인정보 UI"를 배포하지 않는다.
     실 세션 검사(쿠키 → API 검증)는 UI-API 통합(Gate 2) 때 이 지점에 추가.
   Next 16: middleware → proxy 파일 컨벤션.
   - 모든 환경에서 개인정보 라우트 응답에 no-store + noindex 헤더 —
     robots.txt 는 접근통제가 아니므로 응답 헤더로 강제(색인·캐시·BFCache). */

const PRIVATE_PREFIXES = ["/parent", "/coach", "/owner", "/pc", "/admin", "/select"];

/* E 리뷰 P0-4: 쿠키 존재가 아니라 세션 정본(역할·멤버십)으로 라우트 보호.
   /select 는 세션만 있으면 통과(역할 선택 전 단계). */
const ROUTE_ROLES: Record<string, readonly string[]> = {
  "/parent": ["GUARDIAN"],
  "/coach": ["COACH"],
  "/owner": ["OWNER", "MANAGER"],
  "/pc": ["OWNER", "MANAGER", "DESK"],
  "/admin": ["PLATFORM_ADMIN"],
};

export async function proxy(req: NextRequest) {
  const isPrivate = PRIVATE_PREFIXES.some((p) => req.nextUrl.pathname.startsWith(p));
  if (!isPrivate) return NextResponse.next();

  // 프로덕션 = 404 (mock 단계. 검토 프리뷰는 데모 라우트 플래그와 동일한 빌드 플래그)
  if (process.env.NODE_ENV === "production" &&
      process.env.NEXT_PUBLIC_PACEFOLIO_PG_SIMULATION !== "1") {
    return new NextResponse(null, { status: 404 });
  }

  /* Gate 2 (LCV1 1.4) + E 리뷰 P0-4: NEXT_PUBLIC_PACEFOLIO_REQUIRE_SESSION=1 이면
     ① 쿠키 부재 → 로그인 유도 ② API /sessions/me 로 세션 정본 확인(만료·폐기 401 잡음)
     ③ 라우트별 역할 검증(ACTIVE 멤버십의 roles) — 불일치·판정 불가는 404 fail-closed. */
  if (process.env.NEXT_PUBLIC_PACEFOLIO_REQUIRE_SESSION === "1") {
    const session = req.cookies.get("pf_session");
    if (!session) {
      const url = req.nextUrl.clone();
      url.pathname = "/stage/gate2";
      url.search = "?login=required";
      return NextResponse.redirect(url);
    }
    const required = ROUTE_ROLES[
      PRIVATE_PREFIXES.find((p) => req.nextUrl.pathname.startsWith(p)) ?? ""
    ];
    try {
      const apiOrigin = process.env.PACEFOLIO_API_ORIGIN ?? "http://localhost:3001";
      const me = await fetch(`${apiOrigin}/sessions/me`, {
        headers: { cookie: `pf_session=${session.value}` },
        signal: AbortSignal.timeout(2000),
      });
      if (me.status === 401) {
        const url = req.nextUrl.clone();
        url.pathname = "/stage/gate2";
        url.search = "?login=required";
        return NextResponse.redirect(url);
      }
      if (!me.ok) return new NextResponse(null, { status: 404 }); // 판정 불가 = fail-closed
      if (required) {
        const body = (await me.json()) as {
          memberships?: { roles: string[]; status: string }[];
        };
        const allowed = (body.memberships ?? []).some(
          (m) => m.status === "ACTIVE" && m.roles.some((r) => required.includes(r)),
        );
        if (!allowed) return new NextResponse(null, { status: 404 }); // 역할 불일치 — 표면 은닉
      }
    } catch {
      return new NextResponse(null, { status: 404 }); // API 불통 — 개인정보 화면은 fail-closed
    }
  }

  const res = NextResponse.next();
  res.headers.set("Cache-Control", "private, no-store"); // 뒤로가기·공유 캐시 방지
  res.headers.set("X-Robots-Tag", "noindex, noarchive"); // 색인·캐시 차단(헤더 강제)
  return res;
}

export const config = {
  matcher: ["/parent/:path*", "/coach/:path*", "/owner/:path*", "/pc/:path*", "/admin/:path*", "/select"],
};
