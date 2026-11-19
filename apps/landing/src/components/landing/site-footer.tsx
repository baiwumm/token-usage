// Footer（设计定稿 08 段）：实时徽章直链演示（<img> 零脚本，README 解析）
// + 三列链接 + 署名指向（AGENTS 规则 10：只指向 LICENSE /
// THIRD_PARTY_NOTICES）+ 备案信息（ICP 链接工信部，公安网备链接公安查询页，
// 文案见 `copy.footer.beian`，数字自动进查询链接）。

import { Typography } from "@heroui/react";

import { BadgePreview } from "@/components/landing/badge-preview";
import { badgeImageUrl, badgeSource } from "@/lib/badge-url";
import { LANDING_COPY } from "@/lib/copy";
import { DEMO_URL } from "@/lib/demo-url";
import { LICENSE_URL, THIRD_PARTY_URL } from "@/lib/repo-links";

const PUBLIC_PAGE_SENTINEL = "#public-page";

/** 哨兵链接 → 渲染期解析的真实 href；解析失败隐藏该条。 */
const SENTINEL_HREFS: Record<string, string | null> = {
  "#license": LICENSE_URL,
  "#third-party": THIRD_PARTY_URL,
  // Read-only demo dashboard (docs/demo-instance-plan.md §6).
  "#live-demo": DEMO_URL,
};

export function SiteFooter() {
  const copy = LANDING_COPY.zh;
  const demoUrl = badgeSource()?.publicPageUrl ?? null;
  // 亮 / 暗两版徽章并排（2026-11-11 操作者要求）：暗色页上亮色版更醒目，
  // 成对展示也填满右侧留白；任一解析失败则整块隐藏，不出现半截。
  const badges = [
    { src: badgeImageUrl("sparkline", "light"), label: "亮色" },
    { src: badgeImageUrl("sparkline", "dark"), label: "暗色" },
  ].filter((item): item is { src: string; label: string } => item.src !== null);
  const { icp, police } = copy.footer.beian;
  const policeCode = police.match(/\d+/)?.[0] ?? "";
  const hasBeian = Boolean(icp || (police && policeCode));

  const columns = copy.footer.columns.map((column) => ({
    ...column,
    links: column.links
      .map((link) => {
        if (link.href === PUBLIC_PAGE_SENTINEL) {
          return demoUrl ? { ...link, href: demoUrl } : null;
        }

        if (link.href in SENTINEL_HREFS) {
          const resolved = SENTINEL_HREFS[link.href];

          return resolved ? { ...link, href: resolved } : null;
        }

        return link;
      })
      .filter((link) => link !== null),
  }));

  return (
    <footer className="border-t border-default/50">
      <div className="mx-auto w-full max-w-6xl px-6 py-16">
        {badges.length > 0 ? (
          <div className="flex flex-col gap-3 pb-12">
            <Typography type="body-sm" weight="semibold">
              {copy.footer.badgeTitle}
            </Typography>
            <Typography color="muted" type="body-xs">
              {copy.footer.badgeSub}
            </Typography>
            <div className="mt-2 grid gap-4 sm:grid-cols-2">
              {badges.map((badge) => (
                <BadgePreview
                  key={badge.label}
                  alt={`Token Usage 实时用量徽章（${badge.label}）`}
                  ariaLabel={`Token Usage 公开页演示（${badge.label}徽章）`}
                  href={demoUrl ?? undefined}
                  src={badge.src}
                />
              ))}
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-8 border-t border-default/50 pt-10 md:grid-cols-3">
          {columns.map((column) => (
            <div key={column.title} className="flex flex-col gap-3">
              <Typography type="body-xs" weight="semibold">
                {column.title}
              </Typography>
              {column.links.map((link) => {
                // 打开方式（2026-11-16 拍板）：站内（`/` 开头）与页内锚点
                //（`#` 开头）同页打开；外域（GitHub、备案等）保持新窗口。
                const external =
                  !link.href.startsWith("#") && !link.href.startsWith("/");

                return (
                  <a
                    key={link.label}
                    className="group w-fit"
                    href={link.href}
                    {...(external
                      ? { rel: "noopener noreferrer", target: "_blank" }
                      : {})}
                  >
                    <Typography
                      className="transition-colors group-hover:text-accent"
                      color="muted"
                      type="body-xs"
                    >
                      {link.label}
                    </Typography>
                  </a>
                );
              })}
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-default/50 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            <Typography color="muted" type="body-xs">
              {copy.footer.rights}
            </Typography>
            <Typography color="muted" type="body-xs">
              {copy.footer.attribution}
            </Typography>
          </div>

          {hasBeian ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              {icp ? (
                <a
                  className="group inline-flex items-center gap-1"
                  href="https://beian.miit.gov.cn/"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    alt=""
                    aria-hidden="true"
                    className="size-3.5 shrink-0"
                    height={14}
                    loading="lazy"
                    src="/beian/icp.png"
                    width={14}
                  />
                  <Typography
                    className="transition-colors group-hover:text-accent"
                    color="muted"
                    type="body-xs"
                  >
                    {icp}
                  </Typography>
                </a>
              ) : null}

              {police && policeCode ? (
                <a
                  className="group inline-flex items-center gap-1"
                  href={`https://beian.mps.gov.cn/#/query/webSearch?code=${policeCode}`}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    alt=""
                    aria-hidden="true"
                    className="size-3.5 shrink-0"
                    height={14}
                    loading="lazy"
                    src="/beian/police.png"
                    width={14}
                  />
                  <Typography
                    className="transition-colors group-hover:text-accent"
                    color="muted"
                    type="body-xs"
                  >
                    {police}
                  </Typography>
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </footer>
  );
}
