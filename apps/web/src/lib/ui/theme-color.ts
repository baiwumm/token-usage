"use client";

// Theme color palette switcher state (2026-10-24): persists to localStorage
// and mirrors onto <html data-theme-color="id">, which globals.css maps to
// HeroUI accent variable overrides ("default" clears the attribute).

import { useCallback, useEffect, useState } from "react";

export interface ThemeColorPalette {
  id: string;
  label: string;
  /** Accent hex for the picker swatch. */
  hex: string;
}

export const THEME_COLOR_PALETTES: ThemeColorPalette[] = [
  { id: "default", label: "Blue", hex: "#3b82f6" },
  { id: "violet", label: "Violet", hex: "#8b5cf6" },
  { id: "mint", label: "Mint", hex: "#2fbf8f" },
  { id: "orange", label: "Orange", hex: "#f59e0b" },
  { id: "rose", label: "Rose", hex: "#f43f5e" },
  { id: "cyan", label: "Cyan", hex: "#0ea5e9" },
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
