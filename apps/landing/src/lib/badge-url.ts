// 构建期从仓库根 README.md 解析公开徽章 URL（操作者已在 README 公开）。
// 单一来源：不硬编码令牌——README 变更即跟随。解析失败返回 null，调用方
// 隐藏徽章/演示入口即可，不阻塞构建。
// 服务端专用（node:fs）：只被 server components 引用。
//
// 2026-11-14 公开页模型：/u/<公开页令牌> 是每用户一份的账户级页面（§3.2），
// 与徽章令牌（只管 SVG 直链）解耦。README 徽章块的 <a href> 指向公开页令牌、
// <img src> 指向徽章令牌，两处各取所需。

import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface BadgeSource {
  /** 徽章端点 origin，如 https://token-usage.baiwumm.com */
  origin: string;
  /** 徽章令牌（README 已公开，非机密）——SVG 直链用。 */
  token: string;
  /** 公开页令牌——/u/ 页面与 §2.4 数据快照用；README 未提供时为 null。 */
  pageToken: string | null;
  /** /u/<公开页令牌> 完整链接；公开页令牌缺失时为 null。 */
  publicPageUrl: string | null;
}

let cached: BadgeSource | null | undefined;

function parse(): BadgeSource | null {
  // next dev / next build 的 cwd 都是本 app 目录，仓库根在两级之上。
  const readmePath = join(process.cwd(), "..", "..", "README.md");

  let readme: string;

  try {
    readme = readFileSync(readmePath, "utf8");
  } catch {
    return null;
  }

  // 第一处 badge img URL 即徽章直链（README 徽章区首个 <img>）；
  // 第一处 /u/tu_page_… 链接即公开页入口（徽章块的 <a href>）。
  const badgeMatch = readme.match(
    /https:\/\/[^\s"'<>]+\/api\/badge\?token=([A-Za-z0-9_-]+)/,
  );
  const pageMatch = readme.match(
    /https:\/\/[^\s"'<>]+\/u\/(tu_page_[A-Za-z0-9_-]+)/,
  );

  if (!badgeMatch && !pageMatch) return null;
  const origin = new URL((badgeMatch ?? pageMatch)![0]).origin;

  return {
    origin,
    token: badgeMatch?.[1] ?? "",
    pageToken: pageMatch?.[1] ?? null,
    publicPageUrl: pageMatch ? `${origin}/u/${pageMatch[1]}` : null,
  };
}

/** 读不到 README 或没有徽章链接时为 null。 */
export function badgeSource(): BadgeSource | null {
  cached ??= parse();

  return cached;
}

/** sparkline 徽章直链；默认 dark（landing 恒为暗色，light 只作页脚成对展示）。 */
export function badgeImageUrl(
  style: "sparkline" | "panel" = "sparkline",
  theme: "dark" | "light" = "dark",
): string | null {
  const source = badgeSource();

  if (!source) return null;

  return `${source.origin}/api/badge?token=${source.token}&style=${style}&theme=${theme}`;
}
