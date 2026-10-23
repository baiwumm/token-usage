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
    total_cost_usd: Number.isFinite(cost) && cost >= 0 ? cost : 0,
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
