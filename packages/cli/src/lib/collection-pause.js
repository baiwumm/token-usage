"use strict";

// Collection pause flag + run-report preference (0.2.0, docs/cli-contract.md
// §2.11). The pause flag is a tiny JSON marker in ~/.tokenusage so the check
// stays cross-platform: cron/launchd/scheduled-task runs all execute `sync`,
// and sync itself consults the flag — no platform automation changes needed
// to stop collecting. The run-report preference lives in config.json
// (`runReport: false` disables §2.11 reporting); absent means enabled
// (default on), so pre-0.2.0 configs report without any migration.

const fs = require("node:fs");
const path = require("node:path");

const PAUSE_FILE = "pause.flag.json";
const RUN_REPORT_KEY = "runReport";

function pauseFilePath(trackerDir) {
  return path.join(trackerDir, PAUSE_FILE);
}

// Missing or unreadable marker → not paused: a corrupt flag must never
// silently stop collection.
function isCollectionPaused(trackerDir) {
  try {
    const parsed = JSON.parse(fs.readFileSync(pauseFilePath(trackerDir), "utf8"));
    return parsed?.paused === true;
  } catch {
    return false;
  }
}

function readCollectionPause(trackerDir) {
  if (!isCollectionPaused(trackerDir)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(pauseFilePath(trackerDir), "utf8"));
    return { paused: true, at: typeof parsed.at === "string" ? parsed.at : null };
  } catch {
    return { paused: true, at: null };
  }
}

function setCollectionPaused(trackerDir, paused, { at = new Date().toISOString() } = {}) {
  fs.mkdirSync(trackerDir, { recursive: true });
  const file = pauseFilePath(trackerDir);

  if (!paused) {
    try {
      fs.unlinkSync(file);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    return;
  }

  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify({ paused: true, at })}\n`, { mode: 0o600 });
  fs.renameSync(tmp, file);
}

function isRunReportEnabled(trackerDir) {
  try {
    const config = JSON.parse(fs.readFileSync(path.join(trackerDir, "config.json"), "utf8"));
    return config?.runReport !== false;
  } catch {
    return true;
  }
}

module.exports = {
  PAUSE_FILE,
  RUN_REPORT_KEY,
  pauseFilePath,
  isCollectionPaused,
  readCollectionPause,
  setCollectionPaused,
  isRunReportEnabled,
};
