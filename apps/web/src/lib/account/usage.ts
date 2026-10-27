// Account-wide usage canonicalization and summarization — ports the pure half
// of api/_lib/account-usage.js.
//
// Machine-level sources are additive across devices. Account-level sources are
// not: Cursor rows are identical copies on every device, and TRAE CN has
// canonical session state. Machine-level rows follow the active-device rule:
// revoking a device removes its buckets from account totals (rows stay in the
// database and come back when the machine is paired again). Account-level
// sources ignore device state — they are deduped across every copy.
//
// Costs are computed at read time by the shared pricing engine; stored row
// costs stay 0 for queue rows.

import {
  ACCOUNT_LEVEL_SOURCES,
  numberOr0,
  rowCost,
  zonedDayKey,
  type UsageRow,
} from "./series";

const TOKEN_KEYS = [
  "input_tokens",
  "cached_input_tokens",
  "cache_creation_input_tokens",
  "output_tokens",
  "reasoning_output_tokens",
  "total_tokens",
];

function text(value: unknown): string {
  return String(value ?? "");
}

function iso(value: unknown): string | null {
  const parsed = Date.parse(String(value ?? ""));

  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function pickCanonicalRow(rows: UsageRow[]): UsageRow | null {
  let best: UsageRow | null = null;

  for (const row of rows) {
    if (!best) {
      best = row;
      continue;
    }
    const rowTotal = numberOr0(row.total_tokens);
    const bestTotal = numberOr0(best.total_tokens);

    if (rowTotal !== bestTotal) {
      if (rowTotal > bestTotal) best = row;
      continue;
    }
    const rowUpdated = Date.parse(String(row.updated_at || "")) || -Infinity;
    const bestUpdated = Date.parse(String(best.updated_at || "")) || -Infinity;

    if (rowUpdated !== bestUpdated) {
      if (rowUpdated > bestUpdated) best = row;
      continue;
    }
    if (text(row.device_id) < text(best.device_id)) best = row;
  }

  return best;
}

function dedupeCursorRows(rows: UsageRow[]): UsageRow[] {
  const groups = new Map<string, UsageRow[]>();

  for (const row of rows) {
    const key = `${text(row.hour_start)}|${text(row.source)}|${text(row.model)}`;
    const group = groups.get(key) || [];

    group.push(row);
    groups.set(key, group);
  }

  return Array.from(groups.values())
    .map(pickCanonicalRow)
    .filter((row): row is UsageRow => Boolean(row));
}

function aggregateSessionStates(states: UsageRow[]): UsageRow[] {
  const groups = new Map<string, UsageRow>();

  for (const state of states) {
    const bucketStart = iso(state.bucket_start);

    if (!bucketStart) continue;
    const key = `${bucketStart}|${text(state.source)}|${text(state.model)}`;
    const row =
      groups.get(key) ||
      ({
        hour_start: bucketStart,
        device_id: null,
        source: text(state.source),
        model: text(state.model),
        input_tokens: 0,
        cached_input_tokens: 0,
        cache_creation_input_tokens: 0,
        output_tokens: 0,
        reasoning_output_tokens: 0,
        total_tokens: 0,
        billable_total_tokens: 0,
        conversations: 0,
        total_cost_usd: 0,
      } as UsageRow);

    for (const keyName of TOKEN_KEYS)
      row[keyName] = numberOr0(row[keyName]) + numberOr0(state[keyName]);
    row.billable_total_tokens = row.total_tokens;
    row.conversations = numberOr0(row.conversations) + 1;
    groups.set(key, row);
  }

  return Array.from(groups.values());
}

export function canonicalizeUsage(
  hourly: UsageRow[],
  sessionStates: UsageRow[],
  activeDeviceIds: Set<string> | null = null,
): UsageRow[] {
  const localRows: UsageRow[] = [];
  const cursorRows: UsageRow[] = [];

  for (const row of hourly) {
    const source = text(row.source).toLowerCase();

    if (source === "cursor") cursorRows.push(row);
    else if (source === "trae-cn") continue;
    else if (activeDeviceIds && !activeDeviceIds.has(String(row.device_id)))
      continue;
    else localRows.push(row);
  }

  return [
    ...localRows,
    ...dedupeCursorRows(cursorRows),
    ...aggregateSessionStates(sessionStates),
  ];
}

export type DashboardTotals = {
  total_tokens: number;
  billable_total_tokens: number;
  total_cost_usd: number;
  conversations: number;
  buckets: number;
  active_days: number;
  first_hour: string | null;
  last_hour: string | null;
};

function emptyTotals(): DashboardTotals {
  return {
    total_tokens: 0,
    billable_total_tokens: 0,
    total_cost_usd: 0,
    conversations: 0,
    buckets: 0,
    active_days: 0,
    first_hour: null,
    last_hour: null,
  };
}

function addRow(totals: DashboardTotals, row: UsageRow, cost: number): void {
  const total = numberOr0(row.total_tokens);

  totals.total_tokens += total;
  totals.billable_total_tokens +=
    row.billable_total_tokens == null
      ? total
      : numberOr0(row.billable_total_tokens);
  totals.total_cost_usd += cost;
  totals.conversations += numberOr0(row.conversations);
  totals.buckets += 1;
  const start = iso(row.hour_start);

  if (start) {
    if (!totals.first_hour || start < totals.first_hour)
      totals.first_hour = start;
    if (!totals.last_hour || start > totals.last_hour) totals.last_hour = start;
  }
}

export type DayBucket = {
  date: string;
  total_tokens: number;
  billable_total_tokens: number;
  total_cost_usd: number;
  conversations: number;
};

export type ModelEntry = {
  model: string;
  total_tokens: number;
  billable_total_tokens: number;
  total_cost_usd: number;
  buckets: number;
  share: number;
};

type ModelAccumulator = Omit<ModelEntry, "share">;

export type SourceEntry = {
  source: string;
  total_tokens: number;
  total_cost_usd: number;
  buckets: number;
};

export type DeviceUsageEntry = {
  device_id: string;
  total_tokens: number;
  billable_total_tokens: number;
  total_cost_usd: number;
  buckets: number;
  last_hour: string | null;
};

export function summarizeRows(
  rows: UsageRow[],
  {
    timeZone,
    offsetMinutes,
  }: { timeZone?: string | null; offsetMinutes?: number | null } = {},
): {
  totals: DashboardTotals;
  daily: DayBucket[];
  models: ModelEntry[];
  sources: SourceEntry[];
  devices: Map<string, DeviceUsageEntry>;
} {
  const totals = emptyTotals();
  const days = new Map<string, DayBucket>();
  const models = new Map<string, ModelAccumulator>();
  const sources = new Map<string, SourceEntry>();
  const devices = new Map<string, DeviceUsageEntry>();

  for (const row of rows) {
    // Read-time pricing, one engine call per row; the same cost feeds totals,
    // the day bucket and the model/source/device panels.
    const cost = rowCost(row);

    addRow(totals, row, cost);
    const start = iso(row.hour_start);

    if (!start) continue;

    const key = zonedDayKey(start, {
      timeZone: timeZone || null,
      offsetMinutes: offsetMinutes ?? null,
    });

    if (!key) continue;
    const day = days.get(key) || {
      date: key,
      total_tokens: 0,
      billable_total_tokens: 0,
      total_cost_usd: 0,
      conversations: 0,
    };

    day.total_tokens += numberOr0(row.total_tokens);
    day.billable_total_tokens +=
      row.billable_total_tokens == null
        ? numberOr0(row.total_tokens)
        : numberOr0(row.billable_total_tokens);
    day.total_cost_usd += cost;
    day.conversations += numberOr0(row.conversations);
    days.set(key, day);

    const model = text(row.model) || "unknown";
    const modelEntry = models.get(model) || {
      model,
      total_tokens: 0,
      billable_total_tokens: 0,
      total_cost_usd: 0,
      buckets: 0,
    };

    modelEntry.total_tokens += numberOr0(row.total_tokens);
    modelEntry.billable_total_tokens +=
      row.billable_total_tokens == null
        ? numberOr0(row.total_tokens)
        : numberOr0(row.billable_total_tokens);
    modelEntry.total_cost_usd += cost;
    modelEntry.buckets += 1;
    models.set(model, modelEntry);

    const source = text(row.source) || "unknown";
    const sourceEntry = sources.get(source) || {
      source,
      total_tokens: 0,
      total_cost_usd: 0,
      buckets: 0,
    };

    sourceEntry.total_tokens += numberOr0(row.total_tokens);
    sourceEntry.total_cost_usd += cost;
    sourceEntry.buckets += 1;
    sources.set(source, sourceEntry);

    if (row.device_id) {
      const deviceEntry = devices.get(String(row.device_id)) || {
        device_id: String(row.device_id),
        total_tokens: 0,
        billable_total_tokens: 0,
        total_cost_usd: 0,
        buckets: 0,
        last_hour: null,
      };

      deviceEntry.total_tokens += numberOr0(row.total_tokens);
      deviceEntry.billable_total_tokens +=
        row.billable_total_tokens == null
          ? numberOr0(row.total_tokens)
          : numberOr0(row.billable_total_tokens);
      deviceEntry.total_cost_usd += cost;
      deviceEntry.buckets += 1;
      if (!deviceEntry.last_hour || start > deviceEntry.last_hour)
        deviceEntry.last_hour = start;
      devices.set(String(row.device_id), deviceEntry);
    }
  }

  totals.active_days = days.size;
  const daily = Array.from(days.values()).sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  const modelList = Array.from(models.values())
    .sort((a, b) => b.total_tokens - a.total_tokens)
    .map((entry) => ({
      ...entry,
      share:
        totals.total_tokens > 0 ? entry.total_tokens / totals.total_tokens : 0,
    }));
  const sourceList = Array.from(sources.values()).sort(
    (a, b) => b.total_tokens - a.total_tokens,
  );

  return { totals, daily, models: modelList, sources: sourceList, devices };
}

export function buildDeviceList(
  deviceRows: UsageRow[],
  tokenRows: UsageRow[],
  deviceUsage: Map<string, DeviceUsageEntry>,
) {
  const lastUsed = new Map<string, string>();

  for (const token of tokenRows) {
    if (!token.device_id) continue;
    const used =
      (token.last_used_at as string) || (token.created_at as string) || null;
    const previous = lastUsed.get(String(token.device_id));

    if (used && (!previous || used > previous))
      lastUsed.set(String(token.device_id), used);
  }

  return deviceRows
    .map((device) => {
      const usage = deviceUsage.get(String(device.id)) || {
        total_tokens: 0,
        billable_total_tokens: 0,
        total_cost_usd: 0,
        buckets: 0,
        last_hour: null,
      };

      return {
        device_id: String(device.id),
        device_name: String(device.device_name || "Unnamed device"),
        platform: (device.platform as string | null) || null,
        active: !device.revoked_at,
        created_at: (device.created_at as string | null) || null,
        last_used_at: lastUsed.get(String(device.id)) || null,
        last_hour: usage.last_hour,
        total_tokens: usage.total_tokens,
        billable_total_tokens: usage.billable_total_tokens,
        total_cost_usd: usage.total_cost_usd,
        buckets: usage.buckets,
      };
    })
    .sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;

      return b.total_tokens - a.total_tokens;
    });
}

export function buildDashboardPayload({
  user,
  usage,
  from,
  to,
  timeZone,
  offsetMinutes,
  rangeKey,
}: {
  user: { id: string; email?: string | null } | null;
  usage: {
    canonicalRows: UsageRow[];
    deviceRows: UsageRow[];
    tokenRows: UsageRow[];
  };
  from: string | null;
  to: string | null;
  timeZone: string | null;
  offsetMinutes: number | null;
  rangeKey: string;
}) {
  const fromMs = from ? Date.parse(from) : null;
  const toMs = to ? Date.parse(to) : null;
  const rows = usage.canonicalRows.filter((row) => {
    const start = Date.parse(String(row.hour_start || ""));

    if (!Number.isFinite(start)) return false;
    if (fromMs != null && start < fromMs) return false;
    if (toMs != null && start >= toMs) return false;

    return true;
  });

  const selected = summarizeRows(rows, { timeZone, offsetMinutes });
  const allTime = summarizeRows(usage.canonicalRows, {
    timeZone,
    offsetMinutes,
  });
  const devices = buildDeviceList(
    usage.deviceRows,
    usage.tokenRows,
    selected.devices,
  );
  const shared = selected.sources.filter((source) =>
    ACCOUNT_LEVEL_SOURCES.has(source.source),
  );
  const sharedTotals = shared.reduce(
    (acc, source) => {
      acc.total_tokens += source.total_tokens;
      acc.total_cost_usd += source.total_cost_usd;

      return acc;
    },
    { total_tokens: 0, total_cost_usd: 0 },
  );

  return {
    user: user ? { id: user.id, email: user.email || null } : null,
    generated_at: new Date().toISOString(),
    range: {
      key: rangeKey || "custom",
      from: from || null,
      to: to || null,
      timezone: timeZone || null,
      offset_minutes: Number.isFinite(offsetMinutes as number)
        ? offsetMinutes
        : null,
    },
    totals: selected.totals,
    all_time: allTime.totals,
    daily: selected.daily,
    models: selected.models.slice(0, 24),
    sources: selected.sources,
    devices,
    shared_account_sources: {
      sources: shared,
      total_tokens: sharedTotals.total_tokens,
      total_cost_usd: sharedTotals.total_cost_usd,
    },
  };
}
