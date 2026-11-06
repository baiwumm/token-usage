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
import type { ProjectProfile } from "@/lib/projects/profile";
import type { EffectPreviewAction } from "./projects-effects";
import type { SimulatedState } from "./projects-review-panel";
import type { ProjectView } from "./projects-row";

import {
  Button,
  Chip,
  ListBox,
  Popover,
  Select,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@heroui/react";
import dynamic from "next/dynamic";
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
import { ProjectDetailDialog } from "./projects-detail-dialog";
import { ProjectProfileDialog } from "./project-profile-dialog";
import {
  allEffects,
  defaultEffects,
  type ProjectEffectState,
} from "./projects-effects";
import styles from "./projects-effects.module.css";

import { RefreshButton } from "@/components/refresh-button";
import { useSessionBootstrap } from "@/lib/auth/session-bootstrap";
import { useLocale } from "@/lib/copy/locale";
import { formatMessage } from "@/lib/copy/message";
import { PROJECTS_COPY } from "@/lib/copy/projects";
import { useUrlFilters } from "@/lib/dashboard/url-filters";
import { loadable, type Loadable } from "@/lib/loadable";
import {
  fetchProjectDetail,
  fetchProjectProfiles,
  fetchProjects,
  isUnauthorized,
  projectsCaliber,
} from "@/lib/dashboard/api";
import { browserTimezone, rangeForPreset } from "@/lib/dashboard/ranges";

// Review-only panel + the ~290-line deterministic demo dataset are split
// into their own chunks: a normal visit to /projects never downloads them.
const ProjectsReviewPanel = dynamic(
  () =>
    import("./projects-review-panel").then((mod) => mod.ProjectsReviewPanel),
  { ssr: false, loading: () => null },
);

type DemoModule = typeof import("./projects-showcase");

const PROJECTS_LIMIT = 200;
const UNATTRIBUTED = "__unattributed";
// Demo mode never shows (or edits) live profiles.
const EMPTY_PROFILES: ReadonlyMap<string, ProjectProfile> = new Map();

function keyOf(project: ProjectItem): string {
  return project.project_key ?? UNATTRIBUTED;
}

export function ProjectsClient() {
  const [locale] = useLocale();
  const copy = PROJECTS_COPY[locale];
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
  // Demo payload is fetched as a separate chunk only for ?review=1 visits.
  const [demo, setDemo] = useState<DemoModule | null>(null);

  useEffect(() => {
    if (!review) return;
    let alive = true;

    void import("./projects-showcase").then((mod) => {
      if (alive) setDemo(mod);
    });

    return () => {
      alive = false;
    };
  }, [review]);
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

  // Project profiles (logo / repo / display name) ride beside the list:
  // window-independent, loaded once per refresh, patched in place on save.
  const [profiles, setProfiles] = useState<ReadonlyMap<string, ProjectProfile>>(
    () => new Map(),
  );
  const [uploadEnabled, setUploadEnabled] = useState(false);
  const profilesRequestId = useRef(0);
  // The editor remounts per open (nonce key) so its drafts start clean.
  const [edit, setEdit] = useState<{
    key: string;
    nonce: number;
    open: boolean;
  } | null>(null);

  const timezone = browserTimezone();
  const caliber = projectsCaliber();
  // The page always reads the full series ("all" reaches back to the server's
  // 3-year clamp); narrowing happens client-side via the Top-N selector.
  const range = useMemo(() => rangeForPreset("all", timezone), [timezone]);
  // Request suppression must not wait for the demo chunk to arrive, or the
  // first review-mode render would fire live API calls. Rendering waits for
  // `demo` instead (see activeStatus / activePayload below).
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

  // Decoration only: a failed profiles load keeps the last map (initials and
  // no repo links at worst) and never blocks the list.
  const loadProfiles = useCallback(async () => {
    const id = profilesRequestId.current + 1;

    profilesRequestId.current = id;
    try {
      const payload = await fetchProjectProfiles();

      if (profilesRequestId.current !== id) return;
      setProfiles(
        new Map(
          payload.profiles.map((profile) => [profile.project_key, profile]),
        ),
      );
      setUploadEnabled(payload.upload_enabled);
    } catch (error) {
      if (profilesRequestId.current === id && isUnauthorized(error)) {
        redirectToLogin();
      }
    }
  }, [redirectToLogin]);

  useEffect(() => {
    if (demoMode || !accessToken) return;
    void loadProfiles();
  }, [accessToken, demoMode, loadProfiles]);

  const retry = useCallback(() => {
    void load();
    if (!demoMode) void loadProfiles();
  }, [demoMode, load, loadProfiles]);

  // Same affordance as Sessions / Sync-runs / Dashboard: one press returns
  // sort / limit to their defaults (URL round-trips through applyFilters) and
  // the list/card switch back to its initial state.
  const clearFilters = useCallback(() => {
    applyFilters({ sort: "tokens", limit: "all" });
    setView("list");
  }, [applyFilters]);

  const updateProfile = useCallback((profile: ProjectProfile) => {
    setProfiles((previous) =>
      new Map(previous).set(profile.project_key, profile),
    );
  }, []);

  const openEdit = useCallback((key: string) => {
    setEdit((previous) => ({
      key,
      nonce: (previous?.nonce ?? 0) + 1,
      open: true,
    }));
  }, []);

  const closeEdit = useCallback(() => {
    setEdit((previous) => (previous ? { ...previous, open: false } : null));
  }, []);

  const activePayload = useMemo(
    () =>
      demoMode
        ? demo
          ? demo.demoProjectsPayload(range.fromDay, range.toDay, caliber)
          : null
        : state.data,
    [caliber, demo, demoMode, range.fromDay, range.toDay, state.data],
  );
  const activeStatus = demoMode ? (demo ? "ready" : "loading") : state.status;
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
      // The demo chunk is still in flight — show a loading detail instead of
      // falling through to the live endpoint.
      if (demoMode && !demo) {
        setDetail({ status: "loading", data: null });

        return;
      }
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
        const payload =
          demoMode && demo
            ? demo.demoDetailPayload(
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
    [
      caliber,
      demo,
      demoMode,
      range.fromDay,
      range.toDay,
      redirectToLogin,
      timezone,
    ],
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
              demo?.demoDetailPayload(
                projects[0].project_key,
                range.fromDay,
                range.toDay,
                caliber,
              ).daily ??
              [];
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
      demo,
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

  const hasNarrowingFilters =
    filters.sort !== "tokens" || filters.limit !== "all" || view !== "list";
  const sortLabel = filters.sort === "cost" ? copy.sortCost : copy.sortTokens;
  // Hourly buckets count conversations, not sessions: the row/card meta has to
  // say the same thing the column header and the detail dialog do.
  const sessionsLabel =
    caliber === "hourly" ? copy.list.sessionsHourly : copy.list.sessions;

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

        {hasNarrowingFilters ? (
          <Button size="sm" variant="ghost" onPress={clearFilters}>
            {copy.clearFilters}
          </Button>
        ) : null}

        <div className="ml-auto flex items-center gap-1.5">
          <RefreshButton
            lastUpdatedAt={lastUpdatedAt}
            lastUpdatedNone={copy.lastUpdatedNone}
            lastUpdatedTemplate={copy.lastUpdated}
            locale={locale}
            refreshLabel={copy.refresh}
            refreshing={activeRefreshing}
            onPress={retry}
          />
        </div>
      </div>

      {demoMode ? (
        <Chip color="warning" size="sm" variant="soft">
          {copy.review.demoBadge}
        </Chip>
      ) : null}

      <ScopeNote text={copy.scopeNote[caliber]} title={copy.scopeNoteTitle} />

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
        profiles={demoMode ? EMPTY_PROFILES : profiles}
        refreshing={activeRefreshing}
        replayNonce={replayNonce}
        selectedKey={activeKey}
        sessionsLabel={sessionsLabel}
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
        profile={
          !demoMode && activeProject?.project_key
            ? profiles.get(activeProject.project_key)
            : undefined
        }
        project={activeProject}
        selectedDay={selectedDay}
        simulatedDetailError={simulatedState === "detailError"}
        status={detail.status}
        styles={styles}
        onClose={requestClose}
        onEdit={
          !demoMode && activeProject?.project_key
            ? () => openEdit(activeProject.project_key as string)
            : undefined
        }
        onNext={() => step(1)}
        onPrevious={() => step(-1)}
        onRetry={retryDetail}
        onSelectDay={setSelectedDay}
      />

      {edit ? (
        <ProjectProfileDialog
          key={edit.nonce}
          copy={copy}
          locale={locale}
          open={edit.open}
          profile={profiles.get(edit.key)}
          projectKey={edit.key}
          uploadEnabled={uploadEnabled}
          onClose={closeEdit}
          onProfileChange={updateProfile}
          onUnauthorized={redirectToLogin}
        />
      ) : null}
    </main>
  );
}
