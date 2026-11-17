// robots.txt（构建期静态生成，取代旧的 public/robots.txt —— 同路径只能有
// 一个来源）。公开页 /u/ 在 apps/web，与本站无关；本站除 /api/ 外全站放行。

import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/seo";

// 静态导出下元数据路由必须显式声明 force-static，否则构建期报「未配置
// dynamic / revalidate」。
export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    // /api/search 是构建期固化的静态搜索索引（JSON），对页面收录没有价值，
    // 挡掉可以少浪费抓取预算；站内搜索请求不受 robots 影响。
    rules: [{ userAgent: "*", allow: "/", disallow: "/api/" }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    // Host 指令要裸主机名，不能带协议（Yandex 规范）；`https://…` 会被忽略。
    host: new URL(SITE_URL).host,
  };
}
