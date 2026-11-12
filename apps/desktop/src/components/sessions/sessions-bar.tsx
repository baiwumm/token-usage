import type { SessionRange } from "@/lib/sessions";

import { ArrowDownToLine, ArrowRotateRight } from "@gravity-ui/icons";
import {
  Button,
  ListBox,
  Popover,
  Select,
  Spinner,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@heroui/react";

import { SourceIcon } from "@/components/source-icon";
import { formatRelativeTime } from "@/lib/format-tokens";
import { sourceDisplayLabel } from "@/lib/source-logos";

const RANGE_OPTIONS: Array<{ id: SessionRange; label: string }> = [
  { id: "today", label: "今天" },
  { id: "7d", label: "7D" },
  { id: "30d", label: "30D" },
  { id: "90d", label: "90D" },
];

/**
 * Sessions filter row (web filter-bar 移植, single-machine cut): range presets
 * (今天 / 7D / 30D / 90D, default 30D — web presets resolve against today, no
 * custom calendar on the desktop), the source select fed by local facets,
 * then 清除筛选 when narrowing, and the CSV / refresh icon cluster. The web's
 * device filter is dropped — the local sidecar is this machine only
 * (desktop-plan §12.13).
 */
export function SessionsBar({
  range,
  source,
  facets,
  hasNarrowingFilters,
  refreshing,
  exporting,
  updatedAt,
  onRangeChange,
  onSourceChange,
  onClearFilters,
  onExportCsv,
  onRefresh,
}: {
  range: SessionRange;
  source: string;
  facets: Array<{ source: string; sessions: number }>;
  hasNarrowingFilters: boolean;
  refreshing: boolean;
  exporting: boolean;
  updatedAt: number | null;
  onRangeChange: (range: SessionRange) => void;
  onSourceChange: (source: string) => void;
  onClearFilters: () => void;
  onExportCsv: () => void;
  onRefresh: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ToggleButtonGroup
        disallowEmptySelection
        aria-label="时间范围"
        className="shrink-0"
        selectedKeys={[range]}
        selectionMode="single"
        size="sm"
        onSelectionChange={(keys) => {
          const next = typeof keys === "string" ? null : [...keys][0];

          if (
            next === "today" ||
            next === "7d" ||
            next === "30d" ||
            next === "90d"
          ) {
            onRangeChange(next);
          }
        }}
      >
        {RANGE_OPTIONS.map((option, index) => (
          <ToggleButton key={option.id} id={option.id} size="sm">
            {index > 0 ? <ToggleButtonGroup.Separator /> : null}
            {option.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      <SourceSelect facets={facets} source={source} onChange={onSourceChange} />

      {hasNarrowingFilters ? (
        <Button size="sm" variant="outline" onPress={onClearFilters}>
          清除筛选
        </Button>
      ) : null}

      <div className="ml-auto flex shrink-0 items-center gap-1">
        <Tooltip delay={0}>
          <Button
            isIconOnly
            aria-label="导出 CSV"
            className="size-8 min-w-8 text-muted hover:text-foreground"
            isDisabled={exporting || refreshing}
            size="sm"
            variant="tertiary"
            onPress={onExportCsv}
          >
            {exporting ? (
              <Spinner size="sm" />
            ) : (
              <ArrowDownToLine aria-hidden="true" className="size-4" />
            )}
          </Button>
          <Tooltip.Content showArrow placement="bottom">
            <Tooltip.Arrow />
            <Typography type="body-xs">导出 CSV</Typography>
          </Tooltip.Content>
        </Tooltip>
        <Tooltip delay={0}>
          <Button
            isIconOnly
            aria-label="刷新"
            className="size-8 min-w-8 text-muted hover:text-foreground"
            size="sm"
            variant="tertiary"
            onPress={onRefresh}
          >
            <ArrowRotateRight
              aria-hidden="true"
              className={refreshing ? "animate-spin" : "size-4"}
            />
          </Button>
          <Tooltip.Content showArrow placement="bottom">
            <Tooltip.Arrow />
            <Typography type="body-xs">
              {updatedAt === null
                ? "尚未加载数据"
                : `上次更新 ${formatRelativeTime(
                    new Date(updatedAt).toISOString(),
                  )}`}
            </Typography>
          </Tooltip.Content>
        </Tooltip>
      </div>
    </div>
  );
}

function SourceSelect({
  facets,
  source,
  onChange,
}: {
  facets: Array<{ source: string; sessions: number }>;
  source: string;
  onChange: (source: string) => void;
}) {
  return (
    <Select
      aria-label="来源"
      className="w-36 shrink-0"
      value={source || "__all"}
      variant="secondary"
      onChange={(key) => {
        if (key == null) return;
        onChange(key === "__all" ? "" : String(key));
      }}
    >
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <Popover.Arrow />
        <ListBox>
          <ListBox.Item id="__all" textValue="全部来源">
            <span className="flex items-center gap-1.5">全部来源</span>
          </ListBox.Item>
          {facets.map((facet) => (
            <ListBox.Item
              key={facet.source}
              id={facet.source}
              textValue={sourceDisplayLabel(facet.source)}
            >
              <span className="flex items-center gap-1.5">
                <SourceIcon size={12} source={facet.source} />
                {sourceDisplayLabel(facet.source)}
              </span>
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}
