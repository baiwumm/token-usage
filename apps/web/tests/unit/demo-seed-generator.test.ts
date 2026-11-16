// Demo seed generator (docs/demo-instance-plan.md §4–§10, P0).
//
// The generator feeds a public instance, so the invariants are the same ones
// the migrations enforce — asserted here instead of at insert time (the seed
// script talks to PostgREST and would surface a violation as a 400 with no
// useful row context). Pricing coverage is asserted too: an unpriced model
// would silently render $0.00 in the demo dashboard.

import { describe, expect, it } from "vitest";

import {
  DEMO_DAYS,
  DEMO_PROJECTS,
  SEED_LANES,
  SEED_MODELS,
  SEED_SOURCES,
  demoBadgeToken,
  demoPageToken,
  generateDemoData,
} from "../../../../scripts/demo/generate.mjs";

import { ensurePricingLoaded, getModelPricingInfo } from "@/lib/pricing";

const TODAY = new Date("2026-11-16T07:00:00.000Z");
const USER_ID = "11111111-2222-4333-8444-555555555555";

function generate(overrides: Record<string, unknown> = {}) {
  return generateDemoData({
    userId: USER_ID,
    today: TODAY,
    ...overrides,
  });
}

const sumFour = (row: {
  input_tokens: number;
  cached_input_tokens: number;
  cache_creation_input_tokens: number;
  output_tokens: number;
}) =>
  row.input_tokens +
  row.cached_input_tokens +
  row.cache_creation_input_tokens +
  row.output_tokens;

describe("generateDemoData", () => {
  it("is deterministic for the same seed and day", () => {
    expect(JSON.stringify(generate())).toBe(JSON.stringify(generate()));
  });

  it("shifts the window with the day, keeping its length", () => {
    const later = generate({ today: new Date("2026-11-18T07:00:00.000Z") });

    expect(generate().window.days).toBe(DEMO_DAYS);
    expect(generate().window.end).toBe("2026-11-16T00:00:00.000Z");
    expect(later.window.end).toBe("2026-11-18T00:00:00.000Z");
    expect(later.summary.hourlyRows).toBeGreaterThan(0);
  });

  it("keeps every row on the demo account", () => {
    const data = generate();

    for (const rows of Object.values(data.tables)) {
      for (const row of rows) {
        expect((row as { user_id: string }).user_id).toBe(USER_ID);
      }
    }
  });

  it("produces enough activity to fill every page", () => {
    const { summary } = generate();

    expect(summary.hourlyRows).toBeGreaterThan(1_000);
    expect(summary.sessionRows).toBeGreaterThan(100);
    expect(summary.syncRunRows).toBeGreaterThan(100);
    expect(summary.activeDays).toBeGreaterThan(DEMO_DAYS - 10);
    expect(summary.sourceCount).toBe(SEED_SOURCES.length);
    expect(summary.modelCount).toBe(SEED_MODELS.length);
  });

  it("keeps hourly buckets within the schema checks", () => {
    for (const row of generate().tables.token_usage_hourly) {
      expect(row.total_tokens).toBe(sumFour(row));
      expect(row.total_tokens).toBeGreaterThan(0);
      expect(row.input_tokens).toBeGreaterThanOrEqual(0);
      expect(row.cached_input_tokens).toBeGreaterThanOrEqual(0);
      expect(row.cache_creation_input_tokens).toBeGreaterThanOrEqual(0);
      expect(row.output_tokens).toBeGreaterThanOrEqual(0);
      expect(row.reasoning_output_tokens).toBeGreaterThanOrEqual(0);
      expect(row.conversations).toBeGreaterThanOrEqual(0);
      // Sentinel column: cost is computed at read time (deploy-guide §7).
      expect(row.total_cost_usd).toBe(0);
      expect(row.credits).toBe(0);
      expect(new Date(row.hour_start).getUTCMinutes()).toBe(0);
      expect(DEMO_PROJECTS.map((project) => project.key)).toContain(
        row.project_key,
      );
    }
  });

  it("keeps sessions device-level and internally consistent", () => {
    for (const row of generate().tables.token_sessions) {
      expect(["cursor", "trae-cn"]).not.toContain(row.source.toLowerCase());
      expect(row.source.length).toBeLessThanOrEqual(100);
      expect(row.session_id.length).toBeLessThanOrEqual(256);
      expect(new Date(row.ended_at).getTime()).toBeGreaterThanOrEqual(
        new Date(row.started_at).getTime(),
      );
      expect(row.total_tokens).toBe(sumFour(row));
      expect(row.models.length).toBeGreaterThan(0);
      expect(row.models.length).toBeLessThanOrEqual(32);
      expect(
        row.models.reduce((total, part) => total + part.total_tokens, 0),
      ).toBe(row.total_tokens);
    }
  });

  it("keeps sync runs within the schema checks", () => {
    for (const row of generate().tables.token_sync_runs) {
      expect(["scheduled", "manual", "watch", "notify"]).toContain(row.trigger);
      expect(["ok", "partial", "error"]).toContain(row.result);
      expect(row.duration_ms).toBeGreaterThanOrEqual(0);
      expect(new Date(row.ended_at).getTime()).toBeGreaterThanOrEqual(
        new Date(row.started_at).getTime(),
      );
      expect(row.cli_version.length).toBeGreaterThan(0);
      expect(row.cli_version.length).toBeLessThanOrEqual(32);
    }
  });

  it("keeps tokens, display names and labels inside their limits", () => {
    const data = generate();
    const [settings] = data.tables.token_public_badge_settings;

    expect(data.tokens.page).toMatch(/^tu_page_[A-Za-z0-9_-]{32}$/);
    expect(data.tokens.badge).toMatch(/^tu_badge_[A-Za-z0-9_-]{32}$/);
    expect(settings.page_token).toBe(data.tokens.page);
    expect(settings.display_name.length).toBeLessThanOrEqual(30);
    expect(settings.enabled).toBe(true);
    expect(settings.page_enabled).toBe(true);

    for (const badge of data.tables.token_public_badges) {
      expect(badge.token).toMatch(/^tu_badge_[A-Za-z0-9_-]{32}$/);
      expect(badge.label.length).toBeGreaterThan(0);
      expect(badge.label.length).toBeLessThanOrEqual(20);
      expect(badge.revoked_at).toBeNull();
    }

    // Tokens are stable across reseeds — links in docs and the landing page
    // must never break because the nightly job ran.
    expect(demoPageToken()).toBe(demoPageToken());
    expect(demoBadgeToken()).not.toBe(demoBadgeToken(20261116, "aurora"));
  });

  it("prices every model it seeds", async () => {
    await ensurePricingLoaded();

    for (const lane of SEED_LANES) {
      const info = getModelPricingInfo(lane.model, { source: lane.source });

      expect(info.status, `${lane.source}/${lane.model}`).toBe("priced");
      expect(info.input + info.output).toBeGreaterThan(0);
    }
  });
});
