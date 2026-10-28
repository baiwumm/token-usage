"use client";

// Appearance settings (docs/ui-spec.md 设置 · 偏好): theme, language, currency,
// number and date formats. Every control writes its preference immediately —
// theme via next-themes, language via the locale cookie, the rest via
// localStorage. The dashboard refresh card and the reset footer live here too.
//
// This file is the tab shell: the card chrome plus the section composition. The
// rows live in appearance-theme-section.tsx / appearance-format-section.tsx, the
// preview in appearance-preview.tsx, and the shared row layout in
// appearance-row.tsx.

import { Card } from "@heroui/react";

import { AppearanceFormatSection } from "./appearance-format-section";
import { AppearancePreview } from "./appearance-preview";
import { AppearanceThemeSection } from "./appearance-theme-section";

import { APPEARANCE_COPY } from "@/lib/copy/appearance";
import { useLocalePreference } from "@/lib/copy/locale";

export function AppearancePanel() {
  const { locale } = useLocalePreference();
  const copy = APPEARANCE_COPY[locale];

  return (
    <Card className="p-6">
      <Card.Header>
        <Card.Title>{copy.heading}</Card.Title>
        <Card.Description>{copy.description}</Card.Description>
      </Card.Header>
      <Card.Content className="divide-border/60 flex flex-col divide-y">
        <AppearanceThemeSection />
        <AppearanceFormatSection />
        <AppearancePreview />
      </Card.Content>
    </Card>
  );
}
