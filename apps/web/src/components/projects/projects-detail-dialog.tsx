"use client";

// Project detail modal for /projects: left column = identity + KPIs + caliber
// footnotes, right column = the full list fields, daily bars, token
// composition and per-source breakdown. The data comes from the page-local
// /api/app/projects-detail face; the list row is kept as the fallback source
// for the six original columns when the detail request has not landed yet.
// The header carries the profile actions: open the repository (new tab, no
// opener / referrer) and edit the project profile.

import type { CSSProperties } from "react";
import type {
  ProjectDetailDay,
  ProjectDetailPayload,
  ProjectItem,
  ProjectsCaliber,
} from "@/lib/dashboard/api";
import type { ProjectsCopy } from "@/lib/copy/projects";
import type { ProjectProfile } from "@/lib/projects/profile";
import type { ProjectEffectState } from "./projects-effects";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowLeft,
  ArrowRight,
  CircleQuestion,
  Pencil,
} from "@gravity-ui/icons";
import {
  Button,
  Chip,
  ListBox,
  Modal,
  Popover,
  ScrollShadow,
  Select,
  Skeleton,
  Tooltip,
  Typography,
  cn,
} from "@heroui/react";

import { resolveProjectDisplayName } from "./identity";
import { ProjectLogo } from "./project-logo";
import { RepoHostIcon } from "./repo-host-icon";

import { FlowNumber } from "@/components/flow-number";
import { SourceIcon } from "@/components/source-icon";
import { canonicalSource, sourceDisplayLabel } from "@/lib/sources";
import { formatMessage } from "@/lib/copy/message";
import { AXIS_STYLE, seriesColor } from "@/lib/charts/theme";
import { useFormat } from "@/lib/format/format";
import { repoHostOf } from "@/lib/projects/profile";

export interface ProjectDetailDialogProps {
  project: ProjectItem | null;
  /** Manual profile merged with the CLI-detected repo, when there is one. */
  profile?: ProjectProfile;
  detail: ProjectDetailPayload | null;
  status: "loading" | "ready" | "error";
  copy: ProjectsCopy;
  locale: "zh" | "en";
  caliber: ProjectsCaliber;
  effects: ProjectEffectState;
  styles: Readonly<Record<string, string>>;
  fadeNonce: number;
  chartNonce: number;
  selectedDay: string | null;
  simulatedDetailError: boolean;
  hasPrevious: boolean;
  hasNext: boolean;
  /** Absent in demo mode: the profile editor needs the live API. */
  onEdit?: () => void;
  onClose: () => void;
  onRetry: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onSelectDay: (date: string | null) => void;
}

function AnimatedValue({
  text,
  enabled,
  className,
}: {
  text: string;
  enabled: boolean;
  className?: string;
}) {
  return enabled ? (
    <FlowNumber className={className} text={text} />
  ) : (
    <span className={className}>{text}</span>
  );
}

function StatCell({
  label,
  value,
  hint,
  effects,
}: {
  label: string;
  value: string;
  hint?: string;
  effects: ProjectEffectState;
}) {
  return (
    <span className="flex min-w-0 flex-col gap-1">
      <span className="flex min-w-0 items-center gap-1">
        <Typography color="muted" type="body-xs">
          {label}
        </Typography>
        {hint ? (
          <Tooltip delay={0}>
            <Button
              isIconOnly
              aria-label={hint}
              className="text-muted hover:text-foreground size-4 min-h-4 min-w-4 shrink-0 rounded-full"
              size="sm"
              variant="tertiary"
            >
              <CircleQuestion aria-hidden="true" className="size-3.5" />
            </Button>
            <Tooltip.Content showArrow placement="top">
              <Tooltip.Arrow />
              <Typography className="max-w-56" type="body-xs">
                {hint}
              </Typography>
            </Tooltip.Content>
          </Tooltip>
        ) : null}
      </span>
      <Typography className="tabular-nums" type="body-sm" weight="semibold">
        <AnimatedValue enabled={effects.flowNumbers} text={value} />
      </Typography>
    </span>
  );
}

function FieldCell({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex min-w-0 items-baseline justify-between gap-2">
      <Typography color="muted" type="body-xs">
        {label}
      </Typography>
      <Typography className="tabular-nums" type="body-xs" weight="medium">
        {value}
      </Typography>
    </span>
  );
}

function Composition({
  detail,
  copy,
  formatTokens,
}: {
  detail: ProjectDetailPayload;
  copy: ProjectsCopy;
  formatTokens: (value: unknown) => string;
}) {
  const segments: Array<[string, number]> = [
    [copy.detail.input, detail.totals.input_tokens],
    [copy.detail.cached, detail.totals.cached_input_tokens],
    [copy.detail.cacheCreation, detail.totals.cache_creation_input_tokens],
    [copy.detail.output, detail.totals.output_tokens],
    [copy.detail.reasoning, detail.totals.reasoning_output_tokens],
  ];
  const total = segments.reduce(
    (sum, [, value]) => sum + Math.max(0, value),
    0,
  );

  if (total <= 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <Typography type="body-sm" weight="semibold">
        {copy.detail.composition}
      </Typography>
      <span className="bg-default/60 flex h-1.5 w-full overflow-hidden rounded-full">
        {segments.map(([label, value], index) =>
          value > 0 ? (
            <span
              key={label}
              className="h-full"
              style={{
                width: `${(value / total) * 100}%`,
                minWidth: 2,
                backgroundColor: seriesColor(index),
              }}
            />
          ) : null,
        )}
      </span>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {segments.map(([label, value], index) => (
          <span key={label} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="size-1.5 rounded-full"
              style={{
                backgroundColor: seriesColor(index),
              }}
            />
            <Typography color="muted" type="body-xs">
              {label}
            </Typography>
            <Typography className="tabular-nums" type="body-xs" weight="medium">
              {formatTokens(value)}
            </Typography>
          </span>
        ))}
      </div>
    </div>
  );
}

function DailyBars({
  daily,
  selectedDay,
  onSelectDay,
  copy,
  effects,
  chartNonce,
  formatTokens,
}: {
  daily: ProjectDetailDay[];
  selectedDay: string | null;
  onSelectDay: (date: string | null) => void;
  copy: ProjectsCopy;
  effects: ProjectEffectState;
  chartNonce: number;
  formatTokens: (value: unknown) => string;
}) {
  if (daily.length === 0) return null;

  return (
    <div
      aria-label={copy.detail.chartLabel}
      className="text-foreground/50 h-44 w-full"
      role="img"
    >
      <ResponsiveContainer height="100%" width="100%">
        <BarChart
          key={chartNonce}
          data={daily}
          margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          onClick={(state) => {
            if (!effects.dayDrilldown) return;
            const label = (state as { activeLabel?: string | number })
              ?.activeLabel;

            if (typeof label === "string") {
              onSelectDay(selectedDay === label ? null : label);
            }
          }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="date"
            minTickGap={24}
            tick={{ ...AXIS_STYLE }}
            tickFormatter={(value: string) => value.slice(5)}
          />
          <YAxis
            tick={{ ...AXIS_STYLE }}
            tickFormatter={(value: number) => formatTokens(value)}
            width={56}
          />
          <ChartTooltip
            content={(props) => {
              const payload = (
                props as unknown as {
                  payload?: Array<{ payload?: ProjectDetailDay }>;
                }
              ).payload;
              const point = payload?.[0]?.payload;

              if (!point) return null;

              return (
                <div className="bg-surface text-foreground border-border rounded-2xl border p-2 text-xs shadow-sm">
                  <div className="tabular-nums font-medium">{point.date}</div>
                  <div className="tabular-nums">
                    {formatTokens(point.total_tokens)} ·{" "}
                    {point.conversation_count}
                  </div>
                </div>
              );
            }}
            cursor={{ opacity: 0.08 }}
          />
          <Bar
            dataKey="total_tokens"
            fill={seriesColor(0)}
            isAnimationActive={effects.chartBars}
            radius={[3, 3, 0, 0]}
          >
            {daily.map((day) => (
              <Cell
                key={day.date}
                fillOpacity={
                  selectedDay == null || selectedDay === day.date ? 1 : 0.35
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function SourceRows({
  detail,
  dayPoint,
  copy,
  locale,
  formatTokens,
  formatPercent,
}: {
  detail: ProjectDetailPayload;
  dayPoint: ProjectDetailDay | null;
  copy: ProjectsCopy;
  locale: "zh" | "en";
  formatTokens: (value: unknown) => string;
  formatPercent: (value: unknown) => string;
}) {
  const denominator = dayPoint
    ? dayPoint.total_tokens
    : detail.totals.total_tokens;
  // A day's payload is keyed by raw collector id, and aliases (pi /
  // pi-stepfun) are one vendor: fold them so the source list never shows two
  // "Pi" rows.
  const daySources = new Map<string, number>();

  if (dayPoint) {
    for (const [source, value] of Object.entries(dayPoint.sources)) {
      if (value <= 0) continue;
      const id = canonicalSource(source);

      daySources.set(id, (daySources.get(id) ?? 0) + value);
    }
  }

  const rows = dayPoint
    ? [...daySources.entries()]
        .map(([source, value]) => ({
          source,
          total_tokens: value,
          conversation_count: dayPoint.conversation_count,
          days_active: 1,
        }))
        .sort((first, second) => second.total_tokens - first.total_tokens)
    : detail.sources;

  if (rows.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <Typography type="body-sm" weight="semibold">
        {copy.detail.sources}
      </Typography>
      <div className="flex flex-col gap-3">
        {rows.map((row) => {
          const share = denominator > 0 ? row.total_tokens / denominator : 0;

          return (
            <div key={row.source} className="flex flex-col gap-1.5">
              <div className="flex min-w-0 items-center gap-2">
                <SourceIcon label={row.source} size={13} />
                <Typography className="truncate" type="body-xs" weight="medium">
                  {sourceDisplayLabel(row.source)}
                </Typography>
                <Typography
                  className="hidden sm:inline"
                  color="muted"
                  type="body-xs"
                >
                  {formatMessage(copy.detail.sourceDays, locale, {
                    count: String(row.days_active),
                  })}
                  {row.conversation_count > 0
                    ? ` · ${formatMessage(
                        copy.detail.sourceConversations,
                        locale,
                        {
                          count: String(row.conversation_count),
                        },
                      )}`
                    : ""}
                </Typography>
                <Typography
                  className="ms-auto tabular-nums"
                  type="body-xs"
                  weight="medium"
                >
                  {formatTokens(row.total_tokens)}
                </Typography>
                <Typography
                  className="w-12 text-end tabular-nums"
                  color="muted"
                  type="body-xs"
                >
                  {formatPercent(share)}
                </Typography>
              </div>
              <span className="bg-default/60 block h-1 w-full overflow-hidden rounded-full">
                <span
                  className="block h-full rounded-full"
                  style={{
                    width: `${Math.min(100, Math.max(share * 100, row.total_tokens > 0 ? 1 : 0))}%`,
                    backgroundColor: seriesColor(0),
                  }}
                />
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Deterministic bar heights so the chart placeholder reads as a chart instead
// of a solid block; varied heights also survive the shimmer sweep.
const DETAIL_BAR_HEIGHTS = [
  38, 61, 45, 77, 54, 86, 47, 66, 41, 72, 58, 83, 49, 68,
] as const;

function DetailSkeletonBar({
  className,
  effects,
  styles,
  style,
}: {
  className?: string;
  effects: ProjectEffectState;
  styles: Readonly<Record<string, string>>;
  style?: CSSProperties;
}) {
  return (
    <Skeleton
      aria-hidden="true"
      className={cn(className, effects.skeletonShimmer && styles.shimmer)}
      style={style}
    />
  );
}

/** Detail-loading placeholder: mirrors the fields grid, the daily chart plus
 *  its composition strip, and the per-source bars so the loaded content drops
 *  into the same slots without a jump. */
function DetailSkeleton({
  copy,
  effects,
  styles,
}: {
  copy: ProjectsCopy;
  effects: ProjectEffectState;
  styles: Readonly<Record<string, string>>;
}) {
  return (
    <div
      aria-busy="true"
      aria-label={copy.detail.title}
      className="flex flex-col"
    >
      <section className="border-border/60 flex flex-col gap-3 border-b px-5 py-5 md:px-6">
        <DetailSkeletonBar
          className="h-4 w-20 rounded-full"
          effects={effects}
          styles={styles}
        />
        <div className="grid grid-cols-1 gap-x-8 gap-y-2.5 sm:grid-cols-2">
          {Array.from({ length: 6 }, (_, index) => (
            <div
              key={index}
              className="flex items-baseline justify-between gap-2"
            >
              <DetailSkeletonBar
                className="h-3 w-16 rounded-full"
                effects={effects}
                styles={styles}
              />
              <DetailSkeletonBar
                className={cn(
                  "h-3 rounded-full",
                  index % 2 === 0 ? "w-24" : "w-16",
                )}
                effects={effects}
                styles={styles}
              />
            </div>
          ))}
        </div>
      </section>

      <section className="border-border/60 flex flex-col gap-3 border-b px-5 py-5 md:px-6">
        <div className="flex items-center gap-2">
          <DetailSkeletonBar
            className="h-4 w-20 rounded-full"
            effects={effects}
            styles={styles}
          />
          <DetailSkeletonBar
            className="ms-auto h-3 w-32 rounded-full"
            effects={effects}
            styles={styles}
          />
        </div>
        <div className="flex h-44 w-full items-end gap-1.5">
          {DETAIL_BAR_HEIGHTS.map((height, index) => (
            <DetailSkeletonBar
              key={index}
              className={cn(
                "w-full rounded-t-[3px]",
                index > 8 && "hidden sm:block",
              )}
              effects={effects}
              style={{ height: `${height}%` }}
              styles={styles}
            />
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <DetailSkeletonBar
            className="h-4 w-24 rounded-full"
            effects={effects}
            styles={styles}
          />
          <DetailSkeletonBar
            className="h-1.5 w-full rounded-full"
            effects={effects}
            styles={styles}
          />
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {Array.from({ length: 4 }, (_, index) => (
              <DetailSkeletonBar
                key={index}
                className="h-3 w-20 rounded-full"
                effects={effects}
                styles={styles}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 py-5 md:px-6">
        <div className="flex flex-col gap-3">
          <DetailSkeletonBar
            className="h-4 w-16 rounded-full"
            effects={effects}
            styles={styles}
          />
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="flex flex-col gap-1.5">
              <div className="flex min-w-0 items-center gap-2">
                <DetailSkeletonBar
                  className="size-3.5 rounded-[4px]"
                  effects={effects}
                  styles={styles}
                />
                <DetailSkeletonBar
                  className="h-3 w-28 rounded-full"
                  effects={effects}
                  styles={styles}
                />
                <DetailSkeletonBar
                  className="ms-auto h-3 w-16 rounded-full"
                  effects={effects}
                  styles={styles}
                />
                <DetailSkeletonBar
                  className="h-3 w-10 rounded-full"
                  effects={effects}
                  styles={styles}
                />
              </div>
              <DetailSkeletonBar
                className="h-1 w-full rounded-full"
                effects={effects}
                styles={styles}
              />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export function ProjectDetailDialog(props: ProjectDetailDialogProps) {
  const {
    project,
    profile,
    detail,
    status,
    copy,
    locale,
    caliber,
    effects,
    styles,
    fadeNonce,
    chartNonce,
    selectedDay,
    simulatedDetailError,
    hasPrevious,
    hasNext,
    onEdit,
    onClose,
    onRetry,
    onPrevious,
    onNext,
    onSelectDay,
  } = props;
  const {
    formatTokens,
    formatCost,
    formatNumber,
    formatDate,
    formatDateTime,
    formatPercent,
    formatCredits,
  } = useFormat();
  const open = project != null;
  const failed = status === "error" || simulatedDetailError;
  const loading = status === "loading" && !failed;
  const projectKey = project?.project_key ?? null;
  const name = projectKey
    ? resolveProjectDisplayName(projectKey, profile)
    : copy.list.unattributed;
  const repoUrl = projectKey ? (profile?.repo_url ?? null) : null;
  const repoHost = repoUrl ? repoHostOf(repoUrl) : null;
  const tokens = detail?.totals.total_tokens ?? project?.total_tokens ?? 0;
  const share =
    detail && detail.range_total_tokens > 0
      ? tokens / detail.range_total_tokens
      : 0;
  const avg =
    detail && detail.days_active > 0 ? tokens / detail.days_active : 0;
  const sessionsLabel =
    caliber === "hourly" ? copy.list.sessionsHourly : copy.list.sessions;
  const dayPoint = selectedDay
    ? (detail?.daily.find((day) => day.date === selectedDay) ?? null)
    : null;
  // Days the picker can jump to: every day with usage, plus the pinned day
  // even when it is a zero bar (clicking an empty bar pins it too).
  const dayOptions = detail
    ? detail.daily.filter(
        (day) => day.total_tokens > 0 || day.date === selectedDay,
      )
    : [];

  return (
    <Modal.Backdrop
      isOpen={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Modal.Container scroll="inside">
        <Modal.Dialog
          className={cn(
            "max-h-[92vh] w-[calc(100vw-1rem)] max-w-4xl p-0",
            styles.dialogSurface,
            effects.dialogEntrance && styles.dialogEntrance,
          )}
        >
          {/* Matches the 32px tertiary icon buttons in the header row. */}
          <Modal.CloseTrigger
            aria-label={copy.detail.close}
            className="end-4 top-3! size-9! rounded-3xl! p-0! md:size-8!"
          />
          <Modal.Header className="border-border/60 flex-row items-center gap-2 border-b ps-4 pe-14 py-3">
            <Modal.Heading className="text-base">
              {copy.detail.title}
            </Modal.Heading>
            <div className="ms-auto flex items-center gap-1">
              {repoUrl && repoHost ? (
                <Button
                  isIconOnly
                  aria-label={copy.profile.openRepo[repoHost]}
                  size="sm"
                  variant="tertiary"
                  onPress={() =>
                    window.open(repoUrl, "_blank", "noopener,noreferrer")
                  }
                >
                  <RepoHostIcon className="size-4" host={repoHost} />
                </Button>
              ) : null}
              {projectKey && onEdit ? (
                <Button
                  isIconOnly
                  aria-label={copy.profile.edit}
                  size="sm"
                  variant="tertiary"
                  onPress={onEdit}
                >
                  <Pencil aria-hidden="true" className="size-4" />
                </Button>
              ) : null}
              <Button
                isIconOnly
                aria-label={copy.detail.previous}
                isDisabled={!hasPrevious}
                size="sm"
                variant="tertiary"
                onPress={onPrevious}
              >
                <ArrowLeft aria-hidden="true" className="size-4" />
              </Button>
              <Button
                isIconOnly
                aria-label={copy.detail.next}
                isDisabled={!hasNext}
                size="sm"
                variant="tertiary"
                onPress={onNext}
              >
                <ArrowRight aria-hidden="true" className="size-4" />
              </Button>
            </div>
          </Modal.Header>

          <Modal.Body className="m-0! flex flex-col overflow-hidden! p-0!">
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
              <div
                key={fadeNonce}
                className="border-border/60 bg-default/40 flex shrink-0 flex-col gap-4 border-b p-5 lg:min-h-0 lg:w-70 lg:overflow-y-auto lg:border-b-0 lg:border-e lg:p-6"
              >
                <div className="flex flex-col gap-1">
                  <div className="flex min-w-0 items-center gap-3">
                    <ProjectLogo
                      name={projectKey ? name : null}
                      profile={profile}
                      size="lg"
                    />
                    <div className="flex min-w-0 flex-col">
                      <Typography
                        className="truncate text-xl"
                        weight="semibold"
                      >
                        {name}
                      </Typography>
                      {projectKey && profile?.display_name ? (
                        <Typography
                          className="truncate"
                          color="muted"
                          type="body-xs"
                        >
                          {formatMessage(copy.profile.directory, locale, {
                            name: projectKey,
                          })}
                        </Typography>
                      ) : null}
                    </div>
                  </div>
                  <Typography
                    className="tabular-nums"
                    color="muted"
                    type="body-xs"
                  >
                    {detail
                      ? formatMessage(copy.summary.period, locale, {
                          from: detail.from,
                          to: detail.to,
                        })
                      : "—"}
                  </Typography>
                  <Typography color="muted" type="body-xs">
                    {formatMessage(copy.detail.caliberNote, locale, {
                      caliber,
                    })}
                  </Typography>
                </div>
                <div className="border-border/60 grid grid-cols-2 gap-x-5 gap-y-4 border-t pt-4">
                  <StatCell
                    effects={effects}
                    label={copy.detail.total}
                    value={formatTokens(tokens)}
                  />
                  <StatCell
                    effects={effects}
                    hint={copy.detail.shareHint}
                    label={copy.detail.share}
                    value={detail ? formatPercent(share) : "—"}
                  />
                  <StatCell
                    effects={effects}
                    label={copy.detail.cost}
                    value={formatCost(
                      Number(
                        detail?.totals.total_cost_usd ??
                          project?.total_cost_usd ??
                          0,
                      ),
                    )}
                  />
                  <StatCell
                    effects={effects}
                    label={sessionsLabel}
                    value={formatNumber(
                      detail?.totals.conversation_count ??
                        project?.session_count ??
                        0,
                    )}
                  />
                  <StatCell
                    effects={effects}
                    label={copy.detail.activeDays}
                    value={detail ? formatNumber(detail.days_active) : "—"}
                  />
                  <StatCell
                    effects={effects}
                    label={copy.detail.avgPerActiveDay}
                    value={avg > 0 ? formatTokens(Math.round(avg)) : "—"}
                  />
                </div>
                <div className="border-border/60 flex flex-col gap-1.5 border-t pt-4">
                  <Typography color="muted" type="body-xs">
                    {copy.detail.costNote}
                  </Typography>
                  <Typography color="muted" type="body-xs">
                    {copy.detail.creditsNote}
                  </Typography>
                  <Typography color="muted" type="body-xs">
                    {copy.detail.privacyNote}
                  </Typography>
                </div>
              </div>

              <ScrollShadow
                key={fadeNonce}
                className={cn(
                  "flex min-w-0 flex-col lg:min-h-0 lg:flex-1",
                  effects.detailCrossfade && styles.detailFade,
                )}
                size={24}
              >
                {failed ? (
                  <div className="flex flex-col items-start gap-2 p-6">
                    <Typography className="text-danger" type="body-sm">
                      {copy.detail.loadError}
                    </Typography>
                    <Button size="sm" variant="outline" onPress={onRetry}>
                      {copy.detail.retry}
                    </Button>
                  </div>
                ) : loading ? (
                  <DetailSkeleton
                    copy={copy}
                    effects={effects}
                    styles={styles}
                  />
                ) : detail && tokens === 0 ? (
                  <div
                    className={cn(
                      "text-muted flex h-64 items-center justify-center p-6 text-sm",
                      effects.stateMotion && styles.stateFade,
                    )}
                  >
                    {copy.detail.empty}
                  </div>
                ) : detail ? (
                  <>
                    <section className="border-border/60 flex flex-col gap-3 border-b px-5 py-5 md:px-6">
                      <Typography type="body-sm" weight="semibold">
                        {copy.detail.fields}
                      </Typography>
                      <div className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
                        <FieldCell
                          label={copy.list.dayPeak}
                          value={
                            project?.day_peak
                              ? `${formatTokens(project.day_peak.total_tokens)} · ${formatDate(project.day_peak.date, { dateStyle: "medium", timeZone: "UTC" })}`
                              : "—"
                          }
                        />
                        <FieldCell
                          label={copy.list.lastActive}
                          value={
                            project?.last_active
                              ? formatDateTime(project.last_active)
                              : "—"
                          }
                        />
                        {detail.totals.credits > 0 ? (
                          <FieldCell
                            label={copy.detail.credits}
                            value={formatCredits(detail.totals.credits)}
                          />
                        ) : null}
                      </div>
                    </section>

                    <section className="border-border/60 flex flex-col gap-3 border-b px-5 py-5 md:px-6">
                      <div className="flex flex-wrap items-center gap-2">
                        <Typography type="body-sm" weight="semibold">
                          {copy.detail.daily}
                        </Typography>
                        {detail.days > detail.daily.length ? (
                          <Typography color="muted" type="body-xs">
                            {formatMessage(copy.detail.dailyHint, locale, {
                              days: String(detail.daily.length),
                            })}
                          </Typography>
                        ) : null}
                        <div className="ms-auto flex items-center gap-2">
                          <Typography
                            className="hidden sm:inline"
                            color="muted"
                            type="body-xs"
                          >
                            {copy.detail.pinHint}
                          </Typography>
                          {/* Keyboard/touch equivalent of clicking a bar: the
                              chart itself is role="img" and unreachable. */}
                          <Select
                            aria-label={copy.detail.daySelect}
                            className="w-32"
                            value={selectedDay ?? "__all"}
                            variant="secondary"
                            onChange={(key) => {
                              const next = key == null ? "__all" : String(key);

                              onSelectDay(next === "__all" ? null : next);
                            }}
                          >
                            <Select.Trigger>
                              <Select.Value>
                                {({ selectedText }) => (
                                  <span className="truncate">
                                    {selectedText}
                                  </span>
                                )}
                              </Select.Value>
                              <Select.Indicator />
                            </Select.Trigger>
                            <Select.Popover>
                              <Popover.Arrow />
                              <ListBox>
                                <ListBox.Item
                                  id="__all"
                                  textValue={copy.detail.dayAll}
                                >
                                  {copy.detail.dayAll}
                                </ListBox.Item>
                                {dayOptions.map((day) => (
                                  <ListBox.Item
                                    key={day.date}
                                    id={day.date}
                                    textValue={day.date}
                                  >
                                    {day.date}
                                  </ListBox.Item>
                                ))}
                              </ListBox>
                            </Select.Popover>
                          </Select>
                        </div>
                      </div>
                      {selectedDay ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <Chip size="sm" variant="soft">
                            {formatMessage(copy.detail.daySelected, locale, {
                              date: selectedDay,
                            })}
                          </Chip>
                          {dayPoint ? (
                            <Typography
                              className="tabular-nums"
                              color="muted"
                              type="body-xs"
                            >
                              {formatTokens(dayPoint.total_tokens)} ·{" "}
                              {formatNumber(dayPoint.conversation_count)} ·{" "}
                              {formatCost(Number(dayPoint.total_cost_usd))}
                            </Typography>
                          ) : null}
                          <Button
                            size="sm"
                            variant="tertiary"
                            onPress={() => onSelectDay(null)}
                          >
                            {copy.detail.dayClear}
                          </Button>
                        </div>
                      ) : null}
                      <DailyBars
                        chartNonce={chartNonce}
                        copy={copy}
                        daily={detail.daily}
                        effects={effects}
                        formatTokens={formatTokens}
                        selectedDay={selectedDay}
                        onSelectDay={onSelectDay}
                      />
                      <Composition
                        copy={copy}
                        detail={detail}
                        formatTokens={formatTokens}
                      />
                    </section>

                    <section className="px-5 py-5 md:px-6">
                      <SourceRows
                        copy={copy}
                        dayPoint={dayPoint}
                        detail={detail}
                        formatPercent={formatPercent}
                        formatTokens={formatTokens}
                        locale={locale}
                      />
                    </section>
                  </>
                ) : (
                  <div className="text-muted flex h-64 items-center justify-center p-6 text-sm">
                    {copy.detail.empty}
                  </div>
                )}
              </ScrollShadow>
            </div>
          </Modal.Body>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
