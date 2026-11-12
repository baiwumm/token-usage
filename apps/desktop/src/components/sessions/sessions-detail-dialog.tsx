import type { SessionRow } from "@/lib/sessions";

import { Chip, Modal, Typography } from "@heroui/react";

import { BreakdownTable } from "@/components/monitor/breakdown-table";
import { ModelIcon } from "@/components/model-icon";
import { sortedModels } from "@/components/sessions/model-chips";
import { SourceIcon } from "@/components/source-icon";
import {
  formatCredits,
  formatDateTime,
  formatDuration,
  formatRelativeTime,
  formatTokens,
} from "@/lib/format-tokens";
import { sourceDisplayLabel } from "@/lib/source-logos";

/**
 * Session detail modal (web SessionDetailModal 移植, single-machine cut):
 * source + project chips (no device chip — the local sidecar is this
 * machine), meta grid, Token 拆分, per-model BreakdownTable and the
 * privacy/cost footnotes. `session_id` stays an internal key — never shown.
 */
export function SessionsDetailDialog({
  session,
  onOpenChange,
}: {
  session: SessionRow | null;
  onOpenChange: (open: boolean) => void;
}) {
  const models = session ? sortedModels(session.models) : [];
  const totalTokens = session?.totalTokens ?? 0;
  const modelRows = models.map((model) => ({
    id: model.model,
    label: model.model,
    tokens: model.totalTokens,
    share: totalTokens > 0 ? model.totalTokens / totalTokens : 0,
    cost: session ? modelCost(session, model.totalTokens) : 0,
  }));
  const tokenRows = session
    ? ([
        ["输入", session.inputTokens],
        ["缓存读取", session.cachedInputTokens],
        ["缓存写入", session.cacheCreationInputTokens],
        ["输出", session.outputTokens],
        ["推理", session.reasoningOutputTokens],
        ["总计", session.totalTokens],
        // Locally billable is always the null → total fallback (CLI uploads
        // null), same display rule as the web page.
        ["计费", session.totalTokens],
      ] as const)
    : [];
  const showCredits = (session?.credits ?? 0) > 0;

  return (
    <Modal.Backdrop isOpen={session != null} onOpenChange={onOpenChange}>
      <Modal.Container scroll="inside">
        <Modal.Dialog className="max-h-[90vh] w-[calc(100vw-1rem)] max-w-2xl">
          {session ? (
            <>
              <Modal.Header>
                <Modal.CloseTrigger />
                <Modal.Heading>会话详情</Modal.Heading>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Chip size="sm" variant="soft">
                    <SourceIcon size={12} source={session.source} />
                    {sourceDisplayLabel(session.source)}
                  </Chip>
                  <Chip
                    className="max-w-48"
                    color="warning"
                    size="sm"
                    variant="soft"
                  >
                    <span className="truncate">
                      {session.projectKey || "未标注"}
                    </span>
                  </Chip>
                </div>
              </Modal.Header>
              <Modal.Body className="flex flex-col gap-5">
                <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                  <div className="flex flex-col gap-0.5">
                    <Typography className="text-muted" type="body-xs">
                      结束时间
                    </Typography>
                    <Typography
                      className="tabular-nums"
                      type="body-sm"
                      weight="medium"
                    >
                      {formatDateTime(session.endedAt)}
                    </Typography>
                    <Typography className="text-muted" type="body-xs">
                      {formatRelativeTime(session.endedAt)}
                    </Typography>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <Typography className="text-muted" type="body-xs">
                      时长
                    </Typography>
                    <Typography
                      className="tabular-nums"
                      type="body-sm"
                      weight="medium"
                    >
                      {formatDuration(session.durationMs)}
                    </Typography>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <Typography type="body-sm" weight="semibold">
                    Token 拆分
                  </Typography>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
                    {tokenRows.map(([label, value]) => (
                      <div key={label} className="flex flex-col gap-0.5">
                        <Typography className="text-muted" type="body-xs">
                          {label}
                        </Typography>
                        <Typography
                          className="tabular-nums"
                          type="body-sm"
                          weight="medium"
                        >
                          {formatTokens(value)}
                        </Typography>
                      </div>
                    ))}
                    {showCredits ? (
                      <div className="flex flex-col gap-0.5">
                        <Typography className="text-muted" type="body-xs">
                          积分
                        </Typography>
                        <Typography
                          className="tabular-nums"
                          type="body-sm"
                          weight="medium"
                        >
                          {formatCredits(session.credits)}{" "}
                          <span className="text-foreground/60 text-xs">
                            积分
                          </span>
                        </Typography>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <Typography type="body-sm" weight="semibold">
                    模型拆分
                  </Typography>
                  {modelRows.length === 0 ? (
                    <Typography className="text-muted" type="body-sm">
                      —
                    </Typography>
                  ) : (
                    <BreakdownTable
                      ariaLabel="模型拆分"
                      labels={{
                        name: "模型",
                        tokens: "Token",
                        share: "占比",
                        cost: "成本",
                        credits: "积分",
                      }}
                      minClassName="min-w-[24rem]"
                      renderLabel={(row) => (
                        <span
                          className="flex min-w-0 items-center gap-1.5"
                          title={row.label}
                        >
                          <ModelIcon model={row.label} size={14} />
                          <span className="truncate font-medium">
                            {row.label}
                          </span>
                        </span>
                      )}
                      rows={modelRows}
                    />
                  )}
                </div>

                <div className="bg-default/40 flex flex-col gap-1 rounded-3xl px-3 py-2">
                  <Typography className="text-muted" type="body-xs">
                    仅用量元数据，不含对话内容、路径或命令。
                  </Typography>
                  <Typography className="text-muted" type="body-xs">
                    按模型定价估算，可能与仪表盘 provider 上报成本存在差异。
                  </Typography>
                </div>
              </Modal.Body>
            </>
          ) : null}
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

/**
 * Per-model cost of a session: the session's read-time estimate split by
 * token share (the same proportional split the CSV export prints).
 */
function modelCost(session: SessionRow, modelTokens: number): number {
  if (session.totalTokens <= 0) return 0;

  return (session.costUsd * modelTokens) / session.totalTokens;
}
