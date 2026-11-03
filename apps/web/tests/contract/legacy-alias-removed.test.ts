// Legacy alias removal guard (docs/cli-contract.md §1.5, retired 2026-11-03).
//
// Boots a real `next dev` server and asserts the retired /api/functions/
// tokentracker-* paths get NO mapping (404 from Next routing), while the
// canonical token-usage-* paths keep serving. Prevents the alias from being
// quietly reintroduced. Note: OPTIONS still answers 204 on any
// /api/functions/* path — that is the pre-routing CORS gate (proxy.ts), not
// an alias, and it carries no handler behavior.

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { FakeSupabase } from "../helpers/fake-supabase";
import { TOKEN_A, initContractEnv, seedScenario } from "./helpers";

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

type LegacyRequest = {
  slug: string;
  method?: string;
  query?: string;
  body?: unknown;
  // GET on a retired path falls through to routing -> 404. POST lands on the
  // /api/functions/[...slug] catch-all, which serves only the account-series
  // family and answers every other slug's POST with the frozen 405 envelope —
  // also "no mapping": neither 404 nor 405 ever touches a handler.
  expect: 404 | 405;
};

// Representative retired paths: bare slug, account-series slug, and the two
// verb families the old CLI actually uses (GET series reads, POST writes).
const RETIRED: LegacyRequest[] = [
  { slug: "public-config", method: "GET", expect: 404 },
  { slug: "ingest", method: "POST", body: { hourly: [] }, expect: 405 },
  { slug: "device-flow-authorize", method: "POST", body: {}, expect: 405 },
  { slug: "account-daily", method: "GET", query: "?from=2026-10-21&to=2026-10-21", expect: 404 },
  { slug: "account-summary", method: "GET", expect: 404 },
];

describe("retired tokentracker-* aliases", () => {
  it("canonical token-usage-* paths still serve (server smoke)", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/functions/token-usage-public-config`);
    expect(res.status).toBe(200);
  });

  it("canonical token-usage-ingest still reaches its handler (401 without token)", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/functions/token-usage-ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hourly: [] }),
    });
    expect(res.status).toBe(401);
  });

  for (const c of RETIRED) {
    it(`${c.method ?? "GET"} /api/functions/tokentracker-${c.slug} -> ${c.expect} (no handler)`, async () => {
      const res = await fetch(
        `http://127.0.0.1:${port}/api/functions/tokentracker-${c.slug}${c.query ?? ""}`,
        {
          method: c.method ?? "GET",
          headers: {
            ...(c.body !== undefined ? { "Content-Type": "application/json" } : {}),
            Authorization: `Bearer ${TOKEN_A}`,
          },
          ...(c.body !== undefined ? { body: JSON.stringify(c.body) } : {}),
        },
      );
      expect(res.status).toBe(c.expect);
    });
  }

  it("OPTIONS on a retired path still answers 204 (pre-routing CORS gate, not an alias)", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/functions/tokentracker-ingest`, {
      method: "OPTIONS",
    });
    expect(res.status).toBe(204);
  });
});
