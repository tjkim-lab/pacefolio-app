/* 보호자 온보딩·가입 신규 흐름 E2E — 실 API 연결(슬라이스 A).
   모델: 초대코드로 학원 진입 → 휴대폰 본인인증(세션) → 약관 → 아이 직접 등록.
   LIVE: /api 도달 시 devLogin(박서연)→실 서버(초대코드 검증·인증세션·participant 생성).
   초대코드 WG2025 = 원더짐(seed) · OTP 123456(정상)/000000(오류) 스텁.
   docs/design/guardian-zem-benchmark.md §6 */
import { test, expect } from "@playwright/test";

test("보호자 온보딩 — 초대코드로 학원 진입 후 아이 1명 등록", async ({ page }) => {
  await page.goto("/onboarding?again=1");

  // O1 캐러셀
  await expect(page.getByText("오늘 어떤 경험을 했는지")).toBeVisible();
  await page.getByRole("button", { name: "건너뛰기" }).click();

  // O2 초대코드 → 학원 확인
  await page.getByLabel("학원 초대코드").fill("WG2025");
  await page.getByRole("button", { name: "학원 확인" }).click();
  await expect(page.getByText("원더짐 아카데미")).toBeVisible();
  await page.getByRole("button", { name: "네, 시작할게요" }).click();

  // O3 휴대폰 번호
  await page.getByPlaceholder("010-0000-0000").fill("01012345678");
  await page.getByRole("button", { name: "인증번호 받기" }).click();

  // O4 인증번호
  await page.getByLabel("인증번호 6자리").fill("123456");
  await page.getByRole("button", { name: "확인", exact: true }).click();

  // O5 약관
  await page.getByRole("button", { name: "약관 전체에 동의합니다" }).click();
  await page.getByRole("button", { name: "동의하고 계속하기" }).click();

  // O6 아이 등록(부모 직접 입력) — 검색·매칭 아님. 고유 이름으로 LIVE 왕복 검증
  const uniq = "온보딩실연결아이";
  await page.getByLabel("아이 1 이름").fill(uniq);
  await page.getByLabel("아이 1 생년월일").fill("2019-03-01");
  await page.getByRole("group", { name: "프로그램 선택" }).nth(0).getByRole("button", { name: /PLAY 2/ }).click();
  await page.getByRole("button", { name: "등록 완료" }).click();

  // O7 알림 권한 안내
  await expect(page.getByText("놓치지 않도록 알려드릴게요")).toBeVisible();
  await expect(page.getByRole("button", { name: "성장 알림 받기" })).toBeVisible();

  // LIVE 증명: 방금 등록한 아이가 실제 서버 my-children 에 떠야 한다(브라우저 세션으로 왕복)
  const res = await page.request.get("/api/academies/a_wondergym/my-children");
  expect(res.ok()).toBeTruthy();
  const body = await res.json() as { children: { name: string }[] };
  expect(body.children.some((c) => c.name === uniq)).toBeTruthy();
});

test("보호자 온보딩 — 잘못된 코드 오류 → 학원 찾기 → 형제 2명 등록", async ({ page }) => {
  await page.goto("/onboarding?again=1");
  await page.getByRole("button", { name: "건너뛰기" }).click();

  // 잘못된 코드 → 인라인 오류
  await page.getByLabel("학원 초대코드").fill("ZZZZ");
  await page.getByRole("button", { name: "학원 확인" }).click();
  await expect(page.getByText("초대코드를 확인할 수 없어요")).toBeVisible();

  // 학원 찾기 → 학원 선택
  await page.getByRole("button", { name: /학원 찾기/ }).click();
  await page.getByRole("button", { name: /원더짐 아카데미/ }).click();
  await page.getByRole("button", { name: "네, 시작할게요" }).click();

  // 인증·약관 통과
  await page.getByPlaceholder("010-0000-0000").fill("01099998888");
  await page.getByRole("button", { name: "인증번호 받기" }).click();
  await page.getByLabel("인증번호 6자리").fill("123456");
  await page.getByRole("button", { name: "확인", exact: true }).click();
  await page.getByRole("button", { name: "약관 전체에 동의합니다" }).click();
  await page.getByRole("button", { name: "동의하고 계속하기" }).click();

  // 형제 2명 등록
  await page.getByLabel("아이 1 이름").fill("도담");
  await page.getByLabel("아이 1 생년월일").fill("2019-03-01");
  await page.getByRole("group", { name: "프로그램 선택" }).nth(0).getByRole("button", { name: /PLAY 2/ }).click();

  await page.getByRole("button", { name: /아이 추가/ }).click();
  await page.getByLabel("아이 2 이름").fill("서준");
  await page.getByLabel("아이 2 생년월일").fill("2021-05-10");
  await page.getByRole("group", { name: "프로그램 선택" }).nth(1).getByRole("button", { name: /PLAY 1/ }).click();

  await page.getByRole("button", { name: "등록 완료" }).click();
  await expect(page.getByText("놓치지 않도록 알려드릴게요")).toBeVisible();
});
