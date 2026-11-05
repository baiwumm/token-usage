"use strict";

// Command table + dispatch. Help text lives next to each command definition
// (`usage` / `options` / `notes`) so a new flag cannot be documented in one
// place and forgotten in another: `tokenusage --help` renders the one-line
// summary from here and `tokenusage <command> --help` renders the full block.
//
// Errors: user mistakes throw UsageError (printed without a stack, exit 2);
// everything else keeps the plain message and only prints a stack under --debug
// (bin/tokenusage.js owns that policy).

const { UsageError } = require("./lib/cli-errors");

const { cmdInit } = require("./commands/init");
const { cmdSync, formatSyncSourceList } = require("./commands/sync");
const { cmdUpload } = require("./commands/upload");
const { cmdReconcile } = require("./commands/reconcile");
const { cmdStatus } = require("./commands/status");
const { cmdDiagnostics } = require("./commands/diagnostics");
const { cmdDoctor } = require("./commands/doctor");
const { cmdUninstall } = require("./commands/uninstall");
const { cmdDeviceLogin } = require("./commands/device-login");
const { cmdSessions } = require("./commands/sessions");
const { cmdPause, cmdResume } = require("./commands/pause");

const DEFAULT_WATCH_INTERVAL_MS = 15 * 60_000;
const WATCH_MIN_INTERVAL_MS = 60_000;
// Failure backoff ladder (watch mode). A pass that fails (offline, backend 5xx,
// sync.lock contention) does not reset the schedule to the fastest interval:
// it steps through the same 1→2→5 ladder the juejin CLI uses, multiplied by
// the configured base interval. One successful pass drops straight back to the
// base interval.
const WATCH_BACKOFF_MULTIPLIERS = [1, 2, 5];

const COMMANDS = [
  {
    name: "init",
    summary: "Configure hooks, the runtime copy and the auto-sync schedule",
    run: (argv) => cmdInit(argv),
    usage: [
      "tokenusage init [options]",
      "",
      "Options:",
      "  --base-url <url>            Dashboard/backend base URL (defaults to the hosted instance)",
      "  --dashboard-url <url>       Dashboard URL shown in the success message",
      "  --anon-key <key>            Publishable key of your self-hosted instance",
      "  --anon-key-file <path>      Read the publishable key from a file",
      "  --integrations <ids|all|none>",
      "                              Only configure the listed tools (comma separated ids,",
      "                              e.g. claude,codex,gemini). `none` == --no-integrations",
      "  --no-integrations           Leave every tool config untouched (scheduled scanning only)",
      "  --no-task                   Do not register the auto-sync schedule",
      "  --run-report=on|off         Persist the per-run telemetry preference (§2.11)",
      "  --yes                       Skip the interactive confirmation",
      "  --dry-run                   Preview without writing anything",
      "  --no-open                   Do not open a browser window on success",
    ],
    notes: [
      "The hourly schedule uses Task Scheduler on Windows, launchd on macOS and a",
      "systemd --user timer on Linux; `pause`/`resume` toggle whichever was registered.",
      "Removed flags: --email, --password, --device-name, --link-code, --no-auth —",
      "browser sign-in is gone; pair the machine with `tokenusage device-login`.",
    ],
  },
  {
    name: "sync",
    summary: "Scan local AI-tool sessions and upload hourly token deltas",
    run: async (argv) => {
      const uploadOnly = argv.includes("--upload-only");
      const rest = uploadOnly ? argv.filter((a) => a !== "--upload-only") : argv;
      if (uploadOnly) {
        await cmdUpload(rest);
        return;
      }
      if (rest.includes("--watch")) {
        await watchSync(rest);
        return;
      }
      await cmdSync(rest);
    },
    usage: [
      "tokenusage sync [options]",
      "",
      "Options:",
      "  --watch                     Keep running and sync on an interval",
      "  --interval <ms>             Watch interval in ms (floor 60000, default 900000)",
      "  --upload-only               Skip scanning; only flush the pending queue",
      "  --source <id>               Scan a single provider (ids are listed below)",
      "  --drain                     Upload the whole backlog (higher batch ceiling)",
      "  --no-sessions               Skip the session metadata upload (hourly buckets only)",
      "  --publish-account           Publish account-level sources (cursor / trae-cn) locally",
      "  --all-local-sources         Scan every local source, including background-only ones",
      "  --auto                      Auto flavor (honors pause + cloud-sync preference)",
      "  --from-notify|--from-openclaw|--from-retry|--from-scheduled",
      "                              Trigger tags used by the generated hooks/schedule",
      "  --wait-for-lock             Wait for a concurrent sync to finish instead of skipping",
      "  --background|--lightweight  Reduced-scan background flavor",
      "  --repair-grok               Rebuild Grok rows from session snapshots",
    ],
    notes: [
      "Unknown --source values fail loudly (they used to fall back to a full scan,",
      "which silently collected every provider instead of the one requested).",
    ],
  },
  {
    name: "upload",
    summary: "Flush the pending queue without scanning provider sessions",
    run: (argv) => cmdUpload(argv),
    usage: [
      "tokenusage upload [options]",
      "",
      "Options:",
      "  --drain, --force            Upload the whole backlog (100 batches, ignores cooldown)",
      "  --json                      Machine-readable summary",
    ],
    notes: [
      "Uses the same sync.lock, queue offset and ingest path as `sync`, so the",
      "last-wins reconciliation baseline is unaffected.",
    ],
  },
  {
    name: "reconcile",
    summary: "Compare the local queue baseline against this device's cloud rows",
    run: (argv) => cmdReconcile(argv),
    usage: [
      "tokenusage reconcile [options]",
      "",
      "Options:",
      "  --days <n>                  Window length in days (default 7, max 366)",
      "  --from <YYYY-MM-DD|ISO>     Window start (inclusive, UTC)",
      "  --to <YYYY-MM-DD|ISO>       Window end; a bare date includes the whole day",
      "  --limit <n>                 Rows per page (1–2000, default 1000)",
      "  --json                      Machine-readable summary",
    ],
    notes: [
      "Read-only: the command never uploads, rewrites the queue or moves the",
      "upload offset. Drift is reported per (hour_start, source, model) key as",
      "missing_on_server / server_only / mismatch, and exits 1 when any exists.",
      "The baseline is the same last-wins reading of queue.jsonl that `sync`/`upload`",
      "send, so a fully uploaded queue should report OK.",
    ],
  },
  {
    name: "pause",
    summary: "Stop automatic collection (manual sync still works)",
    run: () => cmdPause(),
    usage: ["tokenusage pause", "", "Writes the pause flag and stops the registered auto-sync schedule."],
  },
  {
    name: "resume",
    summary: "Restart automatic collection",
    run: () => cmdResume(),
    usage: ["tokenusage resume", "", "Clears the pause flag and re-enables the registered auto-sync schedule."],
  },
  {
    name: "status",
    summary: "Show pairing, queue, hook and provider state",
    run: (argv) => cmdStatus(argv),
    usage: [
      "tokenusage status [options]",
      "",
      "Options:",
      "  --diagnostics               Include diagnostics (paths, cursors, WSL/Kiro probes)",
      "  --json                      Machine-readable output",
      "  --light                     Deterministic ASCII table (no ANSI, no emoji)",
      "  --limits                    Include the provider quota panel (reads local credentials and provider APIs)",
      "  --no-spinner                Disable the progress spinner",
      "  --probe-keychain            Probe the macOS keychain (may prompt)",
      "  --probe-keychain-details    Include per-item keychain details",
    ],
  },
  {
    name: "diagnostics",
    summary: "Dump a redacted environment report",
    run: (argv) => cmdDiagnostics(argv),
    usage: ["tokenusage diagnostics [--out <file>]", "", "Home paths are redacted to `~` before being printed."],
  },
  {
    name: "doctor",
    summary: "Check the local setup and exit non-zero on critical failures",
    run: (argv) => cmdDoctor(argv),
    usage: [
      "tokenusage doctor [options]",
      "",
      "Options:",
      "  --json                      Machine-readable report",
      "  --out <file>                Also write the report to a file",
      "  --base-url <url>            Backend to probe (defaults to the configured one)",
    ],
  },
  {
    name: "uninstall",
    summary: "Remove hooks, the auto-sync schedule and the runtime copy",
    run: (argv) => cmdUninstall(argv),
    usage: ["tokenusage uninstall [--purge]", "", "  --purge                     Also delete ~/.tokenusage (keeps machine identity)"],
  },
  {
    name: "device-login",
    summary: "Pair this machine with the dashboard (device flow)",
    run: (argv) => cmdDeviceLogin(argv),
    usage: [
      "tokenusage device-login [options]",
      "",
      "Options:",
      "  --json                      Machine-readable output",
      "  --base-url <url>            Backend to pair against",
    ],
  },
  {
    name: "sessions",
    summary: "Export metadata-only session efficiency analytics",
    run: (argv) => cmdSessions(argv),
    usage: [
      "tokenusage sessions [options]",
      "",
      "Options:",
      "  --from <YYYY-MM-DD>         Window start (inclusive)",
      "  --to <YYYY-MM-DD>           Window end (inclusive)",
      "  --format <json|csv>         Output format (default json)",
      "  --csv                       Shorthand for --format csv",
      "  --out <file>                Write to a file (atomic, mode 0600) instead of stdout",
      "  --refresh                   Rebuild the analytics cache",
      "  --no-git                    Skip git outcome attribution",
    ],
  },
];

function findCommand(name) {
  return COMMANDS.find((command) => command.name === name) || null;
}

// Split `--interval <ms>` (or `--interval=<ms>`) off the sync args. Values
// below the 1-minute floor (or a missing value) fall back to 15 min, but the
// flag must ALWAYS be removed: leaving it behind made cmdSync reject every
// pass with "Unknown option: --interval" instead of the documented fallback.
function resolveWatchInterval(rest) {
  const args = rest.filter((arg) => arg !== "--watch");
  let intervalMs = DEFAULT_WATCH_INTERVAL_MS;
  let value;
  const spacedIndex = args.indexOf("--interval");
  const equalsIndex = args.findIndex((arg) => arg.startsWith("--interval="));
  if (spacedIndex >= 0) {
    value = args[spacedIndex + 1];
    args.splice(spacedIndex, 2);
  } else if (equalsIndex >= 0) {
    value = args[equalsIndex].slice("--interval=".length);
    args.splice(equalsIndex, 1);
  }
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed >= WATCH_MIN_INTERVAL_MS) intervalMs = parsed;
  return { args, intervalMs };
}

// Pure so the ladder is testable without sleeping: 0 failures → base interval,
// then base×2, base×5 (and stays at base×5 for further failures).
function resolveWatchDelay({ intervalMs, failureCount = 0 }) {
  const step = Math.min(Math.max(0, Number(failureCount) || 0), WATCH_BACKOFF_MULTIPLIERS.length - 1);
  return Math.max(WATCH_MIN_INTERVAL_MS, intervalMs * WATCH_BACKOFF_MULTIPLIERS[step]);
}

// --watch: keep the process alive and re-run sync on an interval. Each pass
// reuses the session-analytics sidecar cache and the upload watermarks, so a
// pass with nothing new is cheap (a directory signature stat + a no-op).
// The trigger tag rides context into cmdSync so run telemetry can report
// `watch` runs distinctly from scheduled/manual/notify ones (§2.11).
async function watchSync(rest) {
  const { args, intervalMs } = resolveWatchInterval(rest);
  const minutes = (ms) => Math.round(ms / 60_000);

  process.stdout.write(`tokenusage sync --watch: every ${minutes(intervalMs)} min (Ctrl+C to stop)\n`);
  let failureCount = 0;
  for (;;) {
    try {
      await cmdSync(args, { trigger: "watch" });
      failureCount = 0;
    } catch (error) {
      // A failed pass (offline, backend 5xx) must not kill the watcher; the
      // queue and watermarks retain everything for the next pass.
      failureCount += 1;
      process.stderr.write(`sync pass failed: ${error?.message || error}\n`);
    }
    const delayMs = resolveWatchDelay({ intervalMs, failureCount });
    if (failureCount > 0) {
      process.stderr.write(
        `next pass in ${minutes(delayMs)} min (backoff step ${Math.min(failureCount, WATCH_BACKOFF_MULTIPLIERS.length)}/${WATCH_BACKOFF_MULTIPLIERS.length})\n`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

function formatCommandList() {
  const width = COMMANDS.reduce((max, command) => Math.max(max, command.name.length), 0);
  return COMMANDS.map((command) => `  ${command.name.padEnd(width)}  ${command.summary}`);
}

function printHelp() {
  const pkg = require("../package.json");
  process.stdout.write(
    [
      `tokenusage v${pkg.version} — self-hosted AI token usage collector`,
      "",
      "Usage:",
      "  tokenusage <command> [options]",
      "",
      "Commands:",
      ...formatCommandList(),
      "",
      "Run `tokenusage <command> --help` for that command's options.",
      "",
      "Notes:",
      "  - Pairing: device-login prints a code; approve it at the hosted /device page.",
      "  - sync parses local AI-tool session logs and uploads hourly token deltas",
      "    plus session metadata (no prompts, message bodies, paths or titles).",
      "  - --watch keeps running and syncs on an interval (increments only);",
      "    failures back off 1x → 2x → 5x of the base interval and reset on success.",
      "  - --no-sessions skips the session metadata upload (hourly buckets only).",
      "  - pause/resume stop and restart automatic collection (flag + schedule);",
      "    manual sync and upload always run.",
      "  - --debug shows original backend errors and full stack traces.",
      "",
    ].join("\n"),
  );
}

function printCommandHelp(name) {
  const command = findCommand(name);
  if (!command) {
    throw new UsageError(`Unknown command: ${name}`, {
      code: "UNKNOWN_COMMAND",
      hint: "Run `tokenusage --help` to see supported commands.",
    });
  }
  const lines = [
    ...command.usage,
    ...(command.notes && command.notes.length ? ["", ...command.notes] : []),
    ...(command.name === "sync"
      ? ["", "Available --source ids:", `  ${formatSyncSourceList()}`]
      : []),
    "",
    `Run \`tokenusage --help\` for the full command list.`,
    "",
  ];
  process.stdout.write(`${lines.join("\n")}\n`);
}

async function run(argv) {
  const [command, ...rest] = argv;

  // No args → help (the upstream local dashboard was removed in this fork;
  // the hosted token-usage site is the dashboard).
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

  if (command === "help") {
    if (rest[0]) printCommandHelp(rest[0]);
    else printHelp();
    return;
  }

  const spec = findCommand(command);
  if (!spec) {
    throw new UsageError(`Unknown command: ${command}`, {
      code: "UNKNOWN_COMMAND",
      hint: "Run `tokenusage --help` to see supported commands.",
    });
  }

  // `tokenusage <command> --help` works for every command without every
  // parser having to special-case it (a new flag can never make --help throw).
  if (rest.includes("--help") || rest.includes("-h")) {
    printCommandHelp(spec.name);
    return;
  }

  await spec.run(rest);
}

module.exports = {
  run,
  printHelp,
  printCommandHelp,
  resolveWatchInterval,
  resolveWatchDelay,
  COMMANDS,
};
