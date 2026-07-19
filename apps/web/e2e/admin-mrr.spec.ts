/* Admin 구독: 플랜 변경 → MRR 즉시 반영 (#27~28 실연결의 브라우저 검증)
   재실행 내성: 현재 플랜을 읽고 반대 플랜으로 전환해 기대 MRR 검증.
   B5(#54): admin 은 분리 배포(apps/console-admin :3002) — 절대 URL 로 진입. */
import { test, expect } from "@playwright/test";

test("Admin 수익 — 원더짐 플랜 전환 시 MRR 이 서버 기준으로 갱신", async ({ page }) => {
  await page.goto("http://localhost:3002/admin/billing");
  await expect(page.getByText("우리 수익의 정본")).toBeVisible({ timeout: 20_000 });

  const row = page.getByRole("row", { name: /원더짐/ });
  const proActive = await row.getByRole("button", { name: "PRO" })
    .evaluate((el) => el.className.includes("text-white")).catch(() => false);

  if (proActive) {
    await row.getByRole("button", { name: "BASIC" }).click();
    await expect(page.getByText("29,000원").first()).toBeVisible({ timeout: 10_000 });
  } else {
    await row.getByRole("button", { name: "PRO" }).click();
    await expect(page.getByText("99,000원").first()).toBeVisible({ timeout: 10_000 });
  }
});
