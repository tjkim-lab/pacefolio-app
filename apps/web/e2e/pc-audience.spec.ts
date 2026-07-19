/* AudienceFilter 2단계(#44): 원생 화면 = 서버 공용 리졸버 정본 + CSV 반출,
   대회 = 같은 필터로 대상 산정 → 공지 엔진 재사용 발송 (seed: 도담·서준·박서연) */
import { test, expect } from "@playwright/test";

test("PC 원생 — 서버 필터 정본: 반·요일 축 필터링 + CSV 반출 감사", async ({ page }) => {
  await page.goto("/pc/students");
  await expect(page.getByText("실 데이터 · AudienceFilter 서버 정본")).toBeVisible({ timeout: 20_000 });

  /* 반(플레이2 월수반=도담·서준)으로 고정 — 같은 학원에 다른 e2e(보호자 온보딩)가
     TRIAL 원생을 추가 등록해도 이 반의 배정 인원은 결정적. VERIFIED 보호자 1(박서연). */
  await page.getByRole("button", { name: "플레이2 월수반", exact: true }).click();
  await expect(page.getByText("필터 결과 2명 · 보호자 수신 1명")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("김도담")).toBeVisible();

  // + 요일 토(6): 월수반이라 교집합 = 0명
  await page.getByRole("button", { name: "토", exact: true }).click();
  await expect(page.getByText("필터 결과 0명 · 보호자 수신 0명")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("해당 조건의 원생이 없어요")).toBeVisible();

  // 토 해제 + 재원 축: 반 ∩ 재원 = 2명 (도담·서준 ENROLLED)
  await page.getByRole("button", { name: "토", exact: true }).click();
  await page.getByRole("button", { name: "재원", exact: true }).click();
  await expect(page.getByText("필터 결과 2명 · 보호자 수신 1명")).toBeVisible({ timeout: 10_000 });

  // CSV — 다운로드 + 서버 감사 기록(toast 로 확인)
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV 내보내기", exact: true }).click();
  await expect(page.getByText("CSV 2명 내려받음 — 반출 감사 기록됨")).toBeVisible({ timeout: 10_000 });
  expect((await download).suggestedFilename()).toMatch(/^pacefolio-audience-.*\.csv$/);
});

test("PC 대회 — 공용 필터로 대상 산정 → 동의 안내가 공지 엔진으로 실발송", async ({ page }) => {
  await page.goto("/pc/competitions");
  await expect(page.getByText("참가 대상 선정")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("대상 2명", { exact: false })).toBeVisible({ timeout: 10_000 });

  await page.getByRole("button", { name: "참가 동의 안내 발송", exact: true }).click();
  await expect(page.getByText("수신 보호자", { exact: true })).toBeVisible(); // 확인 모달 — 서버 산정 수
  await page.getByRole("button", { name: "동의 안내 발송", exact: true }).click();
  await expect(page.getByText("보호자 1명에게 발송했어요")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: "발송 완료 — 읽음은 공지 목록에서" })).toBeDisabled();
});
