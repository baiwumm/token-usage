// POST /api/functions/token-usage-ingest — device token only. CLI face, frozen
// by docs/cli-contract.md §2.4. Bucket-granular last-wins upsert is the
// reconciliation baseline; never change the key or the dedup semantics.
// The optional `projects` array (contract v3) is per-device, best-effort
// repo detection that never fails the batch.

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
  MAX_PROJECT_ENTRIES,
  dedupeBuckets,
  dedupeProjectRepos,
  dedupeSessions,
  dedupeStates,
  isAccountLevelSessionSource,
  normalizeBucket,
  normalizeProjectRepo,
  normalizeSession,
  normalizeSessionSource,
  normalizeSessionState,
  type NormalizedProjectRepo,
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
    const rawProjectsValue = body.projects;

    // contract v3: only the container shape can reject the request; entries
    // are dropped one by one below.
    if (rawProjectsValue != null && !Array.isArray(rawProjectsValue)) {
      return jsonResponse(400, { error: "Invalid project" });
    }
    const rawProjects = Array.isArray(rawProjectsValue) ? rawProjectsValue : [];

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
    if (rawProjects.length > MAX_PROJECT_ENTRIES) {
      return jsonResponse(400, { error: "Too many projects (max 200)" });
    }
    if (
      rawBuckets.length === 0 &&
      rawStates.length === 0 &&
      rawSessions.length === 0 &&
      rawProjects.length === 0
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

    // Validate first, then let the later valid entry win per project_key; an
    // invalid entry is only counted, never a 400.
    const validProjects: NormalizedProjectRepo[] = [];

    for (const raw of rawProjects) {
      const entry = normalizeProjectRepo(raw);

      if (entry) validProjects.push(entry);
    }
    const projects = dedupeProjectRepos(validProjects);

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
          // contract v2: the PK column is NOT NULL DEFAULT '' — the
          // unattributed form is the empty string, not NULL.
          project_key: bucket.project_key ?? "",
          updated_at: now,
        })),
        "user_id,device_id,hour_start,source,model,project_key",
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

    // contract v3: repo detection is best effort and written last. Each device
    // owns its rows (a null clears only this device). A failed write — e.g. a
    // self-hosted instance that has not run the migration — must not fail an
    // upload whose usage rows already landed: the counters are left out, so
    // the CLI treats the entries as unconfirmed and resends them next sync.
    let projectsConfirmed = rawProjects.length > 0;

    if (projects.length > 0) {
      try {
        await upsert(
          "token_project_repos",
          projects.map((entry): RestRow => ({
            user_id: tokenRow.user_id,
            device_id: tokenRow.device_id,
            project_key: entry.project_key,
            repo_url: entry.repo_url,
            updated_at: now,
          })),
          "user_id,device_id,project_key",
          { returning: false },
        );
      } catch (error) {
        projectsConfirmed = false;
        // eslint-disable-next-line no-console
        console.error(
          "ingest: projects write failed",
          (error as Error)?.message || error,
        );
      }
    }

    // Best effort: a telemetry write must not fail an already-committed upload.
    try {
      await update(
        "token_device_tokens",
        { last_used_at: now },
        [["token_hash", "eq", tokenHash]],
        { returning: false },
      );
    } catch (error) {
      // eslint-disable-next-line no-console
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
    // Same rule for contract v3: no `projects`, no counters.
    if (projectsConfirmed) {
      response.projects_upserted = projects.length;
      response.projects_skipped = rawProjects.length - projects.length;
    }

    return jsonResponse(200, response);
  } catch (error) {
    return errorResponse(error);
  }
}
