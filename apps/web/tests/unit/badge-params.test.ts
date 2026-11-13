// Golden tests for the badge URL parameter layer (docs/badge.md §2.1 / §2.3).
// 2026-11-13 multi-badge model: every parameter is an *override* — absent means
// "use the badge row's stored default", so the parser returns null. `scope` was
// retired with the token reset and is always bad_request.

import { describe, expect, it } from "vitest";

import { loadSpecModule, unwrapSpecModule } from "../helpers/spec-first";

type BadgeStyle = "panel" | "compact" | "sparkline";
type BadgeTheme = "dark" | "light" | "auto";
type BadgeRange = "all" | "30d";

type Parsed =
  | {
      ok: true;
      token: string;
      project: string | null;
      style: BadgeStyle | null;
      theme: BadgeTheme | null;
      range: BadgeRange | null;
    }
  | { ok: false; reason: "bad_request" };

type ParamsModule = {
  parseBadgeParams: (search: URLSearchParams) => Parsed;
};

const params = await loadSpecModule<ParamsModule>(
  "../../src/lib/badge/params",
);

describe.skipIf(!params)("badge params (docs/badge.md §2.1)", () => {
  it("returns null overrides when the query omits them (row defaults apply)", () => {
    const { parseBadgeParams } = unwrapSpecModule(params, "lib/badge/params");

    expect(
      parseBadgeParams(new URLSearchParams({ token: "tu_badge_x" })),
    ).toEqual({
      ok: true,
      token: "tu_badge_x",
      project: null,
      style: null,
      theme: null,
      range: null,
    });
  });

  it("requires a non-empty, shape-valid token", () => {
    const { parseBadgeParams } = unwrapSpecModule(params, "lib/badge/params");

    expect(parseBadgeParams(new URLSearchParams()).ok).toBe(false);
    expect(parseBadgeParams(new URLSearchParams({ token: "" })).ok).toBe(false);
    expect(parseBadgeParams(new URLSearchParams({ token: "   " })).ok).toBe(
      false,
    );
    expect(parseBadgeParams(new URLSearchParams({ token: "bad token!" })).ok).toBe(
      false,
    );
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

  it("accepts the full documented value set as overrides", () => {
    const { parseBadgeParams } = unwrapSpecModule(params, "lib/badge/params");

    expect(
      parseBadgeParams(
        new URLSearchParams({
          token: "tu_badge_x",
          style: "sparkline",
          theme: "auto",
          range: "30d",
          project: "token-usage",
        }),
      ),
    ).toEqual({
      ok: true,
      token: "tu_badge_x",
      project: "token-usage",
      style: "sparkline",
      theme: "auto",
      range: "30d",
    });
  });

  it("rejects every legacy scope value outright (§2.3)", () => {
    const { parseBadgeParams } = unwrapSpecModule(params, "lib/badge/params");

    for (const value of ["user", "repo", "team", ""]) {
      expect(
        parseBadgeParams(
          new URLSearchParams({
            token: "tu_badge_x",
            scope: value,
            project: "token-usage",
          }),
        ),
      ).toEqual({ ok: false, reason: "bad_request" });
    }
  });

  it("normalizes a blank project to null (account badge)", () => {
    const { parseBadgeParams } = unwrapSpecModule(params, "lib/badge/params");

    expect(
      parseBadgeParams(new URLSearchParams({ token: "tu_badge_x", project: "  " })),
    ).toMatchObject({ ok: true, project: null });
  });

  it("caps project at 120 characters", () => {
    const { parseBadgeParams } = unwrapSpecModule(params, "lib/badge/params");

    const exact = "p".repeat(120);
    expect(
      parseBadgeParams(
        new URLSearchParams({ token: "tu_badge_x", project: exact }),
      ).ok,
    ).toBe(true);

    const over = "p".repeat(121);
    expect(
      parseBadgeParams(new URLSearchParams({ token: "tu_badge_x", project: over })),
    ).toEqual({ ok: false, reason: "bad_request" });
  });

  it("passes the decoded project through untouched (§2.1: normalization lives in the data layer)", () => {
    const { parseBadgeParams } = unwrapSpecModule(params, "lib/badge/params");

    const parsed = parseBadgeParams(
      new URLSearchParams({ token: "tu_badge_x", project: "My.Repo-2" }),
    );

    expect(parsed.ok && parsed.project).toBe("My.Repo-2");
  });
});
