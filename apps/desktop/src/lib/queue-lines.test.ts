import { describe, expect, it } from "vitest";

import {
  aggregateDayRows,
  aggregateHourRows,
  aggregateMonthRows,
  aggregateQueue,
  aggregateQueueDays,
  localDayKey,
  localDayStartMs,
  parseQueueLine,
  rowCostUsd,
} from "@/lib/queue-lines";

const ROW_A = {
  source: "codex",
  model: "deepseek-v4-flash",
  hour_start: "2026-11-08T01:00:00.000Z",
  input_tokens: 100,
  cached_input_tokens: 0,
  cache_creation_input_tokens: 0,
  output_tokens: 50,
  reasoning_output_tokens: 10,
  total_tokens: 150,
  billable_total_tokens: 150,
  total_cost_usd: 0,
  conversation_count: 2,
};

const ROW_B = {
  source: "claude",
  model: "claude-opus-4",
  hour_start: "2026-11-08T05:30:00.000Z",
  input_tokens: 0,
  cached_input_tokens: 0,
  cache_creation_input_tokens: 0,
  output_tokens: 1000,
  reasoning_output_tokens: 0,
  total_tokens: 1000,
  conversation_count: 1,
};

const ROW_OLD = {
  source: "codex",
  model: "old-model",
  hour_start: "2026-10-01T00:00:00.000Z",
  total_tokens: 99999,
  conversation_count: 5,
};

// v2 contract lines carry project_key; pre-v2 lines don't (the field is
// optional on the wire and defaults to "").
const ROW_PROJECT = {
  ...ROW_B,
  source: "zcode",
  model: "glm-5",
  hour_start: "2026-11-08T09:00:00.000Z",
  input_tokens: 300,
  output_tokens: 100,
  total_tokens: 400,
  project_key: "token-usage",
  conversation_count: 3,
};

const NOW = Date.parse("2026-11-08T12:00:00.000Z");

describe("parseQueueLine", () => {
  it("parses a full bucket line", () => {
    expect(parseQueueLine(`${JSON.stringify(ROW_A)}`)).toEqual({
      source: "codex",
      model: "deepseek-v4-flash",
      hourStart: "2026-11-08T01:00:00.000Z",
      projectKey: "",
      inputTokens: 100,
      cachedInputTokens: 0,
      cacheCreationInputTokens: 0,
      outputTokens: 50,
      reasoningOutputTokens: 10,
      totalTokens: 150,
      billableTotalTokens: 150,
      totalCostUsd: 0,
      conversationCount: 2,
      credits: 0,
    });
  });

  it("defaults missing project_key and billable fields", () => {
    const row = parseQueueLine(`${JSON.stringify(ROW_B)}`);

    expect(row?.projectKey).toBe("");
    expect(row?.billableTotalTokens).toBeNull();
  });

  it("rejects lines without a valid hour_start/source/model", () => {
    expect(parseQueueLine("not json")).toBeNull();
    expect(parseQueueLine('{"source":"codex"}')).toBeNull();
    expect(
      parseQueueLine('{"source":"codex","model":"m","hour_start":"bogus"}'),
    ).toBeNull();
  });
});

describe("rowCostUsd (read-time pricing)", () => {
  it("costs rows the collector reported as zero", () => {
    const row = parseQueueLine(JSON.stringify(ROW_B))!;

    // claude-opus-4: $75 / MTok output for 1000 output tokens.
    expect(rowCostUsd(row)).toBeCloseTo(0.075, 6);
  });

  it("keeps an authoritative positive reporter cost untouched", () => {
    const row = parseQueueLine(
      JSON.stringify({
        ...ROW_B,
        source: "grok",
        model: "grok-4",
        total_cost_usd: 0.5,
      }),
    )!;

    expect(rowCostUsd(row)).toBe(0.5);
  });

  it("keeps free SKUs at zero (opencode *-free rule)", () => {
    const row = parseQueueLine(
      JSON.stringify({
        ...ROW_B,
        source: "opencode",
        model: "step-5-preview-free",
      }),
    )!;

    expect(rowCostUsd(row)).toBe(0);
  });
});

describe("aggregateQueue", () => {
  it("sums buckets inside the window with a source breakdown", () => {
    const text = [ROW_A, ROW_B, ROW_OLD]
      .map((r) => JSON.stringify(r))
      .join("\n");
    const usage = aggregateQueue(text, NOW - 24 * 3600e3, NOW);

    expect(usage.totalTokens).toBe(1150);
    expect(usage.conversations).toBe(3);
    expect(usage.sources).toEqual([
      {
        source: "claude",
        tokens: 1000,
        conversations: 1,
        share: 1000 / 1150,
        totalCostUsd: 0.075,
      },
      {
        source: "codex",
        tokens: 150,
        conversations: 2,
        share: 150 / 1150,
        totalCostUsd: 0.000055,
      },
    ]);
  });

  it("applies last-wins per bucket key (hour, source, model, project)", () => {
    const updated = { ...ROW_A, total_tokens: 300, conversation_count: 4 };
    const text = [ROW_A, ROW_B, updated]
      .map((r) => JSON.stringify(r))
      .join("\n");
    const usage = aggregateQueue(text, NOW - 24 * 3600e3, NOW);

    expect(usage.totalTokens).toBe(1300);
    expect(usage.conversations).toBe(5);
  });

  it("treats different project_key buckets as separate rows", () => {
    const otherProject = { ...ROW_PROJECT, project_key: "other-app" };
    const text = [ROW_PROJECT, otherProject]
      .map((r) => JSON.stringify(r))
      .join("\n");
    const usage = aggregateQueue(text, NOW - 24 * 3600e3, NOW);

    expect(usage.totalTokens).toBe(800);
  });

  it("drops buckets outside the window after dedup", () => {
    const text = [ROW_OLD, ROW_B].map((r) => JSON.stringify(r)).join("\n");

    expect(aggregateQueue(text, NOW - 24 * 3600e3, NOW).totalTokens).toBe(1000);
  });

  it("tolerates torn tail lines", () => {
    const text = `${JSON.stringify(ROW_B)}\n${JSON.stringify(ROW_B).slice(0, 40)}`;

    expect(aggregateQueue(text, NOW - 24 * 3600e3, NOW).totalTokens).toBe(1000);
  });

  it("handles project_key rows and empty text", () => {
    const text = [ROW_PROJECT].map((r) => JSON.stringify(r)).join("\n");
    const usage = aggregateQueue(text, NOW - 24 * 3600e3, NOW);

    expect(usage.totalTokens).toBe(400);
    expect(usage.sources[0]?.source).toBe("zcode");
    expect(usage.sources[0]?.share).toBe(1);
    expect(aggregateQueue("", 0, NOW)).toEqual({
      totalTokens: 0,
      conversations: 0,
      sources: [],
      models: [],
      projects: [],
      attributedTokens: 0,
      totalCostUsd: 0,
      inputTokens: 0,
      cachedInputTokens: 0,
      cacheCreationInputTokens: 0,
      outputTokens: 0,
      reasoningOutputTokens: 0,
      credits: 0,
      cacheRate: 0,
    });
  });

  it("breaks the window down by model with shares of the window total", () => {
    const text = [ROW_A, ROW_B, ROW_PROJECT]
      .map((r) => JSON.stringify(r))
      .join("\n");
    const usage = aggregateQueue(text, NOW - 24 * 3600e3, NOW);

    expect(usage.models).toEqual([
      {
        model: "claude-opus-4",
        tokens: 1000,
        conversations: 1,
        share: 1000 / 1550,
        totalCostUsd: 0.075,
      },
      {
        model: "glm-5",
        tokens: 400,
        conversations: 3,
        share: 400 / 1550,
        totalCostUsd: 0.00062,
      },
      {
        model: "deepseek-v4-flash",
        tokens: 150,
        conversations: 2,
        share: 150 / 1550,
        totalCostUsd: 0.000055,
      },
    ]);
  });

  it("lists only attributed projects and tracks the residual", () => {
    const otherProject = {
      ...ROW_PROJECT,
      project_key: "other-app",
      input_tokens: 75,
      output_tokens: 25,
      total_tokens: 100,
    };
    const text = [ROW_A, ROW_PROJECT, otherProject]
      .map((r) => JSON.stringify(r))
      .join("\n");
    const usage = aggregateQueue(text, NOW - 24 * 3600e3, NOW);

    expect(usage.totalTokens).toBe(650);
    expect(usage.attributedTokens).toBe(500);
    expect(usage.projects).toEqual([
      {
        projectKey: "token-usage",
        tokens: 400,
        conversations: 3,
        share: 400 / 650,
        totalCostUsd: 0.00062,
        lastActiveMs: expect.any(Number),
        sourceTokens: { zcode: 400 },
      },
      {
        projectKey: "other-app",
        tokens: 100,
        conversations: 3,
        share: 100 / 650,
        totalCostUsd: 0.000155,
        lastActiveMs: expect.any(Number),
        sourceTokens: { zcode: 100 },
      },
    ]);
  });
});

describe("aggregateQueueDays", () => {
  it("sums the deduped rows of a local day with their sources", () => {
    const text = [ROW_A, ROW_B].map((row) => JSON.stringify(row)).join("\n");
    const key = localDayKey(Date.parse(ROW_A.hour_start));

    expect(aggregateQueueDays(text, NOW - 24 * 3600e3, NOW).get(key)).toEqual({
      day: key,
      tokens: 1150,
      conversations: 3,
      costUsd: 0.075055,
      cacheTokens: 0,
      inputTokens: 100,
      outputTokens: 1050,
      sources: { codex: 150, claude: 1000 },
    });
  });

  it("drops buckets outside the window", () => {
    const text = JSON.stringify(ROW_OLD);

    expect(aggregateQueueDays(text, NOW - 10 * 24 * 3600e3, NOW).size).toBe(0);
  });

  it("formats local day keys as YYYY-MM-DD", () => {
    expect(localDayKey(Date.parse("2026-01-02T01:00:00.000Z"))).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    );
  });
});

describe("bucket folds", () => {
  const rows = [ROW_A, ROW_B].map((row) =>
    parseQueueLine(JSON.stringify(row))!,
  );

  it("folds rows by local hour with cost and composition splits", () => {
    const hours = aggregateHourRows(rows, NOW - 24 * 3600e3, NOW);
    // Keys are the bucket's LOCAL hour-of-day; sum over whatever the zone
    // produces so the assertion stays timezone-independent.
    const byTokens = [...hours.entries()].sort(
      (first, second) => second[1].tokens - first[1].tokens,
    );
    const [biggest, smallest] = byTokens;

    expect(biggest[1]).toMatchObject({
      tokens: 1000,
      costUsd: 0.075,
      inputTokens: 0,
      outputTokens: 1000,
    });
    expect(smallest[1]).toMatchObject({
      tokens: 150,
      costUsd: 0.000055,
      inputTokens: 100,
      outputTokens: 50,
    });
  });

  it("folds rows by local month", () => {
    const months = aggregateMonthRows(rows, NOW - 24 * 3600e3, NOW);

    expect([...months.keys()]).toEqual(["2026-11"]);
    expect(months.get("2026-11")?.tokens).toBe(1150);
  });

  it("row-level day fold shares the aggregateQueue cost caliber", () => {
    const key = localDayKey(Date.parse(ROW_A.hour_start));
    const days = aggregateDayRows(rows, NOW - 24 * 3600e3, NOW);

    expect(days.get(key)?.costUsd).toBeCloseTo(0.075055, 6);
  });
});

describe("localDayStartMs", () => {
  it("lands on local midnight", () => {
    const start = localDayStartMs(NOW);
    const day = new Date(start);

    expect(day.getHours()).toBe(0);
    expect(day.getMinutes()).toBe(0);
    expect(day.getSeconds()).toBe(0);
    expect(day.getMilliseconds()).toBe(0);
  });
});
