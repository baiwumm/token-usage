"use strict";

// Lock acquisition can transiently fail with EPERM/EBUSY on the create —
// Windows filter drivers or a settling release deny the name for a moment; a
// live holder always produces EEXIST instead. openLock must retry briefly and
// then fall through to the held semantics (null), never leak the raw errno
// (desktop 立即同步 surfaced "EPERM: operation not permitted, open
// ...sync.lock" once, racing the hourly scheduled run's release).
//
// The failure is injected via a scoped mock of fs/promises.open: real ACLs
// cannot produce these codes deterministically (and every existing-name case
// correctly yields EEXIST before any sharing check).

const assert = require("node:assert/strict");
const fsPromises = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { test, mock } = require("node:test");

const { openLock } = require("../src/lib/fs");

function failOpenFor(targetPath, code, times = Infinity) {
  const realOpen = fsPromises.open.bind(fsPromises);
  let thrown = 0;
  return mock.method(fsPromises, "open", (pathArg, flags, ...rest) => {
    if (pathArg === targetPath && thrown < times) {
      thrown += 1;
      const error = new Error(`${code}: operation not permitted, open '${pathArg}'`);
      error.code = code;
      error.errno = -4095;
      error.syscall = "open";
      throw error;
    }
    return realOpen(pathArg, flags, ...rest);
  });
}

test("openLock still throws for ordinary errors (missing parent dir)", async () => {
  const missing = path.join(os.tmpdir(), "tu-lock-transient-nope", "sync.lock");
  await assert.rejects(
    () => openLock(missing, { quietIfLocked: true }),
    (error) => error.code === "ENOENT",
  );
});

test("openLock recovers from a transient EPERM on the lock create", async () => {
  const dir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "tu-lock-transient-"));
  const lockPath = path.join(dir, "sync.lock");
  try {
    failOpenFor(lockPath, "EPERM", 1);
    const lock = await openLock(lockPath, { quietIfLocked: true });
    assert.ok(lock, "the retried acquisition should have succeeded");
    await lock.release();
    await assert.rejects(() => fsPromises.access(lockPath), { code: "ENOENT" });
  } finally {
    mock.restoreAll();
    await fsPromises.rm(dir, { recursive: true, force: true });
  }
});

for (const code of ["EPERM", "EBUSY"]) {
  test(`openLock maps a persistent ${code} to held semantics, not a raw throw`, async () => {
    const dir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "tu-lock-transient-"));
    const lockPath = path.join(dir, "sync.lock");
    try {
      failOpenFor(lockPath, code);
      const startedAt = Date.now();
      const lock = await openLock(lockPath, { quietIfLocked: true });
      assert.equal(lock, null, `persistent ${code} must resolve to null (held)`);
      const waited = Date.now() - startedAt;
      assert.ok(
        waited >= 450,
        `should have exhausted the retry round (~450 ms), waited ${waited} ms`,
      );
      assert.ok(
        waited < 5000,
        `retry round must stay bounded, took ${waited} ms`,
      );
    } finally {
      mock.restoreAll();
      await fsPromises.rm(dir, { recursive: true, force: true });
    }
  });
}

test("persistent EPERM with quietIfLocked:false prints the busy note", async () => {
  const dir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "tu-lock-transient-"));
  const lockPath = path.join(dir, "sync.lock");
  const originalWrite = process.stdout.write;
  let output = "";
  try {
    failOpenFor(lockPath, "EPERM");
    process.stdout.write = (chunk) => {
      output += String(chunk);
      return true;
    };
    const lock = await openLock(lockPath, { quietIfLocked: false });
    assert.equal(lock, null);
    assert.match(output, /Another sync is already running\./);
  } finally {
    process.stdout.write = originalWrite;
    mock.restoreAll();
    await fsPromises.rm(dir, { recursive: true, force: true });
  }
});
