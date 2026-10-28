"use client";

// Appearance · number and date format rows: currency, token display, token
// unit, token grouping and the date format. All of them write straight into the
// format preference store, so the preview row updates as you toggle.

import {
  Description,
  ListBox,
  Popover,
  Select,
  ToggleButton,
  ToggleButtonGroup,
} from "@heroui/react";

import { firstKey } from "./appearance-helpers";
import { Row } from "./appearance-row";

import { APPEARANCE_COPY } from "@/lib/copy/appearance";
import { useLocalePreference } from "@/lib/copy/locale";
import { formatMessage } from "@/lib/copy/message";
import {
  currencyLabel,
  SUPPORTED_CURRENCIES,
  type CurrencyCode,
  type DateFormat,
  type TokenDisplay,
  type TokenUnit,
} from "@/lib/format/core";
import { useFormat } from "@/lib/format/format";

export function AppearanceFormatSection() {
  const { locale } = useLocalePreference();
  const copy = APPEARANCE_COPY[locale];
  const {
    preferences,
    fx,
    setPreference: setFormatPreference,
    formatFxRate,
  } = useFormat();

  return (
    <>
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

      <Row description={copy.tokenUnitDescription} label={copy.tokenUnitLabel}>
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
    </>
  );
}
