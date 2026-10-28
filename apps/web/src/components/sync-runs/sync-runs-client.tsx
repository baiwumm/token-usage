"use client";

// Sync runs at /sync-runs (docs/cli-contract.md §2.12). One row per collector
// sync — empty runs included, doubling as the collector's heartbeat. Aggregate
// telemetry only: counters, enums and versions, never paths or titles.
//
// Device/trigger/result filters and the server-side offset live in the URL;
// the time range is session-only (mirrors sessions, 2026-10-26). Filter
// changes only refetch data (replaceState + popstate sync, no navigation).

import {
  ArrowsRotateRight,
  Clock,
  ClockArrowRotateLeft,
  ListUl,
} from "@gravity-ui/icons";
import {
  Button,
  Card,
  Chip,
  DateField,
  DateRangePicker,
  ListBox,
  Popover,
  RangeCalendar,
  Select,
  Spinner,
  Table,
  Tooltip,
  Typography,
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
import { SYNC_RUNS_COPY, type SyncRunsCopy } from "@/lib/copy/sync-runs";
import { useUrlFilters } from "@/lib/dashboard/url-filters";
import { loadable, type Loadable } from "@/lib/loadable";
import { PAGE_SIZE_OPTIONS } from "@/lib/ui/pagination";
import {
  DashboardApiError,
  fetchAccountDevices,
  fetchSyncRuns,
  type SyncRunItem,
  type SyncRunsPayload,
} from "@/lib/dashboard/api";
import {
  ALL_RANGE_START,
  browserTimezone,
  dayKeyInTz,
  isValidDayKey,
  rangeForPreset,
  rangeForSelection,
} from "@/lib/dashboard/ranges";
import { useFormat } from "@/lib/format/format";
import { SectionSkeleton } from "@/components/section-states";
import { TablePagination } from "@/components/table-pagination";
import { FlowNumber } from "@/components/flow-number";
import { DeviceFilterSelect } from "@/components/device-filter-select";
import { RangePresetButtons } from "@/components/range-preset-buttons";

const DEFAULT_PAGE_SIZE = 20;
const UPGRADE_URL = "https://github.com/baiwumm/token-usage#readme";

const SYNC_RANGE_PRESETS = ["today", "7d", "30d", "90d"] as const;

type SyncRunRange = (typeof SYNC_RANGE_PRESETS)[number] | "custom";

const TRIGGER_OPTIONS = ["scheduled", "manual", "watch", "notify"] as const;
const RESULT_OPTIONS = ["ok", "partial", "error"] as const;

interface Filters {
  range: SyncRunRange;
  from: string;
  to: string;
  deviceId: string;
  trigger: string;
  result: string;
  offset: number;
  pageSize: number;
}

// Range filters never round-trip the URL (operator call 2026-10-26, same as
// sessions): a stale ?range=…&from=… link must not pin the list to old dates,
// so only device/trigger/result/paging persist and every load starts at the
// default window.
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
    trigger: params.get("trigger") ?? "",
    result: params.get("result") ?? "",
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
  if (filters.trigger) query.set("trigger", filters.trigger);
  if (filters.result) query.set("result", filters.result);
  if (filters.offset > 0) query.set("offset", String(filters.offset));
  if (filters.pageSize !== DEFAULT_PAGE_SIZE) {
    query.set("page_size", String(filters.pageSize));
  }

  return query.toString();
}

// Any filter change restarts paging unless the patch is the page itself.
function mergeSyncRunFilters(
  previous: Filters,
  patch: Partial<Filters>,
): Filters {
  const next = { ...previous, ...patch };

  if (!("offset" in patch)) next.offset = 0;

  return next;
}

function rowKey(run: SyncRunItem): string {
  return `${run.device_id}|${run.run_id}`;
}

function isUnauthorized(error: unknown): boolean {
  return error instanceof DashboardApiError && error.status === 401;
}

function resultChipColor(
  result: string,
): "success" | "warning" | "danger" | undefined {
  if (result === "ok") return "success";
  if (result === "partial") return "warning";
  if (result === "error") return "danger";

  return undefined;
}

function RunResultCell({
  run,
  copy,
}: {
  run: SyncRunItem;
  copy: SyncRunsCopy;
}) {
  const color = resultChipColor(run.result);

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip color={color} size="sm" variant="soft">
          {copy.result[run.result as keyof typeof copy.result] ?? run.result}
        </Chip>
        {run.empty ? (
          <Chip className="text-muted" size="sm" variant="soft">
            {copy.emptyChip}
          </Chip>
        ) : null}
      </div>
      {run.result === "error" && run.error_code ? (
        <Typography color="muted" type="body-xs">
          {run.error_code}
        </Typography>
      ) : null}
    </div>
  );
}

function RunVolumeCell({
  run,
  copy,
}: {
  run: SyncRunItem;
  copy: SyncRunsCopy;
}) {
  const { formatTokens, formatNumber } = useFormat();

  return (
    <div className="flex flex-col">
      <Typography className="whitespace-nowrap tabular-nums" type="body-sm">
        {formatTokens(run.tokens_ingested)}
      </Typography>
      <Typography
        className="whitespace-nowrap tabular-nums"
        color="muted"
        type="body-xs"
      >
        {formatNumber(run.parsed_files)} {copy.list.filesUnit} ·{" "}
        {formatNumber(run.buckets_uploaded)} {copy.list.bucketsUnit}
      </Typography>
    </div>
  );
}

function SummaryCards({
  todayRuns,
  lastRunAt,
  copy,
}: {
  todayRuns: SyncRunsPayload | null;
  lastRunAt: string | null;
  copy: SyncRunsCopy;
}) {
  const { formatDateTime, formatNumber, formatRelativeTime } = useFormat();
  const [locale] = useLocale();
  const emptyRuns = todayRuns?.totals.empty_runs ?? 0;
  const cards = [
    {
      key: "today",
      label: copy.cards.todayRuns,
      icon: ClockArrowRotateLeft,
      value: formatNumber(todayRuns?.totals.runs ?? 0),
      sub:
        todayRuns && emptyRuns > 0
          ? formatMessage(copy.cards.todayEmptyHint, locale, {
              count: emptyRuns,
            })
          : undefined,
    },
    {
      key: "last",
      label: copy.cards.lastRun,
      icon: Clock,
      value: lastRunAt ? formatDateTime(lastRunAt) : copy.cards.emptyValue,
      sub: lastRunAt ? formatRelativeTime(lastRunAt) : undefined,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

export function SyncRunsClient() {
  const router = useRouter();
  const [locale] = useLocale();
  const copy = SYNC_RUNS_COPY[locale];
  const { formatDateTime, formatDuration } = useFormat();

  const { accessToken, redirectToLogin } = useSessionBootstrap("/sync-runs");
  const [filters, applyFilters] = useUrlFilters<Filters>({
    basePath: "/sync-runs",
    parse: parseFilters,
    serialize: serializeFilters,
    merge: mergeSyncRunFilters,
  });
  const [state, setState] = useState<Loadable<SyncRunsPayload>>(loadable);
  const [todayState, setTodayState] =
    useState<Loadable<SyncRunsPayload>>(loadable);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [knownDevices, setKnownDevices] = useState<Record<string, string>>({});
  const [accountDevices, setAccountDevices] = useState<
    Array<{ device_id: string; device_name: string }>
  >([]);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [rangePickerOpen, setRangePickerOpen] = useState(false);
  const requestId = useRef(0);

  const timezone = browserTimezone();
  const range = useMemo(
    () => rangeForSelection(filters.range, timezone, filters.from, filters.to),
    [filters.range, filters.from, filters.to, timezone],
  );
  const todayRange = useMemo(
    () => rangeForPreset("today", timezone),
    [timezone],
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
      setTodayState((previous) =>
        previous.data == null ? { status: "loading", data: null } : previous,
      );

      try {
        // The today block and the device facet ride along on every load —
        // small payloads, and keeping them parallel keeps the code flat.
        const [payload, todayPayload, devices] = await Promise.all([
          fetchSyncRuns({
            fromIso: range.fromIso,
            toIso: range.toIso,
            deviceId: filters.deviceId || null,
            trigger: filters.trigger || null,
            result: filters.result || null,
            limit: filters.pageSize,
            offset: filters.offset,
          }),
          fetchSyncRuns({
            fromIso: todayRange.fromIso,
            toIso: todayRange.toIso,
          }),
          fetchAccountDevices(token, {
            from: range.fromDay,
            to: range.toDay,
          }),
        ]);

        if (requestId.current !== id) return;
        setState({ status: "ready", data: payload });
        setTodayState({ status: "ready", data: todayPayload });
        setRefreshing(false);
        setLastUpdatedAt(Date.now());
        setAccountDevices(
          (devices.devices ?? []).map((device) => ({
            device_id: device.id,
            device_name: device.device_name,
          })),
        );

        // "Last run": today's newest row, else the newest run of the past
        // week (one tiny probe so the card stays honest on quiet days).
        if (todayPayload.totals.runs > 0) {
          setLastRunAt(todayPayload.runs[0]?.started_at ?? null);
        } else {
          const week = await fetchSyncRuns({
            fromIso: rangeForPreset("7d", timezone).fromIso,
            toIso: todayRange.toIso,
            limit: 1,
          });

          if (requestId.current !== id) return;
          setLastRunAt(week.runs[0]?.started_at ?? null);
        }

        setKnownDevices((previous) => {
          const next = { ...previous };

          for (const run of payload.runs) {
            next[run.device_id] = run.device_name;
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
      filters.result,
      filters.trigger,
      range.fromDay,
      range.fromIso,
      range.toDay,
      range.toIso,
      redirectToLogin,
      todayRange,
      timezone,
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
    Boolean(filters.trigger) ||
    Boolean(filters.result);

  const clearFilters = useCallback(() => {
    applyFilters({
      range: "30d",
      from: "",
      to: "",
      deviceId: "",
      trigger: "",
      result: "",
    });
  }, [applyFilters]);

  const deviceOptions = useMemo(() => {
    const byId = new Map<string, { device_id: string; device_name: string }>();

    for (const device of accountDevices) {
      byId.set(device.device_id, device);
    }
    for (const [deviceId, deviceName] of Object.entries(knownDevices)) {
      if (!byId.has(deviceId)) {
        byId.set(deviceId, { device_id: deviceId, device_name: deviceName });
      }
    }

    const list = [...byId.values()];

    if (
      filters.deviceId &&
      !list.some((device) => device.device_id === filters.deviceId)
    ) {
      list.unshift({
        device_id: filters.deviceId,
        device_name: knownDevices[filters.deviceId] ?? filters.deviceId,
      });
    }

    return list;
  }, [accountDevices, filters.deviceId, knownDevices]);

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
                presets={SYNC_RANGE_PRESETS}
                selected={filters.range}
                onSelect={(preset) => {
                  applyFilters({
                    range: preset as SyncRunRange,
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
            {copy.triggerLabel}
          </Typography>
          <Select
            aria-label={copy.triggerLabel}
            className="w-40"
            value={filters.trigger || "__all"}
            onChange={(key: Key | null) => {
              if (key == null) return;
              const value = String(key);

              applyFilters({ trigger: value === "__all" ? "" : value });
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
                <ListBox.Item id="__all" textValue={copy.allTriggers}>
                  {copy.allTriggers}
                </ListBox.Item>
                {TRIGGER_OPTIONS.map((trigger) => (
                  <ListBox.Item
                    key={trigger}
                    id={trigger}
                    textValue={copy.trigger[trigger]}
                  >
                    {copy.trigger[trigger]}
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
        </label>

        <label className="flex flex-col gap-1">
          <Typography color="muted" type="body-xs">
            {copy.resultLabel}
          </Typography>
          <Select
            aria-label={copy.resultLabel}
            className="w-40"
            value={filters.result || "__all"}
            onChange={(key: Key | null) => {
              if (key == null) return;
              const value = String(key);

              applyFilters({ result: value === "__all" ? "" : value });
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
                <ListBox.Item id="__all" textValue={copy.allResults}>
                  {copy.allResults}
                </ListBox.Item>
                {RESULT_OPTIONS.map((result) => (
                  <ListBox.Item
                    key={result}
                    id={result}
                    textValue={copy.result[result]}
                  >
                    {copy.result[result]}
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

      {state.status === "loading" ? (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {Array.from({ length: 2 }, (_, index) => (
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
        <div className="flex flex-col gap-5">
          <SummaryCards
            copy={copy}
            lastRunAt={lastRunAt}
            todayRuns={todayState.data}
          />

          <Card className="p-4 md:p-6">
            <Card.Header className="flex-col items-start gap-1">
              <Card.Title>{copy.list.title}</Card.Title>
              <Typography color="muted" type="body-xs">
                {copy.list.hint}
              </Typography>
            </Card.Header>
            <Card.Content className="relative gap-4">
              {refreshing ? (
                <div
                  aria-hidden="true"
                  className="bg-surface/60 absolute inset-0 z-10 flex items-center justify-center rounded-2xl backdrop-blur-[2px]"
                >
                  <Spinner size="sm" />
                </div>
              ) : null}
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
                        {copy.states.emptyUpgrade}
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
                              {copy.list.startedAt}
                            </Table.Column>
                            <Table.Column>{copy.list.device}</Table.Column>
                            <Table.Column>{copy.list.trigger}</Table.Column>
                            <Table.Column>{copy.list.result}</Table.Column>
                            <Table.Column>{copy.list.duration}</Table.Column>
                            <Table.Column>{copy.list.volume}</Table.Column>
                          </Table.Header>
                          <Table.Body>
                            {payload.runs.map((run) => (
                              <Table.Row key={rowKey(run)} id={rowKey(run)}>
                                <Table.Cell className="whitespace-nowrap">
                                  {formatDateTime(run.started_at)}
                                </Table.Cell>
                                <Table.Cell className="max-w-40 truncate">
                                  {run.device_name}
                                </Table.Cell>
                                <Table.Cell>
                                  <Chip size="sm" variant="soft">
                                    {copy.trigger[
                                      run.trigger as keyof typeof copy.trigger
                                    ] ?? run.trigger}
                                  </Chip>
                                </Table.Cell>
                                <Table.Cell>
                                  <RunResultCell copy={copy} run={run} />
                                </Table.Cell>
                                <Table.Cell className="whitespace-nowrap tabular-nums">
                                  {formatDuration(run.duration_ms)}
                                </Table.Cell>
                                <Table.Cell>
                                  <RunVolumeCell copy={copy} run={run} />
                                </Table.Cell>
                              </Table.Row>
                            ))}
                          </Table.Body>
                        </Table.Content>
                      </Table.ScrollContainer>
                    </Table>
                  </div>

                  <div className="flex flex-col gap-3 md:hidden">
                    {payload.runs.map((run) => (
                      <Card key={rowKey(run)} className="p-3">
                        <Card.Content className="gap-2">
                          <div className="flex items-center justify-between gap-2">
                            <Typography type="body-sm" weight="semibold">
                              {formatDateTime(run.started_at)}
                            </Typography>
                            <div className="flex items-center gap-1.5">
                              <Chip size="sm" variant="soft">
                                {copy.trigger[
                                  run.trigger as keyof typeof copy.trigger
                                ] ?? run.trigger}
                              </Chip>
                              {run.empty ? (
                                <Chip
                                  className="text-muted"
                                  size="sm"
                                  variant="soft"
                                >
                                  {copy.emptyChip}
                                </Chip>
                              ) : null}
                            </div>
                          </div>
                          <div className="text-muted flex flex-wrap gap-x-3 gap-y-1 text-xs">
                            <span className="max-w-40 truncate">
                              {run.device_name}
                            </span>
                            <span>
                              {copy.result[
                                run.result as keyof typeof copy.result
                              ] ?? run.result}
                              {run.result === "error" && run.error_code
                                ? ` · ${run.error_code}`
                                : ""}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                            <span className="tabular-nums">
                              {formatDuration(run.duration_ms)}
                            </span>
                            <span className="tabular-nums">
                              {run.parsed_files} {copy.list.filesUnit} ·{" "}
                              {run.buckets_uploaded} {copy.list.bucketsUnit}
                            </span>
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
    </main>
  );
}
