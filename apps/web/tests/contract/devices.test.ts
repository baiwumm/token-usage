// Golden contract tests for device-rename and device-revoke
// (docs/cli-contract.md §2.8–2.9; §3 invariants 4 and 5).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { POST as renamePost } from "@/app/api/functions/token-usage-device-rename/route";
import { POST as revokePost } from "@/app/api/functions/token-usage-device-revoke/route";
import { GET as summaryGet } from "@/app/api/functions/token-usage-account-summary/route";

import { FakeSupabase } from "../helpers/fake-supabase";
import {
  DEVICE_A,
  DEVICE_B,
  DEVICE_REVOKED,
  JWT,
  TOKEN_A,
  TOKEN_B,
  base,
  initContractEnv,
  jsonRequest,
  rawRequest,
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

function rename(body: unknown, token: string | null = TOKEN_A) {
  return renamePost(jsonRequest(base("device-rename"), { body, token }));
}

function revoke(body: unknown, token: string | null = TOKEN_A) {
  return revokePost(jsonRequest(base("device-revoke"), { body, token }));
}

describe("POST device-rename", () => {
  it("renames a device and reports the previous name", async () => {
    const res = await rename({ device_id: DEVICE_A, device_name: "  Renamed   PC  " });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      device_id: DEVICE_A,
      device_name: "Renamed PC",
      previous_name: "PC One #aaaa1111",
    });
    const row = fake.table("token_devices").find((r) => r.id === DEVICE_A);
    expect(row!.device_name).toBe("Renamed PC");
  });

  it("requires auth", async () => {
    const res = await rename({ device_id: DEVICE_A, device_name: "X" }, null);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("reports invalid_json for malformed bodies", async () => {
    const res = await renamePost(rawRequest(base("device-rename"), { body: "{broken", token: TOKEN_A }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_json" });
  });

  it("enforces the presence and length rules", async () => {
    const missing = await rename({ device_name: "X" });
    expect(missing.status).toBe(400);
    expect(await missing.json()).toEqual({ error: "device_id_and_name_required" });

    const emptyName = await rename({ device_id: DEVICE_A, device_name: "   " });
    expect(emptyName.status).toBe(400);
    expect(await emptyName.json()).toEqual({ error: "device_id_and_name_required" });

    const tooLong = await rename({ device_id: DEVICE_A, device_name: "x".repeat(61) });
    expect(tooLong.status).toBe(400);
    expect(await tooLong.json()).toEqual({ error: "device_name_length", min: 1, max: 60 });

    const edge = await rename({ device_id: DEVICE_A, device_name: "x".repeat(60) });
    expect(edge.status).toBe(200);
  });

  it("404s unknown and already-revoked targets", async () => {
    for (const device_id of ["99999999-9999-4999-8999-999999999999", DEVICE_REVOKED]) {
      const res = await rename({ device_id, device_name: "X" });
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "device_not_found" });
    }
  });

  it("scopes device tokens to their own device", async () => {
    const res = await rename({ device_id: DEVICE_B, device_name: "X" }, TOKEN_A);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "device_token_scoped_to_own_device" });
  });

  it("lets a JWT rename any device of the account", async () => {
    const res = await rename({ device_id: DEVICE_B, device_name: "JWT Renamed" }, JWT);
    expect(res.status).toBe(200);
  });

  it("rejects a name held by another active device with 409", async () => {
    const res = await rename({ device_id: DEVICE_A, device_name: "PC Two #bbbb2222" });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "device_name_taken" });
    // The revoked device's name is reusable.
    const ok = await rename({ device_id: DEVICE_A, device_name: "Old Laptop #cccc3333" });
    expect(ok.status).toBe(200);
  });
});

describe("POST device-revoke", () => {
  it("revokes the device and all its still-active tokens", async () => {
    const res = await revoke({ device_id: DEVICE_A });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      device_id: DEVICE_A,
      device_name: "PC One #aaaa1111",
      already_revoked: false,
      revoked_tokens: 1,
    });
    expect(new Date(body.revoked_at).getTime()).toBeGreaterThan(0);

    const device = fake.table("token_devices").find((r) => r.id === DEVICE_A)!;
    expect(device.revoked_at).toBe(body.revoked_at);
    const activeTokens = fake
      .table("token_device_tokens")
      .filter((r) => r.device_id === DEVICE_A && r.revoked_at == null);
    expect(activeTokens).toHaveLength(0);
  });

  it("is idempotent and preserves the first revoked_at", async () => {
    const first = await revoke({ device_id: DEVICE_A });
    const firstBody = await first.json();
    // The original device token died with the revocation; a JWT repeats it.
    const second = await revoke({ device_id: DEVICE_A }, JWT);
    expect(second.status).toBe(200);
    const secondBody = await second.json();
    expect(secondBody).toMatchObject({
      already_revoked: true,
      revoked_at: firstBody.revoked_at,
      revoked_tokens: 0,
    });
    // And the revoked token now fails auth outright.
    const stale = await revoke({ device_id: DEVICE_A }, TOKEN_A);
    expect(stale.status).toBe(401);
  });

  it("makes revoked tokens fail auth immediately", async () => {
    const res = await revoke({ device_id: DEVICE_B }, TOKEN_B); // device token revokes itself
    expect(res.status).toBe(200);
    const after = await revoke({ device_id: DEVICE_B }, TOKEN_B);
    expect(after.status).toBe(401);
    expect(await after.json()).toEqual({ error: "Unauthorized" });
  });

  it("keeps usage rows in the database but drops them from account totals", async () => {
    const summary = await summaryGet(new Request(base("account-summary"), { headers: { Authorization: `Bearer ${TOKEN_A}` } }));
    expect((await summary.json()).totals.total_tokens).toBe(5700);

    await revoke({ device_id: DEVICE_A }, JWT);

    const rows = fake.table("token_usage_hourly").filter((r) => r.device_id === DEVICE_A);
    expect(rows.length).toBeGreaterThan(0); // rows stay

    const after = await summaryGet(new Request(base("account-summary"), { headers: { Authorization: `Bearer ${TOKEN_B}` } }));
    const body = await after.json();
    // Machine rows of A leave; cursor (account level) and trae-cn session stay.
    expect(body.totals.total_tokens).toBe(1500);
  });

  it("validates input and scoping", async () => {
    const missing = await revoke({});
    expect(missing.status).toBe(400);
    expect(await missing.json()).toEqual({ error: "device_id_required" });

    const unknown = await revoke({ device_id: "99999999-9999-4999-8999-999999999999" });
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toEqual({ error: "device_not_found" });

    const crossDevice = await revoke({ device_id: DEVICE_B }, TOKEN_A);
    expect(crossDevice.status).toBe(403);
    expect(await crossDevice.json()).toEqual({ error: "device_token_scoped_to_own_device" });

    const badJson = await revokePost(rawRequest(base("device-revoke"), { body: "{broken", token: TOKEN_A }));
    expect(badJson.status).toBe(400);
    expect(await badJson.json()).toEqual({ error: "invalid_json" });
  });
});
