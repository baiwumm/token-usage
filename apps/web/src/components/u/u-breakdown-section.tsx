"use client";

// L2: two five-row columns that line up row-for-row (operator call
// 2026-11-05). Sources show name + value + a proportional Meter bar, models
// show name + value. Both columns use the exact same row class and centre a
// single in-flow text line; the source Meter is absolutely positioned so it
// cannot push the source text half a bar-height above the model text.
// The repository subsection has been removed.

import type { BadgeData } from "@/lib/badge/types";
import type { PublicPageCopy } from "@/lib/copy/public-page";
import type { PublicPageData } from "@/lib/public-page/types";

import { Description, Meter, Typography } from "@heroui/react";

import { SourceIcon } from "@/components/source-icon";
import { formatBadgeCost, formatBadgeShare } from "@/lib/badge/format";
import { useFormat } from "@/lib/format/format";

const ROW = "relative flex min-h-14 items-center";

function SourceList({ copy, data }: { copy: PublicPageCopy; data: BadgeData }) {
  const { formatTokens } = useFormat();

  if (data.sources.length === 0) {
    return (
      <Description className="text-muted text-xs">{copy.empty}</Description>
    );
  }

  return (
    <div className="flex flex-col">
      {data.sources.slice(0, 5).map((source) => (
        <div key={source.key} className={ROW}>
          <div className="flex w-full items-center justify-between gap-2 text-sm">
            <div className="flex min-w-0 items-center gap-1.5">
              <SourceIcon label={source.label} size={14} source={source.key} />
              <Typography
                className="min-w-0 truncate font-medium"
                type="body-sm"
              >
                {source.label}
              </Typography>
            </div>
            <Typography
              className="text-foreground/60 shrink-0 tabular-nums text-xs"
              type="body-xs"
            >
              {formatTokens(source.tokens)} · {formatBadgeShare(source.share)}
            </Typography>
          </div>
          {/* Out of flow: both columns centre an identical single-line child. */}
          <div className="absolute inset-x-0 bottom-2">
            <Meter
              aria-label={`${source.label} ${formatBadgeShare(source.share)}`}
              value={Math.min(100, Math.max(0, source.share * 100))}
            >
              <Meter.Track className="h-1.5">
                <Meter.Fill className="bg-accent" />
              </Meter.Track>
            </Meter>
          </div>
        </div>
      ))}
    </div>
  );
}

function ModelList({
  copy,
  data,
  modelCosts,
}: {
  copy: PublicPageCopy;
  data: BadgeData;
  modelCosts: Record<string, number>;
}) {
  const { formatTokens } = useFormat();

  if (data.models.length === 0) {
    return (
      <Description className="text-muted text-xs">{copy.empty}</Description>
    );
  }

  return (
    <div className="flex flex-col">
      {data.models.slice(0, 5).map((model) => (
        <div key={model.key} className={ROW}>
          <div className="flex w-full items-center justify-between gap-2 text-sm">
            <div className="flex min-w-0 items-center gap-1.5">
              <SourceIcon label={model.label} size={14} />
              <Typography
                className="min-w-0 truncate font-medium"
                type="body-sm"
              >
                {model.label}
              </Typography>
            </div>
            <Typography
              className="text-foreground/60 shrink-0 tabular-nums text-xs"
              type="body-xs"
            >
              {formatTokens(model.tokens)} ·{" "}
              {formatBadgeCost(modelCosts[model.key] ?? 0)}
            </Typography>
          </div>
        </div>
      ))}
    </div>
  );
}

export function UBreakdownSection({
  data,
  copy,
}: {
  data: PublicPageData;
  copy: PublicPageCopy;
}) {
  return (
    <section
      className="u-reveal flex flex-col gap-8"
      style={{ animationDelay: "260ms" }}
    >
      <div className="grid gap-8 md:grid-cols-2 md:gap-12">
        <div className="flex flex-col gap-4">
          <Typography type="h4">{copy.sources}</Typography>
          <SourceList copy={copy} data={data.account} />
        </div>
        <div className="flex flex-col gap-4">
          <Typography type="h4">{copy.models}</Typography>
          <ModelList
            copy={copy}
            data={data.account}
            modelCosts={data.modelCosts}
          />
        </div>
      </div>
    </section>
  );
}
