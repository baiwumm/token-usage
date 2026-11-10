import type { ProjectUsage } from "@/lib/queue-lines";

import { ArrowUpRightFromSquare, LogoGithub } from "@gravity-ui/icons";
import { Button, Card, Typography } from "@heroui/react";
import { useMemo } from "react";

import { formatTokens } from "@/lib/format-tokens";

interface ProjectReposCardProps {
  projects: ProjectUsage[];
  attributedTokens: number;
  totalTokens: number;
  repoUrls: Record<string, string>;
  periodLabel: string;
  /** Paired web `/projects` URL, or null when the instance is unknown. */
  projectsUrl: string | null;
  onOpenUrl: (url: string) => void;
}

const MAX_ROWS = 5;

function attributionLabel(attributed: number, total: number): string {
  if (total <= 0) return "窗口内暂无归因";

  const share = Math.round((attributed / total) * 100);

  return attributed >= total ? "已全部归因" : `已归因 ${share}% · 其余未归因`;
}

/**
 * Top projects for the selected period. A project with a confirmed repository
 * becomes an external link (GitHub mark + key, opened in the OS browser); one
 * without stays plain text — the desktop never infers a URL (§12.2). The
 * footer shows attribution coverage so the list is not mistaken for the whole
 * window: rows without a project key remain in the residual.
 */
export function ProjectReposCard({
  projects,
  attributedTokens,
  totalTokens,
  repoUrls,
  periodLabel,
  projectsUrl,
  onOpenUrl,
}: ProjectReposCardProps) {
  const ranked = useMemo(
    () => projects.filter((project) => project.tokens > 0).slice(0, MAX_ROWS),
    [projects],
  );

  return (
    <Card className="border-border">
      <Card.Header>
        <Card.Title>项目与仓库</Card.Title>
        <Card.Description>{periodLabel}</Card.Description>
      </Card.Header>
      <Card.Content>
        {ranked.length === 0 ? (
          <Typography className="text-muted" type="body">
            窗口内暂无项目归因
          </Typography>
        ) : (
          <ul className="flex flex-col gap-2">
            {ranked.map((project) => {
              const repoUrl = repoUrls[project.projectKey] ?? null;

              return (
                <li key={project.projectKey} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-2">
                    {repoUrl ? (
                      <button
                        className="flex min-w-0 items-center gap-1.5 text-left text-xs text-accent hover:underline"
                        title={repoUrl}
                        type="button"
                        onClick={() => onOpenUrl(repoUrl)}
                      >
                        <LogoGithub className="size-3.5 shrink-0" />
                        <span className="truncate">{project.projectKey}</span>
                      </button>
                    ) : (
                      <span
                        className="min-w-0 truncate text-xs text-foreground"
                        title={project.projectKey}
                      >
                        {project.projectKey}
                      </span>
                    )}
                    <span className="shrink-0 text-xs text-muted tabular-nums">
                      {formatTokens(project.tokens)} ·{" "}
                      {(project.share * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div
                    aria-hidden="true"
                    className="h-1.5 w-full overflow-hidden rounded-full bg-default"
                  >
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${Math.max(project.share * 100, 2)}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card.Content>
      <Card.Footer className="justify-between gap-2">
        <Typography className="text-muted text-xs" type="body-xs">
          {attributionLabel(attributedTokens, totalTokens)}
        </Typography>
        {projectsUrl ? (
          <Button
            className="-mr-2 shrink-0 text-xs"
            size="sm"
            variant="ghost"
            onPress={() => onOpenUrl(projectsUrl)}
          >
            在 web 查看
            <ArrowUpRightFromSquare className="size-3" />
          </Button>
        ) : null}
      </Card.Footer>
    </Card>
  );
}
