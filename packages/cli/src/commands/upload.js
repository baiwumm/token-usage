"use strict";

// `tokenusage upload` — flush the local queue without scanning providers.
//
// Before this command the only way to push a backlog was `tokenusage sync`,
// which walks all 46 sources first (slow, and it re-parses session files for
// no reason when the data is already queued). `upload` reuses the exact same
// drain path as sync (`drainQueueToCloud`) under the same sync.lock, so the
// queue offset / throttle / last-wins semantics stay identical — it simply
// skips the scan phase.
//
// `--drain` (alias `--force`) raises the batch ceiling from 5 to 100 and
// ignores the local upload cooldown, matching `sync --drain`. Manual runs
// always ignore the cooldown (server access is still decided server-side).

const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs/promises");

const { resolveTrackerPaths } = require("../lib/tracker-paths");
const { formatDeviceLine } = require("../lib/progress");
const { buildDeviceIdentity } = require("../lib/device-identity");
const { readJson } = require("../lib/fs");
const { cloudUsageResetBlocksUpload } = require("../lib/cloud-usage-reset");
const { compactPendingQueue } = require("../lib/upload-queue");
const { resolveRuntimeConfig } = require("../lib/runtime-config");
const { UsageError, unknownOptionError } = require("../lib/cli-errors");
const { acquireSyncLock, drainQueueToCloud } = require("./sync");

const BATCH_SIZE = 200;
const MAX_BATCHES = 5;
const MAX_BATCHES_DRAIN = 100;

function parseArgs(argv) {
  const out = { drain: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--drain" || a === "--force") out.drain = true;
    else if (a === "--json") out.json = true;
    else throw unknownOptionError(a, "upload");
  }
  return out;
}

async function pendingBytes(queuePath, queueStatePath) {
  const [size, state] = await Promise.all([
    fs.stat(queuePath).then((st) => st.size).catch(() => 0),
    readJson(queueStatePath),
  ]);
  return Math.max(0, size - Number(state?.offset || 0));
}

async function cmdUpload(argv, options = {}) {
  const opts = parseArgs(argv);
  const home = options.home || os.homedir();
  const { trackerDir } = await resolveTrackerPaths({ home });
  const configPath = path.join(trackerDir, "config.json");
  const queuePath = path.join(trackerDir, "queue.jsonl");
  const queueStatePath = path.join(trackerDir, "queue.state.json");
  const lockPath = path.join(trackerDir, "sync.lock");

  const config = (await readJson(configPath)) || {};
  const runtime = resolveRuntimeConfig({ config, env: process.env });
  if (!runtime.deviceToken) {
    throw new UsageError("This machine is not paired with a dashboard yet.", {
      code: "NO_DEVICE_TOKEN",
      hint: "Run `tokenusage device-login` (or `tokenusage init`) first.",
    });
  }

  const canUpload = () => !cloudUsageResetBlocksUpload(trackerDir, {
    ownerId: process.env.TOKENUSAGE_CLOUD_OWNER_ID,
    baseUrl: process.env.TOKENUSAGE_INSFORGE_BASE_URL,
    deviceId: process.env.TOKENUSAGE_CLOUD_DEVICE_ID,
  });
  if (!canUpload()) {
    throw new UsageError("Uploads are blocked by a pending cloud usage reset.", {
      code: "CLOUD_USAGE_RESET_PENDING",
      hint: "Finish the reset from the dashboard, then retry.",
    });
  }

  const beforeBytes = await pendingBytes(queuePath, queueStatePath);

  const lock = await acquireSyncLock(lockPath, { drain: true, waitForLock: true });
  if (!lock) {
    throw new UsageError("Another sync is still running; nothing was uploaded.", {
      code: "SYNC_BUSY",
    });
  }

  let result;
  try {
    await compactPendingQueue({ queuePath, offset: Number((await readJson(queueStatePath))?.offset || 0) });
    result = await drainQueueToCloud({
      baseUrl: runtime.baseUrl,
      anonKey: runtime.anonKey,
      deviceToken: runtime.deviceToken,
      queuePath,
      queueStatePath,
      maxBatches: opts.drain ? MAX_BATCHES_DRAIN : MAX_BATCHES,
      batchSize: BATCH_SIZE,
      canUpload,
    });
  } finally {
    await lock.release();
  }

  const afterBytes = await pendingBytes(queuePath, queueStatePath);
  const summary = {
    batches: result.batches,
    inserted: result.inserted,
    skipped: result.skipped,
    tokens: result.tokens,
    credits: result.credits,
    pending_bytes_before: beforeBytes,
    pending_bytes_after: afterBytes,
  };

  if (opts.json) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    return;
  }

  if (result.batches === 0) {
    process.stdout.write(
      [
        "Nothing pending — the local queue is fully uploaded.",
        beforeBytes > 0 ? `(${beforeBytes} bytes were skipped as unuploadable control/invalid rows.)` : null,
        "",
      ].filter(Boolean).join("\n"),
    );
    return;
  }

  process.stdout.write(
    [
      "Upload complete.",
      formatDeviceLine(buildDeviceIdentity({ config, hostname: os.hostname() })),
      `- Requests: ${result.batches}`,
      `- Rows inserted: ${result.inserted.toLocaleString("en-US")} (skipped ${result.skipped.toLocaleString("en-US")})`,
      `- Tokens in this upload: ${result.tokens.toLocaleString("en-US")}`,
      result.credits > 0 ? `- Credits in this upload: ${result.credits.toLocaleString("en-US")}` : null,
      `- Pending bytes: ${beforeBytes} → ${afterBytes}`,
      afterBytes > 0 ? "- Backlog remains; run `tokenusage upload --drain` or retry later." : null,
      "",
    ].filter(Boolean).join("\n"),
  );
}

module.exports = { cmdUpload, parseArgs };
