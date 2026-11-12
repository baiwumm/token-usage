"use client";

// Shared device filter (dashboard + sessions, docs/ui-spec.md 筛选条). Both
// pages filter by the same facet shape, so the control — including the
// leading icons and the all-devices entry — lives here to keep them in sync.
// The dashboard renders it in placeholder mode (2026-11-12): no visible label,
// "all devices" acts as the placeholder, and `Select.ClearButton` clears the
// selection back to it.

import { Display, Layers } from "@gravity-ui/icons";
import { ListBox, Popover, Select, Spinner, Typography } from "@heroui/react";

export interface DeviceFilterOption {
  device_id: string;
  device_name: string;
}

export function DeviceFilterSelect({
  label,
  allLabel,
  devices,
  value,
  loading = false,
  placeholderMode = false,
  onChange,
}: {
  label: string;
  allLabel: string;
  devices: DeviceFilterOption[];
  value: string;
  /** Options not landed yet (first load) — indicator renders as a spinner. */
  loading?: boolean;
  /** Bare control: no visible label, all-devices shown as the placeholder and
   * `Select.ClearButton` clears the selection (dashboard, 2026-11-12). */
  placeholderMode?: boolean;
  onChange: (deviceId: string) => void;
}) {
  const TriggerIcon = value ? Display : Layers;

  const control = (
    <Select
      aria-label={label}
      className="w-48"
      placeholder={placeholderMode ? allLabel : undefined}
      value={value || (placeholderMode ? null : "__all")}
      onChange={(key) => {
        if (key == null) return;
        const next = String(key);

        onChange(next === "__all" ? "" : next);
      }}
      onClear={placeholderMode ? () => onChange("") : undefined}
    >
      <Select.Trigger>
        <Select.Value>
          {({ isPlaceholder, selectedText }) => (
            <span className="flex min-w-0 items-center gap-2">
              <TriggerIcon
                aria-hidden="true"
                className="text-muted size-4 shrink-0"
              />
              <span className="truncate">
                {isPlaceholder ? allLabel : selectedText}
              </span>
            </span>
          )}
        </Select.Value>
        {placeholderMode ? <Select.ClearButton /> : null}
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
          {placeholderMode ? null : (
            <ListBox.Item id="__all" textValue={allLabel}>
              <Layers
                aria-hidden="true"
                className="text-muted size-4 shrink-0"
              />
              {allLabel}
            </ListBox.Item>
          )}
          {devices.map((device) => (
            <ListBox.Item
              key={device.device_id}
              id={device.device_id}
              textValue={device.device_name}
            >
              <Display
                aria-hidden="true"
                className="text-muted size-4 shrink-0"
              />
              {device.device_name}
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );

  if (placeholderMode) return control;

  return (
    <label className="flex flex-col gap-1">
      <Typography color="muted" type="body-xs">
        {label}
      </Typography>
      {control}
    </label>
  );
}
