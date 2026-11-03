"use strict";

// `tokenusage reconcile` — compare this machine's local last-wins baseline
// against the hourly rows the cloud holds for THIS device.
//
// Baseline definition (AGENTS hard rule 8): the whole of queue.jsonl, last
// write wins per (hour_start, source, model) — the same rows `sync`/`upload`
// would send, read through the same normalize + sanitize pipeline
// (lib/queue-row-normalize.js, lib/ingest-sanitize.js). Server side is
// docs/cli-contract.md §2.13: per-device, verbatim rows, no account-level
// dedup and no derived cost.
//
// Read-only on both sides: nothing uploads, the queue is never rewritten and
// queue.state.json (the upload offset) is not touched. Drift is reported per
// key and exits 1 so a script can gate on it:
//
//   missing_on_server  local bucket the cloud never stored (blocked upload)
//   server_only        cloud row without a local counterpart (pruned queue, or
//                      a row written under another machine identity)
//   mismatch           same key, different values (legacy repair / stale row)
//
// Keys whose last-wins row sits past the upload offset are reported as
// `pending` instead: they have never been sent, so the cloud holding the older
// value is expected, not drift (a fresh `init` + `reconcile` used to exit 1 on
// exactly those keys until a `sync` flushed them).
//
// Known residual: ingest dedupes a REPLAYED duplicate inside one request by
// taking the larger total_tokens, so a queue that carried the same key twice
// with a shrinking total could keep a stale cloud value. Such keys surface as
// `mismatch` for a human to judge — the command never writes.

const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs/promises");

const { resolveTrackerPaths } = require("../lib/tracker-paths");
const { readJson } = require("../lib/fs");
const { resolveRuntimeConfig, assertInsforgeRuntime } = require("../lib/runtime-config");
const { functionUrlFor, fetchFunctionResponse } = require("../lib/function-url");
const { iterateQueueLines } = require("../lib/upload-queue");
const { normalizeQueueRow } = require("../lib/queue-row-normalize");
const { sanitizeBucketForUpload } = require("../lib/ingest-sanitize");
const { TOKEN_COLUMNS } = require("../lib/account-usage-dedup");
const { UsageError, unknownOptionError } = require("../lib/cli-errors");

const RECONCILE_SLUG = "token-usage-reconcile";
const DAY_MS = 86_400_000;
// Mirrors the server clamp (§2.13) so the local window can never be wider than
// what the cloud is willing to return in one paged scan.
const MAX_RANGE_DAYS = 366;
const DEFAULT_DAYS = 7;
const DEFAULT_LIMIT = 1000;
const MAX_LIMIT = 2000;
// Runaway guard: the server pages are ordered, so 1000 pages cover 1–2M rows
// (far beyond a year of one device's buckets). Hitting it means the window /
// limit combination is wrong, not that the data is that big.
const MAX_PAGES = 1000;
const TEXT_DRIFT_LIMIT = 25;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function readValue(argv, index, flag) {
  const value = argv[index + 1];
  if (value == null || value === "" || value.startsWith("--")) {
    throw new UsageError(`${flag} requires a value`, {
      code: "MISSING_VALUE",
      hint: "Run `tokenusage reconcile --help` for supported options.",
    });
  }
  return value;
}

function parseArgs(argv = []) {
  const out = { days: null, from: null, to: null, limit: null, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") out.json = true;
    else if (a === "--days") {
      out.days = readValue(argv, i, "--days");
      i += 1;
    } else if (a === "--from") {
      out.from = readValue(argv, i, "--from");
      i += 1;
    } else if (a === "--to") {
      out.to = readValue(argv, i, "--to");
      i += 1;
    } else if (a === "--limit") {
      out.limit = readValue(argv, i, "--limit");
      i += 1;
    } else throw unknownOptionError(a, "reconcile");
  }
  return out;
}

// A bare YYYY-MM-DD is a UTC calendar day: `--from 2026-10-25` starts at
// 00:00Z, `--to 2026-10-31` ends at the NEXT midnight (01:00 on 11-01), so the
// whole end day is inside the window. A full ISO instant is taken verbatim
// (exclusive end).
function parseBoundary(value, { end = false } = {}) {
  if (DATE_ONLY.test(value)) {
    const ms = Date.parse(`${value}T00:00:00.000Z`);
    if (!Number.isFinite(ms)) {
      throw new UsageError(`Invalid date: ${value}`, {
        code: "WINDOW_INVALID",
        hint: "Use a real UTC date in YYYY-MM-DD form (e.g. 2026-10-25).",
      });
    }
    return end ? ms + DAY_MS : ms;
  }
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) {
    throw new UsageError(`Invalid date: ${value}`, {
      code: "WINDOW_INVALID",
      hint: "Use YYYY-MM-DD (UTC day) or an ISO timestamp such as 2026-10-25T00:00:00.000Z.",
    });
  }
  return ms;
}

function parseLimit(value) {
  if (value == null) return DEFAULT_LIMIT;
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new UsageError(`Invalid --limit: ${value}`, {
      code: "LIMIT_INVALID",
      hint: `Use an integer between 1 and ${MAX_LIMIT}.`,
    });
  }
  return Math.min(Math.max(Math.trunc(n), 1), MAX_LIMIT);
}

function parseDays(value) {
  if (value == null) return DEFAULT_DAYS;
  const n = Number(value);
  if (!Number.isFinite(n) || Math.trunc(n) !== n || n < 1 || n > MAX_RANGE_DAYS) {
    throw new UsageError(`Invalid --days: ${value}`, {
      code: "WINDOW_INVALID",
      hint: `Use an integer between 1 and ${MAX_RANGE_DAYS}.`,
    });
  }
  return n;
}

// Default window is the last N days ending NOW (`to` exclusive), so the
// current partial hour is included. The 366-day ceiling is applied locally too
// — the server would clamp it anyway, and reading keys outside it locally
// would report false `server_only` rows.
function resolveWindow(opts, nowMs) {
  const explicit = opts.from != null || opts.to != null;
  const fromMs = explicit && opts.from != null ? parseBoundary(opts.from) : null;
  const toMs = explicit && opts.to != null ? parseBoundary(opts.to, { end: true }) : nowMs;
  const effectiveFrom = fromMs == null ? toMs - parseDays(opts.days) * DAY_MS : fromMs;

  if (effectiveFrom > toMs) {
    throw new UsageError("--from must be before --to", {
      code: "WINDOW_INVALID",
      hint: "Check both dates: `--from` is inclusive, `--to` is the exclusive end.",
    });
  }
  const clampedFrom = Math.max(effectiveFrom, toMs - MAX_RANGE_DAYS * DAY_MS);
  return { fromMs: clampedFrom, toMs, clamped: clampedFrom !== effectiveFrom };
}

function bucketKey(hourMs, source, model, project = "") {
  // JSON over a delimiter: model names may contain `|`. contract v2
  // (2026-11-03): project_key joins the identity; '' = unattributed (rows
  // from a pre-v2 server have no project_key at all and land here too).
  return JSON.stringify([new Date(hourMs).toISOString(), source, model, project]);
}

// Local baseline: every usage row in queue.jsonl, normalized/sanitized exactly
// like the upload path, keyed and filtered on the normalized hour. Control
// records (kind-bearing account session states / watermarks) are not buckets.
async function collectBuckets({ queuePath, fromMs, toMs, start = 0 }) {
  let handle;
  try {
    handle = await fs.open(queuePath, "r");
  } catch (error) {
    if (error?.code === "ENOENT") return new Map();
    throw error;
  }
  const buckets = new Map();
  try {
    const before = await handle.stat();
    const from = Math.min(Math.max(Number(start) || 0, 0), before.size);
    for await (const record of iterateQueueLines(handle, from, before.size)) {
      // A producer may be mid-write; an incomplete tail is not yet queued data.
      if (!record.complete) break;
      const line = record.bytes.toString("utf8");
      if (!line.trim()) continue;
      let bucket;
      try {
        bucket = JSON.parse(line);
      } catch (_error) {
        continue;
      }
      if (!bucket || typeof bucket !== "object" || Array.isArray(bucket)) continue;
      if (Object.hasOwn(bucket, "kind")) continue;
      const hourMs = typeof bucket.hour_start === "string" ? Date.parse(bucket.hour_start) : NaN;
      if (!Number.isFinite(hourMs) || hourMs < fromMs || hourMs >= toMs) continue;
      const source = (typeof bucket.source === "string" ? bucket.source.trim().toLowerCase() : "") || "codex";
      const model = (typeof bucket.model === "string" ? bucket.model.trim() : "") || "unknown";
      const row = normalizeQueueRow({
        ...bucket,
        source,
        model,
        hour_start: new Date(hourMs).toISOString(),
      });
      const sanitized = sanitizeBucketForUpload(row);
      if (!sanitized) continue;
      const project = typeof sanitized.project_key === "string" ? sanitized.project_key.trim() : "";
      buckets.set(bucketKey(hourMs, source, model, project), sanitized);
    }
  } finally {
    await handle.close();
  }
  return buckets;
}

function readLocalBaseline({ queuePath, fromMs, toMs }) {
  return collectBuckets({ queuePath, fromMs, toMs });
}

// The queue suffix past queue.state.json's upload offset. Every key found here
// has its last-wins row not uploaded yet, so comparing it against the cloud is
// premature: the cloud legitimately holds the older value. Reporting it as
// drift made the first `init` + `reconcile` on a machine look broken (5 "drifted"
// keys that a single `sync` fixed), so these keys are listed as pending.
function readPendingBuckets({ queuePath, offset = 0, fromMs, toMs }) {
  return collectBuckets({ queuePath, fromMs, toMs, start: offset });
}

async function fetchPage({ url, deviceToken, anonKey, timeoutMs, fetchImpl }) {
  const headers = { Accept: "application/json", Authorization: `Bearer ${deviceToken}` };
  if (anonKey) headers.apikey = anonKey;
  const res = await fetchFunctionResponse(
    url,
    { method: "GET", headers, ...(timeoutMs > 0 ? { signal: AbortSignal.timeout(timeoutMs) } : {}) },
    fetchImpl,
  );
  const text = await res.text();
  let data = {};
  try {
    data = JSON.parse(text);
  } catch (_error) {
    data = {};
  }
  if (res.status === 401) {
    throw new UsageError("The backend rejected this device token.", {
      code: "CLOUD_DEVICE_TOKEN_REJECTED",
      hint: "Re-pair this machine with `tokenusage device-login`, then retry.",
    });
  }
  if (res.status === 403) {
    throw new UsageError("This device is revoked, so its rows are not readable.", {
      code: "CLOUD_DEVICE_REVOKED",
      hint: "Re-pair this machine with `tokenusage device-login`, then retry.",
    });
  }
  if (!res.ok) {
    throw new Error(`reconcile failed (HTTP ${res.status}): ${text.slice(0, 300)}`);
  }
  return data;
}

async function fetchServerBuckets({ baseUrl, anonKey, deviceToken, from, to, limit, timeoutMs, fetchImpl }) {
  const endpoint = functionUrlFor(baseUrl, RECONCILE_SLUG);
  const buckets = new Map();
  let deviceId = null;
  let pages = 0;
  let offset = 0;
  let pageSize = limit;
  for (; pages < MAX_PAGES; pages++) {
    const url = new URL(endpoint);
    url.searchParams.set("from", from);
    url.searchParams.set("to", to);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("offset", String(offset));
    const data = await fetchPage({ url: url.toString(), deviceToken, anonKey, timeoutMs, fetchImpl });
    const rows = Array.isArray(data?.buckets) ? data.buckets : [];
    // The server echoes its clamped limit; trust it for the end-of-pages test.
    pageSize = Number.isFinite(Number(data?.limit)) ? Math.max(1, Number(data.limit)) : limit;
    deviceId = typeof data?.device_id === "string" ? data.device_id : deviceId;
    for (const row of rows) {
      const hourMs = Date.parse(String(row?.hour_start));
      if (!Number.isFinite(hourMs)) continue;
      const source = String(row.source);
      const model = String(row.model);
      // Pre-v2 servers omit project_key entirely; treat as unattributed ('').
      const project = typeof row.project_key === "string" ? row.project_key : "";
      buckets.set(bucketKey(hourMs, source, model, project), row);
    }
    if (rows.length < pageSize) break;
    offset += rows.length;
  }
  if (pages >= MAX_PAGES) {
    throw new UsageError("Reconciliation window returned too many pages.", {
      code: "WINDOW_TOO_LARGE",
      hint: "Narrow the window with --from/--to or --days, or raise --limit.",
    });
  }
  return { buckets, deviceId, pages: pages + 1 };
}

function valuesDiffer(local, server, column) {
  if (column === "billable_total_tokens") {
    if (local == null && server == null) return false;
    if (local == null || server == null) return true;
    return Number(local) !== Number(server);
  }
  if (column === "credits") {
    return round6(Number(local ?? 0)) !== round6(Number(server ?? 0));
  }
  return Number(local ?? 0) !== Number(server ?? 0);
}

function round6(value) {
  return Math.round((Number.isFinite(value) ? value : 0) * 1e6) / 1e6;
}

const COMPARED_COLUMNS = [...TOKEN_COLUMNS, "billable_total_tokens", "conversations", "credits"];

// Queue rows use the `conversation_count` wire alias (§2.4) while the hourly
// table stores `conversations`; read either name so a row that only carries the
// legacy one is not compared as 0.
function columnValue(row, column) {
  if (column === "conversations" && row?.conversations === undefined) {
    return row?.conversation_count;
  }
  return row?.[column];
}

function describeRow(row) {
  const out = {};
  for (const column of COMPARED_COLUMNS) {
    const value = columnValue(row, column);
    if (column === "billable_total_tokens" && value == null) out[column] = null;
    else if (column === "credits") out[column] = round6(Number(value ?? 0));
    else out[column] = Number(value ?? 0);
  }
  return out;
}

function compareBuckets({ local, server, pending = new Set() }) {
  const missingOnServer = [];
  const mismatches = [];
  const serverOnly = [];
  const pendingUpload = [];

  for (const [key, localRow] of local) {
    const hourStart = new Date(Date.parse(localRow.hour_start)).toISOString();
    const base = { hour_start: hourStart, source: localRow.source, model: localRow.model };
    const serverRow = server.get(key);
    if (pending.has(key)) {
      pendingUpload.push({
        ...base,
        local: describeRow(localRow),
        server: serverRow ? describeRow(serverRow) : null,
      });
      continue;
    }
    if (!serverRow) {
      missingOnServer.push({ ...base, local: describeRow(localRow), server: null });
      continue;
    }
    const fields = COMPARED_COLUMNS.filter((column) =>
      valuesDiffer(columnValue(localRow, column), serverRow?.[column], column),
    );
    if (fields.length > 0) {
      mismatches.push({
        ...base,
        local: describeRow(localRow),
        server: describeRow(serverRow),
        fields,
      });
    }
  }

  for (const [key, serverRow] of server) {
    if (local.has(key)) continue;
    serverOnly.push({
      hour_start: new Date(Date.parse(String(serverRow.hour_start))).toISOString(),
      source: String(serverRow.source),
      model: String(serverRow.model),
      local: null,
      server: describeRow(serverRow),
    });
  }

  const sortEntries = (entries) =>
    entries.sort(
      (a, b) =>
        a.hour_start.localeCompare(b.hour_start) ||
        a.source.localeCompare(b.source) ||
        a.model.localeCompare(b.model),
    );

  return {
    missing_on_server: sortEntries(missingOnServer),
    server_only: sortEntries(serverOnly),
    mismatch: sortEntries(mismatches),
    pending: sortEntries(pendingUpload),
    counts: {
      missing_on_server: missingOnServer.length,
      server_only: serverOnly.length,
      mismatch: mismatches.length,
      pending: pendingUpload.length,
    },
    drifted: missingOnServer.length + serverOnly.length + mismatches.length,
  };
}

function describeEntry(entry, isMismatch = false) {
  const head = `${entry.hour_start}  ${entry.source}  ${entry.model}`;
  if (isMismatch) {
    const parts = entry.fields.map((field) =>
      `${field} local ${entry.local[field] === null ? "null" : entry.local[field]} → cloud ${entry.server[field] === null ? "null" : entry.server[field]}`,
    );
    return `  ${head}  (${parts.join(", ")})`;
  }
  const row = entry.local || entry.server;
  return `  ${head}  (total_tokens=${row ? row.total_tokens : 0})`;
}

function renderText(summary) {
  const pendingCount = summary.counts?.pending ?? 0;
  const lines = [
    `Reconcile window (UTC, hour_start in [from, to)):`,
    `  from ${summary.from}`,
    `  to   ${summary.to}`,
    summary.clamped ? "  (from clamped to the server's 366-day ceiling)" : null,
    `Local baseline: ${summary.local_buckets.toLocaleString("en-US")} bucket(s) from queue.jsonl (last-wins)`,
    pendingCount > 0
      ? `  ${pendingCount.toLocaleString("en-US")} of them are past the upload offset (queue.state.json) and not compared yet`
      : null,
    `Cloud device:   ${summary.device_id || "unknown"} — ${summary.cloud_buckets.toLocaleString("en-US")} row(s) in ${summary.pages} page(s)`,
  ].filter(Boolean);

  if (summary.drifted === 0) {
    lines.push(
      pendingCount > 0
        ? `Result: OK — every uploaded bucket matches the cloud row (${pendingCount.toLocaleString("en-US")} still pending upload).`
        : "Result: OK — every local bucket matches the cloud row.",
    );
    if (pendingCount > 0) {
      lines.push(
        "Pending buckets are local rows `sync` has not uploaded yet, so the cloud cannot",
        "hold them; run `tokenusage sync` and re-run this command to compare them.",
      );
    }
    return `${lines.join("\n")}\n`;
  }

  lines.push(
    `Result: ${summary.drifted.toLocaleString("en-US")} drifted key(s) — ` +
      `${summary.counts.missing_on_server} missing on server, ` +
      `${summary.counts.server_only} server-only, ${summary.counts.mismatch} mismatched`,
  );
  const sections = [
    ["missing_on_server", summary.drift.missing_on_server, false],
    ["server_only", summary.drift.server_only, false],
    ["mismatch", summary.drift.mismatch, true],
  ];
  for (const [label, entries, isMismatch] of sections) {
    if (entries.length === 0) continue;
    lines.push(`${label}:`);
    for (const entry of entries.slice(0, TEXT_DRIFT_LIMIT)) {
      lines.push(describeEntry(entry, isMismatch));
    }
    if (entries.length > TEXT_DRIFT_LIMIT) {
      lines.push(`  … and ${entries.length - TEXT_DRIFT_LIMIT} more (use --json for the full list)`);
    }
  }
  if (pendingCount > 0) {
    lines.push(
      `Note: ${pendingCount.toLocaleString("en-US")} local key(s) are still pending upload and were left out of the drift count.`,
    );
  }
  lines.push(
    "Hint: `tokenusage upload` pushes pending local buckets; `server_only` keys mean the",
    "cloud holds rows this queue no longer contains. This command never writes.",
  );
  return `${lines.join("\n")}\n`;
}

async function cmdReconcile(argv = [], options = {}) {
  const opts = parseArgs(argv);
  const home = options.home || os.homedir();
  const nowMs = typeof options.now === "function" ? Number(options.now()) : Number(options.now ?? Date.now());
  const fetchImpl = options.fetchImpl || fetch;
  const { trackerDir } = await resolveTrackerPaths({ home });
  const queuePath = path.join(trackerDir, "queue.jsonl");

  const window = resolveWindow(opts, nowMs);
  const from = new Date(window.fromMs).toISOString();
  // Explicit `--to` is already an exclusive instant; a default `to` is "now".
  const to = new Date(window.toMs).toISOString();
  const limit = parseLimit(opts.limit);

  const config = (await readJson(path.join(trackerDir, "config.json"))) || {};
  const runtime = assertInsforgeRuntime(resolveRuntimeConfig({ config, env: process.env }));
  if (!runtime.deviceToken) {
    throw new UsageError("This machine is not paired with a dashboard yet.", {
      code: "NO_DEVICE_TOKEN",
      hint: "Run `tokenusage device-login` (or `tokenusage init`) first.",
    });
  }

  const local = await readLocalBaseline({ queuePath, fromMs: window.fromMs, toMs: window.toMs });
  // Rows past queue.state.json's offset have not been uploaded: their keys are
  // pending (not drift), because the cloud can only hold the previous value.
  const queueState = (await readJson(path.join(trackerDir, "queue.state.json"))) || {};
  const uploadOffset = Number.isFinite(Number(queueState.offset)) ? Math.max(0, Number(queueState.offset)) : 0;
  const pending = await readPendingBuckets({
    queuePath,
    offset: uploadOffset,
    fromMs: window.fromMs,
    toMs: window.toMs,
  });
  const { buckets: server, deviceId, pages } = await fetchServerBuckets({
    baseUrl: runtime.baseUrl,
    anonKey: runtime.anonKey,
    deviceToken: runtime.deviceToken,
    from,
    to,
    limit,
    timeoutMs: runtime.httpTimeoutMs,
    fetchImpl,
  });
  const compared = compareBuckets({ local, server, pending: new Set(pending.keys()) });

  const summary = {
    status: compared.drifted === 0 ? "ok" : "drift",
    from,
    to,
    clamped: window.clamped,
    device_id: deviceId,
    local_buckets: local.size,
    cloud_buckets: server.size,
    pages,
    upload_offset: uploadOffset,
    counts: compared.counts,
    drifted: compared.drifted,
    drift: {
      missing_on_server: compared.missing_on_server,
      server_only: compared.server_only,
      mismatch: compared.mismatch,
    },
    pending: compared.pending,
  };

  // Output seam: tests render without hijacking process.stdout (which would
  // swallow the node test runner's own protocol writes).
  const write = options.output || ((text) => process.stdout.write(text));
  if (opts.json) write(`${JSON.stringify(summary, null, 2)}\n`);
  else write(renderText(summary));

  if (compared.drifted > 0) process.exitCode = 1;
  return summary;
}

module.exports = {
  cmdReconcile,
  parseArgs,
  resolveWindow,
  readLocalBaseline,
  readPendingBuckets,
  compareBuckets,
  RECONCILE_SLUG,
};
