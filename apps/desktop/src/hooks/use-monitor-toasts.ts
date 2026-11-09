// Chinese feedback for the two states the panel otherwise leaves unspoken:
// the startup CLI probe (every action button is disabled until it resolves)
// and each finished CLI run. The English CLI tail stays in the actions card —
// these toasts are the human summary, not a replacement for it.

import type { CliRunOutcome } from "@/hooks/use-monitor";
import type { CliStatus } from "@/lib/monitor";

import { toast } from "@heroui/react";
import { useEffect, useRef } from "react";

const ACTION_LABELS: Record<string, string> = {
  sync: "同步",
  doctor: "Doctor 自检",
  reconcile: "对账",
  pause: "暂停采集",
  resume: "恢复采集",
};

type OutcomeTone = "success" | "danger" | "neutral";

function actionLabel(command: string): string {
  return ACTION_LABELS[command] ?? command;
}

// The CLI's own wording stays authoritative; these are readable summaries of
// the cases the desktop already treats specially (skipped sync, a schedule
// toggle that the process may not have the rights to flip).
function describeOutcome(outcome: CliRunOutcome): {
  text: string;
  tone: OutcomeTone;
} {
  const label = actionLabel(outcome.command);

  if (!outcome.resolved) {
    return {
      text: `${label}未能启动：本地 CLI 不可用或调用被拒绝`,
      tone: "danger",
    };
  }
  if (outcome.exitCode !== 0) {
    return {
      text: `${label}失败（exit ${outcome.exitCode ?? "signal"}），详情见下方 CLI 输出`,
      tone: "danger",
    };
  }
  if (/Sync skipped/i.test(outcome.outputTail)) {
    return { text: "本次同步已跳过：另一个同步正在运行", tone: "neutral" };
  }
  if (
    outcome.command === "pause" &&
    /could not be disabled/i.test(outcome.outputTail)
  ) {
    return {
      text: "采集已暂停；计划任务未能关闭（权限不足），暂停标志仍然生效",
      tone: "neutral",
    };
  }
  if (outcome.command === "pause") {
    return { text: "采集已暂停，自动同步不会再上传", tone: "success" };
  }
  if (outcome.command === "resume") {
    return { text: "采集已恢复，自动同步重新生效", tone: "success" };
  }

  return { text: `${label}完成`, tone: "success" };
}

export interface MonitorToastsInput {
  cli: CliStatus;
  /** False while the first `--version` probe is still in flight. */
  cliResolved: boolean;
  lastOutcome: CliRunOutcome | null;
}

/**
 * Startup probe → one toast that explains why the action buttons start
 * disabled, flipped to the probe's answer. Every finished CLI run → one
 * summary toast. Both are fire-and-forget; failures never block the panel.
 */
export function useMonitorToasts({
  cli,
  cliResolved,
  lastOutcome,
}: MonitorToastsInput) {
  const probeToast = useRef<string | null>(null);
  const seenOutcome = useRef<CliRunOutcome | null>(null);

  useEffect(() => {
    if (probeToast.current !== null) return;
    probeToast.current = toast("正在检测本地 tokenusage-cli……", {
      isLoading: true,
      timeout: 0,
    });
  }, []);

  useEffect(() => {
    const id = probeToast.current;

    if (id === null || !cliResolved) return;
    probeToast.current = null;

    if (cli.available) {
      toast.update(id, `tokenusage-cli ${cli.version ?? ""} 已就绪`.trim(), {
        isLoading: false,
        timeout: 2500,
        variant: "success",
      });

      return;
    }

    toast.update(
      id,
      "未检测到 tokenusage-cli：采集操作已禁用，安装 CLI 后可点「已配对？重新检测」或重启应用",
      { isLoading: false, timeout: 8000, variant: "danger" },
    );
  }, [cli.available, cli.version, cliResolved]);

  useEffect(() => {
    if (lastOutcome === null || lastOutcome === seenOutcome.current) return;
    seenOutcome.current = lastOutcome;
    const { text, tone } = describeOutcome(lastOutcome);

    if (tone === "success") toast.success(text);
    else if (tone === "danger") toast.danger(text);
    else toast(text);
  }, [lastOutcome]);
}
