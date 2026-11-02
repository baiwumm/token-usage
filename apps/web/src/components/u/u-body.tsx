"use client";

// Public page body for /u/<token> (docs/badge.md §6): the panel badge's
// numbers laid out as a page — totals, the 30-day strip, source shares, top
// models and the allowlisted repositories. Everything arrives as aggregates
// from the server page; no token, hash or user id ever reaches this tree.
// Labels follow the visitor's language, numbers keep the badge's fixed
// formatting so page and badge always agree.

import type { BadgeData } from "@/lib/badge/types";

import { Card, Description, Meter, Typography } from "@heroui/react";

import { SourceIcon } from "@/components/source-icon";
import {
  formatBadgeCost,
  formatBadgeCount,
  formatBadgeShare,
  formatBadgeTokens,
} from "@/lib/badge/format";
import { useLocale } from "@/lib/copy/locale";
import { formatMessage } from "@/lib/copy/message";
import { PUBLIC_PAGE_COPY, type PublicPageCopy } from "@/lib/copy/public-page";

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card className="p-5">
      <Card.Content className="flex flex-col gap-1">
        <Typography
          className="tracking-wider uppercase"
          color="muted"
          type="body-xs"
        >
          {label}
        </Typography>
        <Typography className="text-3xl font-bold tabular-nums" type="h3">
          {value}
        </Typography>
        {hint ? (
          <Description className="text-muted text-xs">{hint}</Description>
        ) : null}
      </Card.Content>
    </Card>
  );
}

// Last 30 owner-tz days as CSS bars (no chart dependency for a static strip).
function SeriesStrip({ series, label }: { series: number[]; label: string }) {
  const max = Math.max(0, ...series);

  return (
    <div aria-label={label} className="flex h-24 items-end gap-1" role="img">
      {series.map((value, day) => (
        <div
          // The strip is a fixed 30-day window: position is the identity.
          key={day}
          className="bg-accent/80 flex-1 rounded-t-sm"
          style={{
            height: `${max > 0 ? Math.max(2, (value / max) * 100) : 2}%`,
          }}
        />
      ))}
    </div>
  );
}

function ShareList({ copy, data }: { copy: PublicPageCopy; data: BadgeData }) {
  if (data.sources.length === 0) {
    return (
      <Typography color="muted" type="body-sm">
        {copy.empty}
      </Typography>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {data.sources.map((source) => (
        <div key={source.key} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="flex min-w-0 items-center gap-1.5">
              <SourceIcon label={source.label} size={14} source={source.key} />
              <span className="truncate font-medium">{source.label}</span>
            </span>
            <span className="text-foreground/60 text-xs tabular-nums">
              {formatBadgeTokens(source.tokens)} ·{" "}
              {formatBadgeShare(source.share)}
            </span>
          </div>
          <Meter
            aria-label={`${source.label} ${formatBadgeShare(source.share)}`}
            value={Math.min(100, Math.max(0, source.share * 100))}
          >
            <Meter.Track className="h-1.5">
              <Meter.Fill className="bg-accent" />
            </Meter.Track>
          </Meter>
        </div>
      ))}
    </div>
  );
}

function ModelList({ copy, data }: { copy: PublicPageCopy; data: BadgeData }) {
  if (data.models.length === 0) {
    return (
      <Typography color="muted" type="body-sm">
        {copy.empty}
      </Typography>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {data.models.map((model) => (
        <div
          key={model.key}
          className="flex items-center justify-between gap-2 text-sm"
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <SourceIcon label={model.label} size={14} />
            <span className="truncate font-medium">{model.label}</span>
          </span>
          <span className="text-foreground/60 text-xs tabular-nums">
            {formatBadgeTokens(model.tokens)}
          </span>
        </div>
      ))}
    </div>
  );
}

function RepoCard({ copy, repo }: { copy: PublicPageCopy; repo: BadgeData }) {
  const stats = [
    { label: copy.tokens, value: formatBadgeTokens(repo.totals.tokens) },
    { label: copy.cost, value: formatBadgeCost(repo.totals.costUsd) },
    { label: copy.activeDays, value: formatBadgeCount(repo.totals.activeDays) },
  ];

  return (
    <Card className="p-5">
      <Card.Header>
        <Card.Title className="truncate">{repo.project}</Card.Title>
      </Card.Header>
      <Card.Content className="grid grid-cols-3 gap-2">
        {stats.map((stat) => (
          <div key={stat.label} className="flex min-w-0 flex-col gap-0.5">
            <Typography color="muted" type="body-xs">
              {stat.label}
            </Typography>
            <Typography
              className="truncate font-semibold tabular-nums"
              type="body-sm"
            >
              {stat.value}
            </Typography>
          </div>
        ))}
      </Card.Content>
    </Card>
  );
}

export function UBody({
  account,
  repos,
}: {
  account: BadgeData;
  repos: BadgeData[];
}) {
  const [locale] = useLocale();
  const copy = PUBLIC_PAGE_COPY[locale];
  const last30 = account.series.reduce((sum, value) => sum + value, 0);
  const last30Label = formatMessage(copy.last30Total, locale, {
    tokens: formatBadgeTokens(last30),
  });

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10 md:px-8">
      <header className="flex flex-col gap-1">
        <Typography
          className="text-accent tracking-widest uppercase"
          type="body-xs"
        >
          {copy.eyebrow}
        </Typography>
        <Typography type="h1">
          {account.displayName.trim() || copy.fallbackTitle}
        </Typography>
        <Typography color="muted" type="body-sm">
          {copy.subtitle}
        </Typography>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <Stat
          label={copy.tokens}
          value={formatBadgeTokens(account.totals.tokens)}
        />
        <Stat
          hint={copy.costHint}
          label={copy.cost}
          value={formatBadgeCost(account.totals.costUsd)}
        />
        <Stat
          label={copy.activeDays}
          value={formatBadgeCount(account.totals.activeDays)}
        />
      </section>

      {account.series.length > 0 ? (
        <Card className="p-5">
          <Card.Header>
            <Card.Title>{copy.last30}</Card.Title>
            <Card.Description>{last30Label}</Card.Description>
          </Card.Header>
          <Card.Content>
            <SeriesStrip label={last30Label} series={account.series} />
          </Card.Content>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-5">
          <Card.Header>
            <Card.Title>{copy.sources}</Card.Title>
          </Card.Header>
          <Card.Content>
            <ShareList copy={copy} data={account} />
          </Card.Content>
        </Card>
        <Card className="p-5">
          <Card.Header>
            <Card.Title>{copy.models}</Card.Title>
          </Card.Header>
          <Card.Content>
            <ModelList copy={copy} data={account} />
          </Card.Content>
        </Card>
      </div>

      {repos.length > 0 ? (
        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Typography type="h4">{copy.repos}</Typography>
            <Description className="text-muted text-xs">
              {copy.reposHint}
            </Description>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {repos.map((repo) => (
              <RepoCard key={repo.project ?? ""} copy={copy} repo={repo} />
            ))}
          </div>
        </section>
      ) : null}

      <Description className="text-muted text-center text-xs">
        {copy.footer}
      </Description>
    </main>
  );
}
