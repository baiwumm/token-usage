"use client";

// L0 identity + the single oversized all-time number (docs/badge.md §6.2).
// No Card, no border: whitespace and the hairline below do the separating.
// The period line sits to the right of the avatar row, vertically centred.

import type { Locale } from "@/lib/copy/locale-config";
import type { PublicPageCopy } from "@/lib/copy/public-page";
import type { PublicPageData } from "@/lib/public-page/types";

import { Avatar, Description, Tooltip, Typography } from "@heroui/react";

import { formatPublicPeriodRange, formatPublicUpdatedAt } from "./u-format";
import { PublicNumber } from "./u-public-number";

import { formatMessage } from "@/lib/copy/message";
import { useFormat } from "@/lib/format/format";

export function UHero({
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
  // Keep the visible meta line short ("scope · updated at"). The exact first /
  // last day lives in the scope Tooltip instead of stretching the header.
  const periodRange = formatPublicPeriodRange(
    copy.periodRange,
    locale,
    meta.firstDay,
    meta.lastDay,
  );
  const updated = formatPublicUpdatedAt(meta.updatedAt, locale);
  const name = account.displayName.trim() || copy.fallbackTitle;
  const initial = name.slice(0, 1).toUpperCase();

  // Tooltip.Trigger is required: the root is react-aria's TooltipTrigger and
  // passes hover/focus through FocusableContext, which a raw DOM child never
  // consumes. render it as <span> to stay valid inside Description.
  return (
    <header className="u-reveal flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar>
            {data.avatarDataUri ? (
              <Avatar.Image alt="" src={data.avatarDataUri} />
            ) : null}
            <Avatar.Fallback className="text-xl font-medium">
              {initial}
            </Avatar.Fallback>
          </Avatar>
          <Typography className="text-2xl font-medium tracking-tight" type="h1">
            {name}
          </Typography>
        </div>
        <Description className="text-muted flex flex-wrap items-center gap-x-2 gap-y-1 tabular-nums text-xs md:justify-end">
          {/* Separator / timestamp stay spans: Typography renders <p>, which
              cannot sit inside Description's inline <span>. */}
          {periodRange ? (
            <Tooltip delay={0}>
              <Tooltip.Trigger<"span">
                className="text-foreground font-medium outline-none focus-visible:outline-accent focus-visible:outline-2 focus-visible:outline-offset-2"
                render={(props) => <span {...props} />}
              >
                {copy.allTime}
              </Tooltip.Trigger>
              <Tooltip.Content showArrow placement="bottom">
                <Tooltip.Arrow />
                {periodRange}
              </Tooltip.Content>
            </Tooltip>
          ) : (
            <span className="text-foreground font-medium">{copy.allTime}</span>
          )}
          {updated ? (
            <>
              <span aria-hidden="true" className="opacity-60">
                ·
              </span>
              <span>
                {formatMessage(copy.updatedAt, locale, { at: updated })}
              </span>
            </>
          ) : null}
        </Description>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <PublicNumber
          className="text-[clamp(2.5rem,8vw,4.5rem)] leading-none font-medium tracking-tight tabular-nums"
          text={formatTokens(account.totals.tokens)}
        />
        <Typography className="text-muted" type="body-sm">
          {copy.tokens}
        </Typography>
      </div>

      {account.totals.tokens === 0 ? (
        <Description className="text-muted text-xs">
          {copy.noDataYet}
        </Description>
      ) : null}
    </header>
  );
}
