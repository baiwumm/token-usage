"use client";

// One project as a high-density list row, or as a grid card in the alternate
// view. Both shapes use the same three information levels so switching views
// never changes what the numbers mean.
//
// Final effect set (2026-11-05): hover lift, meter flow, selected rail,
// staggered entrance. Hover outline / compact density were dropped — the
// outline fought the hairline row language, and the tighter density cost more
// breathing room than it bought in scan speed.

import type { CSSProperties } from "react";
import type { ProjectItem } from "@/lib/dashboard/api";
import type { ProjectsCopy } from "@/lib/copy/projects";
import type { ProjectEffectState } from "./projects-effects";

import { Button, Chip, Typography, cn } from "@heroui/react";
import { memo } from "react";

import { resolveProjectDisplayName } from "./identity";

import { formatMessage } from "@/lib/copy/message";
import { useFormat } from "@/lib/format/format";
import { SourceIcon } from "@/components/source-icon";

export type ProjectView = "list" | "cards";

interface RowProps {
  project: ProjectItem;
  copy: ProjectsCopy;
  locale: "zh" | "en";
  maxTokens: number;
  /** Share of the whole window (attributed + unattributed), same denominator
   *  the detail modal uses for "share of total". */
  windowShare: number;
  selected: boolean;
  index: number;
  view: ProjectView;
  effects: ProjectEffectState;
  styles: Readonly<Record<string, string>>;
  sources: string[];
  onOpen: () => void;
}

const SOURCE_ICON_LIMIT = 5;

function initialsOf(name: string): string {
  return (name.trim().replace(/^[^a-z0-9]+/i, "") || "?")
    .charAt(0)
    .toUpperCase();
}

function Identity({
  project,
  copy,
  locale,
  sources,
  fallbackText,
  unattributedHint,
  size,
}: {
  project: ProjectItem;
  copy: ProjectsCopy;
  locale: "zh" | "en";
  sources: string[];
  fallbackText: string;
  unattributedHint: string;
  size: "sm" | "lg";
}) {
  const name = project.project_key;
  const visible = sources.slice(0, SOURCE_ICON_LIMIT);
  const overflow = sources.length - visible.length;

  return (
    <div className="flex min-w-0 items-center gap-3">
      <span
        aria-hidden="true"
        className={cn(
          "bg-accent/10 text-accent flex shrink-0 items-center justify-center rounded-xl font-medium",
          size === "lg" ? "size-10 text-base" : "size-8 text-sm",
        )}
      >
        {name ? initialsOf(resolveProjectDisplayName(name)) : "·"}
      </span>
      <span className="flex min-w-0 flex-col gap-1">
        {name == null ? (
          <Chip color="warning" size="sm" variant="soft">
            {copy.list.unattributed}
          </Chip>
        ) : (
          <Typography
            className="block max-w-56 truncate md:max-w-80"
            type="body-sm"
            weight="semibold"
          >
            <span title={name}>{resolveProjectDisplayName(name)}</span>
          </Typography>
        )}
        <span className="flex min-h-4 items-center gap-1">
          {name == null ? (
            <Typography
              className="max-w-72 truncate"
              color="muted"
              type="body-xs"
            >
              {unattributedHint}
            </Typography>
          ) : (
            <>
              {fallbackText ? (
                <Typography color="muted" type="body-xs">
                  {fallbackText}
                </Typography>
              ) : null}
              {visible.map((source) => (
                <SourceIcon key={source} label={source} size={12} />
              ))}
              {overflow > 0 ? (
                <Typography color="muted" type="body-xs">
                  {formatMessage(copy.list.sourcesMore, locale, {
                    count: String(overflow),
                  })}
                </Typography>
              ) : null}
            </>
          )}
        </span>
      </span>
    </div>
  );
}

function Meter({
  value,
  max,
  effects,
  styles,
  label,
}: {
  value: number;
  max: number;
  effects: ProjectEffectState;
  styles: Readonly<Record<string, string>>;
  label: string;
}) {
  const pct =
    max > 0 && value > 0 ? Math.min(100, Math.max(2, (value / max) * 100)) : 0;

  return (
    <span
      aria-hidden="true"
      className="bg-default/60 relative block h-1 w-full overflow-hidden rounded-full"
      title={label}
    >
      <span
        className={cn(
          "bg-accent absolute inset-y-0 start-0 rounded-full",
          effects.meterFlow ? styles.meterFlow : styles.meter,
        )}
        style={{ width: `${pct}%` }}
      />
    </span>
  );
}

export const ProjectRow = memo(function ProjectRow({
  project,
  copy,
  locale,
  maxTokens,
  windowShare,
  selected,
  index,
  effects,
  styles,
  sources,
  onOpen,
}: RowProps) {
  const {
    formatTokens,
    formatCost,
    formatNumber,
    formatDateTime,
    formatPercent,
  } = useFormat();
  const stagger = {
    "--stagger-delay": `${Math.min(index, 12) * 28}ms`,
  } as CSSProperties;
  const fallbackText =
    windowShare > 0
      ? formatMessage(copy.list.shareOfWindow, locale, {
          percent: formatPercent(windowShare),
        })
      : "";

  return (
    <Button
      aria-label={formatMessage(copy.list.openDetail, locale, {
        project: project.project_key ?? copy.list.unattributed,
      })}
      className={cn(
        "h-auto! min-h-0! w-full justify-start rounded-2xl! p-0! text-start",
        "hover:bg-default/60 active:bg-default",
        styles.row,
        effects.hoverLift && styles.hoverLift,
        effects.selectedRail && selected && styles.selectedRail,
        effects.staggerRows && styles.staggerRow,
      )}
      style={effects.staggerRows ? stagger : undefined}
      variant="ghost"
      onPress={onOpen}
    >
      <span className="flex w-full flex-col">
        <span className="flex w-full items-start justify-between gap-3 px-4 py-3">
          <Identity
            copy={copy}
            fallbackText={fallbackText}
            locale={locale}
            project={project}
            size="sm"
            sources={sources}
            unattributedHint={copy.list.unattributedHint}
          />
          <span className="flex w-24 shrink-0 flex-col items-end gap-2 md:w-32">
            <Typography
              className="tabular-nums"
              type="body-sm"
              weight="semibold"
            >
              {formatTokens(project.total_tokens)}
            </Typography>
            <Meter
              effects={effects}
              label={copy.list.relativeBar}
              max={maxTokens}
              styles={styles}
              value={project.total_tokens}
            />
          </span>
        </span>
        <span className="border-border/60 text-muted flex w-full flex-wrap items-center gap-x-3 gap-y-0.5 border-t px-4 py-2 text-xs">
          <span className="tabular-nums">
            {copy.list.cost} {formatCost(Number(project.total_cost_usd))}
          </span>
          <span className="tabular-nums">
            {copy.list.sessions} {formatNumber(project.session_count)}
          </span>
          {project.last_active ? (
            <span className="hidden tabular-nums sm:inline">
              {copy.list.lastActive} {formatDateTime(project.last_active)}
            </span>
          ) : null}
        </span>
      </span>
    </Button>
  );
});

export const ProjectCardTile = memo(function ProjectCardTile({
  project,
  copy,
  locale,
  maxTokens,
  windowShare,
  selected,
  index,
  effects,
  styles,
  sources,
  onOpen,
}: RowProps) {
  const {
    formatTokens,
    formatCost,
    formatNumber,
    formatDateTime,
    formatPercent,
  } = useFormat();
  const stagger = {
    "--stagger-delay": `${Math.min(index, 12) * 28}ms`,
  } as CSSProperties;
  const fallbackText =
    windowShare > 0
      ? formatMessage(copy.list.shareOfWindow, locale, {
          percent: formatPercent(windowShare),
        })
      : "";

  return (
    <Button
      aria-label={formatMessage(copy.list.openDetail, locale, {
        project: project.project_key ?? copy.list.unattributed,
      })}
      className={cn(
        "border-border bg-surface h-auto! min-h-0! w-full justify-start rounded-3xl! border p-0! text-start",
        "hover:bg-default/60",
        styles.row,
        effects.hoverLift && styles.hoverLift,
        effects.selectedRail && selected && styles.selectedRail,
        effects.staggerRows && styles.staggerRow,
      )}
      style={effects.staggerRows ? stagger : undefined}
      variant="ghost"
      onPress={onOpen}
    >
      <span className="flex w-full flex-col gap-4 p-4">
        <Identity
          copy={copy}
          fallbackText={fallbackText}
          locale={locale}
          project={project}
          size="lg"
          sources={sources}
          unattributedHint={copy.list.unattributedHint}
        />
        <span className="flex flex-col gap-2">
          <Typography className="text-xl tabular-nums" weight="semibold">
            {formatTokens(project.total_tokens)}
          </Typography>
          <Meter
            effects={effects}
            label={copy.list.relativeBar}
            max={maxTokens}
            styles={styles}
            value={project.total_tokens}
          />
        </span>
        <span className="text-muted flex flex-col gap-1 text-xs">
          <span className="tabular-nums">
            {copy.list.cost} {formatCost(Number(project.total_cost_usd))} ·{" "}
            {copy.list.sessions} {formatNumber(project.session_count)}
          </span>
          {project.last_active ? (
            <span className="tabular-nums">
              {copy.list.lastActive} {formatDateTime(project.last_active)}
            </span>
          ) : null}
        </span>
      </span>
    </Button>
  );
});
