/* 그룹(반) 일괄 발송(#41 브라우저 검증) — 서버 반 정본으로 초안 전수 생성(검토)
   → 일괄 ISSUED(확정·발송). 기존 청구 보유 원생 자동 제외·멱등은 API 테스트가 검증. */
import { test, expect } from "@playwright/test";

test("PC 수납 — 반 일괄: 초안 전수 생성(검토) → 일괄 발행(확정·발송)", async ({ page }) => {
  await page.goto("/pc/payments");
  await expect(page.getByText("실 데이터").first()).toBeVisible({ timeout: 20_000 }); // READY

  // 서버 반 행(플레이2 월수반) — 명단 검토 = bulk 초안 생성
  await page.getByRole("button", { name: "명단 검토" }).click();
  await expect(page.getByText(/초안 \d+건 생성/)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("REVIEWED")).toBeVisible();

  // 확정·발송 = 일괄 ISSUED(서버 감사·알림 이벤트)
  await page.getByRole("button", { name: "확정·발송" }).click();
  await expect(page.getByText("청구를 확정·발송할까요?")).toBeVisible();
  await page.getByRole("button", { name: "확정하고 발송 (SENT)", exact: true }).click();
  await expect(page.getByText(/청구서 \d+건 발행/)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: "재알림" })).toBeVisible();
});
