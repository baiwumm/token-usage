"use strict";

// Auto-sync schedule registration. init "takes over" the schedule that the
// 0.1.0 runbook left to a manual cron entry; three platforms, one contract:
//
//   Windows   Task Scheduler task "TokenUsageSync"  → wscript + hidden VBS runner
//   macOS     LaunchAgent com.token-usage.sync      → /bin/sh launcher script
//   Linux     systemd --user timer token-usage-sync → /bin/sh launcher script
//
// The schedule only decides *when* sync runs. Every generated action runs
// `sync --from-scheduled`, which reports trigger=scheduled, self-logs into
// <trackerDir>/logs/sync.log and uploads without consulting the cloud-sync
// preference (the registered schedule is the default collection path, not an
// opt-in flavor). pause/resume toggle the schedule AND write the pause flag;
// the flag is the source of truth, so a machine whose schedule could not be
// registered still behaves.
//
// Windows specifics: the action launches the VBS wrapper (GUI subsystem → no
// conhost flash), which runs node fully hidden and propagates the exit code.
// The task definition is registered from XML (not `-SC HOURLY`) so it can carry
// StartWhenAvailable (catch up after a missed hour), a logon trigger (a reboot
// resumes collection immediately) and RestartOnFailure (retry a crashed pass)
// — those three are the reason the upstream CLI shelled out to PowerShell.
//
// Everything here is best-effort: a missing schtasks/launchctl/systemctl or an
// access error must never fail init/pause/resume/uninstall.

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const TASK_NAME = "TokenUsageSync";
const VBS_FILE = "run-sync-hidden.vbs";
const LAUNCHER_FILE = "run-sync-scheduled.sh";
const TASK_XML_FILE = "TokenUsageSync.xml";
const LAUNCH_AGENT_LABEL = "com.token-usage.sync";
const SYSTEMD_SERVICE_UNIT = "token-usage-sync.service";
const SYSTEMD_TIMER_UNIT = "token-usage-sync.timer";
const SCHEDULE_INTERVAL_SECONDS = 3600;

function isWindows() {
  return process.platform === "win32";
}

// "windows" | "macos" | "linux" | "unknown" — the single platform switch every
// dispatcher below reads, and the only thing tests have to override.
function schedulePlatform(platform = process.platform) {
  if (platform === "win32") return "windows";
  if (platform === "darwin") return "macos";
  if (platform === "linux") return "linux";
  return "unknown";
}

function vbsPathFor(binDir) {
  return path.join(binDir, VBS_FILE);
}

function launcherPathFor(binDir) {
  return path.join(binDir, LAUNCHER_FILE);
}

function taskXmlPathFor(binDir) {
  return path.join(binDir, TASK_XML_FILE);
}

function launchAgentPath(home = os.homedir()) {
  return path.join(home, "Library", "LaunchAgents", `${LAUNCH_AGENT_LABEL}.plist`);
}

function systemdUserDir(home = os.homedir()) {
  return path.join(home, ".config", "systemd", "user");
}

function systemdServicePath(home = os.homedir()) {
  return path.join(systemdUserDir(home), SYSTEMD_SERVICE_UNIT);
}

function systemdTimerPath(home = os.homedir()) {
  return path.join(systemdUserDir(home), SYSTEMD_TIMER_UNIT);
}

function scheduleLogDir(home = os.homedir()) {
  return path.join(home, ".tokenusage", "tracker", "logs");
}

// Label a user sees in the platform's own control panel / unit list.
function scheduleLabel(platform = process.platform) {
  switch (schedulePlatform(platform)) {
    case "windows":
      return TASK_NAME;
    case "macos":
      return LAUNCH_AGENT_LABEL;
    case "linux":
      return SYSTEMD_TIMER_UNIT;
    default:
      return TASK_NAME;
  }
}

// The schedule must launch the package's CLI entry, not src/cli.js: the latter
// is a library that only exports run(), so a hidden `node src/cli.js sync ...`
// exits 0 having collected nothing (the schedule then looks successful forever).
function cliEntryPath() {
  return path.resolve(__dirname, "..", "..", "bin", "tokenusage.js");
}

/**
 * The Windows hidden-runner wrapper. Paths are quoted individually (via
 * Chr(34), so the VBS has no quote-escaping puzzles) and cmd is NOT involved:
 * wscript runs node directly, so the cmd /c outer-quote-stripping pitfall
 * (paths with spaces) never applies.
 *
 * `fallbackCliJs` is the init-copied runtime (trackerDir/app/bin/tracker.js).
 * The primary path lives in npm's global prefix, which nvm-windows makes
 * version-specific: after `nvm use` the package is gone from that prefix and
 * an unconditional launch would fail every hour with "file not found". The
 * fallback keeps collecting (with the last init-copied build) instead.
 */
function buildHiddenRunnerVbs({ nodeExe, cliJs, fallbackCliJs }) {
  // --from-scheduled: the run reports trigger=scheduled, self-logs via autoLog
  // and uploads without consulting the cloud-sync preference.
  const lines = [
    "' Token Usage — hidden sync runner.",
    "' The scheduled task launches this script (GUI subsystem: no conhost",
    "' flash); it runs the sync fully hidden and returns its exit code so the",
    "' task's LastTaskResult stays meaningful. Sync output lands in the CLI's",
    "' own rolling logs/sync.log — no shell redirect involved.",
    "Dim shell, fso, nodeExe, cliJs, cmd, q",
    "Set shell = CreateObject(\"WScript.Shell\")",
    "Set fso = CreateObject(\"Scripting.FileSystemObject\")",
    "q = Chr(34)",
    `nodeExe = "${nodeExe}"`,
    `cliJs = "${cliJs}"`,
  ];
  if (fallbackCliJs) {
    lines.push(
      "' npm's global prefix is version-specific under nvm-windows, so the",
      "' path above disappears after `nvm use`. init also copies a",
      "' self-contained runtime into the data dir; fall back to it rather than",
      "' failing the hourly run with \"file not found\".",
      `If Not fso.FileExists(cliJs) Then cliJs = "${fallbackCliJs}"`,
    );
  }
  lines.push(
    "cmd = q & nodeExe & q & \" \" & q & cliJs & q & \" sync --from-scheduled\"",
    "WScript.Quit shell.Run(cmd, 0, True)",
    "",
  );
  return lines.join("\n");
}

function writeHiddenRunner({
  binDir,
  nodeExe = process.execPath,
  cliJs = cliEntryPath(),
  fallbackCliJs,
}) {
  fs.mkdirSync(binDir, { recursive: true });
  const vbsPath = vbsPathFor(binDir);
  // wscript.exe reads a BOM-less .vbs with the system ANSI code page (GBK on
  // Chinese Windows), so a UTF-8 path containing a non-ASCII username turns
  // into mojibake and the hourly run cannot find node. UTF-16LE + BOM is what
  // Windows Script Host expects; the XML definition already follows the same
  // rule.
  const body = buildHiddenRunnerVbs({ nodeExe, cliJs, fallbackCliJs });
  fs.writeFileSync(vbsPath, Buffer.from(`\uFEFF${body}`, "utf16le"), { mode: 0o600 });
  return vbsPath;
}

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function shSingleQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

/**
 * POSIX launcher shared by macOS (launchd) and Linux (systemd --user). Keeping
 * the fallback logic inside a script file — instead of inline in ProgramArguments
 * or ExecStart — avoids two different quoting grammars (launchd XML vs systemd
 * unit parsing) for the same paths.
 */
function buildSyncLauncherScript({ nodeExe = process.execPath, cliJs = cliEntryPath(), fallbackCliJs }) {
  const lines = [
    "#!/bin/sh",
    "# Token Usage — scheduled sync launcher (generated by `tokenusage init`).",
    "# Edited by hand? Re-run `tokenusage init` instead: it rewrites this file.",
    `NODE=${shSingleQuote(nodeExe)}`,
    `CLI=${shSingleQuote(cliJs)}`,
  ];
  if (fallbackCliJs) {
    // nvm / homebrew upgrades move or drop the package path; the init-copied
    // runtime under the data dir keeps collecting instead of failing silently.
    lines.push(
      `if [ ! -f "$CLI" ]; then CLI=${shSingleQuote(fallbackCliJs)}; fi`,
    );
  }
  lines.push('exec "$NODE" "$CLI" sync --from-scheduled', "");
  return lines.join("\n");
}

function writeSyncLauncher({ binDir, nodeExe, cliJs = cliEntryPath(), fallbackCliJs }) {
  fs.mkdirSync(binDir, { recursive: true });
  const launcherPath = launcherPathFor(binDir);
  fs.writeFileSync(
    launcherPath,
    buildSyncLauncherScript({ nodeExe, cliJs, fallbackCliJs }),
    { mode: 0o700 },
  );
  return launcherPath;
}

// Task Scheduler start boundary: local time, top of the next hour. A past
// boundary with a 1-hour repetition makes the scheduler fire immediately-ish
// and then hourly; a future one would delay the first pass by up to an hour.
function formatTaskStartBoundary(now = new Date()) {
  const next = new Date(now.getTime());
  next.setMinutes(0, 0, 0);
  next.setHours(next.getHours() + 1);
  const pad = (n) => String(n).padStart(2, "0");
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}T${pad(next.getHours())}:00:00`;
}

/**
 * Task definition registered with `schtasks /Create /XML`. Compared to the
 * plain `-SC HOURLY` registration this adds:
 *   StartWhenAvailable  — a missed hour (machine asleep) runs as soon as it can
 *   LogonTrigger        — a reboot/logon resumes collection without waiting an hour
 *   RestartOnFailure    — a crashed/erroring pass is retried up to 3 times
 *   ExecutionTimeLimit 0 — a long backlog drain is never killed mid-upload
 * MultipleInstancesPolicy=IgnoreNew keeps a second pass from racing the first
 * (the CLI also holds sync.lock; this is the outer guard).
 */
function buildWindowsTaskXml({ vbsPath, startBoundary = formatTaskStartBoundary() }) {
  // Element order mirrors what `schtasks /Query /XML` exports, so the
  // definition passes the scheduler's validation on every Windows build.
  return [
    '<?xml version="1.0" encoding="UTF-16"?>',
    '<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">',
    "  <RegistrationInfo>",
    `    <URI>\\${TASK_NAME}</URI>`,
    "    <Author>Token Usage</Author>",
    "    <Description>Hourly Token Usage sync (hidden). Registered by `tokenusage init`.</Description>",
    "  </RegistrationInfo>",
    "  <Triggers>",
    "    <CalendarTrigger>",
    "      <Repetition>",
    "        <Interval>PT1H</Interval>",
    "        <StopAtDurationEnd>false</StopAtDurationEnd>",
    "      </Repetition>",
    `      <StartBoundary>${startBoundary}</StartBoundary>`,
    "      <Enabled>true</Enabled>",
    "      <ScheduleByDay>",
    "        <DaysInterval>1</DaysInterval>",
    "      </ScheduleByDay>",
    "    </CalendarTrigger>",
    "    <LogonTrigger>",
    "      <Enabled>true</Enabled>",
    "    </LogonTrigger>",
    "  </Triggers>",
    "  <Principals>",
    '    <Principal id="Author">',
    "      <LogonType>InteractiveToken</LogonType>",
    "      <RunLevel>LeastPrivilege</RunLevel>",
    "    </Principal>",
    "  </Principals>",
    "  <Settings>",
    "    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>",
    "    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>",
    "    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>",
    "    <AllowHardTerminate>true</AllowHardTerminate>",
    "    <StartWhenAvailable>true</StartWhenAvailable>",
    "    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>",
    "    <IdleSettings>",
    "      <StopOnIdleEnd>false</StopOnIdleEnd>",
    "      <RestartOnIdle>false</RestartOnIdle>",
    "    </IdleSettings>",
    "    <AllowStartOnDemand>true</AllowStartOnDemand>",
    "    <Enabled>true</Enabled>",
    "    <Hidden>false</Hidden>",
    "    <RunOnlyIfIdle>false</RunOnlyIfIdle>",
    "    <WakeToRun>false</WakeToRun>",
    "    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>",
    "    <Priority>7</Priority>",
    "    <RestartOnFailure>",
    "      <Interval>PT5M</Interval>",
    "      <Count>3</Count>",
    "    </RestartOnFailure>",
    "  </Settings>",
    '  <Actions Context="Author">',
    "    <Exec>",
    "      <Command>wscript.exe</Command>",
    `      <Arguments>"${xmlEscape(vbsPath)}"</Arguments>`,
    "    </Exec>",
    "  </Actions>",
    "</Task>",
    "",
  ].join("\n");
}

function buildLaunchAgentPlist({
  launcherPath,
  logDir = scheduleLogDir(),
  label = LAUNCH_AGENT_LABEL,
  intervalSeconds = SCHEDULE_INTERVAL_SECONDS,
}) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    "<dict>",
    "  <key>Label</key>",
    `  <string>${xmlEscape(label)}</string>`,
    "  <key>ProgramArguments</key>",
    "  <array>",
    "    <string>/bin/sh</string>",
    `    <string>${xmlEscape(launcherPath)}</string>`,
    "  </array>",
    "  <key>StartInterval</key>",
    `  <integer>${intervalSeconds}</integer>`,
    "  <key>RunAtLoad</key>",
    "  <true/>",
    "  <key>ProcessType</key>",
    "  <string>Background</string>",
    "  <key>StandardOutPath</key>",
    `  <string>${xmlEscape(path.join(logDir, "scheduled.out.log"))}</string>`,
    "  <key>StandardErrorPath</key>",
    `  <string>${xmlEscape(path.join(logDir, "scheduled.err.log"))}</string>`,
    "</dict>",
    "</plist>",
    "",
  ].join("\n");
}

// systemd treats `%` as a specifier, so a path containing one must be doubled
// inside a unit file.
function systemdLiteral(value) {
  return String(value).replace(/%/g, "%%");
}

function buildSystemdService({ launcherPath }) {
  return [
    "[Unit]",
    "Description=Token Usage hourly sync",
    "Wants=network-online.target",
    "After=network-online.target",
    "",
    "[Service]",
    "Type=oneshot",
    `ExecStart=/bin/sh ${systemdLiteral(launcherPath)}`,
    "Nice=10",
    "",
  ].join("\n");
}

function buildSystemdTimer({ intervalSeconds = SCHEDULE_INTERVAL_SECONDS } = {}) {
  const minutes = Math.round(intervalSeconds / 60);
  return [
    "[Unit]",
    "Description=Run the Token Usage sync hourly",
    "",
    "[Timer]",
    `OnBootSec=${minutes}min`,
    `OnUnitInactiveSec=${minutes}min`,
    "Persistent=true",
    "AccuracySec=1min",
    "",
    "[Install]",
    "WantedBy=timers.target",
    "",
  ].join("\n");
}

function run(command, args) {
  execFileSync(command, args, { stdio: "pipe", windowsHide: true });
}

// `stdio: "pipe"` keeps the child's own output on `error.stderr` / `stdout`,
// while `error.message` starts with a command echo ("Command failed: schtasks
// /Create /XML C:\Users\me\..."). Reading the message first buried the real
// reason — the non-elevated Windows rejection "ERROR: Access is denied."
// lands on the *second* line and was clipped away. Child output wins; the
// command echo is the last resort.
//
// Windows console tools also write their message in the console codepage, not
// UTF-8: a zh-CN "schtasks" prints "错误: 拒绝访问。" as GBK bytes, which decode
// to replacement characters and reached the user as mojibake. decodeStream()
// retries with the active codepage before giving up on the original text.
const CONSOLE_CODEPAGE_DECODERS = {
  932: "shift_jis",
  936: "gbk",
  949: "euc-kr",
  950: "big5",
};

// UTF-8 itself (65001) and the legacy single-byte pages need no decoder here.
function consoleEncoding(codepage) {
  return CONSOLE_CODEPAGE_DECODERS[codepage] || null;
}

let cachedConsoleDecoder;

function consoleDecoder() {
  if (cachedConsoleDecoder !== undefined) return cachedConsoleDecoder;
  cachedConsoleDecoder = null;
  if (process.platform !== "win32") return null;
  try {
    // "Active code page: 936" — digits survive any localisation.
    const output = execFileSync("chcp.com", [], { stdio: "pipe", windowsHide: true })
      .toString("latin1");
    const codepage = Number((output.match(/\d{3,5}/) || [])[0]);
    const encoding = consoleEncoding(codepage);
    if (encoding) cachedConsoleDecoder = new TextDecoder(encoding);
  } catch (_error) {
    cachedConsoleDecoder = null;
  }
  return cachedConsoleDecoder;
}

function decodeStream(value, fallbackDecoder) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  const utf8 = bytes.toString("utf8");
  if (!utf8.includes("\uFFFD")) return utf8;
  const decoder = fallbackDecoder || consoleDecoder();
  if (!decoder) return utf8;
  const decoded = decoder.decode(bytes);
  return decoded.includes("\uFFFD") ? utf8 : decoded;
}

function firstLine(value) {
  return (
    String(value ?? "")
      .split(/\r?\n/)
      .map((part) => part.trim())
      .find(Boolean) ?? ""
  );
}

function clipLine(line, max) {
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

function errorText(error, max = 200) {
  for (const stream of [error?.stderr, error?.stdout]) {
    const line = firstLine(decodeStream(stream));
    if (line) return clipLine(line, max);
  }
  return clipLine(firstLine(decodeStream(error?.message)), max);
}

/**
 * Register (idempotently) the hourly hidden schedule. Returns
 * {registered, platform, label, reason, degraded} instead of throwing.
 */
function registerAutoSyncSchedule({
  binDir,
  home = os.homedir(),
  cliJs = cliEntryPath(),
  nodeExe = process.execPath,
  fallbackCliJs,
  platform = process.platform,
  now = new Date(),
} = {}) {
  const kind = schedulePlatform(platform);
  const label = scheduleLabel(platform);
  if (kind === "windows") {
    const outcome = registerWindowsScheduledTask({ binDir, cliJs, nodeExe, fallbackCliJs, now });
    return { ...outcome, platform: kind, label };
  }
  if (kind === "macos") {
    return registerLaunchAgent({ binDir, home, cliJs, nodeExe, fallbackCliJs });
  }
  if (kind === "linux") {
    return registerSystemdTimer({ binDir, home, cliJs, nodeExe, fallbackCliJs });
  }
  return { registered: false, platform: kind, label, reason: "unsupported_platform" };
}

function registerWindowsScheduledTask({ binDir, cliJs = cliEntryPath(), nodeExe = process.execPath, fallbackCliJs, now = new Date() }) {
  if (!isWindows()) return { registered: false, reason: "not_windows" };
  try {
    const vbsPath = writeHiddenRunner({ binDir, nodeExe, cliJs, fallbackCliJs });
    const xmlPath = taskXmlPathFor(binDir);
    const xml = buildWindowsTaskXml({ vbsPath, startBoundary: formatTaskStartBoundary(now) });
    // schtasks only accepts a Unicode (UTF-16) definition file.
    fs.writeFileSync(xmlPath, `\uFEFF${xml}`, { encoding: "utf16le", mode: 0o600 });
    try {
      run("schtasks", ["/Create", "/F", "/TN", TASK_NAME, "/XML", xmlPath]);
      return { registered: true, vbsPath, xmlPath };
    } catch (xmlError) {
      // Locked-down policies and older builds can reject a custom definition;
      // fall back to the plain hourly trigger (loses catch-up/retry but still
      // collects), and say so instead of reporting a clean install.
      run("schtasks", [
        "/Create", "/F",
        "/SC", "HOURLY", "/MO", "1",
        "/TN", TASK_NAME,
        "/TR", `wscript.exe "${vbsPath}"`,
      ]);
      return {
        registered: true,
        degraded: true,
        reason: "xml_rejected",
        detail: errorText(xmlError),
        vbsPath,
        xmlPath,
      };
    }
  } catch (error) {
    return { registered: false, reason: errorText(error) };
  }
}

function registerLaunchAgent({ binDir, home = os.homedir(), cliJs = cliEntryPath(), nodeExe = process.execPath, fallbackCliJs }) {
  try {
    const launcherPath = writeSyncLauncher({ binDir, nodeExe, cliJs, fallbackCliJs });
    const plistPath = launchAgentPath(home);
    fs.mkdirSync(path.dirname(plistPath), { recursive: true });
    const logDir = scheduleLogDir(home);
    fs.mkdirSync(logDir, { recursive: true });
    fs.writeFileSync(plistPath, buildLaunchAgentPlist({ launcherPath, logDir }), { mode: 0o644 });
    const uid = typeof process.getuid === "function" ? process.getuid() : 501;
    // bootout first: bootstrap fails when the label is already loaded, and a
    // re-run of init must be able to overwrite its own agent.
    try {
      run("launchctl", ["bootout", `gui/${uid}/${LAUNCH_AGENT_LABEL}`]);
    } catch {
      /* not loaded yet — expected on a first install */
    }
    try {
      run("launchctl", ["bootstrap", `gui/${uid}`, plistPath]);
    } catch (error) {
      // Older macOS releases have no bootstrap subcommand.
      run("launchctl", ["load", "-w", plistPath]);
      return { registered: true, launcherPath, plistPath, degraded: true, reason: "legacy_launchctl", detail: errorText(error) };
    }
    return { registered: true, launcherPath, plistPath };
  } catch (error) {
    return { registered: false, reason: errorText(error) };
  }
}

function registerSystemdTimer({ binDir, home = os.homedir(), cliJs = cliEntryPath(), nodeExe = process.execPath, fallbackCliJs }) {
  try {
    const launcherPath = writeSyncLauncher({ binDir, nodeExe, cliJs, fallbackCliJs });
    const servicePath = systemdServicePath(home);
    const timerPath = systemdTimerPath(home);
    fs.mkdirSync(path.dirname(servicePath), { recursive: true });
    fs.writeFileSync(servicePath, buildSystemdService({ launcherPath }), { mode: 0o644 });
    fs.writeFileSync(timerPath, buildSystemdTimer(), { mode: 0o644 });
    run("systemctl", ["--user", "daemon-reload"]);
    run("systemctl", ["--user", "enable", "--now", SYSTEMD_TIMER_UNIT]);
    return { registered: true, launcherPath, servicePath, timerPath };
  } catch (error) {
    return { registered: false, reason: errorText(error) };
  }
}

// Existence probe so pause/resume can report "not registered" (expected on
// machines that never ran init with a schedule) distinctly from a real toggle
// failure. Files first (cheap, non-fatal); platform tools only confirm.
function scheduleState({ home = os.homedir(), platform = process.platform } = {}) {
  const kind = schedulePlatform(platform);
  if (kind === "windows") {
    if (!isWindows()) return "unknown";
    try {
      run("schtasks", ["/Query", "/TN", TASK_NAME]);
      return "registered";
    } catch {
      return "missing";
    }
  }
  if (kind === "macos") {
    return fs.existsSync(launchAgentPath(home)) ? "registered" : "missing";
  }
  if (kind === "linux") {
    return fs.existsSync(systemdTimerPath(home)) ? "registered" : "missing";
  }
  return "unknown";
}

/**
 * Best-effort enable/disable of the registered schedule (pause/resume).
 * "Not registered" is an expected, non-fatal state: the pause flag still
 * guards every auto flavor.
 */
function setAutoSyncEnabled(enabled, { home = os.homedir(), platform = process.platform } = {}) {
  const kind = schedulePlatform(platform);
  const label = scheduleLabel(platform);
  if (kind === "windows") {
    if (!isWindows()) return { changed: false, platform: kind, label, reason: "unsupported_platform" };
    try {
      run("schtasks", ["/Change", "/TN", TASK_NAME, enabled ? "/ENABLE" : "/DISABLE"]);
      return { changed: true, platform: kind, label };
    } catch (error) {
      return { changed: false, platform: kind, label, reason: errorText(error) };
    }
  }
  if (kind === "macos") {
    const plistPath = launchAgentPath(home);
    if (!fs.existsSync(plistPath)) {
      return { changed: false, platform: kind, label, reason: "schedule_missing" };
    }
    const uid = typeof process.getuid === "function" ? process.getuid() : 501;
    const domain = `gui/${uid}/${LAUNCH_AGENT_LABEL}`;
    try {
      if (enabled) run("launchctl", ["bootstrap", `gui/${uid}`, plistPath]);
      else run("launchctl", ["bootout", domain]);
    } catch (error) {
      // Already loaded (resume) or already unloaded (pause) are both no-ops.
      if (isBenignLaunchctlFailure(error)) {
        return { changed: true, platform: kind, label };
      }
      return { changed: false, platform: kind, label, reason: errorText(error) };
    }
    return { changed: true, platform: kind, label };
  }
  if (kind === "linux") {
    if (!fs.existsSync(systemdTimerPath(home))) {
      return { changed: false, platform: kind, label, reason: "schedule_missing" };
    }
    try {
      if (enabled) run("systemctl", ["--user", "enable", "--now", SYSTEMD_TIMER_UNIT]);
      else run("systemctl", ["--user", "disable", "--now", SYSTEMD_TIMER_UNIT]);
      return { changed: true, platform: kind, label };
    } catch (error) {
      return { changed: false, platform: kind, label, reason: errorText(error) };
    }
  }
  return { changed: false, platform: kind, label, reason: "unsupported_platform" };
}

function isBenignLaunchctlFailure(error) {
  const text = String(error?.stderr || error?.message || error);
  // launchd says "already bootstrapped" / "service not found"; neither is a
  // real failure for our purpose (resume when loaded, pause when absent).
  return /already (bootstrapped|loaded)/i.test(text) ||
    /service not found|no such (process|service)|not find service/i.test(text);
}

// uninstall teardown: delete the task/agent/timer and the generated runner
// files (best-effort, idempotent).
function deleteAutoSyncSchedule({ home = os.homedir(), binDir, platform = process.platform } = {}) {
  const kind = schedulePlatform(platform);
  const label = scheduleLabel(platform);
  const removals = [];
  if (binDir) {
    for (const file of [VBS_FILE, LAUNCHER_FILE, TASK_XML_FILE]) {
      try {
        fs.unlinkSync(path.join(binDir, file));
        removals.push(file);
      } catch {
        /* never installed on this platform */
      }
    }
  }
  if (kind === "windows") {
    if (!isWindows()) return { deleted: false, platform: kind, label, reason: "unsupported_platform" };
    try {
      run("schtasks", ["/Delete", "/F", "/TN", TASK_NAME]);
      return { deleted: true, platform: kind, label };
    } catch (error) {
      return { deleted: false, platform: kind, label, reason: errorText(error) };
    }
  }
  if (kind === "macos") {
    const plistPath = launchAgentPath(home);
    const uid = typeof process.getuid === "function" ? process.getuid() : 501;
    try {
      run("launchctl", ["bootout", `gui/${uid}/${LAUNCH_AGENT_LABEL}`]);
    } catch {
      /* not loaded — still remove the file below */
    }
    try {
      fs.unlinkSync(plistPath);
      return { deleted: true, platform: kind, label };
    } catch (error) {
      return { deleted: false, platform: kind, label, reason: errorText(error) };
    }
  }
  if (kind === "linux") {
    try {
      run("systemctl", ["--user", "disable", "--now", SYSTEMD_TIMER_UNIT]);
    } catch {
      /* unit not loaded or systemd unavailable — remove the files below */
    }
    let deleted = false;
    for (const unitPath of [systemdServicePath(home), systemdTimerPath(home)]) {
      try {
        fs.unlinkSync(unitPath);
        deleted = true;
      } catch {
        /* not installed */
      }
    }
    try {
      run("systemctl", ["--user", "daemon-reload"]);
    } catch {
      /* systemd unavailable */
    }
    return deleted
      ? { deleted: true, platform: kind, label }
      : { deleted: false, platform: kind, label, reason: "schedule_missing" };
  }
  return { deleted: false, platform: kind, label, reason: "unsupported_platform" };
}

// One place for the init summary copy so Windows/macOS/Linux cannot drift.
//
// Degraded registrations carry the raw rejection in `detail`. On a normal
// (non-elevated) Windows install `schtasks /Create /XML` always fails with
// "Access is denied", so showing that first line lets the user tell "re-run as
// administrator" apart from a genuinely malformed definition. Clip it to one
// short line so the summary table stays readable.
function scheduleDetailLine(value, max = 100) {
  return clipLine(firstLine(value), max);
}

function formatScheduleRegistration(outcome) {
  if (!outcome) return "not registered";
  if (outcome.registered) {
    const when = "hourly, hidden window";
    if (outcome.degraded) {
      const why = scheduleDetailLine(outcome.detail);
      return `${outcome.label}: ${when} (degraded: ${outcome.reason}${why ? ` — ${why}` : ""}; no catch-up/retry settings)`;
    }
    return `${outcome.label}: ${when} (pause/resume toggles it)`;
  }
  if (outcome.reason === "unsupported_platform") {
    return "Unsupported platform; schedule `tokenusage sync` yourself (cron/launchd)";
  }
  return `Not registered: ${outcome.reason}`;
}

function formatScheduleToggle(outcome, enabled) {
  const action = enabled ? "enabled" : "disabled";
  if (outcome?.changed) return `${outcome.label} ${action}.`;
  if (outcome?.reason === "unsupported_platform") {
    return `(Scheduled sync: not supported on this platform — the pause flag covers manual/cron runs).`;
  }
  if (outcome?.reason === "schedule_missing") {
    return `${outcome.label} not found (nothing to ${action}) — the pause flag still guards all auto syncs.`;
  }
  return `${outcome?.label || TASK_NAME} could not be ${action} (${outcome?.reason || "unknown error"}) — the pause flag still guards all auto syncs.`;
}

function formatScheduleDelete(outcome) {
  if (outcome?.deleted) return `- Scheduled sync deleted: ${outcome.label}`;
  if (outcome?.reason === "unsupported_platform") return "- Scheduled sync: none (unsupported platform)";
  return "- Scheduled sync: none";
}

module.exports = {
  TASK_NAME,
  VBS_FILE,
  LAUNCHER_FILE,
  TASK_XML_FILE,
  LAUNCH_AGENT_LABEL,
  SYSTEMD_SERVICE_UNIT,
  SYSTEMD_TIMER_UNIT,
  SCHEDULE_INTERVAL_SECONDS,
  isWindows,
  schedulePlatform,
  vbsPathFor,
  launcherPathFor,
  taskXmlPathFor,
  launchAgentPath,
  systemdUserDir,
  systemdServicePath,
  systemdTimerPath,
  cliEntryPath,
  buildHiddenRunnerVbs,
  writeHiddenRunner,
  buildSyncLauncherScript,
  writeSyncLauncher,
  buildWindowsTaskXml,
  buildLaunchAgentPlist,
  buildSystemdService,
  buildSystemdTimer,
  formatTaskStartBoundary,
  registerAutoSyncSchedule,
  registerWindowsScheduledTask,
  registerLaunchAgent,
  registerSystemdTimer,
  scheduleState,
  scheduleLabel,
  setAutoSyncEnabled,
  deleteAutoSyncSchedule,
  formatScheduleRegistration,
  formatScheduleToggle,
  formatScheduleDelete,
  consoleEncoding,
  decodeStream,
  errorText,
};
