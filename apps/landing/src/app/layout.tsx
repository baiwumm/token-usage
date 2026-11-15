import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "@/styles/globals.css";

import {
  SITE_DESCRIPTION,
  SITE_KEYWORDS,
  SITE_NAME,
  SITE_TITLE,
  SITE_URL,
} from "@/lib/seo";

// 全站 SEO 只在这一处：本站单页，页面级 metadata 不再重复声明，避免标题 /
// 描述漂移。og:image / twitter:image 由 `app/opengraph-image.tsx` 文件约定
// 自动注入，所以这里不写 images（手写会覆盖文件约定）。
export const metadata: Metadata = {
  // 落地页独立部署域（docs/requirements.md #19）。
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: SITE_KEYWORDS,
  applicationName: SITE_NAME,
  authors: [{ name: SITE_NAME, url: SITE_URL }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  category: "technology",
  alternates: { canonical: "/" },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: "/",
    locale: "zh_CN",
    alternateLocale: ["en_US"],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  icons: {
    icon: [{ url: "/favicon.ico", sizes: "any" }],
    apple: "/logo-dark.svg",
  },
  formatDetection: { telephone: false, address: false, email: false },
};

export const viewport: Viewport = {
  // 暗色单主题：地址栏与浏览器 UI 跟随页面底色，不随系统明暗切换。
  themeColor: "#0a0a0b",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  // 暗色单主题（2026-11-08 拍板）：class 写死在 html 上，不引 next-themes。
  return (
    <html className="dark" lang="zh-CN">
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
