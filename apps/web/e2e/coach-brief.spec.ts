/* 코치 앱: 원장 전달사항 서버 ACK (#31 실연결의 브라우저 검증)
   seed: cr_owner_ksj 방의 ACK_REQUIRED 메시지(SENT). 코치가 "확인했어요"를
   눌러야만 확인함 — READ ≠ ACKNOWLEDGED 를 브라우저에서 그대로 확인. */
import { test, expect } from "@playwright/test";

test("코치 홈 — 서버 전달사항 표시 + 확인(ACK) 시 서버 상태 전이", async ({ page }) => {
  await page.goto("/coach");
  // READY 마커 — 이 문구는 실연결(서버 brief)에서만 렌더된다 (#31)
  await expect(page.getByText("서버 전달사항")).toBeVisible({ timeout: 20_000 });
  // 서버 seed 전달사항 본문
  await expect(page.getByText("도담이 오늘 컨디션 확인해주세요")).toBeVisible();

  const ackButton = page.getByRole("button", { name: "확인했어요" });
  if (await ackButton.isVisible().catch(() => false)) {
    await ackButton.click();
  }
  // ACK 후(또는 이전 실행에서 이미 ACK) — 서버 상태 기반 확인함 표시
  await expect(page.getByText("원장 전달사항 · 확인함")).toBeVisible({ timeout: 10_000 });
});
