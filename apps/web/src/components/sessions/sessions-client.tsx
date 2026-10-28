"use client";

// Sessions at /sessions (docs/ui-spec.md Sessions, M5.6). Device-level
// metadata only — the API never returns prompts, bodies, titles, absolute
// paths or resume commands, and session_id stays an internal key.
//
// Device/source filters and the server-side offset live in the URL, as
// does a custom time window (2026-10-28); preset ranges stay session-only.
// Filter changes only refetch data (replaceState + popstate sync, no
// navigation).

import {
  ArrowsRotateRight,
  ChartColumn,
  Clock,
  Layers,
  ListUl,
  Wallet,
} from "@gravity-ui/icons";
import {
  Button,
  Card,
  Chip,
  DateField,
  DateRangePicker,
  ListBox,
  Modal,
  Popover,
  RangeCalendar,
  Select,
  Skeleton,
  Spinner,
  Table,
  Tooltip,
  Typography,
} from "@heroui/react";
import { parseDate } from "@internationalized/date";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Key,
} from "react";

import { useSessionBootstrap } from "@/lib/auth/session-bootstrap";
import { useLocale } from "@/lib/copy/locale";
import { formatMessage } from "@/lib/copy/message";
import { SESSIONS_COPY, type SessionsCopy } from "@/lib/copy/sessions";
import { useUrlFilters } from "@/lib/dashboard/url-filters";
import { loadable, type Loadable } from "@/lib/loadable";
import { PAGE_SIZE_OPTIONS } from "@/lib/ui/pagination";
import {
  DashboardApiError,
  fetchSessions,
  type SessionItem,
  type SessionModel,
  type SessionsPayload,
} from "@/lib/dashboard/api";
import {
  ALL_RANGE_START,
  browserTimezone,
  dayKeyInTz,
  isValidDayKey,
  rangeForSelection,
} from "@/lib/dashboard/ranges";
import { useFormat } from "@/lib/format/format";
import {
  DataTableCard,
  type DataTableColumn,
} from "@/components/data-table-card";
import { FlowNumber } from "@/components/flow-number";
import { SourceIcon } from "@/components/dashboard/source-icon";
import { sourceDisplayLabel } from "@/components/dashboard/sources";
import { DeviceFilterSelect } from "@/components/device-filter-select";
import { RangePresetButtons } from "@/components/range-preset-buttons";

const DEFAULT_PAGE_SIZE = 20;
const UPGRADE_URL = "https://github.com/baiwumm/token-usage#readme";

const SESSION_RANGE_PRESETS = ["today", "7d", "30d", "90d"] as const;

type SessionRange = (typeof SESSION_RANGE_PRESETS)[number] | "custom";

interface Filters {
  range: SessionRange;
  from: string;
  to: string;
  deviceId: string;
  source: string;
  offset: number;
  pageSize: number;
}

// Preset ranges stay out of the URL (operator call 2026-10-26: a stale
// ?range=… link must not pin the list to old dates, so presets always resolve
// relative to today). A custom window does round-trip (operator call
// 2026-10-28): the heatmap-cell deep link and a manual calendar pick both keep
// from/to in the address bar, so refreshing or sharing the link shows the same
// days instead of losing them on the first rewrite.
function parseFilters(params: { get(name: string): string | null }): Filters {
  const rawOffset = Number(params.get("offset"));
  const rawPageSize = Number(params.get("page_size"));
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const hasWindow = isValidDayKey(from) && isValidDayKey(to) && from <= to;

  return {
    range: hasWindow ? "custom" : "30d",
    from: hasWindow ? from : "",
    to: hasWindow ? to : "",
    deviceId: params.get("device_id") ?? "",
    source: params.get("source") ?? "",
    offset:
      Number.isFinite(rawOffset) && rawOffset > 0 ? Math.trunc(rawOffset) : 0,
    pageSize: (PAGE_SIZE_OPTIONS as readonly number[]).includes(rawPageSize)
      ? rawPageSize
      : DEFAULT_PAGE_SIZE,
  };
}

function serializeFilters(filters: Filters): string {
  const query = new URLSearchParams();

  if (
    filters.range === "custom" &&
    isValidDayKey(filters.from) &&
    isValidDayKey(filters.to) &&
    filters.from <= filters.to
  ) {
    query.set("from", filters.from);
    query.set("to", filters.to);
  }
  if (filters.deviceId) query.set("device_id", filters.deviceId);
  if (filters.source) query.set("source", filters.source);
  if (filters.offset > 0) query.set("offset", String(filters.offset));
  if (filters.pageSize !== DEFAULT_PAGE_SIZE) {
    query.set("page_size", String(filters.pageSize));
  }

  return query.toString();
}

// Any filter change restarts paging unless the patch is the page itself.
function mergeSessionFilters(
  previous: Filters,
  patch: Partial<Filters>,
): Filters {
  const next = { ...previous, ...patch };

  if (!("offset" in patch)) next.offset = 0;

  return next;
}

function rowKey(session: SessionItem): string {
  return `${session.device_id}|${session.source}|${session.session_id}`;
}

function sortedModels(models: SessionModel[]): SessionModel[] {
  return [...models].sort(
    (first, second) =>
      second.total_tokens - first.total_tokens ||
      first.model.localeCompare(second.model),
  );
}

function isUnauthorized(error: unknown): boolean {
  return error instanceof DashboardApiError && error.status === 401;
}

function ModelChips({ models }: { models: SessionModel[] }) {
  const [locale] = useLocale();
  const copy = SESSIONS_COPY[locale];

  if (models.length === 0) {
    return (
      <Typography color="muted" type="body-xs">
        —
      </Typography>
    );
  }
  const ordered = sortedModels(models);

  return (
    <div className="flex flex-wrap gap-1">
      {ordered.slice(0, 3).map((model) => (
        <Chip key={model.model} className="max-w-40" size="sm" variant="soft">
          <SourceIcon label={model.model} size={12} />
          <span className="truncate">{model.model}</span>
        </Chip>
      ))}
      {ordered.length > 3 ? (
        <Chip size="sm" variant="soft">
          {formatMessage(copy.list.moreModels, locale, {
            count: ordered.length - 3,
          })}
        </Chip>
      ) : null}
    </div>
  );
}

function SummaryCards({
  payload,
  copy,
}: {
  payload: SessionsPayload;
  copy: SessionsCopy;
}) {
  const { formatTokens, formatCost, formatNumber, formatDuration } =
    useFormat();
  const { totals } = payload;
  const cards = [
    {
      key: "sessions",
      label: copy.cards.sessions,
      icon: ListUl,
      value: formatNumber(totals.sessions),
      sub: undefined,
    },
    {
      key: "tokens",
      label: copy.cards.tokens,
      icon: ChartColumn,
      value: formatTokens(totals.total_tokens),
      sub: undefined,
    },
    {
      key: "cost",
      label: copy.cards.cost,
      icon: Wallet,
      value: formatCost(Number(totals.total_cost_usd)),
      sub: undefined,
    },
    {
      key: "duration",
      label: copy.cards.avgDuration,
      icon: Clock,
      value:
        totals.sessions > 0
          ? formatDuration(totals.duration_ms / totals.sessions)
          : copy.cards.emptyValue,
      sub: copy.cards.avgHint,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.key} className="gap-1 p-4">
          <Card.Header className="flex-row items-center justify-between gap-2">
            <Card.Title className="text-muted text-xs font-normal">
              {card.label}
            </Card.Title>
            <card.icon aria-hidden="true" className="text-accent/70 size-4" />
          </Card.Header>
          <Card.Content className="gap-1">
            <Typography className="tabular-nums" type="h4" weight="semibold">
              <FlowNumber text={card.value} />
            </Typography>
            {card.sub ? (
              <Typography color="muted" type="body-xs">
                {card.sub}
              </Typography>
            ) : null}
          </Card.Content>
        </Card>
      ))}
    </div>
  );
}

// First-load placeholder for the summary row: the card shells (label + icon)
// are real, only the numbers are skeletons — the four cards must not flash as
// one grey block before the payload lands.
function SummaryCardsSkeleton({ copy }: { copy: SessionsCopy }) {
  const cards = [
    { key: "sessions", label: copy.cards.sessions, icon: ListUl },
    { key: "tokens", label: copy.cards.tokens, icon: ChartColumn },
    { key: "cost", label: copy.cards.cost, icon: Wallet },
    {
      key: "duration",
      label: copy.cards.avgDuration,
      icon: Clock,
      sub: copy.cards.avgHint,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.key} className="gap-1 p-4">
          <Card.Header className="flex-row items-center justify-between gap-2">
            <Card.Title className="text-muted text-xs font-normal">
              {card.label}
            </Card.Title>
            <card.icon aria-hidden="true" className="text-accent/70 size-4" />
          </Card.Header>
          <Card.Content className="gap-1">
            <Skeleton className="h-7 w-24 rounded-full" />
            {card.sub ? (
              <Typography color="muted" type="body-xs">
                {card.sub}
              </Typography>
            ) : null}
          </Card.Content>
        </Card>
      ))}
    </div>
  );
}

function SessionDetailModal({
  session,
  copy,
  onOpenChange,
}: {
  session: SessionItem | null;
  copy: SessionsCopy;
  onOpenChange: (open: boolean) => void;
}) {
  const {
    formatTokens,
    formatCost,
    formatDuration,
    formatDateTime,
    formatRelativeTime,
    formatPercent,
  } = useFormat();
  const models = session ? sortedModels(session.models) : [];
  const tokenRows = session
    ? [
        [copy.detail.input, session.input_tokens],
        [copy.detail.cached, session.cached_input_tokens],
        [copy.detail.cacheCreation, session.cache_creation_input_tokens],
        [copy.detail.output, session.output_tokens],
        [copy.detail.reasoning, session.reasoning_output_tokens],
        [copy.detail.total, session.total_tokens],
        [
          copy.detail.billable,
          session.billable_total_tokens ?? session.total_tokens,
        ],
      ]
    : [];

  return (
    <Modal.Backdrop isOpen={session != null} onOpenChange={onOpenChange}>
      <Modal.Container scroll="inside">
        <Modal.Dialog className="max-h-[90vh] w-[calc(100vw-1rem)] max-w-2xl">
          {session ? (
            <>
              <Modal.Header>
                <Modal.CloseTrigger />
                <Modal.Heading>{copy.detail.title}</Modal.Heading>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Chip size="sm" variant="soft">
                    <SourceIcon label={session.source} size={12} />
                    {sourceDisplayLabel(session.source)}
                  </Chip>
                  <Chip
                    className="max-w-48"
                    color="warning"
                    size="sm"
                    variant="soft"
                  >
                    <span className="truncate">
                      {session.project_key ?? copy.list.noProject}
                    </span>
                  </Chip>
                  <Chip
                    className="max-w-40"
                    color="success"
                    size="sm"
                    variant="soft"
                  >
                    <span className="truncate">{session.device_name}</span>
                  </Chip>
                </div>
              </Modal.Header>
              <Modal.Body className="flex flex-col gap-5">
                <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                  <div className="flex flex-col gap-0.5">
                    <Typography color="muted" type="body-xs">
                      {copy.list.endedAt}
                    </Typography>
                    <Typography
                      className="tabular-nums"
                      type="body-sm"
                      weight="medium"
                    >
                      {formatDateTime(session.ended_at)}
                    </Typography>
                    <Typography color="muted" type="body-xs">
                      {formatRelativeTime(session.ended_at)}
                    </Typography>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <Typography color="muted" type="body-xs">
                      {copy.detail.duration}
                    </Typography>
                    <Typography
                      className="tabular-nums"
                      type="body-sm"
                      weight="medium"
                    >
                      {formatDuration(session.duration_ms)}
                    </Typography>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <Typography type="body-sm" weight="semibold">
                    {copy.detail.tokensTitle}
                  </Typography>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
                    {tokenRows.map(([label, value]) => (
                      <div
                        key={String(label)}
                        className="flex flex-col gap-0.5"
                      >
                        <Typography color="muted" type="body-xs">
                          {label}
                        </Typography>
                        <Typography
                          className="tabular-nums"
                          type="body-sm"
                          weight="medium"
                        >
                          {formatTokens(value)}
                        </Typography>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <Typography type="body-sm" weight="semibold">
                    {copy.detail.modelsTitle}
                  </Typography>
                  {models.length === 0 ? (
                    <Typography color="muted" type="body-sm">
                      —
                    </Typography>
                  ) : (
                    <Table>
                      <Table.ScrollContainer>
                        <Table.Content
                          aria-label={copy.detail.modelsTitle}
                          className="w-full table-fixed"
                        >
                          <Table.Header>
                            <Table.Column isRowHeader id="model">
                              {copy.detail.modelName}
                            </Table.Column>
                            <Table.Column className="w-24 text-end" id="tokens">
                              {copy.detail.modelTokens}
                            </Table.Column>
                            <Table.Column className="w-16 text-end" id="share">
                              {copy.detail.modelShare}
                            </Table.Column>
                            <Table.Column className="w-24 text-end" id="cost">
                              {copy.detail.modelCost}
                            </Table.Column>
                          </Table.Header>
                          <Table.Body>
                            {models.map((model) => (
                              <Table.Row key={model.model} id={model.model}>
                                <Table.Cell>
                                  <span
                                    className="flex min-w-0 items-center gap-1.5"
                                    title={model.model}
                                  >
                                    <SourceIcon label={model.model} size={14} />
                                    <span className="truncate font-medium">
                                      {model.model}
                                    </span>
                                  </span>
                                </Table.Cell>
                                <Table.Cell className="whitespace-nowrap text-end tabular-nums">
                                  {formatTokens(model.total_tokens)}
                                </Table.Cell>
                                <Table.Cell className="text-muted whitespace-nowrap text-end tabular-nums">
                                  {formatPercent(model.share)}
                                </Table.Cell>
                                <Table.Cell className="whitespace-nowrap text-end tabular-nums">
                                  {formatCost(Number(model.total_cost_usd))}
                                </Table.Cell>
                              </Table.Row>
                            ))}
                          </Table.Body>
                        </Table.Content>
                      </Table.ScrollContainer>
                    </Table>
                  )}
                </div>

                <div className="bg-default/40 flex flex-col gap-1 rounded-3xl px-3 py-2">
                  <Typography color="muted" type="body-xs">
                    {copy.detail.privacy}
                  </Typography>
                  <Typography color="muted" type="body-xs">
                    {copy.detail.costNote}
                  </Typography>
                </div>
              </Modal.Body>
            </>
          ) : null}
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

export function SessionsClient() {
  const router = useRouter();
  const [locale] = useLocale();
  const copy = SESSIONS_COPY[locale];
  const { formatTokens, formatCost, formatDuration, formatDateTime } =
    useFormat();

  const { accessToken, redirectToLogin } = useSessionBootstrap("/sessions");
  const searchParams = useSearchParams();
  const [filters, applyFilters] = useUrlFilters<Filters>({
    basePath: "/sessions",
    parse: parseFilters,
    serialize: serializeFilters,
    merge: mergeSessionFilters,
    initialParams: searchParams,
  });
  const [state, setState] = useState<Loadable<SessionsPayload>>(loadable);
  const [facets, setFacets] = useState<SessionsPayload["facets"]>({
    sources: [],
    devices: [],
  });
  const [knownDevices, setKnownDevices] = useState<Record<string, string>>({});
  const [detail, setDetail] = useState<SessionItem | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [rangePickerOpen, setRangePickerOpen] = useState(false);
  const requestId = useRef(0);

  const timezone = browserTimezone();
  const range = useMemo(
    () => rangeForSelection(filters.range, timezone, filters.from, filters.to),
    [filters.range, filters.from, filters.to, timezone],
  );
  // Range picker state: rangeForSelection resolves the URL day keys — valid
  // custom pairs pass through, presets resolve to their relative window
  // ending today — so the picker always shows a well-formed window.
  const rangePickerValue = useMemo(
    () => ({ start: parseDate(range.fromDay), end: parseDate(range.toDay) }),
    [range],
  );
  const rangePickerMax = useMemo(
    () => parseDate(dayKeyInTz(new Date(), timezone)),
    [timezone],
  );

  const load = useCallback(
    async (token: string) => {
      const id = requestId.current + 1;

      requestId.current = id;
      setRefreshing(true);
      setState((previous) =>
        previous.data == null ? { status: "loading", data: null } : previous,
      );

      try {
        const payload = await fetchSessions(token, {
          fromIso: range.fromIso,
          toIso: range.toIso,
          deviceId: filters.deviceId || null,
          source: filters.source || null,
          limit: filters.pageSize,
          offset: filters.offset,
        });

        if (requestId.current !== id) return;
        setState({ status: "ready", data: payload });
        setRefreshing(false);
        setLastUpdatedAt(Date.now());
        setFacets(payload.facets);
        setKnownDevices((previous) => {
          const next = { ...previous };

          for (const device of payload.facets.devices) {
            next[device.device_id] = device.device_name;
          }

          return next;
        });
      } catch (error) {
        if (requestId.current !== id) return;
        if (isUnauthorized(error)) {
          redirectToLogin();

          return;
        }
        // A failed refresh keeps the previous page on screen and flags it as
        // stale (DataTableCard shows the error bar); only an empty slot falls
        // through to the full error state.
        setState((previous) => ({ status: "error", data: previous.data }));
        setRefreshing(false);
      }
    },
    [
      filters.deviceId,
      filters.offset,
      filters.pageSize,
      filters.source,
      range.fromIso,
      range.toIso,
      redirectToLogin,
    ],
  );

  useEffect(() => {
    if (!accessToken) return;
    void load(accessToken);
  }, [accessToken, load]);

  // Filters can shrink the result set below the current page; snap back to
  // the last valid page instead of showing an empty page.
  useEffect(() => {
    if (state.status !== "ready" || !state.data) return;
    const { total, offset } = state.data;

    if (total === 0 && offset > 0) {
      applyFilters({ offset: 0 });

      return;
    }
    if (total > 0 && offset >= total) {
      applyFilters({
        offset: Math.floor((total - 1) / filters.pageSize) * filters.pageSize,
      });
    }
  }, [state, applyFilters, filters.pageSize]);

  const retry = useCallback(() => {
    if (accessToken) void load(accessToken);
  }, [accessToken, load]);

  const hasNarrowingFilters =
    filters.range !== "30d" ||
    Boolean(filters.from) ||
    Boolean(filters.to) ||
    Boolean(filters.deviceId) ||
    Boolean(filters.source);

  const clearFilters = useCallback(() => {
    applyFilters({
      range: "30d",
      from: "",
      to: "",
      deviceId: "",
      source: "",
    });
  }, [applyFilters]);

  const deviceOptions = useMemo(() => {
    const list = [...facets.devices];

    if (
      filters.deviceId &&
      !list.some((device) => device.device_id === filters.deviceId)
    ) {
      list.unshift({
        device_id: filters.deviceId,
        device_name: knownDevices[filters.deviceId] ?? filters.deviceId,
        sessions: 0,
      });
    }

    return list;
  }, [facets.devices, filters.deviceId, knownDevices]);

  const sourceOptions = useMemo(() => {
    const list = [...facets.sources];

    if (
      filters.source &&
      !list.some((entry) => entry.source === filters.source)
    ) {
      list.unshift({ source: filters.source, sessions: 0 });
    }

    return list;
  }, [facets.sources, filters.source]);

  const payload = state.data;
  const totalPages =
    payload && payload.total > 0
      ? Math.ceil(payload.total / filters.pageSize)
      : 1;
  const currentPage = Math.min(
    totalPages,
    Math.floor((payload?.offset ?? 0) / filters.pageSize) + 1,
  );

  const columns = useMemo<DataTableColumn<SessionItem>[]>(
    () => [
      {
        id: "endedAt",
        header: copy.list.endedAt,
        className: "whitespace-nowrap",
        cell: (session) => formatDateTime(session.ended_at),
      },
      {
        id: "source",
        header: copy.list.source,
        cell: (session) => (
          <Chip size="sm" variant="soft">
            <SourceIcon label={session.source} size={12} />
            {sourceDisplayLabel(session.source)}
          </Chip>
        ),
      },
      {
        id: "project",
        header: copy.list.project,
        className: "max-w-48 truncate",
        cell: (session) => session.project_key ?? copy.list.noProject,
      },
      {
        id: "device",
        header: copy.list.device,
        className: "max-w-40 truncate",
        cell: (session) => session.device_name,
      },
      {
        id: "duration",
        header: copy.list.duration,
        className: "whitespace-nowrap tabular-nums",
        cell: (session) => formatDuration(session.duration_ms),
      },
      {
        id: "tokens",
        header: copy.list.tokens,
        className: "whitespace-nowrap tabular-nums",
        cell: (session) => formatTokens(session.total_tokens),
      },
      {
        id: "cost",
        header: copy.list.cost,
        className: "whitespace-nowrap tabular-nums",
        cell: (session) => formatCost(Number(session.total_cost_usd)),
      },
      {
        id: "models",
        header: copy.list.models,
        cell: (session) => <ModelChips models={session.models} />,
      },
      {
        id: "detail",
        header: copy.list.detail,
        cell: (session) => (
          <Button
            size="sm"
            variant="tertiary"
            onPress={() => setDetail(session)}
          >
            {copy.list.view}
          </Button>
        ),
      },
    ],
    [copy, formatCost, formatDateTime, formatDuration, formatTokens],
  );

  const renderSessionRow = (session: SessionItem) => (
    <Card className="p-3">
      <Card.Content className="gap-2">
        <div className="flex items-center justify-between gap-2">
          <Typography type="body-sm" weight="semibold">
            {formatDateTime(session.ended_at)}
          </Typography>
          <Chip size="sm" variant="soft">
            {session.source}
          </Chip>
        </div>
        <div className="text-muted flex flex-wrap gap-x-3 gap-y-1 text-xs">
          <span className="max-w-48 truncate">
            {session.project_key ?? copy.list.noProject}
          </span>
          <span className="max-w-40 truncate">{session.device_name}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className="tabular-nums">
            {formatTokens(session.total_tokens)}
          </span>
          <span className="tabular-nums">
            {formatCost(Number(session.total_cost_usd))}
          </span>
          <span className="text-muted tabular-nums">
            {formatDuration(session.duration_ms)}
          </span>
        </div>
        <div className="flex items-end justify-between gap-2">
          <ModelChips models={session.models} />
          <Button
            size="sm"
            variant="tertiary"
            onPress={() => setDetail(session)}
          >
            {copy.list.view}
          </Button>
        </div>
      </Card.Content>
    </Card>
  );

  const filterEmpty = (
    <div className="flex flex-col items-start gap-2 py-6">
      <Typography type="body-sm" weight="semibold">
        {copy.states.filterEmptyTitle}
      </Typography>
      <Typography color="muted" type="body-sm">
        {copy.states.filterEmptyBody}
      </Typography>
      <Button size="sm" variant="outline" onPress={clearFilters}>
        {copy.clearFilters}
      </Button>
    </div>
  );

  const emptyState = (
    <div className="flex flex-col items-start gap-2 py-6">
      <ListUl aria-hidden="true" className="text-muted size-6" />
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
            window.open(UPGRADE_URL, "_blank", "noopener,noreferrer")
          }
        >
          {copy.states.emptyDocs}
        </Button>
      </div>
    </div>
  );

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 md:px-8">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <Typography color="muted" type="body-xs">
            {copy.rangeLabel}
          </Typography>
          <DateRangePicker
            aria-label={copy.rangeLabel}
            className="w-64"
            isOpen={rangePickerOpen}
            maxValue={rangePickerMax}
            minValue={parseDate(ALL_RANGE_START)}
            value={rangePickerValue}
            onChange={(value) => {
              if (!value || value.end.compare(rangePickerMax) > 0) return;

              applyFilters({
                range: "custom",
                from: value.start.toString(),
                to: value.end.toString(),
              });
            }}
            onOpenChange={setRangePickerOpen}
          >
            <DateField.Group fullWidth>
              <DateField.Input slot="start">
                {(segment) => <DateField.Segment segment={segment} />}
              </DateField.Input>
              <DateRangePicker.RangeSeparator />
              <DateField.Input slot="end">
                {(segment) => <DateField.Segment segment={segment} />}
              </DateField.Input>
              <DateField.Suffix>
                <DateRangePicker.Trigger>
                  <DateRangePicker.TriggerIndicator />
                </DateRangePicker.Trigger>
              </DateField.Suffix>
            </DateField.Group>
            <DateRangePicker.Popover>
              <RangePresetButtons
                ariaLabel={copy.rangeLabel}
                labels={copy.ranges}
                presets={SESSION_RANGE_PRESETS}
                selected={filters.range}
                onSelect={(preset) => {
                  applyFilters({
                    range: preset as SessionRange,
                    from: "",
                    to: "",
                  });
                  setRangePickerOpen(false);
                }}
              />
              <RangeCalendar
                aria-label={copy.rangeLabel}
                maxValue={rangePickerMax}
              >
                <RangeCalendar.Header>
                  <RangeCalendar.YearPickerTrigger>
                    <RangeCalendar.YearPickerTriggerHeading />
                    <RangeCalendar.YearPickerTriggerIndicator />
                  </RangeCalendar.YearPickerTrigger>
                  <RangeCalendar.NavButton slot="previous" />
                  <RangeCalendar.NavButton slot="next" />
                </RangeCalendar.Header>
                <RangeCalendar.Grid>
                  <RangeCalendar.GridHeader>
                    {(day) => (
                      <RangeCalendar.HeaderCell>{day}</RangeCalendar.HeaderCell>
                    )}
                  </RangeCalendar.GridHeader>
                  <RangeCalendar.GridBody>
                    {(date) => <RangeCalendar.Cell date={date} />}
                  </RangeCalendar.GridBody>
                </RangeCalendar.Grid>
                <RangeCalendar.YearPickerGrid>
                  <RangeCalendar.YearPickerGridBody>
                    {({ year }) => <RangeCalendar.YearPickerCell year={year} />}
                  </RangeCalendar.YearPickerGridBody>
                </RangeCalendar.YearPickerGrid>
              </RangeCalendar>
            </DateRangePicker.Popover>
          </DateRangePicker>
        </label>

        <DeviceFilterSelect
          allLabel={copy.allDevices}
          devices={deviceOptions}
          label={copy.deviceLabel}
          loading={state.status === "loading"}
          value={filters.deviceId}
          onChange={(deviceId) => applyFilters({ deviceId })}
        />

        <label className="flex flex-col gap-1">
          <Typography color="muted" type="body-xs">
            {copy.sourceLabel}
          </Typography>
          <Select
            aria-label={copy.sourceLabel}
            className="w-44"
            value={filters.source || "__all"}
            onChange={(key: Key | null) => {
              if (key == null) return;
              const value = String(key);

              applyFilters({ source: value === "__all" ? "" : value });
            }}
          >
            <Select.Trigger>
              <Select.Value>
                {({ selectedText }) => (
                  <span className="flex min-w-0 items-center gap-2">
                    {filters.source ? (
                      <SourceIcon label={filters.source} size={14} />
                    ) : (
                      <Layers
                        aria-hidden="true"
                        className="text-muted size-4 shrink-0"
                      />
                    )}
                    <span className="truncate">{selectedText}</span>
                  </span>
                )}
              </Select.Value>
              {state.status === "loading" ? (
                <Select.Indicator>
                  <Spinner size="sm" />
                </Select.Indicator>
              ) : (
                <Select.Indicator />
              )}
            </Select.Trigger>
            <Select.Popover>
              <Popover.Arrow />
              <ListBox>
                <ListBox.Item id="__all" textValue={copy.allSources}>
                  <Layers
                    aria-hidden="true"
                    className="text-muted size-4 shrink-0"
                  />
                  {copy.allSources}
                </ListBox.Item>
                {sourceOptions.map((entry) => (
                  <ListBox.Item
                    key={entry.source}
                    id={entry.source}
                    textValue={sourceDisplayLabel(entry.source)}
                  >
                    <SourceIcon label={entry.source} size={14} />
                    {sourceDisplayLabel(entry.source)}
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
        </label>

        {hasNarrowingFilters ? (
          <Button size="sm" variant="ghost" onPress={clearFilters}>
            {copy.clearFilters}
          </Button>
        ) : null}

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

      <div className="flex flex-col gap-5">
        {state.status === "loading" && !payload ? (
          <SummaryCardsSkeleton copy={copy} />
        ) : null}

        {payload ? <SummaryCards copy={copy} payload={payload} /> : null}

        <DataTableCard
          columns={columns}
          empty={hasNarrowingFilters ? filterEmpty : emptyState}
          error={{
            message: copy.states.loadError,
            onRetry: retry,
            retryLabel: copy.states.retry,
          }}
          hint={copy.list.hint}
          pagination={
            payload
              ? {
                  labels: copy.list,
                  locale,
                  onPageChange: (page) =>
                    applyFilters({
                      offset: (page - 1) * filters.pageSize,
                    }),
                  onPageSizeChange: (next) => {
                    // Keep the current page anchored when the size changes;
                    // an explicit offset skips the auto-reset.
                    const page = Math.floor(filters.offset / filters.pageSize);

                    applyFilters({ pageSize: next, offset: page * next });
                  },
                  page: currentPage,
                  pageSize: filters.pageSize,
                  total: payload.total,
                }
              : undefined
          }
          refreshing={refreshing}
          renderMobileRow={renderSessionRow}
          rowKey={rowKey}
          rows={payload?.sessions ?? []}
          status={state.status}
          tableLabel={copy.list.title}
          title={copy.list.title}
          onRowAction={(session) => setDetail(session)}
        />
      </div>

      <SessionDetailModal
        copy={copy}
        session={detail}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
      />
    </main>
  );
}
