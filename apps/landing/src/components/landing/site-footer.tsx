// Footer（设计定稿 08 段）：实时徽章直链演示（<img> 零脚本，README 解析）
// + 三列链接 + 署名指向（AGENTS 规则 10：只指向 LICENSE /
// THIRD_PARTY_NOTICES）+ ICP 占位。

import { Typography } from "@heroui/react";

import { badgeImageUrl, badgeSource } from "@/lib/badge-url";
import { LANDING_COPY } from "@/lib/copy";
import { LICENSE_URL, THIRD_PARTY_URL } from "@/lib/repo-links";

const PUBLIC_PAGE_SENTINEL = "#public-page";

/** 哨兵链接 → 渲染期解析的真实 href；解析失败隐藏该条。 */
const SENTINEL_HREFS: Record<string, string | null> = {
  "#license": LICENSE_URL,
  "#third-party": THIRD_PARTY_URL,
};

export function SiteFooter() {
  const copy = LANDING_COPY.zh;
  const badge = badgeImageUrl("sparkline");
  const demoUrl = badgeSource()?.publicPageUrl ?? null;

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
        {badge ? (
          <div className="flex flex-col gap-3 pb-12">
            <Typography type="body-sm" weight="semibold">
              {copy.footer.badgeTitle}
            </Typography>
            <Typography color="muted" type="body-xs">
              {copy.footer.badgeSub}
            </Typography>
            <a
              aria-label="Token Usage 公开页演示"
              className="mt-2 inline-block w-fit"
              href={demoUrl ?? undefined}
              rel="noopener noreferrer"
              target="_blank"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt="Token Usage 实时用量徽章"
                className="rounded-md"
                height={120}
                src={badge}
                width={600}
              />
            </a>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-8 border-t border-default/50 pt-10 md:grid-cols-3">
          {columns.map((column) => (
            <div key={column.title} className="flex flex-col gap-3">
              <Typography type="body-xs" weight="semibold">
                {column.title}
              </Typography>
              {column.links.map((link) =>
                link.href.startsWith("#") ? (
                  <a
                    key={link.label}
                    className="text-muted transition-colors hover:text-foreground"
                    href={link.href}
                  >
                    <Typography color="muted" type="body-xs">
                      {link.label}
                    </Typography>
                  </a>
                ) : (
                  <a
                    key={link.label}
                    className="text-muted transition-colors hover:text-foreground"
                    href={link.href}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    <Typography color="muted" type="body-xs">
                      {link.label}
                    </Typography>
                  </a>
                ),
              )}
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-default/50 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <Typography color="muted" type="body-xs">
            {copy.footer.rights}
          </Typography>
          <Typography color="muted" type="body-xs">
            {/* ICP 占位：.cc 域名可备案，备案号下来后填在这里。 */}
            {copy.footer.icp} · {copy.footer.attribution}
          </Typography>
        </div>
      </div>
    </footer>
  );
}
