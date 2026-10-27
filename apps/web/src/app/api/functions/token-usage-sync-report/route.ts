// POST /api/functions/token-usage-sync-report — device token only. CLI face,
// docs/cli-contract.md §2.11. One row per collector sync run (empty runs
// included); run_id is the client-generated idempotency key on
// (user_id, device_id, run_id) — a replay after a lost response answers
// duplicate:true instead of producing a second row. Reporting is best-effort
// on the client; validation failures here use the single stable
// `400 invalid_sync_report` code with details logged server-side only.

import {
  errorResponse,
  getBearer,
  jsonResponse,
  methodNotAllowedResponse,
  preflightResponse,
  readJsonBody,
} from "@/lib/api/http";
import { assertConfigured, select, upsert } from "@/lib/api/supabase-rest";
import { invalidateAccountUsage } from "@/lib/api/account-data";
import { sha256Hex } from "@/lib/device-codes";

export const dynamic = "force-dynamic";

const TRIGGERS = new Set(["scheduled", "manual", "watch", "notify"]);
const RESULTS = new Set(["ok", "partial", "error"]);
// run_id rejects path separators and the full Unicode Cc range (C0 + C1),
// aligning with session_id's anti-path philosophy (§2.11).

const RUN_ID_FORBIDDEN = /[/\\\p{Cc}]/u;

const COUNT_FIELDS = [
  "parsed_files",
  "buckets_uploaded",
  "tokens_ingested",
  "sessions_uploaded",
  "sessions_skipped",
] as const;

function invalidSyncReport(): Response {
  return jsonResponse(400, { error: "invalid_sync_report" });
}

function trimField(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();

  if (!trimmed || trimmed.length > max) return null;

  return trimmed;
}

// Optional string fields (§2.11): absent or empty-after-trim → null; present
// but non-string or oversize → invalid.
function optionalTrimmed(
  value: unknown,
  max: number,
): { ok: true; value: string | null } | { ok: false } {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false };
  const trimmed = value.trim();

  if (!trimmed) return { ok: true, value: null };
  if (trimmed.length > max) return { ok: false };

  return { ok: true, value: trimmed };
}

function nonNegativeSafeInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    return null;
  }

  return value;
}

export async function GET() {
  return methodNotAllowedResponse();
}

export async function OPTIONS() {
  return preflightResponse();
}

export async function POST(request: Request) {
  try {
    assertConfigured();
    const deviceToken = getBearer(request);

    if (!deviceToken)
      return jsonResponse(401, { error: "Missing bearer token" });

    // Device tokens only (§1.4 step 1) — JWTs are not valid here.
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

    const body = (await readJsonBody(request)) as unknown;

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return invalidSyncReport();
    }
    const report = body as Record<string, unknown>;

    const runId = trimField(report.run_id, 128);

    if (!runId || RUN_ID_FORBIDDEN.test(runId)) return invalidSyncReport();

    const startedAtMs = Date.parse(String(report.started_at ?? ""));
    const endedAtMs = Date.parse(String(report.ended_at ?? ""));

    if (!Number.isFinite(startedAtMs) || !Number.isFinite(endedAtMs)) {
      return invalidSyncReport();
    }
    if (endedAtMs < startedAtMs) return invalidSyncReport();

    const trigger = trimField(report.trigger, 16);

    if (!trigger || !TRIGGERS.has(trigger)) return invalidSyncReport();

    const result = trimField(report.result, 16);

    if (!result || !RESULTS.has(result)) return invalidSyncReport();

    // Advisory only in the contract ("result=ok 时应省略"), never a rejection.
    const errorCodeCheck = optionalTrimmed(report.error_code, 64);

    if (!errorCodeCheck.ok) return invalidSyncReport();
    const errorCode = errorCodeCheck.value;
    const counts: Record<string, number> = {};

    for (const field of COUNT_FIELDS) {
      const value = nonNegativeSafeInt(report[field]);

      if (value == null) return invalidSyncReport();
      counts[field] = value;
    }

    // Optional: non-negative integer or explicit null (absent → null).
    let queueBytes: number | null = null;

    if (report.queue_bytes != null) {
      queueBytes = nonNegativeSafeInt(report.queue_bytes);

      if (queueBytes == null) return invalidSyncReport();
    }

    const cliVersion = trimField(report.cli_version, 32);

    if (!cliVersion) return invalidSyncReport();
    const osCheck = optionalTrimmed(report.os, 64);

    if (!osCheck.ok) return invalidSyncReport();
    const os = osCheck.value;

    // Server-derived contract fields (§2.11): the client never sends these.
    const startedAt = new Date(startedAtMs).toISOString();
    const endedAt = new Date(endedAtMs).toISOString();
    const durationMs = Math.max(0, endedAtMs - startedAtMs);
    const empty =
      counts.tokens_ingested === 0 && counts.sessions_uploaded === 0;

    // Idempotent replay: first write wins, so look before upserting and never
    // overwrite an existing run — a retry that arrives with different counters
    // must not rewrite history (§2.11).
    const existing = await select("token_sync_runs", {
      select: "run_id",
      filters: [
        ["user_id", "eq", String(tokenRow.user_id)],
        ["device_id", "eq", String(tokenRow.device_id)],
        ["run_id", "eq", runId],
      ],
      limit: 1,
    });

    if (existing.length > 0) {
      return jsonResponse(200, { ok: true, duplicate: true });
    }

    await upsert(
      "token_sync_runs",
      [
        {
          user_id: tokenRow.user_id,
          device_id: tokenRow.device_id,
          run_id: runId,
          started_at: startedAt,
          ended_at: endedAt,
          duration_ms: durationMs,
          trigger,
          result,
          error_code: errorCode,
          empty,
          parsed_files: counts.parsed_files,
          buckets_uploaded: counts.buckets_uploaded,
          tokens_ingested: counts.tokens_ingested,
          sessions_uploaded: counts.sessions_uploaded,
          sessions_skipped: counts.sessions_skipped,
          queue_bytes: queueBytes,
          cli_version: cliVersion,
          os,
        },
      ],
      "user_id,device_id,run_id",
      { returning: false },
    );

    // The read face caches per-account loads; drop them so a dashboard refresh
    // right after a sync sees the new run.
    invalidateAccountUsage(String(tokenRow.user_id));

    return jsonResponse(200, { ok: true, duplicate: false });
  } catch (error) {
    return errorResponse(error);
  }
}
