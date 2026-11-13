"use client";

// 顶部导航：logo 锁定（单行标题）+ npm / GitHub / 公开页演示图标按钮，
// 三枚按钮带 Tooltip 箭头提示（对齐 web 端 top-actions 的 ControlTooltip），
// hairline 底边。恒为暗色，只引 logo-dark 变体。

import type { ReactNode } from "react";

import { ChartLineArrowUp, LogoGithub } from "@gravity-ui/icons";
import { Button, Tooltip, Typography } from "@heroui/react";
import Link from "next/link";

import { LANDING_COPY } from "@/lib/copy";
import { NPM_CLI_URL, REPO_URL } from "@/lib/repo-links";

/** 顶栏图标按钮共用的箭头提示。 */
function NavTooltip({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <Tooltip delay={0}>
      {children}
      <Tooltip.Content showArrow placement="bottom">
        <Tooltip.Arrow />
        <Typography type="body-xs">{label}</Typography>
      </Tooltip.Content>
    </Tooltip>
  );
}

export function NavBar({ demoUrl }: { demoUrl: string | null }) {
  const copy = LANDING_COPY.zh;

  return (
    <header className="sticky top-0 z-40 border-b border-default/50 bg-background/75 backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-4 px-6">
        <Link
          aria-label="Token Usage"
          className="flex min-w-0 items-center gap-2.5"
          href="/"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt=""
            className="size-7 shrink-0 rounded-lg"
            height={28}
            src="/logo-dark.svg"
            width={28}
          />
          <Typography className="leading-tight" type="h6" weight="semibold">
            Token Usage
          </Typography>
        </Link>

        <div className="ml-auto flex items-center gap-2">
          <div className="hidden items-center gap-2 md:flex">
            <NavTooltip label="npm · tokenusage-cli">
              <Button
                isIconOnly
                aria-label="npm · tokenusage-cli"
                size="sm"
                variant="outline"
                onPress={() => openExternal(NPM_CLI_URL)}
              >
                <NpmIcon className="size-4" />
              </Button>
            </NavTooltip>
            <NavTooltip label="GitHub">
              <Button
                isIconOnly
                aria-label="GitHub"
                size="sm"
                variant="outline"
                onPress={() => openExternal(REPO_URL)}
              >
                <LogoGithub className="size-4" />
              </Button>
            </NavTooltip>
          </div>
          {demoUrl ? (
            <NavTooltip label={copy.nav.demo}>
              <Button
                isIconOnly
                aria-label={copy.nav.demo}
                size="sm"
                variant="outline"
                onPress={() => openExternal(demoUrl)}
              >
                <ChartLineArrowUp className="size-4" />
              </Button>
            </NavTooltip>
          ) : null}
        </div>
      </div>
    </header>
  );
}

/** npm 官方 mark（simple-icons 路径，随 currentColor 走主题）。 */
function NpmIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <path d="M1.763 0C.786 0 0 .786 0 1.763v20.474C0 23.214.786 24 1.763 24h20.474c.977 0 1.763-.786 1.763-1.763V1.763C24 .786 23.214 0 22.237 0zM5.13 5.323l13.837.019-.009 13.836h-3.464l.01-10.382h-3.456L12.04 19.164H8.579l.01-10.367H5.136z" />
    </svg>
  );
}

function openExternal(url: string): void {
  window.open(url, "_blank", "noopener,noreferrer");
}
