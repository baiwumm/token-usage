"use client";

// Fixed scope note for /projects (docs/ui-spec.md「项目（`/projects`）」节): which
// sources the session-sidecar aggregation covers, which it misses, and the
// list-price cost caveat. Standalone component so the wording is a one-file
// swap when the coverage changes (批次 3/4).

import { Card, Typography } from "@heroui/react";

export function ScopeNote({ text }: { text: string }) {
  return (
    <Card className="p-4">
      <Card.Content>
        <Typography color="muted" type="body-xs">
          {text}
        </Typography>
      </Card.Content>
    </Card>
  );
}
