"use client";

// Collapsible scope note for /projects (docs/ui-spec.md「项目（`/projects`）」节):
// which sources the aggregation covers, which it misses, and the list-price
// cost caveat. Collapsed by default so the summary and the list own the first
// screen; the wording is one click away (2026-11-06). Standalone component so
// the text stays a one-file swap when the coverage changes.

import { Card, Disclosure, Typography } from "@heroui/react";
import { useState } from "react";

export function ScopeNote({ title, text }: { title: string; text: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="px-4 py-1">
      <Disclosure isExpanded={expanded} onExpandedChange={setExpanded}>
        <Disclosure.Heading>
          <Disclosure.Trigger className="text-muted flex w-full items-center justify-between gap-2 py-2 text-start text-xs font-semibold">
            {title}
            <Disclosure.Indicator />
          </Disclosure.Trigger>
        </Disclosure.Heading>
        <Disclosure.Content>
          <Disclosure.Body className="pb-3">
            <Typography color="muted" type="body-xs">
              {text}
            </Typography>
          </Disclosure.Body>
        </Disclosure.Content>
      </Disclosure>
    </Card>
  );
}
