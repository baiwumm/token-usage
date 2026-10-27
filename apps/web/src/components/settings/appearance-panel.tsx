"use client";

// Appearance settings (docs/ui-spec.md 设置 · 偏好): theme, language, currency,
// number and date formats. Every control writes its preference immediately —
// theme via next-themes, language via the locale cookie, the rest via
// localStorage. The dashboard refresh card and the reset footer live here too.

import { Check, Display, Moon, Sun, Xmark } from "@gravity-ui/icons";
import {
  AlertDialog,
  Button,
  Card,
  Description,
  ListBox,
  Popover,
  Select,
  Slider,
  Switch,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  toast,
} from "@heroui/react";
import { useTheme } from "next-themes";
import { useEffect, useState, type Key } from "react";

import { APPEARANCE_COPY } from "@/lib/copy/appearance";
import {
  useLocale,
  useLocalePreference,
  type LocalePreference,
} from "@/lib/copy/locale";
import { formatMessage } from "@/lib/copy/message";
import { useFormat } from "@/lib/format/format";
import {
  currencyLabel,
  SUPPORTED_CURRENCIES,
  type CurrencyCode,
  type DateFormat,
  type FontPreference,
  type TokenDisplay,
  type TokenUnit,
} from "@/lib/format/core";
import {
  REFRESH_INTERVAL_MAX,
  REFRESH_INTERVAL_STEP,
  useRefreshPreferencesStore,
} from "@/stores/refresh-preferences-store";

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
            size="sm"
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
            size="sm"
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
            size="sm"
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

        <Row
          description={copy.dateFormatDescription}
          label={copy.dateFormatLabel}
        >
          <Select
            aria-label={copy.dateFormatLabel}
            className="w-40"
            value={preferences.dateFormat}
            variant="secondary"
            onChange={(key) => {
              if (key != null) {
                setFormatPreference("dateFormat", String(key) as DateFormat);
              }
            }}
          >
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <Popover.Arrow />
              <ListBox>
                <ListBox.Item id="locale" textValue={copy.dateFormatLocale}>
                  {copy.dateFormatLocale}
                </ListBox.Item>
                <ListBox.Item id="iso" textValue={copy.dateFormatIso}>
                  {copy.dateFormatIso}
                </ListBox.Item>
                <ListBox.Item id="mdy" textValue={copy.dateFormatMdy}>
                  {copy.dateFormatMdy}
                </ListBox.Item>
                <ListBox.Item id="dmy" textValue={copy.dateFormatDmy}>
                  {copy.dateFormatDmy}
                </ListBox.Item>
              </ListBox>
            </Select.Popover>
          </Select>
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
    </Card>
  );
}

// Dashboard auto-refresh preferences (2026-10-27 operator call): both default
// to off because the dashboard already has a manual refresh button. Stored per
// browser; the dashboard reads the same store.
export function DataRefreshCard() {
  const [locale] = useLocale();
  const copy = APPEARANCE_COPY[locale];
  const refreshOnVisible = useRefreshPreferencesStore(
    (state) => state.refreshOnVisible,
  );
  const intervalMinutes = useRefreshPreferencesStore(
    (state) => state.intervalMinutes,
  );
  const setRefreshOnVisible = useRefreshPreferencesStore(
    (state) => state.setRefreshOnVisible,
  );
  const setIntervalMinutes = useRefreshPreferencesStore(
    (state) => state.setIntervalMinutes,
  );
  // Persist on release: dragging the thumb must not restart the dashboard
  // timer (or write localStorage) on every step.
  const [draftMinutes, setDraftMinutes] = useState(intervalMinutes);

  // The first client render replays the SSR snapshot (0); the saved value
  // arrives with hydration. Pull it back into the draft when it changes.
  useEffect(() => {
    setDraftMinutes(intervalMinutes);
  }, [intervalMinutes]);

  const intervalValue =
    draftMinutes === 0
      ? copy.refreshIntervalOff
      : draftMinutes >= REFRESH_INTERVAL_MAX
        ? copy.refreshIntervalHour
        : formatMessage(copy.refreshIntervalValue, locale, {
            count: draftMinutes,
          });

  return (
    <Card className="p-6">
      <Card.Header>
        <Card.Title>{copy.refreshHeading}</Card.Title>
        <Card.Description>{copy.refreshDescription}</Card.Description>
      </Card.Header>
      <Card.Content className="divide-border/60 flex flex-col divide-y">
        <Row
          description={copy.refreshOnVisibleDescription}
          label={copy.refreshOnVisibleLabel}
        >
          <Switch
            aria-label={copy.refreshOnVisibleLabel}
            isSelected={refreshOnVisible}
            onChange={setRefreshOnVisible}
          >
            {({ isSelected }) => (
              <Switch.Content>
                <Switch.Control>
                  <Switch.Thumb>
                    <Switch.Icon>
                      {isSelected ? (
                        <Check className="size-3 text-inherit opacity-100" />
                      ) : (
                        <Xmark className="size-3 text-inherit opacity-70" />
                      )}
                    </Switch.Icon>
                  </Switch.Thumb>
                </Switch.Control>
              </Switch.Content>
            )}
          </Switch>
        </Row>

        <Row
          description={copy.refreshIntervalDescription}
          label={copy.refreshIntervalLabel}
        >
          <div className="flex w-full flex-col gap-1.5 md:w-64">
            <Slider
              aria-label={copy.refreshIntervalLabel}
              maxValue={REFRESH_INTERVAL_MAX}
              minValue={0}
              step={REFRESH_INTERVAL_STEP}
              value={draftMinutes}
              onChange={(value) => {
                if (typeof value === "number") setDraftMinutes(value);
              }}
              onChangeEnd={(value) => {
                if (typeof value === "number") setIntervalMinutes(value);
              }}
            >
              <Slider.Output className="tabular-nums">
                {intervalValue}
              </Slider.Output>
              <Slider.Track>
                <Slider.Fill />
                <Slider.Thumb />
              </Slider.Track>
            </Slider>
            <div className="flex w-full justify-between">
              <Typography color="muted" type="body-xs">
                {copy.refreshIntervalOff}
              </Typography>
              <Typography color="muted" type="body-xs">
                {copy.refreshIntervalMax}
              </Typography>
            </div>
          </div>
        </Row>
      </Card.Content>
    </Card>
  );
}

// Bottom-of-tab footer (2026-10-27 operator call): the reset lives below both
// cards and needs an explicit confirmation before wiping the local prefs.
export function PreferencesFooter() {
  const { locale, setPreference } = useLocalePreference();
  const copy = APPEARANCE_COPY[locale];
  const { setTheme } = useTheme();
  const { resetPreferences } = useFormat();
  const setRefreshOnVisible = useRefreshPreferencesStore(
    (state) => state.setRefreshOnVisible,
  );
  const setIntervalMinutes = useRefreshPreferencesStore(
    (state) => state.setIntervalMinutes,
  );

  const resetAll = () => {
    setTheme("system");
    setPreference("system");
    resetPreferences();
    setRefreshOnVisible(false);
    setIntervalMinutes(0);
    toast.success(copy.resetDone);
  };

  return (
    <div className="flex flex-col items-start justify-between gap-3 px-1 sm:flex-row sm:items-center">
      <Typography color="muted" type="body-xs">
        {copy.storageNote}
      </Typography>
      <AlertDialog>
        <Button size="sm" variant="danger">
          {copy.reset}
        </Button>
        <AlertDialog.Backdrop variant="blur">
          <AlertDialog.Container size="sm">
            <AlertDialog.Dialog>
              <AlertDialog.CloseTrigger />
              <AlertDialog.Header>
                <AlertDialog.Icon status="warning" />
                <AlertDialog.Heading>{copy.resetTitle}</AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                <Typography type="body-sm">{copy.resetBody}</Typography>
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button slot="close" variant="tertiary">
                  {copy.resetCancel}
                </Button>
                <Button slot="close" variant="danger" onPress={resetAll}>
                  {copy.resetConfirm}
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>
    </div>
  );
}
