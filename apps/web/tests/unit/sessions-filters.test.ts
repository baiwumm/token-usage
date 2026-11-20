// Unit tests for the /sessions URL filter contract
// (components/sessions/filters.ts, docs/ui-spec.md Sessions M5.6). The custom
// time window is the risky part: it is the only range state that round-trips
// through the URL, so a malformed from/to/tz must fall back to the preset
// window instead of pinning the list to dates that no longer parse. Unlike
// the dashboard, the zone is only meaningful together with a custom window.

import { describe, expect, it } from "vitest";

import {
  DEFAULT_PAGE_SIZE,
  mergeSessionFilters,
  parseFilters,
  serializeFilters,
} from "@/components/sessions/filters";

const params = (query: string) => new URLSearchParams(query);

describe("parseFilters", () => {
  it("starts at the default window with paging defaults", () => {
    const filters = parseFilters(params(""));

    expect(filters.range).toBe("all");
    expect(filters.from).toBe("");
    expect(filters.to).toBe("");
    expect(filters.tz).toBe("");
    expect(filters.deviceId).toBe("");
    expect(filters.source).toBe("");
    expect(filters.offset).toBe(0);
    expect(filters.pageSize).toBe(DEFAULT_PAGE_SIZE);
  });

  it("keeps a valid custom window with its zone", () => {
    const filters = parseFilters(
      params("from=2026-11-01&to=2026-11-07&tz=Asia/Shanghai"),
    );

    expect(filters.range).toBe("custom");
    expect(filters.from).toBe("2026-11-01");
    expect(filters.to).toBe("2026-11-07");
    expect(filters.tz).toBe("Asia/Shanghai");
  });

  it("falls back to the preset window when from is after to", () => {
    const filters = parseFilters(
      params("from=2026-11-07&to=2026-11-01&tz=Asia/Shanghai"),
    );

    expect(filters.range).toBe("all");
    expect(filters.from).toBe("");
    expect(filters.to).toBe("");
    // The zone is only meaningful together with a window.
    expect(filters.tz).toBe("");
  });

  it("rejects malformed day keys", () => {
    for (const query of [
      "from=2026-1-1&to=2026-11-07",
      "from=nov&to=2026-11-07",
      "from=2026-11-01&to=202613-01",
    ]) {
      const filters = parseFilters(params(query));

      expect(filters.range).toBe("all");
      expect(filters.tz).toBe("");
    }
  });

  it("drops an unresolvable zone instead of throwing later", () => {
    const filters = parseFilters(
      params("from=2026-11-01&to=2026-11-07&tz=Not/AZone"),
    );

    expect(filters.range).toBe("custom");
    expect(filters.tz).toBe("");
  });

  it("keeps the zone empty without a window", () => {
    expect(parseFilters(params("tz=Asia/Shanghai")).tz).toBe("");
  });

  it("sanitizes paging: junk offset / page_size fall back to defaults", () => {
    const filters = parseFilters(params("offset=-3&page_size=999"));

    expect(filters.offset).toBe(0);
    expect(filters.pageSize).toBe(DEFAULT_PAGE_SIZE);

    const fractional = parseFilters(params("offset=4.8&page_size=50"));

    expect(fractional.offset).toBe(4);
    expect(fractional.pageSize).toBe(50);
  });
});

describe("serializeFilters", () => {
  it("round-trips a custom window, omitting defaults", () => {
    const filters = parseFilters(
      params(
        "from=2026-11-01&to=2026-11-07&tz=UTC&device_id=abc&source=cli&offset=40",
      ),
    );

    expect(serializeFilters(filters)).toBe(
      "from=2026-11-01&to=2026-11-07&tz=UTC&device_id=abc&source=cli&offset=40",
    );
  });

  it("emits nothing for the preset window (presets stay session-only)", () => {
    expect(serializeFilters(parseFilters(params("tz=Asia/Shanghai")))).toBe("");
    expect(serializeFilters(parseFilters(params("")))).toBe("");
  });
});

describe("mergeSessionFilters", () => {
  const base = parseFilters(
    params("from=2026-11-01&to=2026-11-07&tz=UTC&offset=40"),
  );

  it("restarts paging on any non-offset change", () => {
    expect(mergeSessionFilters(base, { deviceId: "abc" }).offset).toBe(0);
  });

  it("keeps the offset when the patch is the page itself", () => {
    expect(mergeSessionFilters(base, { offset: 80 }).offset).toBe(80);
  });
});
