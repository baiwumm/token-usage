import type { SessionModelUsage } from "@/lib/sessions";

import { Chip, Typography } from "@heroui/react";

import { ModelIcon } from "@/components/model-icon";

export function sortedModels(models: SessionModelUsage[]): SessionModelUsage[] {
  return [...models].sort(
    (first, second) =>
      second.totalTokens - first.totalTokens ||
      first.model.localeCompare(second.model),
  );
}

/** Session models as chips, biggest first: three named, the rest a `+N`. */
export function ModelChips({ models }: { models: SessionModelUsage[] }) {
  if (models.length === 0) {
    return (
      <Typography className="text-muted" type="body-xs">
        —
      </Typography>
    );
  }
  const ordered = sortedModels(models);

  return (
    <div className="flex flex-wrap gap-1">
      {ordered.slice(0, 3).map((model) => (
        <Chip key={model.model} className="max-w-40" size="sm" variant="soft">
          <ModelIcon model={model.model} size={12} />
          <span className="truncate">{model.model}</span>
        </Chip>
      ))}
      {ordered.length > 3 ? (
        <Chip size="sm" variant="soft">
          +{ordered.length - 3}
        </Chip>
      ) : null}
    </div>
  );
}
