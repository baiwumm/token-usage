import { ArrowUpRightFromSquare } from "@gravity-ui/icons";
import { Button, Card, Typography } from "@heroui/react";

/** Loading / error / no-CLI / empty states for the monitor window. */

export function MonitorSkeleton() {
  return (
    <div aria-hidden="true" className="flex min-h-screen flex-col gap-4 p-4">
      <div className="h-8 w-40 animate-pulse rounded-xl bg-default" />
      <div className="grid grid-cols-3 gap-3">
        <div className="h-20 animate-pulse rounded-2xl bg-default" />
        <div className="h-20 animate-pulse rounded-2xl bg-default" />
        <div className="h-20 animate-pulse rounded-2xl bg-default" />
      </div>
      <div className="h-28 animate-pulse rounded-2xl bg-default" />
      <div className="h-32 animate-pulse rounded-2xl bg-default" />
    </div>
  );
}

export function MonitorErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
      <Typography type="h6" weight="semibold">
        本地数据读取失败
      </Typography>
      <Typography className="text-muted" type="body">
        {message}
      </Typography>
      <Button variant="secondary" onPress={onRetry}>
        重试
      </Button>
    </main>
  );
}

export function NoCliState({ onOpenGuide }: { onOpenGuide: () => void }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
      <Typography type="h6" weight="semibold">
        未检测到 tokenusage-cli
      </Typography>
      <Typography className="text-muted" type="body">
        桌面端只负责监控与操作，采集由 tokenusage-cli 完成。 先安装并配对：npm i
        -g tokenusage-cli → tokenusage init
      </Typography>
      <Button variant="secondary" onPress={onOpenGuide}>
        <ArrowUpRightFromSquare
          aria-hidden="true"
          className="size-4 shrink-0"
        />
        打开安装指南
      </Button>
    </main>
  );
}

export function MonitorEmptyState() {
  return (
    <Card className="border-border">
      <Card.Header>
        <Card.Title>尚无采集数据</Card.Title>
        <Card.Description>
          CLI 已就绪但本地还没有用量记录——等待第一轮采集，或在终端跑一次
          `tokenusage sync`。
        </Card.Description>
      </Card.Header>
    </Card>
  );
}
