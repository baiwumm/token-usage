"use client";

// Device list panel: active devices with their tokens/cost and last report;
// clicking a row filters the dashboard by that device.

import type { DashboardCopy } from "@/lib/copy/dashboard";
import type { DashboardDevice } from "@/lib/dashboard/api";

import { ListUl } from "@gravity-ui/icons";
import { Button, Card, Chip, Typography } from "@heroui/react";

import { FlowNumber } from "@/components/flow-number";
import { useFormat } from "@/lib/format/format";

export function DevicePanel({
  devices,
  copy,
  selectedDeviceId,
  onSelectDevice,
}: {
  devices: DashboardDevice[];
  copy: DashboardCopy;
  selectedDeviceId: string | null;
  onSelectDevice: (deviceId: string | null) => void;
}) {
  const { formatTokens, formatCost, formatDate } = useFormat();
  const active = devices.filter((device) => device.active);

  return (
    <Card className="p-6">
      <Card.Header className="flex-row items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <Card.Title>{copy.panels.devicesTitle}</Card.Title>
          <Card.Description>{copy.panels.devicesHint}</Card.Description>
        </div>
        {selectedDeviceId ? (
          <Button
            size="sm"
            variant="ghost"
            onPress={() => onSelectDevice(null)}
          >
            {copy.clearFilters}
          </Button>
        ) : null}
      </Card.Header>
      <Card.Content className="flex flex-col gap-1">
        {active.length === 0 ? (
          <Typography color="muted" type="body-sm">
            —
          </Typography>
        ) : (
          active.map((device) => {
            const selected = device.device_id === selectedDeviceId;

            return (
              <Button
                key={device.device_id}
                aria-pressed={selected}
                className={`h-auto w-full justify-start rounded-3xl px-3 py-2.5 text-start ${
                  selected ? "bg-default" : ""
                }`}
                variant="ghost"
                onPress={() =>
                  onSelectDevice(selected ? null : device.device_id)
                }
              >
                <span className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1">
                  <span className="flex min-w-0 items-center gap-2">
                    <ListUl
                      aria-hidden="true"
                      className="text-muted size-4 shrink-0"
                    />
                    <span className="truncate text-sm font-medium">
                      {device.device_name}
                    </span>
                    <Chip size="sm" variant="secondary">
                      {device.platform}
                    </Chip>
                    {selected ? (
                      <Chip color="accent" size="sm" variant="soft">
                        {copy.panels.selected}
                      </Chip>
                    ) : null}
                  </span>
                  <span className="text-foreground/60 tabular-nums text-xs">
                    <FlowNumber text={formatTokens(device.total_tokens)} /> ·{" "}
                    <FlowNumber text={formatCost(device.total_cost_usd)} />
                  </span>
                  <span className="text-muted col-span-2 text-xs">
                    {copy.panels.lastReport}:{" "}
                    {device.last_used_at || device.last_hour
                      ? formatDate(device.last_used_at ?? device.last_hour, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })
                      : copy.panels.never}
                  </span>
                </span>
              </Button>
            );
          })
        )}
      </Card.Content>
    </Card>
  );
}
