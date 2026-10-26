// POST /api/functions/token-usage-ingest — device token only. CLI face, frozen
// by docs/cli-contract.md §2.4. Bucket-granular last-wins upsert is the
// reconciliation baseline; never change the key or the dedup semantics.

import {
  errorResponse,
  getBearer,
  jsonResponse,
  methodNotAllowedResponse,
  preflightResponse,
  readJsonBody,
} from "@/lib/api/http";
import {
  assertConfigured,
  rpc,
  select,
  update,
  upsert,
  type RestRow,
} from "@/lib/api/supabase-rest";
import { invalidateAccountUsage } from "@/lib/api/account-data";
import { sha256Hex } from "@/lib/device-codes";
import {
  dedupeBuckets,
  dedupeSessions,
  dedupeStates,
  isAccountLevelSessionSource,
  normalizeBucket,
  normalizeSession,
  normalizeSessionSource,
  normalizeSessionState,
  type NormalizedSession,
} from "@/lib/ingest/normalize";

export const dynamic = "force-dynamic";

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

    const body = (await readJsonBody(request)) as Record<string, unknown>;
    const rawBuckets = Array.isArray(body.hourly)
      ? body.hourly
      : Array.isArray(body.buckets)
        ? body.buckets
        : [];
    const rawStates = Array.isArray(body.account_session_states)
      ? body.account_session_states
      : [];
    const rawSessionsValue = body.sessions;

    if (rawSessionsValue != null && !Array.isArray(rawSessionsValue)) {
      return jsonResponse(400, { error: "Invalid session" });
    }
    const rawSessions = Array.isArray(rawSessionsValue) ? rawSessionsValue : [];

    if (rawBuckets.length > 500) {
      return jsonResponse(400, { error: "Too many buckets (max 500)" });
    }
    if (rawStates.length > 500) {
      return jsonResponse(400, {
        error: "Too many account session states (max 500)",
      });
    }
    if (rawSessions.length > 200) {
      return jsonResponse(400, { error: "Too many sessions (max 200)" });
    }
    if (
      rawBuckets.length === 0 &&
      rawStates.length === 0 &&
      rawSessions.length === 0
    ) {
      return jsonResponse(400, { error: "No usage buckets provided" });
    }

    const normalizedBuckets = [];

    for (const raw of rawBuckets) {
      const bucket = normalizeBucket(raw);

      if (!bucket) return jsonResponse(400, { error: "Invalid usage bucket" });
      normalizedBuckets.push(bucket);
    }

    const normalizedStates = [];

    for (const raw of rawStates) {
      const state = normalizeSessionState(raw);

      if (!state)
        return jsonResponse(400, { error: "Invalid account session state" });
      normalizedStates.push(state);
    }

    // Account-level sources are dropped whole (no further validation) and
    // counted as skipped; everything else must pass §2.4 session validation.
    const normalizedSessions: NormalizedSession[] = [];
    let accountLevelSkipped = 0;

    for (const raw of rawSessions) {
      if (!raw || typeof raw !== "object") {
        return jsonResponse(400, { error: "Invalid session" });
      }
      const source = normalizeSessionSource(
        (raw as Record<string, unknown>).source,
      );

      if (isAccountLevelSessionSource(source)) {
        accountLevelSkipped += 1;
        continue;
      }
      const session = normalizeSession(raw);

      if (!session) return jsonResponse(400, { error: "Invalid session" });
      normalizedSessions.push(session);
    }

    const now = new Date().toISOString();
    const buckets = dedupeBuckets(normalizedBuckets);
    const states = dedupeStates(normalizedStates);
    const dedupedSessions = dedupeSessions(normalizedSessions);
    const dedupeSkipped = normalizedSessions.length - dedupedSessions.length;

    if (buckets.length > 0) {
      await upsert(
        "token_usage_hourly",
        buckets.map((bucket): RestRow => ({
          user_id: tokenRow.user_id,
          device_id: tokenRow.device_id,
          ...bucket,
          updated_at: now,
        })),
        "user_id,device_id,hour_start,source,model",
        { returning: false },
      );
    }

    if (states.length > 0) {
      await upsert(
        "token_account_session_states",
        states.map((state): RestRow => ({
          user_id: tokenRow.user_id,
          ...state,
          updated_at: now,
        })),
        "user_id,source,session_id",
        { returning: false },
      );
    }

    let sessionsUpserted = 0;
    let sessionsRpcSkipped = 0;

    if (dedupedSessions.length > 0) {
      const result = (await rpc("token_upsert_sessions", {
        p_user_id: tokenRow.user_id,
        p_device_id: tokenRow.device_id,
        p_sessions: dedupedSessions,
      })) as { upserted?: unknown; skipped?: unknown } | null;

      sessionsUpserted = Number(result?.upserted) || 0;
      sessionsRpcSkipped = Number(result?.skipped) || 0;
    }

    // The read face caches per-account loads; drop them so a dashboard
    // refresh right after an upload sees the new buckets.
    if (buckets.length > 0 || states.length > 0 || dedupedSessions.length > 0)
      invalidateAccountUsage(String(tokenRow.user_id));

    // Best effort: a telemetry write must not fail an already-committed upload.
    try {
      await update(
        "token_device_tokens",
        { last_used_at: now },
        [["token_hash", "eq", tokenHash]],
        { returning: false },
      );
    } catch (error) {
      console.error(
        "ingest: last_used_at update failed",
        (error as Error)?.message || error,
      );
    }

    const response: Record<string, unknown> = {
      inserted: buckets.length,
      skipped: 0,
      upload_scope: "private",
    };

    // Older CLIs never send `sessions`, and their response stays byte-for-byte
    // unchanged (docs/cli-contract.md §2.4).
    if (rawSessions.length > 0) {
      response.sessions_upserted = sessionsUpserted;
      response.sessions_skipped =
        dedupeSkipped + accountLevelSkipped + sessionsRpcSkipped;
    }

    return jsonResponse(200, response);
  } catch (error) {
    return errorResponse(error);
  }
}
