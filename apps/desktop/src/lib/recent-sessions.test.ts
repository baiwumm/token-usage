import { describe, expect, it } from "vitest";

import { formatRelativeTime } from "@/lib/format-tokens";
import { parseRecentSessions } from "@/lib/recent-sessions";

const NOW = Date.parse("2026-11-10T12:00:00.000Z");

function row(overrides: Record<string, unknown> = {}) {
  return {
    session_hash: "hash-1",
    source: "claude",
    project_key: "token-usage",
    project_ref: "C:\\secret\\path",
    title: "should never surface",
    model: "claude-opus-4",
    started_at: "2026-11-10T09:00:00.000Z",
    ended_at: "2026-11-10T10:00:00.000Z",
    total_tokens: 1200,
    ...overrides,
  };
}

function text(rows: unknown[]): string {
  return rows.map((entry) => JSON.stringify(entry)).join("\n");
}

describe("parseRecentSessions", () => {
  it("keeps metadata only and orders newest first", () => {
    const sessions = parseRecentSessions(
      text([
        row(),
        row({
          session_hash: "hash-2",
          model: "gpt-5",
          ended_at: "2026-11-10T11:00:00.000Z",
        }),
      ]),
    );

    expect(sessions).toEqual([
      {
        id: "hash-2",
        source: "claude",
        model: "gpt-5",
        projectKey: "token-usage",
        endedAt: "2026-11-10T11:00:00.000Z",
        tokens: 1200,
      },
      {
        id: "hash-1",
        source: "claude",
        model: "claude-opus-4",
        projectKey: "token-usage",
        endedAt: "2026-11-10T10:00:00.000Z",
        tokens: 1200,
      },
    ]);
    expect(JSON.stringify(sessions)).not.toContain("secret");
    expect(JSON.stringify(sessions)).not.toContain("should never surface");
  });

  it("dedupes fragments by session_hash, keeping the newest row", () => {
    const sessions = parseRecentSessions(
      text([
        row(),
        row({
          ended_at: "2026-11-10T11:30:00.000Z",
          model: "claude-sonnet-4",
          total_tokens: 900,
        }),
      ]),
    );

    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.model).toBe("claude-sonnet-4");
    expect(sessions[0]?.tokens).toBe(900);
  });

  it("skips torn or incomplete lines", () => {
    expect(parseRecentSessions("{oops")).toEqual([]);
    expect(parseRecentSessions(text([{ source: "claude" }]))).toEqual([]);
    expect(parseRecentSessions(text([row({ ended_at: "bogus" })]))).toEqual([]);
    expect(parseRecentSessions(null)).toEqual([]);
    expect(parseRecentSessions("")).toEqual([]);
  });

  it("caps the list and falls back to nested token totals", () => {
    const rows = Array.from({ length: 7 }, (_, index) =>
      row({
        session_hash: `h-${index}`,
        ended_at: `2026-11-10T0${index}:00:00.000Z`,
        total_tokens: undefined,
        tokens: { total_tokens: index + 1 },
      }),
    );
    const sessions = parseRecentSessions(text(rows));

    expect(sessions).toHaveLength(5);
    expect(sessions[0]?.tokens).toBe(7);
    expect(sessions[0]?.endedAt).toBe("2026-11-10T06:00:00.000Z");
  });
});

describe("formatRelativeTime", () => {
  it("renders zh-CN relative stamps", () => {
    expect(formatRelativeTime(new Date(NOW - 30_000).toISOString(), NOW)).toBe(
      "刚刚",
    );
    expect(
      formatRelativeTime(new Date(NOW - 5 * 60_000).toISOString(), NOW),
    ).toBe("5 分钟前");
    expect(
      formatRelativeTime(new Date(NOW - 3 * 3600_000).toISOString(), NOW),
    ).toBe("3 小时前");
    expect(
      formatRelativeTime(new Date(NOW - 2 * 86400_000).toISOString(), NOW),
    ).toBe("2 天前");
    expect(formatRelativeTime("bogus", NOW)).toBe("");
  });
});
