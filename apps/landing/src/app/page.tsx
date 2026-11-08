import type { Metadata } from "next";

import { DashboardPreview } from "@/components/landing/dashboard-preview";
import { Deploy } from "@/components/landing/deploy";
import { FeatureGrid } from "@/components/landing/feature-grid";
import { Hero } from "@/components/landing/hero";
import { NavBar } from "@/components/landing/nav-bar";
import { Ownership } from "@/components/landing/ownership";
import { SiteFooter } from "@/components/landing/site-footer";
import { TerminalSteps } from "@/components/landing/terminal-steps";
import { badgeSource } from "@/lib/badge-url";

export const metadata: Metadata = {
  title: "Token Usage — 自托管的 AI token 用量追踪",
  description:
    "一个邮箱、多台设备，用量与成本数据完全落在你自己的 Supabase 里。开源、可自部署，采集端只向配对实例上报。",
  openGraph: {
    title: "Token Usage — 自托管的 AI token 用量追踪",
    description:
      "一个邮箱、多台设备，用量与成本数据完全落在你自己的 Supabase 里。开源、可自部署。",
    url: "/",
    siteName: "Token Usage",
    locale: "zh_CN",
    type: "website",
  },
};

// 单页八段（2026-11-08 设计定稿）：导航 → Hero → 三步 terminal → 仪表盘
// 静态重绘 → 功能网格 → 数据自主 → 自部署 → Footer。
export default function HomePage() {
  // 公开页演示链接（README 解析，构建期固化）；解析失败则 Hero 隐藏该 CTA。
  const demoUrl = badgeSource()?.publicPageUrl ?? null;

  return (
    <div className="flex min-h-screen flex-col">
      <NavBar />
      <main className="flex-1">
        <Hero demoUrl={demoUrl} />
        <TerminalSteps />
        <DashboardPreview />
        <FeatureGrid />
        <Ownership />
        <Deploy />
      </main>
      <SiteFooter />
    </div>
  );
}
