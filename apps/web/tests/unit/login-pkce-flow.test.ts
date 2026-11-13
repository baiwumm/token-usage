// Why the login page settles the auth client before starting a PKCE flow.
//
// A session cookie left behind by an expired or revoked login is torn down
// during the browser client's one-time initialization, and that teardown also
// clears every pending PKCE verifier. The login flows (magic link, password
// reset, OAuth) write their verifier right before redirecting, so a teardown
// that lands after the write deletes it and /auth/callback answers
// `auth_exchange_failed` — the first attempt reports 「登录链接无效或已过期」,
// only a second one works (that was the reported bug).
//
// These cases pin the storage behaviour the fix relies on: after
// `auth.initialize()` settles, `signInWithOAuth` keeps its verifier.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";

const STORAGE_KEY = "sb-testref-auth-token";
const VERIFIER_KEY = `${STORAGE_KEY}-code-verifier`;

/** Dead session: access token long expired, refresh token revoked. */
const DEAD_SESSION = JSON.stringify({
  access_token: "stale-access-token",
  refresh_token: "revoked-refresh-token",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) - 600,
  user: { id: "00000000-0000-0000-0000-000000000000" },
});

interface StorageAdapter {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

function fakeStorage() {
  const items = new Map<string, string>([[STORAGE_KEY, DEAD_SESSION]]);

  const adapter: StorageAdapter = {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
    removeItem: (key) => {
      items.delete(key);
    },
  };

  return { items, adapter };
}

/** GoTrue stand-in: the refresh token is dead, everything else succeeds. */
function fakeFetch() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();

    if (url.includes("grant_type=refresh_token")) {
      return new Response(
        JSON.stringify({
          error: "invalid_grant",
          error_description: "Invalid Refresh Token",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    return new Response("{}", { status: 200 });
  });
}

function browserClient(
  fetchImpl: ReturnType<typeof fakeFetch>,
  storage: StorageAdapter,
) {
  return createClient("https://testref.supabase.co", "fake-publishable-key", {
    auth: {
      storage,
      storageKey: STORAGE_KEY,
      flowType: "pkce",
      autoRefreshToken: true,
      detectSessionInUrl: false,
      persistSession: true,
    },
    global: { fetch: fetchImpl as unknown as typeof fetch },
  });
}

async function startOAuth(client: SupabaseClient): Promise<void> {
  await client.auth.signInWithOAuth({
    provider: "github",
    options: {
      redirectTo: "http://localhost:3000/auth/callback",
      skipBrowserRedirect: true,
    },
  });
}

/** Polls a predicate until it holds (or the budget runs out). */
async function waitFor(predicate: () => boolean): Promise<boolean> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  return predicate();
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("login page PKCE flow start", () => {
  it("keeps the verifier when the client is settled first", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { items, adapter } = fakeStorage();
    const client = browserClient(fakeFetch(), adapter);

    // What @/components/login/login-body settleAuthClient does.
    await client.auth.initialize();
    await startOAuth(client);

    // /auth/callback reads this key (no flow id is passed server-side).
    expect(items.get(VERIFIER_KEY)).toBeTruthy();
  });

  it("loses the verifier when the flow starts before initialization settles", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { items, adapter } = fakeStorage();
    const client = browserClient(fakeFetch(), adapter);

    // The pre-fix order: click straight away, init still in flight.
    await startOAuth(client);

    // The session teardown is what deletes the verifier; wait for it to land.
    await waitFor(() => !items.has(STORAGE_KEY));

    expect(items.has(VERIFIER_KEY)).toBe(false);
  });
});
