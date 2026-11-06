// Deterministic demo data for the /projects review mode. It never touches an
// API and is always labelled as demo data in the UI. Keeping the series shared
// between the list and the detail payload makes every number reconcile.

import type {
  ProjectDetailDay,
  ProjectDetailPayload,
  ProjectItem,
  ProjectsCaliber,
  ProjectsPayload,
} from "@/lib/dashboard/api";

const DEMO_PROJECTS = [
  "atlas-api",
  "nebula-web",
  "margin-console",
  "easy-api",
  "tree-view-kit",
  "partner-portal",
  "admin-kit",
  "ledger",
  "free-for-dev",
  "tracker",
] as const;

const DEMO_SOURCES = [
  "opencode",
  "zcode",
  "claude-code",
  "codex",
  "workbuddy",
  "qoder-cn",
] as const;

const DAY_MS = 86_400_000;

function daysBetween(from: string, to: string): string[] {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  const count = Math.max(
    1,
    Math.min(60, Math.round((end - start) / DAY_MS) + 1),
  );
  const keys: string[] = [];

  for (let index = 0; index < count; index += 1) {
    keys.push(new Date(start + index * DAY_MS).toISOString().slice(0, 10));
  }

  return keys;
}

function wave(seed: number, index: number): number {
  const value = Math.sin((index + 1) * 0.83 + seed * 1.7) + 1;

  return 0.25 + value * 0.75;
}

/** Stable per-project daily series, including zero-activity days. */
function demoDaily(seed: number, from: string, to: string): ProjectDetailDay[] {
  const scale = 14_000_000 / (10 - seed * 0.6);

  return daysBetween(from, to).map((date, index) => {
    const active = (index + seed) % 7 !== 3;
    const total = active ? Math.round(scale * wave(seed, index)) : 0;
    const sources: Record<string, number> = {};

    if (total > 0) {
      let remaining = total;

      DEMO_SOURCES.forEach((source, sourceIndex) => {
        const share = sourceIndex === 0 ? 0.5 : sourceIndex === 1 ? 0.34 : 0.04;
        const value =
          sourceIndex === DEMO_SOURCES.length - 1
            ? remaining
            : Math.round(total * share);

        sources[source] = Math.max(0, value);
        remaining -= Math.max(0, value);
      });
    }

    return {
      date,
      total_tokens: total,
      conversation_count: active
        ? Math.round(6 + wave(seed, index + 3) * 22)
        : 0,
      total_cost_usd: ((total / 1_000_000) * 0.031).toFixed(6),
      sources,
    };
  });
}

function sumTokens(daily: ProjectDetailDay[]): number {
  return daily.reduce((sum, day) => sum + day.total_tokens, 0);
}

function costOf(tokens: number): string {
  return ((tokens / 1_000_000) * 0.031).toFixed(6);
}

function totalsOf(daily: ProjectDetailDay[], tokens: number) {
  return {
    total_tokens: tokens,
    input_tokens: Math.round(tokens * 0.031),
    cached_input_tokens: Math.round(tokens * 0.918),
    cache_creation_input_tokens: Math.round(tokens * 0.002),
    output_tokens: Math.round(tokens * 0.016),
    reasoning_output_tokens: Math.round(tokens * 0.033),
    conversation_count: daily.reduce(
      (sum, day) => sum + day.conversation_count,
      0,
    ),
    total_cost_usd: costOf(tokens),
    credits: 0,
  };
}

function sourcesOf(daily: ProjectDetailDay[]): string[] {
  const totals = new Map<string, number>();

  for (const day of daily) {
    for (const [source, value] of Object.entries(day.sources)) {
      totals.set(source, (totals.get(source) ?? 0) + value);
    }
  }

  return [...totals.entries()]
    .sort(
      (first, second) =>
        second[1] - first[1] || first[0].localeCompare(second[0]),
    )
    .map(([source]) => source);
}

function peakOf(
  daily: ProjectDetailDay[],
): { date: string; total_tokens: number } | null {
  let peak: { date: string; total_tokens: number } | null = null;

  for (const day of daily) {
    if (
      peak == null ||
      day.total_tokens > peak.total_tokens ||
      (day.total_tokens === peak.total_tokens && day.date < peak.date)
    ) {
      peak = { date: day.date, total_tokens: day.total_tokens };
    }
  }

  return peak;
}

function demoTotals(from: string, to: string) {
  return DEMO_PROJECTS.map((name, index) => ({
    name,
    daily: demoDaily(index, from, to),
    tokens: 0,
  })).map((entry) => ({ ...entry, tokens: sumTokens(entry.daily) }));
}

const UNATTRIBUTED_KEY = "__unattributed";

export function demoProjectsPayload(
  from: string,
  to: string,
  caliber: ProjectsCaliber,
): ProjectsPayload {
  const entries = demoTotals(from, to);
  const projects: ProjectItem[] = entries.map(({ name, daily, tokens }) => ({
    project_key: name,
    name,
    total_tokens: tokens,
    total_cost_usd: costOf(tokens),
    session_count: daily.reduce((sum, day) => sum + day.conversation_count, 0),
    day_peak: peakOf(daily),
    last_active: `${to}T21:40:00.000Z`,
    sources: sourcesOf(daily),
  }));
  const unattributedTokens = 39_100_000;

  projects.sort((first, second) => second.total_tokens - first.total_tokens);
  projects.push({
    project_key: null,
    name: null,
    total_tokens: unattributedTokens,
    total_cost_usd: costOf(unattributedTokens),
    session_count: 41,
    day_peak: { date: to, total_tokens: 8_100_000 },
    last_active: `${to}T18:02:00.000Z`,
    sources: ["cursor", "trae-cn"],
  });

  const attributedTokens = entries.reduce(
    (sum, entry) => sum + entry.tokens,
    0,
  );
  const totalTokens = attributedTokens + unattributedTokens;

  return {
    from,
    to,
    days: daysBetween(from, to).length,
    total: projects.length,
    attributed_projects: entries.length,
    limit: 200,
    offset: 0,
    caliber,
    totals: {
      attributed_tokens: attributedTokens,
      unattributed_tokens: unattributedTokens,
      unattributed_sessions: 41,
      attributed_cost_usd: costOf(attributedTokens),
      total_cost_usd: costOf(totalTokens),
      credits: 12.5,
    },
    filtered_zero_usage_projects: 3,
    projects,
  };
}

export function demoDetailPayload(
  key: string | null,
  from: string,
  to: string,
  caliber: ProjectsCaliber,
): ProjectDetailPayload {
  const index =
    key == null
      ? -1
      : DEMO_PROJECTS.indexOf(key as (typeof DEMO_PROJECTS)[number]);
  const seed = index < 0 ? 9 : index;
  const daily = demoDaily(seed, from, to);
  const tokens = sumTokens(daily);
  const entries = demoTotals(from, to);
  const rangeTotal =
    entries.reduce((sum, entry) => sum + entry.tokens, 0) + 39_100_000;
  const sourceMap = new Map<
    string,
    { total_tokens: number; conversation_count: number; days_active: number }
  >();

  for (const day of daily) {
    for (const [source, value] of Object.entries(day.sources)) {
      const current = sourceMap.get(source) ?? {
        total_tokens: 0,
        conversation_count: 0,
        days_active: 0,
      };

      current.total_tokens += value;
      if (value > 0) current.days_active += 1;
      sourceMap.set(source, current);
    }
  }
  for (const [source, current] of sourceMap) {
    current.conversation_count = Math.round(current.total_tokens / 1_900_000);
    if (source === "qoder-cn") current.conversation_count = 0;
  }

  const sources = [...sourceMap.entries()]
    .map(([source, value]) => ({
      source,
      total_tokens: value.total_tokens,
      conversation_count: value.conversation_count,
      days_active: value.days_active,
      total_cost_usd: costOf(value.total_tokens),
    }))
    .sort(
      (first, second) =>
        second.total_tokens - first.total_tokens ||
        first.source.localeCompare(second.source),
    );

  return {
    from,
    to,
    days: daysBetween(from, to).length,
    caliber,
    project_key: index < 0 ? null : (key as string),
    totals: totalsOf(daily, tokens),
    range_total_tokens: rangeTotal,
    days_active: daily.filter((day) => day.total_tokens > 0).length,
    daily,
    sources,
  };
}

export const DEMO_UNATTRIBUTED_KEY = UNATTRIBUTED_KEY;
