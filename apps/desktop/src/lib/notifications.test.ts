import type { MonitorSnapshot } from "@/lib/monitor";

import { describe, expect, it } from "vitest";

import {
  INITIAL_NOTIFICATION_STATE,
  decideNotifications,
  isQuietHour,
  localDateKey,
} from "@/lib/notifications";
import { DEFAULT_PREFERENCES, MIB, type Preferences } from "@/lib/preferences";
import { syncFailureStreak } from "@/lib/sync-log";

const FINISHED = (pendingBytes = 0) =>
  JSON.stringify({
    ts: "2026-11-09T12:00:00.000Z",
    msg: "Auto sync finished",
    phase: "finished",
    pending_bytes: pendingBytes,
  });
const ERROR = (msg = "Upload error: 401") =>
  JSON.stringify({
    ts: "2026-11-09T12:00:00.000Z",
    msg,
    phase: "upload",
    error: msg,
  });

function snapshot(patch: Partial<MonitorSnapshot> = {}): MonitorSnapshot {
  return {
    today: {
      totalTokens: 1_234_000,
      conversations: 7,
      sources: [],
      models: [],
      projects: [],
      attributedTokens: 0,
    },
    week: {
      totalTokens: 9_000_000,
      conversations: 40,
      sources: [],
      models: [],
      projects: [],
      attributedTokens: 0,
    },
    pendingBytes: 0,
    queueBytes: 0,
    paused: false,
    pausedAt: null,
    lastRun: null,
    lastError: null,
    failureStreak: 0,
    failureMessage: null,
    dashboardUrl: null,
    repoUrls: {},
    updatedAt: 0,
    cli: { available: true, version: "0.5.4" },
    ...patch,
  };
}

function prefs(patch: Partial<Preferences> = {}): Preferences {
  return { ...DEFAULT_PREFERENCES, ...patch };
}

// 2026-11-09T22:30 local — built from local parts so the zone never matters.
const at = (hour: number, minute = 0, day = 9) =>
  new Date(2026, 10, day, hour, minute).getTime();

describe("syncFailureStreak", () => {
  it("counts runs with an error, including upload errors that still finish", () => {
    const log = [ERROR(), FINISHED(512), ERROR(), FINISHED(512)].join("\n");

    expect(syncFailureStreak(log).streak).toBe(2);
    expect(syncFailureStreak(log).message).toBe("Upload error: 401");
  });

  it("resets on a clean finished run", () => {
    expect(
      syncFailureStreak([ERROR(), FINISHED(), FINISHED()].join("\n")).streak,
    ).toBe(0);
  });

  it("counts trailing errors past the last finished line as the in-flight run", () => {
    const log = [FINISHED(), ERROR("Upload error: timeout")].join("\n");

    expect(syncFailureStreak(log)).toEqual({
      streak: 1,
      message: "Upload error: timeout",
    });
  });

  it("ignores unparseable lines", () => {
    expect(syncFailureStreak("")).toEqual({ streak: 0, message: null });
    expect(syncFailureStreak('not json\n{"torn"').streak).toBe(0);
  });
});

describe("isQuietHour", () => {
  it("handles windows that do not wrap", () => {
    expect(isQuietHour(at(13), 12, 14)).toBe(true);
    expect(isQuietHour(at(14), 12, 14)).toBe(false);
  });

  it("handles windows that wrap midnight", () => {
    expect(isQuietHour(at(23), 22, 8)).toBe(true);
    expect(isQuietHour(at(7), 22, 8)).toBe(true);
    expect(isQuietHour(at(12), 22, 8)).toBe(false);
  });

  it("treats equal ends as no window", () => {
    expect(isQuietHour(at(22), 22, 22)).toBe(false);
  });
});

describe("decideNotifications", () => {
  it("sends the daily summary once per local day, after the chosen hour", () => {
    const early = decideNotifications({
      prefs: prefs({ dailySummaryHour: 21 }),
      snapshot: snapshot(),
      nowMs: at(20),
      state: INITIAL_NOTIFICATION_STATE,
    });

    expect(early.notifications).toHaveLength(0);

    const due = decideNotifications({
      prefs: prefs({ dailySummaryHour: 21 }),
      snapshot: snapshot(),
      nowMs: at(21),
      state: INITIAL_NOTIFICATION_STATE,
    });

    expect(due.notifications.map((n) => n.key)).toEqual(["daily"]);
    expect(due.notifications[0]?.body).toContain("7 个会话");
    expect(due.state.lastDailyDate).toBe(localDateKey(at(21)));

    const again = decideNotifications({
      prefs: prefs({ dailySummaryHour: 21 }),
      snapshot: snapshot(),
      nowMs: at(22),
      state: due.state,
    });

    expect(again.notifications).toHaveLength(0);
  });

  it("holds a due summary through quiet hours instead of dropping it", () => {
    // Window 12–18 sits after the 11:00 summary time, so the summary is due
    // at 11:00 only in theory; at 19:00 the window is over and it still fires
    // because suppression never marks the day as sent.
    const holiday = prefs({
      dailySummaryHour: 11,
      quietHours: true,
      quietStartHour: 12,
      quietEndHour: 18,
    });
    const during = decideNotifications({
      prefs: holiday,
      snapshot: snapshot(),
      nowMs: at(13),
      state: INITIAL_NOTIFICATION_STATE,
    });

    expect(during.notifications).toHaveLength(0);
    expect(during.state.lastDailyDate).toBeNull();

    const after = decideNotifications({
      prefs: holiday,
      snapshot: snapshot(),
      nowMs: at(19),
      state: during.state,
    });

    expect(after.notifications.map((n) => n.key)).toEqual(["daily"]);
  });

  it("alerts once per failure streak and re-arms after recovery", () => {
    const input = {
      prefs: prefs({ failureThreshold: 3 }),
      snapshot: snapshot({
        failureStreak: 3,
        failureMessage: "Upload error: 401",
      }),
      nowMs: at(12),
    };
    const first = decideNotifications({
      ...input,
      state: INITIAL_NOTIFICATION_STATE,
    });

    expect(first.notifications.map((n) => n.key)).toEqual(["failure"]);
    expect(first.notifications[0]?.title).toContain("3");
    expect(first.state.failureNotifiedStreak).toBe(3);

    const repeat = decideNotifications({ ...input, state: first.state });

    expect(repeat.notifications).toHaveLength(0);

    const worse = decideNotifications({
      ...input,
      snapshot: snapshot({
        failureStreak: 4,
        failureMessage: "Upload error: 401",
      }),
      state: first.state,
    });

    expect(worse.notifications.map((n) => n.key)).toEqual(["failure"]);

    const recovered = decideNotifications({
      ...input,
      snapshot: snapshot(),
      state: worse.state,
    });

    expect(recovered.notifications).toHaveLength(0);
    expect(recovered.state.failureNotifiedStreak).toBe(0);

    const nextStreak = decideNotifications({
      ...input,
      state: recovered.state,
    });

    expect(nextStreak.notifications.map((n) => n.key)).toEqual(["failure"]);
  });

  it("alerts once while the queue stays above the backlog threshold", () => {
    const prefsBacklog = prefs({ backlogBytes: 20 * MIB });
    const over = decideNotifications({
      prefs: prefsBacklog,
      snapshot: snapshot({ pendingBytes: 30 * MIB }),
      nowMs: at(12),
      state: INITIAL_NOTIFICATION_STATE,
    });

    expect(over.notifications.map((n) => n.key)).toEqual(["backlog"]);
    expect(over.notifications[0]?.body).toContain("30.0 MB");

    const stillOver = decideNotifications({
      prefs: prefsBacklog,
      snapshot: snapshot({ pendingBytes: 40 * MIB }),
      nowMs: at(12),
      state: over.state,
    });

    expect(stillOver.notifications).toHaveLength(0);

    const drained = decideNotifications({
      prefs: prefsBacklog,
      snapshot: snapshot({ pendingBytes: 0 }),
      nowMs: at(12),
      state: stillOver.state,
    });

    expect(drained.state.backlogNotified).toBe(false);

    const back = decideNotifications({
      prefs: prefsBacklog,
      snapshot: snapshot({ pendingBytes: 30 * MIB }),
      nowMs: at(12),
      state: drained.state,
    });

    expect(back.notifications.map((n) => n.key)).toEqual(["backlog"]);
  });

  it("respects disabled switches", () => {
    const off = prefs({
      dailySummary: false,
      failureAlerts: false,
      backlogAlerts: false,
    });
    const result = decideNotifications({
      prefs: off,
      snapshot: snapshot({
        failureStreak: 9,
        failureMessage: "boom",
        pendingBytes: 90 * MIB,
      }),
      nowMs: at(23),
      state: INITIAL_NOTIFICATION_STATE,
    });

    expect(result.notifications).toHaveLength(0);
  });
});
