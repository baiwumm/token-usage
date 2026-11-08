"use client";

// 顶部导航：logo 锁定 + 章节锚点 + GitHub + 部署 CTA，hairline 底边。
// 恒为暗色，只引 logo-dark 变体。

import { LogoGithub } from "@gravity-ui/icons";
import { Button, Typography } from "@heroui/react";

import { LANDING_COPY } from "@/lib/copy";
import { REPO_URL } from "@/lib/repo-links";

export function NavBar() {
  const copy = LANDING_COPY.zh;

  return (
    <header className="sticky top-0 z-40 border-b border-default/50 bg-background/75 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-4 px-6">
        <a
          aria-label="Token Usage"
          className="flex min-w-0 items-center gap-2.5"
          href="#top"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt=""
            className="size-7 shrink-0 rounded-lg"
            height={28}
            src="/logo-dark.svg"
            width={28}
          />
          <span className="flex min-w-0 flex-col">
            <Typography className="leading-tight" type="h6" weight="semibold">
              Token Usage
            </Typography>
            <Typography
              className="hidden text-[10px] tracking-[0.16em] uppercase sm:block"
              color="muted"
              type="body-xs"
              weight="medium"
            >
              {copy.nav.tagline}
            </Typography>
          </span>
        </a>

        <nav className="ml-auto hidden items-center gap-1 md:flex">
          <a
            className="rounded-full px-3 py-1.5 text-sm text-muted transition-colors hover:bg-default/60 hover:text-foreground"
            href="#features"
          >
            {copy.nav.features}
          </a>
          <a
            className="rounded-full px-3 py-1.5 text-sm text-muted transition-colors hover:bg-default/60 hover:text-foreground"
            href="#deploy"
          >
            {copy.nav.deploy}
          </a>
        </nav>

        <Button
          aria-label="GitHub"
          className="max-md:hidden"
          size="sm"
          variant="outline"
          onPress={() => window.open(REPO_URL, "_blank", "noopener,noreferrer")}
        >
          <LogoGithub className="size-4" />
          <Typography type="body-xs">GitHub</Typography>
        </Button>

        <Button size="sm" variant="primary" onPress={() => scrollToDeploy()}>
          {copy.nav.cta}
        </Button>
      </div>
    </header>
  );
}

function scrollToDeploy(): void {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  document
    .getElementById("deploy")
    ?.scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
}
