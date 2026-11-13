// D4 settings: notification switches + thresholds, quiet hours, autostart,
// card visibility (0.4.1 multi-select) and the four local display-format
// preferences. Everything maps 1:1 to `lib/preferences.ts`; the pure decision
// rules in `lib/notifications.ts` read the same fields, so the dialog never
// has to explain behavior the scheduler does not implement.

import type { UpdaterState } from "@/hooks/use-updater";
import type { ReactNode } from "react";

import { invoke } from "@tauri-apps/api/core";
import { FileText, Folder } from "@gravity-ui/icons";
import {
  Button,
  Chip,
  Description,
  Label,
  ListBox,
  Modal,
  Popover,
  Select,
  Separator,
  Switch,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  toast,
} from "@heroui/react";

import { PendingButton } from "@/components/pending-button";
import {
  BUILT_IN_FX,
  SUPPORTED_CURRENCIES,
  currencyLabel,
  formatFxRate,
  type CurrencyCode,
  type TokenDisplay,
  type TokenGrouping,
  type TokenUnit,
} from "@/lib/display-format";
import { formatBytes } from "@/lib/format-tokens";
import {
  BACKLOG_BYTES_OPTIONS,
  FAILURE_THRESHOLD_OPTIONS,
  formatHour,
  type Preferences,
} from "@/lib/preferences";

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

/** Card order mirrors the monitor stack (monitor-body.tsx 0.4.1). */
const CARD_OPTIONS = [
  { id: "showHeatmap", label: "活跃热力图" },
  { id: "showTrend", label: "用量趋势" },
  { id: "showModels", label: "Top 模型" },
  { id: "showSources", label: "来源构成" },
  { id: "showProjects", label: "项目与仓库" },
] as const;

/**
 * Autostart writes HKCU\…\Run, which a process of lower integrity than the
 * session cannot touch (E_ACCESSDENIED) — the same wall the CLI hits when it
 * writes tracker files. Name the cause instead of echoing the raw HRESULT.
 */
function describeAutostartError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  if (/拒绝访问|access is denied|0x80070005|-2147024891/i.test(message)) {
    return "开机自启未开启：系统拒绝写入启动项（本应用权限或完整性级别低于登录会话）";
  }

  return `开机自启设置失败：${message}`;
}

function HourSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (hour: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Typography color="muted" type="body-sm">
        {label}
      </Typography>
      <Select
        aria-label={label}
        className="w-28"
        value={String(value)}
        variant="secondary"
        onChange={(key) => {
          if (key == null) return;
          onChange(Number(key));
        }}
      >
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <Popover.Arrow />
          <ListBox>
            {HOURS.map((hour) => (
              <ListBox.Item
                key={String(hour)}
                id={String(hour)}
                textValue={formatHour(hour)}
              >
                {formatHour(hour)}
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>
    </div>
  );
}

function NumberSelect({
  label,
  value,
  options,
  render,
  onChange,
}: {
  label: string;
  value: number;
  options: readonly number[];
  render: (value: number) => string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Typography color="muted" type="body-sm">
        {label}
      </Typography>
      <Select
        aria-label={label}
        className="w-28"
        value={String(value)}
        variant="secondary"
        onChange={(key) => {
          if (key == null) return;
          onChange(Number(key));
        }}
      >
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <Popover.Arrow />
          <ListBox>
            {options.map((option) => (
              <ListBox.Item
                key={String(option)}
                id={String(option)}
                textValue={render(option)}
              >
                {render(option)}
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  isSelected,
  onChange,
}: {
  label: string;
  description?: string;
  isSelected: boolean;
  onChange: (selected: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Switch isSelected={isSelected} onChange={onChange}>
        <Switch.Content>
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
          <Label>{label}</Label>
        </Switch.Content>
      </Switch>
      {description ? (
        <Description className="text-xs">{description}</Description>
      ) : null}
    </div>
  );
}

/** Label left / control right on the same row; wraps on a 340 px window. */
function FormatRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex min-w-0 flex-col gap-0.5">
        <Label>{label}</Label>
        {description ? (
          <Description className="text-xs">{description}</Description>
        ) : null}
      </div>
      <div className="flex flex-col items-end gap-1">{children}</div>
    </div>
  );
}

export function SettingsDialog({
  open,
  prefs,
  onChange,
  onOpenChange,
  onToggleAutostart,
  updater,
  onCheckUpdate,
}: {
  open: boolean;
  prefs: Preferences;
  onChange: (patch: Partial<Preferences>) => void;
  onOpenChange: (open: boolean) => void;
  onToggleAutostart: (enabled: boolean) => Promise<void>;
  /** D5 updater state; checked silently at startup, installed on click. */
  updater: UpdaterState;
  onCheckUpdate: () => void;
}) {
  const selectedCards = CARD_OPTIONS.filter((card) => prefs[card.id]).map(
    (card) => card.id,
  );

  // Reveal the CLI's own folders (read-only debugging aid, desktop-plan
  // §12.14). Rust whitelists the two targets and reports a missing folder.
  const openTrackerDir = (which: "tracker" | "logs") => {
    void invoke("open_tracker_dir", { which }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);

      toast.danger(
        message.includes("directory missing")
          ? "目录还不存在：先让采集器跑一次（立即同步）"
          : `打开目录失败：${message}`,
      );
    });
  };

  return (
    <Modal.Backdrop isOpen={open} onOpenChange={onOpenChange}>
      <Modal.Container>
        <Modal.Dialog className="max-h-[85vh] w-[calc(100vw-1.5rem)] max-w-2xl">
          <Modal.CloseTrigger aria-label="关闭设置" />
          <Modal.Header>
            <Modal.Heading>设置</Modal.Heading>
            <Typography color="muted" type="body-xs">
              仅保存在本机，不随账号同步
            </Typography>
          </Modal.Header>
          <Modal.Body className="flex flex-col gap-4">
            <section className="flex flex-col gap-3">
              <Typography type="body-sm" weight="semibold">
                通知
              </Typography>
              <ToggleRow
                description="当天用量汇总弹一条系统通知"
                isSelected={prefs.dailySummary}
                label="每日汇总"
                onChange={(value) => onChange({ dailySummary: value })}
              />
              {prefs.dailySummary ? (
                <HourSelect
                  label="汇总时间"
                  value={prefs.dailySummaryHour}
                  onChange={(hour) => onChange({ dailySummaryHour: hour })}
                />
              ) : null}
              <Separator />
              <ToggleRow
                description="自动同步连续失败时提醒，恢复后重新计数"
                isSelected={prefs.failureAlerts}
                label="同步连败提醒"
                onChange={(value) => onChange({ failureAlerts: value })}
              />
              {prefs.failureAlerts ? (
                <NumberSelect
                  label="连续失败次数"
                  options={FAILURE_THRESHOLD_OPTIONS}
                  render={(value) => `${value} 次`}
                  value={prefs.failureThreshold}
                  onChange={(value) => onChange({ failureThreshold: value })}
                />
              ) : null}
              <Separator />
              <ToggleRow
                description="本地队列未能上传、越积越大时提醒一次"
                isSelected={prefs.backlogAlerts}
                label="队列积压提醒"
                onChange={(value) => onChange({ backlogAlerts: value })}
              />
              {prefs.backlogAlerts ? (
                <NumberSelect
                  label="积压阈值"
                  options={BACKLOG_BYTES_OPTIONS}
                  render={(bytes) => formatBytes(bytes)}
                  value={prefs.backlogBytes}
                  onChange={(value) => onChange({ backlogBytes: value })}
                />
              ) : null}
            </section>

            <Separator />

            <section className="flex flex-col gap-3">
              <Typography type="body-sm" weight="semibold">
                免打扰
              </Typography>
              <ToggleRow
                description="时段内不弹通知；到期未发的会顺延到时段结束后"
                isSelected={prefs.quietHours}
                label="启用免打扰时段"
                onChange={(value) => onChange({ quietHours: value })}
              />
              {prefs.quietHours ? (
                <>
                  <HourSelect
                    label="开始"
                    value={prefs.quietStartHour}
                    onChange={(hour) => onChange({ quietStartHour: hour })}
                  />
                  <HourSelect
                    label="结束"
                    value={prefs.quietEndHour}
                    onChange={(hour) => onChange({ quietEndHour: hour })}
                  />
                </>
              ) : null}
            </section>

            <Separator />

            <section className="flex flex-col gap-3">
              <Typography type="body-sm" weight="semibold">
                启动
              </Typography>
              <ToggleRow
                description="登录 Windows 后自动启动并收进任务栏"
                isSelected={prefs.autostart}
                label="开机自启"
                onChange={(value) => {
                  void onToggleAutostart(value).catch((error: unknown) => {
                    toast.danger(describeAutostartError(error));
                  });
                }}
              />
            </section>

            <Separator />

            <section className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label>卡片显示</Label>
                <ToggleButtonGroup
                  aria-label="卡片显示"
                  className="flex-wrap"
                  selectedKeys={selectedCards}
                  selectionMode="multiple"
                  size="sm"
                  onSelectionChange={(keys) => {
                    const patch: Partial<Preferences> = {};

                    for (const card of CARD_OPTIONS) {
                      patch[card.id] = keys.has(card.id);
                    }
                    onChange(patch);
                  }}
                >
                  {CARD_OPTIONS.map((card, index) => (
                    <ToggleButton key={card.id} id={card.id}>
                      {index > 0 ? <ToggleButtonGroup.Separator /> : null}
                      {card.label}
                    </ToggleButton>
                  ))}
                </ToggleButtonGroup>
              </div>
              <Description className="text-xs">
                选项顺序与监控盘卡片一致；选择即时生效
              </Description>
            </section>

            <Separator />

            <section className="flex flex-col gap-3">
              <Typography type="body-sm" weight="semibold">
                显示格式
              </Typography>
              <FormatRow
                description={
                  prefs.currency === "USD"
                    ? "费用按读时计价，换算仅影响展示"
                    : `${formatFxRate(prefs.currency)} · 参考汇率 · ${BUILT_IN_FX.as_of}`
                }
                label="货币"
              >
                <Select
                  aria-label="货币"
                  className="w-40"
                  value={prefs.currency}
                  variant="secondary"
                  onChange={(key) => {
                    if (key != null) {
                      onChange({ currency: String(key) as CurrencyCode });
                    }
                  }}
                >
                  <Select.Trigger>
                    <Select.Value />
                    <Select.Indicator />
                  </Select.Trigger>
                  <Select.Popover>
                    <Popover.Arrow />
                    <ListBox>
                      {SUPPORTED_CURRENCIES.map((code) => (
                        <ListBox.Item
                          key={code}
                          id={code}
                          textValue={currencyLabel(code)}
                        >
                          {currencyLabel(code)}
                        </ListBox.Item>
                      ))}
                    </ListBox>
                  </Select.Popover>
                </Select>
              </FormatRow>
              <FormatRow
                description="紧凑按单位缩写，完整显示全部分组数字"
                label="Token 显示"
              >
                <ToggleButtonGroup
                  disallowEmptySelection
                  aria-label="Token 显示"
                  selectedKeys={[prefs.tokenDisplay]}
                  selectionMode="single"
                  size="sm"
                  onSelectionChange={(keys) => {
                    const value = [...keys][0];

                    if (value === "compact" || value === "full") {
                      onChange({ tokenDisplay: value as TokenDisplay });
                    }
                  }}
                >
                  <ToggleButton id="compact">紧凑</ToggleButton>
                  <ToggleButton id="full">
                    <ToggleButtonGroup.Separator />
                    完整
                  </ToggleButton>
                </ToggleButtonGroup>
              </FormatRow>
              <FormatRow label="数字单位">
                <ToggleButtonGroup
                  disallowEmptySelection
                  aria-label="数字单位"
                  isDisabled={prefs.tokenDisplay === "full"}
                  selectedKeys={[prefs.tokenUnit]}
                  selectionMode="single"
                  size="sm"
                  onSelectionChange={(keys) => {
                    const value = [...keys][0];

                    if (value === "kmb" || value === "wan") {
                      onChange({ tokenUnit: value as TokenUnit });
                    }
                  }}
                >
                  <ToggleButton id="kmb">K/M/B</ToggleButton>
                  <ToggleButton id="wan">
                    <ToggleButtonGroup.Separator />
                    万/亿
                  </ToggleButton>
                </ToggleButtonGroup>
                {prefs.tokenDisplay === "full" ? (
                  <Description className="text-xs">
                    仅在「紧凑」模式下生效
                  </Description>
                ) : null}
              </FormatRow>
              <FormatRow label="数字分组">
                <ToggleButtonGroup
                  disallowEmptySelection
                  aria-label="数字分组"
                  isDisabled={prefs.tokenDisplay === "compact"}
                  selectedKeys={[String(prefs.tokenGrouping)]}
                  selectionMode="single"
                  size="sm"
                  onSelectionChange={(keys) => {
                    const value = [...keys][0];

                    if (value != null) {
                      onChange({
                        tokenGrouping: (Number(value) === 4
                          ? 4
                          : 3) as TokenGrouping,
                      });
                    }
                  }}
                >
                  <ToggleButton id="3">3 位</ToggleButton>
                  <ToggleButton id="4">
                    <ToggleButtonGroup.Separator />4 位
                  </ToggleButton>
                </ToggleButtonGroup>
                {prefs.tokenDisplay === "compact" ? (
                  <Description className="text-xs">
                    仅在「完整」模式下生效
                  </Description>
                ) : null}
              </FormatRow>
              <Description className="text-xs">
                只影响本机显示，与网页端偏好互不同步
              </Description>
            </section>

            <Separator />

            <section className="flex flex-col gap-3">
              <Typography type="body-sm" weight="semibold">
                本机数据
              </Typography>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  fullWidth
                  size="sm"
                  variant="secondary"
                  onPress={() => openTrackerDir("tracker")}
                >
                  <Folder aria-hidden="true" className="size-4 shrink-0" />
                  数据目录
                </Button>
                <Button
                  fullWidth
                  size="sm"
                  variant="secondary"
                  onPress={() => openTrackerDir("logs")}
                >
                  <FileText aria-hidden="true" className="size-4 shrink-0" />
                  日志目录
                </Button>
              </div>
              <Description className="text-xs">
                在文件管理器中打开采集器的数据与日志目录（只读查看，改动不会被采纳）
              </Description>
            </section>

            <Separator />

            <section className="flex flex-col gap-3">
              <Typography type="body-sm" weight="semibold">
                更新
              </Typography>
              <div className="flex items-center justify-between gap-3">
                <Typography color="muted" type="body-sm">
                  当前版本
                </Typography>
                <Chip className="tabular-nums" size="sm" variant="soft">
                  {updater.currentVersion === null
                    ? "…"
                    : `v${updater.currentVersion}`}
                </Chip>
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1">
                  <Label>手动检查</Label>
                  <Description className="text-xs">
                    {updater.availableVersion === null
                      ? "发现新版本会下载安装并重启应用"
                      : `有新版本 v${updater.availableVersion}，确认后自动重启`}
                  </Description>
                </div>
                <PendingButton
                  className="shrink-0"
                  isDisabled={updater.status !== "idle"}
                  pending={updater.status !== "idle"}
                  size="sm"
                  variant="secondary"
                  onPress={onCheckUpdate}
                >
                  检查更新
                </PendingButton>
              </div>
            </section>
          </Modal.Body>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
