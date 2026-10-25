"use client";

// Sessions at /sessions (docs/ui-spec.md Sessions, M5.6). Device-level
// metadata only — the API never returns prompts, bodies, titles, absolute
// paths or resume commands, and session_id stays an internal key.
//
// Filters, search and the server-side offset all live in the URL; changing
// them only refetches data (replaceState + popstate sync, no navigation).

import { ChartColumn, Clock, ListUl, Wallet } from "@gravity-ui/icons";
import {
  Button,
  Card,
  Chip,
  Input,
  Label,
  ListBox,
  Modal,
  Pagination,
  Select,
  Skeleton,
  Spinner,
  Table,
  TextField,
  Typography,
  Popover,
} from "@heroui/react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Key,
} from "react";

import { authBrowserClient } from "@/lib/auth/browser";
import { LOGIN_PATH } from "@/lib/auth/next-path";
import { useLocale } from "@/lib/copy/locale";
import { formatMessage } from "@/lib/copy/message";
import { SESSIONS_COPY, type SessionsCopy } from "@/lib/copy/sessions";
import {
  DashboardApiError,
  fetchSessions,
  type SessionItem,
  type SessionModel,
  type SessionsPayload,
} from "@/lib/dashboard/api";
import {
  browserTimezone,
  isValidDayKey,
  rangeForSelection,
} from "@/lib/dashboard/ranges";
import { useFormat } from "@/lib/format/format";
import { FlowNumber } from "@/components/flow-number";
import { SourceIcon } from "@/app/dashboard/source-icon";

const PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 350;
const UPGRADE_URL = "https://github.com/baiwumm/token-usage#readme";

const SESSION_RANGES = ["7d", "30d", "90d", "custom"] as const;

type SessionRange = (typeof SESSION_RANGES)[number];

type LoadStatus = "loading" | "ready" | "error";
type Loadable<T> = { status: LoadStatus; data: T | null };

interface Filters {
  range: SessionRange;
  from: string;
  to: string;
  deviceId: string;
  source: string;
  q: string;
  offset: number;
}

function parseFilters(params: { get(name: string): string | null }): Filters {
  const rawRange = params.get("range");
  const range: SessionRange =
    rawRange === "7d" || rawRange === "90d" || rawRange === "custom"
      ? rawRange
      : "30d";
  const rawOffset = Number(params.get("offset"));

  return {
    range,
    from: params.get("from") ?? "",
    to: params.get("to") ?? "",
    deviceId: params.get("device_id") ?? "",
    source: params.get("source") ?? "",
    q: params.get("q") ?? "",
    offset:
      Number.isFinite(rawOffset) && rawOffset > 0 ? Math.trunc(rawOffset) : 0,
  };
}

function serializeFilters(filters: Filters): string {
  const query = new URLSearchParams();

  if (filters.range !== "30d") query.set("range", filters.range);
  if (filters.range === "custom") {
    if (filters.from) query.set("from", filters.from);
    if (filters.to) query.set("to", filters.to);
  }
  if (filters.deviceId) query.set("device_id", filters.deviceId);
  if (filters.source) query.set("source", filters.source);
  if (filters.q) query.set("q", filters.q);
  if (filters.offset > 0) query.set("offset", String(filters.offset));

  return query.toString();
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

function pageItems(
  page: number,
  totalPages: number,
): Array<number | "ellipsis"> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }
  const items: Array<number | "ellipsis"> = [1];

  if (page > 3) items.push("ellipsis");
  const start = Math.max(2, page - 1);
  const end = Math.min(totalPages - 1, page + 1);

  for (let value = start; value <= end; value += 1) items.push(value);
  if (page < totalPages - 2) items.push("ellipsis");
  items.push(totalPages);

  return items;
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
    formatTokensExact,
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
    <Modal>
      <Modal.Backdrop isOpen={session != null} onOpenChange={onOpenChange}>
        <Modal.Container>
          <Modal.Dialog className="max-h-[90vh] w-[calc(100vw-1rem)] max-w-2xl">
            {session ? (
              <>
                <Modal.Header>
                  <Modal.Heading>{copy.detail.title}</Modal.Heading>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Chip size="sm" variant="soft">
                      {session.source}
                    </Chip>
                    <Typography className="max-w-56 truncate" type="body-sm">
                      {session.project_key ?? copy.list.noProject}
                    </Typography>
                    <Typography
                      className="max-w-48 truncate"
                      color="muted"
                      type="body-xs"
                    >
                      {session.device_name}
                    </Typography>
                    <Typography color="muted" type="body-xs">
                      {formatDateTime(session.ended_at)}
                      {" · "}
                      {formatRelativeTime(session.ended_at)}
                    </Typography>
                  </div>
                </Modal.Header>
                <Modal.Body className="flex flex-col gap-5">
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
                            {formatTokensExact(value)}
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
                      <div className="flex flex-col">
                        <div className="text-muted grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-3 border-b pb-2 text-xs">
                          <span>{copy.detail.modelName}</span>
                          <span className="text-end">
                            {copy.detail.modelTokens}
                          </span>
                          <span className="text-end">
                            {copy.detail.modelShare}
                          </span>
                          <span className="text-end">
                            {copy.detail.modelCost}
                          </span>
                        </div>
                        {models.map((model) => (
                          <div
                            key={model.model}
                            className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-baseline gap-3 border-b py-2 text-sm last:border-b-0"
                          >
                            <span className="truncate font-medium">
                              {model.model}
                            </span>
                            <span className="tabular-nums">
                              {formatTokensExact(model.total_tokens)}
                            </span>
                            <span className="text-foreground/60 tabular-nums">
                              {formatPercent(model.share)}
                            </span>
                            <span className="tabular-nums">
                              {formatCost(Number(model.total_cost_usd))}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="bg-default/40 flex flex-col gap-1 rounded-xl px-3 py-2">
                    <Typography color="muted" type="body-xs">
                      {copy.detail.privacy}
                    </Typography>
                    <Typography color="muted" type="body-xs">
                      {copy.detail.costNote}
                    </Typography>
                  </div>
                </Modal.Body>
                <Modal.Footer>
                  <Button
                    slot="close"
                    variant="secondary"
                    onPress={() => onOpenChange(false)}
                  >
                    {copy.detail.close}
                  </Button>
                </Modal.Footer>
              </>
            ) : null}
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

function SectionSkeleton({ className }: { className?: string }) {
  // Same radius as HeroUI cards (min(32px, --radius-3xl)) so loading blocks
  // match the layout they stand in for.
  return (
    <Skeleton
      className={`rounded-[min(32px,var(--radius-3xl))] ${className ?? "h-40 w-full"}`}
    />
  );
}

export function SessionsClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [locale] = useLocale();
  const copy = SESSIONS_COPY[locale];
  const { formatTokens, formatCost, formatDuration, formatDateTime } =
    useFormat();

  const [filters, setFilters] = useState<Filters>(() =>
    parseFilters(searchParams),
  );
  const [qInput, setQInput] = useState(() => filters.q);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [state, setState] = useState<Loadable<SessionsPayload>>({
    status: "loading",
    data: null,
  });
  const [facets, setFacets] = useState<SessionsPayload["facets"]>({
    sources: [],
    devices: [],
  });
  const [knownDevices, setKnownDevices] = useState<Record<string, string>>({});
  const [detail, setDetail] = useState<SessionItem | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const requestId = useRef(0);

  const timezone = browserTimezone();
  const range = useMemo(
    () => rangeForSelection(filters.range, timezone, filters.from, filters.to),
    [filters.range, filters.from, filters.to, timezone],
  );

  const redirectToLogin = useCallback(() => {
    router.replace(`${LOGIN_PATH}?next=${encodeURIComponent("/sessions")}`);
  }, [router]);

  const applyFilters = useCallback((patch: Partial<Filters>) => {
    setFilters((previous) => {
      const next = { ...previous, ...patch };

      // Any filter change restarts paging unless the patch is the page itself.
      if (!("offset" in patch)) next.offset = 0;
      const query = serializeFilters(next);

      window.history.replaceState(
        null,
        "",
        query ? `/sessions?${query}` : "/sessions",
      );

      return next;
    });
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setFilters(parseFilters(new URLSearchParams(window.location.search)));
    };

    window.addEventListener("popstate", onPopState);

    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    setQInput(filters.q);
  }, [filters.q]);

  useEffect(() => {
    if (qInput === filters.q) return;
    const timer = window.setTimeout(() => {
      applyFilters({ q: qInput.trim() });
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [qInput, filters.q, applyFilters]);

  useEffect(() => {
    const supabase = authBrowserClient();

    void (async () => {
      const {
        data: { session },
      } = (await supabase?.auth.getSession()) ?? { data: { session: null } };

      if (!session?.access_token) {
        redirectToLogin();

        return;
      }
      setAccessToken(session.access_token);
    })();
  }, [redirectToLogin]);

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
          limit: PAGE_SIZE,
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
      applyFilters({ offset: Math.floor((total - 1) / PAGE_SIZE) * PAGE_SIZE });
    }
  }, [state, applyFilters]);

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
    payload && payload.total > 0 ? Math.ceil(payload.total / PAGE_SIZE) : 1;
  const currentPage = Math.min(
    totalPages,
    Math.floor((payload?.offset ?? 0) / PAGE_SIZE) + 1,
  );
  const pageStart = payload && payload.total > 0 ? payload.offset + 1 : 0;
  const pageEnd = payload
    ? Math.min(payload.offset + PAGE_SIZE, payload.total)
    : 0;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 md:px-8">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <Typography color="muted" type="body-xs">
            {copy.rangeLabel}
          </Typography>
          <Select
            aria-label={copy.rangeLabel}
            className="w-40"
            value={filters.range}
            onChange={(key: Key | null) => {
              if (key == null) return;
              const next = String(key) as SessionRange;

              applyFilters({
                range: next,
                from: next === "custom" ? range.fromDay : "",
                to: next === "custom" ? range.toDay : "",
              });
            }}
          >
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <Popover.Arrow />
              <ListBox>
                {SESSION_RANGES.map((key) => (
                  <ListBox.Item key={key} id={key} textValue={copy.ranges[key]}>
                    {copy.ranges[key]}
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
        </label>

        {filters.range === "custom" ? (
          <>
            <TextField
              className="w-40"
              value={filters.from || range.fromDay}
              onChange={(value) => {
                if (isValidDayKey(value)) applyFilters({ from: value });
              }}
            >
              <Label>{copy.customFrom}</Label>
              <Input
                aria-label={copy.customFrom}
                type="date"
                variant="secondary"
              />
            </TextField>
            <TextField
              className="w-40"
              value={filters.to || range.toDay}
              onChange={(value) => {
                if (isValidDayKey(value)) applyFilters({ to: value });
              }}
            >
              <Label>{copy.customTo}</Label>
              <Input
                aria-label={copy.customTo}
                type="date"
                variant="secondary"
              />
            </TextField>
          </>
        ) : null}

        <label className="flex flex-col gap-1">
          <Typography color="muted" type="body-xs">
            {copy.deviceLabel}
          </Typography>
          <Select
            aria-label={copy.deviceLabel}
            className="w-48"
            value={filters.deviceId || "__all"}
            onChange={(key: Key | null) => {
              if (key == null) return;
              const value = String(key);

              applyFilters({ deviceId: value === "__all" ? "" : value });
            }}
          >
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <Popover.Arrow />
              <ListBox>
                <ListBox.Item id="__all" textValue={copy.allDevices}>
                  {copy.allDevices}
                </ListBox.Item>
                {deviceOptions.map((device) => (
                  <ListBox.Item
                    key={device.device_id}
                    id={device.device_id}
                    textValue={device.device_name}
                  >
                    {device.device_name}
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
        </label>

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
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <Popover.Arrow />
              <ListBox>
                <ListBox.Item id="__all" textValue={copy.allSources}>
                  {copy.allSources}
                </ListBox.Item>
                {sourceOptions.map((entry) => (
                  <ListBox.Item
                    key={entry.source}
                    id={entry.source}
                    textValue={entry.source}
                  >
                    {entry.source}
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
        </label>

        <TextField
          className="w-52"
          value={qInput}
          onChange={(value) => setQInput(value)}
        >
          <Label>{copy.projectLabel}</Label>
          <Input
            aria-label={copy.projectLabel}
            placeholder={copy.projectPlaceholder}
            type="search"
            variant="secondary"
          />
        </TextField>

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
                                    {session.source}
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
                                    variant="ghost"
                                    onPress={() => setDetail(session)}
                                  >
                                    {copy.list.detail}
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
                              variant="ghost"
                              onPress={() => setDetail(session)}
                            >
                              {copy.list.detail}
                            </Button>
                          </div>
                        </Card.Content>
                      </Card>
                    ))}
                  </div>

                  <Pagination className="w-full" size="sm">
                    <Pagination.Summary>
                      {formatMessage(copy.list.pageSummary, locale, {
                        start: pageStart,
                        end: pageEnd,
                        total: payload.total,
                      })}
                    </Pagination.Summary>
                    <Pagination.Content>
                      <Pagination.Item>
                        <Pagination.Previous
                          isDisabled={currentPage === 1}
                          onPress={() =>
                            applyFilters({
                              offset: Math.max(0, currentPage - 2) * PAGE_SIZE,
                            })
                          }
                        >
                          <Pagination.PreviousIcon />
                          <span className="hidden sm:inline">
                            {copy.list.previous}
                          </span>
                        </Pagination.Previous>
                      </Pagination.Item>
                      {pageItems(currentPage, totalPages).map((item, index) =>
                        item === "ellipsis" ? (
                          <Pagination.Item key={`ellipsis-${index}`}>
                            <Pagination.Ellipsis />
                          </Pagination.Item>
                        ) : (
                          <Pagination.Item key={item}>
                            <Pagination.Link
                              isActive={item === currentPage}
                              onPress={() =>
                                applyFilters({ offset: (item - 1) * PAGE_SIZE })
                              }
                            >
                              {item}
                            </Pagination.Link>
                          </Pagination.Item>
                        ),
                      )}
                      <Pagination.Item>
                        <Pagination.Next
                          isDisabled={currentPage === totalPages}
                          onPress={() =>
                            applyFilters({
                              offset:
                                (Math.min(totalPages, currentPage + 1) - 1) *
                                PAGE_SIZE,
                            })
                          }
                        >
                          <span className="hidden sm:inline">
                            {copy.list.next}
                          </span>
                          <Pagination.NextIcon />
                        </Pagination.Next>
                      </Pagination.Item>
                    </Pagination.Content>
                  </Pagination>
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
