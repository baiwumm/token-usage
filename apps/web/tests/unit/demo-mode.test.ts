// Demo instance flag (docs/demo-instance-plan.md §5/§10).
//
// The demo gates must be inert unless TOKEN_USAGE_DEMO=on — production
// deployments never set the variable, so a missing or misspelled flag has to
// read as "off". The boot-time sanity check (demoMisconfiguration) is what the
// proxy answers 500 with on protected pages, so its two failure modes —
// dashboard URL aimed at the production instance (decision #19 isolation) and
// the shared account missing — need pinning too.

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { demoMisconfiguration, isDemoInstance } from "@/lib/demo";

beforeEach(() => {
  process.env.TOKEN_USAGE_DEMO = "on";
  process.env.TOKEN_USAGE_DEMO_EMAIL = "demo@example.test";
  process.env.TOKEN_USAGE_DEMO_PASSWORD = "fake-demo-password";
  process.env.TOKEN_USAGE_DASHBOARD_URL = "https://demo.token-usage.test";
});

afterEach(() => {
  delete process.env.TOKEN_USAGE_DEMO;
  delete process.env.TOKEN_USAGE_DEMO_EMAIL;
  delete process.env.TOKEN_USAGE_DEMO_PASSWORD;
  delete process.env.TOKEN_USAGE_DASHBOARD_URL;
});

describe("isDemoInstance", () => {
  it("is on only with the exact TOKEN_USAGE_DEMO=on value", () => {
    expect(isDemoInstance()).toBe(true);

    process.env.TOKEN_USAGE_DEMO = "1";
    expect(isDemoInstance()).toBe(false);

    process.env.TOKEN_USAGE_DEMO = "ON";
    expect(isDemoInstance()).toBe(false);
  });

  it("defaults to off when the flag is absent", () => {
    delete process.env.TOKEN_USAGE_DEMO;

    expect(isDemoInstance()).toBe(false);
  });
});

describe("demoMisconfiguration", () => {
  it("accepts a well-formed demo deployment", () => {
    expect(demoMisconfiguration()).toBeNull();
  });

  it("is inert when the demo flag is off (production env mistakes stay quiet)", () => {
    delete process.env.TOKEN_USAGE_DEMO;
    process.env.TOKEN_USAGE_DASHBOARD_URL = "https://token-usage.baiwumm.com";

    expect(demoMisconfiguration()).toBeNull();
  });

  it("rejects a dashboard URL aimed at the production instance", () => {
    process.env.TOKEN_USAGE_DASHBOARD_URL = "https://app.token-usage.cc";

    expect(demoMisconfiguration()).toContain("app.token-usage.cc");
  });

  it("still rejects the retired production host (stale demo configs)", () => {
    process.env.TOKEN_USAGE_DASHBOARD_URL = "https://token-usage.baiwumm.com";

    expect(demoMisconfiguration()).toContain("token-usage.baiwumm.com");
  });

  it("requires the shared demo account credentials", () => {
    delete process.env.TOKEN_USAGE_DEMO_EMAIL;
    delete process.env.TOKEN_USAGE_DEMO_PASSWORD;

    expect(demoMisconfiguration()).toBeTruthy();
  });
});
