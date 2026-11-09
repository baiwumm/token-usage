import type { LoginPhase } from "@/lib/pairing";

import { ArrowUpRightFromSquare, Check, Copy } from "@gravity-ui/icons";
import { Alert, Button, Card, Spinner, Typography } from "@heroui/react";
import { useEffect, useState } from "react";

import { StepIcon, type StepState } from "@/components/pairing/step-icon";
import { PendingButton } from "@/components/pending-button";
import { useCopy } from "@/hooks/use-copy";
import { formatCountdown } from "@/lib/pairing";

interface PairStepCardProps {
  /** CLI reachable — pairing is a CLI subcommand. */
  enabled: boolean;
  login: LoginPhase;
  /** Authoritative `status --json` re-check in flight. */
  rechecking: boolean;
  onStart: () => void;
  onCancel: () => void;
  onReopen: () => void;
  /** Paired from a terminal meanwhile? Re-ask the CLI. */
  onRecheck: () => void;
}

/** Remaining ms until `expiresAtMs`, ticking once a second (null = no expiry). */
function useRemainingMs(expiresAtMs: number | null): number | null {
  const [remainingMs, setRemainingMs] = useState<number | null>(null);

  useEffect(() => {
    if (expiresAtMs === null) {
      setRemainingMs(null);

      return;
    }
    const tick = () => setRemainingMs(expiresAtMs - Date.now());

    tick();
    const timer = window.setInterval(tick, 1_000);

    return () => {
      window.clearInterval(timer);
    };
  }, [expiresAtMs]);

  return remainingMs;
}

function stepState(enabled: boolean, login: LoginPhase): StepState {
  if (login.kind === "approved") return "done";

  return enabled ? "active" : "todo";
}

function description(login: LoginPhase): string {
  switch (login.kind) {
    case "starting":
      return "正在向实例申请配对码…";
    case "waiting":
      return login.code
        ? "已在浏览器打开批准页，登录后核对并批准下面的配对码："
        : "正在向实例申请配对码…";
    case "approved":
      return "已批准，设备令牌已由 CLI 写入本机配置。";
    default:
      return "在浏览器里批准这台机器。设备令牌由 CLI 写入本机，桌面端全程不经手。";
  }
}

/** Step 2: `tokenusage device-login` driven through the bridge, approved in the browser. */
export function PairStepCard({
  enabled,
  login,
  rechecking,
  onStart,
  onCancel,
  onReopen,
  onRecheck,
}: PairStepCardProps) {
  const { copied, copy } = useCopy();
  const waiting = login.kind === "waiting" ? login : null;
  const remainingMs = useRemainingMs(waiting?.expiresAtMs ?? null);
  const inFlight = login.kind === "starting" || login.kind === "waiting";

  return (
    <Card className="border-border">
      <Card.Header>
        <Card.Title className="flex items-center gap-2">
          <StepIcon index={2} state={stepState(enabled, login)} />
          配对设备
        </Card.Title>
        <Card.Description>{description(login)}</Card.Description>
      </Card.Header>
      {waiting?.code ? (
        <Card.Content className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-1">
            <Typography
              aria-label={`配对码 ${waiting.code.userCode}`}
              className="px-3! py-1.5! text-2xl! font-semibold tracking-widest select-text"
              type="code"
            >
              {waiting.code.userCode}
            </Typography>
            <Button
              isIconOnly
              aria-label={copied ? "已复制" : "复制配对码"}
              size="sm"
              variant="ghost"
              onPress={() => void copy(waiting.code?.userCode ?? "")}
            >
              {copied ? (
                <Check aria-hidden="true" className="size-4 text-success" />
              ) : (
                <Copy aria-hidden="true" className="size-4" />
              )}
            </Button>
          </div>
          <Typography
            className="flex items-center gap-1.5 tabular-nums"
            color="muted"
            type="body-sm"
          >
            <Spinner aria-hidden="true" color="current" size="sm" />
            等待批准
            {remainingMs !== null
              ? ` · 剩余 ${formatCountdown(remainingMs)}`
              : ""}
          </Typography>
        </Card.Content>
      ) : null}
      {login.kind === "failed" ? (
        <Card.Content>
          <Alert status="danger">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>配对未完成</Alert.Title>
              <Alert.Description>{login.message}</Alert.Description>
            </Alert.Content>
          </Alert>
        </Card.Content>
      ) : null}
      {login.kind === "approved" ? null : (
        <Card.Footer className="flex flex-wrap gap-2">
          {inFlight ? (
            <>
              {waiting?.code ? (
                <Button size="sm" variant="secondary" onPress={onReopen}>
                  <ArrowUpRightFromSquare
                    aria-hidden="true"
                    className="size-4 shrink-0"
                  />
                  重新打开批准页
                </Button>
              ) : (
                <PendingButton pending size="sm" variant="secondary">
                  申请中
                </PendingButton>
              )}
              <Button size="sm" variant="ghost" onPress={onCancel}>
                取消
              </Button>
            </>
          ) : (
            <>
              <Button
                isDisabled={!enabled || rechecking}
                size="sm"
                onPress={onStart}
              >
                {login.kind === "failed" ? "重新配对" : "开始配对"}
              </Button>
              <PendingButton
                isDisabled={!enabled}
                pending={rechecking}
                size="sm"
                variant="tertiary"
                onPress={onRecheck}
              >
                已配对？重新检测
              </PendingButton>
            </>
          )}
        </Card.Footer>
      )}
    </Card>
  );
}
