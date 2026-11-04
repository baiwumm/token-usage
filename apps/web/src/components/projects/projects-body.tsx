"use client";

// Project list for /projects (docs/projects-page-plan.md 批次 1): one row per
// project basename plus the pinned "未归因" group at the bottom. Sort and
// range live with the page's URL/session filters; this component only renders
// the payload it is given.

import type { ProjectsCopy } from "@/lib/copy/projects";
import type { ProjectItem, ProjectsPayload } from "@/lib/dashboard/api";
import type { LoadStatus } from "@/lib/loadable";

import { Folder } from "@gravity-ui/icons";
import { Button, Card, Chip, Typography } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useMemo } from "react";

import { resolveProjectDisplayName } from "./identity";

import {
  DataTableCard,
  type DataTableColumn,
} from "@/components/data-table-card";
import { useFormat } from "@/lib/format/format";

const QUICK_START_URL = "https://github.com/baiwumm/token-usage#readme";

function rowKey(project: ProjectItem): string {
  return project.project_key ?? "__unattributed";
}

export function ProjectsBody({
  copy,
  payload,
  status,
  refreshing,
  onRetry,
}: {
  copy: ProjectsCopy;
  payload: ProjectsPayload | null;
  status: LoadStatus;
  refreshing: boolean;
  onRetry: () => void;
}) {
  const { formatTokens, formatNumber, formatCost, formatDate, formatDateTime } =
    useFormat();
  const router = useRouter();
  const caliber = payload?.caliber ?? "sessions";
  const sessionsLabel =
    caliber === "hourly" ? copy.list.sessionsHourly : copy.list.sessions;
  const unattributedHint =
    caliber === "hourly"
      ? copy.list.unattributedHintHourly
      : copy.list.unattributedHint;

  const columns = useMemo<DataTableColumn<ProjectItem>[]>(
    () => [
      {
        id: "project",
        header: copy.list.project,
        className: "max-w-64",
        cell: (project) =>
          project.project_key == null ? (
            <div className="flex flex-col gap-1 py-1">
              <Chip color="warning" size="sm" variant="soft">
                {copy.list.unattributed}
              </Chip>
              <Typography className="max-w-md" color="muted" type="body-xs">
                {unattributedHint}
              </Typography>
            </div>
          ) : (
            <span className="block max-w-64 truncate">
              {resolveProjectDisplayName(project.project_key)}
            </span>
          ),
      },
      {
        id: "tokens",
        header: copy.list.tokens,
        className: "whitespace-nowrap tabular-nums",
        cell: (project) => formatTokens(project.total_tokens),
      },
      {
        id: "cost",
        header: copy.list.cost,
        className: "whitespace-nowrap tabular-nums",
        cell: (project) => formatCost(Number(project.total_cost_usd)),
      },
      {
        id: "dayPeak",
        header: copy.list.dayPeak,
        className: "whitespace-nowrap tabular-nums",
        cell: (project) =>
          project.day_peak ? (
            <span className="flex items-baseline gap-1.5">
              {formatTokens(project.day_peak.total_tokens)}
              <Typography color="muted" type="body-xs">
                {formatDate(project.day_peak.date)}
              </Typography>
            </span>
          ) : (
            "—"
          ),
      },
      {
        id: "sessions",
        header: sessionsLabel,
        className: "whitespace-nowrap tabular-nums",
        cell: (project) => formatNumber(project.session_count),
      },
      {
        id: "lastActive",
        header: copy.list.lastActive,
        className: "whitespace-nowrap",
        cell: (project) =>
          project.last_active ? formatDateTime(project.last_active) : "—",
      },
    ],
    [
      copy,
      formatCost,
      formatDate,
      formatDateTime,
      formatNumber,
      formatTokens,
      sessionsLabel,
      unattributedHint,
    ],
  );

  const renderProjectRow = (project: ProjectItem) => (
    <Card className="p-3">
      <Card.Content className="gap-2">
        <div className="flex items-center justify-between gap-2">
          {project.project_key == null ? (
            <Chip color="warning" size="sm" variant="soft">
              {copy.list.unattributed}
            </Chip>
          ) : (
            <Typography type="body-sm" weight="semibold">
              <span className="block max-w-56 truncate">
                {resolveProjectDisplayName(project.project_key)}
              </span>
            </Typography>
          )}
          <span className="tabular-nums">
            {formatTokens(project.total_tokens)}
          </span>
        </div>
        {project.project_key == null ? (
          <Typography color="muted" type="body-xs">
            {unattributedHint}
          </Typography>
        ) : null}
        <div className="text-muted flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span className="tabular-nums">
            {formatCost(Number(project.total_cost_usd))}
          </span>
          <span className="tabular-nums">
            {sessionsLabel} {formatNumber(project.session_count)}
          </span>
          {project.day_peak ? (
            <span className="tabular-nums">
              {copy.list.dayPeak} {formatTokens(project.day_peak.total_tokens)}{" "}
              · {formatDate(project.day_peak.date)}
            </span>
          ) : null}
          {project.last_active ? (
            <span>{formatDateTime(project.last_active)}</span>
          ) : null}
        </div>
      </Card.Content>
    </Card>
  );

  const emptyState = (
    <div className="flex flex-col items-start gap-2 py-6">
      <Folder aria-hidden="true" className="text-muted size-6" />
      <Typography type="body-sm" weight="semibold">
        {copy.states.emptyTitle}
      </Typography>
      <Typography className="max-w-2xl" color="muted" type="body-sm">
        {copy.states.emptyBody}
      </Typography>
      <div className="flex flex-wrap gap-2 pt-1">
        <Button size="sm" onPress={() => router.push("/device")}>
          {copy.states.emptyPair}
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

  return (
    <DataTableCard
      columns={columns}
      empty={emptyState}
      error={{
        message: copy.states.loadError,
        onRetry,
        retryLabel: copy.states.retry,
      }}
      hint={caliber === "hourly" ? copy.list.hintHourly : copy.list.hint}
      refreshing={refreshing}
      renderMobileRow={renderProjectRow}
      rowKey={rowKey}
      rows={payload?.projects ?? []}
      status={status}
      tableLabel={copy.list.title}
      title={copy.list.title}
    />
  );
}
