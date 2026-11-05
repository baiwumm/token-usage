"use client";

// L1 secondary metrics + the two all-time facts (docs/badge.md §6.2). A flat
// four-column band instead of equal-weight KPI cards; only these five values
// get NumberFlow, list numbers elsewhere stay static.

import type { Locale } from "@/lib/copy/locale-config";
import type { PublicPageCopy } from "@/lib/copy/public-page";
import type { PublicPageData } from "@/lib/public-page/types";

import { Description, Typography } from "@heroui/react";

import { formatPublicDay } from "./u-format";
import { PublicNumber } from "./u-public-number";

import { formatBadgeCost, formatBadgeCount } from "@/lib/badge/format";
import { formatMessage } from "@/lib/copy/message";
import { useFormat } from "@/lib/format/format";

export function UMetrics({
  data,
  copy,
  locale,
}: {
  data: PublicPageData;
  copy: PublicPageCopy;
  locale: Locale;
}) {
  const { account, meta } = data;
  const { formatTokens } = useFormat();
  const stats = [
    {
      label: copy.cost,
      value: formatBadgeCost(account.totals.costUsd),
    },
    {
      label: copy.activeDays,
      value: formatBadgeCount(account.totals.activeDays),
    },
    { label: copy.sourcesCount, value: String(meta.sourceCount) },
    { label: copy.modelsCount, value: String(meta.modelCount) },
  ];
  const facts = [
    formatMessage(copy.streak, locale, { days: meta.longestStreakDays }),
    meta.peakDay
      ? formatMessage(copy.peakDay, locale, {
          tokens: formatTokens(meta.peakDay.tokens),
          day: formatPublicDay(meta.peakDay.day, locale),
        })
      : null,
  ].filter((value): value is string => value !== null);

  return (
    <section
      className="u-reveal flex flex-col gap-6"
      style={{ animationDelay: "80ms" }}
    >
      <div className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="flex min-w-0 flex-col gap-1">
            <Description className="text-muted text-xs uppercase tracking-wider">
              {stat.label}
            </Description>
            <PublicNumber
              className="text-foreground text-xl font-medium tabular-nums"
              text={stat.value}
            />
          </div>
        ))}
      </div>

      {facts.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {facts.map((fact, index) => (
            <Typography
              key={fact}
              className="u-reveal border-border text-muted rounded-full border px-3 py-1 tabular-nums text-xs"
              style={{ animationDelay: `${120 + index * 80}ms` }}
              type="body-xs"
            >
              {fact}
            </Typography>
          ))}
        </div>
      ) : null}
    </section>
  );
}
