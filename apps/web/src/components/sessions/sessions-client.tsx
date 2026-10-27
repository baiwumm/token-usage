"use client";

// Sessions at /sessions (docs/ui-spec.md Sessions, M5.6). Device-level
// metadata only — the API never returns prompts, bodies, titles, absolute
// paths or resume commands, and session_id stays an internal key.
//
// Device/source filters, search and the server-side offset live in the URL;
// the time range is session-only (mirrors the dashboard, 2026-10-26). Filter
// changes only refetch data (replaceState + popstate sync, no navigation).

import { ChartColumn, Clock, Layers, ListUl, Wallet } from "@gravity-ui/icons";
import {
  Button,
  Card,
  Chip,
  DateField,
  DateRangePicker,
  Input,
  ListBox,
  Modal,
  RangeCalendar,
  Select,
  Spinner,
  Table,
  TextField,
  Typography,
  Popover,
} from "@heroui/react";
import { parseDate } from "@internationalized/date";
import { useRouter } from "next/navigation";
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
import { SectionSkeleton } from "@/components/section-states";
import { TablePagination } from "@/components/table-pagination";
import { FlowNumber } from "@/components/flow-number";
import { SourceIcon } from "@/components/dashboard/source-icon";
import { sourceDisplayLabel } from "@/components/dashboard/sources";
import { DeviceFilterSelect } from "@/components/device-filter-select";
import { RangePresetButtons } from "@/components/range-preset-buttons";

const DEFAULT_PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 350;
const UPGRADE_URL = "https://github.com/baiwumm/token-usage#readme";

const SESSION_RANGE_PRESETS = ["today", "7d", "30d", "90d"] as const;

type SessionRange = (typeof SESSION_RANGE_PRESETS)[number] | "custom";

interface Filters {
  range: SessionRange;
  from: string;
  to: string;
  deviceId: string;
  source: string;
  q: string;
  offset: number;
  pageSize: number;
}

// Range filters never round-trip the URL (operator call 2026-10-26, same as
// the dashboard): a stale ?range=…&from=… link must not pin the list to old
// dates, so only device/source/search/paging persist and every load starts
// at the default window. Exception: a fresh cross-page entry (heatmap cell →
// sessions) may seed an exact window once — serialize() never emits from/to,
// so the first filter change rewrites it away.
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
    q: params.get("q") ?? "",
    offset:
      Number.isFinite(rawOffset) && rawOffset > 0 ? Math.trunc(rawOffset) : 0,
    pageSize: (PAGE_SIZE_OPTIONS as readonly number[]).includes(rawPageSize)
      ? rawPageSize
      : DEFAULT_PAGE_SIZE,
  };
}

function serializeFilters(filters: Filters): string {
  const query = new URLSearchParams();

  if (filters.deviceId) query.set("device_id", filters.deviceId);
  if (filters.source) query.set("source", filters.source);
  if (filters.q) query.set("q", filters.q);
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

// Debounced search box: owns the draft so each keystroke re-renders only
// this subtree, not the whole sessions table (the debounce already gated
// fetches; this gates renders the same way). External commits (popstate,
// clear filters) sync back through `committed`.
function SessionSearchInput({
  committed,
  onCommit,
  label,
  placeholder,
}: {
  committed: string;
  onCommit: (q: string) => void;
  label: string;
  placeholder: string;
}) {
  const [draft, setDraft] = useState(committed);

  useEffect(() => {
    setDraft(committed);
  }, [committed]);

  useEffect(() => {
    if (draft === committed) return;
    const timer = window.setTimeout(
      () => onCommit(draft.trim()),
      SEARCH_DEBOUNCE_MS,
    );

    return () => window.clearTimeout(timer);
  }, [draft, committed, onCommit]);

  return (
    <TextField
      aria-label={label}
      className="w-52"
      value={draft}
      onChange={setDraft}
    >
      <Input placeholder={placeholder} type="search" />
    </TextField>
  );
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
  const [filters, applyFilters] = useUrlFilters<Filters>({
    basePath: "/sessions",
    parse: parseFilters,
    serialize: serializeFilters,
    merge: mergeSessionFilters,
  });
  const [state, setState] = useState<Loadable<SessionsPayload>>(loadable);
  const [facets, setFacets] = useState<SessionsPayload["facets"]>({
    sources: [],
    devices: [],
  });
  const [knownDevices, setKnownDevices] = useState<Record<string, string>>({});
  const [detail, setDetail] = useState<SessionItem | null>(null);
  const [refreshing, setRefreshing] = useState(false);
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

  const commitQ = useCallback(
    (q: string) => applyFilters({ q }),
    [applyFilters],
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
          q: filters.q || null,
          limit: filters.pageSize,
          offset: filters.offset,
        });

        if (requestId.current !== id) return;
        setState({ status: "ready", data: payload });
        setRefreshing(false);
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
        // A failed refresh keeps the previous page; only an empty slot
        // (initial load) falls back to the error state.
        setState((previous) =>
          previous.data != null ? previous : { status: "error", data: null },
        );
        setRefreshing(false);
      }
    },
    [
      filters.deviceId,
      filters.offset,
      filters.pageSize,
      filters.q,
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
    Boolean(filters.source) ||
    Boolean(filters.q);

  const clearFilters = useCallback(() => {
    applyFilters({
      range: "30d",
      from: "",
      to: "",
      deviceId: "",
      source: "",
      q: "",
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
              <Select.Indicator />
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

        <label className="flex flex-col gap-1">
          <Typography color="muted" type="body-xs">
            {copy.projectLabel}
          </Typography>
          <SessionSearchInput
            committed={filters.q}
            label={copy.projectLabel}
            placeholder={copy.projectPlaceholder}
            onCommit={commitQ}
          />
        </label>

        {hasNarrowingFilters ? (
          <Button size="sm" variant="ghost" onPress={clearFilters}>
            {copy.clearFilters}
          </Button>
        ) : null}
      </div>

      {state.status === "loading" ? (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <SectionSkeleton key={index} className="h-28 w-full" />
            ))}
          </div>
          <SectionSkeleton className="h-80 w-full" />
        </div>
      ) : null}

      {state.status === "error" ? (
        <Card className="p-6">
          <Card.Content className="flex flex-col items-start gap-2">
            <Typography className="text-danger" type="body-sm">
              {copy.states.loadError}
            </Typography>
            <Button size="sm" variant="outline" onPress={retry}>
              {copy.states.retry}
            </Button>
          </Card.Content>
        </Card>
      ) : null}

      {state.status === "ready" && payload ? (
        <div className="relative flex flex-col gap-5">
          {refreshing ? (
            <div
              aria-hidden="true"
              className="bg-surface/60 absolute inset-0 z-10 flex items-start justify-center pt-24 backdrop-blur-[2px]"
            >
              <Spinner size="sm" />
            </div>
          ) : null}
          <SummaryCards copy={copy} payload={payload} />

          <Card className="p-4 md:p-6">
            <Card.Header className="flex-col items-start gap-1">
              <Card.Title>{copy.list.title}</Card.Title>
              <Typography color="muted" type="body-xs">
                {copy.list.hint}
              </Typography>
            </Card.Header>
            <Card.Content className="gap-4">
              {payload.total === 0 ? (
                hasNarrowingFilters ? (
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
                ) : (
                  <div className="flex flex-col items-start gap-2 py-6">
                    <ListUl aria-hidden="true" className="text-muted size-6" />
                    <Typography type="body-sm" weight="semibold">
                      {copy.states.emptyTitle}
                    </Typography>
                    <Typography
                      className="max-w-2xl"
                      color="muted"
                      type="body-sm"
                    >
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
                          window.open(
                            UPGRADE_URL,
                            "_blank",
                            "noopener,noreferrer",
                          )
                        }
                      >
                        {copy.states.emptyDocs}
                      </Button>
                    </div>
                  </div>
                )
              ) : (
                <>
                  <div className="hidden md:block">
                    <Table>
                      <Table.ScrollContainer>
                        <Table.Content aria-label={copy.list.title}>
                          <Table.Header>
                            <Table.Column isRowHeader>
                              {copy.list.endedAt}
                            </Table.Column>
                            <Table.Column>{copy.list.source}</Table.Column>
                            <Table.Column>{copy.list.project}</Table.Column>
                            <Table.Column>{copy.list.device}</Table.Column>
                            <Table.Column>{copy.list.duration}</Table.Column>
                            <Table.Column>{copy.list.tokens}</Table.Column>
                            <Table.Column>{copy.list.cost}</Table.Column>
                            <Table.Column>{copy.list.models}</Table.Column>
                            <Table.Column>{copy.list.detail}</Table.Column>
                          </Table.Header>
                          <Table.Body>
                            {payload.sessions.map((session) => (
                              <Table.Row
                                key={rowKey(session)}
                                id={rowKey(session)}
                                onAction={() => setDetail(session)}
                              >
                                <Table.Cell className="whitespace-nowrap">
                                  {formatDateTime(session.ended_at)}
                                </Table.Cell>
                                <Table.Cell>
                                  <Chip size="sm" variant="soft">
                                    <SourceIcon
                                      label={session.source}
                                      size={12}
                                    />
                                    {sourceDisplayLabel(session.source)}
                                  </Chip>
                                </Table.Cell>
                                <Table.Cell className="max-w-48 truncate">
                                  {session.project_key ?? copy.list.noProject}
                                </Table.Cell>
                                <Table.Cell className="max-w-40 truncate">
                                  {session.device_name}
                                </Table.Cell>
                                <Table.Cell className="whitespace-nowrap tabular-nums">
                                  {formatDuration(session.duration_ms)}
                                </Table.Cell>
                                <Table.Cell className="whitespace-nowrap tabular-nums">
                                  {formatTokens(session.total_tokens)}
                                </Table.Cell>
                                <Table.Cell className="whitespace-nowrap tabular-nums">
                                  {formatCost(Number(session.total_cost_usd))}
                                </Table.Cell>
                                <Table.Cell>
                                  <ModelChips models={session.models} />
                                </Table.Cell>
                                <Table.Cell>
                                  <Button
                                    size="sm"
                                    variant="tertiary"
                                    onPress={() => setDetail(session)}
                                  >
                                    {copy.list.view}
                                  </Button>
                                </Table.Cell>
                              </Table.Row>
                            ))}
                          </Table.Body>
                        </Table.Content>
                      </Table.ScrollContainer>
                    </Table>
                  </div>

                  <div className="flex flex-col gap-3 md:hidden">
                    {payload.sessions.map((session) => (
                      <Card key={rowKey(session)} className="p-3">
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
                            <span className="max-w-40 truncate">
                              {session.device_name}
                            </span>
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
                    ))}
                  </div>

                  <TablePagination
                    labels={copy.list}
                    locale={locale}
                    page={currentPage}
                    pageSize={filters.pageSize}
                    total={payload.total}
                    onPageChange={(page) =>
                      applyFilters({
                        offset: (page - 1) * filters.pageSize,
                      })
                    }
                    onPageSizeChange={(next) => {
                      // Keep the current page anchored when the size
                      // changes; an explicit offset skips the auto-reset.
                      const page = Math.floor(
                        filters.offset / filters.pageSize,
                      );

                      applyFilters({ pageSize: next, offset: page * next });
                    }}
                  />
                </>
              )}
            </Card.Content>
          </Card>
        </div>
      ) : null}

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
