import { notFound } from "next/navigation";

/**
 * 개발·검토 전용 라우트(`/demo`·`/stage`) 가드.
 *
 * 계약: docs/10-auth-route-guard.md — "`/demo`·`/stage` 는 개발·검토 전용,
 * 프로덕션 빌드에서 비활성(env guard)".
 *
 * 기본: 프로덕션(`NODE_ENV === "production"`)에서 404.
 * 예외: 호스팅된 검토 프리뷰가 필요하면 `PACEFOLIO_ENABLE_DEMO_ROUTES=1`
 *       환경변수로 명시 허용(서버 전용 값 — 클라이언트에 노출하지 않음).
 *
 * 주의: `/demo`·`/stage`는 정적 프리렌더 라우트라 이 판정이 **빌드 시점**에
 *       확정된다 → 예외 플래그는 런타임(`next start`)이 아니라 **빌드 시점**
 *       (`next build`)에 설정해야 반영된다(프리뷰 배포의 build-time env).
 */
export function guardDevOnlyRoute(): void {
  const isProd = process.env.NODE_ENV === "production";
  const explicitlyEnabled =
    process.env.PACEFOLIO_ENABLE_DEMO_ROUTES === "1";
  if (isProd && !explicitlyEnabled) {
    notFound();
  }
}
