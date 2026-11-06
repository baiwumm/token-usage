"use strict";

// Auto-sync schedule registration across platforms. Only the generated
// artifacts and the user-facing copy are testable without touching the real
// Task Scheduler / launchd / systemd, but those are exactly the parts that
// silently rot (wrong binary, `%` eaten by systemd, a Windows definition the
// scheduler rejects).

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const {
  TASK_NAME,
  LAUNCH_AGENT_LABEL,
  SYSTEMD_SERVICE_UNIT,
  SYSTEMD_TIMER_UNIT,
  SCHEDULE_INTERVAL_SECONDS,
  schedulePlatform,
  scheduleLabel,
  cliEntryPath,
  buildWindowsTaskXml,
  buildLaunchAgentPlist,
  buildSystemdService,
  buildSystemdTimer,
  buildSyncLauncherScript,
  formatTaskStartBoundary,
  launchAgentPath,
  systemdServicePath,
  systemdTimerPath,
  formatScheduleRegistration,
  formatScheduleToggle,
  formatScheduleDelete,
  consoleEncoding,
  decodeStream,
  errorText,
  writeHiddenRunner,
  windowsUserId,
} = require("../src/lib/scheduled-task");

test("platform routing covers the three supported families", () => {
  assert.equal(schedulePlatform("win32"), "windows");
  assert.equal(schedulePlatform("darwin"), "macos");
  assert.equal(schedulePlatform("linux"), "linux");
  assert.equal(schedulePlatform("freebsd"), "unknown");

  assert.equal(scheduleLabel("win32"), TASK_NAME);
  assert.equal(scheduleLabel("darwin"), LAUNCH_AGENT_LABEL);
  assert.equal(scheduleLabel("linux"), SYSTEMD_TIMER_UNIT);
});

test("the generated runners launch the package bin entry, not src/cli.js", () => {
  const entry = cliEntryPath().replace(/\\/g, "/");
  assert.match(entry, /\/bin\/tokenusage\.js$/);
  assert.ok(!entry.includes("/src/cli.js"));
  assert.equal(SCHEDULE_INTERVAL_SECONDS, 3600);
});

test("the Windows definition carries catch-up, logon trigger and retry settings", () => {
  const xml = buildWindowsTaskXml({
    vbsPath: "C:\\Users\\me\\.tokenusage\\bin\\run-sync-hidden.vbs",
    startBoundary: "2026-11-01T09:00:00",
    userId: "DESKTOP-ME\\me",
  });
  assert.match(xml, /<Interval>PT1H<\/Interval>/, "hourly repetition");
  assert.match(xml, /<StartWhenAvailable>true<\/StartWhenAvailable>/, "a missed hour must catch up");
  assert.match(xml, /<LogonTrigger>/, "a reboot resumes collection without waiting an hour");
  assert.match(
    xml,
    /<LogonTrigger>\s*<UserId>DESKTOP-ME\\me<\/UserId>/,
    "a logon trigger without UserId means 'any user' and schtasks refuses it without elevation",
  );
  assert.match(xml, /<RestartOnFailure>/, "a failed pass is retried");
  assert.match(xml, /<Interval>PT5M<\/Interval>/);
  assert.match(xml, /<Count>3<\/Count>/);
  assert.match(xml, /<ExecutionTimeLimit>PT0S<\/ExecutionTimeLimit>/, "a long drain is never killed");
  assert.match(xml, /<MultipleInstancesPolicy>IgnoreNew<\/MultipleInstancesPolicy>/);
  assert.match(xml, /<Command>wscript\.exe<\/Command>/, "the GUI-subsystem runner hides the window");
  assert.ok(xml.includes('"C:\\Users\\me\\.tokenusage\\bin\\run-sync-hidden.vbs"'));
  assert.ok(!xml.includes("src\\cli.js"));

  // The retry tier: no logon pass, but catch-up/retry/unlimited runtime stay.
  const retry = buildWindowsTaskXml({
    vbsPath: "C:\\Users\\me\\.tokenusage\\bin\\run-sync-hidden.vbs",
    startBoundary: "2026-11-01T09:00:00",
    userId: "DESKTOP-ME\\me",
    logonTrigger: false,
  });
  assert.ok(!retry.includes("<LogonTrigger>"));
  assert.match(retry, /<StartWhenAvailable>true<\/StartWhenAvailable>/);
  assert.match(retry, /<RestartOnFailure>/);
  assert.match(retry, /<ExecutionTimeLimit>PT0S<\/ExecutionTimeLimit>/);
});

test("the logon trigger names the current user so schtasks can register it unelevated", () => {
  assert.equal(
    windowsUserId({ env: { USERDOMAIN: "DESKTOP-ME", USERNAME: "me" } }),
    "DESKTOP-ME\\me",
  );
  // A shell without USERDOMAIN/USERNAME still yields a usable name.
  const fallback = windowsUserId({ env: {} });
  if (fallback) assert.match(fallback, /^.+\\.+$/);
  assert.equal(typeof fallback, "string");
});

test("the hidden runner is UTF-16LE with a BOM so non-ASCII paths survive wscript", () => {
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), "tokenusage-vbs-"));

  try {
    const vbsPath = writeHiddenRunner({
      binDir,
      nodeExe: "C:\\Users\\张三\\AppData\\node.exe",
      cliJs: "C:\\Users\\张三\\AppData\\tokenusage.js",
    });
    const bytes = fs.readFileSync(vbsPath);

    assert.equal(bytes[0], 0xff, "UTF-16LE BOM low byte");
    assert.equal(bytes[1], 0xfe, "UTF-16LE BOM high byte");
    assert.ok(bytes.subarray(2).toString("utf16le").includes("张三"));
  } finally {
    fs.rmSync(binDir, { recursive: true, force: true });
  }
});

test("the Windows start boundary is local time at the top of the next hour", () => {
  const boundary = formatTaskStartBoundary(new Date(2026, 10, 1, 14, 37, 12));
  assert.equal(boundary, "2026-11-01T15:00:00");
  const rollover = formatTaskStartBoundary(new Date(2026, 11, 31, 23, 10, 0));
  assert.equal(rollover, "2027-01-01T00:00:00", "the hour rolls into the next year");
});

test("the macOS LaunchAgent runs hourly at load and logs next to the CLI logs", () => {
  const plist = buildLaunchAgentPlist({
    launcherPath: "/Users/me/.tokenusage/bin/run-sync-scheduled.sh",
    logDir: "/Users/me/.tokenusage/tracker/logs",
  });
  assert.match(plist, /<key>Label<\/key>\s*<string>com\.token-usage\.sync<\/string>/);
  assert.match(plist, /<key>StartInterval<\/key>\s*<integer>3600<\/integer>/);
  assert.match(plist, /<key>RunAtLoad<\/key>\s*<true\/>/);
  assert.ok(plist.includes("<string>/bin/sh</string>"), "the launcher is executed by sh");
  assert.ok(plist.includes("/Users/me/.tokenusage/bin/run-sync-scheduled.sh"));
  assert.ok(plist.includes("scheduled.out.log") && plist.includes("scheduled.err.log"));
});

test("the systemd units are a user timer that survives downtime", () => {
  const service = buildSystemdService({ launcherPath: "/home/me/.tokenusage/bin/run-sync-scheduled.sh" });
  assert.match(service, /Type=oneshot/);
  assert.match(service, /ExecStart=\/bin\/sh \/home\/me\/\.tokenusage\/bin\/run-sync-scheduled\.sh/);

  const timer = buildSystemdTimer();
  assert.match(timer, /OnUnitInactiveSec=60min/, "an hour after the previous pass finishes");
  assert.match(timer, /Persistent=true/, "a missed pass runs after boot");
  assert.match(timer, /WantedBy=timers\.target/);
});

test("systemd percent signs are escaped so they cannot become specifiers", () => {
  const service = buildSystemdService({ launcherPath: "/home/me/100%/run-sync.sh" });
  assert.ok(
    service.includes("ExecStart=/bin/sh /home/me/100%%/run-sync.sh"),
    "a single % would be expanded by systemd and break the command",
  );
});

test("the POSIX launcher falls back to the init runtime and runs --from-scheduled", () => {
  const script = buildSyncLauncherScript({
    nodeExe: "/usr/local/bin/node",
    cliJs: "/opt/npm/lib/node_modules/tokenusage-cli/bin/tokenusage.js",
    fallbackCliJs: "/Users/me/.tokenusage/tracker/app/bin/tracker.js",
  });
  assert.match(script, /^#!\/bin\/sh/);
  assert.ok(script.includes("NODE='/usr/local/bin/node'"));
  assert.ok(script.includes("CLI='/opt/npm/lib/node_modules/tokenusage-cli/bin/tokenusage.js'"));
  assert.ok(script.includes("if [ ! -f \"$CLI\" ]; then CLI='/Users/me/.tokenusage/tracker/app/bin/tracker.js'; fi"));
  assert.ok(script.includes('exec "$NODE" "$CLI" sync --from-scheduled'));

  // No fallback path → no probe line (nothing to fall back to).
  const plain = buildSyncLauncherScript({ nodeExe: "node", cliJs: "/a/b.js" });
  assert.ok(!plain.includes("if [ ! -f"));
  // Spaces survive because every path is single-quoted.
  const spaced = buildSyncLauncherScript({ nodeExe: "/usr/bin/env node", cliJs: "/a b/c.js" });
  assert.ok(spaced.includes("CLI='/a b/c.js'"));
  assert.ok(!spaced.includes('CLI="/a b/c.js"'));
});

test("schedule paths follow the documented home layout", () => {
  const home = path.join(os.tmpdir(), "tokenusage-home");
  assert.equal(launchAgentPath(home), path.join(home, "Library", "LaunchAgents", "com.token-usage.sync.plist"));
  assert.equal(systemdServicePath(home), path.join(home, ".config", "systemd", "user", SYSTEMD_SERVICE_UNIT));
  assert.equal(systemdTimerPath(home), path.join(home, ".config", "systemd", "user", SYSTEMD_TIMER_UNIT));
});

test("error text prefers the child's own output over the command echo", () => {
  // A real `schtasks /Create /XML` rejection: the reason is on stderr, while
  // `message` only repeats the command line.
  const exitError = {
    message: "Command failed: schtasks /Create /F /TN TokenUsageSync /XML C:\\Users\\me\\.tokenusage\\bin\\TokenUsageSync.xml",
    stderr: "ERROR: Access is denied.\r\n",
    stdout: Buffer.alloc(0),
  };
  assert.equal(errorText(exitError), "ERROR: Access is denied.");

  // Multi-line stderr collapses to the first meaningful line.
  assert.equal(
    errorText({ message: "Command failed: x", stderr: "\r\n  Access is denied.  \r\nERROR: second line\r\n" }),
    "Access is denied.",
  );

  // stdout carries the reason when the tool writes there instead.
  assert.equal(errorText({ message: "Command failed: x", stderr: "", stdout: "job not found\n" }), "job not found");

  // A plain filesystem error has no child output: fall back to the message.
  assert.equal(errorText(new Error("EACCES: permission denied")), "EACCES: permission denied");

  // One short line keeps the init summary readable.
  const long = errorText({ stderr: `ERROR: ${"x".repeat(250)}` });
  assert.ok(long.endsWith("…"), "over-long output is clipped");
  assert.ok(long.length <= 200);
});

test("console-codepage output decodes to readable text instead of mojibake", (t) => {
  // Windows console tools print in the active codepage: a zh-CN `schtasks`
  // writes GBK bytes, and decoding them as UTF-8 yields U+FFFD replacements.
  assert.equal(consoleEncoding(936), "gbk");
  assert.equal(consoleEncoding(932), "shift_jis");
  assert.equal(consoleEncoding(950), "big5");
  assert.equal(consoleEncoding(65001), null, "UTF-8 needs no fallback decoder");
  assert.equal(consoleEncoding(437), null, "single-byte pages cannot be mis-decoded");

  let gbk;
  try {
    gbk = new TextDecoder("gbk");
  } catch (_error) {
    t.skip("this Node build has no full ICU (GBK decoder)");
    return;
  }

  // 错误: 拒绝访问。 — the real non-elevated `schtasks /Create /XML` rejection.
  const rejected = Buffer.from("b4edcef33a20bedcbef8b7c3cecaa1a3", "hex");
  assert.equal(decodeStream(rejected, gbk), "错误: 拒绝访问。");

  // Already-valid UTF-8 is returned untouched (no needless re-decoding).
  assert.equal(decodeStream(Buffer.from("ERROR: Access is denied.\n", "utf8"), gbk), "ERROR: Access is denied.\n");

  // Strings and absent values pass through as-is.
  assert.equal(decodeStream("ERROR: Access is denied."), "ERROR: Access is denied.");
  assert.equal(decodeStream(null, gbk), "");
  assert.equal(decodeStream(undefined, gbk), "");

  // Bytes that stay broken under the codepage fall back to the UTF-8 reading.
  const invalid = Buffer.from([0x81, 0x00]);
  assert.ok(gbk.decode(invalid).includes("\uFFFD"), "the sample must be unreadable in GBK too");
  assert.equal(decodeStream(invalid, gbk), invalid.toString("utf8"));
});

test("registration copy distinguishes success, degraded and unsupported", () => {
  assert.equal(
    formatScheduleRegistration({ registered: true, label: TASK_NAME }),
    "TokenUsageSync: hourly, hidden window (pause/resume toggles it)",
  );
  assert.match(
    formatScheduleRegistration({ registered: true, label: TASK_NAME, degraded: true, reason: "xml_rejected" }),
    /degraded: xml_rejected/,
    "a fallback registration must not look clean",
  );
  assert.match(
    formatScheduleRegistration({
      registered: true,
      label: TASK_NAME,
      degraded: true,
      reason: "xml_rejected",
      detail: "ERROR: Access is denied.\r\n",
    }),
    /degraded: xml_rejected — ERROR: Access is denied\./,
    "the rejection reason must be visible, not just the category",
  );
  assert.match(
    formatScheduleRegistration({
      registered: true,
      label: TASK_NAME,
      degraded: true,
      reason: "logon_trigger_rejected",
      detail: "ERROR: Access is denied.\r\n",
    }),
    /degraded: logon_trigger_rejected — ERROR: Access is denied\.; catch-up\/retry kept, no logon trigger/,
    "the retry tier must say what it kept, not that catch-up is gone",
  );
  const clipped = formatScheduleRegistration({
    registered: true,
    label: TASK_NAME,
    degraded: true,
    reason: "xml_rejected",
    detail: `ERROR: ${"x".repeat(200)}`,
  });
  assert.match(
    clipped,
    /x…; no catch-up\/retry settings/,
    "long command output is clipped to one line",
  );
  assert.ok(clipped.length < 200, "the summary row stays readable");
  assert.match(
    formatScheduleRegistration({ registered: false, reason: "unsupported_platform", label: TASK_NAME }),
    /Unsupported platform/,
  );
  assert.match(
    formatScheduleRegistration({ registered: false, reason: "access denied", label: TASK_NAME }),
    /Not registered: access denied/,
  );
});

test("toggle and delete copy always mention the pause flag as the fallback", () => {
  assert.equal(formatScheduleToggle({ changed: true, label: "TokenUsageSync" }, false), "TokenUsageSync disabled.");
  assert.equal(formatScheduleToggle({ changed: true, label: "TokenUsageSync" }, true), "TokenUsageSync enabled.");
  assert.match(formatScheduleToggle({ reason: "schedule_missing", label: "com.token-usage.sync" }, true), /schedule_missing|not found/);
  assert.match(formatScheduleToggle({ reason: "schedule_missing", label: "com.token-usage.sync" }, true), /pause flag still guards/);
  assert.match(formatScheduleToggle({ reason: "unsupported_platform", label: "x" }, false), /pause flag covers/);

  assert.equal(formatScheduleDelete({ deleted: true, label: "TokenUsageSync" }), "- Scheduled sync deleted: TokenUsageSync");
  assert.equal(formatScheduleDelete({ deleted: false, reason: "schedule_missing" }), "- Scheduled sync: none");
});
