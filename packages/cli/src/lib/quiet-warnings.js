"use strict";

// node:sqlite prints an ExperimentalWarning on every require (the SQLite
// fast-path reader pulls it in on supported runtimes). Scheduled tasks and
// --watch runs redirect their output into a rolling log, so every cycle
// otherwise grows the log with the same warning nobody can act on. Filter
// just that warning at the entry, before anything can require node:sqlite;
// every other warning still reaches the default handler.

function suppressSqliteExperimentalWarning() {
  const original = process.emitWarning;
  if (original.__sqliteWarningFiltered) return;
  const filtered = (warning, ...args) => {
    const text = typeof warning === "string"
      ? warning
      : `${warning?.name || ""}: ${warning?.message || ""}`;
    if (text.includes("SQLite is an experimental feature") || text.includes("ExperimentalWarning: SQLite")) {
      return;
    }
    return original.call(process, warning, ...args);
  };
  filtered.__sqliteWarningFiltered = true;
  process.emitWarning = filtered;
}

module.exports = { suppressSqliteExperimentalWarning };
