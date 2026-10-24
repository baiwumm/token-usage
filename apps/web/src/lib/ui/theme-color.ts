"use client";

// Theme color palette switcher state (2026-10-24, extended 2026-10-25):
// persists to localStorage and mirrors onto <html data-theme-color="id">,
// which theme-palettes.css maps to HeroUI variable overrides ("default" clears
// the attribute and keeps the base theme).

import { useCallback, useEffect, useState } from "react";

export interface ThemeColorPalette {
  id: string;
  /** Display name — the presets are brands, so it is not localized. */
  label: string;
  /** Accent hex for the picker swatch. */
  hex: string;
}

/**
 * Preset order mirrors better-admin's color-palettes.ts; ids must match the
 * [data-theme-color="id"] blocks in styles/theme-palettes.css.
 */
export const THEME_COLOR_PALETTES: ThemeColorPalette[] = [
  { id: "default", label: "Blue", hex: "#0485f7" },
  { id: "sky", label: "Sky", hex: "#00cbff" },
  { id: "lavender", label: "Lavender", hex: "#c79ef7" },
  { id: "mint", label: "Mint", hex: "#80dba2" },
  { id: "netflix", label: "Netflix", hex: "#e50914" },
  { id: "uber", label: "Uber", hex: "#000000" },
  { id: "spotify", label: "Spotify", hex: "#1ed760" },
  { id: "coinbase", label: "Coinbase", hex: "#0052ff" },
  { id: "airbnb", label: "Airbnb", hex: "#ff385c" },
  { id: "discord", label: "Discord", hex: "#5865f2" },
  { id: "rabbit", label: "Rabbit", hex: "#ff6600" },
];

const STORAGE_KEY = "token-usage.theme-color";

export function applyThemeColor(id: string): void {
  if (typeof document === "undefined") return;
  if (id === "default") {
    document.documentElement.removeAttribute("data-theme-color");
  } else {
    document.documentElement.setAttribute("data-theme-color", id);
  }
}

function readStored(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) || "default";
  } catch {
    return "default";
  }
}

/** Theme color state synced across the document and tabs. */
export function useThemeColor(): [string, (id: string) => void] {
  const [paletteId, setPaletteId] = useState("default");

  useEffect(() => {
    const stored = readStored();

    setPaletteId(stored);
    applyThemeColor(stored);
  }, []);

  const update = useCallback((id: string) => {
    setPaletteId(id);
    applyThemeColor(id);

    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // best effort only
    }
  }, []);

  return [paletteId, update];
}
