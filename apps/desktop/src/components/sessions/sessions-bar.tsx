import type { SessionFacet, SessionRange } from "@/lib/sessions";

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
 * (今天 / 7D / 30D / 90D, default 今天 — web presets resolve against today, no
 * custom calendar on the desktop), then the three facet selects (来源 / 项目 /
 * 模型, each fed by the window with the other filters applied), 清除筛选 when
 * narrowing, and the CSV / refresh icon cluster. The web's device filter is
 * dropped — the local sidecar is this machine only (desktop-plan §12.13 /
 * §12.14).
 */
export function SessionsBar({
  range,
  source,
  project,
  model,
  sourceFacets,
  projectFacets,
  modelFacets,
  hasNarrowingFilters,
  refreshing,
  exporting,
  updatedAt,
  onRangeChange,
  onSourceChange,
  onProjectChange,
  onModelChange,
  onClearFilters,
  onExportCsv,
  onRefresh,
}: {
  range: SessionRange;
  source: string;
  project: string;
  model: string;
  sourceFacets: SessionFacet[];
  projectFacets: SessionFacet[];
  modelFacets: SessionFacet[];
  hasNarrowingFilters: boolean;
  refreshing: boolean;
  exporting: boolean;
  updatedAt: number | null;
  onRangeChange: (range: SessionRange) => void;
  onSourceChange: (source: string) => void;
  onProjectChange: (project: string) => void;
  onModelChange: (model: string) => void;
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

      <SourceSelect
        facets={sourceFacets}
        source={source}
        onChange={onSourceChange}
      />
      <FacetSelect
        allLabel="全部项目"
        ariaLabel="项目"
        className="w-36 shrink-0"
        facets={projectFacets}
        value={project}
        onChange={onProjectChange}
      />
      <FacetSelect
        allLabel="全部模型"
        ariaLabel="模型"
        className="w-40 shrink-0"
        facets={modelFacets}
        value={model}
        onChange={onModelChange}
      />

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
  facets: SessionFacet[];
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
              key={facet.key}
              id={facet.key}
              textValue={sourceDisplayLabel(facet.key)}
            >
              <span className="flex items-center gap-1.5">
                <SourceIcon size={12} source={facet.key} />
                {sourceDisplayLabel(facet.key)}
              </span>
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}

/** Plain facet select for 项目 / 模型 (the source one carries a logo). */
function FacetSelect({
  allLabel,
  ariaLabel,
  className,
  facets,
  value,
  onChange,
}: {
  allLabel: string;
  ariaLabel: string;
  className: string;
  facets: SessionFacet[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Select
      aria-label={ariaLabel}
      className={className}
      value={value || "__all"}
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
          <ListBox.Item id="__all" textValue={allLabel}>
            {allLabel}
          </ListBox.Item>
          {facets.map((facet) => (
            <ListBox.Item key={facet.key} id={facet.key} textValue={facet.key}>
              <span className="flex items-center justify-between gap-3">
                <span className="truncate">{facet.key}</span>
                <span className="text-muted tabular-nums">
                  {facet.sessions}
                </span>
              </span>
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}
