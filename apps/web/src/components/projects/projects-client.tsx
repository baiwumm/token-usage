"use client";

// Orchestrator for /projects. One state hub owns the list load, the detail
// request (cached + race-guarded), the modal lifecycle, the view switch and
// the review-mode effect catalogue. Everything here is page-local: no other
// page imports these components or the effect switches.

import type {
  ProjectDetailPayload,
  ProjectItem,
  ProjectsPayload,
} from "@/lib/dashboard/api";
import type { ProjectEffectId } from "@/lib/copy/projects";
import type { EffectPreviewAction } from "./projects-effects";
import type { SimulatedState } from "./projects-review-panel";
import type { ProjectView } from "./projects-row";

import { ArrowsRotateRight } from "@gravity-ui/icons";
import {
  Button,
  Chip,
  ListBox,
  Popover,
  Select,
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
  sliceProjects,
  type Filters,
  type ProjectLimit,
  type ProjectSort,
} from "./projects-filters";
import { ProjectsReviewPanel } from "./projects-review-panel";
import { ProjectDetailDialog } from "./projects-detail-dialog";
import {
  allEffects,
  defaultEffects,
  type ProjectEffectState,
} from "./projects-effects";
import { demoDetailPayload, demoProjectsPayload } from "./projects-showcase";
import styles from "./projects-effects.module.css";

import { useSessionBootstrap } from "@/lib/auth/session-bootstrap";
import { useLocale } from "@/lib/copy/locale";
import { formatMessage } from "@/lib/copy/message";
import { PROJECTS_COPY } from "@/lib/copy/projects";
import { useUrlFilters } from "@/lib/dashboard/url-filters";
import { loadable, type Loadable } from "@/lib/loadable";
import {
  fetchProjectDetail,
  fetchProjects,
  isUnauthorized,
  projectsCaliber,
} from "@/lib/dashboard/api";
import { browserTimezone, rangeForPreset } from "@/lib/dashboard/ranges";
import { useFormat } from "@/lib/format/format";

const PROJECTS_LIMIT = 200;
const UNATTRIBUTED = "__unattributed";

function keyOf(project: ProjectItem): string {
  return project.project_key ?? UNATTRIBUTED;
}

export function ProjectsClient() {
  const [locale] = useLocale();
  const copy = PROJECTS_COPY[locale];
  const { formatDateTime } = useFormat();
  const searchParams = useSearchParams();

  const { accessToken, redirectToLogin } = useSessionBootstrap("/projects");
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

  const [review] = useState(() => searchParams.get("review") === "1");
  const [useDemo, setUseDemo] = useState(true);
  const [view, setView] = useState<ProjectView>("list");
  const [effects, setEffects] = useState<ProjectEffectState>(defaultEffects);
  const [simulatedState, setSimulatedState] = useState<SimulatedState | null>(
    null,
  );
  const [replayNonce, setReplayNonce] = useState(0);
  const [fadeNonce, setFadeNonce] = useState(0);
  const [chartNonce, setChartNonce] = useState(0);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const [activeKey, setActiveKey] = useState<string | null>(null);
  const previewTimers = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const detailCache = useRef(new Map<string, ProjectDetailPayload>());
  const detailRequestId = useRef(0);
  const [detail, setDetail] = useState<{
    status: "loading" | "ready" | "error";
    data: ProjectDetailPayload | null;
  }>({ status: "loading", data: null });

  const timezone = browserTimezone();
  const caliber = projectsCaliber();
  // The page always reads the full series ("all" reaches back to the server's
  // 3-year clamp); narrowing happens client-side via the Top-N selector.
  const range = useMemo(() => rangeForPreset("all", timezone), [timezone]);
  const demoMode = review && useDemo;

  const load = useCallback(async () => {
    if (demoMode) {
      setRefreshing(false);

      return;
    }
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
      setState((previous) => ({ status: "error", data: previous.data }));
      setRefreshing(false);
    }
  }, [
    demoMode,
    filters.sort,
    range.fromDay,
    range.toDay,
    redirectToLogin,
    timezone,
  ]);

  useEffect(() => {
    if (demoMode || !accessToken) return;
    void load();
  }, [accessToken, demoMode, load]);

  const retry = useCallback(() => {
    void load();
  }, [load]);

  const activePayload = useMemo(
    () =>
      demoMode
        ? demoProjectsPayload(range.fromDay, range.toDay, caliber)
        : state.data,
    [caliber, demoMode, range.fromDay, range.toDay, state.data],
  );
  const activeStatus = demoMode ? "ready" : state.status;
  const activeRefreshing = demoMode ? false : refreshing;
  const projects = useMemo(
    () => activePayload?.projects ?? [],
    [activePayload],
  );
  // Detail navigation walks only what the Top-N selector shows; the payload
  // itself always carries the full list.
  const visibleProjects = useMemo(
    () => sliceProjects(projects, filters.limit),
    [filters.limit, projects],
  );
  const activeProject =
    projects.find((project) => keyOf(project) === activeKey) ?? null;

  const loadDetail = useCallback(
    async (key: string, force = false) => {
      const cacheKey = `${demoMode ? "demo" : "live"}|${key}|${range.fromDay}|${range.toDay}|${timezone}`;
      const cached = detailCache.current.get(cacheKey);
      const id = detailRequestId.current + 1;

      detailRequestId.current = id;
      if (cached && !force) {
        setDetail({ status: "ready", data: cached });

        return;
      }
      setDetail({ status: "loading", data: null });

      try {
        const payload = demoMode
          ? demoDetailPayload(
              key === UNATTRIBUTED ? null : key,
              range.fromDay,
              range.toDay,
              caliber,
            )
          : await fetchProjectDetail({
              projectKey: key === UNATTRIBUTED ? null : key,
              fromDay: range.fromDay,
              toDay: range.toDay,
              tz: timezone,
            });

        if (detailRequestId.current !== id) return;
        detailCache.current.set(cacheKey, payload);
        setDetail({ status: "ready", data: payload });
      } catch (error) {
        if (detailRequestId.current !== id) return;
        if (!demoMode && isUnauthorized(error)) {
          redirectToLogin();

          return;
        }
        setDetail({ status: "error", data: null });
      }
    },
    [caliber, demoMode, range.fromDay, range.toDay, redirectToLogin, timezone],
  );

  useEffect(() => {
    if (activeKey) void loadDetail(activeKey);
  }, [activeKey, loadDetail]);

  const clearPreviewTimers = useCallback(() => {
    previewTimers.current.forEach(clearTimeout);
    previewTimers.current = [];
  }, []);

  useEffect(
    () => () => {
      clearPreviewTimers();
    },
    [clearPreviewTimers],
  );

  const openDetail = useCallback((key: string) => {
    setSelectedDay(null);
    setActiveKey(key);
    setFadeNonce((value) => value + 1);
    setChartNonce((value) => value + 1);
  }, []);

  // Closing unmounts immediately. The custom exit turned out to add more
  // timing risk (unmount vs. animation frames) than perceived polish; HeroUI
  // owns the backdrop fade, which is enough at this interaction weight.
  const requestClose = useCallback(() => {
    setActiveKey(null);
  }, []);

  const index = activeKey
    ? visibleProjects.findIndex((project) => keyOf(project) === activeKey)
    : -1;
  const step = useCallback(
    (delta: number) => {
      const next = visibleProjects[index + delta];

      if (next) openDetail(keyOf(next));
    },
    [index, openDetail, visibleProjects],
  );

  const retryDetail = useCallback(() => {
    if (activeKey) void loadDetail(activeKey, true);
  }, [activeKey, loadDetail]);

  const onPreview = useCallback(
    (action: EffectPreviewAction) => {
      const firstKey = projects.length > 0 ? keyOf(projects[0]) : null;

      clearPreviewTimers();
      switch (action) {
        case "list":
          setReplayNonce((value) => value + 1);
          break;
        case "dialog":
          // Close first so the entrance transition replays from scratch.
          setActiveKey(null);
          if (firstKey) {
            previewTimers.current.push(
              setTimeout(() => openDetail(firstKey), 140),
            );
          }
          break;
        case "detail":
          if (activeKey) step(1);
          else if (firstKey) openDetail(firstKey);
          break;
        case "chart":
          setChartNonce((value) => value + 1);
          if (!activeKey && firstKey) openDetail(firstKey);
          break;
        case "drill":
          if (firstKey) {
            openDetail(firstKey);
            const daily =
              detail.data?.daily ??
              demoDetailPayload(
                projects[0].project_key,
                range.fromDay,
                range.toDay,
                caliber,
              ).daily;
            const day = daily.find((entry) => entry.total_tokens > 0);

            previewTimers.current.push(
              setTimeout(() => setSelectedDay(day?.date ?? null), 220),
            );
          }
          break;
        case "loading":
          setSimulatedState("loading");
          previewTimers.current.push(
            setTimeout(() => setSimulatedState(null), 1600),
          );
          break;
        case "state":
          setSimulatedState("empty");
          previewTimers.current.push(
            setTimeout(() => setSimulatedState("error"), 1100),
            setTimeout(() => setSimulatedState(null), 2400),
          );
          break;
      }
    },
    [
      activeKey,
      caliber,
      clearPreviewTimers,
      detail.data,
      openDetail,
      projects,
      range.fromDay,
      range.toDay,
      step,
    ],
  );

  const toggleEffect = useCallback((id: ProjectEffectId) => {
    setEffects((previous) => ({ ...previous, [id]: !previous[id] }));
  }, []);

  const sortLabel = filters.sort === "cost" ? copy.sortCost : copy.sortTokens;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 md:px-8">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Typography color="muted" type="body-xs">
            {copy.list.limitLabel}
          </Typography>
          <Select
            aria-label={copy.list.limitLabel}
            className="w-40"
            value={filters.limit}
            onChange={(key) => {
              if (key == null) return;
              applyFilters({ limit: String(key) as ProjectLimit });
            }}
          >
            <Select.Trigger>
              <Select.Value>
                {({ selectedText }) => (
                  <span className="truncate">{selectedText}</span>
                )}
              </Select.Value>
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <Popover.Arrow />
              <ListBox>
                <ListBox.Item id="all" textValue={copy.list.limitAll}>
                  {copy.list.limitAll}
                </ListBox.Item>
                {(["3", "5", "10"] as const).map((count) => {
                  const label = formatMessage(copy.list.limitTop, locale, {
                    count,
                  });

                  return (
                    <ListBox.Item key={count} id={count} textValue={label}>
                      {label}
                    </ListBox.Item>
                  );
                })}
              </ListBox>
            </Select.Popover>
          </Select>
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

        <div className="flex flex-col gap-1">
          <Typography color="muted" type="body-xs">
            {copy.list.viewLabel}
          </Typography>
          <ToggleButtonGroup
            disallowEmptySelection
            aria-label={copy.list.viewLabel}
            selectedKeys={[view]}
            size="sm"
            onSelectionChange={(keys) => {
              const key = [...keys][0];

              if (key === "list" || key === "cards") setView(key);
            }}
          >
            <ToggleButton id="list">{copy.list.viewList}</ToggleButton>
            <ToggleButton id="cards">{copy.list.viewCards}</ToggleButton>
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
                className={activeRefreshing ? "size-4 animate-spin" : "size-4"}
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

      {demoMode ? (
        <Chip color="warning" size="sm" variant="soft">
          {copy.review.demoBadge}
        </Chip>
      ) : null}

      <ScopeNote text={copy.scopeNote[caliber]} />

      {review ? (
        <ProjectsReviewPanel
          copy={copy.review}
          effectCopy={copy.effects}
          effects={effects}
          simulatedState={simulatedState}
          useDemo={useDemo}
          onOpenDetail={() => {
            const first = projects[0];

            if (first) openDetail(keyOf(first));
          }}
          onPreview={onPreview}
          onReset={() => setEffects(defaultEffects())}
          onSetAll={(value) => setEffects(allEffects(value))}
          onSimulate={(next) => {
            clearPreviewTimers();
            setSimulatedState(next === "ready" ? null : next);
            if (next === "detailError" && !activeKey && projects[0]) {
              openDetail(keyOf(projects[0]));
            }
          }}
          onToggle={toggleEffect}
          onToggleDemo={() => {
            setUseDemo((value) => !value);
            detailCache.current.clear();
            setSimulatedState(null);
          }}
        />
      ) : null}

      <ProjectsBody
        copy={copy}
        effects={effects}
        limit={filters.limit}
        locale={locale}
        payload={activePayload}
        refreshing={activeRefreshing}
        replayNonce={replayNonce}
        selectedKey={activeKey}
        simulatedState={simulatedState}
        sortLabel={sortLabel}
        status={activeStatus}
        styles={styles}
        view={view}
        onOpen={(project) => openDetail(keyOf(project))}
        onRetry={retry}
      />

      <ProjectDetailDialog
        caliber={caliber}
        chartNonce={chartNonce}
        copy={copy}
        detail={detail.data}
        effects={effects}
        fadeNonce={fadeNonce}
        hasNext={index >= 0 && index < visibleProjects.length - 1}
        hasPrevious={index > 0}
        locale={locale}
        project={activeProject}
        selectedDay={selectedDay}
        simulatedDetailError={simulatedState === "detailError"}
        status={detail.status}
        styles={styles}
        onClose={requestClose}
        onNext={() => step(1)}
        onPrevious={() => step(-1)}
        onRetry={retryDetail}
        onSelectDay={setSelectedDay}
      />
    </main>
  );
}
