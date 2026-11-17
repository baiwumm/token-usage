// 落地页 SEO 常量（单一来源）：根布局 metadata、sitemap、robots 与页内
// JSON-LD 都从这里取，避免标题/描述/关键词在多处漂移。
// 落地页是独立部署域（docs/requirements.md #19），规范域写死在此，并与
// metadataBase 保持一致（页脚落款只写品牌域，不带 www）。
//
// 规范主机名是 **www**：EdgeOne 的 `$host → $wwwhost` 会把 apex 301 到
// www（仓库根 edgeone.json），canonical / OG / sitemap / robots / JSON-LD
// 必须直接写 www，否则爬虫拿到的每条 URL 都要多跳一次 301。

import { NPM_CLI_URL, REPO_URL } from "@/lib/repo-links";

export const SITE_URL = "https://www.token-usage.cc";

/**
 * 文档页绝对 URL。`index.mdx` 的 slug 为空数组，拼接后是 `/docs//`——
 * canonical 与 sitemap 都必须落到 `/docs/`，不能出现双斜杠。
 */
export function docsPageUrl(slugs: string[]): string {
  return slugs.length > 0
    ? `${SITE_URL}/docs/${slugs.join("/")}/`
    : `${SITE_URL}/docs/`;
}

export const SITE_NAME = "Token Usage";

/** 首屏标题：品牌 + 一句话定位（搜索结果的主标题）。 */
export const SITE_TITLE = "Token Usage — 自托管的 AI token 用量追踪";

/** 社交卡片/摘要的长度目标 ≤ 120 字，Front Matter 之外的完整版在 Hero。 */
export const SITE_DESCRIPTION =
  "一个账号、多台设备，AI 用量与成本数据完全落在你自己的 Supabase 里。开源、可自部署，采集端只向配对实例上报，浏览器零直连数据表。";

export const SITE_KEYWORDS = [
  "AI token 用量",
  "token 统计",
  "AI 成本追踪",
  "Claude Code 用量",
  "Codex 用量",
  "Cursor 用量",
  "自托管",
  "Supabase",
  "开源",
  "self-hosted",
  "token usage tracker",
  "AI cost tracking",
];

/** 社交卡片：`app/opengraph-image.tsx` 生成的固定尺寸（也用于 TS 类型一致性）。 */
export const SITE_OG_IMAGE_SIZE = { width: 1200, height: 630 } as const;

/** 社交卡片的公开路径（文件约定生成，静态导出为 out/opengraph-image）。 */
export const SITE_OG_IMAGE_PATH = "/opengraph-image";

/** 社交卡片 alt：根布局自动注入与文档页手动覆盖共用，避免两处漂移。 */
export const SITE_OG_IMAGE_ALT =
  "Token Usage — self-hosted AI token usage tracking";

/** 站点实体图的稳定 @id：根布局注入一次，首页与文档页用 @id 引用。 */
export const SITE_ORGANIZATION_ID = `${SITE_URL}/#organization`;
export const SITE_WEBSITE_ID = `${SITE_URL}/#website`;

/**
 * 站点级实体（根布局每页注入）：让搜索引擎与 AI 把「Token Usage」认成同一个
 * 品牌实体，并知道官网、仓库、npm 三处是同一主体。首页的 SoftwareApplication
 * 与文档页的 TechArticle 只通过 @id 引用，不重复定义。
 */
export const SITE_ORGANIZATION_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": SITE_ORGANIZATION_ID,
  name: SITE_NAME,
  url: SITE_URL,
  logo: `${SITE_URL}/logo-dark.svg`,
  sameAs: [REPO_URL, NPM_CLI_URL],
} as const;

export const SITE_WEBSITE_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": SITE_WEBSITE_ID,
  name: SITE_NAME,
  url: SITE_URL,
  inLanguage: "zh-CN",
  publisher: { "@id": SITE_ORGANIZATION_ID },
} as const;
