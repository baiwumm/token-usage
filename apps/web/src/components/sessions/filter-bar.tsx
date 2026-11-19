"use client";

// Filter row for /sessions (docs/ui-spec.md 筛选条): the shared preset-only
// time toolbar, device and source selects (「全部…」placeholders with
// `Select.ClearButton`), and the CSV / refresh icon cluster doubling as the
// last-updated tooltip. Everything is controlled by the page's URL filters.

import type { Locale } from "@/lib/copy/locale";
import type { SessionsCopy } from "@/lib/copy/sessions";
import type { SessionsPayload } from "@/lib/dashboard/api";
import type { Filters } from "./filters";

import { ArrowDownToLine, Calendar, Layers, Xmark } from "@gravity-ui/icons";
import {
  Button,
  ListBox,
  Popover,
  Select,
  Spinner,
  Tooltip,
  Typography,
} from "@heroui/react";

import { DeviceFilterSelect } from "@/components/device-filter-select";
import { RangePresetToolbar } from "@/components/range-preset-toolbar";
import { RefreshButton } from "@/components/refresh-button";
import { SourceIcon } from "@/components/source-icon";
import { useFormat } from "@/lib/format/format";
import { sourceDisplayLabel } from "@/lib/sources";

export function SessionsFilterBar({
  copy,
  locale,
  filters,
  deviceOptions,
  sourceOptions,
  loading,
  refreshing,
  canExport,
  exporting,
  lastUpdatedAt,
  onApply,
  onExport,
  onRetry,
}: {
  copy: SessionsCopy;
  locale: Locale;
  filters: Filters;
  deviceOptions: SessionsPayload["facets"]["devices"];
  sourceOptions: SessionsPayload["facets"]["sources"];
  loading: boolean;
  refreshing: boolean;
  canExport: boolean;
  exporting: boolean;
  lastUpdatedAt: number | null;
  onApply: (patch: Partial<Filters>) => void;
  onExport: () => void;
  onRetry: () => void;
}) {
  const { formatDate } = useFormat();
  // Custom window (heatmap deep link) has no preset to light up, so show the
  // exact day(s) beside the toolbar; the button clears back to all time.
  const customLabel =
    filters.range === "custom" && filters.from
      ? filters.from === filters.to
        ? formatDate(`${filters.from}T12:00:00Z`, {
            dateStyle: "medium",
            timeZone: "UTC",
          })
        : `${formatDate(`${filters.from}T12:00:00Z`, {
            dateStyle: "medium",
            timeZone: "UTC",
          })} – ${formatDate(`${filters.to}T12:00:00Z`, {
            dateStyle: "medium",
            timeZone: "UTC",
          })}`
      : "";

  return (
    <div className="flex flex-wrap items-center gap-3">
      <RangePresetToolbar
        ariaLabel={copy.rangeLabel}
        labels={copy.ranges}
        selected={filters.range}
        onSelect={(range) => onApply({ range, from: "", to: "", tz: "" })}
      />

      {customLabel ? (
        <Button
          aria-label={`${copy.customRangeLabel}: ${customLabel} — ${copy.clearCustomRange}`}
          className="whitespace-nowrap"
          size="sm"
          variant="outline"
          onPress={() => onApply({ range: "all", from: "", to: "", tz: "" })}
        >
          <Calendar aria-hidden="true" className="size-3.5" />
          <span className="text-muted">{copy.customRangeLabel}</span>
          <span className="tabular-nums">{customLabel}</span>
          <Xmark aria-hidden="true" className="size-3.5" />
        </Button>
      ) : null}

      <DeviceFilterSelect
        placeholderMode
        allLabel={copy.allDevices}
        devices={deviceOptions}
        label={copy.deviceLabel}
        loading={loading}
        value={filters.deviceId}
        onChange={(deviceId) => onApply({ deviceId })}
      />

      <Select
        aria-label={copy.sourceLabel}
        className="w-44"
        placeholder={copy.allSources}
        value={filters.source || null}
        onChange={(key) => {
          if (key == null) return;

          onApply({ source: String(key) });
        }}
        onClear={() => onApply({ source: "" })}
      >
        <Select.Trigger>
          <Select.Value>
            {({ isPlaceholder, selectedText }) => (
              <span className="flex min-w-0 items-center gap-2">
                {filters.source ? (
                  <SourceIcon label={filters.source} size={14} />
                ) : (
                  <Layers
                    aria-hidden="true"
                    className="text-muted size-4 shrink-0"
                  />
                )}
                <span className="truncate">
                  {isPlaceholder ? copy.allSources : selectedText}
                </span>
              </span>
            )}
          </Select.Value>
          <Select.ClearButton />
          {loading ? (
            <Select.Indicator>
              <Spinner size="sm" />
            </Select.Indicator>
          ) : (
            <Select.Indicator />
          )}
        </Select.Trigger>
        <Select.Popover>
          <Popover.Arrow />
          <ListBox>
            {sourceOptions.map((entry) => (
              <ListBox.Item
                key={entry.source}
                id={entry.source}
                textValue={sourceDisplayLabel(entry.source)}
              >
                <SourceIcon label={entry.source} size={14} />
                {sourceDisplayLabel(entry.source)}
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>

      <div className="ml-auto flex items-center gap-1.5">
        <Tooltip delay={0}>
          <Button
            isIconOnly
            aria-label={copy.exportCsv}
            isDisabled={!canExport || loading || exporting}
            size="sm"
            variant="tertiary"
            onPress={onExport}
          >
            {exporting ? (
              <Spinner size="sm" />
            ) : (
              <ArrowDownToLine aria-hidden="true" className="size-4" />
            )}
          </Button>
          <Tooltip.Content showArrow placement="bottom">
            <Tooltip.Arrow />
            <Typography type="body-xs">{copy.exportCsv}</Typography>
          </Tooltip.Content>
        </Tooltip>
        <RefreshButton
          lastUpdatedAt={lastUpdatedAt}
          lastUpdatedNone={copy.lastUpdatedNone}
          lastUpdatedTemplate={copy.lastUpdated}
          locale={locale}
          refreshLabel={copy.refresh}
          refreshing={refreshing}
          onPress={onRetry}
        />
      </div>
    </div>
  );
}
