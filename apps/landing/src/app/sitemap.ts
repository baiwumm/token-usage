// sitemap.xml（构建期静态生成）：首页 + /docs 全部文档页。首页 lastModified
// 取快照的数据窗口右端而非构建时间——部署没同步到新数据时，时间戳不会被无意
// 义地刷新，搜索引擎看到的「最后实质更新」才可信；文档页跟随首页时间戳（真源
// docs/ 与本站构建同仓库同节奏，无需逐页伪造精确时间）。

import type { MetadataRoute } from "next";

import { docsPageUrl, SITE_URL } from "@/lib/seo";
import { source } from "@/lib/source";
import { SNAPSHOT } from "@/lib/snapshot";

// 静态导出下元数据路由必须显式声明 force-static。
export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const docPages: MetadataRoute.Sitemap = source.getPages().map((page) => ({
    url: docsPageUrl(page.slugs),
    lastModified: SNAPSHOT.fetchedAt,
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  return [
    {
      url: `${SITE_URL}/`,
      lastModified: SNAPSHOT.fetchedAt,
      changeFrequency: "weekly",
      priority: 1,
    },
    ...docPages,
  ];
}
