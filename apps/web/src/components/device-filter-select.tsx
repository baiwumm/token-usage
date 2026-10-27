"use client";

// Shared device filter (dashboard + sessions, docs/ui-spec.md 筛选条). Both
// pages filter by the same facet shape, so the control — including the
// leading icons and the all-devices entry — lives here to keep them in sync.

import { Display, Layers } from "@gravity-ui/icons";
import { ListBox, Popover, Select, Typography } from "@heroui/react";

export interface DeviceFilterOption {
  device_id: string;
  device_name: string;
}

export function DeviceFilterSelect({
  label,
  allLabel,
  devices,
  value,
  onChange,
}: {
  label: string;
  allLabel: string;
  devices: DeviceFilterOption[];
  value: string;
  onChange: (deviceId: string) => void;
}) {
  const TriggerIcon = value ? Display : Layers;

  return (
    <label className="flex flex-col gap-1">
      <Typography color="muted" type="body-xs">
        {label}
      </Typography>
      <Select
        aria-label={label}
        className="w-48"
        value={value || "__all"}
        onChange={(key) => {
          if (key == null) return;
          const next = String(key);

          onChange(next === "__all" ? "" : next);
        }}
      >
        <Select.Trigger>
          <Select.Value>
            {({ selectedText }) => (
              <span className="flex min-w-0 items-center gap-2">
                <TriggerIcon
                  aria-hidden="true"
                  className="text-muted size-4 shrink-0"
                />
                <span className="truncate">{selectedText}</span>
              </span>
            )}
          </Select.Value>
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <Popover.Arrow />
          <ListBox>
            <ListBox.Item id="__all" textValue={allLabel}>
              <Layers
                aria-hidden="true"
                className="text-muted size-4 shrink-0"
              />
              {allLabel}
            </ListBox.Item>
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
    </label>
  );
}
