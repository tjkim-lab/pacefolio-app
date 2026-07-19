/* 학부모 결제 여정 (Gate 2 완성형의 브라우저 검증)
   청구서 선택 → 결제 준비(서버 금액) → mockpg 웹훅 CAPTURED → 서버 재확인
   (Payment CAPTURED + 청구서 PAID) 후에만 "결제 확정" — 완료 위장 없음.
   PGlite 재기동 = seed 초기화라 CI 는 항상 미납 2건에서 시작.
   로컬 reuse 서버에선 이전 실행이 이미 결제했을 수 있어 상태 무관 작성. */
import { test, expect } from "@playwright/test";

test("학부모 청구서 — 선택 → 결제 → 서버 확정(PAID) 여정", async ({ page }) => {
  await page.goto("/parent/invoice");
  // LIVE_READY 마커 — 실 DB 청구서 헤더(fixture 는 "원생별 2건 · 합산")
  await expect(page.getByText(/실 DB \d+건/)).toBeVisible({ timeout: 20_000 });

  // 미납(payable) 청구서 전부 선택 — aria-checked=false 인 체크박스만
  const unchecked = page.locator('[role="checkbox"][aria-checked="false"]');
  const n = await unchecked.count();
  if (n === 0) {
    // 이전 실행에서 이미 완납(로컬 reuse) — 서버 정본 상태 확인으로 종료
    await expect(page.getByText("완납 ✓").first()).toBeVisible();
    return;
  }
  for (let i = 0; i < n; i++) await unchecked.nth(0).click(); // 클릭 시 목록에서 빠짐

  await page.getByRole("button", { name: "결제하러 가기" }).click();
  await expect(page).toHaveURL(/\/parent\/pay/);
  // 시뮬 경계 정직 표시 — PG 만 시뮬, 청구·정산은 실 서버
  await expect(page.getByText("결제대행(PG)만 시뮬 — 청구·정산은 실 서버")).toBeVisible();

  await page.getByRole("button", { name: /로 .*원 결제$/ }).click();
  // 완료 판정 = webhook APPLY + CAPTURED + PAID 서버 확인 후에만 이 화면
  await expect(page.getByText(/원 결제 확정/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/^pay_/)).toBeVisible(); // 서버 paymentId 표기

  // 청구서로 복귀 — 서버 정본이 PAID 로 바뀌었는지
  await page.getByRole("button", { name: "청구서에서 PAID 확인" }).click();
  await expect(page).toHaveURL(/\/parent\/invoice/);
  await expect(page.getByText("완납 ✓").first()).toBeVisible({ timeout: 10_000 });
  // 더 이상 선택 가능한 미납 없음
  await expect(page.locator('[role="checkbox"][aria-checked="false"]')).toHaveCount(0);
});
