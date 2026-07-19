/* Playwright 핵심 E2E (#34 — E 리뷰 §7)
   서버 2개 자동 기동: API(:3001 PGlite dev seed) + web(:3000 rewrite proxy).
   PGlite 는 단일 커넥션 — workers 1 로 직렬 실행(테스트 간 상태 공유 전제,
   각 spec 은 재실행에도 견디게 상태 무관 작성). */
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "npx tsx src/index.ts",
      cwd: "../api",
      url: "http://localhost:3001/sessions/me", // 401 = 기동 완료 신호(Playwright 는 401 허용)
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: "npm run dev",
      url: "http://localhost:3000",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      /* 학부모 결제 E2E: mockpg 시뮬 플래그 — 브라우저가 PG 웹훅을 대행하는
         명시 게이트(parent/_live.tsx). 실 PG(Gate 3) 전환 시 이 env 와 함께 제거. */
      env: { NEXT_PUBLIC_PACEFOLIO_PG_SIMULATION: "1" },
    },
    /* B5(#54): admin 분리 배포 — admin e2e 는 :3002 절대 URL 로 진입 */
    {
      command: "npm run dev -w console-admin",
      cwd: "../..",
      url: "http://localhost:3002",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
