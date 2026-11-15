// robots.txt（构建期静态生成，取代旧的 public/robots.txt —— 同路径只能有
// 一个来源，公开页 /u/ 在 apps/web，与本站无关，因此这里是全站放行）。

import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/seo";

// 静态导出下元数据路由必须显式声明 force-static，否则构建期报「未配置
// dynamic / revalidate」。
export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/" }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
