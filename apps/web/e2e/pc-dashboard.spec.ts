/* PC 원장 대시보드(#45·#49) — READY = 서버 정본: KPI·반별 정원·공지 재알림 왕복.
   긴급결석 확인·미납 리마인드 왕복은 owner-home.spec(모바일)이 같은 엔드포인트로 검증 —
   여기선 중복 소비하지 않는다(직렬 실행·상태 공유 전제, playwright.config 참조). */
import { test, expect } from "@playwright/test";

test("PC 대시보드 — 서버 KPI·반별 정원(재원/정원·코치)·공지 재알림 왕복", async ({ page }) => {
  await page.goto("/pc");
  await expect(page.getByText("서버 실데이터 · 실시간")).toBeVisible({ timeout: 20_000 });

  // KPI = 서버 집계(#45)
  await expect(page.getByText("수납 현황 (LIVE)")).toBeVisible();

  // 반별 정원(#49) — ACTIVE 등록 집계(도담·서준=2) + 담당 코치 이름 = 서버 정본
  await expect(page.getByText("반별 정원 현황")).toBeVisible();
  await expect(page.getByText("서버 정본")).toBeVisible();
  await expect(page.getByText("재원 2 / 정원 12")).toBeVisible();
  await expect(page.getByText("김선재")).toBeVisible();

  // 미납 카드 — 리마인드를 보내도 미납 상태는 유지되므로 상시 표시(입금 시에만 소멸)
  await expect(page.getByText(/수강료 미납 \d+건/)).toBeVisible();

  // 공지 재알림 — seed 공지(박서연 미열람·재알림은 읽음 처리 아님 → 재실행에도 0/1 유지)
  const row = page.locator("div.flex.gap-3").filter({ hasText: "가을 대회 참가 안내" });
  await row.getByRole("button", { name: "다시 알림" }).click();
  await expect(page.getByText("안 읽은 보호자에게만 다시 보냅니다.")).toBeVisible();
  await page.getByRole("button", { name: "1명에게 다시 알림" }).click();
  await expect(page.getByText("재알림 발송 완료 — 안 읽은 보호자 1명")).toBeVisible({ timeout: 10_000 });
  // 카드 완료 상태 — 서버 성공 후에만 표시
  await expect(page.getByText("재알림 발송 완료 · 추적 중")).toBeVisible();
});
