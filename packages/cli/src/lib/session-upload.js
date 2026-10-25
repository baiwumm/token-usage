"use strict";

// Session metadata upload for the token-usage ingest (docs/cli-contract.md
// §2.4 `sessions`). Maps the local session-analytics sidecar rows onto the
// contract's wire shape, filters through per-(source, session_id) ended_at
// watermarks so repeat syncs are increments, and POSTs batches of <=200 to
// the same ingest endpoint the hourly buckets use.
//
// Privacy boundary (docs/m-cli-task.md): only the contract's whitelisted
// fields are sent. The sidecar's title, project_ref (local cwd), resume
// identifiers and cache keys never leave the process — buildSessionUploadRows
// constructs each row field-by-field rather than spreading.

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const { functionUrlFor, fetchFunctionResponse } = require("./function-url");

const INGEST_SLUG = "token-usage-ingest";
const MAX_SESSIONS_PER_BATCH = 200;
// Contract: source is trimmed + lowercased; these two are account-level and
// the server skips them wholesale — the CLI just never uploads them.
const ACCOUNT_LEVEL_SOURCES = new Set(["cursor", "trae-cn"]);
// Keep the watermark map bounded: sessions older than the newest N never
// re-upload anyway (their ended_at watermark only moves forward).
const WATERMARK_MAX_ENTRIES = 5000;

// Six token counters ride along everywhere; total must equal the sum of the
// four that count toward it (reasoning is a sub-view of output, single-column).
const TOKEN_FIELDS = [
  "input_tokens",
  "cached_input_tokens",
  "cache_creation_input_tokens",
  "output_tokens",
  "reasoning_output_tokens",
  "total_tokens",
];

function safeInt(value) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0) return null;
  return n;
}

function basenameKey(value) {
  const raw = String(value || "").replace(/[\\/]+$/, "");
  if (!raw || raw === "." || raw === "..") return null;
  const base = raw.split(/[\\/]/).pop().trim();
  if (!base || base === "." || base === "..") return null;
  // Control characters are rejected server-side; strip instead of failing.
  // eslint-disable-next-line no-control-regex
  const clean = base.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 120);
  return clean || null;
}

function validSessionId(value) {
  if (typeof value !== "string") return false;
  const id = value.trim();
  if (!id || id.length > 256) return false;
  if (id.includes("/") || id.includes("\\")) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(id)) return false;
  return true;
}

/**
 * Map one session-analytics sidecar row onto the contract wire shape.
 * Returns null when the row must not be uploaded (account-level source,
 * missing identity/timestamps, or a token identity that the server would
 * reject with a whole-batch 400 — dropping one bad row beats failing 200).
 */
function mapSessionRow(row) {
  if (!row || typeof row !== "object") return null;
  const source = String(row.source || "").trim().toLowerCase();
  if (!source || ACCOUNT_LEVEL_SOURCES.has(source)) return null;
  if (!validSessionId(row.session_id)) return null;

  const startedMs = Date.parse(row.started_at || "");
  const endedMs = Date.parse(row.ended_at || "");
  if (!Number.isFinite(startedMs) || !Number.isFinite(endedMs)) return null;
  if (endedMs < startedMs) return null;

  const tokens = {};
  for (const field of TOKEN_FIELDS) {
    const value = safeInt(row[field]);
    if (value === null) return null;
    tokens[field] = value;
  }
  const identity =
    tokens.input_tokens +
    tokens.cached_input_tokens +
    tokens.cache_creation_input_tokens +
    tokens.output_tokens;
  if (tokens.total_tokens !== identity) return null;

  // Per-model rows follow the same identity rule; any bad model row (or a
  // sum mismatch with the session total) drops the whole models array — the
  // contract allows omitting it and prices the session as 0.
  let models = [];
  const usageRows = Array.isArray(row.model_usage) ? row.model_usage : [];
  let modelsValid = usageRows.length > 0 && usageRows.length <= 32;
  let modelsSum = 0;
  if (modelsValid) {
    for (const usage of usageRows) {
      const modelTokens = {};
      for (const field of TOKEN_FIELDS) {
        const value = safeInt(usage?.[field]);
        if (value === null) {
          modelsValid = false;
          break;
        }
        modelTokens[field] = value;
      }
      if (!modelsValid) break;
      const modelIdentity =
        modelTokens.input_tokens +
        modelTokens.cached_input_tokens +
        modelTokens.cache_creation_input_tokens +
        modelTokens.output_tokens;
      if (modelTokens.total_tokens !== modelIdentity) {
        modelsValid = false;
        break;
      }
      modelsSum += modelTokens.total_tokens;
      models.push({ model: String(usage.model || "").trim() || "unknown", ...modelTokens });
    }
    if (modelsValid && modelsSum !== tokens.total_tokens) modelsValid = false;
  }
  if (!modelsValid) models = [];
  if (models.length > 32) {
    models.sort((a, b) => b.total_tokens - a.total_tokens);
    models = models.slice(0, 32);
  }

  return {
    session_id: String(row.session_id).trim(),
    source,
    started_at: new Date(startedMs).toISOString(),
    ended_at: new Date(endedMs).toISOString(),
    project_key: basenameKey(row.project_key ?? row.project_ref),
    ...tokens,
    billable_total_tokens: null,
    ...(models.length > 0 ? { models } : {}),
  };
}

/** Map + filter a sidecar rows array; invalid rows are counted, not fatal. */
function buildSessionUploadRows(rows) {
  const out = [];
  let skipped = 0;
  for (const row of Array.isArray(rows) ? rows : []) {
    const mapped = mapSessionRow(row);
    if (mapped) out.push(mapped);
    else skipped += 1;
  }
  return { rows: out, skipped };
}

function watermarkKey(source, sessionId) {
  return `${source}|${sessionId}`;
}

function loadWatermarks(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const map = new Map();
    for (const [key, value] of Object.entries(
      parsed && typeof parsed === "object" ? parsed : {},
    )) {
      if (typeof key === "string" && typeof value === "string" && key.includes("|")) {
        map.set(key, value);
      }
    }
    return map;
  } catch {
    return new Map();
  }
}

function pruneWatermarks(map) {
  if (map.size <= WATERMARK_MAX_ENTRIES) return map;
  const entries = [...map.entries()].sort((a, b) =>
    String(a[1]).localeCompare(String(b[1])),
  );
  return new Map(entries.slice(entries.length - WATERMARK_MAX_ENTRIES));
}

async function saveWatermarks(filePath, map) {
  const pruned = pruneWatermarks(map);
  const json = JSON.stringify(
    Object.fromEntries([...pruned.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
    null,
    2,
  ) + "\n";
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  await fsp.writeFile(tmp, json, { mode: 0o600 });
  await fsp.rename(tmp, filePath);
  await fsp.chmod(filePath, 0o600).catch(() => {});
}

/** Rows strictly newer than their watermark, ascending by ended_at. */
function selectSessionsForUpload(rows, watermarks) {
  const pending = rows.filter((row) => {
    const mark = watermarks.get(watermarkKey(row.source, row.session_id));
    return !mark || String(row.ended_at) > mark;
  });
  pending.sort((a, b) => String(a.ended_at).localeCompare(String(b.ended_at)));
  return pending;
}

/**
 * Upload pending session rows in ascending ended_at batches of <=200. The
 * watermark file only advances for batches the server accepted, so a failed
 * batch leaves earlier successes committed and the failure retried next sync.
 */
async function uploadSessions({
  baseUrl,
  anonKey,
  deviceToken,
  sessions,
  watermarkPath,
  batchSize = MAX_SESSIONS_PER_BATCH,
  canUpload = () => true,
  fetchImpl = fetch,
  onProgress = () => {},
}) {
  const watermarks = loadWatermarks(watermarkPath);
  const pending = selectSessionsForUpload(sessions, watermarks);
  const size = Math.min(Math.max(1, batchSize), MAX_SESSIONS_PER_BATCH);
  let upserted = 0;
  let skippedServer = 0;
  let batches = 0;
  let uploaded = 0;

  for (let offset = 0; offset < pending.length; offset += size) {
    if (!canUpload()) break;
    const batch = pending.slice(offset, offset + size);
    const res = await fetchFunctionResponse(
      functionUrlFor(baseUrl, INGEST_SLUG),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${deviceToken}`,
          ...(anonKey ? { apikey: anonKey } : {}),
        },
        body: JSON.stringify({
          upload_id: crypto.randomUUID(),
          sessions: batch,
        }),
      },
      fetchImpl,
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const error = new Error(
        `sessions upload failed (HTTP ${res.status}): ${text.slice(0, 300)}`,
      );
      error.status = res.status;
      error.uploaded = uploaded;
      error.upserted = upserted;
      throw error;
    }
    const data = await res.json().catch(() => ({}));
    batches += 1;
    uploaded += batch.length;
    upserted += Number(data?.sessions_upserted || 0);
    skippedServer += Number(data?.sessions_skipped || 0);
    for (const row of batch) {
      watermarks.set(watermarkKey(row.source, row.session_id), row.ended_at);
    }
    await saveWatermarks(watermarkPath, watermarks);
    onProgress({ batches, uploaded, upserted });
  }

  return { pending: pending.length, uploaded, upserted, skippedServer, batches };
}

module.exports = {
  ACCOUNT_LEVEL_SOURCES,
  MAX_SESSIONS_PER_BATCH,
  basenameKey,
  buildSessionUploadRows,
  loadWatermarks,
  mapSessionRow,
  saveWatermarks,
  selectSessionsForUpload,
  uploadSessions,
  validSessionId,
  watermarkKey,
};
