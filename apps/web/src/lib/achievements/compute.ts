// Achievement computation — one pure, read-time pass over an account's
// history (docs/achievements-plan.md §3.4).
//
// The goal is only-up semantics: every tier is derived from a monotone metric,
// so appending new data can never take a tier away. Each scanner therefore
// returns the running value of its metric per local day; the tier timeline
// (`achieved_at`) is the first day that value crossed each threshold.
//
// `now` is injected by the caller so results are reproducible in tests and in
// the calibration run. Day boundaries, weekends and nights follow the caller's
// timezone via lib/account/series, matching the heatmap and sessions pages.

import type { AchievementProgress, AchievementsSnapshot } from "./types";

import {
  ACHIEVEMENTS,
  CACHE_ALCHEMY_MIN_DAY_TOKENS,
  TIERS,
  nextThreshold,
  tierForValue,
  type Achievement,
  type Thresholds,
  type TierKey,
} from "./catalog";

export type {
  AchievementProgress,
  AchievementsPayload,
  AchievementsSnapshot,
} from "./types";

import {
  numberOr0,
  zonedDayKey,
  zonedParts,
  type TzContext,
  type UsageRow,
} from "@/lib/account/series";
import { canonicalizeUsage } from "@/lib/account/usage";

const DAY_MS = 86_400_000;
/** Local hours counted as night: 00:00–05:59 (docs §2.2). */
const NIGHT_HOURS = new Set([0, 1, 2, 3, 4, 5]);
/** Sync results that count as a successful run for `sync_diligence`. */
const SYNC_SUCCESS_RESULTS = new Set(["ok", "partial"]);

export type DayPoint = {
  day: string;
  value: number;
};

export type AchievementsInput = {
  hourly: UsageRow[];
  sessionStates: UsageRow[];
  sessions: UsageRow[];
  syncRuns: UsageRow[];
  devices: UsageRow[];
  tzContext?: Partial<TzContext>;
  now: Date | string | number;
};

type DayAgg = {
  day: string;
  total: number;
  input: number;
  cached: number;
  cacheCreation: number;
  output: number;
  models: Set<string>;
  sources: Set<string>;
  night: boolean;
};

type SessionFact = {
  at: number;
  day: string;
  durationMs: number;
  project: string | null;
  tokens: number;
};

type DeviceFact = {
  id: string;
  /** Local day the device first appeared (paired or first bucket). */
  day: string;
};

type Timeline = {
  value: number;
  points: DayPoint[];
};

type History = {
  today: string;
  days: DayAgg[];
  firstDay: string | null;
  sessions: SessionFact[];
  syncDays: Set<string>;
  devices: DeviceFact[];
};

function dayToMs(day: string): number {
  return Date.parse(`${day}T00:00:00.000Z`);
}

function addDays(day: string, count: number): string {
  return new Date(dayToMs(day) + count * DAY_MS).toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return Math.round((dayToMs(to) - dayToMs(from)) / DAY_MS);
}

function isWeekend(day: string): boolean {
  const weekday = new Date(dayToMs(day)).getUTCDay();

  return weekday === 0 || weekday === 6;
}

function localDay(
  value: unknown,
  tzContext: Partial<TzContext>,
): string | null {
  const raw = String(value ?? "").trim();

  return raw ? zonedDayKey(raw, tzContext) : null;
}

function emptyDay(day: string): DayAgg {
  return {
    day,
    total: 0,
    input: 0,
    cached: 0,
    cacheCreation: 0,
    output: 0,
    models: new Set(),
    sources: new Set(),
    night: false,
  };
}

// Sessions come from token_sessions, which only exists for machine-level
// sources; rows of revoked devices stay in the window and are counted here on
// purpose (see the canonicalization note below).
function buildSessions(rows: UsageRow[], tzContext: Partial<TzContext>) {
  const facts: SessionFact[] = [];

  for (const row of rows) {
    const ended = Date.parse(String(row.ended_at ?? ""));
    const started = Date.parse(String(row.started_at ?? ""));
    const at = Number.isFinite(ended)
      ? ended
      : Number.isFinite(started)
        ? started
        : NaN;

    if (!Number.isFinite(at)) continue;
    const day = zonedDayKey(new Date(at), tzContext);

    if (!day) continue;
    facts.push({
      at,
      day,
      durationMs:
        Number.isFinite(ended) && Number.isFinite(started) && ended >= started
          ? ended - started
          : 0,
      project: String(row.project_key ?? "").trim() || null,
      tokens: numberOr0(row.total_tokens),
    });
  }

  return facts.sort((a, b) => a.at - b.at || a.day.localeCompare(b.day));
}

function buildSyncDays(rows: UsageRow[], tzContext: Partial<TzContext>) {
  const days = new Set<string>();

  for (const row of rows) {
    const result = String(row.result ?? "")
      .trim()
      .toLowerCase();

    if (!SYNC_SUCCESS_RESULTS.has(result)) continue;
    const day = localDay(row.started_at, tzContext);

    if (day) days.add(day);
  }

  return days;
}

// A device counts once it is paired, even if it never produced a bucket
// (docs §3.1: `usage.deviceRows` includes revoked and never-used devices).
// The achievement day is the earlier of the pairing day and the first bucket.
function buildDevices(
  rows: UsageRow[],
  canonicalRows: readonly UsageRow[],
  tzContext: Partial<TzContext>,
) {
  const earliest = new Map<string, string>();

  for (const row of canonicalRows) {
    if (!row.device_id) continue;
    const day = localDay(row.hour_start, tzContext);

    if (!day) continue;
    const id = String(row.device_id);
    const current = earliest.get(id);

    if (!current || day < current) earliest.set(id, day);
  }

  for (const device of rows) {
    const id = String(device.id ?? "").trim();

    if (!id) continue;
    const day = localDay(device.created_at, tzContext);

    if (!day) continue;
    const current = earliest.get(id);

    if (!current || day < current) earliest.set(id, day);
  }

  return Array.from(earliest.entries())
    .map(([id, day]) => ({ id, day }))
    .sort((a, b) => a.day.localeCompare(b.day) || a.id.localeCompare(b.id));
}

function buildHistory(
  input: AchievementsInput,
  tzContext: Partial<TzContext>,
  today: string,
): History {
  // The achievement set is deliberately canonicalized WITHOUT the active-device
  // filter: revoked machines keep their history here so a tier never drops,
  // which is the opposite of the Sessions page where revoking a device removes
  // it from the list. `cursor` dedupe and `trae-cn` session aggregation are
  // unchanged.
  const canonicalRows = canonicalizeUsage(
    input.hourly,
    input.sessionStates,
    null,
  );
  const byDay = new Map<string, DayAgg>();

  for (const row of canonicalRows) {
    const day = localDay(row.hour_start, tzContext);

    if (!day) continue;
    let agg = byDay.get(day);

    if (!agg) {
      agg = emptyDay(day);
      byDay.set(day, agg);
    }
    const total = numberOr0(row.total_tokens);

    agg.total += total;
    agg.input += numberOr0(row.input_tokens);
    agg.cached += numberOr0(row.cached_input_tokens);
    agg.cacheCreation += numberOr0(row.cache_creation_input_tokens);
    agg.output += numberOr0(row.output_tokens);
    agg.models.add(String(row.model ?? "").trim() || "unknown");
    agg.sources.add(
      String(row.source ?? "")
        .trim()
        .toLowerCase() || "unknown",
    );

    if (!agg.night && total > 0) {
      const parts = zonedParts(String(row.hour_start), tzContext);

      if (parts && NIGHT_HOURS.has(parts.hour)) agg.night = true;
    }
  }

  const days = Array.from(byDay.values()).sort((a, b) =>
    a.day.localeCompare(b.day),
  );

  return {
    today,
    days,
    firstDay: days.length > 0 ? days[0].day : null,
    sessions: buildSessions(input.sessions, tzContext),
    syncDays: buildSyncDays(input.syncRuns, tzContext),
    devices: buildDevices(input.devices, canonicalRows, tzContext),
  };
}

function cumulative(
  days: readonly DayAgg[],
  pick: (day: DayAgg) => number,
): Timeline {
  let sum = 0;
  const points: DayPoint[] = [];

  for (const day of days) {
    const amount = pick(day);

    if (amount <= 0) continue;
    sum += amount;
    points.push({ day: day.day, value: sum });
  }

  return { value: sum, points };
}

function runningMax(
  days: readonly DayAgg[],
  pick: (day: DayAgg) => number,
): Timeline {
  let best = 0;
  const points: DayPoint[] = [];

  for (const day of days) {
    const value = pick(day);

    if (value > best) {
      best = value;
      points.push({ day: day.day, value: best });
    }
  }

  return { value: best, points };
}

function distinct(
  days: readonly DayAgg[],
  pick: (day: DayAgg) => Iterable<string>,
): Timeline {
  const seen = new Set<string>();
  const points: DayPoint[] = [];

  for (const day of days) {
    let grew = false;

    for (const item of pick(day)) {
      if (seen.has(item)) continue;
      seen.add(item);
      grew = true;
    }
    if (grew) points.push({ day: day.day, value: seen.size });
  }

  return { value: seen.size, points };
}

// Calendar-day streaks run from the first qualifying day to the later of today
// and the last qualifying day, so a missing day (no rows at all) resets the
// count exactly like an inactive day does.
function longestStreak(activeDays: Iterable<string>, today: string): Timeline {
  const active = new Set(activeDays);

  if (active.size === 0) return { value: 0, points: [] };
  const sorted = Array.from(active).sort();
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const end = last > today ? last : today;
  let current = 0;
  let best = 0;
  const points: DayPoint[] = [];

  for (let day = first; day <= end; day = addDays(day, 1)) {
    current = active.has(day) ? current + 1 : 0;
    if (current > best) {
      best = current;
      points.push({ day, value: current });
    }
  }

  return { value: best, points };
}

function distinctProjects(facts: readonly SessionFact[]): Timeline {
  const seen = new Set<string>();
  const points: DayPoint[] = [];

  for (const fact of facts) {
    if (!fact.project || seen.has(fact.project)) continue;
    seen.add(fact.project);
    points.push({ day: fact.day, value: seen.size });
  }

  return { value: seen.size, points };
}

// Tokens per project accumulate over sessions; the metric is the running max
// over projects, which never shrinks because each project's total only grows.
function topProjectTokens(facts: readonly SessionFact[]): Timeline {
  const sums = new Map<string, number>();
  let best = 0;
  const points: DayPoint[] = [];

  for (const fact of facts) {
    if (!fact.project) continue;
    const next = (sums.get(fact.project) ?? 0) + fact.tokens;

    sums.set(fact.project, next);
    if (next > best) {
      best = next;
      points.push({ day: fact.day, value: next });
    }
  }

  return { value: best, points };
}

function longestSession(facts: readonly SessionFact[]): Timeline {
  let best = 0;
  const points: DayPoint[] = [];

  for (const fact of facts) {
    if (fact.durationMs <= best) continue;
    best = fact.durationMs;
    points.push({ day: fact.day, value: best });
  }

  return { value: best, points };
}

function distinctDevices(facts: readonly DeviceFact[]): Timeline {
  const seen = new Set<string>();
  const points: DayPoint[] = [];

  for (const fact of facts) {
    if (seen.has(fact.id)) continue;
    seen.add(fact.id);
    points.push({ day: fact.day, value: seen.size });
  }

  return { value: seen.size, points };
}

// "Days since the first record": the tier day is firstDay + N days, so the
// history replays identically no matter when the page is opened.
function daysSinceFirst(
  firstDay: string | null,
  today: string,
  thresholds: Thresholds,
): Timeline {
  if (!firstDay) return { value: 0, points: [] };
  const value = Math.max(0, daysBetween(firstDay, today));
  const points: DayPoint[] = [];

  for (const threshold of thresholds) {
    if (threshold > value) break;
    points.push({ day: addDays(firstDay, threshold), value: threshold });
  }

  return { value, points };
}

// `cached_input / (input + cached_input + cache_creation)`; output excluded.
function cacheHitRate(day: DayAgg): number {
  const denominator = day.input + day.cached + day.cacheCreation;

  return denominator > 0 ? day.cached / denominator : 0;
}

function measure(achievement: Achievement, history: History): Timeline {
  const { days, today } = history;

  switch (achievement.metric) {
    case "total_tokens":
      return cumulative(days, (day) => day.total);
    case "output_tokens":
      return cumulative(days, (day) => day.output);
    case "cached_input_tokens":
      return cumulative(days, (day) => day.cached);
    case "first_day_age_days":
      return daysSinceFirst(history.firstDay, today, achievement.thresholds);
    case "best_day_tokens":
      return runningMax(days, (day) => day.total);
    case "best_day_cache_hit_rate":
      return runningMax(days, (day) =>
        day.total >= CACHE_ALCHEMY_MIN_DAY_TOKENS ? cacheHitRate(day) : 0,
      );
    case "longest_session_duration":
      return longestSession(history.sessions);
    case "best_day_model_count":
      return runningMax(days, (day) => day.models.size);
    case "longest_streak":
      return longestStreak(
        days.filter((day) => day.total > 0).map((day) => day.day),
        today,
      );
    case "active_days":
      return cumulative(days, (day) => (day.total > 0 ? 1 : 0));
    case "weekend_days":
      return cumulative(days, (day) =>
        day.total > 0 && isWeekend(day.day) ? 1 : 0,
      );
    case "night_owl_days":
      return cumulative(days, (day) => (day.night ? 1 : 0));
    case "distinct_models":
      return distinct(days, (day) => day.models);
    case "distinct_sources":
      return distinct(days, (day) => day.sources);
    case "distinct_projects":
      return distinctProjects(history.sessions);
    case "top_project_tokens":
      return topProjectTokens(history.sessions);
    case "distinct_devices":
      return distinctDevices(history.devices);
    case "sync_streak":
      return longestStreak(history.syncDays, today);
    default:
      return { value: 0, points: [] };
  }
}

function achievedAtFor(
  points: readonly DayPoint[],
  thresholds: Thresholds,
): Record<TierKey, string | null> {
  const achieved: Record<TierKey, string | null> = {
    bronze: null,
    silver: null,
    gold: null,
    diamond: null,
    king: null,
  };
  let index = 0;

  for (const point of points) {
    while (index < TIERS.length && point.value >= thresholds[index]) {
      achieved[TIERS[index].key] = point.day;
      index += 1;
    }
    if (index >= TIERS.length) break;
  }

  return achieved;
}

export function computeAchievements(
  input: AchievementsInput,
): AchievementsSnapshot {
  const nowMs =
    input.now instanceof Date
      ? input.now.getTime()
      : new Date(input.now).getTime();

  if (!Number.isFinite(nowMs)) {
    throw new TypeError("computeAchievements: `now` must be a valid date");
  }
  const now = new Date(nowMs);
  const tzContext = input.tzContext ?? {};
  const today = zonedDayKey(now, tzContext);

  if (!today) {
    throw new TypeError(
      "computeAchievements: unable to resolve the local day of `now`",
    );
  }
  const history = buildHistory(input, tzContext, today);
  const achievements: AchievementProgress[] = ACHIEVEMENTS.map(
    (achievement) => {
      const timeline = measure(achievement, history);

      return {
        id: achievement.id,
        category: achievement.category,
        unit: achievement.unit,
        tier: tierForValue(achievement.thresholds, timeline.value),
        value: timeline.value,
        thresholds: achievement.thresholds,
        next_threshold: nextThreshold(achievement.thresholds, timeline.value),
        achieved_at: achievedAtFor(timeline.points, achievement.thresholds),
      };
    },
  );

  return { generated_at: now.toISOString(), achievements };
}
