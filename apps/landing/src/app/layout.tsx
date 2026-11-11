import type { Metadata } from "next";
import type { ReactNode } from "react";

import "@/styles/globals.css";

export const metadata: Metadata = {
  // 落地页独立部署域（docs/requirements.md #19）。
  metadataBase: new URL("https://token-usage.cc"),
};

export default function RootLayout({ children }: { children: ReactNode }) {
  // 暗色单主题（2026-11-08 拍板）：class 写死在 html 上，不引 next-themes。
  return (
    <html className="dark" lang="zh">
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
