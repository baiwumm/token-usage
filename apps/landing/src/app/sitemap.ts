// sitemap.xml（构建期静态生成）：本站只有一个 URL。lastModified 取快照的
// 数据窗口右端而非构建时间——部署没同步到新数据时，时间戳不会被无意义地刷
// 新，搜索引擎看到的「最后实质更新」才可信。

import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/seo";
import { SNAPSHOT } from "@/lib/snapshot";

// 静态导出下元数据路由必须显式声明 force-static。
export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${SITE_URL}/`,
      lastModified: SNAPSHOT.fetchedAt,
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
