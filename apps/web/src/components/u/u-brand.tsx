"use client";

// Top brand bar for the public page (2026-11-05 operator call): the same
// logo lockup the dashboard shell uses, plus a GitHub link to the repo.
// No card, no background — just a hairline under the row.

import type { Locale } from "@/lib/copy/locale-config";

import { LogoGithub } from "@gravity-ui/icons";
import { Button, Typography } from "@heroui/react";
import Link from "next/link";

import { NAV_COPY } from "@/lib/copy/nav";
import { REPO_URL } from "@/lib/links";

export function UBrand({ locale }: { locale: Locale }) {
  return (
    <header className="border-border mb-12 flex items-center justify-between gap-4 border-b pb-5">
      <Link
        aria-label="Token Usage"
        className="hover:bg-default -mx-3 flex min-w-0 items-center gap-2.5 rounded-3xl px-3 py-2 transition-colors"
        href="/"
      >
        <span aria-hidden="true" className="grid size-8 shrink-0 select-none">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt=""
            className="col-start-1 row-start-1 size-8 rounded-lg dark:hidden"
            height={32}
            src="/logo.svg"
            width={32}
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt=""
            className="col-start-1 row-start-1 hidden size-8 rounded-lg dark:block"
            height={32}
            src="/logo-dark.svg"
            width={32}
          />
        </span>
        <span className="flex min-w-0 flex-col">
          <Typography className="leading-tight" type="h6" weight="semibold">
            Token Usage
          </Typography>
          <Typography
            className="text-[10px] tracking-[0.16em] uppercase"
            color="muted"
            type="body-xs"
            weight="medium"
          >
            {NAV_COPY[locale].brandTagline}
          </Typography>
        </span>
      </Link>

      <Button
        aria-label="GitHub"
        size="sm"
        variant="outline"
        onPress={() => window.open(REPO_URL, "_blank", "noopener,noreferrer")}
      >
        <LogoGithub className="size-4" />
        <Typography type="body-xs">GitHub</Typography>
      </Button>
    </header>
  );
}
