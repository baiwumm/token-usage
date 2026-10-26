"use client";

// Appearance settings (docs/ui-spec.md 设置 · 外观): theme, language, currency
// and number formats. Every control writes its preference immediately — theme
// via next-themes, language via the locale cookie, the rest via localStorage.

import { Display, Moon, Sun } from "@gravity-ui/icons";
import {
  Button,
  Card,
  Description,
  ListBox,
  Popover,
  Select,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@heroui/react";
import { useTheme } from "next-themes";
import { useEffect, useState, type Key } from "react";

import { APPEARANCE_COPY } from "@/lib/copy/appearance";
import { useLocalePreference, type LocalePreference } from "@/lib/copy/locale";
import { formatMessage } from "@/lib/copy/message";
import { useFormat } from "@/lib/format/format";
import {
  currencyLabel,
  SUPPORTED_CURRENCIES,
  type CurrencyCode,
  type FontPreference,
  type TokenDisplay,
  type TokenUnit,
} from "@/lib/format/core";

function firstKey(keys: Set<Key>): string | null {
  const key = [...keys][0];

  return typeof key === "string" ? key : null;
}

function Row({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 md:flex-row md:items-start md:justify-between md:gap-8">
      <div className="flex min-w-0 flex-col gap-1 md:max-w-sm">
        <Typography type="body-sm" weight="medium">
          {label}
        </Typography>
        {description ? (
          <Description className="text-muted text-xs">
            {description}
          </Description>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-col items-start gap-2 md:items-end">
        {children}
      </div>
    </div>
  );
}

export function AppearancePanel() {
  const { locale, preference, setPreference } = useLocalePreference();
  const copy = APPEARANCE_COPY[locale];
  const { theme, setTheme } = useTheme();
  const {
    preferences,
    fx,
    setPreference: setFormatPreference,
    resetPreferences,
    formatTokens,
    formatCost,
    formatFxRate,
    formatDate,
  } = useFormat();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const systemLocaleLabel = locale === "zh" ? copy.languageZh : copy.languageEn;
  const systemHint = formatMessage(copy.languageSystemCurrent, locale, {
    locale: systemLocaleLabel,
  });

  const resetAll = () => {
    setTheme("system");
    setPreference("system");
    resetPreferences();
  };

  return (
    <Card className="p-6">
      <Card.Header>
        <Card.Title>{copy.heading}</Card.Title>
        <Card.Description>{copy.description}</Card.Description>
      </Card.Header>
      <Card.Content className="divide-border/60 flex flex-col divide-y">
        <Row description={copy.themeDescription} label={copy.themeLabel}>
          <ToggleButtonGroup
            disallowEmptySelection
            aria-label={copy.themeLabel}
            selectedKeys={mounted ? [theme ?? "system"] : ["system"]}
            selectionMode="single"
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
            <Description className="text-muted text-xs">
              {systemHint}
            </Description>
          ) : null}
        </Row>

        <Row description={copy.fontDescription} label={copy.fontLabel}>
          <ToggleButtonGroup
            disallowEmptySelection
            aria-label={copy.fontLabel}
            selectedKeys={[preferences.font]}
            selectionMode="single"
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

        <Row description={copy.currencyDescription} label={copy.currencyLabel}>
          <Select
            aria-label={copy.currencyLabel}
            className="w-40"
            value={preferences.currency}
            variant="secondary"
            onChange={(key) => {
              if (key != null) {
                setFormatPreference("currency", String(key) as CurrencyCode);
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
                {SUPPORTED_CURRENCIES.map((code) => (
                  <ListBox.Item
                    key={code}
                    id={code}
                    textValue={currencyLabel(code, locale)}
                  >
                    {currencyLabel(code, locale)}
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
          {preferences.currency !== "USD" ? (
            <Description className="text-muted text-xs tabular-nums">
              {formatFxRate(preferences.currency)} · {copy.currencyReference} ·{" "}
              {formatMessage(copy.currencyAsOf, locale, { date: fx.as_of })}
            </Description>
          ) : null}
        </Row>

        <Row
          description={copy.tokenDisplayDescription}
          label={copy.tokenDisplayLabel}
        >
          <ToggleButtonGroup
            disallowEmptySelection
            aria-label={copy.tokenDisplayLabel}
            selectedKeys={[preferences.tokenDisplay]}
            selectionMode="single"
            onSelectionChange={(keys) => {
              const key = firstKey(keys);

              if (key) {
                setFormatPreference("tokenDisplay", key as TokenDisplay);
              }
            }}
          >
            <ToggleButton id="compact">{copy.tokenCompact}</ToggleButton>
            <ToggleButton id="full">
              <ToggleButtonGroup.Separator />
              {copy.tokenFull}
            </ToggleButton>
          </ToggleButtonGroup>
        </Row>

        <Row
          description={copy.tokenUnitDescription}
          label={copy.tokenUnitLabel}
        >
          <ToggleButtonGroup
            disallowEmptySelection
            aria-label={copy.tokenUnitLabel}
            isDisabled={preferences.tokenDisplay === "full"}
            selectedKeys={[preferences.tokenUnit]}
            selectionMode="single"
            onSelectionChange={(keys) => {
              const key = firstKey(keys);

              if (key) setFormatPreference("tokenUnit", key as TokenUnit);
            }}
          >
            <ToggleButton id="kmb">{copy.tokenKmb}</ToggleButton>
            <ToggleButton id="wan">
              <ToggleButtonGroup.Separator />
              {copy.tokenWan}
            </ToggleButton>
          </ToggleButtonGroup>
          {preferences.tokenDisplay === "full" ? (
            <Description className="text-muted text-xs">
              {copy.tokenUnitDisabled}
            </Description>
          ) : null}
        </Row>

        <Row
          description={copy.tokenGroupingDescription}
          label={copy.tokenGroupingLabel}
        >
          <ToggleButtonGroup
            disallowEmptySelection
            aria-label={copy.tokenGroupingLabel}
            isDisabled={preferences.tokenDisplay === "compact"}
            selectedKeys={[String(preferences.tokenGrouping)]}
            selectionMode="single"
            onSelectionChange={(keys) => {
              const key = firstKey(keys);

              if (key) {
                setFormatPreference("tokenGrouping", Number(key) === 4 ? 4 : 3);
              }
            }}
          >
            <ToggleButton id="3">{copy.tokenGrouping3}</ToggleButton>
            <ToggleButton id="4">
              <ToggleButtonGroup.Separator />
              {copy.tokenGrouping4}
            </ToggleButton>
          </ToggleButtonGroup>
          {preferences.tokenDisplay === "compact" ? (
            <Description className="text-muted text-xs">
              {copy.tokenGroupingDisabled}
            </Description>
          ) : null}
        </Row>

        <Row label={copy.previewLabel}>
          <div className="bg-default/50 ring-border/60 grid w-full min-w-64 grid-cols-3 gap-3 rounded-3xl px-4 py-3 ring-1 md:w-96">
            <div className="flex flex-col gap-0.5">
              <Typography color="muted" type="body-xs">
                {copy.previewTokens}
              </Typography>
              <Typography
                className="min-w-16 tabular-nums"
                type="body-sm"
                weight="medium"
              >
                {formatTokens(1_234_567)}
              </Typography>
            </div>
            <div className="flex flex-col gap-0.5">
              <Typography color="muted" type="body-xs">
                {copy.previewCost}
              </Typography>
              <Typography
                className="min-w-16 tabular-nums"
                type="body-sm"
                weight="medium"
              >
                {formatCost(123.4567)}
              </Typography>
            </div>
            <div className="flex flex-col gap-0.5">
              <Typography color="muted" type="body-xs">
                {copy.previewDate}
              </Typography>
              <Typography
                className="whitespace-nowrap tabular-nums"
                type="body-sm"
                weight="medium"
              >
                {formatDate(new Date(), { dateStyle: "medium" })}
              </Typography>
            </div>
          </div>
        </Row>
      </Card.Content>
      <Card.Footer className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <Typography color="muted" type="body-xs">
          {copy.storageNote}
        </Typography>
        <Button size="sm" variant="outline" onPress={resetAll}>
          {copy.reset}
        </Button>
      </Card.Footer>
    </Card>
  );
}
