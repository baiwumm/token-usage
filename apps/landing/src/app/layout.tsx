import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { RootProvider } from "fumadocs-ui/provider/next";

import "@/styles/globals.css";

import { UI_TRANSLATIONS } from "@/lib/fumadocs-i18n";
import {
  SITE_DESCRIPTION,
  SITE_KEYWORDS,
  SITE_NAME,
  SITE_TITLE,
  SITE_URL,
} from "@/lib/seo";

// 全站 SEO 基座只在这一处：首页 metadata 与全站 title 模板（`%s · Token
// Usage`）。og:image / twitter:image 由 `app/opengraph-image.tsx` 文件约定
// 自动注入，所以这里不写 images（手写会覆盖文件约定）。/docs 各页由
// docs/[[...slug]]/page.tsx 的 generateMetadata 覆盖标题与 canonical。
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

// 首访遮罩的内联脚本（body 第一个元素，解析到即执行，先于正文首绘）：
// 1. sessionStorage 门控——本会话首次访问才加 `.boot-veil-on` 显示遮罩；
//    复访**什么都不做**（基础规则 visibility:hidden 已使其不可见，零闪现；
//    也不能 remove 节点——那会让水合出现结构性缺失，React 19 会报错并
//    把节点插回来）；storage 被禁（隐私模式等）时 try/catch 放行为无遮罩；
// 2. DOMContentLoaded 淡出（+150ms 让遮罩完成一次可见驻留），3s 由
//    `.boot-veil-on` 自带的 CSS 兜底动画强制隐藏（见 globals.css）。
// 遮罩 div 上要加 suppressHydrationWarning：脚本在水合前改 className，
// React 19 水合默认会把 className 修回服务端值、抹掉状态类（实测踩过），
// 该豁免让 React 不碰这个元素的属性（同 next-themes 对 <html> 的做法）。
const BOOT_VEIL_SCRIPT = `(function(){var v=document.getElementById("boot-veil");if(!v)return;var first=false;try{first=!sessionStorage.getItem("token-usage-boot-veil");if(first)sessionStorage.setItem("token-usage-boot-veil","1")}catch(e){first=true}if(!first)return;v.classList.add("boot-veil-on");var done=function(){v.classList.add("boot-veil-done")};if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",function(){setTimeout(done,150)})}else{setTimeout(done,150)}setTimeout(done,3000)})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  // 暗色单主题（2026-11-08 拍板）：class 写死在 html 上。文档区的 fumadocs
  // RootProvider 也要 forcedTheme dark（组件内部 useTheme 恒读 dark），搜索
  // 索引走 staticClient 拉构建期固化的 out/api/search——本站无服务端运行时。
  return (
    // suppressHydrationWarning：next-themes（经 RootProvider）水合时会改
    // <html> 的 class / color-scheme 内联样式，需要豁免这条属性差异
    //（同 better-admin/apps/website 的做法）。
    <html suppressHydrationWarning className="dark" lang="zh-CN">
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <div
          suppressHydrationWarning
          aria-hidden="true"
          className="boot-veil fixed inset-0 z-[100] flex flex-col items-center justify-center gap-3 bg-background"
          id="boot-veil"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt=""
            className="size-10 animate-pulse rounded-xl motion-reduce:animate-none"
            height={40}
            src="/logo-dark.svg"
            width={40}
          />
          <p className="text-muted-foreground text-xs tracking-[0.25em]">
            TOKEN USAGE
          </p>
        </div>
        <script dangerouslySetInnerHTML={{ __html: BOOT_VEIL_SCRIPT }} />
        <RootProvider
          i18n={{ locale: "zh-CN", translations: UI_TRANSLATIONS }}
          search={{ options: { type: "static", api: "/api/search" } }}
          theme={{
            attribute: "class",
            defaultTheme: "dark",
            enableSystem: false,
            forcedTheme: "dark",
          }}
        >
          {children}
        </RootProvider>
      </body>
    </html>
  );
}
