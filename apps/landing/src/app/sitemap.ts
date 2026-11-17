// sitemap.xml（构建期静态生成）：首页 + /docs 全部文档页。首页 lastModified
// 取快照的数据窗口右端而非构建时间——部署没同步到新数据时，时间戳不会被无意
// 义地刷新，搜索引擎看到的「最后实质更新」才可信。
// 文档页刻意不写 lastChanged：mdx 没有逐页日期，若统一盖成快照时间就是每天
// 谎报一次更新，Google 会逐步忽略该字段；宁可不给，也不给假信号。

import type { MetadataRoute } from "next";

import { docsPageUrl, SITE_URL } from "@/lib/seo";
import { source } from "@/lib/source";
import { SNAPSHOT } from "@/lib/snapshot";

// 静态导出下元数据路由必须显式声明 force-static。
export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const docPages: MetadataRoute.Sitemap = source.getPages().map((page) => ({
    url: docsPageUrl(page.slugs),
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
