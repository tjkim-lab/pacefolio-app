import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PACEFOLIO",
  description: "유소년 스포츠·교육 아카데미 운영 플랫폼",
  manifest: "/manifest.json",
  applicationName: "PACEFOLIO",
  appleWebApp: { capable: true, title: "PACEFOLIO", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#12b5a5",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
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
