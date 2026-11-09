import { ArrowUpRightFromSquare, Check, Copy } from "@gravity-ui/icons";
import { Button, Card, Typography } from "@heroui/react";

import { StepIcon } from "@/components/pairing/step-icon";
import { PendingButton } from "@/components/pending-button";
import { useCopy } from "@/hooks/use-copy";
import { INSTALL_COMMAND } from "@/lib/pairing";

interface InstallStepCardProps {
  cliAvailable: boolean;
  cliVersion: string | null;
  checking: boolean;
  onRecheck: () => void;
  onOpenGuide: () => void;
}

/** Step 1: tokenusage-cli reachable on PATH — the collector the desktop fronts. */
export function InstallStepCard({
  cliAvailable,
  cliVersion,
  checking,
  onRecheck,
  onOpenGuide,
}: InstallStepCardProps) {
  const { copied, copy } = useCopy();

  return (
    <Card className="border-border">
      <Card.Header>
        <Card.Title className="flex items-center gap-2">
          <StepIcon index={1} state={cliAvailable ? "done" : "active"} />
          安装 CLI
        </Card.Title>
        <Card.Description>
          {cliAvailable
            ? `已检测到 tokenusage-cli${cliVersion ? ` ${cliVersion}` : ""}`
            : "采集与上传由 tokenusage-cli 完成，桌面端只是它的监控台。在终端执行："}
        </Card.Description>
      </Card.Header>
      {cliAvailable ? null : (
        <>
          <Card.Content>
            <div className="flex items-center gap-2">
              <Typography
                className="min-w-0 flex-1 truncate py-1.5! select-text"
                type="code"
              >
                {INSTALL_COMMAND}
              </Typography>
              <Button
                isIconOnly
                aria-label={copied ? "已复制" : "复制安装命令"}
                size="sm"
                variant="ghost"
                onPress={() => void copy(INSTALL_COMMAND)}
              >
                {copied ? (
                  <Check aria-hidden="true" className="size-4 text-success" />
                ) : (
                  <Copy aria-hidden="true" className="size-4" />
                )}
              </Button>
            </div>
          </Card.Content>
          <Card.Footer className="flex flex-wrap gap-2">
            <PendingButton pending={checking} size="sm" onPress={onRecheck}>
              装好了，重新检测
            </PendingButton>
            <Button size="sm" variant="tertiary" onPress={onOpenGuide}>
              <ArrowUpRightFromSquare
                aria-hidden="true"
                className="size-4 shrink-0"
              />
              安装指南
            </Button>
          </Card.Footer>
        </>
      )}
    </Card>
  );
}
