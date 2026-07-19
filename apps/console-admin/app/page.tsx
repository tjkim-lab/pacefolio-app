import { redirect } from "next/navigation";

/* 경로 구조는 /admin/* 그대로 유지(내부 링크·이력 보존) — 루트는 진입만 넘긴다 */
export default function Root() {
  redirect("/admin");
}
