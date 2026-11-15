import { Alert } from "@heroui/react";

/**
 * Capacity-wall notice (2026-11-15): queue.jsonl is the last-wins reconcile
 * baseline and grows forever; once it passes the 8 MiB whole-read cap the
 * monitor aggregates only the newest 2 MiB tail, so whole-history figures
 * (总计) become lower bounds. Rendered above the usage stack — the data shown
 * is still correct for the recent windows, it is the boundary that moved.
 */
export function QueuePartialNote() {
  return (
    <Alert status="warning">
      <Alert.Indicator />
      <Alert.Content className="min-w-0">
        <Alert.Title>队列文件已超过读取上限，当前为部分视图</Alert.Title>
        <Alert.Description>
          队列基线超过 8 MiB 整读上限，本页仅聚合最近 2 MiB
          的队列数据（总计口径偏小，最近窗口不受影响）。完整对账请运行{" "}
          <code className="font-mono">tokenusage reconcile</code>。
        </Alert.Description>
      </Alert.Content>
    </Alert>
  );
}
