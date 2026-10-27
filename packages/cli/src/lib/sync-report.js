"use strict";

// Per-run telemetry for docs/cli-contract.md §2.11
// (POST /api/functions/token-usage-sync-report): one record per completed
// sync — empty runs included. Reporting is strictly best-effort: a failure,
// a 404 (older backend) or a 5xx only reaches the local log and NEVER
// affects the ingest that already happened or the process exit code.
// run_id is the client-side idempotency key (`<started_at epoch ms>-<4hex>`),
// so a retry after a lost response dedupes server-side instead of double-
// counting the run.

const os = require("node:os");
const { functionUrlFor, fetchFunctionResponse } = require("./function-url");

const SYNC_REPORT_SLUG = "token-usage-sync-report";

function buildRunId(startedAtMs = Date.now(), randomBytes = 2) {
  const crypto = require("node:crypto");
  return `${startedAtMs}-${crypto.randomBytes(randomBytes).toString("hex")}`;
}

// Contract trigger enum: scheduled | manual | watch | notify. The auto-ish
// background flavors (retry, publish, openclaw signal) fold into the four
// allowed values: hook/signal spawns are notify, everything scheduled or
// retrying is scheduled, the --watch loop is watch, a plain CLI run is manual.
function resolveSyncTrigger(opts = {}, context = {}) {
  if (context?.trigger === "watch") return "watch";
  if (opts?.fromNotify || opts?.fromOpenclaw) return "notify";
  if (opts?.auto || opts?.background || opts?.fromRetry) return "scheduled";
  return "manual";
}

/**
 * Collects the §2.11 whitelist fields across one run. `log` receives the
 * local-only failure lines (the contract's error details never leave the
 * machine beyond the stable response codes).
 */
function createSyncRunTelemetry({
  trigger,
  startedAtMs = Date.now(),
  runId = buildRunId(startedAtMs),
  cliVersion,
  osLabel = `${process.platform} ${os.release()}`,
  log = () => {},
} = {}) {
  let parsedFiles = 0;
  let bucketsUploaded = 0;
  let tokensIngested = 0;
  let sessionsUploaded = 0;
  let sessionsSkipped = 0;
  let queueBytes = null;
  let result = "ok";
  let errorCode = null;
  let reported = false;

  return {
    runId,
    trigger,
    noteParsedFiles(count) {
      parsedFiles = Math.max(0, Number(count) || 0);
    },
    // Server-acked drain result: buckets placed into successful ingest
    // requests plus their total_tokens sum (client-side telemetry semantics
    // per §2.11 — a larger replay may override these buckets later).
    noteUpload({ inserted = 0, tokens = 0 } = {}) {
      bucketsUploaded += Math.max(0, Number(inserted) || 0);
      tokensIngested += Math.max(0, Number(tokens) || 0);
    },
    noteSessions({ upserted = 0, skipped = 0 } = {}) {
      sessionsUploaded += Math.max(0, Number(upserted) || 0);
      sessionsSkipped += Math.max(0, Number(skipped) || 0);
    },
    setOutcome({ result: nextResult, errorCode: nextErrorCode = null }) {
      result = nextResult;
      errorCode = nextErrorCode;
    },
    noteQueueBytes(bytes) {
      queueBytes = Math.max(0, Number(bytes) || 0);
    },
    snapshot() {
      return {
        run_id: runId,
        started_at: new Date(startedAtMs).toISOString(),
        ended_at: new Date().toISOString(),
        trigger,
        result,
        ...(errorCode ? { error_code: errorCode } : {}),
        parsed_files: parsedFiles,
        buckets_uploaded: bucketsUploaded,
        tokens_ingested: tokensIngested,
        sessions_uploaded: sessionsUploaded,
        sessions_skipped: sessionsSkipped,
        queue_bytes: queueBytes,
        cli_version: cliVersion,
        os: osLabel,
      };
    },
    /**
     * POST the run record. Unpaired runs (no device token / base URL) skip
     * silently — there is no backend to report to. Every failure path logs
     * locally and resolves false; nothing here may throw into the sync flow.
     */
    async report({ baseUrl, anonKey, deviceToken } = {}) {
      if (reported) return false;
      if (!deviceToken || !baseUrl) return false;
      reported = true;

      const payload = this.snapshot();
      try {
        const headers = {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${deviceToken}`,
        };
        if (anonKey) headers.apikey = anonKey;
        const res = await fetchFunctionResponse(
          functionUrlFor(baseUrl, SYNC_REPORT_SLUG),
          { method: "POST", headers, body: JSON.stringify(payload) },
        );
        if (!res.ok) {
          log(`Run report skipped (HTTP ${res.status})`);
          return false;
        }
        return true;
      } catch (error) {
        log(`Run report failed (kept locally): ${error?.message || error}`);
        return false;
      }
    },
  };
}

module.exports = {
  SYNC_REPORT_SLUG,
  buildRunId,
  resolveSyncTrigger,
  createSyncRunTelemetry,
};
