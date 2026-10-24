"use client";

import type { ThemeProviderProps } from "next-themes";

import { Toast } from "@heroui/react";
import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

export interface ProvidersProps {
  children: React.ReactNode;
  themeProps?: ThemeProviderProps;
}

export function Providers({ children, themeProps }: ProvidersProps) {
  return (
    <NextThemesProvider {...themeProps}>
      {children}
      <Toast.Provider placement="bottom end" />
    </NextThemesProvider>
  );
}
