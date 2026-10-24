// Server-level alias equivalence (docs/cli-contract.md §1.5, §3 invariant 1).
//
// Boots a real `next dev` server and replays each contract request against the
// canonical /api/functions/token-usage-* path AND the legacy /api/functions/
// tokentracker-* alias. For every pair the status, body and CORS headers must
// match byte-for-byte after normalizing volatile values (fresh pairing codes,
// issued tokens, uuids, timestamps). The database is reset between the two
// legs so mutating endpoints see identical starting state.

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { FakeSupabase } from "../helpers/fake-supabase";
import { TOKEN_A, JWT, initContractEnv, seedScenario } from "./helpers";

const fake = new FakeSupabase();
let child: ChildProcess | null = null;
let port = 0;

const webRoot = path.resolve(__dirname, "../..");

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

async function killChild(): Promise<void> {
  if (!child) return;
  const proc = child;
  const pid = proc.pid;
  child = null;
  if (pid == null) return;
  if (process.platform === "win32") {
    await new Promise<void>((resolve) => {
      const killer = spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" });
      killer.on("close", () => resolve());
      killer.on("error", () => resolve());
    });
  } else {
    // The server runs detached in its own process group; ESRCH means it
    // already exited before we could signal it.
    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      try {
        proc.kill("SIGTERM");
      } catch {
        // already gone
      }
    }
  }
}

async function startServer(): Promise<void> {
  port = await freePort();
  const nextBin = path.join(webRoot, "node_modules", "next", "dist", "bin", "next");
  if (!existsSync(nextBin)) throw new Error(`next binary not found at ${nextBin}`);
  child = spawn(
    process.execPath,
    [nextBin, "dev", "--hostname", "127.0.0.1", "--port", String(port)],
    {
      cwd: webRoot,
      env: {
        ...process.env,
        NEXT_TELEMETRY_DISABLED: "1",
        // Isolated build dir: a developer's dev server may be running from
        // this tree concurrently; two next instances on the same .next dir
        // lock each other out (next.config.mjs honors NEXT_DIST_DIR).
        NEXT_DIST_DIR: ".next-alias-test",
        NEXT_PUBLIC_SUPABASE_URL: fake.url,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "fake-publishable-key",
        SUPABASE_SECRET_KEY: "fake-secret-key",
        TOKEN_USAGE_DASHBOARD_URL: `http://127.0.0.1:${port}`,
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      // Own process group so the POSIX cleanup can signal the whole tree.
      detached: process.platform !== "win32",
    },
  );
  child.stderr?.on("data", (chunk: Buffer) => {
    // Surface fatal boot errors if readiness never arrives.
    const text = String(chunk);
    if (text.includes("Error:") || text.includes("EADDRINUSE")) console.error("[next dev]", text.trim());
  });

  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/functions/token-usage-public-config`);
      if (res.status === 200) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("next dev did not become ready in time");
}

beforeAll(async () => {
  initContractEnv(await fake.listen());
  seedScenario(fake);
  await startServer();
}, 240_000);

afterAll(async () => {
  await killChild();
  await fake.close();
  rmSync(path.join(webRoot, ".next-alias-test"), { recursive: true, force: true });
});

function normalize(text: string): string {
  return text
    .replace(/[0-9a-f]{64}/g, "<hex64>")
    .replace(/[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}/g, "<usercode>")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, "<uuid>")
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z/g, "<iso>");
}

type Case = {
  name: string;
  slug: string;
  method?: string;
  query?: string;
  body?: unknown;
  token?: string | null;
};

const CANONICAL = "token-usage";
const LEGACY = "tokentracker";

// One representative request (success and error paths) per contract endpoint,
// plus the verb behaviors owned by the proxy.
const CASES: Case[] = [
  { name: "public-config", slug: "public-config", method: "GET" },
  { name: "authorize", slug: "device-flow-authorize", method: "POST", body: { client_info: "tokentracker 1.4.0 Alias PC", machine_id: "machine-alias-0001" } },
  { name: "poll pending", slug: "device-flow-poll", method: "POST", body: { device_code: "a".repeat(64) } },
  { name: "poll unknown", slug: "device-flow-poll", method: "POST", body: { device_code: "zz" } },
  { name: "grant unauthenticated", slug: "device-flow-grant", method: "POST", body: { user_code: "AAAA-BBBB" }, token: null },
  { name: "ingest unauthenticated", slug: "ingest", method: "POST", body: { hourly: [] }, token: null },
  {
    name: "ingest",
    slug: "ingest",
    method: "POST",
    token: TOKEN_A,
    body: {
      hourly: [{
        hour_start: "2026-10-21T09:00:00.000Z",
        source: "codex",
        model: "test-unpriced-model",
        input_tokens: 10,
        cached_input_tokens: 0,
        cache_creation_input_tokens: 0,
        output_tokens: 5,
        reasoning_output_tokens: 0,
        total_tokens: 15,
        conversation_count: 1,
      }],
    },
  },
  { name: "account-summary", slug: "account-summary", method: "GET", token: TOKEN_A },
  { name: "account-summary unauthenticated", slug: "account-summary", method: "GET", token: null },
  { name: "account-daily", slug: "account-daily", method: "GET", query: "?from=2026-10-21&to=2026-10-21", token: TOKEN_A },
  { name: "account-daily missing params", slug: "account-daily", method: "GET", token: TOKEN_A },
  { name: "account-hourly", slug: "account-hourly", method: "GET", query: "?day=2026-10-21", token: TOKEN_A },
  { name: "account-monthly", slug: "account-monthly", method: "GET", query: "?months=1&to=2026-10-31", token: TOKEN_A },
  { name: "account-heatmap", slug: "account-heatmap", method: "GET", query: "?weeks=2&to=2026-10-21", token: TOKEN_A },
  { name: "account-heatmap compact", slug: "account-heatmap", method: "GET", query: "?weeks=2&to=2026-10-21&format=compact", token: TOKEN_A },
  { name: "account-model-breakdown", slug: "account-model-breakdown", method: "GET", query: "?from=2026-10-21&to=2026-10-21", token: TOKEN_A },
  { name: "account-devices", slug: "account-devices", method: "GET", query: "?from=2026-10-21&to=2026-10-21", token: TOKEN_A },
  { name: "account unknown series", slug: "account-bogus", method: "GET", token: TOKEN_A },
  { name: "dashboard", slug: "dashboard", method: "GET", query: "?from=2026-10-21T00:00:00.000Z&to=2026-10-22T00:00:00.000Z", token: TOKEN_A },
  { name: "dashboard invalid range", slug: "dashboard", method: "GET", query: "?from=garbage", token: TOKEN_A },
  { name: "device-rename", slug: "device-rename", method: "POST", body: { device_id: "22222222-2222-4222-8222-222222222222", device_name: "Alias Renamed" }, token: JWT },
  { name: "device-rename missing", slug: "device-rename", method: "POST", body: {}, token: JWT },
  { name: "device-revoke", slug: "device-revoke", method: "POST", body: { device_id: "33333333-3333-4333-8333-333333333333" }, token: JWT },
  { name: "device-revoke unknown", slug: "device-revoke", method: "POST", body: { device_id: "99999999-9999-4999-8999-999999999999" }, token: JWT },
];

async function call(prefix: string, c: Case): Promise<{ status: number; body: string; cors: Record<string, string> }> {
  const url = `http://127.0.0.1:${port}/api/functions/${prefix}-${c.slug}${c.query ?? ""}`;
  const res = await fetch(url, {
    method: c.method ?? "GET",
    headers: {
      ...(c.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(c.token ? { Authorization: `Bearer ${c.token}` } : {}),
    },
    ...(c.body !== undefined ? { body: JSON.stringify(c.body) } : {}),
  });
  const body = await res.text();
  const cors: Record<string, string> = {};
  for (const header of [
    "access-control-allow-origin",
    "access-control-allow-methods",
    "access-control-allow-headers",
    "access-control-max-age",
    "cache-control",
    "content-type",
  ]) {
    const value = res.headers.get(header);
    if (value != null) cors[header] = value;
  }
  return { status: res.status, body, cors };
}

describe("legacy tokentracker-* alias equivalence", () => {
  it("answers the OPTIONS preflight identically on both path families", async () => {
    fake.reset();
    seedScenario(fake);
    const canonical = await call(CANONICAL, { name: "options", slug: "ingest", method: "OPTIONS" });
    const alias = await call(LEGACY, { name: "options", slug: "ingest", method: "OPTIONS" });
    expect(canonical.status).toBe(204);
    expect(alias).toEqual(canonical);
  });

  it("returns the frozen 405 envelope for non-GET/POST verbs on both families", async () => {
    fake.reset();
    seedScenario(fake);
    const canonical = await call(CANONICAL, { name: "patch", slug: "ingest", method: "PATCH" });
    const alias = await call(LEGACY, { name: "patch", slug: "ingest", method: "PATCH" });
    expect(canonical.status).toBe(405);
    expect(canonical.body).toBe(JSON.stringify({ error: "Method not allowed" }));
    expect(alias).toEqual(canonical);
  });

  for (const c of CASES) {
    it(`matches for ${c.name}`, async () => {
      fake.reset();
      seedScenario(fake);
      const canonical = await call(CANONICAL, c);
      fake.reset();
      seedScenario(fake);
      const alias = await call(LEGACY, c);
      expect(alias.status).toBe(canonical.status);
      expect(normalize(alias.body)).toBe(normalize(canonical.body));
      expect(alias.cors).toEqual(canonical.cors);
    });
  }
});
