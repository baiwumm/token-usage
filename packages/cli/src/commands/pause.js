"use strict";

// `tokenusage pause` / `tokenusage resume` (0.2.0): the collection switch.
//
// pause writes the cross-platform flag in ~/.tokenusage (auto-flavored syncs
// — scheduled/notify/retry/watch — check it and exit silently) and, on
// Windows, disables the hourly scheduled task so the trigger itself stops
// firing. resume reverses both. The flag is the source of truth; the task
// toggle is a convenience, so a missing task is reported, not an error.

const os = require("node:os");

const { resolveTrackerPaths } = require("../lib/tracker-paths");
const {
  isCollectionPaused,
  setCollectionPaused,
} = require("../lib/collection-pause");
const {
  TASK_NAME,
  setWindowsTaskEnabled,
} = require("../lib/scheduled-task");

function describeTaskOutcome(outcome, enabled) {
  if (outcome.changed) {
    return `${TASK_NAME} ${enabled ? "enabled" : "disabled"}.`;
  }
  if (outcome.reason === "not_windows") {
    return "(Windows scheduled task: n/a on this platform — the pause flag covers cron/launchd too).";
  }
  if (outcome.reason === "task_missing") {
    return `${TASK_NAME} not found (nothing to ${enabled ? "enable" : "disable"}) — the pause flag still guards all auto syncs.`;
  }
  return `${TASK_NAME} could not be ${enabled ? "enabled" : "disabled"} (${outcome.detail || "unknown error"}) — the pause flag still guards all auto syncs.`;
}

async function cmdPause() {
  const { trackerDir } = await resolveTrackerPaths({ home: os.homedir() });
  const alreadyPaused = isCollectionPaused(trackerDir);

  setCollectionPaused(trackerDir, true);
  const task = setWindowsTaskEnabled(false);

  process.stdout.write(
    [
      "Collection paused.",
      "- Scheduled/notify/watch syncs will exit silently without uploading.",
      "- Manual `tokenusage sync` still works when you explicitly run it.",
      `- ${describeTaskOutcome(task, false)}`,
      alreadyPaused ? "(Already paused — state refreshed.)" : null,
      "",
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

async function cmdResume() {
  const { trackerDir } = await resolveTrackerPaths({ home: os.homedir() });
  const wasPaused = isCollectionPaused(trackerDir);

  setCollectionPaused(trackerDir, false);
  const task = setWindowsTaskEnabled(true);

  process.stdout.write(
    [
      "Collection resumed.",
      "- Auto syncs report runs again (empty runs included).",
      `- ${describeTaskOutcome(task, true)}`,
      wasPaused ? null : "(Was not paused — nothing to do.)",
      "",
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

module.exports = { cmdPause, cmdResume };
