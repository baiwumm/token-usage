"use strict";

// A denied create is almost always a *folder* problem (permissions, or a
// process integrity level below the folder's label), not a file problem. The
// raw errno alone sent the desktop's alert hunting the filename; the CLI now
// attaches a one-line hint naming the directory, which bin/tokenusage.js
// prints as `Hint: …`. Injected through fs/promises.writeFile — real ACLs
// cannot produce a deterministic EPERM on a fresh tmp name.

const assert = require("node:assert/strict");
const fsPromises = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { test, mock } = require("node:test");

const { writeFileAtomic } = require("../src/lib/fs");

function failWritesWith(code) {
  mock.method(fsPromises, "writeFile", async (filePath) => {
    const error = new Error(`${code}: operation not permitted, open '${filePath}'`);
    error.code = code;
    error.syscall = "open";
    throw error;
  });
}

test("a persistent EPERM on the tmp create carries a hint naming the folder", async () => {
  const dir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "tu-write-hint-"));
  const target = path.join(dir, "pause.flag.json");
  try {
    failWritesWith("EPERM");
    const error = await writeFileAtomic(target, "{}\n").then(
      () => null,
      (rejection) => rejection,
    );

    assert.ok(error, "the write must still fail");
    assert.equal(error.code, "EPERM");
    assert.match(error.hint, /Cannot create files in /);
    assert.ok(error.hint.includes(dir), "the hint names the failing directory");
    assert.match(error.hint, /integrity level/);
  } finally {
    mock.restoreAll();
    await fsPromises.rm(dir, { recursive: true, force: true });
  }
});

test("non-permission failures keep the bare error (no misleading hint)", async () => {
  const dir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "tu-write-hint-"));
  const target = path.join(dir, "state.json");
  try {
    failWritesWith("ENOSPC");
    const error = await writeFileAtomic(target, "{}\n").then(
      () => null,
      (rejection) => rejection,
    );

    assert.ok(error);
    assert.equal(error.code, "ENOSPC");
    assert.equal(error.hint, undefined);
  } finally {
    mock.restoreAll();
    await fsPromises.rm(dir, { recursive: true, force: true });
  }
});
