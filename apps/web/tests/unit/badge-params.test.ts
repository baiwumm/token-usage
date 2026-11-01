// Spec-first golden tests for the badge URL parameter layer
// (docs/badge.md §2.1 / §2.3). The module lands with P2; while it is absent
// the suite skips itself (see tests/helpers/spec-first.ts) so `pnpm verify`
// stays green. The assertions below are the executable form of the doc —
// the implementation must satisfy them unchanged.

import { describe, expect, it } from "vitest";

import { loadSpecModule, unwrapSpecModule } from "../helpers/spec-first";

type BadgeStyle = "panel" | "compact" | "sparkline";
type BadgeTheme = "dark" | "light" | "auto";
type BadgeRange = "all" | "30d";

type Parsed =
  | {
      ok: true;
      token: string;
      scope: "user" | "repo";
      project: string | null;
      style: BadgeStyle;
      theme: BadgeTheme;
      range: BadgeRange;
    }
  | { ok: false; reason: "bad_request" };

type ParamsModule = {
  parseBadgeParams: (search: URLSearchParams) => Parsed;
};

const params = await loadSpecModule<ParamsModule>(
  "../../src/lib/badge/params",
);

describe.skipIf(!params)("badge params (docs/badge.md §2.1)", () => {
  it("applies the documented defaults", () => {
    const { parseBadgeParams } = unwrapSpecModule(params, "lib/badge/params");

    expect(parseBadgeParams(new URLSearchParams({ token: "tu_badge_x" }))).toEqual({
      ok: true,
      token: "tu_badge_x",
      scope: "user",
      project: null,
      style: "panel",
      theme: "dark",
      range: "all",
    });
  });

  it("requires a non-empty token", () => {
    const { parseBadgeParams } = unwrapSpecModule(params, "lib/badge/params");

    expect(parseBadgeParams(new URLSearchParams()).ok).toBe(false);
    expect(parseBadgeParams(new URLSearchParams({ token: "" })).ok).toBe(false);
    expect(parseBadgeParams(new URLSearchParams({ token: "   " })).ok).toBe(false);
  });

  it("rejects unknown style/theme/range values as bad_request", () => {
    const { parseBadgeParams } = unwrapSpecModule(params, "lib/badge/params");

    for (const [key, value] of [
      ["style", "banner"],
      ["theme", "sepia"],
      ["range", "7d"],
    ] as const) {
      const parsed = parseBadgeParams(
        new URLSearchParams({ token: "tu_badge_x", [key]: value }),
      );
      expect(parsed).toEqual({ ok: false, reason: "bad_request" });
    }
  });

  it("accepts the full documented value set", () => {
    const { parseBadgeParams } = unwrapSpecModule(params, "lib/badge/params");

    expect(
      parseBadgeParams(
        new URLSearchParams({
          token: "tu_badge_x",
          scope: "user",
          style: "sparkline",
          theme: "auto",
          range: "30d",
        }),
      ),
    ).toEqual({
      ok: true,
      token: "tu_badge_x",
      scope: "user",
      project: null,
      style: "sparkline",
      theme: "auto",
      range: "30d",
    });

    expect(
      parseBadgeParams(
        new URLSearchParams({
          token: "tu_badge_x",
          scope: "repo",
          project: "token-usage",
          style: "compact",
          theme: "light",
        }),
      ),
    ).toEqual({
      ok: true,
      token: "tu_badge_x",
      scope: "repo",
      project: "token-usage",
      style: "compact",
      theme: "light",
      range: "all",
    });
  });

  it("scope=repo requires a project value (§2.3)", () => {
    const { parseBadgeParams } = unwrapSpecModule(params, "lib/badge/params");

    expect(
      parseBadgeParams(new URLSearchParams({ token: "tu_badge_x", scope: "repo" })),
    ).toEqual({ ok: false, reason: "bad_request" });
    expect(
      parseBadgeParams(
        new URLSearchParams({ token: "tu_badge_x", scope: "repo", project: "" }),
      ),
    ).toEqual({ ok: false, reason: "bad_request" });
    expect(
      parseBadgeParams(
        new URLSearchParams({ token: "tu_badge_x", scope: "repo", project: "   " }),
      ),
    ).toEqual({ ok: false, reason: "bad_request" });
  });

  it("caps project at 120 characters", () => {
    const { parseBadgeParams } = unwrapSpecModule(params, "lib/badge/params");

    const exact = "p".repeat(120);
    expect(
      parseBadgeParams(
        new URLSearchParams({ token: "tu_badge_x", scope: "repo", project: exact }),
      ).ok,
    ).toBe(true);

    const over = "p".repeat(121);
    expect(
      parseBadgeParams(
        new URLSearchParams({ token: "tu_badge_x", scope: "repo", project: over }),
      ),
    ).toEqual({ ok: false, reason: "bad_request" });
  });

  it("passes the decoded project through untouched (§2.1: normalization lives in the data layer)", () => {
    const { parseBadgeParams } = unwrapSpecModule(params, "lib/badge/params");

    const parsed = parseBadgeParams(
      new URLSearchParams({ token: "tu_badge_x", scope: "repo", project: "My.Repo-2" }),
    );
    expect(parsed.ok && parsed.project).toBe("My.Repo-2");
  });
});
