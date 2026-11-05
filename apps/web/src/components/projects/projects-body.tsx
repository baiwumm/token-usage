"use client";

// Page-local list surface for /projects. It deliberately does not reuse the
// shared table card: this page has its own list/card language, its own three
// states and its own review-mode effect switches (operator decision
// 2026-11-05 — no other page adopts these components).

import type { ProjectsPayload, ProjectItem } from "@/lib/dashboard/api";
import type { ProjectsCopy } from "@/lib/copy/projects";
import type { ProjectEffectState } from "./projects-effects";
import type { ProjectLimit } from "./projects-filters";

import { Folder } from "@gravity-ui/icons";
import { Button, Card, Skeleton, Spinner, Typography, cn } from "@heroui/react";
import { useRouter } from "next/navigation";

import { ProjectCardTile, ProjectRow, type ProjectView } from "./projects-row";
import { sliceProjects } from "./projects-filters";

import { formatMessage } from "@/lib/copy/message";
import { useFormat } from "@/lib/format/format";
import { SectionError } from "@/components/section-states";

const QUICK_START_URL = "https://github.com/baiwumm/token-usage#readme";

export interface ProjectsBodyProps {
  copy: ProjectsCopy;
  locale: "zh" | "en";
  payload: ProjectsPayload | null;
  status: "loading" | "ready" | "error";
  refreshing: boolean;
  view: ProjectView;
  sortLabel: string;
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
    [copy.summary.cost, formatCost(Number(payload.totals.total_cost_usd))],
    [copy.summary.projects, formatNumber(payload.projects.length)],
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

function RowsSkeleton({
  copy,
  effects,
  styles,
}: Pick<ProjectsBodyProps, "copy" | "effects" | "styles">) {
  return (
    <div aria-label={copy.list.title} className="flex flex-col gap-2">
      {Array.from({ length: 6 }, (_, index) => (
        <Skeleton
          key={index}
          className={cn(
            "h-20 w-full rounded-2xl",
            effects.skeletonShimmer && styles.shimmer,
          )}
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
            window.open(QUICK_START_URL, "_blank", "noopener,noreferrer")
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
    status,
    refreshing,
    view,
    sortLabel,
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
  const maxTokens = projects.reduce(
    (max, project) => Math.max(max, project.total_tokens),
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
      <Summary
        copy={copy}
        effects={effects}
        locale={locale}
        payload={payload}
        styles={styles}
      />

      <Card className="p-4 md:p-6">
        <Card.Header className="flex-col items-start gap-1">
          <Card.Title>{copy.list.title}</Card.Title>
          <Typography color="muted" type="body-xs">
            {limit === "all"
              ? formatMessage(copy.list.count, locale, {
                  count: String(allProjects.length),
                })
              : formatMessage(copy.list.showing, locale, {
                  count: String(projects.length),
                  total: String(allProjects.length),
                })}{" "}
            · {formatMessage(copy.list.sortedBy, locale, { sort: sortLabel })} ·{" "}
            {copy.list.relativeBar}
          </Typography>
        </Card.Header>

        <Card.Content className="relative flex flex-col gap-2">
          {stale ? (
            <div
              className={cn(
                "bg-danger-soft text-danger flex flex-wrap items-center justify-between gap-2 rounded-2xl px-3 py-2",
                effects.stateMotion && styles.errorSlide,
              )}
            >
              <Typography type="body-xs">{copy.states.stale}</Typography>
              <Button size="sm" variant="outline" onPress={onRetry}>
                {copy.states.retry}
              </Button>
            </div>
          ) : null}

          {isError ? (
            <SectionError
              message={copy.states.loadError}
              retry={onRetry}
              retryLabel={copy.states.retry}
            />
          ) : isLoading ? (
            <RowsSkeleton copy={copy} effects={effects} styles={styles} />
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
                  maxTokens,
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
