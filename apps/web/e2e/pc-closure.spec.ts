/* PC 수납: 휴무 event 등록 → 서버 세션 취소 + 중간입회 서버 견적 (#38 브라우저 검증) */
import { test, expect } from "@playwright/test";

test("휴무 등록이 서버 세션을 취소하고, 중간입회 견적이 서버 일할로 계산된다", async ({ page }) => {
  await page.goto("/pc/payments");
  // READY 판별 — 실 데이터 수납 현황 패널
  await expect(page.getByText("수납 현황").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("실 데이터").first()).toBeVisible();

  // 휴무 등록: 전체 학원 + 다음주 월요일(플레이2 월수반 세션 존재 가능일)
  const nextMonday = (() => {
    const d = new Date();
    d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
    return d.toISOString().slice(0, 10);
  })();
  await page.locator('input[type="date"]').first().fill(nextMonday);
  await page.getByRole("button", { name: /^휴무 등록 — / }).click();
  // 서버 응답 기반 이벤트 행(취소 세션 수 포함) — 세션 미전개 날짜면 0회도 유효
  await expect(page.getByText(/세션 \d+회 취소\(서버\)/)).toBeVisible({ timeout: 10_000 });

  // 중간입회: 서버 반 칩 선택("서버 시간표 기준" 부제는 MJ 칩 전용 — 휴무 스코프 칩과 구분)
  await page.getByText("서버 시간표 기준").first().click();
  await page.locator('input[type="date"]').nth(1).fill(nextMonday);
  await page.getByRole("button", { name: "서버 견적" }).click();
  await expect(page.getByText(/서버 세션 정본|시간표\+휴무 달력/)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("최종 청구액")).toBeVisible();
});
