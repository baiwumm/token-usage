import type { FirstSyncPhase } from "@/hooks/use-pairing";
import type { CliStatus } from "@/lib/monitor";
import type { LoginPhase } from "@/lib/pairing";
import type { ThemeMode } from "@/lib/preferences";

import { Button, Typography } from "@heroui/react";

import { MonitorHeader } from "@/components/monitor/monitor-header";
import { InstallStepCard } from "@/components/pairing/install-step-card";
import { PairStepCard } from "@/components/pairing/pair-step-card";
import { SyncStepCard } from "@/components/pairing/sync-step-card";

interface PairingBodyProps {
  paused: boolean;
  theme: ThemeMode;
  onChangeTheme: (mode: ThemeMode) => void;
  onOpenSettings: () => void;
  cli: CliStatus;
  /** CLI probe or `status --json` re-check in flight. */
  checking: boolean;
  rechecking: boolean;
  login: LoginPhase;
  firstSync: FirstSyncPhase;
  onRecheckCli: () => void;
  onRecheckPairing: () => void;
  onOpenGuide: () => void;
  onStartLogin: () => void;
  onCancelLogin: () => void;
  onReopenBrowser: () => void;
  onRetrySync: () => void;
  onFinish: () => void;
  onSkip: () => void;
}

/**
 * First-run wizard (desktop-plan D3): install the CLI → approve this machine
 * in the browser → first sync. Every step shells out to the CLI; the wizard
 * only sequences them and shows what they report.
 */
export function PairingBody({
  paused,
  theme,
  onChangeTheme,
  onOpenSettings,
  cli,
  checking,
  rechecking,
  login,
  firstSync,
  onRecheckCli,
  onRecheckPairing,
  onOpenGuide,
  onStartLogin,
  onCancelLogin,
  onReopenBrowser,
  onRetrySync,
  onFinish,
  onSkip,
}: PairingBodyProps) {
  const approved = login.kind === "approved";
  // Skipping mid-flow would strand a live pairing code; after approval the
  // exit is the sync step's 进入监控台.
  const canSkip = login.kind === "idle" || login.kind === "failed";

  return (
    <main className="flex min-h-screen flex-col gap-4 p-4">
      <MonitorHeader
        paused={paused}
        theme={theme}
        onChangeTheme={onChangeTheme}
        onOpenSettings={onOpenSettings}
      />
      <div className="flex flex-col gap-1">
        <Typography type="h6" weight="semibold">
          接入这台机器
        </Typography>
        <Typography className="text-muted" type="body">
          三步把本机的 AI 用量接入你的 Token Usage 实例。
        </Typography>
      </div>
      <InstallStepCard
        checking={checking}
        cliAvailable={cli.available}
        cliVersion={cli.version}
        onOpenGuide={onOpenGuide}
        onRecheck={onRecheckCli}
      />
      <PairStepCard
        enabled={cli.available}
        login={login}
        rechecking={rechecking}
        onCancel={onCancelLogin}
        onRecheck={onRecheckPairing}
        onReopen={onReopenBrowser}
        onStart={onStartLogin}
      />
      <SyncStepCard
        approved={approved}
        firstSync={firstSync}
        onFinish={onFinish}
        onRetry={onRetrySync}
      />
      {canSkip ? (
        <Button
          className="self-center"
          size="sm"
          variant="ghost"
          onPress={onSkip}
        >
          稍后再说，先看本机数据
        </Button>
      ) : null}
    </main>
  );
}
