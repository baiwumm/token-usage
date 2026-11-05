"use strict";

// Cursor account-level CSV pipeline (2026-11-05 upsteam alignment):
//   - row admission is judged on every token component, so a cache-read-only
//     or cache-write-only row survives even when Cursor's Total column is 0;
//   - the session cookie tries the JWT subject first and retries the other
//     userId candidates only on an auth rejection.

const assert = require("node:assert/strict");
const { test } = require("node:test");

const {
  collectCursorSessionUserIds,
  fetchCursorUsageCsv,
  fetchCursorUsageCsvWithFallback,
  normalizeCursorUsage,
  parseCursorCsv,
} = require("../src/lib/cursor-config");

const HEADER =
  "Date,Model,Input (w/ Cache Write),Input (w/o Cache Write),Cache Read,Output Tokens,Total Tokens,Cost";

function csv(...rows) {
  return [HEADER, ...rows].join("\n");
}

test("cursor CSV keeps cache-only rows and drops token-less placeholders", () => {
  const records = parseCursorCsv(
    csv(
      // cache-read-only: Total is 0 but Cache Read is real usage
      "2026-11-04T10:00:00.000Z,claude-4.5-sonnet,0,0,1500,0,0,0.02",
      // cache-write-only: Input (w/ Cache Write) - Input (w/o Cache Write)
      "2026-11-04T10:30:00.000Z,claude-4.5-sonnet,1200,300,0,0,0,0.01",
      // no token component and no model-bearing request: a placeholder
      "2026-11-04T11:00:00.000Z,,0,0,0,0,0,0",
      // ordinary row
      "2026-11-04T11:30:00.000Z,gpt-5,100,100,0,50,150,0.03",
    ),
  );

  assert.equal(records.length, 3);
  assert.equal(records[0].cacheReadTokens, 1500);
  assert.equal(records[1].cacheWriteTokens, 900);
  assert.equal(records[2].totalTokens, 150);

  // The downstream normalizer sums the components, not the CSV Total column.
  const cacheOnly = normalizeCursorUsage(records[0]);
  assert.equal(cacheOnly.cached_input_tokens, 1500);
  assert.equal(cacheOnly.total_tokens, 1500);
  const cacheWriteOnly = normalizeCursorUsage(records[1]);
  assert.equal(cacheWriteOnly.cache_creation_input_tokens, 900);
  // input_tokens is the uncached portion (300) and the total sums every
  // component back to Input (w/ Cache Write).
  assert.equal(cacheWriteOnly.input_tokens, 300);
  assert.equal(cacheWriteOnly.total_tokens, 1200);
});

test("cursor userId candidates put the JWT subject before cli-config", () => {
  const jwt = [
    "header",
    Buffer.from(JSON.stringify({ sub: "auth0|user_current" })).toString("base64url"),
    "signature",
  ].join(".");

  assert.deepEqual(collectCursorSessionUserIds(jwt, "auth0|user_stale"), [
    "user_current",
    "auth0|user_current",
    "user_stale",
    "auth0|user_stale",
  ]);
});

test("cursor CSV fetch marks auth rejections so sync can retry another userId", async () => {
  await assert.rejects(
    fetchCursorUsageCsv({
      cookie: "WorkosCursorSessionToken=user_x%3A%3Ajwt",
      fetchImpl: async () => ({ status: 401 }),
    }),
    (err) => err.code === "AUTH_EXPIRED",
  );

  const body = await fetchCursorUsageCsv({
    cookie: "WorkosCursorSessionToken=user_x%3A%3Ajwt",
    fetchImpl: async () => ({ status: 200, text: async () => "Date,Model" }),
  });
  assert.equal(body, "Date,Model");
});

test("cursor CSV fallback retries only auth failures", async () => {
  const seen = [];
  const csv = await fetchCursorUsageCsvWithFallback({
    cookies: ["stale-cookie", "current-cookie"],
    cookieFetcher: async ({ cookie }) => {
      seen.push(cookie);
      if (cookie === "stale-cookie") {
        const error = new Error("expired");
        error.code = "AUTH_EXPIRED";
        throw error;
      }
      return "Date,Model";
    },
  });
  assert.equal(csv, "Date,Model");
  assert.deepEqual(seen, ["stale-cookie", "current-cookie"]);

  seen.length = 0;
  await assert.rejects(
    fetchCursorUsageCsvWithFallback({
      cookies: ["stale-cookie", "current-cookie"],
      cookieFetcher: async ({ cookie }) => {
        seen.push(cookie);
        throw new Error("network down");
      },
    }),
    /network down/,
  );
  // A non-auth failure stops immediately; the second identity is not tried.
  assert.deepEqual(seen, ["stale-cookie"]);
});
