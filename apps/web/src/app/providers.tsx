"use client";

import type { ThemeProviderProps } from "next-themes";

import { Toast } from "@heroui/react";
import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

import { useFormatPreferenceStore } from "@/stores/format-preferences-store";

/**
 * Mirrors preferences.font onto <html data-font> so the globals.css system
 * stack override engages app-wide. useLayoutEffect keeps the swap pre-paint.
 */
function FontPreferenceSync() {
  const font = useFormatPreferenceStore((state) => state.preferences.font);

  React.useLayoutEffect(() => {
    if (font === "system") {
      document.documentElement.dataset.font = "system";
    } else {
      delete document.documentElement.dataset.font;
    }
  }, [font]);

  return null;
}

export interface ProvidersProps {
  children: React.ReactNode;
  themeProps?: ThemeProviderProps;
}

export function Providers({ children, themeProps }: ProvidersProps) {
  return (
    <NextThemesProvider {...themeProps}>
      <FontPreferenceSync />
      {children}
      <Toast.Provider placement="bottom end" />
    </NextThemesProvider>
  );
}
