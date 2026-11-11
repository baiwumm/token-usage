"use strict";

// `tokenusage project-profiles` (docs/cli-contract.md §2.13): the read-only
// mirror the desktop companion uses instead of touching the device-token
// file itself. Credentials resolve from config.json (or the cloud-device-token
// file) exactly like the sync path, the request rides the bearer token, and
// the payload lands on stdout as one JSON line — stderr/exit 2 for failures.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test, beforeEach, afterEach } = require("node:test");

const { cmdProjectProfiles } = require("../src/commands/project-profiles");
const { isUsageError } = require("../src/lib/cli-errors");

const PAYLOAD = {
  profiles: [
    {
      project_key: "token-usage",
      display_name: "Token Usage",
      repo_url: "https://github.com/baiwumm/token-usage",
      repo_source: "manual",
      detected_repo_url: null,
      manual_repo_url: "https://github.com/baiwumm/token-usage",
      repo_hidden: false,
      logo_url: "https://example.test/logo.png",
      logo_upload_url: "https://example.test/storage/logo.png",
    },
  ],
};

let tmpDir;

function trackerDir() {
  return path.join(tmpDir, ".tokenusage", "tracker");
}

async function writeConfig(config) {
  const dir = trackerDir();
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(
    path.join(dir, "config.json"),
    JSON.stringify(config),
  );
}

/** Capture stdout while running `fn`; returns { text, error }. */
async function capture(fn) {
  const chunks = [];
  const original = process.stdout.write;
  process.stdout.write = (chunk) => {
    chunks.push(String(chunk));
    return true;
  };
  let error = null;
  try {
    await fn();
  } catch (caught) {
    error = caught;
  } finally {
    process.stdout.write = original;
  }
  return { text: chunks.join(""), error };
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tokenusage-project-profiles-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("prints the contract payload as a single JSON line on stdout", async () => {
  await writeConfig({
    baseUrl: "https://token-usage.example.test",
    anonKey: "sb_publishable_FakeTestKey_aaaaaaaaaaaaaaaaaaaaaa",
    deviceToken: "fake-device-token",
    deviceTokenBaseUrl: "https://token-usage.example.test",
  });
  const requests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    return new Response(JSON.stringify(PAYLOAD), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const { text, error } = await capture(() =>
    cmdProjectProfiles([], { home: tmpDir }),
  );

  globalThis.fetch = originalFetch;

  assert.equal(error, null);
  assert.equal(requests.length, 1);
  assert.equal(
    requests[0].url,
    "https://token-usage.example.test/api/functions/token-usage-account-project-profiles",
  );
  assert.equal(
    requests[0].init.headers.Authorization,
    "Bearer fake-device-token",
  );
  // Exactly one line, parseable as the contract payload.
  assert.equal(text.trimEnd().split("\n").length, 1);
  assert.deepEqual(JSON.parse(text), PAYLOAD);
});

test("fails with a UsageError (NOT_PAIRED) when the machine is unpaired", async () => {
  await writeConfig({});
  const { error } = await capture(() =>
    cmdProjectProfiles([], { home: tmpDir }),
  );

  assert.ok(isUsageError(error));
  assert.equal(error.code, "NOT_PAIRED");
  assert.equal(error.exitCode, 2);
  assert.match(error.hint, /device-login/);
});

test("resolves the token from cloud-device-token.json when config lacks one", async () => {
  await writeConfig({
    baseUrl: "https://token-usage.example.test",
    anonKey: "sb_publishable_FakeTestKey_aaaaaaaaaaaaaaaaaaaaaa",
  });
  await fs.promises.writeFile(
    path.join(trackerDir(), "cloud-device-token.json"),
    JSON.stringify({
      version: 1,
      token: "file-token",
      userId: "11111111-1111-4111-8111-111111111111",
      baseUrl: "https://token-usage.example.test",
      machineId: "machine-aaaa-1111",
    }),
  );
  const requests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    return new Response(JSON.stringify(PAYLOAD), { status: 200 });
  };

  const { text } = await capture(() =>
    cmdProjectProfiles([], { home: tmpDir }),
  );

  globalThis.fetch = originalFetch;

  assert.equal(requests[0].init.headers.Authorization, "Bearer file-token");
  assert.equal(JSON.parse(text).profiles.length, 1);
});

test("surfaces HTTP failures as UsageError with the status code", async () => {
  await writeConfig({
    baseUrl: "https://token-usage.example.test",
    anonKey: "sb_publishable_FakeTestKey_aaaaaaaaaaaaaaaaaaaaaa",
    deviceToken: "fake-device-token",
    deviceTokenBaseUrl: "https://token-usage.example.test",
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response("Unauthorized", { status: 401 });

  const { error } = await capture(() =>
    cmdProjectProfiles([], { home: tmpDir }),
  );

  globalThis.fetch = originalFetch;

  assert.ok(isUsageError(error));
  assert.equal(error.code, "HTTP_ERROR");
  assert.match(error.message, /401/);
});

test("rejects unknown options like every other strict-parsing command", async () => {
  await assert.rejects(
    () => cmdProjectProfiles(["--bogus"], { home: tmpDir }),
    (error) => {
      assert.ok(isUsageError(error));
      assert.equal(error.code, "UNKNOWN_OPTION");
      return true;
    },
  );
});
