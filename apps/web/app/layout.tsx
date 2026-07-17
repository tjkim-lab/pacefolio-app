import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PACEFOLIO",
  // LCV1-P0-02: 프로토타입 전체 noindex(개인정보 화면 색인 방지 —
  // 마케팅 랜딩은 별도 파일). 응답 헤더 강제는 middleware.ts.
  robots: { index: false, follow: false, noarchive: true },
  description: "유소년 스포츠·교육 아카데미 운영 플랫폼",
  manifest: "/manifest.json",
  applicationName: "PACEFOLIO",
  appleWebApp: { capable: true, title: "PACEFOLIO", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#12b5a5",
  width: "device-width",
  initialScale: 1,
  // 접근성(리뷰 P0): 저시력 사용자 화면 확대 허용 — maximumScale/userScalable 제거
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" className="h-full">
      <head>
        {/* Pretendard — 목업과 동일한 웹폰트 (프로토타입: CDN) */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css"
        />
      </head>
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
