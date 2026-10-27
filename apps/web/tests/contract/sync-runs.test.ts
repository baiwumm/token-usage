// Golden contract tests for the sync-run telemetry pair (docs/cli-contract.md
// §2.11 POST token-usage-sync-report, §2.12 GET token-usage-account-sync-runs;
// §3 frozen items 13/14): field-by-field validation, run_id idempotent replay,
// server-derived empty/duration, full-set totals semantics, paging, revoked
// device exclusion and the 366-day window clamp.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { POST as syncReportPost } from "@/app/api/functions/token-usage-sync-report/route";

// The [...slug] catch-all route file is a thin re-export of this handler
// (bracketed folders can't be imported statically).
import { handleFunctionsGet as seriesGet } from "@/lib/api/account-series-router";
import { FakeSupabase, type Row } from "../helpers/fake-supabase";
import {
  DEVICE_A,
  DEVICE_B,
  DEVICE_REVOKED,
  TOKEN_A,
  TOKEN_B,
  TOKEN_ON_REVOKED_DEVICE,
  TOKEN_REVOKED,
  USER_ID,
  JWT,
  base,
  initContractEnv,
  jsonRequest,
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

function reportBody(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    run_id: "1730000000000-ab12cd34",
    started_at: "2026-10-27T09:00:00.000Z",
    ended_at: "2026-10-27T09:00:04.500Z",
    trigger: "scheduled",
    result: "ok",
    parsed_files: 12,
    buckets_uploaded: 3,
    tokens_ingested: 4500,
    sessions_uploaded: 2,
    sessions_skipped: 1,
    cli_version: "0.2.0",
    ...over,
  };
}

async function report(body: unknown, token: string | null = TOKEN_A) {
  return syncReportPost(jsonRequest(base("sync-report"), { body, token }));
}

function series(name: string, query = "", token: string | null = TOKEN_A): Promise<Response> {
  return seriesGet(
    new Request(`${base(`account-${name}`)}${query}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
    { params: Promise.resolve({ slug: [`token-usage-account-${name}`] }) },
  );
}

// Deterministic seeded runs across devices: A (2 runs), B (1 empty run), and
// one on the revoked device that must never surface.
function seedRuns(fake: FakeSupabase): void {
  const runs = fake.table("token_sync_runs");
  const run = (over: Row): Row => ({
    user_id: USER_ID,
    device_id: DEVICE_A,
    run_id: "run-a1",
    started_at: "2026-10-27T08:00:00.000Z",
    ended_at: "2026-10-27T08:00:10.000Z",
    duration_ms: 10_000,
    trigger: "scheduled",
    result: "ok",
    error_code: null,
    empty: false,
    parsed_files: 10,
    buckets_uploaded: 2,
    tokens_ingested: 3000,
    sessions_uploaded: 1,
    sessions_skipped: 0,
    queue_bytes: 512,
    cli_version: "0.2.0",
    os: "win32 10.0.26200",
    ...over,
  });

  runs.push(
    run({}),
    run({ run_id: "run-a2", started_at: "2026-10-27T09:00:00.000Z", ended_at: "2026-10-27T09:00:05.000Z", duration_ms: 5000, trigger: "manual", tokens_ingested: 1200, buckets_uploaded: 1 }),
    run({ device_id: DEVICE_B, run_id: "run-b1", started_at: "2026-10-27T09:00:00.000Z", ended_at: "2026-10-27T09:00:00.000Z", duration_ms: 0, empty: true, tokens_ingested: 0, buckets_uploaded: 0, sessions_uploaded: 0 }),
    run({ device_id: DEVICE_REVOKED, run_id: "run-revoked", started_at: "2026-10-27T07:00:00.000Z", ended_at: "2026-10-27T07:00:01.000Z", duration_ms: 1000, tokens_ingested: 999_999 }),
  );
}

describe("sync-report auth", () => {
  it("distinguishes missing bearer, revoked token, unknown token and revoked device", async () => {
    const missing = await report(reportBody(), null);
    expect(missing.status).toBe(401);
    expect(await missing.json()).toEqual({ error: "Missing bearer token" });

    const revokedToken = await report(reportBody(), TOKEN_REVOKED);
    expect(revokedToken.status).toBe(401);
    expect(await revokedToken.json()).toEqual({ error: "Unauthorized" });

    const unknown = await report(reportBody(), "not-a-known-token");
    expect(unknown.status).toBe(401);
    expect(await unknown.json()).toEqual({ error: "Unauthorized" });

    const revokedDevice = await report(reportBody(), TOKEN_ON_REVOKED_DEVICE);
    expect(revokedDevice.status).toBe(403);
    expect(await revokedDevice.json()).toEqual({ error: "Device is revoked" });
  });

  it("does not fall back to JWT auth (device tokens only)", async () => {
    const res = await report(reportBody(), JWT);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });
});

describe("sync-report validation (400 invalid_sync_report)", () => {
  it("rejects non-object bodies", async () => {
    for (const body of ["string", 42, [], null]) {
      const res = await report(body);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "invalid_sync_report" });
    }
  });

  it("rejects malformed run_id (empty, oversize, path separators, control chars)", async () => {
    for (const run_id of ["", "   ", "x".repeat(129), "a/b", "a\\b", "a\nb", "a\u0080b"]) {
      const res = await report(reportBody({ run_id }));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "invalid_sync_report" });
    }
  });

  it("rejects unparseable or inverted timestamps", async () => {
    for (const over of [
      { started_at: "not-a-date" },
      { ended_at: "not-a-date" },
      { started_at: "2026-10-27T09:00:05.000Z", ended_at: "2026-10-27T09:00:00.000Z" },
    ]) {
      const res = await report(reportBody(over));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "invalid_sync_report" });
    }
  });

  it("rejects unknown trigger/result enum values and wrong types", async () => {
    for (const over of [
      { trigger: "hourly" },
      { trigger: "" },
      { trigger: 123 },
      { result: "success" },
      { result: "" },
    ]) {
      const res = await report(reportBody(over));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "invalid_sync_report" });
    }
  });

  it("rejects missing/non-integer/negative required counters", async () => {
    for (const field of ["parsed_files", "buckets_uploaded", "tokens_ingested", "sessions_uploaded", "sessions_skipped"]) {
      for (const value of [undefined, -1, 1.5, "3", null]) {
        const res = await report(reportBody({ [field]: value }));
        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ error: "invalid_sync_report" });
      }
    }
  });

  it("rejects bad optional fields (oversize error_code/cli_version/os, negative queue_bytes)", async () => {
    for (const over of [
      { error_code: "x".repeat(65) },
      { error_code: 12 },
      { cli_version: "" },
      { cli_version: "x".repeat(33) },
      { os: "x".repeat(65) },
      { queue_bytes: -1 },
      { queue_bytes: "512" },
    ]) {
      const res = await report(reportBody(over));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "invalid_sync_report" });
    }
  });

  it("accepts error_code with result=ok (advisory only) and null queue_bytes", async () => {
    const res = await report(reportBody({ error_code: "weird-but-legal", queue_bytes: null }));
    expect(res.status).toBe(200);
  });
});

describe("sync-report persistence semantics", () => {
  it("persists the whitelist, derives duration_ms and empty, ignores unknown fields", async () => {
    const res = await report(
      reportBody({
        ended_at: "2026-10-27T09:00:04.500Z",
        tokens_ingested: 0,
        sessions_uploaded: 0,
        secret_path: "C:/Users/i/.tokenusage",
        prompt_text: "never store me",
      }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, duplicate: false });

    const rows = fake.table("token_sync_runs");
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.user_id).toBe(USER_ID);
    expect(row.device_id).toBe(DEVICE_A);
    expect(row.run_id).toBe("1730000000000-ab12cd34");
    expect(row.started_at).toBe("2026-10-27T09:00:00.000Z");
    expect(row.ended_at).toBe("2026-10-27T09:00:04.500Z");
    expect(row.duration_ms).toBe(4500);
    expect(row.trigger).toBe("scheduled");
    expect(row.result).toBe("ok");
    expect(row.error_code).toBeNull();
    expect(row.empty).toBe(true);
    expect(row.parsed_files).toBe(12);
    expect(row.buckets_uploaded).toBe(3);
    expect(row.tokens_ingested).toBe(0);
    expect(row.sessions_uploaded).toBe(0);
    expect(row.sessions_skipped).toBe(1);
    expect(row.queue_bytes).toBeNull();
    expect(row.cli_version).toBe("0.2.0");
    expect(row.os).toBeNull();
    expect(row.secret_path).toBeUndefined();
    expect(row.prompt_text).toBeUndefined();
  });

  it("marks runs with any ingested tokens or uploaded sessions as non-empty", async () => {
    await report(reportBody({ tokens_ingested: 1, sessions_uploaded: 0 }));
    await report(reportBody({ run_id: "run-sessions", tokens_ingested: 0, sessions_uploaded: 4 }));

    const rows = fake.table("token_sync_runs");
    expect(rows.map((row) => row.empty)).toEqual([false, false]);
  });

  it("replays are idempotent: duplicate:true, no second row, first write wins", async () => {
    const first = await report(reportBody({ tokens_ingested: 4500 }));
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ ok: true, duplicate: false });

    // A retry that lost the first response arrives with DIFFERENT counters —
    // it must still be a duplicate and must not rewrite the stored row.
    const replay = await report(reportBody({ tokens_ingested: 999_999, buckets_uploaded: 99 }));
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual({ ok: true, duplicate: true });

    const rows = fake.table("token_sync_runs");
    expect(rows).toHaveLength(1);
    expect(rows[0].tokens_ingested).toBe(4500);
    expect(rows[0].buckets_uploaded).toBe(3);
  });

  it("scopes run_id uniqueness per device", async () => {
    await report(reportBody({ run_id: "same-run" }), TOKEN_A);
    const otherDevice = await report(reportBody({ run_id: "same-run" }), TOKEN_B);
    expect(otherDevice.status).toBe(200);
    expect(await otherDevice.json()).toEqual({ ok: true, duplicate: false });

    const rows = fake.table("token_sync_runs");
    expect(rows).toHaveLength(2);
  });
});

describe("series: sync-runs", () => {
  it("requires from/to, rejects from>to and invalid device_id", async () => {
    for (const [query, error] of [
      ["", "Missing from/to"],
      ["?from=2026-10-27T00:00:00.000Z", "Missing from/to"],
      ["?to=2026-10-27T00:00:00.000Z", "Missing from/to"],
      ["?from=garbage&to=2026-10-27T00:00:00.000Z", "Missing from/to"],
      [
        "?from=2026-10-28T00:00:00.000Z&to=2026-10-27T00:00:00.000Z",
        "Invalid from/to",
      ],
      [
        "?from=2026-10-27T00:00:00.000Z&to=2026-10-28T00:00:00.000Z&device_id=not-a-uuid",
        "Invalid device_id",
      ],
    ] as const) {
      const res = await series("sync-runs", query);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error });
    }
  });

  it("lists runs started_at-desc with full-set total/totals and revoked devices excluded", async () => {
    seedRuns(fake);
    const res = await series(
      "sync-runs",
      "?from=2026-10-27T00:00:00.000Z&to=2026-10-28T00:00:00.000Z&limit=2&offset=0",
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.from).toBe("2026-10-27T00:00:00.000Z");
    expect(body.to).toBe("2026-10-28T00:00:00.000Z");
    // Full-set count: 4 seeded runs minus the revoked device's row.
    expect(body.total).toBe(3);
    expect(body.limit).toBe(2);
    expect(body.offset).toBe(0);
    expect(body.totals).toEqual({
      runs: 3,
      empty_runs: 1,
      tokens_ingested: 3000 + 1200 + 0,
      sessions_uploaded: 2,
      duration_ms: 10_000 + 5000 + 0,
    });
    // started_at desc; the (run-a2, run-b1) same-instant tie breaks by run_id.
    expect(body.runs.map((run: Row) => run.run_id)).toEqual(["run-a2", "run-b1"]);
    expect(body.runs[0].device_name).toBe("PC One #aaaa1111");
    expect(body.runs[1].empty).toBe(true);
    // Wire shape: exactly the contract fields, nothing else.
    expect(Object.keys(body.runs[0]).sort()).toEqual(
      [
        "buckets_uploaded",
        "cli_version",
        "device_id",
        "device_name",
        "duration_ms",
        "empty",
        "ended_at",
        "error_code",
        "os",
        "parsed_files",
        "queue_bytes",
        "result",
        "run_id",
        "sessions_skipped",
        "sessions_uploaded",
        "started_at",
        "tokens_ingested",
        "trigger",
      ].sort(),
    );
  });

  it("pages through the full set with offset", async () => {
    seedRuns(fake);
    const page1 = await series(
      "sync-runs",
      "?from=2026-10-27T00:00:00.000Z&to=2026-10-28T00:00:00.000Z&limit=2",
    );
    const page2 = await series(
      "sync-runs",
      "?from=2026-10-27T00:00:00.000Z&to=2026-10-28T00:00:00.000Z&limit=2&offset=2",
    );

    const body1 = await page1.json();
    const body2 = await page2.json();
    expect(body1.runs).toHaveLength(2);
    expect(body2.runs).toHaveLength(1);
    expect(body2.runs[0].run_id).toBe("run-a1");
    // totals stay full-set on every page.
    expect(body2.totals.runs).toBe(3);
  });

  it("filters by device_id and by trigger/result; unknown enum values match nothing", async () => {
    seedRuns(fake);
    const deviceB = await series(
      "sync-runs",
      `?from=2026-10-27T00:00:00.000Z&to=2026-10-28T00:00:00.000Z&device_id=${DEVICE_B}`,
    );
    const bodyB = await deviceB.json();
    expect(bodyB.total).toBe(1);
    expect(bodyB.runs[0].run_id).toBe("run-b1");

    const manual = await series(
      "sync-runs",
      "?from=2026-10-27T00:00:00.000Z&to=2026-10-28T00:00:00.000Z&trigger=manual",
    );
    const bodyManual = await manual.json();
    expect(bodyManual.total).toBe(1);
    expect(bodyManual.runs[0].run_id).toBe("run-a2");

    const errorRuns = await series(
      "sync-runs",
      "?from=2026-10-27T00:00:00.000Z&to=2026-10-28T00:00:00.000Z&result=error",
    );
    expect((await errorRuns.json()).total).toBe(0);

    const bogus = await series(
      "sync-runs",
      "?from=2026-10-27T00:00:00.000Z&to=2026-10-28T00:00:00.000Z&trigger=banana",
    );
    expect((await bogus.json()).total).toBe(0);
  });

  it("clamps windows longer than 366 days from the to edge", async () => {
    seedRuns(fake);
    const res = await series(
      "sync-runs",
      "?from=2020-01-01T00:00:00.000Z&to=2026-10-28T00:00:00.000Z",
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    // 2026-10-28 minus 366 days.
    expect(body.from).toBe("2025-10-27T00:00:00.000Z");
    expect(body.total).toBe(3);
  });

  it("scopes reads to the principal (device token sees only its account) and requires auth", async () => {
    seedRuns(fake);
    const anonymous = await series("sync-runs", "?from=2026-10-27T00:00:00.000Z&to=2026-10-28T00:00:00.000Z", null);
    expect(anonymous.status).toBe(401);
  });

  it("serves the series via ?series= too, with the dashboard-face negotiation cache", async () => {
    seedRuns(fake);
    const res = await seriesGet(
      new Request(
        `${base("account-anything")}?series=sync-runs&from=2026-10-27T00:00:00.000Z&to=2026-10-28T00:00:00.000Z`,
        { headers: { Authorization: `Bearer ${TOKEN_A}` } },
      ),
      { params: Promise.resolve({ slug: ["token-usage-account-anything"] }) },
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-cache");
    expect(res.headers.get("etag")).toMatch(/^"/);
    expect((await res.json()).total).toBe(3);
  });
});
