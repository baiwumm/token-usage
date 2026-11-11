import type { ReactNode } from "react";

import { Table, cn } from "@heroui/react";

import {
  formatCost,
  formatNumber,
  formatPercent,
  formatTokens,
} from "@/lib/format-tokens";

export interface BreakdownTableRow {
  id: string;
  label: string;
  /** Brand / model mark drawn before the label. */
  icon?: ReactNode;
  /** Second line under the label (e.g. the sources a model came from). */
  sublabel?: string;
  tokens: number;
  /** Share of this table's own total, 0–1. Absent renders an em dash. */
  share?: number;
  cost?: number;
  credits?: number;
}

export interface BreakdownTableLabels {
  name: string;
  tokens: string;
  share: string;
  cost: string;
  credits: string;
}

/**
 * Shared breakdown table shell (web 同款移植): the name cell truncates with
 * the full text in its title, numeric cells own their column width and never
 * wrap, and share / cost / credits columns only appear when at least one row
 * actually carries that dimension.
 */
export function BreakdownTable({
  ariaLabel,
  labels,
  rows,
  renderLabel,
  minClassName = "min-w-[24rem]",
}: {
  ariaLabel: string;
  labels: BreakdownTableLabels;
  rows: readonly BreakdownTableRow[];
  /** Replaces the default icon + label (+ sublabel) cell. */
  renderLabel?: (row: BreakdownTableRow) => ReactNode;
  /** Guards the fixed layout on narrow viewports (horizontal scroll). */
  minClassName?: string;
}) {
  const showShare = rows.some((row) => row.share != null);
  const showCost = rows.some((row) => row.cost != null);
  const showCredits = rows.some((row) => row.credits != null);

  return (
    <Table>
      <Table.ScrollContainer>
        <Table.Content
          aria-label={ariaLabel}
          className={cn("w-full table-fixed", minClassName)}
        >
          <Table.Header>
            <Table.Column isRowHeader id="name">
              {labels.name}
            </Table.Column>
            <Table.Column className="w-36 text-end" id="tokens">
              {labels.tokens}
            </Table.Column>
            {showShare ? (
              <Table.Column className="w-16 text-end" id="share">
                {labels.share}
              </Table.Column>
            ) : null}
            {showCost ? (
              <Table.Column className="w-24 text-end" id="cost">
                {labels.cost}
              </Table.Column>
            ) : null}
            {showCredits ? (
              <Table.Column className="w-24 text-end" id="credits">
                {labels.credits}
              </Table.Column>
            ) : null}
          </Table.Header>
          <Table.Body>
            {rows.map((row) => (
              <Table.Row key={row.id} id={row.id}>
                <Table.Cell>
                  {renderLabel ? (
                    renderLabel(row)
                  ) : (
                    <span
                      className="flex min-w-0 flex-col"
                      title={
                        row.sublabel
                          ? `${row.label} · ${row.sublabel}`
                          : row.label
                      }
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        {row.icon}
                        <span className="truncate font-medium">
                          {row.label}
                        </span>
                      </span>
                      {row.sublabel ? (
                        <span className="text-muted truncate text-xs">
                          {row.sublabel}
                        </span>
                      ) : null}
                    </span>
                  )}
                </Table.Cell>
                <Table.Cell className="whitespace-nowrap text-end tabular-nums">
                  {formatTokens(row.tokens)}
                </Table.Cell>
                {showShare ? (
                  <Table.Cell className="text-muted whitespace-nowrap text-end tabular-nums">
                    {row.share != null ? formatPercent(row.share) : "—"}
                  </Table.Cell>
                ) : null}
                {showCost ? (
                  <Table.Cell className="whitespace-nowrap text-end tabular-nums">
                    {row.cost != null ? formatCost(row.cost) : "—"}
                  </Table.Cell>
                ) : null}
                {showCredits ? (
                  <Table.Cell className="whitespace-nowrap text-end tabular-nums">
                    {row.credits != null ? formatNumber(row.credits) : "—"}
                  </Table.Cell>
                ) : null}
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Content>
      </Table.ScrollContainer>
    </Table>
  );
}
