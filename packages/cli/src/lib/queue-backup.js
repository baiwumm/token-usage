"use strict";

const fs = require("node:fs/promises");

// Copy a queue/state file next to itself before a destructive rewrite, so a
// repair that drops rows is always reversible. Missing file → null (nothing to
// back up); any other error propagates, because rewriting a queue without a
// backup is exactly the case this guards.
async function backupExistingFile(filePath) {
  if (typeof filePath !== "string" || !filePath) return null;
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) return null;
  } catch (e) {
    if (e?.code === "ENOENT" || e?.code === "ENOTDIR") return null;
    throw e;
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `${filePath}.bak.${stamp}`;
  await fs.copyFile(filePath, backupPath);
  return backupPath;
}

module.exports = { backupExistingFile };
