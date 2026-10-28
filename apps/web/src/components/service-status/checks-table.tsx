"use client";

// Probe results table at /service-status: one row per check with the target,
// status chip and latency.

import type { StatusCopy } from "@/lib/copy/status";

import { Chip, Table } from "@heroui/react";

import {
  CHECK_ICONS,
  latencyTone,
  type CheckDetail,
  type CheckResult,
} from "./checks";

import { useLocale } from "@/lib/copy/locale";
import { formatMessage } from "@/lib/copy/message";
import { useFormat } from "@/lib/format/format";

export function ChecksTable({
  results,
  copy,
}: {
  results: CheckResult[];
  copy: StatusCopy;
}) {
  const [locale] = useLocale();
  const { formatNumber } = useFormat();

  const detailText = (detail: CheckDetail): string => {
    switch (detail.kind) {
      case "tokens":
        return formatMessage(copy.detail.tokens, locale, {
          count: formatNumber(detail.value),
        });
      case "devices":
        return formatMessage(copy.detail.devices, locale, {
          count: formatNumber(detail.value),
        });
      case "no-session":
        return copy.sessionMissing;
      case "raw":
        return detail.text;
    }
  };

  return (
    <Table>
      <Table.ScrollContainer>
        <Table.Content aria-label={copy.pageTitle}>
          <Table.Header>
            <Table.Column isRowHeader>{copy.columnCheck}</Table.Column>
            <Table.Column>{copy.columnTarget}</Table.Column>
            <Table.Column>{copy.columnStatus}</Table.Column>
            <Table.Column>{copy.columnLatency}</Table.Column>
          </Table.Header>
          <Table.Body>
            {results.map((result) => {
              const Icon = CHECK_ICONS[result.name];

              return (
                <Table.Row key={result.name}>
                  <Table.Cell>
                    <span className="flex items-center gap-2">
                      <Icon
                        aria-hidden="true"
                        className="text-muted size-4 shrink-0"
                      />
                      <span className="flex min-w-0 flex-col">
                        <span className="font-medium">
                          {copy.checks[result.name]}
                        </span>
                        {result.detail ? (
                          <span
                            className={
                              result.status === "fail"
                                ? "text-danger/80 text-xs break-words"
                                : "text-muted text-xs"
                            }
                          >
                            {detailText(result.detail)}
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </Table.Cell>
                  <Table.Cell className="text-foreground/60 text-xs">
                    {result.target}
                  </Table.Cell>
                  <Table.Cell>
                    <Chip
                      color={
                        result.status === "ok"
                          ? "success"
                          : result.status === "fail"
                            ? "danger"
                            : "default"
                      }
                      size="sm"
                      variant="soft"
                    >
                      {result.status === "ok"
                        ? copy.ok
                        : result.status === "fail"
                          ? copy.fail
                          : copy.checking}
                    </Chip>
                  </Table.Cell>
                  <Table.Cell className="tabular-nums">
                    {result.latencyMs != null ? (
                      <span className={latencyTone(result.latencyMs)}>
                        {`${result.latencyMs} ms`}
                      </span>
                    ) : (
                      "—"
                    )}
                  </Table.Cell>
                </Table.Row>
              );
            })}
          </Table.Body>
        </Table.Content>
      </Table.ScrollContainer>
    </Table>
  );
}
