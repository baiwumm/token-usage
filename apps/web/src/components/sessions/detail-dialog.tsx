"use client";

// Session detail modal (docs/ui-spec.md Sessions): token breakdown, per-model
// table and the privacy/cost footnotes. Device metadata only — the API never
// returns prompts or bodies.

import type { SessionItem } from "@/lib/dashboard/api";
import type { SessionsCopy } from "@/lib/copy/sessions";
import type { BreakdownTableRow } from "@/components/dashboard/breakdown-table";

import { Chip, Modal, Typography } from "@heroui/react";

import { sortedModels } from "./model-chips";

import { BreakdownTable } from "@/components/dashboard/breakdown-table";
import { SourceIcon } from "@/components/source-icon";
import { sourceDisplayLabel } from "@/lib/sources";
import { useFormat } from "@/lib/format/format";

export function SessionDetailModal({
  session,
  copy,
  onOpenChange,
}: {
  session: SessionItem | null;
  copy: SessionsCopy;
  onOpenChange: (open: boolean) => void;
}) {
  const {
    formatTokens,
    formatCredits,
    formatDuration,
    formatDateTime,
    formatRelativeTime,
  } = useFormat();
  const models = session ? sortedModels(session.models) : [];
  // Model rows share the dashboard breakdown shell (docs/ui-spec.md 仪表盘
  // §5 / Sessions 详情): the cost column width therefore follows the shared
  // w-24 instead of the old hand-rolled w-28. Credits never appear here —
  // SessionModel carries no credits — so the credits column stays hidden.
  const modelRows: BreakdownTableRow[] = models.map((model) => ({
    id: model.model,
    label: model.model,
    tokens: model.total_tokens,
    share: model.share,
    cost: Number(model.total_cost_usd),
  }));
  const tokenRows = session
    ? [
        [copy.detail.input, session.input_tokens],
        [copy.detail.cached, session.cached_input_tokens],
        [copy.detail.cacheCreation, session.cache_creation_input_tokens],
        [copy.detail.output, session.output_tokens],
        [copy.detail.reasoning, session.reasoning_output_tokens],
        [copy.detail.total, session.total_tokens],
        [
          copy.detail.billable,
          session.billable_total_tokens ?? session.total_tokens,
        ],
      ]
    : [];
  // Credits render outside the formatTokens loop: they are a display-only
  // dimension with their own unit, not a token count (docs/cli-contract.md
  // §2.4).
  const showCredits = (session?.credits ?? 0) > 0;

  return (
    <Modal.Backdrop isOpen={session != null} onOpenChange={onOpenChange}>
      <Modal.Container scroll="inside">
        <Modal.Dialog className="max-h-[90vh] w-[calc(100vw-1rem)] max-w-2xl">
          {session ? (
            <>
              <Modal.Header>
                <Modal.CloseTrigger />
                <Modal.Heading>{copy.detail.title}</Modal.Heading>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Chip size="sm" variant="soft">
                    <SourceIcon label={session.source} size={12} />
                    {sourceDisplayLabel(session.source)}
                  </Chip>
                  <Chip
                    className="max-w-48"
                    color="warning"
                    size="sm"
                    variant="soft"
                  >
                    <span className="truncate">
                      {session.project_key ?? copy.list.noProject}
                    </span>
                  </Chip>
                  <Chip
                    className="max-w-40"
                    color="success"
                    size="sm"
                    variant="soft"
                  >
                    <span className="truncate">{session.device_name}</span>
                  </Chip>
                </div>
              </Modal.Header>
              <Modal.Body className="flex flex-col gap-5">
                <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                  <div className="flex flex-col gap-0.5">
                    <Typography color="muted" type="body-xs">
                      {copy.list.endedAt}
                    </Typography>
                    <Typography
                      className="tabular-nums"
                      type="body-sm"
                      weight="medium"
                    >
                      {formatDateTime(session.ended_at)}
                    </Typography>
                    <Typography color="muted" type="body-xs">
                      {formatRelativeTime(session.ended_at)}
                    </Typography>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <Typography color="muted" type="body-xs">
                      {copy.detail.duration}
                    </Typography>
                    <Typography
                      className="tabular-nums"
                      type="body-sm"
                      weight="medium"
                    >
                      {formatDuration(session.duration_ms)}
                    </Typography>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <Typography type="body-sm" weight="semibold">
                    {copy.detail.tokensTitle}
                  </Typography>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
                    {tokenRows.map(([label, value]) => (
                      <div
                        key={String(label)}
                        className="flex flex-col gap-0.5"
                      >
                        <Typography color="muted" type="body-xs">
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
                        <Typography color="muted" type="body-xs">
                          {copy.detail.credits}
                        </Typography>
                        <Typography
                          className="tabular-nums"
                          type="body-sm"
                          weight="medium"
                        >
                          {formatCredits(session.credits)}{" "}
                          <span className="text-foreground/60 text-xs">
                            {copy.detail.creditsUnit}
                          </span>
                        </Typography>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <Typography type="body-sm" weight="semibold">
                    {copy.detail.modelsTitle}
                  </Typography>
                  {modelRows.length === 0 ? (
                    <Typography color="muted" type="body-sm">
                      —
                    </Typography>
                  ) : (
                    <BreakdownTable
                      ariaLabel={copy.detail.modelsTitle}
                      labels={{
                        name: copy.detail.modelName,
                        tokens: copy.detail.modelTokens,
                        share: copy.detail.modelShare,
                        cost: copy.detail.modelCost,
                        // Hidden (no row carries credits); still sourced from
                        // the typed copy rather than a hardcoded string.
                        credits: copy.detail.credits,
                      }}
                      renderLabel={(row) => (
                        <span
                          className="flex min-w-0 items-center gap-1.5"
                          title={row.label}
                        >
                          <SourceIcon
                            label={row.label}
                            size={14}
                            source={session.source}
                          />
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
                  <Typography color="muted" type="body-xs">
                    {copy.detail.privacy}
                  </Typography>
                  <Typography color="muted" type="body-xs">
                    {copy.detail.costNote}
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
