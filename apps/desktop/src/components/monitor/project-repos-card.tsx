import type { ProjectRepoUsage } from "@/lib/project-repos";
import type { QueueBucketRow } from "@/lib/queue-lines";
import type { ProjectProfile } from "@/lib/project-profiles";

import { ArrowUpRightFromSquare, LogoGithub } from "@gravity-ui/icons";
import { Button, Card, Typography } from "@heroui/react";
import { useMemo, useState } from "react";

import { ProjectDetailDialog } from "@/components/monitor/project-detail-dialog";
import { ProjectLogo } from "@/components/monitor/project-logo";
import { SourceIcon } from "@/components/source-icon";
import { buildProjectDetail } from "@/lib/project-detail";
import {
  formatCost,
  formatNumber,
  formatPercent,
  formatRelativeTime,
  formatTokens,
} from "@/lib/format-tokens";
import { profileLogoUrls } from "@/lib/project-profiles";
import { canonicalSource } from "@/lib/source-logos";

const MAX_ROWS = 5;
const SOURCE_ICON_LIMIT = 5;

function attributionLabel(attributed: number, total: number): string {
  if (total <= 0) return "窗口内暂无归因";

  const share = Math.round((attributed / total) * 100);

  return attributed >= total ? "已全部归因" : `已归因 ${share}% · 其余未归因`;
}

/** Profile for a repo-merged row: the display key first, then any member. */
function profileOf(
  profiles: Map<string, ProjectProfile>,
  project: ProjectRepoUsage,
): ProjectProfile | null {
  return (
    profiles.get(project.projectKey) ??
    project.memberKeys
      .map((key) => profiles.get(key))
      .find((entry) => entry !== undefined) ??
    null
  );
}

interface ProjectReposCardProps {
  projects: ProjectRepoUsage[];
  attributedTokens: number;
  totalTokens: number;
  /** Paired web `/projects` URL, or null when the instance is unknown. */
  projectsUrl: string | null;
  /** Deduped rows + window bounds for the detail drill-down. */
  rows: QueueBucketRow[];
  windowStartMs: number;
  nowMs: number;
  /** Web-edited project profiles (D10.1), keyed by project_key. */
  profiles: Map<string, ProjectProfile>;
  /** Selected period label for the detail header (今日 / 7D / 30D / 总计). */
  periodLabel: string;
  onOpenUrl: (url: string) => void;
}

/**
 * 项目与仓库 card (web /projects 列表行同款移植): high-density rows — brand
 * tile + name + repo mark, 占窗口 caption + source icon strip, tokens with a
 * relative meter, and a 成本 · 会话条目 · 最近活跃 hairline strip. Clicking a
 * row opens the detail dialog (KPI / daily bars / composition / sources),
 * folded on demand from the same deduped rows. A row with a confirmed
 * repository opens it from the detail header; the desktop never infers a URL.
 */
export function ProjectReposCard({
  projects,
  attributedTokens,
  totalTokens,
  projectsUrl,
  rows,
  windowStartMs,
  nowMs,
  profiles,
  periodLabel,
  onOpenUrl,
}: ProjectReposCardProps) {
  const [selected, setSelected] = useState<ProjectRepoUsage | null>(null);
  const ranked = useMemo(
    () => projects.filter((project) => project.tokens > 0).slice(0, MAX_ROWS),
    [projects],
  );
  const maxTokens = useMemo(
    () => ranked.reduce((max, project) => Math.max(max, project.tokens), 0),
    [ranked],
  );
  const detail = useMemo(
    () =>
      selected
        ? buildProjectDetail(rows, selected.memberKeys, windowStartMs, nowMs)
        : null,
    [nowMs, rows, selected, windowStartMs],
  );

  return (
    <Card className="border-border">
      <Card.Header>
        <Card.Title>项目与仓库</Card.Title>
      </Card.Header>
      <Card.Content>
        {ranked.length === 0 ? (
          <Typography className="text-muted" type="body">
            窗口内暂无项目归因
          </Typography>
        ) : (
          <div className="flex flex-col gap-1">
            {ranked.map((project) => {
              // Web-edited identity wins over the queue key (D10.1).
              const profile = profileOf(profiles, project);
              const displayName = profile?.display_name ?? project.projectKey;
              const logoUrls = profileLogoUrls(profile);
              const repoUrl = profile?.repo_url ?? project.repoUrl;
              // The strip is a brand list: alias ids of one vendor render once.
              const canonicalSources = Object.entries(project.sourceTokens)
                .sort((first, second) => second[1] - first[1])
                .reduce<string[]>((ids, [source]) => {
                  const id = canonicalSource(source);

                  if (!ids.includes(id)) ids.push(id);

                  return ids;
                }, []);
              const visibleSources = canonicalSources.slice(
                0,
                SOURCE_ICON_LIMIT,
              );
              const overflow = canonicalSources.length - visibleSources.length;
              const meterPct =
                maxTokens > 0 && project.tokens > 0
                  ? Math.min(
                      100,
                      Math.max(2, (project.tokens / maxTokens) * 100),
                    )
                  : 0;

              return (
                <Button
                  key={project.projectKey}
                  aria-label={`查看 ${project.projectKey} 详情`}
                  className="h-auto! min-h-0! w-full justify-start rounded-2xl! p-0! text-start hover:bg-default/60"
                  variant="ghost"
                  onPress={() => setSelected(project)}
                >
                  <span className="flex w-full flex-col">
                    <span className="flex w-full items-start justify-between gap-3 px-3 py-2.5">
                      <span className="flex min-w-0 items-center gap-3">
                        <ProjectLogo
                          className="size-8 rounded-[8px] text-sm"
                          dimension={32}
                          name={displayName}
                          urls={logoUrls}
                        />
                        <span className="flex min-w-0 flex-col gap-1">
                          <span className="flex min-w-0 items-center gap-1.5">
                            <Typography
                              className="block max-w-56 truncate md:max-w-80"
                              type="body-sm"
                              weight="semibold"
                            >
                              <span className="truncate" title={displayName}>
                                {displayName}
                              </span>
                            </Typography>
                            {repoUrl ? (
                              <span
                                aria-label="已确认仓库"
                                className="text-muted inline-flex shrink-0"
                                role="img"
                                title={repoUrl}
                              >
                                <LogoGithub className="size-3.5" />
                              </span>
                            ) : null}
                          </span>
                          <span className="flex min-h-4 items-center gap-1">
                            <Typography color="muted" type="body-xs">
                              占窗口 {formatPercent(project.share)}
                            </Typography>
                            {visibleSources.map((source) => (
                              <SourceIcon
                                key={source}
                                size={12}
                                source={source}
                              />
                            ))}
                            {overflow > 0 ? (
                              <Typography color="muted" type="body-xs">
                                +{overflow}
                              </Typography>
                            ) : null}
                          </span>
                        </span>
                      </span>
                      <span className="flex w-24 shrink-0 flex-col items-end gap-2">
                        <Typography
                          className="tabular-nums"
                          type="body-sm"
                          weight="semibold"
                        >
                          {formatTokens(project.tokens)}
                        </Typography>
                        <span
                          aria-hidden="true"
                          className="bg-default/60 relative block h-1 w-full overflow-hidden rounded-full"
                          title="相对最大项目"
                        >
                          <span
                            className="bg-accent absolute inset-y-0 start-0 rounded-full"
                            style={{ width: `${meterPct}%` }}
                          />
                        </span>
                      </span>
                    </span>
                    <span className="border-border/60 text-muted flex w-full flex-wrap items-center gap-x-3 gap-y-0.5 border-t px-3 py-1.5 text-xs">
                      <span className="tabular-nums">
                        成本 {formatCost(project.totalCostUsd)}
                      </span>
                      <span className="tabular-nums">
                        会话条目 {formatNumber(project.conversations)}
                      </span>
                      {project.lastActiveMs !== null ? (
                        <span className="hidden tabular-nums sm:inline">
                          最近活跃{" "}
                          {formatRelativeTime(
                            new Date(project.lastActiveMs).toISOString(),
                            nowMs,
                          )}
                        </span>
                      ) : null}
                    </span>
                  </span>
                </Button>
              );
            })}
          </div>
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
      <ProjectDetailDialog
        detail={detail}
        displayName={
          selected
            ? (profileOf(profiles, selected)?.display_name ?? null)
            : null
        }
        logoUrls={
          selected ? profileLogoUrls(profileOf(profiles, selected)) : []
        }
        open={selected !== null}
        periodLabel={periodLabel}
        projectName={selected?.projectKey ?? ""}
        repoUrl={
          selected
            ? (profileOf(profiles, selected)?.repo_url ?? selected.repoUrl)
            : null
        }
        windowShare={selected?.share ?? 0}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        onOpenUrl={onOpenUrl}
      />
    </Card>
  );
}
