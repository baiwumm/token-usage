"use strict";

// Usage errors are the user's mistake (bad flag, unknown command, invalid
// value), not a crash: print the message (plus an optional hint) and exit 2
// without a stack trace. The bin entry prints full stacks only under --debug.
// Everything else keeps the plain message + "re-run with --debug" pointer.

class UsageError extends Error {
  constructor(message, { hint = null, code = "USAGE_ERROR", exitCode = 2 } = {}) {
    super(message);
    this.name = "UsageError";
    this.code = code;
    this.hint = hint;
    this.exitCode = exitCode;
  }
}

function isUsageError(error) {
  return Boolean(error && (error instanceof UsageError || error.name === "UsageError"));
}

// Build the "unknown option" error shared by every command's parser so the
// message and the discoverability hint never drift apart.
function unknownOptionError(option, command) {
  return new UsageError(`Unknown option: ${option}`, {
    code: "UNKNOWN_OPTION",
    hint: command
      ? `Run \`tokenusage ${command} --help\` to see supported options.`
      : "Run `tokenusage --help` to see supported commands.",
  });
}

module.exports = { UsageError, isUsageError, unknownOptionError };
