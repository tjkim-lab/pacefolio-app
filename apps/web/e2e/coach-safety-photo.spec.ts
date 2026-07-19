/* 코치 수업 모드: 안전사고 서버 기록(#32) + 사진 동의 게이트(#19) 브라우저 검증.
   여정: 출석(모두 출석→임시 저장) → 활동 단계에서 ⚠ 기록(서버 incidents 저장,
   발생 시각 = 서버) → 활동 완료 → 코치 한마디 단계의 사진 확인(반 공유 =
   서준 미동의 → 서버 차단 명단이 화면에 그대로). */
import { test, expect } from "@playwright/test";

test("코치 수업 모드 — 안전사고 서버 기록 + 사진 동의 서버 차단 명단", async ({ page }) => {
  await page.goto("/coach");
  await expect(page.getByText("서버 전달사항")).toBeVisible({ timeout: 20_000 }); // READY 마커

  // 오늘의 수업 시작(캐러셀 첫 카드)
  await page.getByRole("button", { name: /수업 시작|수업 계속하기|완료됨 · 결과 보기/ }).first().click();
  await expect(page.getByText("① 출석 체크")).toBeVisible();

  // 출석 전원 처리 → 임시 저장 → 활동 단계 자동 진입
  await page.getByRole("button", { name: "안 누른 아이 모두 출석 ⚡" }).click();
  const save = page.getByRole("button", { name: /출석 임시 저장/ });
  if (await save.isVisible().catch(() => false)) await save.click();
  await expect(page.getByText("② 활동 체크 · 기록")).toBeVisible({ timeout: 10_000 });

  // 안전사고 기록 — 서버 정본(발생 시각 서버 기록·원장 알림·감사)
  await page.getByRole("button", { name: "⚠ 기록" }).click();
  await expect(page.getByText("특이사항·안전사고 기록 ⚠")).toBeVisible();
  await page.locator("select").selectOption({ index: 1 }); // 서버 roster 첫 원생
  await page.getByPlaceholder("언제·어디서·어떻게 일어났는지").fill("매트 착지 중 발목 접질림 — E2E 검증 기록");
  await page.getByRole("button", { name: "기록하고 원장에게 알리기" }).click();
  /* READY 경로는 서버 저장 성공시에만 saveInc(시트 닫힘+최종 토스트)로 진행 —
     실패면 시트가 열린 채 오류 토스트. 성공 판정 = 시트 닫힘 + 저장 토스트. */
  await expect(page.getByText(/안전 기록 저장 — 원장 즉시 공유/)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("특이사항·안전사고 기록 ⚠")).toBeHidden();

  // 활동 전부 완료 → 코치 한마디 단계
  const todo = page.getByRole("button", { name: "완료", exact: true });
  while ((await todo.count()) > 0) await todo.first().click();
  await page.getByRole("button", { name: "다음 — 코치 한마디" }).click();
  await expect(page.getByText("③ 코치 한마디")).toBeVisible();

  // 사진 동의 게이트 — 기본 범위에서 서버 판정 문구(통과 또는 차단 명단) 확인
  await page.getByRole("button", { name: "사진 확인" }).click();
  await expect(
    page.getByText(/서버 동의 게이트 통과 ✓|동의 없는 원생 \d+명/),
  ).toBeVisible({ timeout: 10_000 });
});
