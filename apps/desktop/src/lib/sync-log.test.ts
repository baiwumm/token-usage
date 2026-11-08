import { describe, expect, it } from "vitest";

import { parseSyncLogLine, summarizeSyncLog } from "@/lib/sync-log";

// Line shapes mirror what packages/cli/src/commands/sync.js `autoLog` writes.
const FINISHED_RUN = {
  ts: "2026-11-08T09:00:00.000Z",
  msg: "Auto sync finished — parsed 12 files, +3 buckets, uploaded 3, skipped 0, 9694213 tokens, pending 0 B",
  phase: "finished",
  parsed_files: 12,
  buckets: 3,
  inserted: 3,
  skipped: 0,
  tokens: 9694213,
  credits: 0,
  sessions_uploaded: 1,
  sessions_skipped: 0,
  pending_bytes: 0,
  duration_ms: 4123,
  uploaded: true,
};

const UPLOAD_ERROR = {
  ts: "2026-11-08T10:00:00.000Z",
  msg: "Upload error: request timed out",
  phase: "upload",
  error: "request timed out",
  status: null,
};

const SESSION_UPLOAD_ERROR = {
  ts: "2026-11-08T11:00:00.000Z",
  msg: "Session upload error (hourly buckets are unaffected): 413 payload too large",
  phase: "session-upload",
  error: "413 payload too large",
  status: 413,
};

const STARTED_LINE = {
  ts: "2026-11-08T09:59:00.000Z",
  msg: "Auto sync started — scanning local provider sessions…",
};

describe("parseSyncLogLine", () => {
  it("parses well-formed entries", () => {
    expect(parseSyncLogLine(`${JSON.stringify(STARTED_LINE)}`)).toEqual(
      STARTED_LINE,
    );
  });

  it("rejects lines without ts/msg and broken JSON", () => {
    expect(parseSyncLogLine("not json")).toBeNull();
    expect(parseSyncLogLine('{"ts":"2026-11-08"}')).toBeNull();
    expect(parseSyncLogLine("")).toBeNull();
    expect(parseSyncLogLine("   ")).toBeNull();
  });

  it("tolerates a torn tail write (truncated JSON)", () => {
    const torn = `${JSON.stringify(FINISHED_RUN).slice(0, 60)}`;

    expect(parseSyncLogLine(torn)).toBeNull();
  });
});

describe("summarizeSyncLog", () => {
  it("returns nulls for empty or blank text", () => {
    expect(summarizeSyncLog("")).toEqual({ lastRun: null, lastError: null });
    expect(summarizeSyncLog("\n \n")).toEqual({
      lastRun: null,
      lastError: null,
    });
  });

  it("summarises the finished run's structured fields", () => {
    const status = summarizeSyncLog(`${JSON.stringify(FINISHED_RUN)}\n`);

    expect(status.lastRun).toEqual({
      ts: "2026-11-08T09:00:00.000Z",
      parsedFiles: 12,
      buckets: 3,
      inserted: 3,
      skipped: 0,
      tokens: 9694213,
      sessionsUploaded: 1,
      sessionsSkipped: 0,
      pendingBytes: 0,
      durationMs: 4123,
      uploaded: true,
    });
    expect(status.lastError).toBeNull();
  });

  it("keeps the latest run when several finished lines exist", () => {
    const later = {
      ...FINISHED_RUN,
      ts: "2026-11-08T12:00:00.000Z",
      tokens: 1188,
      buckets: 1,
    };
    const text = [STARTED_LINE, FINISHED_RUN, later]
      .map((entry) => JSON.stringify(entry))
      .join("\n");
    const status = summarizeSyncLog(text);

    expect(status.lastRun?.ts).toBe("2026-11-08T12:00:00.000Z");
    expect(status.lastRun?.tokens).toBe(1188);
  });

  it("surfaces an error that happened after the last finished run", () => {
    const text = [FINISHED_RUN, STARTED_LINE, UPLOAD_ERROR]
      .map((entry) => JSON.stringify(entry))
      .join("\n");
    const status = summarizeSyncLog(text);

    expect(status.lastRun?.tokens).toBe(9694213);
    expect(status.lastError).toEqual({
      ts: "2026-11-08T10:00:00.000Z",
      msg: "Upload error: request timed out",
    });
  });

  it("prefers the newest error line when several follow the last run", () => {
    const text = [FINISHED_RUN, UPLOAD_ERROR, SESSION_UPLOAD_ERROR]
      .map((entry) => JSON.stringify(entry))
      .join("\n");

    expect(summarizeSyncLog(text).lastError?.msg).toBe(
      "Session upload error (hourly buckets are unaffected): 413 payload too large",
    );
  });

  it("drops errors superseded by a later finished run", () => {
    const later = { ...FINISHED_RUN, ts: "2026-11-08T12:00:00.000Z" };
    const text = [FINISHED_RUN, UPLOAD_ERROR, later]
      .map((entry) => JSON.stringify(entry))
      .join("\n");
    const status = summarizeSyncLog(text);

    expect(status.lastRun?.ts).toBe("2026-11-08T12:00:00.000Z");
    expect(status.lastError).toBeNull();
  });

  it("treats a run without device token as not uploaded", () => {
    const skippedUpload = {
      ...FINISHED_RUN,
      uploaded: false,
      inserted: 0,
      pending_bytes: 12345,
    };
    const status = summarizeSyncLog(`${JSON.stringify(skippedUpload)}\n`);

    expect(status.lastRun?.uploaded).toBe(false);
    expect(status.lastRun?.pendingBytes).toBe(12345);
  });
});
