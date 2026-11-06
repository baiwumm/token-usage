"use client";

// Page-local list surface for /projects. It deliberately does not reuse the
// shared table card: this page has its own list/card language, its own three
// states and its own review-mode effect switches (operator decision
// 2026-11-05 — no other page adopts these components).

import type { CSSProperties } from "react";
import type { ProjectsPayload, ProjectItem } from "@/lib/dashboard/api";
import type { ProjectsCopy } from "@/lib/copy/projects";
import type { ProjectProfile } from "@/lib/projects/profile";
import type { ProjectEffectState } from "./projects-effects";
import type { ProjectLimit } from "./projects-filters";

import { Folder } from "@gravity-ui/icons";
import { Button, Card, Skeleton, Spinner, Typography, cn } from "@heroui/react";
import { useRouter } from "next/navigation";

import { ProjectCardTile, ProjectRow, type ProjectView } from "./projects-row";
import { sliceProjects } from "./projects-filters";

import { formatMessage } from "@/lib/copy/message";
import { README_URL } from "@/lib/links";
import { useFormat } from "@/lib/format/format";
import { SectionError } from "@/components/section-states";
import { StaleDataBanner } from "@/components/stale-data-banner";

export interface ProjectsBodyProps {
  copy: ProjectsCopy;
  locale: "zh" | "en";
  payload: ProjectsPayload | null;
  /** Project profiles by project_key (logo, repo, display name). */
  profiles: ReadonlyMap<string, ProjectProfile>;
  status: "loading" | "ready" | "error";
  refreshing: boolean;
  view: ProjectView;
  sortLabel: string;
  /** Caliber-aware "Sessions" label: session rows vs hourly bucket entries. */
  sessionsLabel: string;
  limit: ProjectLimit;
  effects: ProjectEffectState;
  styles: Readonly<Record<string, string>>;
  selectedKey: string | null;
  replayNonce: number;
  simulatedState:
    "ready" | "loading" | "empty" | "error" | "detailError" | null;
  onOpen: (project: ProjectItem) => void;
  onRetry: () => void;
}

function Summary({
  payload,
  copy,
  locale,
  effects,
  styles,
}: Pick<
  ProjectsBodyProps,
  "payload" | "copy" | "locale" | "effects" | "styles"
>) {
  const { formatTokens, formatCost, formatNumber } = useFormat();

  if (!payload) return null;

  const cells: Array<[string, string]> = [
    [copy.summary.tokens, formatTokens(payload.totals.attributed_tokens)],
    [copy.summary.cost, formatCost(Number(payload.totals.attributed_cost_usd))],
    [copy.summary.projects, formatNumber(payload.attributed_projects)],
    [
      copy.summary.unattributed,
      formatTokens(payload.totals.unattributed_tokens),
    ],
  ];

  return (
    <Card className="p-4 md:p-6">
      <Card.Header className="flex-col items-start gap-1">
        <Card.Title>{copy.summary.title}</Card.Title>
        <Typography color="muted" type="body-xs">
          {formatMessage(copy.summary.allTime, locale, {
            from: payload.from,
            to: payload.to,
          })}
        </Typography>
      </Card.Header>
      <Card.Content className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {cells.map(([label, value]) => (
          <span
            key={label}
            className={cn(
              "flex flex-col gap-1",
              effects.stateMotion && styles.stateFade,
            )}
          >
            <Typography color="muted" type="body-xs">
              {label}
            </Typography>
            <Typography
              className="tabular-nums"
              type="body-sm"
              weight="semibold"
            >
              {value}
            </Typography>
          </span>
        ))}
      </Card.Content>
    </Card>
  );
}

function SkeletonBar({
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

/** Mirrors the summary card (title + period line + four label/value cells) so
 *  the card does not pop in above the list once the payload lands. */
function SummarySkeleton({
  copy,
  effects,
  styles,
}: Pick<ProjectsBodyProps, "copy" | "effects" | "styles">) {
  return (
    <Card
      aria-busy="true"
      aria-label={copy.summary.title}
      className="p-4 md:p-6"
    >
      <Card.Header className="flex-col items-start gap-1">
        <SkeletonBar
          className="h-5 w-24 rounded-full"
          effects={effects}
          styles={styles}
        />
        <SkeletonBar
          className="h-3 w-52 rounded-full"
          effects={effects}
          styles={styles}
        />
      </Card.Header>
      <Card.Content className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <span key={index} className="flex flex-col gap-1.5">
            <SkeletonBar
              className="h-3 w-16 rounded-full"
              effects={effects}
              styles={styles}
            />
            <SkeletonBar
              className="h-3.5 w-24 rounded-full"
              effects={effects}
              styles={styles}
            />
          </span>
        ))}
      </Card.Content>
    </Card>
  );
}

// Deterministic width rotation keeps the placeholder rows from looking stamped
// while still rendering identically on every load.
const SKELETON_NAME_WIDTHS = [
  "w-32",
  "w-24",
  "w-40",
  "w-28",
  "w-36",
  "w-20",
] as const;

/** Same anatomy as ProjectRow: avatar + two text lines, right token/meter
 *  column, then the hairline meta strip. */
function RowSkeleton({
  effects,
  index,
  styles,
}: Pick<ProjectsBodyProps, "effects" | "styles"> & { index: number }) {
  return (
    <div className="flex w-full flex-col">
      <div className="flex w-full items-start justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <SkeletonBar
            className="size-8 shrink-0 rounded-xl"
            effects={effects}
            styles={styles}
          />
          <span className="flex flex-col gap-1.5">
            <SkeletonBar
              className={cn(
                "h-3.5 rounded-full",
                SKELETON_NAME_WIDTHS[index % SKELETON_NAME_WIDTHS.length],
              )}
              effects={effects}
              styles={styles}
            />
            <SkeletonBar
              className="h-2.5 w-44 rounded-full"
              effects={effects}
              styles={styles}
            />
          </span>
        </div>
        <span className="flex w-24 shrink-0 flex-col items-end gap-2 md:w-32">
          <SkeletonBar
            className="h-3.5 w-16 rounded-full"
            effects={effects}
            styles={styles}
          />
          <SkeletonBar
            className="h-1 w-full rounded-full"
            effects={effects}
            styles={styles}
          />
        </span>
      </div>
      <div className="border-border/60 flex w-full flex-wrap items-center gap-x-3 gap-y-0.5 border-t px-4 py-2">
        <SkeletonBar
          className="h-2.5 w-20 rounded-full"
          effects={effects}
          styles={styles}
        />
        <SkeletonBar
          className="h-2.5 w-16 rounded-full"
          effects={effects}
          styles={styles}
        />
        <SkeletonBar
          className="hidden h-2.5 w-28 rounded-full sm:block"
          effects={effects}
          styles={styles}
        />
      </div>
    </div>
  );
}

/** Same anatomy as ProjectCardTile: identity block, big value + meter, meta
 *  lines, all inside the bordered card shell. */
function CardTileSkeleton({
  effects,
  index,
  styles,
}: Pick<ProjectsBodyProps, "effects" | "styles"> & { index: number }) {
  return (
    <div className="border-border bg-surface flex w-full flex-col gap-4 rounded-3xl border p-4">
      <div className="flex min-w-0 items-center gap-3">
        <SkeletonBar
          className="size-10 shrink-0 rounded-xl"
          effects={effects}
          styles={styles}
        />
        <span className="flex flex-col gap-1.5">
          <SkeletonBar
            className={cn(
              "h-3.5 rounded-full",
              SKELETON_NAME_WIDTHS[index % SKELETON_NAME_WIDTHS.length],
            )}
            effects={effects}
            styles={styles}
          />
          <SkeletonBar
            className="h-2.5 w-40 rounded-full"
            effects={effects}
            styles={styles}
          />
        </span>
      </div>
      <span className="flex flex-col gap-2">
        <SkeletonBar
          className="h-5 w-24 rounded-full"
          effects={effects}
          styles={styles}
        />
        <SkeletonBar
          className="h-1 w-full rounded-full"
          effects={effects}
          styles={styles}
        />
      </span>
      <span className="flex flex-col gap-1.5">
        <SkeletonBar
          className="h-2.5 w-40 rounded-full"
          effects={effects}
          styles={styles}
        />
        <SkeletonBar
          className="h-2.5 w-28 rounded-full"
          effects={effects}
          styles={styles}
        />
      </span>
    </div>
  );
}

function ListSkeleton({
  copy,
  effects,
  styles,
  view,
}: Pick<ProjectsBodyProps, "copy" | "effects" | "styles" | "view">) {
  if (view === "cards") {
    return (
      <div
        aria-busy="true"
        aria-label={copy.list.title}
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
      >
        {Array.from({ length: 6 }, (_, index) => (
          <CardTileSkeleton
            key={index}
            effects={effects}
            index={index}
            styles={styles}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      aria-busy="true"
      aria-label={copy.list.title}
      className="flex flex-col gap-2"
    >
      {Array.from({ length: 6 }, (_, index) => (
        <RowSkeleton
          key={index}
          effects={effects}
          index={index}
          styles={styles}
        />
      ))}
    </div>
  );
}

function EmptyState({
  copy,
  effects,
  styles,
  onRetry,
  filtered,
}: Pick<ProjectsBodyProps, "copy" | "effects" | "styles" | "onRetry"> & {
  filtered: boolean;
}) {
  const router = useRouter();

  return (
    <div
      className={cn(
        "flex flex-col items-start gap-2 py-8",
        effects.stateMotion && styles.stateFade,
      )}
    >
      <Folder aria-hidden="true" className="text-muted size-6" />
      <Typography type="body-sm" weight="semibold">
        {filtered ? copy.states.emptyFilterTitle : copy.states.emptyTitle}
      </Typography>
      <Typography className="max-w-2xl" color="muted" type="body-sm">
        {filtered ? copy.states.emptyFilterBody : copy.states.emptyBody}
      </Typography>
      <div className="flex flex-wrap gap-2 pt-1">
        <Button
          size="sm"
          onPress={filtered ? onRetry : () => router.push("/device")}
        >
          {filtered ? copy.states.emptyFilterAction : copy.states.emptyPair}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onPress={() =>
            window.open(README_URL, "_blank", "noopener,noreferrer")
          }
        >
          {copy.states.emptyDocs}
        </Button>
      </div>
    </div>
  );
}

export function ProjectsBody(props: ProjectsBodyProps) {
  const {
    copy,
    locale,
    payload,
    profiles,
    status,
    refreshing,
    view,
    sortLabel,
    sessionsLabel,
    limit,
    effects,
    styles,
    selectedKey,
    replayNonce,
    simulatedState,
    onOpen,
    onRetry,
  } = props;
  const allProjects = payload?.projects ?? [];
  const projects = sliceProjects(allProjects, limit);
  // Counts exclude the pinned unattributed group: it carries usage the
  // collector could not attribute, so it is not a project. The row itself
  // still renders, and its tokens stay in the separate summary cell.
  const projectTotal = payload?.attributed_projects ?? 0;
  const shownCount = projects.filter(
    (project) => project.project_key != null,
  ).length;
  // The meter is "relative to the top project (not a share)": the denominator
  // is the largest attributed project in the visible list. Unattributed is
  // excluded because hourly buckets often make it the largest row by far,
  // which would squash every project bar to near zero.
  const maxTokens = projects.reduce(
    (max, project) =>
      project.project_key != null ? Math.max(max, project.total_tokens) : max,
    0,
  );
  // Same denominator as the detail modal's "share of total": every token in
  // the window, unattributed included.
  const windowTotal = payload
    ? payload.totals.attributed_tokens + payload.totals.unattributed_tokens
    : 0;
  const isLoading =
    simulatedState === "loading" || (status === "loading" && !payload);
  const isEmpty =
    simulatedState === "empty" || (!isLoading && allProjects.length === 0);
  const isError =
    simulatedState === "error" || (status === "error" && !payload);
  const stale = status === "error" && payload != null && simulatedState == null;
  const filtered =
    payload != null && allProjects.length === 0 && payload.total > 0;

  return (
    <div className="flex flex-col gap-4">
      {payload ? (
        <Summary
          copy={copy}
          effects={effects}
          locale={locale}
          payload={payload}
          styles={styles}
        />
      ) : isLoading ? (
        <SummarySkeleton copy={copy} effects={effects} styles={styles} />
      ) : null}

      <Card className="p-4 md:p-6">
        <Card.Header className="flex-col items-start gap-1">
          <Card.Title>{copy.list.title}</Card.Title>
          {isLoading ? (
            <SkeletonBar
              className="h-3 w-64 rounded-full"
              effects={effects}
              styles={styles}
            />
          ) : (
            <Typography color="muted" type="body-xs">
              {limit === "all"
                ? formatMessage(copy.list.count, locale, {
                    count: String(projectTotal),
                  })
                : formatMessage(copy.list.showing, locale, {
                    count: String(shownCount),
                    total: String(projectTotal),
                  })}{" "}
              · {formatMessage(copy.list.sortedBy, locale, { sort: sortLabel })}{" "}
              · {copy.list.relativeBar}
            </Typography>
          )}
        </Card.Header>

        <Card.Content className="relative flex flex-col gap-2">
          {stale ? (
            <StaleDataBanner
              className={cn(effects.stateMotion && styles.errorSlide)}
              message={copy.states.stale}
              retry={onRetry}
              retryLabel={copy.states.retry}
            />
          ) : null}

          {isError ? (
            <SectionError
              message={copy.states.loadError}
              retry={onRetry}
              retryLabel={copy.states.retry}
            />
          ) : isLoading ? (
            <ListSkeleton
              copy={copy}
              effects={effects}
              styles={styles}
              view={view}
            />
          ) : isEmpty ? (
            <EmptyState
              copy={copy}
              effects={effects}
              filtered={filtered && simulatedState == null}
              styles={styles}
              onRetry={onRetry}
            />
          ) : (
            <div
              key={replayNonce}
              className={cn(
                view === "cards"
                  ? "grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
                  : "flex flex-col gap-2",
              )}
            >
              {projects.map((project, index) => {
                const key = project.project_key ?? "__unattributed";
                const shared = {
                  copy,
                  effects,
                  index,
                  locale,
                  sessionsLabel,
                  maxTokens,
                  profile: project.project_key
                    ? profiles.get(project.project_key)
                    : undefined,
                  project,
                  selected: selectedKey === key,
                  sources: project.sources ?? [],
                  styles,
                  view,
                  windowShare:
                    windowTotal > 0 ? project.total_tokens / windowTotal : 0,
                  onOpen: () => onOpen(project),
                };

                return view === "cards" ? (
                  <ProjectCardTile {...shared} key={key} />
                ) : (
                  <ProjectRow {...shared} key={key} />
                );
              })}
            </div>
          )}

          {payload && payload.filtered_zero_usage_projects > 0 ? (
            <Typography color="muted" type="body-xs">
              {formatMessage(copy.list.filteredNote, locale, {
                count: String(payload.filtered_zero_usage_projects),
              })}
            </Typography>
          ) : null}

          {refreshing && payload && !isLoading ? (
            <div className="bg-surface/60 absolute inset-0 z-10 flex items-center justify-center rounded-2xl backdrop-blur-[2px]">
              <Spinner size="sm" />
            </div>
          ) : null}
        </Card.Content>
      </Card>
    </div>
  );
}
