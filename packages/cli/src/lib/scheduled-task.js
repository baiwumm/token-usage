"use strict";

// Windows Task Scheduler registration for the hourly auto sync (0.2.0).
//
// init "takes over" the registration that 0.1.0 left to a manual runbook:
// the task action launches a VBS wrapper (GUI subsystem — no conhost flash
// on Interactive tasks), which runs `node <cli.js> sync` fully hidden and
// propagates the exit code via WScript.Quit. The CLI logs to a rolling
// <trackerDir>/logs/sync.log itself (autoLog sink), so the registration no
// longer needs a `>>` redirect — which also removes the cmd /c quoting
// pitfall from the manual setup. pause/resume toggle the task with
// /DISABLE //ENABLE so the hourly trigger stops firing while paused; the
// pause flag in collection-pause.js guards everything else (notify/retry/
// watch) cross-platform.
//
// Everything here is best-effort: a missing schtasks or an access error must
// never fail init/pause/resume — the pause flag alone already stops syncs.

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const TASK_NAME = "TokenUsageSync";
const VBS_FILE = "run-sync-hidden.vbs";

function isWindows() {
  return process.platform === "win32";
}

function vbsPathFor(binDir) {
  return path.join(binDir, VBS_FILE);
}

/**
 * The hidden-runner wrapper. Paths are quoted individually and cmd is NOT
 * involved: wscript runs node directly, so the cmd /c outer-quote-stripping
 * pitfall (paths with spaces) never applies.
 */
function buildHiddenRunnerVbs({ nodeExe, cliJs }) {
  return [
    "' Token Usage — hidden sync runner.",
    "' The scheduled task launches this script (GUI subsystem: no conhost",
    "' flash); it runs the sync fully hidden and returns its exit code so the",
    "' task's LastTaskResult stays meaningful. Sync output lands in the CLI's",
    "' own rolling logs/sync.log — no shell redirect involved.",
    "Dim shell",
    "Set shell = CreateObject(\"WScript.Shell\")",
    `WScript.Quit shell.Run("""${nodeExe}"" ""${cliJs}"" sync", 0, True)`,
    "",
  ].join("\n");
}

function writeHiddenRunner({ binDir, nodeExe = process.execPath, cliJs }) {
  fs.mkdirSync(binDir, { recursive: true });
  const vbsPath = vbsPathFor(binDir);
  fs.writeFileSync(vbsPath, buildHiddenRunnerVbs({ nodeExe, cliJs }), { mode: 0o600 });
  return vbsPath;
}

/**
 * Register (idempotently — /F overwrites) the hourly hidden task. Returns
 * {registered: true} or {registered: false, reason} instead of throwing.
 */
function registerWindowsScheduledTask({ binDir, cliJs, nodeExe = process.execPath }) {
  if (!isWindows()) return { registered: false, reason: "not_windows" };
  try {
    const vbsPath = writeHiddenRunner({ binDir, nodeExe, cliJs });
    execFileSync(
      "schtasks",
      [
        "/Create", "/F",
        "/SC", "HOURLY", "/MO", "1",
        "/TN", TASK_NAME,
        "/TR", `wscript.exe "${vbsPath}"`,
      ],
      { stdio: "pipe", windowsHide: true },
    );
    return { registered: true, vbsPath };
  } catch (error) {
    return { registered: false, reason: String(error?.message || error).slice(0, 200) };
  }
}

// Existence probe so pause/resume can report "no task" (expected on machines
// that never registered it) distinctly from a real toggle failure. schtasks
// output is localized; exit codes are not, so this uses /Query success only.
function windowsTaskExists() {
  if (!isWindows()) return null;
  try {
    execFileSync("schtasks", ["/Query", "/TN", TASK_NAME], {
      stdio: "pipe",
      windowsHide: true,
    });
    return true;
  } catch {
    return false;
  }
}

// Best-effort enable/disable of the hourly task (pause/resume). "Task
// missing" is an expected, non-fatal state (uninstalled task, non-Windows,
// never-registered installs) — the pause flag still guards every auto flavor.
function setWindowsTaskEnabled(enabled) {
  if (!isWindows()) return { changed: false, reason: "not_windows" };
  if (windowsTaskExists() === false) {
    return { changed: false, reason: "task_missing" };
  }
  try {
    execFileSync(
      "schtasks",
      ["/Change", "/TN", TASK_NAME, enabled ? "/ENABLE" : "/DISABLE"],
      { stdio: "pipe", windowsHide: true },
    );
    return { changed: true };
  } catch (error) {
    return { changed: false, reason: "error", detail: String(error?.message || error).slice(0, 200) };
  }
}

// uninstall teardown: delete the task (best-effort, idempotent).
function deleteWindowsScheduledTask() {
  if (!isWindows()) return { deleted: false, reason: "not_windows" };
  try {
    execFileSync("schtasks", ["/Delete", "/F", "/TN", TASK_NAME], {
      stdio: "pipe",
      windowsHide: true,
    });
    return { deleted: true };
  } catch (error) {
    return { deleted: false, reason: String(error?.message || error).slice(0, 200) };
  }
}

module.exports = {
  TASK_NAME,
  VBS_FILE,
  isWindows,
  vbsPathFor,
  buildHiddenRunnerVbs,
  writeHiddenRunner,
  registerWindowsScheduledTask,
  windowsTaskExists,
  setWindowsTaskEnabled,
  deleteWindowsScheduledTask,
};
