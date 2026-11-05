// Server-side loader for /u/<token> (docs/badge.md §4.7 / §6). Everything is
// service-role SSR: no /api/app call, no new deployment function, and no
// second full-pull path — loadAccountUsage is already single-flighted and is
// also what loadBadgeData uses for the account badge.
//
// 2026-11-05 second pass: the heatmap and achievements are always published
// (no per-user switches), the repository subsection is gone, and the owner
// avatar is inlined from the same loader the SVG badge uses.

import type { BadgeOwner } from "@/lib/badge/data";
import type { HeatmapPayload } from "@/lib/dashboard/api";
import type { PublicPageData } from "./types";

import {
  getPublicPageCache,
  publicPageCacheKey,
  setPublicPageCache,
} from "./cache";
import { assemblePublicPageData } from "./project";

import { loadAccountUsage } from "@/lib/api/account-data";
import {
  dayTotalsFromHourly,
  loadBadgeAvatar,
  loadBadgeData,
} from "@/lib/badge/data";
import { heatmapCells, rowCost, zonedDayKey } from "@/lib/account/series";
import { loadAchievementsSnapshot } from "@/lib/achievements/payload";
import { modelGroupKey } from "@/lib/model-names";

const HEATMAP_WEEKS = 52;
const DAY_MS = 86_400_000;

function latestUpdatedAt(rows: Record<string, unknown>[]): string | null {
  let latest: string | null = null;

  for (const row of rows) {
    const value = String(row.updated_at ?? "");

    if (value && (!latest || value > latest)) latest = value;
  }

  return latest;
}

/** Same 52-week, owner-timezone window the dashboard heatmap endpoint uses. */
function buildHeatmap(
  rows: Record<string, unknown>[],
  owner: BadgeOwner,
  now: Date,
): HeatmapPayload {
  const tzContext = { timeZone: owner.timezone, offsetMinutes: null };
  const to = zonedDayKey(now, tzContext) ?? now.toISOString().slice(0, 10);
  const from = new Date(
    Date.parse(`${to}T00:00:00Z`) - (HEATMAP_WEEKS * 7 - 1) * DAY_MS,
  )
    .toISOString()
    .slice(0, 10);
  const { cells, totalCostUsd } = heatmapCells(rows, { from, to, tzContext });
  const weeks = [];

  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7));
  }

  return {
    from,
    to,
    week_starts_on: "mon",
    active_days: cells.filter((cell) => cell.billable_total_tokens > 0).length,
    streak_days: 0,
    weeks,
    total_cost_usd: totalCostUsd,
  };
}

async function buildPublicPageData(
  owner: BadgeOwner,
  now: Date,
): Promise<PublicPageData> {
  const [account, usage, snapshot, avatarDataUri] = await Promise.all([
    loadBadgeData(
      owner.userId,
      { displayName: owner.displayName, timezone: owner.timezone },
      "user",
      null,
      "all",
    ),
    loadAccountUsage(owner.userId),
    loadAchievementsSnapshot(
      owner.userId,
      { timeZone: owner.timezone, offsetMinutes: null },
      now,
    ),
    loadBadgeAvatar(owner.userId),
  ]);
  const rows = usage.canonicalRows;
  const sources = new Set<string>();
  const models = new Set<string>();
  const modelCosts: Record<string, number> = {};

  for (const row of rows) {
    sources.add(String(row.source ?? "").trim() || "unknown");
    const key = modelGroupKey(String(row.model ?? ""));

    models.add(key);
    // Same read-time pricing as the badge's account total (§4.1); keyed by
    // the same group key as BadgeData.models so the list can join them.
    modelCosts[key] = (modelCosts[key] ?? 0) + rowCost(row);
  }

  return assemblePublicPageData({
    account,
    heatmap: buildHeatmap(rows, owner, now),
    achievements: snapshot.achievements,
    avatarDataUri,
    timezone: owner.timezone,
    dayTotals: dayTotalsFromHourly(rows, owner.timezone),
    sourceCount: sources.size,
    modelCount: models.size,
    modelCosts,
    updatedAt: latestUpdatedAt(rows),
  });
}

export function loadPublicPageData(
  owner: BadgeOwner,
  now: Date = new Date(),
): Promise<PublicPageData> {
  const key = publicPageCacheKey(owner.userId);
  const hit = getPublicPageCache<PublicPageData>(key);

  if (hit) return hit;

  const promise = buildPublicPageData(owner, now);

  setPublicPageCache(key, promise);

  return promise;
}
