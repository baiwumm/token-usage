import type { RecentSession } from "@/lib/recent-sessions";

import { Card, Typography } from "@heroui/react";

import { ModelIcon } from "@/components/model-icon";
import { formatRelativeTime, formatTokens } from "@/lib/format-tokens";

interface RecentSessionsCardProps {
  sessions: RecentSession[];
  /** Snapshot time — keeps every row's relative stamp on one clock. */
  nowMs: number;
}

/**
 * Newest sessions from the local sidecar (desktop-plan §12.4). Metadata only:
 * time, model, project basename and tokens — the sidecar's title, prompt and
 * absolute project path never reach this card (privacy boundary 5).
 */
export function RecentSessionsCard({
  sessions,
  nowMs,
}: RecentSessionsCardProps) {
  return (
    <Card className="border-border">
      <Card.Header>
        <Card.Title>最近会话</Card.Title>
        <Card.Description>仅本地元数据 · 最新 5 条</Card.Description>
      </Card.Header>
      <Card.Content>
        {sessions.length === 0 ? (
          <Typography className="text-muted" type="body">
            暂无会话记录
          </Typography>
        ) : (
          <ul className="flex flex-col gap-2">
            {sessions.map((session) => (
              <li key={session.id} className="flex flex-col gap-0.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <ModelIcon model={session.model} size={16} />
                    <span
                      className="truncate text-xs text-foreground"
                      title={session.model}
                    >
                      {session.model}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted tabular-nums">
                    {formatTokens(session.tokens)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 text-xs text-muted">
                  <span className="truncate">
                    {session.projectKey || "未归因"}
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {formatRelativeTime(session.endedAt, nowMs)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card.Content>
    </Card>
  );
}
