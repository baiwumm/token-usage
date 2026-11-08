import { Card, Typography } from "@heroui/react";

/**
 * D1 placeholder shell for the monitor window: brand lockup plus a card
 * describing what lands in D2 (本机采集视角的实时监控台). Real monitor
 * sections (sync status strip, source mix, CLI action bar) replace this in
 * `components/monitor/` per docs/desktop-plan.md §8.
 */
export function App() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <div className="flex items-center gap-2.5">
        <span aria-hidden="true" className="grid size-9 shrink-0 select-none">
          <img
            alt=""
            className="col-start-1 row-start-1 size-9 rounded-lg dark:hidden"
            height={36}
            src="/logo.svg"
            width={36}
          />
          <img
            alt=""
            className="col-start-1 row-start-1 hidden size-9 rounded-lg dark:block"
            height={36}
            src="/logo-dark.svg"
            width={36}
          />
        </span>
        <Typography type="h5" weight="semibold">
          Token Usage
        </Typography>
      </div>
      <Card className="w-full max-w-sm">
        <Card.Header>
          <Card.Title>桌面端监控盘</Card.Title>
          <Card.Description>
            本机采集视角的实时监控台 + CLI 操作台（D2 到位）
          </Card.Description>
        </Card.Header>
        <Typography className="text-muted" type="body">
          采集与上传由 tokenusage-cli 负责，桌面端只读本地数据；
          托盘已常驻，关闭窗口即最小化到托盘。
        </Typography>
      </Card>
    </main>
  );
}
