// Ingest payload normalization — ports the pure validators from
// api/functions/tokentracker-ingest.js, quirks included (null coerces to 0
// through Number(), numeric strings are accepted, boolean true counts as 1).
// docs/cli-contract.md §2.4 freezes the accepted shapes.

export const TOKEN_KEYS = [
  "input_tokens",
  "output_tokens",
  "cached_input_tokens",
  "cache_creation_input_tokens",
  "reasoning_output_tokens",
  "total_tokens",
] as const;

export type TokenKey = (typeof TOKEN_KEYS)[number];

export type RawRecord = Record<string, unknown>;

export type NormalizedBucket = {
  hour_start: string;
  source: string;
  model: string;
} & Record<TokenKey, number> & {
    billable_total_tokens: number | null;
    conversations: number;
    total_cost_usd: number;
  };

export type NormalizedSessionState = {
  source: string;
  session_id: string;
  model: string;
  bucket_start: string;
  snapshot_verified_at: string;
} & Record<TokenKey, number>;

export function nonNegativeInteger(value: unknown): number | null {
  const number = Number(value);

  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

// Per-row cost clamp (docs/cli-contract.md §2.4, 2026-10-27): grok/cline
// report provider costs from the device, so a leaked device token could
// otherwise forge arbitrary dashboard totals. Clamped, not rejected — a
// whole-batch 400 would stall deployed collectors on one stray row.
export const MAX_BUCKET_COST_USD = 10;

export function normalizeBucket(raw: unknown): NormalizedBucket | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as RawRecord;
  const hour = new Date(String(record.hour_start || ""));

  if (!Number.isFinite(hour.getTime())) return null;
  const source =
    String(record.source || "")
      .trim()
      .toLowerCase()
      .slice(0, 100) || "unknown";
  const model =
    String(record.model || "")
      .trim()
      .slice(0, 200) || "unknown";
  const values = {} as Record<TokenKey, number>;

  for (const key of TOKEN_KEYS) {
    const value = nonNegativeInteger(record[key]);

    if (value === null) return null;
    values[key] = value;
  }
  const conversations = nonNegativeInteger(
    record.conversation_count ?? record.conversations ?? 0,
  );

  if (conversations === null) return null;
  const billable =
    record.billable_total_tokens == null
      ? null
      : nonNegativeInteger(record.billable_total_tokens);

  if (billable === null && record.billable_total_tokens != null) return null;
  const cost = Number(record.total_cost_usd);

  return {
    hour_start: hour.toISOString(),
    source,
    model,
    ...values,
    billable_total_tokens: billable,
    conversations,
    total_cost_usd:
      Number.isFinite(cost) && cost >= 0
        ? Math.min(cost, MAX_BUCKET_COST_USD)
        : 0,
  };
}

export function normalizeSessionState(
  raw: unknown,
): NormalizedSessionState | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as RawRecord;
  const source = String(record.source || "")
    .trim()
    .toLowerCase();
  const sessionId = String(record.session_id || "").trim();
  const model = String(record.model || "")
    .trim()
    .slice(0, 200);
  const bucketStart = new Date(String(record.bucket_start || ""));
  const verifiedAt = new Date(String(record.snapshot_verified_at || ""));

  if (
    source !== "trae-cn" ||
    !sessionId ||
    sessionId.length > 256 ||
    !model ||
    !Number.isFinite(bucketStart.getTime()) ||
    !Number.isFinite(verifiedAt.getTime())
  ) {
    return null;
  }
  const values = {} as Record<TokenKey, number>;

  for (const key of TOKEN_KEYS) {
    const value = nonNegativeInteger(record[key]);

    if (value === null) return null;
    values[key] = value;
  }
  if (
    values.total_tokens !==
    values.input_tokens +
      values.cached_input_tokens +
      values.cache_creation_input_tokens +
      values.output_tokens
  ) {
    return null;
  }

  return {
    source,
    session_id: sessionId,
    model,
    bucket_start: bucketStart.toISOString(),
    snapshot_verified_at: verifiedAt.toISOString(),
    ...values,
  };
}

export type NormalizedSessionModel = {
  model: string;
} & Record<TokenKey, number>;

export type NormalizedSession = {
  session_id: string;
  source: string;
  started_at: string;
  ended_at: string;
  project_key: string | null;
  billable_total_tokens: number | null;
  models: NormalizedSessionModel[];
} & Record<TokenKey, number>;

// Account-level sources never reach Sessions (docs/cli-contract.md §2.4): the
// ingest route drops the whole entry before validating the remaining fields.
export function normalizeSessionSource(value: unknown): string {
  return (
    String(value ?? "")
      .trim()
      .toLowerCase()
      .slice(0, 100) || "unknown"
  );
}

export function isAccountLevelSessionSource(source: string): boolean {
  return source === "cursor" || source === "trae-cn";
}

// Privacy: only the basename survives. Both separators count so a Windows
// path never leaks a drive or directory; control characters are stripped.
export function normalizeProjectKey(value: unknown): string | null {
  if (value == null) return null;
  const withoutControls = String(value).replace(/\p{Cc}/gu, "");
  const trimmed = withoutControls.replace(/[/\\]+$/, "");
  const basename = trimmed.split(/[/\\]/).pop()?.trim() ?? "";

  if (!basename || basename === "." || basename === "..") return null;

  return basename.slice(0, 120);
}

function sessionTokens(record: RawRecord): Record<TokenKey, number> | null {
  const values = {} as Record<TokenKey, number>;

  for (const key of TOKEN_KEYS) {
    const value = nonNegativeInteger(record[key]);

    if (value === null) return null;
    values[key] = value;
  }
  if (
    values.total_tokens !==
    values.input_tokens +
      values.cached_input_tokens +
      values.cache_creation_input_tokens +
      values.output_tokens
  ) {
    return null;
  }

  return values;
}

function normalizeSessionModels(
  raw: unknown,
  totalTokens: number,
): NormalizedSessionModel[] | null {
  if (raw == null) return [];
  if (!Array.isArray(raw) || raw.length > 32) return null;

  const byModel = new Map<string, NormalizedSessionModel>();

  for (const entry of raw) {
    if (!entry || typeof entry !== "object") return null;
    const record = entry as RawRecord;
    const model =
      String(record.model ?? "")
        .trim()
        .slice(0, 200) || "unknown";
    const values = sessionTokens(record);

    if (!values) return null;
    const previous = byModel.get(model);

    if (previous) {
      for (const key of TOKEN_KEYS) previous[key] += values[key];
    } else {
      byModel.set(model, { model, ...values });
    }
  }

  const models = Array.from(byModel.values());

  if (models.length > 0) {
    const sum = models.reduce((total, model) => total + model.total_tokens, 0);

    if (sum !== totalTokens) return null;
  }

  return models;
}

export function normalizeSession(raw: unknown): NormalizedSession | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as RawRecord;
  const sessionId = String(record.session_id ?? "").trim();
  const source = normalizeSessionSource(record.source);
  const startedAt = new Date(String(record.started_at ?? ""));
  const endedAt = new Date(String(record.ended_at ?? ""));

  if (
    !sessionId ||
    sessionId.length > 256 ||
    /[/\\]/.test(sessionId) ||
    /\p{Cc}/u.test(sessionId) ||
    isAccountLevelSessionSource(source) ||
    !Number.isFinite(startedAt.getTime()) ||
    !Number.isFinite(endedAt.getTime()) ||
    endedAt.getTime() < startedAt.getTime()
  ) {
    return null;
  }
  const values = sessionTokens(record);

  if (!values) return null;
  const billable =
    record.billable_total_tokens == null
      ? null
      : nonNegativeInteger(record.billable_total_tokens);

  if (billable === null && record.billable_total_tokens != null) return null;
  const models = normalizeSessionModels(record.models, values.total_tokens);

  if (!models) return null;

  return {
    session_id: sessionId,
    source,
    started_at: startedAt.toISOString(),
    ended_at: endedAt.toISOString(),
    project_key: normalizeProjectKey(record.project_key),
    ...values,
    billable_total_tokens: billable,
    models,
  };
}

/** Request-internal dedup: keep the latest ended_at per (source, session_id). */
export function dedupeSessions(
  sessions: NormalizedSession[],
): NormalizedSession[] {
  const sessionMap = new Map<string, NormalizedSession>();

  for (const session of sessions) {
    const key = `${session.source}|${session.session_id}`;
    const previous = sessionMap.get(key);

    if (!previous) {
      sessionMap.set(key, session);
      continue;
    }
    const previousEnd = Date.parse(previous.ended_at);
    const nextEnd = Date.parse(session.ended_at);

    if (
      nextEnd > previousEnd ||
      (nextEnd === previousEnd && session.total_tokens >= previous.total_tokens)
    ) {
      sessionMap.set(key, session);
    }
  }

  return Array.from(sessionMap.values());
}

/** Request-internal dedup: keep the row with the largest total_tokens per key. */
export function dedupeBuckets(buckets: NormalizedBucket[]): NormalizedBucket[] {
  const bucketMap = new Map<string, NormalizedBucket>();

  for (const bucket of buckets) {
    const key = `${bucket.hour_start}|${bucket.source}|${bucket.model}`;
    const previous = bucketMap.get(key);

    if (!previous || bucket.total_tokens > previous.total_tokens) {
      bucketMap.set(key, bucket);
    }
  }

  return Array.from(bucketMap.values());
}

export function dedupeStates(
  states: NormalizedSessionState[],
): NormalizedSessionState[] {
  const stateMap = new Map<string, NormalizedSessionState>();

  for (const state of states) {
    stateMap.set(`${state.source}|${state.session_id}`, state);
  }

  return Array.from(stateMap.values());
}
