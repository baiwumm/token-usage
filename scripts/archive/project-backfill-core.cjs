"use strict";

// One-off historical project attribution backfill (2026-11-04).
//
// Contract v2 (docs/cli-contract.md §2.4) attributes an hourly bucket to a
// project by splitting the aggregate into one row per project plus a residual
// row under project_key "". The CLI has only done that for hours it re-scanned
// after 0.4.5, so older hours in queue.jsonl still carry one unattributed row
// while the local project queue already has the (model-less) project totals.
//
// This module reconstructs the split without touching any totals:
//
//   * single-model groups: project.queue.jsonl totals can be assigned to the
//     one model in the hourly group;
//   * multi-model groups: session.queue.jsonl usage buckets can supply the
//     model for a project, but only when their per-project token totals exactly
//     match project.queue.jsonl (otherwise the session scan is stale/partial
//     and the group stays untouched);
//   * everything else stays unattributed.
//
// Every emitted group adds up to the original hourly aggregate per field, so
// the local last-wins baseline and the cloud aggregate are unchanged.

const { basenameKey } = require("../../packages/cli/src/lib/project-key");
const { normalizeQueueRow } = require("../../packages/cli/src/lib/queue-row-normalize");

const TOKEN_FIELDS = [
  "input_tokens",
  "cached_input_tokens",
  "cache_creation_input_tokens",
  "output_tokens",
  "reasoning_output_tokens",
  "total_tokens",
];

const INTEGER_FIELDS = [...TOKEN_FIELDS, "billable_total_tokens", "conversation_count"];
const USD_TICKS = 1e6;

function toInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
}

function toNonNegativeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function roundUsd(value) {
  return Math.round((Number(value) || 0) * USD_TICKS) / USD_TICKS;
}

function canonicalHour(value) {
  if (typeof value !== "string" || !value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

// Session buckets carry a minute-level timestamp ("2026-11-04T07:49:00Z").
// Hourly queue rows use the collector's half-hour buckets (:00 / :30), so
// session evidence must be folded to the same :00/:30 boundary before it can
// be matched to an existing hourly group.
function bucketHourStart(value) {
  if (typeof value !== "string" || !value) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  const halfHourMs = 30 * 60 * 1000;
  return new Date(Math.floor(parsed / halfHourMs) * halfHourMs).toISOString();
}

function normalizeSource(value) {
  const text = typeof value === "string" ? value.trim().toLowerCase() : "";
  return text || "unknown";
}

function normalizeModel(value) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || "unknown";
}

function rawProjectKey(value) {
  if (typeof value !== "string") return "";
  return value.replace(/[\\/]+$/, "").trim();
}

function wireProjectKey(value) {
  return basenameKey(value) || "";
}

function emptyFields() {
  return {
    input_tokens: 0,
    cached_input_tokens: 0,
    cache_creation_input_tokens: 0,
    output_tokens: 0,
    reasoning_output_tokens: 0,
    total_tokens: 0,
    billable_total_tokens: null,
    total_cost_usd: 0,
    conversation_count: 0,
    credits: 0,
  };
}

function rowFields(row, costField = "total_cost_usd") {
  return {
    input_tokens: toInteger(row.input_tokens),
    cached_input_tokens: toInteger(row.cached_input_tokens),
    cache_creation_input_tokens: toInteger(row.cache_creation_input_tokens),
    output_tokens: toInteger(row.output_tokens),
    reasoning_output_tokens: toInteger(row.reasoning_output_tokens),
    total_tokens: toInteger(row.total_tokens),
    billable_total_tokens:
      row.billable_total_tokens == null ? null : toInteger(row.billable_total_tokens),
    total_cost_usd: roundUsd(toNonNegativeNumber(row[costField] ?? row.total_cost_usd)),
    conversation_count: toInteger(row.conversation_count ?? row.conversations),
    credits: roundUsd(toNonNegativeNumber(row.credits)),
  };
}

function cloneFields(fields) {
  return { ...emptyFields(), ...fields };
}

function addFields(target, delta) {
  for (const field of TOKEN_FIELDS) target[field] += Number(delta[field]) || 0;
  const targetBillable = target.billable_total_tokens;
  const deltaBillable = delta.billable_total_tokens;
  target.billable_total_tokens =
    targetBillable == null && deltaBillable == null
      ? null
      : (Number(targetBillable) || 0) + (Number(deltaBillable) || 0);
  target.total_cost_usd = roundUsd(target.total_cost_usd + (Number(delta.total_cost_usd) || 0));
  target.conversation_count += Number(delta.conversation_count) || 0;
  target.credits = roundUsd(target.credits + (Number(delta.credits) || 0));
}

function subtractFields(whole, part) {
  const residual = { ...whole };
  for (const field of TOKEN_FIELDS) {
    residual[field] = Math.max(0, (Number(whole[field]) || 0) - (Number(part[field]) || 0));
  }
  residual.billable_total_tokens =
    whole.billable_total_tokens == null
      ? null
      : Math.max(0, Number(whole.billable_total_tokens) - (Number(part.billable_total_tokens) || 0));
  residual.total_cost_usd = roundUsd(
    Math.max(0, Number(whole.total_cost_usd) - (Number(part.total_cost_usd) || 0)),
  );
  residual.conversation_count = Math.max(
    0,
    Number(whole.conversation_count) - (Number(part.conversation_count) || 0),
  );
  residual.credits = roundUsd(Math.max(0, Number(whole.credits) - (Number(part.credits) || 0)));
  return residual;
}

function fieldsAreZero(fields) {
  for (const field of INTEGER_FIELDS) {
    if (field === "billable_total_tokens") {
      if (fields.billable_total_tokens != null && fields.billable_total_tokens !== 0) return false;
      continue;
    }
    if ((Number(fields[field]) || 0) !== 0) return false;
  }
  return fields.total_cost_usd === 0 && fields.credits === 0;
}

function fieldsAtMost(left, right) {
  for (const field of TOKEN_FIELDS) {
    if ((Number(left[field]) || 0) > (Number(right[field]) || 0)) return false;
  }
  if (right.billable_total_tokens != null) {
    if ((Number(left.billable_total_tokens) || 0) > Number(right.billable_total_tokens)) return false;
  }
  if (roundUsd(left.total_cost_usd) > roundUsd(right.total_cost_usd) + 1e-6) return false;
  if ((Number(left.conversation_count) || 0) > (Number(right.conversation_count) || 0)) return false;
  if (roundUsd(left.credits) > roundUsd(right.credits) + 1e-6) return false;
  return true;
}

function fieldsEqual(left, right, tolerance = 1e-6) {
  for (const field of TOKEN_FIELDS) {
    if (left[field] !== right[field]) return false;
  }
  const leftBillable = left.billable_total_tokens;
  const rightBillable = right.billable_total_tokens;
  if (leftBillable == null || rightBillable == null) {
    if (leftBillable !== rightBillable) return false;
  } else if (leftBillable !== rightBillable) {
    return false;
  }
  if (Math.abs(left.total_cost_usd - right.total_cost_usd) > tolerance) return false;
  if (left.conversation_count !== right.conversation_count) return false;
  if (Math.abs(left.credits - right.credits) > tolerance) return false;
  return true;
}

function splitInteger(total, weights) {
  const amount = Math.max(0, Math.floor(Number(total) || 0));
  const weightSum = weights.reduce((sum, weight) => sum + Math.max(0, Number(weight) || 0), 0);
  if (amount === 0 || weightSum <= 0) return weights.map(() => 0);
  const result = weights.map((weight) => Math.floor((amount * Math.max(0, Number(weight) || 0)) / weightSum));
  let remainder = amount - result.reduce((sum, value) => sum + value, 0);
  for (let index = 0; remainder > 0; index = (index + 1) % result.length) {
    result[index] += 1;
    remainder -= 1;
  }
  return result;
}

function makeMainBucket(raw) {
  const normalized = normalizeQueueRow(raw);
  if (!normalized || typeof normalized !== "object" || Array.isArray(normalized)) return null;
  if (normalized.kind === "account_session_state" || normalized.kind === "account_sync_watermark") {
    return null;
  }
  const hour = canonicalHour(normalized.hour_start);
  if (!hour) return null;
  return {
    hour_start: hour,
    source: normalizeSource(normalized.source),
    model: normalizeModel(normalized.model),
    project_key: wireProjectKey(normalized.project_key),
    ...rowFields(normalized),
  };
}

function makeProjectBucket(raw) {
  const normalized = normalizeQueueRow(raw);
  if (!normalized || typeof normalized !== "object" || Array.isArray(normalized)) return null;
  const hour = canonicalHour(normalized.hour_start);
  if (!hour) return null;
  const rawKey = rawProjectKey(normalized.project_key);
  if (!rawKey) return null;
  const projectKey = wireProjectKey(rawKey);
  if (!projectKey) return null;
  return {
    hour_start: hour,
    source: normalizeSource(normalized.source),
    raw_project_key: rawKey,
    project_key: projectKey,
    ...rowFields(normalized),
  };
}

function groupKey(hour, source) {
  return `${hour}|${source}`;
}

function buildMainGroups(queueRows, stats) {
  const lastWins = new Map();
  for (const raw of queueRows) {
    const row = makeMainBucket(raw);
    if (!row) {
      stats.invalidMainRows += 1;
      continue;
    }
    // Contract v2 request/database identity: hour|source|model|project_key.
    lastWins.set(`${row.hour_start}|${row.source}|${row.model}|${row.project_key}`, row);
  }
  const groups = new Map();
  for (const row of lastWins.values()) {
    const key = groupKey(row.hour_start, row.source);
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        hour_start: row.hour_start,
        source: row.source,
        models: new Map(),
        already_attributed: false,
      };
      groups.set(key, group);
    }
    if (!group.models.has(row.model)) group.models.set(row.model, row);
    if (row.project_key) group.already_attributed = true;
  }
  stats.mainBuckets = lastWins.size;
  stats.mainGroups = groups.size;
  return groups;
}

function buildProjectGroups(projectRows, stats) {
  const lastWins = new Map();
  for (const raw of projectRows) {
    const row = makeProjectBucket(raw);
    if (!row) {
      stats.invalidProjectRows += 1;
      continue;
    }
    // The project queue is cumulative; repeated rows for one local project
    // identity are last-wins, exactly like the hourly queue.
    lastWins.set(`${row.hour_start}|${row.source}|${row.raw_project_key}`, row);
  }
  const groups = new Map();
  for (const row of lastWins.values()) {
    const key = groupKey(row.hour_start, row.source);
    let group = groups.get(key);
    if (!group) {
      group = { key, hour_start: row.hour_start, source: row.source, projects: new Map() };
      groups.set(key, group);
    }
    let fields = group.projects.get(row.project_key);
    if (!fields) {
      fields = emptyFields();
      group.projects.set(row.project_key, fields);
    }
    // Two local identities can share the server basename; merge them here so
    // the server's request dedupe cannot silently drop one of them.
    addFields(fields, row);
  }
  stats.projectBuckets = lastWins.size;
  stats.projectGroups = groups.size;
  return groups;
}

function sessionSnapshotMs(row) {
  const timestamp = Date.parse(String(row.ended_at || ""));
  return Number.isFinite(timestamp) ? timestamp : null;
}

// The session queue is append-only and can contain several snapshots of one
// (source, session_id). Upload/reconcile keep the latest snapshot by ended_at,
// so the backfill must do the same; summing every snapshot would double count
// the same usage buckets.
function latestSessionRows(sessionRows) {
  const latest = new Map();
  const anonymous = [];
  for (const raw of sessionRows) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const source = normalizeSource(raw.source);
    const sessionId = typeof raw.session_id === "string" ? raw.session_id.trim() : "";
    if (!sessionId) {
      anonymous.push({ source, row: raw });
      continue;
    }
    const key = `${source}|${sessionId}`;
    const previous = latest.get(key);
    if (!previous) {
      latest.set(key, { source, row: raw, snapshotMs: sessionSnapshotMs(raw) });
      continue;
    }
    const snapshotMs = sessionSnapshotMs(raw);
    if (snapshotMs == null) continue;
    if (previous.snapshotMs == null || snapshotMs > previous.snapshotMs) {
      latest.set(key, { source, row: raw, snapshotMs });
    }
  }
  return [...latest.values(), ...anonymous];
}

function buildSessionIndex(sessionRows, stats) {
  const index = new Map();
  for (const raw of sessionRows) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      stats.invalidSessionRows += 1;
    }
  }
  for (const { source, row } of latestSessionRows(sessionRows)) {
    const projectKey = wireProjectKey(row.project_key);
    if (!projectKey) continue;
    const buckets = row.usage_buckets;
    if (!buckets || typeof buckets !== "object" || Array.isArray(buckets)) continue;
    for (const bucket of Object.values(buckets)) {
      if (!bucket || typeof bucket !== "object" || Array.isArray(bucket)) continue;
      const hour = bucketHourStart(bucket.timestamp || bucket.hour_start);
      if (!hour) continue;
      const model = normalizeModel(bucket.model);
      const key = groupKey(hour, source);
      let map = index.get(key);
      if (!map) {
        map = new Map();
        index.set(key, map);
      }
      const identity = JSON.stringify([model, projectKey]);
      let entry = map.get(identity);
      if (!entry) {
        entry = { model, project_key: projectKey, fields: emptyFields() };
        map.set(identity, entry);
      }
      addFields(entry.fields, rowFields(bucket, "cost_usd"));
    }
  }
  stats.sessionGroups = index.size;
  return index;
}

function projectEntryBillable(entry, mainBillable) {
  if (mainBillable == null) return null;
  return entry.billable_total_tokens == null
    ? Number(entry.total_tokens) || 0
    : Number(entry.billable_total_tokens) || 0;
}

function projectEntryFields(entry, mainBillable) {
  return {
    ...entry,
    billable_total_tokens: projectEntryBillable(entry, mainBillable),
  };
}

function makeRow(group, model, projectKey, fields) {
  const row = {
    source: group.source,
    model,
    hour_start: group.hour_start,
    project_key: projectKey,
    input_tokens: fields.input_tokens,
    cached_input_tokens: fields.cached_input_tokens,
    cache_creation_input_tokens: fields.cache_creation_input_tokens,
    output_tokens: fields.output_tokens,
    reasoning_output_tokens: fields.reasoning_output_tokens,
    total_tokens: fields.total_tokens,
    billable_total_tokens: fields.billable_total_tokens,
    total_cost_usd: fields.total_cost_usd,
    conversation_count: fields.conversation_count,
  };
  if (fields.credits > 0) row.credits = fields.credits;
  return row;
}

function recordSkip(stats, group, reason, detail = null) {
  stats.skipped += 1;
  stats.skipReasons[reason] = (stats.skipReasons[reason] || 0) + 1;
  stats.skippedGroups.push({
    hour_start: group.hour_start,
    source: group.source,
    reason,
    detail,
  });
}

function processSingleModelGroup({ group, mainRow, projects, stats }) {
  const rows = [];
  const attributed = emptyFields();
  const projectDetails = [];
  for (const [projectKey, entry] of projects) {
    if (fieldsAreZero(entry)) {
      stats.zeroProjectRows += 1;
      continue;
    }
    const fields = projectEntryFields(entry, mainRow.billable_total_tokens);
    addFields(attributed, fields);
    rows.push(makeRow(group, mainRow.model, projectKey, fields));
    projectDetails.push({ project_key: projectKey, total_tokens: fields.total_tokens });
  }
  if (rows.length === 0) {
    recordSkip(stats, group, "no_nonzero_project");
    return null;
  }
  if (!fieldsAtMost(attributed, mainRow)) {
    recordSkip(stats, group, "project_exceeds_main", {
      attributed_total_tokens: attributed.total_tokens,
      main_total_tokens: mainRow.total_tokens,
      attributed_cost_usd: attributed.total_cost_usd,
      main_cost_usd: mainRow.total_cost_usd,
    });
    return null;
  }
  const residual = subtractFields(mainRow, attributed);
  rows.push(makeRow(group, mainRow.model, "", residual));
  return {
    rows,
    summary: {
      hour_start: group.hour_start,
      source: group.source,
      mode: "single_model",
      model: mainRow.model,
      projects: projectDetails,
      residual_total_tokens: residual.total_tokens,
    },
  };
}

function processMultiModelGroup({ group, mainRows, projects, sessionIndex, stats }) {
  const sessionMap = sessionIndex.get(group.key);
  if (!sessionMap || sessionMap.size === 0) {
    recordSkip(stats, group, "multi_model_no_session", { models: [...mainRows.keys()] });
    return null;
  }

  const candidates = [];
  for (const entry of sessionMap.values()) {
    if (!projects.has(entry.project_key)) continue;
    if (!mainRows.has(entry.model)) {
      recordSkip(stats, group, "session_model_unknown", {
        model: entry.model,
        project_key: entry.project_key,
        models: [...mainRows.keys()],
      });
      return null;
    }
    if (fieldsAreZero(entry.fields)) continue;
    candidates.push({
      model: entry.model,
      project_key: entry.project_key,
      fields: cloneFields(entry.fields),
    });
  }
  if (candidates.length === 0) {
    recordSkip(stats, group, "session_project_not_in_queue", {
      models: [...mainRows.keys()],
    });
    return null;
  }

  // Session scans and project.queue.jsonl must describe the same project
  // totals; a mismatch means the session side is stale, duplicated or from a
  // different scan window, so splitting would invent attribution.
  const byProject = new Map();
  for (const candidate of candidates) {
    let totals = byProject.get(candidate.project_key);
    if (!totals) {
      totals = emptyFields();
      byProject.set(candidate.project_key, totals);
    }
    addFields(totals, candidate.fields);
  }
  for (const [projectKey, totals] of byProject) {
    const entry = projects.get(projectKey);
    if (!entry) continue;
    for (const field of TOKEN_FIELDS) {
      if (totals[field] !== entry[field]) {
        recordSkip(stats, group, "session_project_mismatch", {
          project_key: projectKey,
          field,
          session_total: totals[field],
          project_queue_total: entry[field],
        });
        return null;
      }
    }
  }

  // Split the project-level billable / conversation counters across the
  // models that the session assigned to that project.
  for (const [projectKey, entry] of projects) {
    const projectCandidates = candidates.filter((candidate) => candidate.project_key === projectKey);
    if (projectCandidates.length === 0) continue;
    const weights = projectCandidates.map((candidate) => candidate.fields.total_tokens);
    const billableStates = new Set(
      projectCandidates.map((candidate) =>
        mainRows.get(candidate.model).billable_total_tokens == null ? "null" : "number",
      ),
    );
    if (billableStates.size > 1) {
      recordSkip(stats, group, "mixed_billable_models", { project_key: projectKey });
      return null;
    }
    const mainBillable = mainRows.get(projectCandidates[0].model).billable_total_tokens;
    const billable = projectEntryBillable(entry, mainBillable);
    if (billable != null) {
      const parts = splitInteger(billable, weights);
      projectCandidates.forEach((candidate, index) => {
        candidate.fields.billable_total_tokens = parts[index];
      });
    }
    const conversations = splitInteger(entry.conversation_count, weights);
    projectCandidates.forEach((candidate, index) => {
      candidate.fields.conversation_count = conversations[index];
    });
    // Vendor credits are project-scoped and not model-scoped; keep them in the
    // residual instead of inventing a model split.
    projectCandidates.forEach((candidate) => {
      candidate.fields.credits = 0;
    });
  }

  const attributedByModel = new Map();
  for (const candidate of candidates) {
    let totals = attributedByModel.get(candidate.model);
    if (!totals) {
      totals = emptyFields();
      attributedByModel.set(candidate.model, totals);
    }
    addFields(totals, candidate.fields);
  }
  for (const [model, totals] of attributedByModel) {
    if (!fieldsAtMost(totals, mainRows.get(model))) {
      recordSkip(stats, group, "session_exceeds_main", {
        model,
        attributed_total_tokens: totals.total_tokens,
        main_total_tokens: mainRows.get(model).total_tokens,
      });
      return null;
    }
  }

  const rows = [];
  const projectDetails = [];
  candidates.sort((left, right) =>
    left.model.localeCompare(right.model) || left.project_key.localeCompare(right.project_key),
  );
  for (const candidate of candidates) {
    rows.push(makeRow(group, candidate.model, candidate.project_key, candidate.fields));
    projectDetails.push({
      model: candidate.model,
      project_key: candidate.project_key,
      total_tokens: candidate.fields.total_tokens,
    });
  }
  for (const [model, mainRow] of mainRows) {
    const residual = subtractFields(mainRow, attributedByModel.get(model) || emptyFields());
    rows.push(makeRow(group, model, "", residual));
  }
  return {
    rows,
    summary: {
      hour_start: group.hour_start,
      source: group.source,
      mode: "multi_model_session",
      models: [...mainRows.keys()],
      projects: projectDetails,
      residual_total_tokens: rows
        .filter((row) => row.project_key === "")
        .reduce((sum, row) => sum + row.total_tokens, 0),
    },
  };
}

function buildProjectBackfill({ queueRows = [], projectRows = [], sessionRows = [] } = {}) {
  const stats = {
    inputQueueRows: queueRows.length,
    inputProjectRows: projectRows.length,
    inputSessionRows: sessionRows.length,
    invalidMainRows: 0,
    invalidProjectRows: 0,
    invalidSessionRows: 0,
    mainBuckets: 0,
    mainGroups: 0,
    projectBuckets: 0,
    projectGroups: 0,
    sessionGroups: 0,
    consideredGroups: 0,
    emittedGroups: 0,
    projectRowsEmitted: 0,
    residualRowsEmitted: 0,
    zeroProjectRows: 0,
    skipped: 0,
    skipReasons: {},
    inputTotalTokens: 0,
    processedInputTotalTokens: 0,
    emittedTotalTokens: 0,
  };
  const skippedGroups = stats.skippedGroups = [];
  const groupsSummary = [];

  const mainGroups = buildMainGroups(queueRows, stats);
  const projectGroups = buildProjectGroups(projectRows, stats);
  const sessionIndex = buildSessionIndex(sessionRows, stats);
  stats.inputTotalTokens = [...mainGroups.values()].reduce(
    (sum, group) =>
      sum + [...group.models.values()].reduce((inner, row) => inner + row.total_tokens, 0),
    0,
  );

  for (const [key, projectGroup] of projectGroups) {
    stats.consideredGroups += 1;
    const mainGroup = mainGroups.get(key);
    if (!mainGroup) {
      recordSkip(stats, projectGroup, "no_main_aggregate");
      continue;
    }
    if (mainGroup.already_attributed) {
      recordSkip(stats, projectGroup, "already_attributed", { models: [...mainGroup.models.keys()] });
      continue;
    }
    const mainRows = mainGroup.models;
    const processed = mainGroup.models.size === 1
      ? processSingleModelGroup({
          group: mainGroup,
          mainRow: mainRows.values().next().value,
          projects: projectGroup.projects,
          stats,
        })
      : processMultiModelGroup({
          group: mainGroup,
          mainRows,
          projects: projectGroup.projects,
          sessionIndex,
          stats,
        });
    if (!processed) continue;

    // Hard invariant: the emitted rows reproduce the original aggregate.
    const byModel = new Map();
    for (const row of processed.rows) {
      const mainRow = mainRows.get(row.model);
      if (!mainRow) throw new Error(`Backfill emitted an unknown model ${row.model} for ${key}`);
      const total = byModel.get(row.model) || emptyFields();
      addFields(total, rowFields(row));
      byModel.set(row.model, total);
    }
    for (const [model, mainRow] of mainRows) {
      if (!fieldsEqual(byModel.get(model) || emptyFields(), mainRow)) {
        throw new Error(`Backfill invariant failed for ${key} model ${model}`);
      }
      stats.processedInputTotalTokens += mainRow.total_tokens;
    }

    stats.emittedGroups += 1;
    stats.rows = (stats.rows || []).concat(processed.rows);
    for (const row of processed.rows) {
      if (row.project_key) stats.projectRowsEmitted += 1;
      else stats.residualRowsEmitted += 1;
      stats.emittedTotalTokens += row.total_tokens;
    }
    groupsSummary.push(processed.summary);
  }

  if (stats.processedInputTotalTokens !== stats.emittedTotalTokens) {
    throw new Error(
      `Backfill token invariant failed: processed=${stats.processedInputTotalTokens} emitted=${stats.emittedTotalTokens}`,
    );
  }

  return {
    rows: stats.rows || [],
    stats,
    groups: groupsSummary,
    skippedGroups,
  };
}

module.exports = {
  buildProjectBackfill,
};
