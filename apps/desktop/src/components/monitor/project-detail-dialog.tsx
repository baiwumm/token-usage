// On-demand drill-down shape for the project detail dialog — see
// lib/project-detail.ts for the fold.
import type { ProjectDetail } from "@/lib/project-detail";

import { LogoGithub } from "@gravity-ui/icons";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Modal, Typography } from "@heroui/react";

import { ProjectLogo } from "@/components/monitor/project-logo";
import { SourceIcon } from "@/components/source-icon";
import { AXIS_STYLE } from "@/lib/charts-theme";
import {
  formatCost,
  formatNumber,
  formatPercent,
  formatRelativeTime,
  formatTokens,
} from "@/lib/format-tokens";

interface ProjectDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectName: string;
  /** Web-edited display name, when the account has one. */
  displayName: string | null;
  /** Web-edited logo candidates (typed URL, then upload), in display order. */
  logoUrls: string[];
  repoUrl: string | null;
  /** Share of the whole window (attributed + unattributed). */
  windowShare: number;
  /** Selected period label (今日 / 7D / 30D / 总计). */
  periodLabel: string;
  detail: ProjectDetail | null;
  onOpenUrl: (url: string) => void;
}

/**
 * 项目详情 dialog — web /projects 详情同款双栏版式（2026-11-11 D10.1 对齐）：
 * 左栏 = identity（logo / 显示名 / 目录名 / 区间 · 口径）+ 六格 KPI + 脚注；
 * 右栏 = 其他字段（日峰值 / 最近活跃 / 积分）+ 每日活跃柱图（≤60 天）+ Token
 * 构成条 + 按来源行。全部数字按需从同一去重行折叠（小时桶口径、仅本机数据），
 * 与列表行同源；无 web 的 profile 编辑 / 上下项目导航（桌面无项目 profile
 * 写入面，编辑仍走 web）。
 */
export function ProjectDetailDialog({
  open,
  onOpenChange,
  projectName,
  displayName,
  logoUrls,
  repoUrl,
  windowShare,
  periodLabel,
  detail,
  onOpenUrl,
}: ProjectDetailDialogProps) {
  const composition = detail
    ? [
        { key: "输入", value: detail.inputTokens },
        { key: "缓存", value: detail.cachedTokens },
        { key: "输出", value: detail.outputTokens },
      ]
    : [];
  const compositionTotal = composition.reduce(
    (sum, entry) => sum + entry.value,
    0,
  );
  const daily = (detail?.daily ?? []).map((day) => ({
    ...day,
    label: day.day.slice(5),
  }));

  return (
    <Modal.Backdrop isOpen={open} onOpenChange={onOpenChange}>
      <Modal.Container>
        <Modal.Dialog className="max-h-[90vh] w-[calc(100vw-1rem)] max-w-3xl">
          <Modal.CloseTrigger aria-label="关闭" />
          <Modal.Body className="grid gap-6 pt-4 md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
            {/* 左栏：identity + KPI + 脚注 */}
            <div className="flex flex-col gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <ProjectLogo
                  className="size-12 rounded-xl text-lg"
                  dimension={48}
                  name={displayName ?? projectName}
                  urls={logoUrls}
                />
                <div className="flex min-w-0 flex-col gap-0.5">
                  <Typography
                    className="block max-w-56 truncate"
                    type="body"
                    weight="semibold"
                  >
                    <span title={displayName ?? projectName}>
                      {displayName ?? projectName}
                    </span>
                  </Typography>
                  <Typography color="muted" type="body-xs">
                    {projectName}
                  </Typography>
                  {repoUrl ? (
                    <button
                      className="flex items-center gap-1 self-start text-xs text-accent hover:underline"
                      title={repoUrl}
                      type="button"
                      onClick={() => onOpenUrl(repoUrl)}
                    >
                      <LogoGithub aria-hidden="true" className="size-3.5" />
                      打开仓库
                    </button>
                  ) : null}
                </div>
              </div>

              <Typography color="muted" type="body-xs">
                {periodLabel} · 口径：小时桶 · 仅本机数据
              </Typography>

              <div className="grid grid-cols-2 gap-3">
                <StatCell
                  label="Token 总量"
                  value={detail ? formatTokens(detail.totalTokens) : "—"}
                />
                <StatCell label="占窗口" value={formatPercent(windowShare)} />
                <StatCell
                  label="费用（估算）"
                  value={detail ? formatCost(detail.totalCostUsd) : "—"}
                />
                <StatCell
                  label="会话条目"
                  value={detail ? formatNumber(detail.conversations) : "—"}
                />
                <StatCell
                  label="活跃天数"
                  value={detail ? formatNumber(detail.daysActive) : "—"}
                />
                <StatCell
                  label="日均（活跃日）"
                  value={detail ? formatTokens(detail.avgPerActiveDay) : "—"}
                />
              </div>

              <Typography color="muted" type="body-xs">
                费用为按模型定价的刊例价估算，订阅制来源可能与实际账单有偏差。
                积分为独立维度，不计入 Token、费用与占比。
                仅展示用量元数据，不含对话内容、路径或命令行。
              </Typography>
            </div>

            {/* 右栏：其他字段 + 每日活跃 + 构成 + 来源 */}
            <div className="flex min-w-0 flex-col gap-5">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs">
                <Field
                  label="日峰值"
                  value={
                    detail?.peakDay
                      ? `${detail.peakDay.day} · ${formatTokens(detail.peakDay.tokens)}`
                      : "—"
                  }
                />
                <Field
                  label="最近活跃"
                  value={
                    detail && detail.lastActiveMs !== null
                      ? formatRelativeTime(
                          new Date(detail.lastActiveMs).toISOString(),
                        )
                      : "—"
                  }
                />
                {detail && detail.credits > 0 ? (
                  <Field label="积分" value={formatNumber(detail.credits)} />
                ) : null}
              </div>

              {detail && daily.length > 0 ? (
                <div className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Typography type="body-sm" weight="medium">
                      每日活跃（最近 {daily.length} 天）
                    </Typography>
                    <Typography color="muted" type="body-xs">
                      悬停查看当天明细
                    </Typography>
                  </div>
                  <div
                    aria-label="每日 Token"
                    className="h-48 w-full text-foreground/40"
                    role="img"
                  >
                    <ResponsiveContainer height="100%" width="100%">
                      <BarChart
                        data={daily}
                        margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis
                          dataKey="label"
                          minTickGap={24}
                          tick={{ ...AXIS_STYLE }}
                        />
                        <YAxis
                          tick={{ ...AXIS_STYLE }}
                          tickFormatter={(value: number) => formatTokens(value)}
                          width={56}
                        />
                        <ChartTooltip
                          content={(props) => {
                            const payload = (
                              props as unknown as {
                                active?: boolean;
                                payload?: ReadonlyArray<{
                                  payload?: {
                                    day?: string;
                                    tokens?: number;
                                    costUsd?: number;
                                    conversations?: number;
                                  };
                                }>;
                              }
                            ).payload;

                            if (!props.active || !payload?.length) return null;
                            const datum = payload[0]?.payload;

                            return (
                              <div className="bg-surface text-foreground border-border rounded-3xl border p-3 text-xs shadow-sm">
                                <div className="font-medium">{datum?.day}</div>
                                <div className="tabular-nums">
                                  {formatTokens(datum?.tokens ?? 0)} ·{" "}
                                  {formatNumber(datum?.conversations ?? 0)} 条 ·{" "}
                                  {formatCost(datum?.costUsd ?? 0)}
                                </div>
                              </div>
                            );
                          }}
                          cursor={{ opacity: 0.08 }}
                        />
                        <Bar
                          dataKey="tokens"
                          fill="var(--color-chart-1)"
                          radius={[3, 3, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ) : null}

              {detail && compositionTotal > 0 ? (
                <div className="flex flex-col gap-1.5">
                  <Typography type="body-sm" weight="medium">
                    Token 构成
                  </Typography>
                  <div
                    aria-hidden="true"
                    className="flex h-2 w-full overflow-hidden rounded-full bg-default"
                  >
                    {composition.map((entry) => (
                      <div
                        key={entry.key}
                        className={
                          entry.key === "输入"
                            ? "bg-[var(--color-chart-1)]"
                            : entry.key === "缓存"
                              ? "bg-[var(--color-chart-3)]"
                              : "bg-[var(--color-chart-2)]"
                        }
                        style={{
                          width: `${(entry.value / compositionTotal) * 100}%`,
                        }}
                      />
                    ))}
                  </div>
                  <div className="text-muted flex flex-wrap gap-x-3 gap-y-0.5 text-xs tabular-nums">
                    {composition.map((entry) => (
                      <span key={entry.key}>
                        {entry.key} {formatTokens(entry.value)} ·{" "}
                        {formatPercent(entry.value / compositionTotal)}
                      </span>
                    ))}
                    {detail.reasoningTokens > 0 ? (
                      <span>含推理 {formatTokens(detail.reasoningTokens)}</span>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {detail && detail.sources.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  <Typography type="body-sm" weight="medium">
                    按来源
                  </Typography>
                  <div className="flex flex-col gap-1.5">
                    {detail.sources.map((source) => (
                      <div key={source.id} className="flex flex-col gap-0.5">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="flex min-w-0 items-center gap-1.5">
                            <SourceIcon size={12} source={source.id} />
                            <span className="truncate">{source.label}</span>
                            <span className="text-muted tabular-nums">
                              {formatNumber(source.conversations)} 次对话
                            </span>
                          </span>
                          <span className="text-muted tabular-nums">
                            {formatTokens(source.tokens)} ·{" "}
                            {formatPercent(source.share)} ·{" "}
                            {formatCost(source.costUsd)}
                          </span>
                        </div>
                        <div
                          aria-hidden="true"
                          className="h-1 w-full overflow-hidden rounded-full bg-default"
                        >
                          <div
                            className="h-full rounded-full bg-accent"
                            style={{
                              width: `${Math.max(source.share * 100, 2)}%`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </Modal.Body>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-default/60 px-3 py-2">
      <Typography color="muted" type="body-xs">
        {label}
      </Typography>
      <Typography
        className="text-foreground tabular-nums"
        type="h6"
        weight="semibold"
      >
        {value}
      </Typography>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-muted">{label}</span>
      <span className="text-foreground tabular-nums">{value}</span>
    </span>
  );
}
