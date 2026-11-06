"use strict";

// Contract v3 (docs/cli-contract.md §2.4 `projects`, 2026-11-06): the CLI only
// reports github.com / gitee.com remotes, canonicalised on the client, and only
// the entries that differ from what this device last had confirmed. These tests
// pin the canonical form, the diff (including the null clear), and the upload
// handshake: a 200 without `projects_upserted` is not a confirmation, and an old
// backend's 400 is "unsupported", not a failure.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test, beforeEach, afterEach } = require("node:test");

const {
  applyProjectRepoConfirmation,
  collectProjectRepoChanges,
  loadProjectRepoState,
  normalizeRepoUrl,
  uploadProjectRepos,
} = require("../src/lib/project-repos");

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tokenusage-project-repos-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("normalizeRepoUrl accepts and canonicalises public GitHub / Gitee remotes", () => {
  assert.equal(normalizeRepoUrl("https://github.com/acme/app"), "https://github.com/acme/app");
  assert.equal(normalizeRepoUrl("https://github.com/acme/app.git"), "https://github.com/acme/app");
  assert.equal(normalizeRepoUrl("https://github.com/acme/app/"), "https://github.com/acme/app");
  assert.equal(normalizeRepoUrl("http://github.com/acme/app"), "https://github.com/acme/app");
  assert.equal(normalizeRepoUrl("git@github.com:acme/app.git"), "https://github.com/acme/app");
  assert.equal(normalizeRepoUrl("ssh://git@github.com/acme/app.git"), "https://github.com/acme/app");
  assert.equal(normalizeRepoUrl("git://gitee.com/acme/app"), "https://gitee.com/acme/app");
  assert.equal(normalizeRepoUrl("  https://gitee.com/group/sub/app  "), null);
});

test("normalizeRepoUrl rejects hosts and shapes the contract does not store", () => {
  assert.equal(normalizeRepoUrl("https://gitlab.com/acme/app"), null);
  assert.equal(normalizeRepoUrl("https://git.example.com/acme/app"), null);
  assert.equal(normalizeRepoUrl("https://github.com/acme/app/tree/main"), null);
  assert.equal(normalizeRepoUrl("https://github.com/acme"), null);
  assert.equal(normalizeRepoUrl("https://user:pass@github.com/acme/app"), null);
  assert.equal(normalizeRepoUrl("https://github.com:8443/acme/app"), null);
  assert.equal(normalizeRepoUrl("https://github.com/acme/app?tab=readme"), null);
  assert.equal(normalizeRepoUrl("/home/acme/app"), null);
  assert.equal(normalizeRepoUrl(null), null);
});

test("collectProjectRepoChanges reports only changes, clears once, and skips local-only projects", () => {
  const projects = {
    "acme/app": { status: "public_verified", project_ref: "https://github.com/acme/app" },
    "acme/moved": { status: "public_verified", project_ref: "https://gitlab.com/acme/moved" },
    "acme/local": { status: "blocked", project_ref: null },
  };

  assert.deepEqual(
    collectProjectRepoChanges({ projects, confirmed: {} }),
    [{ project_key: "acme/app", repo_url: "https://github.com/acme/app" }],
  );

  // Already confirmed: nothing to send.
  assert.deepEqual(
    collectProjectRepoChanges({
      projects,
      confirmed: { "acme/app": "https://github.com/acme/app" },
    }),
    [],
  );

  // The remote moved off GitHub → one null clear, exactly once.
  assert.deepEqual(
    collectProjectRepoChanges({
      projects,
      confirmed: { "acme/app": "https://github.com/acme/app", "acme/moved": "https://github.com/acme/moved" },
    }),
    [{ project_key: "acme/moved", repo_url: null }],
  );
  assert.deepEqual(
    collectProjectRepoChanges({
      projects,
      confirmed: { "acme/app": "https://github.com/acme/app", "acme/moved": null },
    }),
    [],
  );
});

test("applyProjectRepoConfirmation only records acknowledged entries", () => {
  const next = applyProjectRepoConfirmation(
    { keep: "https://github.com/acme/keep" },
    [{ project_key: "add", repo_url: "https://github.com/acme/add" }],
  );
  assert.deepEqual(next, {
    keep: "https://github.com/acme/keep",
    add: "https://github.com/acme/add",
  });
});

function fakeResponse({ status = 200, body = {}, text } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => text ?? JSON.stringify(body),
  };
}

test("uploadProjectRepos confirms the entries and persists them", async () => {
  const statePath = path.join(tmpDir, "project.repos.state.json");
  const projects = { "acme/app": { status: "public_verified", project_ref: "https://github.com/acme/app" } };
  const result = await uploadProjectRepos({
    baseUrl: "https://example.test/api",
    deviceToken: "f".repeat(64),
    projects,
    statePath,
    fetchImpl: async () => fakeResponse({
      body: { inserted: 0, skipped: 0, upload_scope: "private", projects_upserted: 1, projects_skipped: 0 },
    }),
  });

  assert.equal(result.uploaded, 1);
  assert.equal(result.unsupported, undefined);
  assert.deepEqual(loadProjectRepoState(statePath).confirmed, {
    "acme/app": "https://github.com/acme/app",
  });

  // Nothing changes on the second run.
  const again = await uploadProjectRepos({
    baseUrl: "https://example.test/api",
    deviceToken: "f".repeat(64),
    projects,
    statePath,
    fetchImpl: async () => {
      throw new Error("must not call the backend when nothing changed");
    },
  });
  assert.equal(again.pending, 0);
});

test("uploadProjectRepos treats an old backend as unsupported and keeps the state", async () => {
  const statePath = path.join(tmpDir, "project.repos.state.json");
  const result = await uploadProjectRepos({
    baseUrl: "https://example.test/api",
    deviceToken: "f".repeat(64),
    projects: { "acme/app": { status: "public_verified", project_ref: "https://github.com/acme/app" } },
    statePath,
    fetchImpl: async () => fakeResponse({
      status: 400,
      body: { error: "No usage buckets provided" },
    }),
  });

  assert.equal(result.unsupported, true);
  assert.deepEqual(loadProjectRepoState(statePath).confirmed, {});
});

test("uploadProjectRepos refuses a 200 that did not confirm the projects", async () => {
  const statePath = path.join(tmpDir, "project.repos.state.json");
  await assert.rejects(
    uploadProjectRepos({
      baseUrl: "https://example.test/api",
      deviceToken: "f".repeat(64),
      projects: { "acme/app": { status: "public_verified", project_ref: "https://github.com/acme/app" } },
      statePath,
      fetchImpl: async () => fakeResponse({ body: { inserted: 0, skipped: 0 } }),
    }),
    /not confirmed/,
  );
  assert.deepEqual(loadProjectRepoState(statePath).confirmed, {});
});
