/* 원장 모바일 홈(#48) — "오늘 처리할 일"이 서버 정본(#45 엔드포인트 재사용).
   seed: 긴급결석 통보(도담)·공지 미열람 1명(박서연)·미납 2건. 홈 금액 비노출 검증 포함. */
import { test, expect } from "@playwright/test";

test("원장 모바일 홈 — 서버 처리할 일: 긴급결석 확인 + 미납 리마인드(금액 비노출)", async ({ page }) => {
  await page.goto("/owner");
  await expect(page.getByText("오늘 처리할 일").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("실 데이터").first()).toBeVisible({ timeout: 20_000 });

  // seed 3종 카드 — 서버 산정
  await expect(page.getByText("긴급결석 — 김도담")).toBeVisible();
  await expect(page.getByText("공지 미열람 보호자 1명")).toBeVisible();
  await expect(page.getByText("수강료 미납 2건")).toBeVisible();
  // 홈 금액 비노출(헌법) — 수납 스트립·미납 카드에 ₩ 미표시
  await expect(page.getByText(/₩/)).toHaveCount(0);

  // 긴급결석 원장 확인 → 서버 멱등 확인 + 보호자 '확인했어요' 인앱 회신
  await page.getByRole("button", { name: "확인", exact: true }).click();
  await expect(page.getByText(/원장 확인 완료 — 학부모에게 '확인했어요' 알림 전달/)).toBeVisible({ timeout: 10_000 });

  // 미납 리마인드 — 결제 권한 보호자만 · 결과 문구도 "결제 완료 아님" 명시
  await page.getByRole("button", { name: "리마인드", exact: true }).click();
  await expect(page.getByText("미납 리마인드")).toBeVisible();
  await page.getByRole("button", { name: "리마인드 발송", exact: true }).click();
  await expect(page.getByText(/리마인드 발송 완료 — 미납 \d+건 · 보호자 1명/)).toBeVisible({ timeout: 10_000 });
});
