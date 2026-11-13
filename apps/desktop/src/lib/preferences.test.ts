import { describe, expect, it } from "vitest";

import {
  BACKLOG_BYTES_OPTIONS,
  DEFAULT_PREFERENCES,
  MIB,
  STORAGE_KEY,
  formatHour,
  loadPreferences,
  nextTheme,
  normalizePreferences,
  periodLabel,
  savePreferences,
  type Preferences,
} from "@/lib/preferences";

function memoryStorage(seed?: Record<string, string>): Storage {
  const map = new Map(Object.entries(seed ?? {}));

  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => void map.delete(key),
    setItem: (key: string, value: string) => void map.set(key, value),
  } as Storage;
}

describe("normalizePreferences", () => {
  it("falls back to defaults for junk input", () => {
    expect(normalizePreferences(null)).toEqual(DEFAULT_PREFERENCES);
    expect(normalizePreferences("nope")).toEqual(DEFAULT_PREFERENCES);
    expect(normalizePreferences([])).toEqual(DEFAULT_PREFERENCES);
  });

  it("keeps valid values and rejects out-of-range ones", () => {
    const prefs = normalizePreferences({
      theme: "dark",
      period: "today",
      dailySummary: false,
      dailySummaryHour: 7,
      failureThreshold: 5,
      backlogBytes: 50 * MIB,
      quietHours: true,
      quietStartHour: 23,
      quietEndHour: 6,
      autostart: true,
    });

    expect(prefs.theme).toBe("dark");
    expect(prefs.period).toBe("today");
    expect(prefs.dailySummary).toBe(false);
    expect(prefs.dailySummaryHour).toBe(7);
    expect(prefs.failureThreshold).toBe(5);
    expect(prefs.backlogBytes).toBe(50 * MIB);
    expect(prefs.quietHours).toBe(true);
    expect(prefs.quietStartHour).toBe(23);
    expect(prefs.quietEndHour).toBe(6);
    expect(prefs.autostart).toBe(true);

    const clamped = normalizePreferences({
      theme: "sepia",
      period: "90d",
      dailySummaryHour: 42,
      failureThreshold: 1,
      backlogBytes: 12,
      quietStartHour: -3,
    });

    expect(clamped.theme).toBe(DEFAULT_PREFERENCES.theme);
    expect(clamped.period).toBe(DEFAULT_PREFERENCES.period);
    expect(clamped.dailySummaryHour).toBe(DEFAULT_PREFERENCES.dailySummaryHour);
    expect(clamped.failureThreshold).toBe(DEFAULT_PREFERENCES.failureThreshold);
    expect(clamped.backlogBytes).toBe(DEFAULT_PREFERENCES.backlogBytes);
    expect(clamped.quietStartHour).toBe(DEFAULT_PREFERENCES.quietStartHour);
  });

  it("offers backlog presets inside the accepted range", () => {
    for (const bytes of BACKLOG_BYTES_OPTIONS) {
      expect(normalizePreferences({ backlogBytes: bytes }).backlogBytes).toBe(
        bytes,
      );
    }
  });
});

describe("card visibility", () => {
  it("defaults to the three mix cards and hides the rhythm cards", () => {
    expect(DEFAULT_PREFERENCES.showSources).toBe(true);
    expect(DEFAULT_PREFERENCES.showModels).toBe(true);
    expect(DEFAULT_PREFERENCES.showProjects).toBe(true);
    expect(DEFAULT_PREFERENCES.showHeatmap).toBe(false);
  });

  it("keeps booleans, falls back for junk, and drops retired keys", () => {
    const prefs = normalizePreferences({
      showSources: false,
      showHeatmap: true,
      // The recent-sessions card retired with D11; the stored key is gone
      // from the shape and must normalize away, not wedge the panel.
      showRecentSessions: "yes",
    });

    expect(prefs.showSources).toBe(false);
    expect(prefs.showHeatmap).toBe(true);
    expect("showRecentSessions" in prefs).toBe(false);
  });
});

describe("display format preferences", () => {
  it("defaults to the compact 万/亿 look with USD", () => {
    expect(DEFAULT_PREFERENCES.currency).toBe("USD");
    expect(DEFAULT_PREFERENCES.tokenDisplay).toBe("compact");
    expect(DEFAULT_PREFERENCES.tokenUnit).toBe("wan");
    expect(DEFAULT_PREFERENCES.tokenGrouping).toBe(3);
  });

  it("keeps valid values and rejects junk values", () => {
    const prefs = normalizePreferences({
      currency: "CNY",
      tokenDisplay: "full",
      tokenUnit: "kmb",
      tokenGrouping: 4,
    });

    expect(prefs.currency).toBe("CNY");
    expect(prefs.tokenDisplay).toBe("full");
    expect(prefs.tokenUnit).toBe("kmb");
    expect(prefs.tokenGrouping).toBe(4);

    const junk = normalizePreferences({
      currency: "BTC",
      tokenDisplay: "huge",
      tokenUnit: "dozen",
      tokenGrouping: 9,
    });

    expect(junk.currency).toBe("USD");
    expect(junk.tokenDisplay).toBe("compact");
    expect(junk.tokenUnit).toBe("wan");
    expect(junk.tokenGrouping).toBe(3);
  });

  it("round-trips the four fields through storage", () => {
    const storage = memoryStorage();

    savePreferences(
      { ...DEFAULT_PREFERENCES, currency: "JPY", tokenGrouping: 4 },
      storage,
    );

    const loaded = loadPreferences(storage);

    expect(loaded.currency).toBe("JPY");
    expect(loaded.tokenGrouping).toBe(4);
  });
});

describe("theme cycle", () => {
  it("cycles system → light → dark → system", () => {
    expect(nextTheme("system")).toBe("light");
    expect(nextTheme("light")).toBe("dark");
    expect(nextTheme("dark")).toBe("system");
  });

  it("formats hour labels", () => {
    expect(formatHour(0)).toBe("00:00");
    expect(formatHour(9)).toBe("09:00");
    expect(formatHour(21)).toBe("21:00");
  });

  it("labels the usage periods", () => {
    expect(periodLabel("today")).toBe("今日");
    expect(periodLabel("7d")).toBe("近 7 天");
    expect(periodLabel("30d")).toBe("近 30 天");
    expect(periodLabel("all")).toBe("总计");
  });

  it("defaults the period to today and keeps stored valid periods", () => {
    expect(DEFAULT_PREFERENCES.period).toBe("today");
    for (const period of ["today", "7d", "30d", "all"] as const) {
      expect(normalizePreferences({ period }).period).toBe(period);
    }
  });
});

describe("preference storage", () => {
  it("round-trips through storage", () => {
    const storage = memoryStorage();
    const prefs: Preferences = {
      ...DEFAULT_PREFERENCES,
      theme: "light",
      dailySummaryHour: 9,
    };

    savePreferences(prefs, storage);
    expect(loadPreferences(storage)).toEqual(prefs);
    expect(storage.getItem(STORAGE_KEY)).toContain('"dailySummaryHour":9');
  });

  it("recovers from corrupt JSON", () => {
    expect(loadPreferences(memoryStorage({ [STORAGE_KEY]: "{oops" }))).toEqual(
      DEFAULT_PREFERENCES,
    );
  });

  it("survives a storage that throws", () => {
    const hostile = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    } as unknown as Storage;

    expect(loadPreferences(hostile)).toEqual(DEFAULT_PREFERENCES);
    expect(() => savePreferences(DEFAULT_PREFERENCES, hostile)).not.toThrow();
  });
});
