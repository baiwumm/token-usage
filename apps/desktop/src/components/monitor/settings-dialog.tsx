// D4 settings: notification switches + thresholds, quiet hours, autostart.
// Everything here maps 1:1 to `lib/preferences.ts`; the pure decision rules in
// `lib/notifications.ts` read the same fields, so the dialog never has to
// explain behavior the scheduler does not implement.

import {
  Description,
  Label,
  ListBox,
  Modal,
  Popover,
  Select,
  Separator,
  Switch,
  Typography,
  toast,
} from "@heroui/react";

import {
  BACKLOG_BYTES_OPTIONS,
  FAILURE_THRESHOLD_OPTIONS,
  formatHour,
  type Preferences,
} from "@/lib/preferences";
import { formatBytes } from "@/lib/format-tokens";

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

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

export function SettingsDialog({
  open,
  prefs,
  onChange,
  onOpenChange,
  onToggleAutostart,
}: {
  open: boolean;
  prefs: Preferences;
  onChange: (patch: Partial<Preferences>) => void;
  onOpenChange: (open: boolean) => void;
  onToggleAutostart: (enabled: boolean) => Promise<void>;
}) {
  return (
    <Modal.Backdrop isOpen={open} onOpenChange={onOpenChange}>
      <Modal.Container>
        <Modal.Dialog className="max-h-[85vh] w-[calc(100vw-1.5rem)] max-w-md">
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
          </Modal.Body>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
