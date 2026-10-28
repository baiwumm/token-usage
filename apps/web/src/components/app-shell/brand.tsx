"use client";

import Link from "next/link";
import { Typography } from "@heroui/react";

import { NAV_COPY } from "@/lib/copy/nav";
import { useLocale } from "@/lib/copy/locale";

/** Brand lockup: accent tile + wordmark with a quiet product tagline. */
export function Brand({ collapsed }: { collapsed: boolean }) {
  const [locale] = useLocale();
  const copy = NAV_COPY[locale];

  return (
    <div className="flex h-16 shrink-0 items-center px-3">
      <Link
        aria-label="Token Usage"
        className={`hover:bg-default flex min-w-0 items-center gap-2.5 rounded-3xl p-1 transition-colors ${
          collapsed ? "w-full justify-center" : "w-full"
        }`}
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
        {collapsed ? null : (
          <div className="flex min-w-0 flex-col">
            <Typography
              truncate
              className="leading-tight"
              type="h6"
              weight="semibold"
            >
              Token Usage
            </Typography>
            <Typography
              truncate
              className="text-[10px] tracking-[0.16em] uppercase"
              color="muted"
              type="body-xs"
              weight="medium"
            >
              {copy.brandTagline}
            </Typography>
          </div>
        )}
      </Link>
    </div>
  );
}
