"use client";

// Platform/source filter for the activity heatmap: a multi-select dropdown
// with "all" and "clear" shortcuts in its header.

import type { DashboardCopy } from "@/lib/copy/dashboard";

import { ChevronDown } from "@gravity-ui/icons";
import { Button, Dropdown, Header, Label, Popover } from "@heroui/react";

import { SourceIcon } from "@/components/source-icon";
import { sourceDisplayLabel } from "@/lib/sources";
import { formatMessage } from "@/lib/copy/message";

export function HeatmapFilter({
  activeSources,
  copy,
  locale,
  sourceTotals,
  onSelect,
}: {
  activeSources: string[] | null;
  copy: DashboardCopy;
  locale: "zh" | "en";
  sourceTotals: Array<readonly [string, number]>;
  onSelect: (selection: Set<string> | null) => void;
}) {
  const filtersActive = activeSources != null;

  return (
    <Dropdown>
      <Button
        aria-label={copy.charts.heatmapAllPlatforms}
        size="sm"
        variant="tertiary"
      >
        {filtersActive
          ? (activeSources?.length ?? 0) === 1
            ? sourceDisplayLabel(activeSources?.[0] ?? "")
            : formatMessage(copy.charts.heatmapSelectedCount, locale, {
                count: activeSources?.length ?? 0,
              })
          : copy.charts.heatmapAllPlatforms}
        <ChevronDown aria-hidden="true" className="size-3.5" />
      </Button>
      <Dropdown.Popover className="min-w-56" placement="bottom end">
        <Popover.Arrow />
        <Dropdown.Menu
          selectedKeys={filtersActive ? (activeSources ?? []) : "all"}
          selectionMode="multiple"
          onSelectionChange={(keys) => {
            if (keys === "all") {
              onSelect(null);

              return;
            }
            onSelect(new Set([...keys] as string[]));
          }}
        >
          <Dropdown.Section>
            <Header>
              <span className="flex w-full items-center justify-between gap-2">
                {copy.charts.heatmapAllPlatforms}
                <span className="flex gap-1">
                  <Button
                    className="h-6 px-1.5 text-xs"
                    size="sm"
                    variant="ghost"
                    onPress={() => onSelect(null)}
                  >
                    {copy.charts.heatmapAll}
                  </Button>
                  <Button
                    className="h-6 px-1.5 text-xs"
                    size="sm"
                    variant="ghost"
                    onPress={() => onSelect(new Set())}
                  >
                    {copy.charts.heatmapClear}
                  </Button>
                </span>
              </span>
            </Header>
            {sourceTotals.map(([source]) => (
              <Dropdown.Item
                key={source}
                id={source}
                textValue={sourceDisplayLabel(source)}
              >
                <Dropdown.ItemIndicator />
                <SourceIcon label={source} size={14} />
                <Label>{sourceDisplayLabel(source)}</Label>
              </Dropdown.Item>
            ))}
          </Dropdown.Section>
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
