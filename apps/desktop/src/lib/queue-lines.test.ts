import { describe, expect, it } from "vitest";

import {
  aggregateQueue,
  localDayStartMs,
  parseQueueLine,
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
      totalTokens: 150,
      billableTotalTokens: 150,
      conversationCount: 2,
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

describe("aggregateQueue", () => {
  it("sums buckets inside the window with a source breakdown", () => {
    const text = [ROW_A, ROW_B, ROW_OLD]
      .map((r) => JSON.stringify(r))
      .join("\n");
    const usage = aggregateQueue(text, NOW - 24 * 3600e3, NOW);

    expect(usage.totalTokens).toBe(1150);
    expect(usage.conversations).toBe(3);
    expect(usage.sources).toEqual([
      { source: "claude", tokens: 1000, conversations: 1, share: 1000 / 1150 },
      { source: "codex", tokens: 150, conversations: 2, share: 150 / 1150 },
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
    });
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
