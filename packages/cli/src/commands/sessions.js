"use strict";

// `tokenusage sessions` — metadata-only efficiency analytics export.
//
// Strict parsing (was: unknown flags silently ignored, an invalid --format
// silently produced JSON, and --out used a non-atomic write). Analytics
// exports are easy to script, so a typo must fail instead of quietly
// exporting the wrong shape to the wrong file.

const { writeFileAtomic } = require("../lib/fs");
const { UsageError } = require("../lib/cli-errors");
const { parseFlags } = require("../lib/cli-flags");
const { buildSessionAnalytics, summarizeSessions, sessionsToCsv } = require("../lib/session-analytics");
const { buildGitOutcomes } = require("../lib/git-outcomes");

const FORMATS = new Set(["json", "csv"]);

const SESSIONS_FLAGS = {
  command: "sessions",
  defaults: { format: null, out: null, from: null, to: null, refresh: false, git: true },
  flags: [
    { flag: "--format", key: "format", kind: "value", parse: (raw) => String(raw).trim().toLowerCase() },
    { flag: "--out", key: "out", kind: "value" },
    { flag: "--from", key: "from", kind: "value" },
    { flag: "--to", key: "to", kind: "value" },
    { flag: "--csv", key: "format", const: "csv" },
    { flag: "--refresh", key: "refresh" },
    { flag: "--no-git", key: "git", const: false },
  ],
};

function parseArgs(args = []) {
  const out = parseFlags(args, SESSIONS_FLAGS);
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

module.exports = { cmdSessions, parseArgs, flagSpec: SESSIONS_FLAGS };
