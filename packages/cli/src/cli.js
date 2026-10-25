const { cmdInit } = require("./commands/init");
const { cmdSync } = require("./commands/sync");
const { cmdStatus } = require("./commands/status");
const { cmdDiagnostics } = require("./commands/diagnostics");
const { cmdDoctor } = require("./commands/doctor");
const { cmdUninstall } = require("./commands/uninstall");
const { cmdDeviceLogin } = require("./commands/device-login");
const { cmdSessions } = require("./commands/sessions");

async function run(argv) {
  // Best-effort Sentry init (no-op without DSN / when telemetry opted out).
  try {
    const { initSentry } = require("./lib/sentry");
    const { resolveTrackerPaths } = require("./lib/tracker-paths");
    const { trackerDir } = await resolveTrackerPaths().catch(() => ({ trackerDir: null }));
    await initSentry({ trackerDir });
  } catch {
    /* never block CLI startup on telemetry */
  }

  const [command, ...rest] = argv;

  // No args → short help (the upstream local dashboard was removed in this
  // fork; the hosted token-usage site is the dashboard).
  if (!command) {
    printHelp();
    return;
  }

  if (command === "-h" || command === "--help") {
    printHelp();
    return;
  }

  if (command === "-v" || command === "--version") {
    const pkg = require("../package.json");
    console.log(`v${pkg.version}`);
    return;
  }

  switch (command) {
    case "init":
      await cmdInit(rest);
      return;
    case "sync":
      await cmdSync(rest);
      return;
    case "status":
      await cmdStatus(rest);
      return;
    case "diagnostics":
      await cmdDiagnostics(rest);
      return;
    case "doctor":
      await cmdDoctor(rest);
      return;
    case "uninstall":
      await cmdUninstall(rest);
      return;
    case "device-login":
      await cmdDeviceLogin(rest);
      return;
    case "sessions":
      await cmdSessions(rest);
      return;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

function printHelp() {
  // Keep this short; npx users want quick guidance.
  process.stdout.write(
    [
      "tokenusage",
      "",
      "Usage:",
      "  tokenusage -v, --version                                 Show version info",
      "  tokenusage [--debug] init [--yes] [--dry-run] [--no-open] [--link-code <code>]",
      "  tokenusage [--debug] sync [--auto] [--drain] [--no-sessions] [--watch]",
      "  tokenusage [--debug] status [--probe-keychain] [--probe-keychain-details]",
      "  tokenusage [--debug] diagnostics [--out diagnostics.json]",
      "  tokenusage [--debug] doctor [--json] [--out doctor.json] [--base-url <url>]",
      "  tokenusage [--debug] uninstall [--purge]",
      "  tokenusage [--debug] device-login [--json] [--base-url <url>]",
      "  tokenusage sessions [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--format json|csv] [--out file] [--refresh] [--no-git]",
      "",
      "Notes:",
      "  - Pairing: device-login prints a code; approve it at the hosted /device page.",
      "  - sync parses local AI-tool session logs and uploads hourly token deltas",
      "    plus session metadata (no prompts, message bodies, paths or titles).",
      "  - --watch keeps running and syncs on an interval (increments only).",
      "  - --no-sessions skips the session metadata upload (hourly buckets only).",
      "  - auto sync waits for a device token.",
      "  - --debug shows original backend errors.",
      "  - sessions exports metadata-only efficiency analytics; no prompt or response text is retained.",
      "",
    ].join("\n"),
  );
}

module.exports = { run };
