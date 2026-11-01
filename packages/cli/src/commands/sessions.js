"use strict";

// `tokenusage sessions` — metadata-only efficiency analytics export.
//
// Strict parsing (was: unknown flags silently ignored, an invalid --format
// silently produced JSON, and --out used a non-atomic write). Analytics
// exports are easy to script, so a typo must fail instead of quietly
// exporting the wrong shape to the wrong file.

const { writeFileAtomic } = require("../lib/fs");
const { UsageError, unknownOptionError } = require("../lib/cli-errors");
const { buildSessionAnalytics, summarizeSessions, sessionsToCsv } = require("../lib/session-analytics");
const { buildGitOutcomes } = require("../lib/git-outcomes");

const FORMATS = new Set(["json", "csv"]);
const VALUE_FLAGS = new Set(["--format", "--out", "--from", "--to"]);
const BOOLEAN_FLAGS = new Set(["--csv", "--refresh", "--no-git"]);

function parseArgs(args = []) {
  const out = { format: null, out: null, from: null, to: null, refresh: false, git: true };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (VALUE_FLAGS.has(a)) {
      const value = args[i + 1];
      if (value == null || value === "" || value.startsWith("--")) {
        throw new UsageError(`${a} requires a value`, {
          code: "MISSING_VALUE",
          hint: "Run `tokenusage sessions --help` for supported options.",
        });
      }
      i += 1;
      if (a === "--format") out.format = value.trim().toLowerCase();
      else if (a === "--out") out.out = value;
      else if (a === "--from") out.from = value;
      else out.to = value;
      continue;
    }
    if (BOOLEAN_FLAGS.has(a)) {
      if (a === "--csv") out.format = "csv";
      else if (a === "--refresh") out.refresh = true;
      else out.git = false;
      continue;
    }
    throw unknownOptionError(a, "sessions");
  }
  if (out.format == null) out.format = "json";
  if (!FORMATS.has(out.format)) {
    throw new UsageError(`Unknown --format: ${out.format}`, {
      code: "FORMAT_UNKNOWN",
      hint: "Use `--format json` or `--format csv`.",
    });
  }
  return out;
}

async function cmdSessions(args = []) {
  const opts = parseArgs(args);
  const sessions = await buildSessionAnalytics({ force: opts.refresh });
  if (opts.git) await buildGitOutcomes(sessions);
  const summary = summarizeSessions(sessions, { from: opts.from || "", to: opts.to || "" });
  const content = opts.format === "csv"
    ? sessionsToCsv(summary.sessions)
    : `${JSON.stringify(summary, null, 2)}\n`;
  if (opts.out) {
    await writeFileAtomic(opts.out, content, { mode: 0o600 });
    process.stdout.write(`${opts.out}\n`);
  } else {
    process.stdout.write(content);
  }
}

module.exports = { cmdSessions, parseArgs };
