import type { Metadata, Viewport } from "next";
import "./globals.css";

/* B5(#54): 관제 콘솔 전용 루트 — 학원 앱과 분리 배포. 항상 noindex. */
export const metadata: Metadata = {
  title: "PACEFOLIO 관제",
  robots: { index: false, follow: false, noarchive: true },
  description: "PACEFOLIO 플랫폼 관제 콘솔 (내부 전용)",
};

export const viewport: Viewport = {
  themeColor: "#12b5a5",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}
