"use client";

import type { SessionModel } from "@/lib/dashboard/api";

import { Chip, Typography } from "@heroui/react";

import { SourceIcon } from "@/components/dashboard/source-icon";
import { formatMessage } from "@/lib/copy/message";
import { useLocale } from "@/lib/copy/locale";
import { SESSIONS_COPY } from "@/lib/copy/sessions";

export function sortedModels(models: SessionModel[]): SessionModel[] {
  return [...models].sort(
    (first, second) =>
      second.total_tokens - first.total_tokens ||
      first.model.localeCompare(second.model),
  );
}

// Session models as chips, biggest first; the first three are named and the
// rest collapse into a "+N" chip (docs/ui-spec.md Sessions).
export function ModelChips({ models }: { models: SessionModel[] }) {
  const [locale] = useLocale();
  const copy = SESSIONS_COPY[locale];

  if (models.length === 0) {
    return (
      <Typography color="muted" type="body-xs">
        —
      </Typography>
    );
  }
  const ordered = sortedModels(models);

  return (
    <div className="flex flex-wrap gap-1">
      {ordered.slice(0, 3).map((model) => (
        <Chip key={model.model} className="max-w-40" size="sm" variant="soft">
          <SourceIcon label={model.model} size={12} />
          <span className="truncate">{model.model}</span>
        </Chip>
      ))}
      {ordered.length > 3 ? (
        <Chip size="sm" variant="soft">
          {formatMessage(copy.list.moreModels, locale, {
            count: ordered.length - 3,
          })}
        </Chip>
      ) : null}
    </div>
  );
}
