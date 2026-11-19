// Unit tests for the supabase-js data-access wrapper: error-status mapping
// (unique violation → 409, anything else → 500), Auth error handling, and the
// new-key-system environment resolution with legacy fallbacks. All values are
// fabricated.

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { FakeSupabase } from "../helpers/fake-supabase";
import { resolvePrincipal } from "@/lib/api/principal";
import {
  SupabaseError,
  getUser,
  insert,
  select,
  upsert,
  __resetClientsForTests,
  assertConfigured,
} from "@/lib/api/supabase-rest";

const fake = new FakeSupabase();

const NEW_URL = "NEXT_PUBLIC_SUPABASE_URL";
const NEW_PUBLISHABLE = "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY";
const NEW_SECRET = "SUPABASE_SECRET_KEY";
const LEGACY_URL = "SUPABASE_URL";
const LEGACY_PUBLISHABLE = "SUPABASE_ANON_KEY";
const LEGACY_SECRET = "SUPABASE_SERVICE_ROLE_KEY";

function clearAllEnv(): void {
  for (const name of [NEW_URL, NEW_PUBLISHABLE, NEW_SECRET, LEGACY_URL, LEGACY_PUBLISHABLE, LEGACY_SECRET]) {
    delete process.env[name];
  }
  __resetClientsForTests();
}

beforeAll(async () => {
  process.env[NEW_URL] = await fake.listen();
  process.env[NEW_PUBLISHABLE] = "fake-publishable-key";
  process.env[NEW_SECRET] = "fake-secret-key";
  fake.authUsers.set("valid-fake-jwt", { id: "11111111-1111-4111-8111-111111111111", email: "u@example.test" });
});

afterAll(async () => {
  clearAllEnv();
  await fake.close();
});

describe("error mapping", () => {
  it("maps unique violations to status 409", async () => {
    const row = { user_id: "u1", device_id: "d1", token_hash: "dup-hash" };
    await insert("token_device_tokens", [row]);
    await expect(insert("token_device_tokens", [row])).rejects.toMatchObject({
      status: 409,
      name: "SupabaseError",
    });
  });

  it("maps other PostgREST failures to status 500 (generic envelope upstream)", async () => {
    await expect(select("token_no_such_table")).rejects.toMatchObject({
      status: 500,
      name: "SupabaseError",
    });
  });
});

describe("supabase-js semantics via the wrapper", () => {
  it("returns rows from select with filters and pagination", async () => {
    fake.table("token_devices").push(
      { id: "a", user_id: "u1", revoked_at: null },
      { id: "b", user_id: "u1", revoked_at: "2026-01-01T00:00:00.000Z" },
    );
    const rows = await select("token_devices", {
      select: "id,revoked_at",
      filters: [
        ["user_id", "eq", "u1"],
        ["revoked_at", "is", "null"],
      ],
      limit: 10,
      offset: 0,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("a");
  });

  it("upserts with merge-duplicates on the conflict columns (last-wins)", async () => {
    await upsert(
      "token_account_session_states",
      [{ user_id: "u1", source: "trae-cn", session_id: "s1", total_tokens: 10 }],
      "user_id,source,session_id",
      { returning: false },
    );
    await upsert(
      "token_account_session_states",
      [{ user_id: "u1", source: "trae-cn", session_id: "s1", total_tokens: 99 }],
      "user_id,source,session_id",
      { returning: false },
    );
    const rows = fake.table("token_account_session_states").filter((r) => r.session_id === "s1");
    expect(rows).toHaveLength(1);
    expect(rows[0].total_tokens).toBe(99);
  });
});

describe("getUser", () => {
  it("returns null for rejected tokens (401/403)", async () => {
    expect(await getUser("not-a-known-token")).toBeNull();
  });

  it("returns null for other 4xx auth verdicts (e.g. session_not_found)", async () => {
    fake.authUserErrors.set("revoked-session-token", {
      status: 400,
      message: "session_not_found",
    });
    try {
      expect(await getUser("revoked-session-token")).toBeNull();
    } finally {
      fake.authUserErrors.clear();
    }
  });

  it("maps an Auth transport failure to 502, never a raw 500", async () => {
    const original = process.env[NEW_URL];

    process.env[NEW_URL] = "http://127.0.0.1:9";
    __resetClientsForTests();
    try {
      await expect(getUser("valid-fake-jwt")).rejects.toMatchObject({
        status: 502,
        name: "SupabaseError",
      });
    } finally {
      process.env[NEW_URL] = original;
      __resetClientsForTests();
    }
  });

  it("returns the validated user from Supabase Auth", async () => {
    const user = await getUser("valid-fake-jwt");
    expect(user).toMatchObject({ id: "11111111-1111-4111-8111-111111111111", email: "u@example.test" });
  });
});

describe("resolvePrincipal JWT expiry", () => {
  it("rejects an expired JWT locally without calling Supabase Auth", async () => {
    const payload = Buffer.from(
      JSON.stringify({ sub: "11111111-1111-4111-8111-111111111111", exp: 1 }),
    ).toString("base64url");
    const expired = `eyJhbGciOiJIUzI1NiJ9.${payload}.sig`;

    expect(await resolvePrincipal(expired)).toBeNull();
  });
});

describe("environment resolution", () => {
  it("assertConfigured passes with the new key names", () => {
    expect(assertConfigured()).toBe(true);
  });

  it("falls back to the legacy anon/service_role names", async () => {
    clearAllEnv();
    process.env[LEGACY_URL] = fake.url;
    process.env[LEGACY_PUBLISHABLE] = "legacy-anon";
    process.env[LEGACY_SECRET] = "legacy-secret";
    expect(assertConfigured()).toBe(true);
    expect(await getUser("valid-fake-jwt")).toMatchObject({ id: "11111111-1111-4111-8111-111111111111" });
  });

  it("throws a 500 SupabaseError when nothing is configured", () => {
    clearAllEnv();
    expect(() => assertConfigured()).toThrowError(SupabaseError);
    try {
      assertConfigured();
    } catch (error) {
      expect((error as SupabaseError).status).toBe(500);
    }
  });
});
