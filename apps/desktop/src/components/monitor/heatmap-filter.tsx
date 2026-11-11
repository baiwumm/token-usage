// Platform/source filter for the activity heatmap: a multi-select dropdown
// with "all" and "clear" shortcuts in its header. Ported from web's
// dashboard/heatmap-filter.tsx with desktop strings (zh 单语) and the desktop
// SourceIcon / source labels.

import { ChevronDown } from "@gravity-ui/icons";
import { Button, Dropdown, Header, Label, Popover } from "@heroui/react";

import { SourceIcon } from "@/components/source-icon";
import { sourceDisplayLabel } from "@/lib/source-logos";

export function HeatmapFilter({
  activeSources,
  sourceTotals,
  onSelect,
}: {
  activeSources: string[] | null;
  sourceTotals: Array<readonly [string, number]>;
  onSelect: (selection: Set<string> | null) => void;
}) {
  const filtersActive = activeSources != null;
  const count = activeSources?.length ?? 0;

  return (
    <Dropdown>
      <Button aria-label="全部平台" size="sm" variant="tertiary">
        {filtersActive
          ? count === 1
            ? sourceDisplayLabel(activeSources?.[0] ?? "")
            : `已选 ${count} 个平台`
          : "全部平台"}
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
                全部平台
                <span className="flex gap-1">
                  <Button
                    className="h-6 px-1.5 text-xs"
                    size="sm"
                    variant="ghost"
                    onPress={() => onSelect(null)}
                  >
                    全部
                  </Button>
                  <Button
                    className="h-6 px-1.5 text-xs"
                    size="sm"
                    variant="ghost"
                    onPress={() => onSelect(new Set())}
                  >
                    清空
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
                <SourceIcon size={14} source={source} />
                <Label>{sourceDisplayLabel(source)}</Label>
              </Dropdown.Item>
            ))}
          </Dropdown.Section>
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
