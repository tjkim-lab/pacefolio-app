/* 양방향 채팅(#46): 학부모 학원 1:1(GUARDIAN_DM) 발신 → 원장 수신·답장 →
   학부모 답장 수신 + "읽음"(원장 열람 = 서버 read) 왕복 검증.
   세션 전환은 각 앱의 dev 로그인 자동 감지(박서연 ↔ 김도윤)를 그대로 쓴다. */
import { test, expect } from "@playwright/test";

test("학부모 발신 → 원장 답장 → 학부모 읽음 확인 왕복", async ({ page }) => {
  // 1) 학부모 — 도담 학원 1:1 열기(find-or-create) → 메시지 발신
  await page.goto("/parent/chat");
  await expect(page.getByText("학원 1:1 문의 · 실 대화")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: /김도담/ }).first().click();
  await expect(page.getByLabel("학원 1:1 메시지 입력")).toBeVisible({ timeout: 10_000 });
  const msg = `도담이 내일 준비물 있나요 ${Date.now() % 100000}`;
  await page.getByLabel("학원 1:1 메시지 입력").fill(msg);
  await page.getByLabel("보내기").click();
  await expect(page.getByText(msg)).toBeVisible({ timeout: 10_000 });

  // 2) 원장 — 보호자 방 목록에 뜨고, 메시지 수신(열람=read 기록) + 답장
  await page.goto("/owner/chat");
  await expect(page.getByText("학부모 1:1 — 원생 기준으로 열려요 (실 데이터)")).toBeVisible({ timeout: 20_000 });
  await page.getByText("김도담 보호자 1:1").first().click();
  await expect(page.getByText(msg)).toBeVisible({ timeout: 10_000 });
  const reply = `네 어머님, 실내화만 챙겨주세요 ${Date.now() % 100000}`;
  await page.getByPlaceholder("메시지 입력 — 서버에 저장돼요").fill(reply);
  await page.getByRole("button", { name: "전송", exact: true }).click();
  await expect(page.getByText(reply)).toBeVisible({ timeout: 10_000 });

  // 3) 학부모 재진입 — 답장 수신 + 내 메시지가 "읽음"(원장 열람 반영)
  await page.goto("/parent/chat");
  await expect(page.getByText("학원 1:1 문의 · 실 대화")).toBeVisible({ timeout: 20_000 });
  await page.getByText("김도담 보호자 1:1").first().click();
  await expect(page.getByText(reply)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("읽음").first()).toBeVisible();
});
