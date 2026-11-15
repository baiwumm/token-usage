// 落地页 SEO 常量（单一来源）：根布局 metadata、sitemap、robots 与页内
// JSON-LD 都从这里取，避免标题/描述/关键词在多处漂移。
// 落地页是独立部署域（docs/requirements.md #19），域名写死在此，与
// metadataBase、页脚落款保持一致。

export const SITE_URL = "https://token-usage.cc";

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
