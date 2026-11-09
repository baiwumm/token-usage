"use strict";

// `tokenusage pause` / `tokenusage resume` (0.2.0): the collection switch.
//
// pause writes the cross-platform flag in ~/.tokenusage (auto-flavored syncs
// — scheduled/notify/retry/watch — check it and exit silently) and disables the
// registered auto-sync schedule (Task Scheduler / launchd / systemd --user) so
// the trigger itself stops firing. resume reverses both. The flag is the source
// of truth; the schedule toggle is a convenience, so a missing or unregistered
// schedule is reported, not an error.

const os = require("node:os");

const { resolveTrackerPaths } = require("../lib/tracker-paths");
const {
  isCollectionPaused,
  setCollectionPaused,
} = require("../lib/collection-pause");
const {
  setAutoSyncEnabled,
  formatScheduleToggle,
} = require("../lib/scheduled-task");

async function cmdPause() {
  const { trackerDir } = await resolveTrackerPaths({ home: os.homedir() });
  const alreadyPaused = isCollectionPaused(trackerDir);

  await setCollectionPaused(trackerDir, true);
  const schedule = setAutoSyncEnabled(false);

  process.stdout.write(
    [
      "Collection paused.",
      "- Scheduled/notify/watch syncs will exit silently without uploading.",
      "- Manual `tokenusage sync` still works when you explicitly run it.",
      `- ${formatScheduleToggle(schedule, false)}`,
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

  await setCollectionPaused(trackerDir, false);
  const schedule = setAutoSyncEnabled(true);

  process.stdout.write(
    [
      "Collection resumed.",
      "- Auto syncs report runs again (empty runs included).",
      `- ${formatScheduleToggle(schedule, true)}`,
      wasPaused ? null : "(Was not paused — nothing to do.)",
      "",
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

module.exports = { cmdPause, cmdResume };
