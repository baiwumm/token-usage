import { BackToTop } from "@/components/landing/back-to-top";
import { DashboardPreview } from "@/components/landing/dashboard-preview";
import { Deploy } from "@/components/landing/deploy";
import { FeatureGrid } from "@/components/landing/feature-grid";
import { Hero } from "@/components/landing/hero";
import { NavBar } from "@/components/landing/nav-bar";
import { Ownership } from "@/components/landing/ownership";
import { SiteFooter } from "@/components/landing/site-footer";
import { TerminalSteps } from "@/components/landing/terminal-steps";
import { NPM_CLI_URL, REPO_URL } from "@/lib/repo-links";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/seo";

// 结构化数据（SoftwareApplication）：让搜索与聚合器拿到「是什么 / 免费 /
// 哪个仓库 / 怎么装」，与页面文案同源（标题与描述都取自 lib/seo.ts）。
const SOFTWARE_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: SITE_NAME,
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Web, Windows, macOS, Linux",
  description: SITE_DESCRIPTION,
  url: SITE_URL,
  downloadUrl: NPM_CLI_URL,
  sameAs: [REPO_URL],
  screenshot: `${SITE_URL}/dashboard/app-overview.png`,
  license: `${REPO_URL}/blob/main/LICENSE`,
  isAccessibleForFree: true,
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  featureList: [
    "Multi-device pairing with per-account aggregation",
    "Dashboard, sessions, projects, achievements and yearly wrapped",
    "Public SVG badge and login-free public usage page",
    "Self-hosted: every instance keeps its own Supabase data",
  ],
};

// 单页八段（2026-11-08 设计定稿）：导航 → Hero → 三步 terminal → 仪表盘
// 静态重绘 → 功能网格 → 数据自主 → 自部署 → Footer。
// 页面级 metadata 不在此声明：本站单页，标题/描述/社交卡/icon 全部由
// 根布局（app/layout.tsx + app/opengraph-image.tsx）统一提供。
export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <script
        dangerouslySetInnerHTML={{ __html: JSON.stringify(SOFTWARE_JSON_LD) }}
        type="application/ld+json"
      />
      <NavBar />
      <main className="flex-1">
        <Hero />
        <TerminalSteps />
        <DashboardPreview />
        <FeatureGrid />
        <Ownership />
        <Deploy />
      </main>
      <SiteFooter />
      <BackToTop />
    </div>
  );
}
