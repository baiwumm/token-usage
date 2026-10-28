"use client";

// Monthly trend card for /wrapped — the shared dashboard TrendChart fed with the
// year's month buckets.

import type { WrappedCopy } from "@/lib/copy/wrapped";

import { Card } from "@heroui/react";

import { TrendChart, type TrendPoint } from "@/components/charts";

export function MonthlyCard({
  copy,
  year,
  data,
}: {
  copy: WrappedCopy;
  year: number;
  data: TrendPoint[];
}) {
  return (
    <Card className="p-6">
      <Card.Header>
        <Card.Title>{copy.monthlyTitle}</Card.Title>
      </Card.Header>
      <Card.Content>
        <TrendChart
          ariaLabel={`${year} ${copy.monthlyTitle}`}
          data={data}
          emptyLabel={copy.monthlyTitle}
          labels={{
            tokens: copy.cards.totalTokens,
            cost: copy.cards.cost,
            conversations: copy.cards.conversations,
            input: copy.trend.input,
            cached: copy.trend.cached,
            output: copy.trend.output,
          }}
          metric="tokens"
        />
      </Card.Content>
    </Card>
  );
}
