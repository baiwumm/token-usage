// Three-state theming (system → light → dark, operator call 2026-10-28).
// The class lives on <html> so HeroUI tokens and Tailwind's `dark:` variant
// both follow; `index.html` applies the stored mode before first paint, this
// hook only keeps it in sync afterwards (mode changes, OS changes).

import type { ThemeMode } from "@/lib/preferences";

import { useEffect } from "react";

export function useTheme(mode: ThemeMode): void {
  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = mode === "dark" || (mode === "system" && query.matches);

      document.documentElement.classList.toggle("dark", dark);
    };

    apply();
    if (mode !== "system") return;
    query.addEventListener("change", apply);

    return () => query.removeEventListener("change", apply);
  }, [mode]);
}
