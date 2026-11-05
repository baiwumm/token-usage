// Exact bucket caliber for the projects page (docs/projects-page-plan.md §5
// 批次 4): aggregate token_usage_hourly rows by project_key. It runs beside
// /api/app/projects (the session caliber, unchanged) so the page can switch
// without touching the existing data path.
//
// Double-count protection: a batch-3 CLI splits one (source, model, hour)
// aggregate into one row per project plus a residual row under project_key
// "" (contract v2 §2.4). Project rows therefore already exclude the residual,
// and the "" bucket is surfaced as the pinned unattributed group — never
// merged into a project's totals. Summing every row still equals the
// dashboard's whole-table total (mixed windows included: pre-batch-3 rows
// carry the full aggregate under "").
//
// Coverage caveats (mirrored by the in-page scope note): every source that
// uploads hourly buckets is represented, including account-level (credits)
// sources; cursor / trae-cn rows carry no project_key and land in
// unattributed.

import { loadAccountUsage } from "./account-data";
import { jsonResponse } from "./http";
import {
  addDays,
  dayStartIso,
  groupKeyOf,
  projectTotalsOf,
  resolveLimit,
  resolveOffset,
  resolveSort,
  resolveWindow,
  splitProjectGroups,
  toWire,
  type ProjectGroup,
} from "./projects";

import { numberOr0, parseTzContext, zonedDayKey } from "@/lib/account/series";
import { computeRowCost } from "@/lib/pricing";

const DAY_MS = 86_400_000;

export async function projectsHourlyPayloadForUser(
  userId: string,
  searchParams: URLSearchParams,
  now: Date = new Date(),
): Promise<Response> {
  const tzContext = parseTzContext(searchParams);
  const window = resolveWindow(searchParams, tzContext, now);

  if ("error" in window) return jsonResponse(400, { error: window.error });
  const sort = resolveSort(searchParams);

  if (sort == null) return jsonResponse(400, { error: "Invalid sort" });
  const limit = resolveLimit(searchParams);
  const offset = resolveOffset(searchParams);
  const { from, to } = window;
  const fromMs = Date.parse(dayStartIso(from, tzContext));
  const toMs = Date.parse(dayStartIso(addDays(to, 1), tzContext));
  const days =
    Math.round(
      (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
        DAY_MS,
    ) + 1;

  const emptyPayload = {
    from,
    to,
    days,
    total: 0,
    limit,
    offset,
    totals: {
      attributed_tokens: 0,
      unattributed_tokens: 0,
      unattributed_sessions: 0,
      total_cost_usd: "0.000000",
      credits: 0,
    },
    filtered_zero_usage_projects: 0,
    caliber: "hourly",
    projects: [],
  };

  // Bucket semantics: absolute [from, to) instants on hour_start, revoked
  // devices excluded wholesale — the same window and device rules as the
  // session caliber so the two payloads line up.
  // Use the canonical account rows, not the raw hourly table: cursor is
  // account-level (one row per device is a duplicate, not extra usage) and
  // trae-cn's hourly rows are replaced by its session states. The raw table
  // made this page's total disagree with the dashboard; canonicalizeUsage is
  // the single caliber every other view already uses.
  const { canonicalRows } = await loadAccountUsage(userId);
  const groups = new Map<string | null, ProjectGroup>();

  for (const row of canonicalRows) {
    const hourStart = String(row.hour_start ?? "");
    const hourMs = Date.parse(hourStart);

    if (!Number.isFinite(hourMs) || hourMs < fromMs || hourMs >= toMs) continue;
    const dayKey = zonedDayKey(hourStart, tzContext);

    if (!dayKey) continue;
    const key = groupKeyOf(row);
    let group = groups.get(key);

    if (!group) {
      group = {
        key,
        totalTokens: 0,
        costUsd: 0,
        credits: 0,
        sessionCount: 0,
        lastActiveMs: 0,
        lastActive: null,
        dayTokens: new Map(),
        sourceTokens: new Map(),
      };
      groups.set(key, group);
    }
    const tokens = numberOr0(row.total_tokens);
    const sourceLabel = String(row.source ?? "").trim() || "unknown";

    group.totalTokens += tokens;
    group.sourceTokens.set(
      sourceLabel,
      (group.sourceTokens.get(sourceLabel) ?? 0) + tokens,
    );
    // Same read-time pricing engine as the dashboard/session series: the
    // persisted bucket total_cost_usd is a legacy 0 in production, so the
    // column must be re-costed per row (computeRowCost honours grok/cline
    // provider-reported costs and DeepSeek off-peak tiers).
    group.costUsd += computeRowCost(row);
    group.credits += numberOr0(row.credits);
    // Hourly buckets carry per-bucket conversation counts, not session
    // identity; the sum is surfaced as "bucket entries", not distinct
    // sessions (there is no session dimension in this table).
    group.sessionCount += numberOr0(row.conversations);
    group.dayTokens.set(dayKey, (group.dayTokens.get(dayKey) ?? 0) + tokens);
    if (hourMs > group.lastActiveMs) {
      group.lastActiveMs = hourMs;
      group.lastActive = hourStart;
    }
  }

  if (groups.size === 0) return jsonResponse(200, emptyPayload);

  const { attributed, unattributed, attributedTokens, filteredZeroUsage } =
    splitProjectGroups(groups.values());

  const valueOf = (group: ProjectGroup): number =>
    sort === "cost" ? group.costUsd : group.totalTokens;

  attributed.sort(
    (first, second) =>
      valueOf(second) - valueOf(first) ||
      ((first.key ?? "") < (second.key ?? "")
        ? -1
        : (first.key ?? "") > (second.key ?? "")
          ? 1
          : 0),
  );
  // The unattributed group always sinks to the bottom, regardless of sort.
  const ordered = unattributed ? [...attributed, unattributed] : attributed;
  const page = ordered.slice(offset, offset + limit).map(toWire);

  return jsonResponse(200, {
    from,
    to,
    days,
    total: ordered.length,
    limit,
    offset,
    totals: {
      attributed_tokens: attributedTokens,
      unattributed_tokens: unattributed?.totalTokens ?? 0,
      unattributed_sessions: unattributed?.sessionCount ?? 0,
      ...projectTotalsOf(groups.values()),
    },
    filtered_zero_usage_projects: filteredZeroUsage,
    caliber: "hourly",
    projects: page,
  });
}
