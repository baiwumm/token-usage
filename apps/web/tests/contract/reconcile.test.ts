// Golden contract tests for the reconcile read face (docs/cli-contract.md
// §2.13, §3 frozen item 15): device-token-only auth, half-open hour window,
// device scoping, verbatim rows (account-level sources included, no derived
// cost), deterministic ordering, paging clamps and the 366-day window clamp.
// The CLI compares these rows against its local queue.jsonl last-wins baseline.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { GET as reconcileGet, POST as reconcilePost, OPTIONS as reconcileOptions } from "@/app/api/functions/token-usage-reconcile/route";
import { FakeSupabase, type Row } from "../helpers/fake-supabase";
import {
  DEVICE_A,
  DEVICE_B,
  DEVICE_REVOKED,
  JWT,
  TOKEN_A,
  TOKEN_B,
  TOKEN_ON_REVOKED_DEVICE,
  TOKEN_REVOKED,
  base,
  initContractEnv,
  seedScenario,
} from "./helpers";

const fake = new FakeSupabase();

beforeAll(async () => {
  initContractEnv(await fake.listen());
});

afterAll(async () => {
  await fake.close();
});

beforeEach(() => {
  fake.reset();
  seedScenario(fake);
});

function reconcile(query = "", token: string | null = TOKEN_A): Promise<Response> {
  return reconcileGet(
    new Request(`${base("reconcile")}${query}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  );
}

const DAY = "?from=2026-10-21T00:00:00.000Z&to=2026-10-22T00:00:00.000Z";

describe("reconcile auth", () => {
  it("accepts device tokens only and distinguishes every rejection", async () => {
    const missing = await reconcile(DAY, null);
    expect(missing.status).toBe(401);
    expect(await missing.json()).toEqual({ error: "Missing bearer token" });

    const revokedToken = await reconcile(DAY, TOKEN_REVOKED);
    expect(revokedToken.status).toBe(401);
    expect(await revokedToken.json()).toEqual({ error: "Unauthorized" });

    const unknown = await reconcile(DAY, "not-a-known-token");
    expect(unknown.status).toBe(401);
    expect(await unknown.json()).toEqual({ error: "Unauthorized" });

    const revokedDevice = await reconcile(DAY, TOKEN_ON_REVOKED_DEVICE);
    expect(revokedDevice.status).toBe(403);
    expect(await revokedDevice.json()).toEqual({ error: "Device is revoked" });

    // A JWT never resolves here — no dashboard-face fallback (§2.13).
    const jwt = await reconcile(DAY, JWT);
    expect(jwt.status).toBe(401);
    expect(await jwt.json()).toEqual({ error: "Unauthorized" });
  });

  it("rejects unsupported methods and answers preflight", async () => {
    const post = await reconcilePost();
    expect(post.status).toBe(405);
    expect(await post.json()).toEqual({ error: "Method not allowed" });

    const options = await reconcileOptions();
    expect(options.status).toBe(204);
  });
});

describe("reconcile query validation", () => {
  it("requires a parseable from/to and rejects inverted windows", async () => {
    for (const query of [
      "",
      "?from=2026-10-21T00:00:00.000Z",
      "?to=2026-10-21T00:00:00.000Z",
      "?from=garbage&to=2026-10-22T00:00:00.000Z",
      "?from=2026-10-21T00:00:00.000Z&to=garbage",
    ]) {
      const res = await reconcile(query);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Missing from/to" });
    }

    const inverted = await reconcile(
      "?from=2026-10-22T00:00:00.000Z&to=2026-10-21T00:00:00.000Z",
    );
    expect(inverted.status).toBe(400);
    expect(await inverted.json()).toEqual({ error: "Invalid from/to" });
  });

  it("clamps the window to 366 days from the to edge", async () => {
    const res = await reconcile(
      "?from=2020-01-01T00:00:00.000Z&to=2026-10-22T00:00:00.000Z",
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    // 2026-10-22 minus 366 days: the seeded rows still fall inside.
    expect(body.from).toBe("2025-10-21T00:00:00.000Z");
    expect(body.to).toBe("2026-10-22T00:00:00.000Z");
    expect(body.buckets.length).toBeGreaterThan(0);
  });
});

describe("reconcile rows", () => {
  it("returns only this device's rows, verbatim, in (hour_start, source, model) order", async () => {
    const res = await reconcile(DAY);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.from).toBe("2026-10-21T00:00:00.000Z");
    expect(body.to).toBe("2026-10-22T00:00:00.000Z");
    expect(body.device_id).toBe(DEVICE_A);
    expect(body.limit).toBe(1000);
    expect(body.offset).toBe(0);
    // Device A: codex, claude-code, grok and its own cursor row. Device B's
    // cursor/trae-cn rows and the revoked device's row never surface.
    expect(body.buckets).toHaveLength(4);
    expect(
      body.buckets.map((bucket: Row) => [bucket.hour_start, bucket.source]),
    ).toEqual([
      ["2026-10-21T00:00:00.000Z", "codex"],
      ["2026-10-21T02:00:00.000Z", "claude-code"],
      ["2026-10-21T03:00:00.000Z", "grok"],
      ["2026-10-21T05:00:00.000Z", "cursor"],
    ]);

    const codex = body.buckets[0];
    expect(codex.model).toBe("test-unpriced-model");
    expect(codex.input_tokens).toBe(1000);
    expect(codex.output_tokens).toBe(500);
    expect(codex.total_tokens).toBe(1500);
    expect(codex.billable_total_tokens).toBeNull();
    expect(codex.conversations).toBe(1);
    expect(codex.credits).toBe(0.642);
    // Account-level sources are NOT stripped: they are this device's uploads.
    expect(body.buckets[3].source).toBe("cursor");
    expect(body.buckets[3].credits).toBe(0);
    // Wire shape: exactly the contract fields, no derived cost.
    expect(Object.keys(codex).sort()).toEqual(
      [
        "billable_total_tokens",
        "cache_creation_input_tokens",
        "cached_input_tokens",
        "conversations",
        "credits",
        "hour_start",
        "input_tokens",
        "model",
        "output_tokens",
        "reasoning_output_tokens",
        "source",
        "total_tokens",
      ].sort(),
    );
    expect(codex.total_cost_usd).toBeUndefined();
  });

  it("uses a half-open window on hour_start", async () => {
    // `to` lands exactly on the 02:00 row → that row must not appear.
    const res = await reconcile(
      "?from=2026-10-21T00:00:00.000Z&to=2026-10-21T02:00:00.000Z",
    );
    const body = await res.json();

    expect(body.buckets.map((bucket: Row) => bucket.hour_start)).toEqual([
      "2026-10-21T00:00:00.000Z",
    ]);
  });

  it("pages deterministically with limit/offset and clamps both", async () => {
    const page1 = await (await reconcile(`${DAY}&limit=2&offset=0`)).json();
    const page2 = await (await reconcile(`${DAY}&limit=2&offset=2`)).json();

    expect(page1.buckets).toHaveLength(2);
    expect(page1.limit).toBe(2);
    expect(page2.buckets).toHaveLength(2);
    expect(page2.offset).toBe(2);
    expect(page2.buckets.map((bucket: Row) => bucket.source)).toEqual([
      "grok",
      "cursor",
    ]);

    // Clamps: limit 0 → 1, oversize → 2000, garbage → default 1000,
    // negative/garbage offset → 0.
    const clamped = await (
      await reconcile(`${DAY}&limit=0&offset=-5`)
    ).json();
    expect(clamped.limit).toBe(1);
    expect(clamped.offset).toBe(0);

    const big = await (await reconcile(`${DAY}&limit=9999`)).json();
    expect(big.limit).toBe(2000);
    expect(big.buckets).toHaveLength(4);

    const junk = await (await reconcile(`${DAY}&limit=abc&offset=abc`)).json();
    expect(junk.limit).toBe(1000);
    expect(junk.offset).toBe(0);
  });

  it("ignores an unknown device_id parameter — the token decides the device", async () => {
    const res = await reconcile(`${DAY}&device_id=${DEVICE_B}`, TOKEN_A);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.device_id).toBe(DEVICE_A);
    expect(body.buckets).toHaveLength(4);
  });

  it("scopes reads to the token even when the account owns several devices", async () => {
    const deviceB = await (await reconcile(DAY, TOKEN_B)).json();
    // Device B owns the cursor row and the trae-cn row (the seeded revoked row
    // stays excluded because its device is revoked).
    expect(deviceB.device_id).toBe(DEVICE_B);
    expect(deviceB.buckets.map((bucket: Row) => bucket.source)).toEqual([
      "cursor",
      "trae-cn",
    ]);
  });

  it("returns an empty page for a window without rows", async () => {
    const res = await reconcile(
      "?from=2026-01-01T00:00:00.000Z&to=2026-01-02T00:00:00.000Z",
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.buckets).toEqual([]);
  });

  it("never leaks another account's rows", async () => {
    fake.table("token_usage_hourly").push({
      user_id: "99999999-9999-4999-8999-999999999999",
      device_id: DEVICE_REVOKED,
      hour_start: "2026-10-21T09:00:00.000Z",
      source: "codex",
      model: "foreign-model",
      input_tokens: 1,
      cached_input_tokens: 0,
      cache_creation_input_tokens: 0,
      output_tokens: 0,
      reasoning_output_tokens: 0,
      total_tokens: 1,
      billable_total_tokens: null,
      conversations: 0,
      total_cost_usd: 0,
      credits: 0,
      updated_at: "2026-10-21T10:00:00.000Z",
    });

    const body = await (await reconcile(DAY)).json();
    expect(body.buckets.some((bucket: Row) => bucket.model === "foreign-model")).toBe(false);
    expect(body.buckets).toHaveLength(4);
  });
});
