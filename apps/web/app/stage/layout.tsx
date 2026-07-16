import type { ReactNode } from "react";
import { guardDevOnlyRoute } from "@/lib/devRouteGuard";

/* 라이브 스테이지(+/stage/live) — 프로덕션 빌드 비활성(docs/10 route guard).
   서버 컴포넌트 layout이라 하위 세그먼트(/stage/live)까지 한 번에 가드. */
export default function StageLayout({ children }: { children: ReactNode }) {
  guardDevOnlyRoute();
  return children;
}
