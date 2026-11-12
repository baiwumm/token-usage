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
  { id: "all", label: "总计" },
];

/**
 * Sessions filter row (web filter-bar 移植, single-machine cut): range presets
 * (今天 / 7D / 30D / 总计, matching the usage header — 2026-11-12 operator:
 * 90D → 总计), then the three facet selects (来源 / 项目 / 模型, each fed by the
 * window with the other filters applied), and the CSV / refresh icon cluster.
 *
 * Each select shows the 「全部 …」 placeholder while unset and grows a
 * `Select.ClearButton` once picked (operator round 2: no 清除筛选 button; long
 * project names truncate like the web's device filter). The web's device
 * filter is dropped — the local sidecar is this machine only
 * (desktop-plan §12.13 / §12.14).
 */
export function SessionsBar({
  range,
  source,
  project,
  model,
  sourceFacets,
  projectFacets,
  modelFacets,
  refreshing,
  exporting,
  updatedAt,
  onRangeChange,
  onSourceChange,
  onProjectChange,
  onModelChange,
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
  refreshing: boolean;
  exporting: boolean;
  updatedAt: number | null;
  onRangeChange: (range: SessionRange) => void;
  onSourceChange: (source: string) => void;
  onProjectChange: (project: string) => void;
  onModelChange: (model: string) => void;
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
            next === "all"
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
        ariaKey="项目"
        className="w-40 shrink-0"
        facets={projectFacets}
        value={project}
        onChange={onProjectChange}
      />
      <FacetSelect
        allLabel="全部模型"
        ariaKey="模型"
        className="w-44 shrink-0"
        facets={modelFacets}
        value={model}
        onChange={onModelChange}
      />

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

/** 来源 select: logo in the trigger, display name in the list. */
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
      value={source || null}
      variant="secondary"
      onChange={(key) => onChange(key == null ? "" : String(key))}
    >
      <Select.Trigger>
        <Select.Value>
          {({ selectedText }) => (
            <span className="flex min-w-0 items-center gap-1.5">
              {source === "" ? null : <SourceIcon size={12} source={source} />}
              <span className="truncate">{selectedText || "全部来源"}</span>
            </span>
          )}
        </Select.Value>
        <Select.ClearButton aria-label="清除来源筛选" />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <Popover.Arrow />
        <ListBox>
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

/** Plain facet select for 项目 / 模型 (truncating trigger + session counts). */
function FacetSelect({
  allLabel,
  ariaKey,
  className,
  facets,
  value,
  onChange,
}: {
  allLabel: string;
  /** Accessible name, e.g. 「项目」→ aria-label 项目. */
  ariaKey: string;
  className: string;
  facets: SessionFacet[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Select
      aria-label={ariaKey}
      className={className}
      value={value || null}
      variant="secondary"
      onChange={(key) => onChange(key == null ? "" : String(key))}
    >
      <Select.Trigger>
        <Select.Value>
          {({ selectedText }) => (
            <span className="truncate">{selectedText || allLabel}</span>
          )}
        </Select.Value>
        <Select.ClearButton aria-label={`清除${ariaKey}筛选`} />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <Popover.Arrow />
        <ListBox>
          {facets.map((facet) => (
            <ListBox.Item key={facet.key} id={facet.key} textValue={facet.key}>
              <span className="flex w-full items-center justify-between gap-3">
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
