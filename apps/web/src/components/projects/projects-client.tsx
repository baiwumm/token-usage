"use client";

// Projects at /projects (docs/projects-page-plan.md 批次 1): per-project
// aggregation over session metadata. The sort key lives in the URL; the 7/30
// day range preset is session-only (presets resolve relative to today).
// Filter changes only refetch data (replaceState + popstate sync, no
// navigation).
//
// The page is split by concern: projects-filters.ts owns the URL contract,
// scope-note.tsx the coverage/cost caveat, projects-body.tsx the list,
// projects-skeleton.tsx the first-load placeholder, identity.ts the display
// name seam.

import { ArrowsRotateRight } from "@gravity-ui/icons";
import {
  Button,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@heroui/react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ScopeNote } from "./scope-note";
import { ProjectsBody } from "./projects-body";
import {
  parseFilters,
  serializeFilters,
  type Filters,
  type ProjectRange,
  type ProjectSort,
} from "./projects-filters";
import { ProjectsSkeleton } from "./projects-skeleton";

import { useSessionBootstrap } from "@/lib/auth/session-bootstrap";
import { useLocale } from "@/lib/copy/locale";
import { formatMessage } from "@/lib/copy/message";
import { PROJECTS_COPY } from "@/lib/copy/projects";
import { useUrlFilters } from "@/lib/dashboard/url-filters";
import { loadable, type Loadable } from "@/lib/loadable";
import {
  fetchProjects,
  isUnauthorized,
  type ProjectsPayload,
} from "@/lib/dashboard/api";
import { browserTimezone, rangeForPreset } from "@/lib/dashboard/ranges";
import { useFormat } from "@/lib/format/format";

// The list shows every project in the window; the server cap (500) is far
// above any realistic project count, so no pager is needed.
const PROJECTS_LIMIT = 200;

export function ProjectsClient() {
  const [locale] = useLocale();
  const copy = PROJECTS_COPY[locale];
  const { formatDateTime } = useFormat();

  const { accessToken, redirectToLogin } = useSessionBootstrap("/projects");
  const searchParams = useSearchParams();
  const [filters, applyFilters] = useUrlFilters<Filters>({
    basePath: "/projects",
    parse: parseFilters,
    serialize: serializeFilters,
    initialParams: searchParams,
  });
  const [state, setState] = useState<Loadable<ProjectsPayload>>(loadable);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const requestId = useRef(0);

  const timezone = browserTimezone();
  const range = useMemo(
    () => rangeForPreset(filters.range, timezone),
    [filters.range, timezone],
  );

  const load = useCallback(async () => {
    const id = requestId.current + 1;

    requestId.current = id;
    setRefreshing(true);
    setState((previous) =>
      previous.data == null ? { status: "loading", data: null } : previous,
    );

    try {
      const payload = await fetchProjects({
        fromDay: range.fromDay,
        toDay: range.toDay,
        tz: timezone,
        sort: filters.sort,
        limit: PROJECTS_LIMIT,
      });

      if (requestId.current !== id) return;
      setState({ status: "ready", data: payload });
      setRefreshing(false);
      setLastUpdatedAt(Date.now());
    } catch (error) {
      if (requestId.current !== id) return;
      if (isUnauthorized(error)) {
        redirectToLogin();

        return;
      }
      // A failed refresh keeps the previous list on screen and flags it as
      // stale (DataTableCard shows the error bar); only an empty slot falls
      // through to the full error state.
      setState((previous) => ({ status: "error", data: previous.data }));
      setRefreshing(false);
    }
  }, [filters.sort, range.fromDay, range.toDay, redirectToLogin, timezone]);

  useEffect(() => {
    if (!accessToken) return;
    void load();
  }, [accessToken, load]);

  const retry = useCallback(() => {
    void load();
  }, [load]);

  const payload = state.data;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 md:px-8">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Typography color="muted" type="body-xs">
            {copy.rangeLabel}
          </Typography>
          <ToggleButtonGroup
            disallowEmptySelection
            aria-label={copy.rangeLabel}
            selectedKeys={[filters.range]}
            size="sm"
            onSelectionChange={(keys) => {
              const key = [...keys][0];

              if (typeof key !== "string" || key === filters.range) return;

              applyFilters({ range: key as ProjectRange });
            }}
          >
            <ToggleButton className="min-w-14" id="7d">
              {copy.ranges["7d"]}
            </ToggleButton>
            <ToggleButton className="min-w-14" id="30d">
              {copy.ranges["30d"]}
            </ToggleButton>
          </ToggleButtonGroup>
        </div>

        <div className="flex flex-col gap-1">
          <Typography color="muted" type="body-xs">
            {copy.sortLabel}
          </Typography>
          <ToggleButtonGroup
            disallowEmptySelection
            aria-label={copy.sortLabel}
            selectedKeys={[filters.sort]}
            size="sm"
            onSelectionChange={(keys) => {
              const key = [...keys][0];

              if (typeof key !== "string" || key === filters.sort) return;

              applyFilters({ sort: key as ProjectSort });
            }}
          >
            <ToggleButton id="tokens">{copy.sortTokens}</ToggleButton>
            <ToggleButton id="cost">{copy.sortCost}</ToggleButton>
          </ToggleButtonGroup>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <Tooltip delay={0}>
            <Button
              isIconOnly
              aria-label={copy.refresh}
              size="sm"
              variant="tertiary"
              onPress={retry}
            >
              <ArrowsRotateRight
                aria-hidden="true"
                className={refreshing ? "size-4 animate-spin" : "size-4"}
              />
            </Button>
            <Tooltip.Content showArrow placement="bottom">
              <Tooltip.Arrow />
              <Typography type="body-xs">
                {lastUpdatedAt == null
                  ? copy.lastUpdatedNone
                  : formatMessage(copy.lastUpdated, locale, {
                      time: formatDateTime(new Date(lastUpdatedAt)),
                    })}
              </Typography>
            </Tooltip.Content>
          </Tooltip>
        </div>
      </div>

      <ScopeNote text={copy.scopeNote} />

      {state.status === "loading" && !payload ? (
        <ProjectsSkeleton />
      ) : (
        <ProjectsBody
          copy={copy}
          payload={payload}
          refreshing={refreshing}
          status={state.status}
          onRetry={retry}
        />
      )}
    </main>
  );
}
