import { describe, expect, it } from "vitest";

import {
  DEFAULT_PAGE_SIZE,
  aggregateSessions,
  buildSessionsCsv,
  filterSessions,
  pageSessions,
  parseSessionRows,
  sessionRangeWindow,
  sessionSourceFacets,
} from "@/lib/sessions";

const NOW = Date.parse("2026-11-12T12:00:00.000Z");

/** A zcode-shaped row: counters nested under `tokens`, flat model_usage. */
function row(overrides: Record<string, unknown> = {}) {
  return {
    version: 26,
    session_hash: "hash-1",
    session_id: "sess-1",
    source: "zcode",
    project_key: "token-usage",
    project_ref: "E:\\secret\\path",
    title: "should never surface",
    model: "glm-5.3",
    started_at: "2026-11-12T09:00:00.000Z",
    ended_at: "2026-11-12T10:00:00.000Z",
    total_tokens: 1200,
    tokens: {
      input_tokens: 800,
      cached_input_tokens: 200,
      cache_creation_input_tokens: 100,
      output_tokens: 100,
      reasoning_output_tokens: 0,
      total_tokens: 1200,
    },
    model_usage: [
      {
        model: "glm-5.3",
        input_tokens: 800,
        cached_input_tokens: 200,
        cache_creation_input_tokens: 100,
        output_tokens: 100,
        total_tokens: 1200,
      },
    ],
    ...overrides,
  };
}

function text(rows: unknown[]): string {
  return rows.map((entry) => JSON.stringify(entry)).join("\n");
}

describe("parseSessionRows", () => {
  it("maps the sidecar row onto the display shape with wall-clock duration", () => {
    const [session] = parseSessionRows(text([row()]));

    expect(session).toMatchObject({
      id: "sess-1",
      source: "zcode",
      projectKey: "token-usage",
      startedAt: "2026-11-12T09:00:00.000Z",
      endedAt: "2026-11-12T10:00:00.000Z",
      durationMs: 3_600_000,
      inputTokens: 800,
      cachedInputTokens: 200,
      cacheCreationInputTokens: 100,
      outputTokens: 100,
      reasoningOutputTokens: 0,
      totalTokens: 1200,
      credits: 0,
      models: [
        expect.objectContaining({ model: "glm-5.3", totalTokens: 1200 }),
      ],
    });
    // Privacy: title, raw cwd and resume keys never survive parsing.
    const leak = JSON.stringify(session);

    expect(leak).not.toContain("secret");
    expect(leak).not.toContain("should never surface");
    expect(leak).not.toContain("_cache_key");
  });

  it("falls back to session_hash and the basename of a path-shaped project key", () => {
    const [session] = parseSessionRows(
      text([
        row({
          session_id: "",
          session_hash: "abc123",
          project_key: null,
          project_ref: "/home/dev/work/deep/nested/app/",
        }),
      ]),
    );

    expect(session?.id).toBe("abc123");
    expect(session?.projectKey).toBe("app");
  });

  it("drops account-level sources and rows failing identity or timestamps", () => {
    const sessions = parseSessionRows(
      text([
        row({ source: "cursor", session_hash: "cursor-hash" }),
        row({ source: "trae-cn", session_hash: "trae-hash" }),
        row({ session_hash: "bad-identity", total_tokens: 999 }),
        row({
          session_hash: "bad-order",
          ended_at: "2026-11-12T08:00:00.000Z",
        }),
        row({ session_hash: "no-ended", ended_at: undefined }),
        row({ session_hash: "no-source", source: "" }),
        row(),
      ]),
    );

    expect(sessions.map((session) => session.id)).toEqual(["sess-1"]);
  });

  it("folds reasoning outside output for zcode-shaped totals", () => {
    const [session] = parseSessionRows(
      text([
        row({
          total_tokens: 1300,
          tokens: {
            input_tokens: 800,
            cached_input_tokens: 200,
            cache_creation_input_tokens: 100,
            output_tokens: 100,
            reasoning_output_tokens: 100,
            total_tokens: 1300,
          },
          model_usage: [
            {
              model: "glm-5.3",
              input_tokens: 800,
              cached_input_tokens: 200,
              cache_creation_input_tokens: 100,
              output_tokens: 100,
              reasoning_output_tokens: 100,
              total_tokens: 1300,
            },
          ],
        }),
      ]),
    );

    // reasoning folds into output so the identity holds; total stays as the
    // vendor reported it (verbatim CLI upload rule).
    expect(session?.outputTokens).toBe(200);
    expect(session?.reasoningOutputTokens).toBe(100);
    expect(session?.totalTokens).toBe(1300);
  });

  it("drops the models array when per-model sums disagree, keeps the session", () => {
    const [session] = parseSessionRows(
      text([
        row({
          model_usage: [
            {
              model: "glm-5.3",
              input_tokens: 1,
              cached_input_tokens: 0,
              cache_creation_input_tokens: 0,
              output_tokens: 0,
              total_tokens: 1,
            },
          ],
        }),
      ]),
    );

    expect(session?.totalTokens).toBe(1200);
    expect(session?.models).toEqual([]);
  });

  it("carries positive credits only and dedupes by identity, newest wins", () => {
    const sessions = parseSessionRows(
      text([
        row({ credits: 3.5, ended_at: "2026-11-12T09:30:00.000Z" }),
        row({ credits: 9, ended_at: "2026-11-12T10:00:00.000Z" }),
        row({
          session_id: "q-session",
          source: "qoder",
          credits: 100,
          ended_at: "2026-11-12T11:00:00.000Z",
          total_tokens: 0,
          tokens: {
            input_tokens: 0,
            cached_input_tokens: 0,
            cache_creation_input_tokens: 0,
            output_tokens: 0,
            reasoning_output_tokens: 0,
            total_tokens: 0,
          },
        }),
      ]),
    );

    expect(sessions).toHaveLength(2);
    expect(sessions[0]).toMatchObject({ id: "q-session", credits: 100 });
    expect(sessions[1]).toMatchObject({ id: "sess-1", credits: 9 });
  });

  it("orders by ended_at desc with the contract tie-breakers", () => {
    const sessions = parseSessionRows(
      text([
        row({ session_id: "b", ended_at: "2026-11-12T10:00:00.000Z" }),
        row({ session_id: "a", ended_at: "2026-11-12T10:00:00.000Z" }),
        row({ session_id: "late", ended_at: "2026-11-12T11:00:00.000Z" }),
      ]),
    );

    expect(sessions.map((session) => session.id)).toEqual(["late", "a", "b"]);
  });
});

describe("session windows, filters and aggregation", () => {
  it("builds day-granular preset windows ending tomorrow 00:00", () => {
    const { fromMs, toMs } = sessionRangeWindow("7d", NOW);
    const from = new Date(fromMs);
    const to = new Date(toMs);

    expect(from.getHours()).toBe(0);
    expect(from.getDate()).toBe(6);
    expect(to.getHours()).toBe(0);
    expect(to.getDate()).toBe(13);
  });

  it("filters the half-open window and an exact source", () => {
    const rows = parseSessionRows(
      text([
        row({
          session_id: "in-window",
          started_at: "2026-11-05T23:00:00.000Z",
          ended_at: "2026-11-06T00:00:00.000Z",
        }),
        row({ session_id: "edge-in", ended_at: "2026-11-12T09:00:00.000Z" }),
        row({ session_id: "other-source", source: "codex" }),
      ]),
    );
    const { fromMs, toMs } = sessionRangeWindow("7d", NOW);
    const filtered = filterSessions(rows, fromMs, toMs, "zcode");

    expect(filtered.map((session) => session.id)).toEqual([
      "edge-in",
      "in-window",
    ]);
  });

  it("aggregates totals and facets over the filtered set", () => {
    const rows = parseSessionRows(
      text([
        row(),
        row({
          session_id: "q",
          source: "qoder",
          credits: 42,
          total_tokens: 0,
          tokens: {
            input_tokens: 0,
            cached_input_tokens: 0,
            cache_creation_input_tokens: 0,
            output_tokens: 0,
            reasoning_output_tokens: 0,
            total_tokens: 0,
          },
        }),
      ]),
    );
    const totals = aggregateSessions(rows);

    expect(totals.sessions).toBe(2);
    expect(totals.totalTokens).toBe(1200);
    expect(totals.credits).toBe(42);
    expect(totals.durationMs).toBe(7_200_000);
    expect(sessionSourceFacets(rows)).toEqual([
      { source: "qoder", sessions: 1 },
      { source: "zcode", sessions: 1 },
    ]);
  });

  it("pages safely and reports the filtered total", () => {
    const rows = parseSessionRows(
      text(
        Array.from({ length: 25 }, (_, index) =>
          row({ session_id: `s-${index}` }),
        ),
      ),
    );
    const page = pageSessions(rows, 20, DEFAULT_PAGE_SIZE);

    expect(page.total).toBe(25);
    expect(page.rows).toHaveLength(5);
    // An offset past the end clamps to the last row.
    expect(pageSessions(rows, 500, DEFAULT_PAGE_SIZE).offset).toBe(24);
  });
});

describe("buildSessionsCsv", () => {
  it("emits the contract columns with BOM, CRLF and formula guards", () => {
    const rows = parseSessionRows(
      text([
        row({ project_key: "=cmd|sum", credits: 1.5 }),
        row({
          session_id: "zero-tokens",
          total_tokens: 0,
          tokens: {
            input_tokens: 0,
            cached_input_tokens: 0,
            cache_creation_input_tokens: 0,
            output_tokens: 0,
            reasoning_output_tokens: 0,
            total_tokens: 0,
          },
        }),
      ]),
    );
    const csv = buildSessionsCsv(rows, "PC-1");

    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv.includes("\r\n")).toBe(true);
    // The leading `=` gets a `'` guard inside the quoted cell.
    expect(csv).toContain('"\'=cmd|sum"');
    // billable is null locally → empty cell; models JSON rides the last column.
    expect(csv).toContain('"1200","","1.500000"');
    expect(csv).toContain('"[{""model"":""glm-5.3"",""total_tokens"":1200');
    expect(csv.split("\r\n")).toHaveLength(4);
  });
});
