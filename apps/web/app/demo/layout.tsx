import type { ReactNode } from "react";
import { guardDevOnlyRoute } from "@/lib/devRouteGuard";

/* 개발·검토 전용 허브 — 프로덕션 빌드 비활성(docs/10 route guard). */
export default function DemoLayout({ children }: { children: ReactNode }) {
  guardDevOnlyRoute();
  return children;
}
