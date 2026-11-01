// GET /api/functions/token-usage-reconcile — device token only. CLI face,
// docs/cli-contract.md §2.13. Read face for `tokenusage reconcile`: the
// collector compares its local queue.jsonl last-wins baseline against the
// hourly rows THIS device actually uploaded.
//
// Deliberately not the account aggregation: reconciliation is per machine
// ("what did this collector send?"), so rows are returned verbatim — no
// cross-device dedupe, no account-level source stripping, no derived cost.

import {
  errorResponse,
  getBearer,
  jsonResponse,
  methodNotAllowedResponse,
  preflightResponse,
} from "@/lib/api/http";
import { assertConfigured, select } from "@/lib/api/supabase-rest";
import { sha256Hex } from "@/lib/device-codes";

export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;
// Runs are frequent; a one-year window is already far beyond any real
// reconciliation and keeps the paged scan bounded (§2.13).
const MAX_RANGE_DAYS = 366;
const DEFAULT_LIMIT = 1000;
const MAX_LIMIT = 2000;

const BUCKET_COLUMNS = [
  "hour_start",
  "source",
  "model",
  "input_tokens",
  "cached_input_tokens",
  "cache_creation_input_tokens",
  "output_tokens",
  "reasoning_output_tokens",
  "total_tokens",
  "billable_total_tokens",
  "conversations",
  "credits",
].join(",");

function numberOrZero(value: unknown): number {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : 0;
}

function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

function clampInt(
  raw: string | null,
  fallback: number,
  min: number,
  max: number,
): number {
  if (raw == null || raw === "") return fallback;
  const parsed = Number(raw);

  if (!Number.isFinite(parsed)) return fallback;

  return Math.min(Math.max(Math.trunc(parsed), min), max);
}

export async function POST() {
  return methodNotAllowedResponse();
}

export async function OPTIONS() {
  return preflightResponse();
}

export async function GET(request: Request) {
  try {
    assertConfigured();
    const deviceToken = getBearer(request);

    if (!deviceToken)
      return jsonResponse(401, { error: "Missing bearer token" });

    // Device tokens only (§1.4 step 1): a JWT never resolves here.
    const tokenHash = sha256Hex(deviceToken);
    const tokenRows = await select("token_device_tokens", {
      select: "user_id,device_id,revoked_at",
      filters: [
        ["token_hash", "eq", tokenHash],
        ["revoked_at", "is", "null"],
      ],
      limit: 1,
    });
    const tokenRow = tokenRows[0];

    if (!tokenRow) return jsonResponse(401, { error: "Unauthorized" });

    const deviceRows = await select("token_devices", {
      select: "id,revoked_at",
      filters: [["id", "eq", tokenRow.device_id]],
      limit: 1,
    });

    if (!deviceRows[0] || deviceRows[0].revoked_at) {
      return jsonResponse(403, { error: "Device is revoked" });
    }

    const url = new URL(request.url);
    const fromParam = url.searchParams.get("from") || "";
    const toParam = url.searchParams.get("to") || "";
    const fromMs = Date.parse(fromParam);
    const toMs = Date.parse(toParam);

    if (
      !fromParam ||
      !toParam ||
      !Number.isFinite(fromMs) ||
      !Number.isFinite(toMs)
    ) {
      return jsonResponse(400, { error: "Missing from/to" });
    }
    if (fromMs > toMs) return jsonResponse(400, { error: "Invalid from/to" });

    const clampedFromMs = Math.max(fromMs, toMs - MAX_RANGE_DAYS * DAY_MS);
    const from = new Date(clampedFromMs).toISOString();
    const to = new Date(toMs).toISOString();
    const limit = clampInt(
      url.searchParams.get("limit"),
      DEFAULT_LIMIT,
      1,
      MAX_LIMIT,
    );
    const offset = clampInt(
      url.searchParams.get("offset"),
      0,
      0,
      Number.MAX_SAFE_INTEGER,
    );

    const rows = await select("token_usage_hourly", {
      select: BUCKET_COLUMNS,
      filters: [
        ["user_id", "eq", String(tokenRow.user_id)],
        ["device_id", "eq", String(tokenRow.device_id)],
        // Half-open on hour_start, like every other series (§2.7).
        ["hour_start", "gte", from],
        ["hour_start", "lt", to],
      ],
      order: "hour_start.asc,source.asc,model.asc",
      limit,
      offset,
    });

    const buckets = rows.map((row) => ({
      hour_start: new Date(String(row.hour_start)).toISOString(),
      source: String(row.source),
      model: String(row.model),
      input_tokens: numberOrZero(row.input_tokens),
      cached_input_tokens: numberOrZero(row.cached_input_tokens),
      cache_creation_input_tokens: numberOrZero(
        row.cache_creation_input_tokens,
      ),
      output_tokens: numberOrZero(row.output_tokens),
      reasoning_output_tokens: numberOrZero(row.reasoning_output_tokens),
      total_tokens: numberOrZero(row.total_tokens),
      billable_total_tokens:
        row.billable_total_tokens == null
          ? null
          : numberOrZero(row.billable_total_tokens),
      conversations: numberOrZero(row.conversations),
      credits: round6(numberOrZero(row.credits)),
    }));

    return jsonResponse(200, {
      from,
      to,
      device_id: String(tokenRow.device_id),
      limit,
      offset,
      buckets,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
