import { describe, expect, it } from "vitest";

import {
  describeLoginFailure,
  formatCountdown,
  parseStatusLight,
  pickFirstSyncResult,
  reduceLoginPoll,
  tailOf,
  type DeviceLoginPoll,
  type LoginPhase,
} from "@/lib/pairing";

const NOW = Date.parse("2026-11-09T12:00:00.000Z");

const CODE = {
  userCode: "AB2C-9XYZ",
  verificationUri: "https://token.example.test/device",
  verificationUriComplete:
    "https://token.example.test/device?user_code=AB2C-9XYZ",
  expiresInSec: 900,
};

function pollWith(overrides: Partial<DeviceLoginPoll>): DeviceLoginPoll {
  return {
    running: true,
    exitCode: null,
    code: null,
    outputTail: "",
    ...overrides,
  };
}

describe("parseStatusLight", () => {
  it("reads device_token_set from the CLI's light status JSON", () => {
    const paired = JSON.stringify({
      version: "0.5.2",
      device_token_set: true,
      device: { machine_id: "abcd1234" },
    });

    expect(parseStatusLight(paired)).toBe(true);
    expect(parseStatusLight(JSON.stringify({ device_token_set: false }))).toBe(
      false,
    );
  });

  it("tolerates missing fields, garbage and null text", () => {
    expect(parseStatusLight(JSON.stringify({ version: "0.5.2" }))).toBe(false);
    expect(parseStatusLight("not json {")).toBe(null);
    expect(parseStatusLight("[1,2,3]")).toBe(null);
    expect(parseStatusLight("null")).toBe(null);
    expect(parseStatusLight(null)).toBe(null);
    expect(parseStatusLight("")).toBe(null);
  });
});

describe("reduceLoginPoll", () => {
  it("waiting polls without a code keep the phase untouched", () => {
    const waiting: LoginPhase = {
      kind: "waiting",
      code: null,
      expiresAtMs: null,
    };

    expect(reduceLoginPoll(waiting, pollWith({ running: true }), NOW)).toEqual({
      phase: waiting,
      approved: false,
    });
  });

  it("a fresh code is stamped with its expiry once", () => {
    const { phase } = reduceLoginPoll(
      { kind: "waiting", code: null, expiresAtMs: null },
      pollWith({ running: true, code: CODE }),
      NOW,
    );

    expect(phase).toEqual({
      kind: "waiting",
      code: CODE,
      expiresAtMs: NOW + 900_000,
    });
  });

  it("a code without expires_in keeps a null expiry (no countdown)", () => {
    const { phase } = reduceLoginPoll(
      { kind: "waiting", code: null, expiresAtMs: null },
      pollWith({ running: true, code: { ...CODE, expiresInSec: null } }),
      NOW,
    );

    expect(phase).toMatchObject({ kind: "waiting", expiresAtMs: null });
  });

  it("a repeated code never pushes the countdown forward", () => {
    const waiting: LoginPhase = {
      kind: "waiting",
      code: CODE,
      expiresAtMs: NOW + 900_000,
    };
    const later = NOW + 60_000;

    const { phase } = reduceLoginPoll(
      waiting,
      pollWith({ running: true, code: CODE }),
      later,
    );

    expect(phase).toEqual(waiting);
  });

  it("a code arriving on an already-waiting phase still gets its expiry", () => {
    const { phase } = reduceLoginPoll(
      { kind: "waiting", code: null, expiresAtMs: null },
      pollWith({ running: true, code: CODE }),
      NOW + 1_000,
    );

    expect(phase).toEqual({
      kind: "waiting",
      code: CODE,
      expiresAtMs: NOW + 901_000,
    });
  });

  it("exit 0 means approved", () => {
    const { phase, approved } = reduceLoginPoll(
      { kind: "waiting", code: CODE, expiresAtMs: NOW },
      pollWith({
        running: false,
        exitCode: 0,
        outputTail: "Approved. device token written",
      }),
      NOW,
    );

    expect(phase).toEqual({ kind: "approved" });
    expect(approved).toBe(true);
  });

  it("a non-zero exit fails with the last CLI line", () => {
    const { phase, approved } = reduceLoginPoll(
      { kind: "waiting", code: CODE, expiresAtMs: NOW },
      pollWith({
        running: false,
        exitCode: 1,
        outputTail:
          "poll error (retry 1): boom\ndevice_code expired — re-run `tracker device-login`",
      }),
      NOW,
    );

    expect(phase).toEqual({
      kind: "failed",
      message: "device_code expired — re-run `tracker device-login`",
    });
    expect(approved).toBe(false);
  });

  it("a non-zero exit without output falls back to a generic line", () => {
    const { phase } = reduceLoginPoll(
      { kind: "waiting", code: null, expiresAtMs: null },
      pollWith({ running: false, exitCode: 9009 }),
      NOW,
    );

    expect(phase).toEqual({ kind: "failed", message: "配对失败（exit 9009）" });
  });

  it("idle, starting, approved and failed phases pass through unchanged", () => {
    const approved: LoginPhase = { kind: "approved" };
    const failed: LoginPhase = { kind: "failed", message: "x" };

    expect(reduceLoginPoll({ kind: "idle" }, pollWith({}), NOW)).toEqual({
      phase: { kind: "idle" },
      approved: false,
    });
    // Before the spawn resolves the bridge answers "idle" — never a failure.
    expect(
      reduceLoginPoll({ kind: "starting" }, pollWith({ running: false }), NOW),
    ).toEqual({ phase: { kind: "starting" }, approved: false });
    expect(
      reduceLoginPoll(approved, pollWith({ running: true, code: CODE }), NOW),
    ).toEqual({
      phase: approved,
      approved: false,
    });
    expect(
      reduceLoginPoll(failed, pollWith({ running: false, exitCode: 0 }), NOW),
    ).toEqual({
      phase: failed,
      approved: false,
    });
  });
});

describe("describeLoginFailure", () => {
  it("prefers the last meaningful line and skips blanks", () => {
    expect(
      describeLoginFailure(
        "Requesting device code...\n\n  error: no anon key  \n",
        1,
      ),
    ).toBe("error: no anon key");
  });

  it("falls back when the tail is empty", () => {
    expect(describeLoginFailure("", null)).toBe(
      "未能启动 tokenusage device-login",
    );
    expect(describeLoginFailure("  \n", 2)).toBe("配对失败（exit 2）");
  });
});

describe("tailOf", () => {
  it("keeps the last lines and trims the edges", () => {
    expect(tailOf("a\r\nb\nc\nd", 2)).toBe("c\nd");
    expect(tailOf("\n\n  \n", 8)).toBe("");
  });
});

describe("formatCountdown", () => {
  it("renders mm:ss, rounding partial seconds up and flooring at zero", () => {
    expect(formatCountdown(900_000)).toBe("15:00");
    expect(formatCountdown(61_001)).toBe("01:02");
    expect(formatCountdown(500)).toBe("00:01");
    expect(formatCountdown(0)).toBe("00:00");
    expect(formatCountdown(-5_000)).toBe("00:00");
  });
});

describe("pickFirstSyncResult", () => {
  const STARTED = Date.parse("2026-11-09T12:00:00.000Z");
  const line = (fields: Record<string, unknown>) => JSON.stringify(fields);
  const OLD_RUN = line({
    ts: "2026-11-09T11:00:00.000Z",
    msg: "Auto sync finished",
    phase: "finished",
    tokens: 111,
  });
  const NEW_RUN = line({
    ts: "2026-11-09T12:00:05.000Z",
    msg: "Auto sync finished",
    phase: "finished",
    buckets: 4,
    tokens: 9_694_213,
    sessions_uploaded: 3,
    pending_bytes: 0,
    duration_ms: 4123,
    uploaded: true,
  });
  const NEW_UPLOAD_ERROR = line({
    ts: "2026-11-09T12:00:03.000Z",
    msg: "Upload error: HTTP 503",
    phase: "upload",
    error: "HTTP 503",
  });
  const OK_EXIT = { exitCode: 0, outputTail: "" };

  it("reports this run's finished line and ignores older runs", () => {
    const result = pickFirstSyncResult(
      [OLD_RUN, NEW_RUN].join("\n"),
      STARTED,
      OK_EXIT,
    );

    expect(result.kind).toBe("done");
    if (result.kind === "done") {
      expect(result.run.tokens).toBe(9_694_213);
      expect(result.run.sessionsUploaded).toBe(3);
      expect(result.warning).toBe(null);
    }
  });

  it("keeps an upload error of the same run even though it finished", () => {
    const result = pickFirstSyncResult(
      [NEW_UPLOAD_ERROR, NEW_RUN].join("\n"),
      STARTED,
      OK_EXIT,
    );

    expect(result).toMatchObject({
      kind: "done",
      warning: "Upload error: HTTP 503",
    });
  });

  it("an error without a finished line fails the step", () => {
    expect(pickFirstSyncResult(NEW_UPLOAD_ERROR, STARTED, OK_EXIT)).toEqual({
      kind: "error",
      message: "Upload error: HTTP 503",
    });
  });

  it("a stale-only log with exit 0 means no new run (paused / locked)", () => {
    expect(pickFirstSyncResult(OLD_RUN, STARTED, OK_EXIT)).toEqual({
      kind: "none",
    });
    expect(pickFirstSyncResult(null, STARTED, OK_EXIT)).toEqual({
      kind: "none",
    });
  });

  it("a non-zero exit without log lines fails with the CLI's last line", () => {
    expect(
      pickFirstSyncResult(OLD_RUN, STARTED, {
        exitCode: 1,
        outputTail: "Error: sync.lock is held\n",
      }),
    ).toEqual({ kind: "error", message: "Error: sync.lock is held" });
    expect(
      pickFirstSyncResult(null, STARTED, { exitCode: 3, outputTail: "" }),
    ).toEqual({ kind: "error", message: "同步失败（exit 3）" });
    expect(
      pickFirstSyncResult(null, STARTED, { exitCode: null, outputTail: "" }),
    ).toEqual({ kind: "error", message: "未能启动 tokenusage sync" });
  });

  it("torn or foreign lines are skipped", () => {
    const result = pickFirstSyncResult(
      ["{not json", "plain text", NEW_RUN.slice(0, 20), NEW_RUN].join("\n"),
      STARTED,
      OK_EXIT,
    );

    expect(result.kind).toBe("done");
  });
});
