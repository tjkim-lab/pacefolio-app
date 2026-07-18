/* 원장 채팅: 서버 방 목록 → 방 진입 → 메시지 전송 (#39-② 브라우저 검증) */
import { test, expect } from "@playwright/test";

test("원장 소통 — 서버 방 목록에서 코치 DM 진입, 메시지 전송이 서버에 저장", async ({ page }) => {
  await page.goto("/owner/chat");
  await expect(page.getByText("코치 (실 데이터)")).toBeVisible({ timeout: 20_000 });
  // seed: 김선재 1:1 방
  await page.getByText("김선재 1:1").first().click();
  await expect(page.getByText("(실 데이터)").first()).toBeVisible({ timeout: 10_000 });
  // seed 전달사항 본문(서버 메시지)
  await expect(page.getByText("도담이 오늘 컨디션 확인해주세요")).toBeVisible();
  // 전송 → 내 버블 표시(서버 저장 후 재조회)
  const text = `E2E 확인 ${Date.now() % 100000}`;
  await page.getByPlaceholder("메시지 입력 — 서버에 저장돼요").fill(text);
  await page.getByRole("button", { name: "전송" }).click();
  await expect(page.getByText(text)).toBeVisible({ timeout: 10_000 });
});
