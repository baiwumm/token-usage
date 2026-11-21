// Golden contract tests for the pricing overlay endpoint (docs/cli-contract.md
// §2.16, frozen invariants §3 item 17): public no-auth GET, empty table →
// overlay:null, deterministic assembly + stable revision, malformed-row drop,
// 2000-entry cap, and the frozen 405/OPTIONS envelope.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { GET as pricingGet, POST as pricingPost, OPTIONS as pricingOptions } from "@/app/api/functions/token-usage-pricing/route";

import { FakeSupabase } from "../helpers/fake-supabase";
import { base, initContractEnv } from "./helpers";

const fake = new FakeSupabase();

type PricingRow = {
  section: string;
  model_key: string;
  source?: string | null;
  value: unknown;
  note?: string | null;
};

function seedPricingRows(rows: PricingRow[]): void {
  fake.tables["token_pricing_overrides"] = {
    rows: rows.map((row, index) => ({
      id: `pricing-${index}`,
      section: row.section,
      model_key: row.model_key,
      source: row.source ?? "",
      value: row.value,
      note: row.note ?? null,
      created_at: "2026-11-22T00:00:00.000Z",
      updated_at: "2026-11-22T00:00:00.000Z",
    })),
    unique: [],
  };
}

beforeAll(async () => {
  initContractEnv(await fake.listen());
});

afterAll(async () => {
  await fake.close();
});

beforeEach(() => {
  fake.reset();
  // Default: empty registry — the endpoint must tolerate an unseeded table.
  fake.tables["token_pricing_overrides"] = { rows: [], unique: [] };
});

describe("GET token-usage-pricing (§2.16)", () => {
  it("is public: no Authorization header is required", async () => {
    const res = await pricingGet();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("returns overlay:null for an empty table", async () => {
    const res = await pricingGet();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.overlay).toBeNull();
    expect(typeof body.revision).toBe("string");
    expect(body.revision.length).toBeGreaterThan(0);
  });

  it("assembles the curated-shaped overlay with deterministic ordering", async () => {
    seedPricingRows([
      { section: "exact", model_key: "zeta-model", value: { input: 1, output: 2, cache_read: 0.1 } },
      { section: "exact", model_key: "alpha-model", value: { input: 4, output: 20, cache_write: 5 }, note: "official" },
      { section: "alias", model_key: "k3-256k", value: "kimi-k3" },
      { section: "fuzzy", model_key: "b-match", value: { ref: "beta-ref" } },
      { section: "fuzzy", model_key: "a-match", value: { ref: "alpha-ref" } },
      { section: "source_exact", model_key: "plan-model", source: "workbuddy-ai", value: { input: 0, output: 0 } },
    ]);

    const first = await pricingGet();
    expect(first.status).toBe(200);
    const body = await first.json();

    expect(Object.keys(body.overlay.exact)).toEqual(["alpha-model", "zeta-model"]);
    // Fields pass through only when provided — the server invents nothing.
    expect(body.overlay.exact["alpha-model"]).toEqual({
      input: 4, output: 20, cache_write: 5, note: "official",
    });
    expect(body.overlay.alias).toEqual({ "k3-256k": "kimi-k3" });
    expect(body.overlay.fuzzy).toEqual([
      { match: "a-match", ref: "alpha-ref" },
      { match: "b-match", ref: "beta-ref" },
    ]);
    expect(body.overlay.source_exact["workbuddy-ai"]["plan-model"]).toEqual({ input: 0, output: 0 });
    // No invented sections on the wire.
    expect(Object.keys(body.overlay).sort()).toEqual(["alias", "exact", "fuzzy", "source_exact"]);

    // Same content, different row order → identical document and revision.
    seedPricingRows([
      { section: "exact", model_key: "alpha-model", value: { input: 4, output: 20, cache_write: 5 }, note: "official" },
      { section: "alias", model_key: "k3-256k", value: "kimi-k3" },
      { section: "source_exact", model_key: "plan-model", source: "workbuddy-ai", value: { input: 0, output: 0 } },
      { section: "fuzzy", model_key: "a-match", value: { ref: "alpha-ref" } },
      { section: "fuzzy", model_key: "b-match", value: { ref: "beta-ref" } },
      { section: "exact", model_key: "zeta-model", value: { input: 1, output: 2, cache_read: 0.1 } },
    ]);
    const second = await pricingGet();
    expect(await second.json()).toEqual(body);
  });

  it("drops malformed rows without affecting valid ones; all-invalid → overlay:null", async () => {
    seedPricingRows([
      { section: "exact", model_key: "good", value: { input: 1, output: 2 } },
      { section: "exact", model_key: "missing-output", value: { input: 1 } },
      { section: "exact", model_key: "negative", value: { input: -1, output: 2 } },
      { section: "exact", model_key: "with-source", source: "cursor", value: { input: 1, output: 2 } },
      { section: "bogus-section", model_key: "wrong-section", value: { input: 1, output: 2 } },
      { section: "source_exact", model_key: "no-source", value: { input: 1, output: 2 } },
    ]);
    const partial = await pricingGet();
    const partialBody = await partial.json();
    expect(Object.keys(partialBody.overlay.exact)).toEqual(["good"]);
    expect(partialBody.overlay.alias).toBeUndefined();
    expect(partialBody.overlay.source_exact).toBeUndefined();

    seedPricingRows([{ section: "exact", model_key: "bad", value: { input: "1", output: 2 } }]);
    const allInvalid = await pricingGet();
    expect((await allInvalid.json()).overlay).toBeNull();
  });

  it("changes the revision when content changes, keeps it when content does not", async () => {
    seedPricingRows([{ section: "exact", model_key: "m", value: { input: 1, output: 2 } }]);
    const before = await (await pricingGet()).json();
    const again = await (await pricingGet()).json();
    expect(again.revision).toBe(before.revision);

    seedPricingRows([{ section: "exact", model_key: "m", value: { input: 2, output: 4 } }]);
    const after = await (await pricingGet()).json();
    expect(after.revision).not.toBe(before.revision);
  });

  it("caps the assembled overlay at 2000 entries deterministically", async () => {
    const rows: PricingRow[] = [];
    for (let i = 0; i < 2001; i++) {
      rows.push({
        section: "exact",
        model_key: `model-${String(i).padStart(4, "0")}`,
        value: { input: i, output: i },
      });
    }
    seedPricingRows(rows);
    const res = await pricingGet();
    const body = await res.json();
    const keys = Object.keys(body.overlay.exact);
    expect(keys.length).toBe(2000);
    // Sorted lexicographically, so the truncation keeps the first 2000 keys.
    expect(keys[0]).toBe("model-0000");
    expect(keys.at(-1)).toBe("model-1999");
  });

  it("answers the frozen 405 envelope and OPTIONS 204", async () => {
    const post = await pricingPost();
    expect(post.status).toBe(405);
    expect(await post.json()).toEqual({ error: "Method not allowed" });
    const options = await pricingOptions();
    expect(options.status).toBe(204);
    expect(await options.text()).toBe("");
  });
});
