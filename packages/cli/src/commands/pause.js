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
const { parseFlags } = require("../lib/cli-flags");

// pause/resume used to receive no argv at all, so `tokenusage pause --json`
// (or any typo) silently paused collection and exited 0 — the one command
// where a surprise state change is worst. `--json` is the only accepted flag;
// every other command already offers it for script consumption.
const PAUSE_FLAGS = {
  command: "pause",
  defaults: { json: false },
  flags: [{ flag: "--json", key: "json" }],
};

function parseArgs(argv = [], command = "pause") {
  return parseFlags(argv, { ...PAUSE_FLAGS, command });
}

async function cmdPause(argv = []) {
  const opts = parseArgs(argv, "pause");
  const { trackerDir } = await resolveTrackerPaths({ home: os.homedir() });
  const alreadyPaused = isCollectionPaused(trackerDir);

  await setCollectionPaused(trackerDir, true);
  const schedule = setAutoSyncEnabled(false);

  if (opts.json) {
    process.stdout.write(
      `${JSON.stringify({ ok: true, paused: true, already_paused: alreadyPaused, schedule })}\n`,
    );
    return;
  }

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

async function cmdResume(argv = []) {
  const opts = parseArgs(argv, "resume");
  const { trackerDir } = await resolveTrackerPaths({ home: os.homedir() });
  const wasPaused = isCollectionPaused(trackerDir);

  await setCollectionPaused(trackerDir, false);
  const schedule = setAutoSyncEnabled(true);

  if (opts.json) {
    process.stdout.write(
      `${JSON.stringify({ ok: true, paused: false, was_paused: wasPaused, schedule })}\n`,
    );
    return;
  }

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

module.exports = { cmdPause, cmdResume, parseArgs, flagSpec: PAUSE_FLAGS };
