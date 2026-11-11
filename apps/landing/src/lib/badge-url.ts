// 构建期从仓库根 README.md 解析公开徽章 URL（操作者已在 README 公开）。
// 单一来源：不硬编码令牌——README 变更即跟随。解析失败返回 null，调用方
// 隐藏徽章/演示入口即可，不阻塞构建。
// 服务端专用（node:fs）：只被 server components 引用。

import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface BadgeSource {
  /** 徽章端点 origin，如 https://token-usage.baiwumm.com */
  origin: string;
  /** 公开徽章令牌（README 已公开，非机密）。 */
  token: string;
  /** /u/<token> 公开页完整链接。 */
  publicPageUrl: string;
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

  // 第一处 badge img URL 即账户级徽章（README 徽章区首个 <img>）。
  const match = readme.match(
    /https:\/\/[^\s"'<>]+\/api\/badge\?token=([A-Za-z0-9_-]+)/,
  );

  if (!match) return null;
  const origin = new URL(match[0]).origin;

  return {
    origin,
    token: match[1],
    publicPageUrl: `${origin}/u/${match[1]}`,
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
