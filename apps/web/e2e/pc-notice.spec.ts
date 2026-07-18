/* 원장 PC 공지: 실 발행 → 서버 수신자 수 + 최근 공지 목록(서버 정본) (#25 실연결 검증) */
import { test, expect } from "@playwright/test";

test("PC 공지 — 발송하면 서버 발행 + 읽음 추적 목록에 수신·미열람 표시", async ({ page }) => {
  await page.goto("/pc/notice");
  // READY 판별 — 실 데이터 목록 헤더
  await expect(page.getByText("최근 공지 · 읽음 추적 (실 데이터)")).toBeVisible({ timeout: 20_000 });

  const title = `E2E 공지 ${Date.now() % 100000}`;
  await page.getByPlaceholder("제목 — 예: 11월 휴무 안내").fill(title);
  await page.getByRole("button", { name: /보호자에게 보내기/ }).click();
  // 확인 모달 — READY 에선 "수신자 수는 서버가 산정" 문구
  await expect(page.getByText("수신자 수는 서버가 산정해요")).toBeVisible();
  await page.getByRole("button", { name: "발송", exact: true }).click();

  // 서버 발행 결과 — seed 보호자 1명(박서연)
  await expect(page.getByText("발송 완료 · 수신 보호자 1명")).toBeVisible({ timeout: 10_000 });
  // 서버 목록에 방금 공지 + 미열람 1
  await expect(page.getByText(title)).toBeVisible();
  await expect(page.getByText("미열람 1명").first()).toBeVisible();
});
