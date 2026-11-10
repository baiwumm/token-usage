import { describe, expect, it } from "vitest";

import { buildMonitorSnapshot } from "@/lib/monitor";

const NOW = Date.parse("2026-11-08T12:00:00.000Z");
const ROW_TODAY = JSON.stringify({
  source: "codex",
  model: "deepseek-v4-flash",
  hour_start: "2026-11-08T01:00:00.000Z",
  total_tokens: 150,
  billable_total_tokens: 150,
  conversation_count: 2,
});
const FINISHED_RUN = JSON.stringify({
  ts: "2026-11-08T09:00:00.000Z",
  msg: "Auto sync finished",
  phase: "finished",
  parsed_files: 12,
  buckets: 3,
  inserted: 3,
  skipped: 0,
  tokens: 9694213,
  sessions_uploaded: 1,
  sessions_skipped: 0,
  pending_bytes: 0,
  duration_ms: 4123,
  uploaded: true,
});

const BASE_FILES = {
  queue: `${ROW_TODAY}\n`,
  pause: null,
  queueState: null,
  syncLog: null,
  projectRepos: null,
};

describe("buildMonitorSnapshot", () => {
  it("composes today/week windows, sync status and CLI info", () => {
    const snapshot = buildMonitorSnapshot(
      {
        ...BASE_FILES,
        syncLog: `${FINISHED_RUN}\n`,
        queueState: `${JSON.stringify({ offset: 100 })}\n`,
      },
      { available: true, version: "0.5.2" },
      "https://example.selfhost.test",
      NOW,
    );

    expect(snapshot.today.totalTokens).toBe(150);
    expect(snapshot.week.totalTokens).toBe(150);
    expect(snapshot.lastRun?.tokens).toBe(9694213);
    expect(snapshot.cli).toEqual({ available: true, version: "0.5.2" });
    expect(snapshot.dashboardUrl).toBe("https://example.selfhost.test");
    expect(snapshot.paused).toBe(false);
    expect(snapshot.updatedAt).toBe(NOW);
  });

  it("computes pending bytes from the upload offset", () => {
    const snapshot = buildMonitorSnapshot(
      { ...BASE_FILES, queueState: `${JSON.stringify({ offset: 40 })}\n` },
      { available: true, version: null },
      null,
      NOW,
    );
    const queueBytes = new TextEncoder().encode(`${ROW_TODAY}\n`).length;

    expect(snapshot.queueBytes).toBe(queueBytes);
    expect(snapshot.pendingBytes).toBe(queueBytes - 40);
  });

  it("reads the pause flag and ignores corrupt state", () => {
    const paused = buildMonitorSnapshot(
      {
        ...BASE_FILES,
        pause: `${JSON.stringify({ paused: true, at: "2026-11-08T00:00:00.000Z" })}\n`,
        queueState: "corrupt",
      },
      { available: true, version: null },
      null,
      NOW,
    );

    expect(paused.paused).toBe(true);
    expect(paused.pausedAt).toBe("2026-11-08T00:00:00.000Z");
    // Corrupt state falls back to "fully uploaded", not a giant pending.
    expect(paused.pendingBytes).toBe(0);
  });

  it("handles a machine without any CLI data yet", () => {
    const snapshot = buildMonitorSnapshot(
      {
        queue: null,
        pause: null,
        queueState: null,
        syncLog: null,
        projectRepos: null,
      },
      { available: false, version: null },
      null,
      NOW,
    );

    expect(snapshot.today.totalTokens).toBe(0);
    expect(snapshot.pendingBytes).toBe(0);
    expect(snapshot.lastRun).toBeNull();
    expect(snapshot.cli.available).toBe(false);
    expect(snapshot.repoUrls).toEqual({});
  });

  it("merges project rows per confirmed repository and links them", () => {
    const rows = [
      { project_key: "token-usage", total_tokens: 300, conversation_count: 2 },
      {
        project_key: "baiwumm/token-usage",
        total_tokens: 100,
        conversation_count: 1,
      },
      { project_key: "local-only", total_tokens: 100, conversation_count: 1 },
    ]
      .map((row) =>
        JSON.stringify({
          source: "codex",
          model: "deepseek-v4-flash",
          hour_start: "2026-11-08T01:00:00.000Z",
          ...row,
        }),
      )
      .join("\n");
    const snapshot = buildMonitorSnapshot(
      {
        ...BASE_FILES,
        queue: `${rows}\n`,
        projectRepos: JSON.stringify({
          version: 1,
          confirmed: {
            "baiwumm/token-usage": "https://github.com/baiwumm/token-usage",
            "baiwumm/bad": "file:///etc/passwd",
          },
        }),
      },
      { available: true, version: null },
      null,
      NOW,
    );

    expect(snapshot.repoUrls).toEqual({
      "baiwumm/token-usage": "https://github.com/baiwumm/token-usage",
    });
    expect(snapshot.week.projects).toEqual([
      {
        projectKey: "token-usage",
        tokens: 400,
        conversations: 3,
        share: 0.8,
        repoUrl: "https://github.com/baiwumm/token-usage",
      },
      {
        projectKey: "local-only",
        tokens: 100,
        conversations: 1,
        share: 0.2,
        repoUrl: null,
      },
    ]);
    expect(snapshot.week.attributedTokens).toBe(500);
  });
});
