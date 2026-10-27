// Golden contract tests for the device flow (docs/cli-contract.md §2.1–2.3,
// §3 invariants 3 and 4). All values are fabricated.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { GET as authorizeGet, OPTIONS as authorizeOptions, POST as authorizePost } from "@/app/api/functions/token-usage-device-flow-authorize/route";
import { POST as pollPost } from "@/app/api/functions/token-usage-device-flow-poll/route";
import { POST as grantPost } from "@/app/api/functions/token-usage-device-flow-grant/route";
import { FakeSupabase } from "../helpers/fake-supabase";
import {
  DEVICE_A,
  JWT,
  TOKEN_A,
  USER_ID,
  base,
  initContractEnv,
  jsonRequest,
  rawRequest,
  seedScenario,
} from "./helpers";
import { sha256Hex } from "@/lib/device-codes";

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

const hex64 = /^[0-9a-f]{64}$/;
const USER_CODE_RE = /^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/;

describe("POST device-flow-authorize", () => {
  it("issues a 15-minute pairing code with the frozen shape", async () => {
    const res = await authorizePost(
      jsonRequest(base("device-flow-authorize"), {
        body: { client_info: "tokentracker 1.4.0 PC One", machine_id: "machine-new-9999" },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.device_code).toMatch(hex64);
    expect(body.user_code).toMatch(USER_CODE_RE);
    expect(body.verification_uri).toBe("http://dashboard.test/device");
    expect(body.verification_uri_complete).toBe(
      `http://dashboard.test/device?user_code=${encodeURIComponent(body.user_code)}`,
    );
    expect(body.expires_in).toBe(900);
    expect(body.interval).toBe(5);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("access-control-allow-origin")).toBe("*");

    const rows = fake.table("token_device_codes");
    const created = rows.find((row) => row.device_code === body.device_code);
    expect(created).toMatchObject({
      user_code: body.user_code,
      status: "pending",
      client_info: "tokentracker 1.4.0 PC One",
      machine_id: "machine-new-9999",
    });
    // 15 minutes out (allow a small scheduling skew).
    const ttl = new Date(String(created!.expires_at)).getTime() - Date.now();
    expect(ttl).toBeGreaterThan(14.5 * 60 * 1000);
    expect(ttl).toBeLessThanOrEqual(15 * 60 * 1000);
  });

  it("truncates client_info and validates machine_id like the contract", async () => {
    const res = await authorizePost(
      jsonRequest(base("device-flow-authorize"), {
        body: { client_info: "c".repeat(500), machine_id: "short" },
      }),
    );
    const row = fake.table("token_device_codes").at(-1);
    expect((row!.client_info as string).length).toBe(200);
    expect(row!.machine_id).toBeNull(); // trim length < 8 → null
    expect(res.status).toBe(200);
  });

  it("answers OPTIONS with 204 and CORS", async () => {
    const res = await authorizeOptions();
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-methods")).toBe("GET, POST, OPTIONS");
    expect(res.headers.get("access-control-allow-headers")).toBe("Content-Type, Authorization, apikey, x-api-key");
    expect(res.headers.get("access-control-max-age")).toBe("86400");
  });

  it("returns the frozen 405 envelope for GET", async () => {
    const res = await authorizeGet();
    expect(res.status).toBe(405);
    expect(await res.json()).toEqual({ error: "Method not allowed" });
  });

  it("returns 503 after five user_code collisions", async () => {
    fake.conflictInjection = { table: "token_device_codes", times: 5 };
    const res = await authorizePost(jsonRequest(base("device-flow-authorize"), { body: {} }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "Could not allocate a device code" });
    expect(fake.conflictInjection.times).toBe(0);
  });

  it("returns 500 when the dashboard URL is unconfigured", async () => {
    const previous = process.env.TOKEN_USAGE_DASHBOARD_URL;
    delete process.env.TOKEN_USAGE_DASHBOARD_URL;
    try {
      const res = await authorizePost(jsonRequest(base("device-flow-authorize"), { body: {} }));
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: "TOKEN_USAGE_DASHBOARD_URL is not configured" });
    } finally {
      process.env.TOKEN_USAGE_DASHBOARD_URL = previous;
    }
  });

  it("maps malformed JSON to the stable 400 invalid_json envelope", async () => {
    const res = await authorizePost(rawRequest(base("device-flow-authorize"), { body: "{broken" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_json" });
  });
});

describe("POST device-flow-poll", () => {
  it("returns 404 unknown for a malformed or missing device_code", async () => {
    for (const device_code of ["not-a-code", "a".repeat(63), "z".repeat(64)]) {
      const res = await pollPost(jsonRequest(base("device-flow-poll"), { body: { device_code } }));
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ status: "unknown" });
    }
    const absent = await pollPost(
      jsonRequest(base("device-flow-poll"), { body: { device_code: "d".repeat(64) } }),
    );
    expect(absent.status).toBe(404);
    expect(await absent.json()).toEqual({ status: "unknown" });
  });

  it("reports pending for a live unapproved code", async () => {
    const res = await pollPost(
      jsonRequest(base("device-flow-poll"), { body: { device_code: "a".repeat(64) } }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "pending" });
  });

  it("expires a past-due pending code and reports 410", async () => {
    const res = await pollPost(
      jsonRequest(base("device-flow-poll"), { body: { device_code: "c".repeat(64) } }),
    );
    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({ status: "expired" });
    const row = fake.table("token_device_codes").find((r) => r.user_code === "EEEE-FFFF");
    expect(row!.status).toBe("expired");
  });

  it("issues a device token on approval and stores only its hash", async () => {
    const res = await pollPost(
      jsonRequest(base("device-flow-poll"), { body: { device_code: "b".repeat(64) } }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("approved");
    expect(body.user_id).toBe(USER_ID);
    expect(body.device_token).toMatch(hex64);
    expect(body.machine_id).toBe("machine-dddd-4444");

    const tokenRows = fake.table("token_device_tokens");
    const stored = tokenRows.find((row) => row.token_hash === sha256Hex(body.device_token));
    expect(stored).toBeTruthy();
    expect(stored!.device_id).toBe(body.device_id);
    // The plaintext never lands in the database.
    expect(tokenRows.some((row) => String(row.token_hash).includes(body.device_token))).toBe(false);

    const device = fake.table("token_devices").find((row) => row.id === body.device_id);
    expect(device).toMatchObject({
      platform: "cli-device-flow",
      machine_id: "machine-dddd-4444",
      machine_cluster_id: "machine-dddd-4444",
    });
    expect(String(device!.device_name).startsWith("1.4.0 PC Two #machine-")).toBe(true);
  });

  it("reuses the active device row for a known machine_id", async () => {
    // Full pairing chain: authorize → the /device page grants → poll issues.
    const authorizeRes = await authorizePost(
      jsonRequest(base("device-flow-authorize"), {
        body: { client_info: "tokentracker 9.9.9 PC One", machine_id: "machine-aaaa-1111" },
      }),
    );
    const { device_code, user_code } = await authorizeRes.json();
    const grantRes = await grantPost(
      jsonRequest(base("device-flow-grant"), { body: { user_code }, token: JWT }),
    );
    expect(grantRes.status).toBe(200);

    const res = await pollPost(jsonRequest(base("device-flow-poll"), { body: { device_code } }));
    const body = await res.json();
    expect(body.status).toBe("approved");
    expect(body.device_id).toBe(DEVICE_A);

    // Rule 4: issuing revokes the device's still-active tokens first.
    const activeTokens = fake
      .table("token_device_tokens")
      .filter((row) => row.device_id === DEVICE_A && row.revoked_at == null);
    expect(activeTokens).toHaveLength(1);
    expect(activeTokens[0].token_hash).toBe(sha256Hex(body.device_token));
  });

  it("answers 410 for codes already used or expired", async () => {
    fake.table("token_device_codes").find((row) => row.user_code === "CCCC-DDDD")!.status = "used";
    const res = await pollPost(
      jsonRequest(base("device-flow-poll"), { body: { device_code: "b".repeat(64) } }),
    );
    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({ status: "expired" });
  });
});

describe("POST device-flow-grant", () => {
  it("requires a principal", async () => {
    const res = await grantPost(
      jsonRequest(base("device-flow-grant"), { body: { user_code: "aaaa-bbbb" }, token: null }),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("accepts both device tokens and Supabase JWTs", async () => {
    for (const token of [TOKEN_A, JWT]) {
      fake.reset();
      seedScenario(fake);
      const res = await grantPost(
        jsonRequest(base("device-flow-grant"), { body: { user_code: "aaaa-bbbb" }, token }),
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, user_code: "AAAA-BBBB" });
      const row = fake.table("token_device_codes").find((r) => r.user_code === "AAAA-BBBB");
      expect(row).toMatchObject({ status: "approved", user_id: USER_ID });
      expect(new Date(String(row!.approved_at)).getTime()).toBeGreaterThan(0);
    }
  });

  it("uppercases before validating", async () => {
    const res = await grantPost(
      jsonRequest(base("device-flow-grant"), { body: { user_code: "aaaa-bbbb" }, token: TOKEN_A }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, user_code: "AAAA-BBBB" });
  });

  it("rejects invalid formats with the frozen message", async () => {
    const res = await grantPost(
      jsonRequest(base("device-flow-grant"), { body: { user_code: "A1AA-BBBB" }, token: TOKEN_A }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid user_code format" });
  });

  it("returns 404 for unknown, expired or already-approved codes", async () => {
    const cases = ["ZZZZ-ZZZZ", "eeee-ffff" /* expired */, "cccc-dddd" /* approved */];
    for (const user_code of cases) {
      const res = await grantPost(
        jsonRequest(base("device-flow-grant"), { body: { user_code }, token: TOKEN_A }),
      );
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Code not found, expired, or already used" });
    }
  });
});
