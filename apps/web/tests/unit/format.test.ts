// Unit tests for the shared date formatter (lib/format/core.ts): the date
// order preference replaces the date half only; time keeps the UI locale.

import { describe, expect, it } from "vitest";

import {
  DEFAULT_FORMAT_PREFERENCES,
  formatDate,
  formatDateTime,
  sanitizePreferences,
} from "@/lib/format/core";

describe("date order preference", () => {
  // Local noon keeps the calendar day stable in every timezone.
  const date = new Date(2026, 9, 27, 12, 30);

  it("defaults to following the locale", () => {
    expect(DEFAULT_FORMAT_PREFERENCES.dateFormat).toBe("locale");
    expect(formatDate(date, "zh")).toBe(
      new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(date),
    );
  });

  it("renders the three explicit orders", () => {
    expect(formatDate(date, "zh", { dateStyle: "medium" }, "iso")).toBe(
      "2026-10-27",
    );
    expect(formatDate(date, "en", { dateStyle: "medium" }, "mdy")).toBe(
      "10/27/2026",
    );
    expect(formatDate(date, "zh", { dateStyle: "medium" }, "dmy")).toBe(
      "27/10/2026",
    );
  });

  it("keeps the locale time when a time style is requested", () => {
    expect(formatDateTime(date, "zh", "iso")).toBe("2026-10-27 12:30");
    expect(formatDateTime(date, "en", "iso")).toBe("2026-10-27, 12:30 PM");
  });

  it("falls back to locale for unknown persisted values", () => {
    expect(sanitizePreferences({ dateFormat: "wat" }).dateFormat).toBe("locale");
    expect(sanitizePreferences({ dateFormat: "dmy" }).dateFormat).toBe("dmy");
  });
});
