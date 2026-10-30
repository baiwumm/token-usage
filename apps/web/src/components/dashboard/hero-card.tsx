"use client";

// Hero card for the range's total tokens (docs/ui-spec.md 仪表盘): big centered
// count, absorbed KPI metrics (billable / conversations / active days),
// approximate cost with an unpriced-models note plus the all-time cost, the
// range window, a source-share stacked bar and one share chip per source.

import type { DashboardCopy } from "@/lib/copy/dashboard";
import type {
  AccountSummary,
  DashboardTotals,
  ModelBreakdownSource,
} from "@/lib/dashboard/api";

import { CircleInfo, Layers } from "@gravity-ui/icons";
import { Button, Card, Tooltip, Typography } from "@heroui/react";
import { useMemo, useState } from "react";

import { canonicalSourceRows, mergeModelsAcrossSources } from "./aggregate";
import { ModelListModal } from "./model-list-modal";

import { seriesColor } from "@/components/mini-charts";
import { SourceIcon } from "@/components/source-icon";
import { FlowNumber } from "@/components/flow-number";
import { formatMessage } from "@/lib/copy/message";
import { useFormat } from "@/lib/format/format";

export function TotalTokensHero({
  allTime,
  summary,
  breakdown,
  copy,
  locale,
  fromDay,
  toDay,
  budgetExceeded,
}: {
  allTime: DashboardTotals | null;
  summary: AccountSummary;
  breakdown: ModelBreakdownSource[];
  copy: DashboardCopy;
  locale: "zh" | "en";
  fromDay: string;
  toDay: string;
  /** Monthly budget from settings is crossed — the cost line turns danger. */
  budgetExceeded?: boolean;
}) {
  const { formatTokens, formatCost, formatPercent, formatDate, formatNumber } =
    useFormat();

  const sources = useMemo(() => canonicalSourceRows(breakdown), [breakdown]);
  // Clicking a source share chip opens its model breakdown (juejin-style
  // distribution modal, shared with the detail table's model count column).
  const [openSourceId, setOpenSourceId] = useState<string | null>(null);
  // "all" opens the merged cross-source model ranking; any other id opens
  // that canonical source's own models. Sorting lives in ModelListModal.
  const openSource =
    openSourceId == null || openSourceId === "all"
      ? null
      : (sources.find((source) => source.id === openSourceId) ?? null);
  const modalRows = useMemo(() => {
    if (openSourceId === "all") {
      // Merged cross-source ranking: one row per model name.
      return mergeModelsAcrossSources(breakdown).map((row) => ({
        model: row.model,
        tokens: row.totals.total_tokens,
        cost: row.totals.total_cost_usd,
        source: row.sources[0],
      }));
    }

    return (openSource?.models ?? []).map((model) => ({
      model: model.model,
      tokens: model.totals.total_tokens,
      cost: Number(model.totals.total_cost_usd),
      source: openSource?.id,
    }));
  }, [breakdown, openSource, openSourceId]);
  const modalTitle =
    openSourceId === "all" ? copy.cards.heroAll : (openSource?.label ?? "");
  const totalTokens = summary.totals.total_tokens;
  const hasUnpriced = sources.some((source) =>
    source.models.some((model) => model.pricing.status === "unpriced"),
  );
  const totalModels = sources.reduce(
    (sum, source) => sum + source.models.length,
    0,
  );

  return (
    <Card className="p-6">
      <Card.Content className="flex flex-col items-center gap-3">
        <Typography color="muted" type="body-xs">
          {copy.cards.totalTokens}
        </Typography>
        <Typography className="tabular-nums text-5xl" type="h1" weight="bold">
          <FlowNumber text={formatTokens(totalTokens)} />
        </Typography>
        {/* Absorbed KPI tiles: billable tokens / conversations / active days
            ride under the headline so the top area stays three cards total. */}
        <div className="text-muted flex flex-wrap items-center justify-center gap-x-6 gap-y-1 text-xs">
          <span className="flex items-center gap-1.5">
            {copy.cards.billableTokens}
            <span className="text-foreground font-medium tabular-nums">
              {formatTokens(summary.totals.billable_total_tokens)}
            </span>
          </span>
          <span className="flex items-center gap-1.5">
            {copy.cards.conversations}
            <span className="text-foreground font-medium tabular-nums">
              {formatNumber(summary.totals.conversation_count)}
            </span>
          </span>
          <span className="flex items-center gap-1.5">
            {copy.cards.activeDays}
            <span className="text-foreground font-medium tabular-nums">
              {formatNumber(summary.days)}
            </span>
          </span>
          <span className="flex items-center gap-1.5">
            {copy.cards.avgPerActiveDay}
            <span className="text-foreground font-medium tabular-nums">
              {formatTokens(summary.rolling.last_30d.avg_per_active_day ?? 0)}
            </span>
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Typography
            className={`tabular-nums ${budgetExceeded ? "text-danger" : "text-success"}`}
            type="body-sm"
          >
            {hasUnpriced ? "≥ " : ""}
            <FlowNumber text={formatCost(summary.totals.total_cost_usd)} />
          </Typography>
          <Tooltip>
            <Button
              aria-label={copy.cards.heroCostNote}
              className="size-5 p-0"
              size="sm"
              variant="ghost"
            >
              <CircleInfo aria-hidden="true" className="text-muted size-3.5" />
            </Button>
            <Tooltip.Content showArrow placement="bottom">
              {copy.cards.heroCostNote}
            </Tooltip.Content>
          </Tooltip>
          {allTime ? (
            <Typography className="text-muted tabular-nums" type="body-xs">
              · {copy.cards.allTimeSuffix}{" "}
              <FlowNumber text={formatCost(allTime.total_cost_usd)} />
            </Typography>
          ) : null}
        </div>
        {hasUnpriced ? (
          <Typography color="muted" type="body-xs">
            {copy.cards.heroCostApprox}
          </Typography>
        ) : (
          <Typography color="muted" type="body-xs">
            {copy.cards.heroCostNote}
          </Typography>
        )}
        <Typography color="muted" type="body-xs">
          {formatDate(`${fromDay}T12:00:00Z`, { dateStyle: "medium" })} —{" "}
          {formatDate(`${toDay}T12:00:00Z`, { dateStyle: "medium" })}
        </Typography>

        {sources.length > 0 ? (
          <>
            <div
              aria-hidden="true"
              className="flex h-2 w-full overflow-hidden rounded-full"
            >
              {sources.map((source, index) => (
                <div
                  key={source.id}
                  style={{
                    background: seriesColor(index),
                    width: `${
                      totalTokens > 0
                        ? (source.totalTokens / totalTokens) * 100
                        : 0
                    }%`,
                  }}
                />
              ))}
            </div>
            <div className="grid w-full grid-cols-2 gap-2 pt-2 sm:grid-cols-4 lg:grid-cols-6">
              <button
                aria-label={copy.cards.heroAll}
                className="border-border/60 hover:bg-default/60 flex cursor-pointer flex-col gap-1 rounded-3xl border p-3 text-start transition-colors"
                type="button"
                onClick={() => setOpenSourceId("all")}
              >
                <span className="text-muted flex items-center gap-1.5 text-xs font-medium">
                  <Layers
                    aria-hidden="true"
                    className="text-muted size-3.5 shrink-0"
                  />
                  {copy.cards.heroAll}
                </span>
                <span className="tabular-nums text-base font-semibold">
                  {formatPercent(totalTokens > 0 ? 1 : 0)}
                </span>
                <span className="text-muted text-xs">
                  {formatMessage(copy.cards.heroModelsCount, locale, {
                    count: totalModels,
                  })}
                </span>
              </button>
              {sources.map((source) => (
                <button
                  key={source.id}
                  aria-label={source.label}
                  className="border-border/60 hover:bg-default/60 flex cursor-pointer flex-col gap-1 rounded-3xl border p-3 text-start transition-colors"
                  type="button"
                  onClick={() => setOpenSourceId(source.id)}
                >
                  <span className="text-muted flex min-w-0 items-center gap-1.5 text-xs font-medium">
                    <SourceIcon label={source.id} size={14} />
                    <span className="truncate">{source.label}</span>
                  </span>
                  <span className="tabular-nums text-base font-semibold">
                    {formatPercent(
                      totalTokens > 0 ? source.totalTokens / totalTokens : 0,
                    )}
                  </span>
                  <span className="text-muted text-xs">
                    {formatMessage(copy.cards.heroModelsCount, locale, {
                      count: source.models.length,
                    })}
                  </span>
                </button>
              ))}
            </div>
          </>
        ) : null}
      </Card.Content>
      <ModelListModal
        copy={copy}
        open={openSourceId != null}
        rows={modalRows}
        title={modalTitle}
        onOpenChange={(open) => {
          if (!open) setOpenSourceId(null);
        }}
      />
    </Card>
  );
}
