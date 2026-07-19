/* 코치 수업 완료 여정(#25 completeSession 브라우저 검증) — coach-safety 뒤에 실행되도록
   파일명 유지(알파벳 순). 출석 전원 → 서버 저장 → 활동 완료 → 발송 전 검토 →
   서버 완료 확정(전원 출결 검증·멱등) → 리포트 발송 완료 화면. */
import { test, expect } from "@playwright/test";

test("코치 수업 완료 — 출결 서버 저장 → 서버 완료 확정 → 리포트 발송", async ({ page }) => {
  await page.goto("/coach");
  await expect(page.getByText("서버 전달사항")).toBeVisible({ timeout: 20_000 }); // READY 마커

  await page.getByRole("button", { name: /수업 시작|수업 계속하기|완료됨 · 결과 보기/ }).first().click();
  await expect(page.getByText("① 출석 체크")).toBeVisible();

  // 출석 전원 → 서버 저장(감사 이력) — 이미 저장돼 있으면 저장 버튼이 없을 수 있음
  await page.getByRole("button", { name: "안 누른 아이 모두 출석 ⚡" }).click();
  const save = page.getByRole("button", { name: /출석 임시 저장/ });
  if (await save.isVisible().catch(() => false)) await save.click();
  await expect(page.getByText("② 활동 체크 · 기록")).toBeVisible({ timeout: 10_000 });

  // 활동 전부 완료 → ③ 코치 한마디
  const todo = page.getByRole("button", { name: "완료", exact: true });
  while ((await todo.count()) > 0) await todo.first().click();
  await page.getByRole("button", { name: "다음 — 코치 한마디" }).click();
  await expect(page.getByText("③ 코치 한마디")).toBeVisible();

  // 사진 동의 게이트 — 서버 판정(통과 또는 차단 명단) 후에야 발송 검토가 열려요
  await page.getByRole("button", { name: "사진 확인" }).click();
  await expect(
    page.getByText(/서버 동의 게이트 통과 ✓|동의 없는 원생 \d+명/),
  ).toBeVisible({ timeout: 10_000 });

  // 발송 전 검토 → 확인하고 발송 — READY 는 서버 completeSession 통과 후에만 진행
  await page.getByRole("button", { name: "발송 전 검토" }).click();
  await expect(page.getByText("수업 리포트를 발송할까요?")).toBeVisible();
  await page.getByRole("button", { name: "확인하고 발송" }).click();
  await expect(page.getByText(/수업 완료 확정\(\w+\) — 전원 출결 검증 통과/)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("리포트 발송 완료 🎉")).toBeVisible({ timeout: 10_000 });
});
