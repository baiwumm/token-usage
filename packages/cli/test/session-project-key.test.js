const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  projectKey,
  scanQoderSessionFile,
} = require("../src/lib/session-analytics.js");

test("projectKey keeps the historical basename for a normal cwd", () => {
  assert.equal(projectKey("E:\\personal-project\\token-usage"), "token-usage");
  assert.equal(projectKey("/home/me/work/token-usage/"), "token-usage");
  assert.equal(projectKey("E:\\personal-project\\token-usage\\sail-ui"), "sail-ui");
});

test("projectKey steps up from a repo-local worktree checkout", () => {
  assert.equal(
    projectKey("/home/me/work/token-usage/.claude/worktrees/agent-a3cb8089a11d3471a"),
    "token-usage",
  );
  assert.equal(
    projectKey("E:\\personal-project\\token-usage\\worktrees\\feature-x"),
    "token-usage",
  );
});

test("projectKey keeps the worktree id when no project sits above the marker", () => {
  // ~/.codex/worktrees/<id> has a home directory above it, not a project.
  assert.equal(projectKey("C:\\Users\\me\\.codex\\worktrees\\agent-abc"), "agent-abc");
});

test("projectKey steps up from a subagent transcript directory", () => {
  assert.equal(
    projectKey(
      null,
      "/home/me/.qoder-cn/projects/acme-web/64d52bd3-ddcc-485a-9729-ac4b3d5ba4bd/subagents/agent-aExplore-1234.jsonl",
    ),
    "acme-web",
  );
  assert.equal(projectKey(null, "/home/me/work/acme-web/subagents/agent-aPlan-99.jsonl"), "acme-web");
  // No uuid container: the directory above `subagents` is the project.
  assert.equal(projectKey("/home/me/work/acme-web/subagents"), "acme-web");
});

test("projectKey keeps the old dirname fallback when nothing matches", () => {
  assert.equal(projectKey(null, "/home/me/.claude/projects/x/sessions/abc.jsonl"), "sessions");
  // Pre-existing edge: an empty cwd falls back to path.dirname("") === ".".
  assert.equal(projectKey("", ""), ".");
});

test("scanQoderSessionFile inherits the record cwd for subagent transcripts", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tu-qoder-"));
  try {
    const child = path.join(root, "projects", "acme-web", "subagents", "agent-aExplore-1234.jsonl");
    fs.mkdirSync(path.dirname(child), { recursive: true });
    fs.writeFileSync(
      child,
      `${JSON.stringify({
        type: "assistant",
        cwd: path.join(root, "code", "acme-web"),
        timestamp: "2026-11-04T02:00:00.000Z",
        message: {
          role: "assistant",
          usage: { input_tokens: 10, output_tokens: 5, credits: 0.25 },
        },
      })}\n`,
    );

    const record = scanQoderSessionFile(child, "qoder-cn");
    assert.ok(record);
    assert.equal(record.project_key, "acme-web");
    assert.equal(record.project_ref, path.join(root, "code", "acme-web"));
    assert.equal(record.total_tokens, 15);
    assert.equal(record.credits, 0.25);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("scanQoderSessionFile falls back to the project directory without a cwd", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tu-qoder-"));
  try {
    const child = path.join(root, "projects", "acme-web", "subagents", "agent-aExplore-1.jsonl");
    fs.mkdirSync(path.dirname(child), { recursive: true });
    fs.writeFileSync(
      child,
      `${JSON.stringify({
        type: "assistant",
        message: { role: "assistant", usage: { input_tokens: 3, output_tokens: 1 } },
        timestamp: "2026-11-04T02:00:00.000Z",
      })}\n`,
    );

    const record = scanQoderSessionFile(child, "qoder-cn");
    assert.ok(record);
    // `projectKey` steps up past the `subagents` directory.
    assert.equal(record.project_key, "acme-web");
    assert.equal(record.total_tokens, 4);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
