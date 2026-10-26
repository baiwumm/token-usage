"use strict";

// The bin entry installs the node:sqlite ExperimentalWarning filter before
// any require can pull node:sqlite in; redirected scheduled-task logs grow
// by one identical warning per cycle otherwise. Pin the filter's contract:
// drop only that warning, pass everything else through, stay idempotent.

const assert = require("node:assert/strict");
const { test } = require("node:test");

const { suppressSqliteExperimentalWarning } = require("../src/lib/quiet-warnings");

test("filters the node:sqlite experimental warning and passes everything else through", () => {
  const seen = [];
  const saved = process.emitWarning;
  process.emitWarning = (warning, ...args) => {
    seen.push(warning);
  };
  try {
    suppressSqliteExperimentalWarning();

    process.emitWarning(
      "SQLite is an experimental feature and might change at any time",
      { type: "ExperimentalWarning", code: "ExperimentalWarnings" },
    );
    assert.equal(seen.length, 0);

    const other = new Error("some other experimental feature");
    other.name = "ExperimentalWarning";
    process.emitWarning(other);
    assert.equal(seen.length, 1);
    assert.equal(seen[0], other);

    process.emitWarning("plain string warning");
    assert.equal(seen.length, 2);
    assert.equal(seen[1], "plain string warning");
  } finally {
    process.emitWarning = saved;
  }
});

test("suppressSqliteExperimentalWarning is idempotent (does not stack filters)", () => {
  const saved = process.emitWarning;
  process.emitWarning = () => {};
  try {
    suppressSqliteExperimentalWarning();
    const onceFiltered = process.emitWarning;
    suppressSqliteExperimentalWarning();
    assert.equal(process.emitWarning, onceFiltered);
  } finally {
    process.emitWarning = saved;
  }
});
