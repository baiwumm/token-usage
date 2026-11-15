// robots.txt：本域是私有仪表盘，默认不收录。
//
// - 仪表盘各页在 proxy 里要求登录（`apps/web/src/proxy.ts`），搜索引擎抓到
//   的只是 /login 的重定向，没有可收录内容；公开页 `/u/<token>` 自身已是
//   noindex（docs/badge.md §6，保持不收录），这里一并挡掉爬取。
// - 显式放行 `/login`（唯一的公开页面）与 `/opengraph-image`（社交卡）：robots
//   按最长路径匹配，放行规则必须比 `Disallow: /` 更具体才生效。
// - 不产出 sitemap：没有任何应当被收录的 URL，空 sitemap 只会误导抓取预算。

import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/login", "/opengraph-image"],
        disallow: [
          "/",
          "/api/",
          "/auth/",
          "/device",
          "/sessions",
          "/projects",
          "/sync-runs",
          "/settings",
          "/wrapped",
          "/achievements",
          "/u/",
        ],
      },
    ],
  };
}
