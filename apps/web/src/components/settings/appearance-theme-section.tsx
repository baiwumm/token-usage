"use client";

// Appearance · theme, language and font rows. Theme writes through next-themes,
// language through the locale cookie, font through the format preferences.

import type { FontPreference } from "@/lib/format/core";

import { Display, Moon, Sun } from "@gravity-ui/icons";
import {
  Description,
  ListBox,
  Popover,
  Select,
  ToggleButton,
  ToggleButtonGroup,
} from "@heroui/react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { firstKey } from "./appearance-helpers";
import { Row } from "./appearance-row";

import { APPEARANCE_COPY } from "@/lib/copy/appearance";
import { useLocalePreference, type LocalePreference } from "@/lib/copy/locale";
import { formatMessage } from "@/lib/copy/message";
import { useFormat } from "@/lib/format/format";

export function AppearanceThemeSection() {
  const { locale, preference, setPreference } = useLocalePreference();
  const copy = APPEARANCE_COPY[locale];
  const { theme, setTheme } = useTheme();
  const { preferences, setPreference: setFormatPreference } = useFormat();
  // SSR renders the "system" selection; re-render with the resolved theme after
  // hydration so server and first client markup agree.
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const systemLocaleLabel = locale === "zh" ? copy.languageZh : copy.languageEn;
  const systemHint = formatMessage(copy.languageSystemCurrent, locale, {
    locale: systemLocaleLabel,
  });

  return (
    <>
      <Row description={copy.themeDescription} label={copy.themeLabel}>
        <ToggleButtonGroup
          disallowEmptySelection
          aria-label={copy.themeLabel}
          selectedKeys={mounted ? [theme ?? "system"] : ["system"]}
          selectionMode="single"
          size="sm"
          onSelectionChange={(keys) => {
            const key = firstKey(keys);

            if (key) setTheme(key);
          }}
        >
          <ToggleButton id="light">
            <Sun aria-hidden="true" className="size-4" />
            {copy.themeLight}
          </ToggleButton>
          <ToggleButton id="dark">
            <ToggleButtonGroup.Separator />
            <Moon aria-hidden="true" className="size-4" />
            {copy.themeDark}
          </ToggleButton>
          <ToggleButton id="system">
            <ToggleButtonGroup.Separator />
            <Display aria-hidden="true" className="size-4" />
            {copy.themeSystem}
          </ToggleButton>
        </ToggleButtonGroup>
      </Row>

      <Row description={copy.languageDescription} label={copy.languageLabel}>
        <Select
          aria-label={copy.languageLabel}
          className="w-56"
          value={preference}
          variant="secondary"
          onChange={(key) => {
            if (key != null) {
              setPreference(String(key) as LocalePreference);
            }
          }}
        >
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <Popover.Arrow />
            <Popover.Arrow />
            <ListBox>
              <ListBox.Item id="system" textValue={copy.languageSystem}>
                {copy.languageSystem}
              </ListBox.Item>
              <ListBox.Item id="zh" textValue={copy.languageZh}>
                {copy.languageZh}
              </ListBox.Item>
              <ListBox.Item id="en" textValue={copy.languageEn}>
                {copy.languageEn}
              </ListBox.Item>
            </ListBox>
          </Select.Popover>
        </Select>
        {preference === "system" ? (
          <Description className="text-muted text-xs">{systemHint}</Description>
        ) : null}
      </Row>

      <Row description={copy.fontDescription} label={copy.fontLabel}>
        <ToggleButtonGroup
          disallowEmptySelection
          aria-label={copy.fontLabel}
          selectedKeys={[preferences.font]}
          selectionMode="single"
          size="sm"
          onSelectionChange={(keys) => {
            const key = firstKey(keys);

            if (key) setFormatPreference("font", key as FontPreference);
          }}
        >
          <ToggleButton id="maple">{copy.fontMaple}</ToggleButton>
          <ToggleButton id="system">
            <ToggleButtonGroup.Separator />
            {copy.fontSystem}
          </ToggleButton>
        </ToggleButtonGroup>
      </Row>
    </>
  );
}
