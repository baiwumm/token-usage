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
      dailySummaryHour: 42,
      failureThreshold: 1,
      backlogBytes: 12,
      quietStartHour: -3,
    });

    expect(clamped.theme).toBe(DEFAULT_PREFERENCES.theme);
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
