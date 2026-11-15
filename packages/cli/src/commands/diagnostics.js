const path = require("node:path");

const { writeFileAtomic, chmod600IfPossible } = require("../lib/fs");
const { collectTrackerDiagnostics } = require("../lib/diagnostics");
const { parseFlags } = require("../lib/cli-flags");

async function cmdDiagnostics(argv = []) {
  const opts = parseArgs(argv);
  const diagnostics = await collectTrackerDiagnostics();
  const json = JSON.stringify(diagnostics, null, opts.compact ? 0 : 2) + "\n";

  if (opts.out) {
    const outPath = path.resolve(process.cwd(), opts.out);
    await writeFileAtomic(outPath, json);
    await chmod600IfPossible(outPath);
    process.stderr.write(`Wrote diagnostics to: ${outPath}\n`);
  }

  process.stdout.write(json);
}

// `--compact` / `--pretty` were accepted but undocumented; the spec below is
// the single source `tokenusage diagnostics --help` and the surface test read.
const DIAGNOSTICS_FLAGS = {
  command: "diagnostics",
  defaults: { out: null, compact: false },
  flags: [
    { flag: "--out", key: "out", kind: "value" },
    { flag: "--compact", key: "compact" },
    { flag: "--pretty", key: "compact", const: false },
  ],
};

function parseArgs(argv = []) {
  return parseFlags(argv, DIAGNOSTICS_FLAGS);
}

module.exports = { cmdDiagnostics, parseArgs, flagSpec: DIAGNOSTICS_FLAGS };
