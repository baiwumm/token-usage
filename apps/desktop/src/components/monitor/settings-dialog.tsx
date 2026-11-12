// D4 settings: notification switches + thresholds, quiet hours, autostart.
// Everything here maps 1:1 to `lib/preferences.ts`; the pure decision rules in
// `lib/notifications.ts` read the same fields, so the dialog never has to
// explain behavior the scheduler does not implement.

import type { UpdaterState } from "@/hooks/use-updater";

import { invoke } from "@tauri-apps/api/core";
import {
  Display,
  FileText,
  Folder,
  Globe,
  ListUl,
  Medal,
} from "@gravity-ui/icons";
import {
  Button,
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

import { PendingButton } from "@/components/pending-button";
import { LANDING_URL, webUrl, type WebPage } from "@/lib/links";
import {
  BACKLOG_BYTES_OPTIONS,
  FAILURE_THRESHOLD_OPTIONS,
  formatHour,
  type Preferences,
} from "@/lib/preferences";
import { formatBytes } from "@/lib/format-tokens";

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

// Icons mirror the web app shell's navigation (Display / Folder / ListUl /
// Medal) so a page keeps the same mark in both surfaces.
const WEB_LINKS: Array<{
  page: WebPage;
  label: string;
  icon: typeof Display;
}> = [
  { page: "dashboard", label: "仪表盘", icon: Display },
  { page: "projects", label: "项目", icon: Folder },
  { page: "sessions", label: "会话", icon: ListUl },
  { page: "achievements", label: "成就", icon: Medal },
];

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

export function SettingsDialog({
  open,
  prefs,
  dashboardUrl,
  onChange,
  onOpenChange,
  onOpenUrl,
  onToggleAutostart,
  updater,
  onCheckUpdate,
}: {
  open: boolean;
  prefs: Preferences;
  /** Paired instance base URL; null hides the web deep links. */
  dashboardUrl: string | null;
  onChange: (patch: Partial<Preferences>) => void;
  onOpenChange: (open: boolean) => void;
  onOpenUrl: (url: string) => void;
  onToggleAutostart: (enabled: boolean) => Promise<void>;
  /** D5 updater state; checked silently at startup, installed on click. */
  updater: UpdaterState;
  onCheckUpdate: () => void;
}) {
  const webLinks = WEB_LINKS.flatMap((link) => {
    const url = webUrl(dashboardUrl, link.page);

    return url === null ? [] : [{ ...link, url }];
  });

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
              <Typography type="body-sm" weight="semibold">
                卡片显示
              </Typography>
              <ToggleRow
                isSelected={prefs.showTrend}
                label="用量趋势"
                onChange={(value) => onChange({ showTrend: value })}
              />
              <ToggleRow
                isSelected={prefs.showSources}
                label="来源构成"
                onChange={(value) => onChange({ showSources: value })}
              />
              <ToggleRow
                isSelected={prefs.showModels}
                label="Top 模型"
                onChange={(value) => onChange({ showModels: value })}
              />
              <ToggleRow
                isSelected={prefs.showProjects}
                label="项目与仓库"
                onChange={(value) => onChange({ showProjects: value })}
              />
              <ToggleRow
                isSelected={prefs.showHeatmap}
                label="活跃热力图"
                onChange={(value) => onChange({ showHeatmap: value })}
              />
              <Description className="text-xs">
                默认展开趋势与用量构成卡；开关即时生效
              </Description>
            </section>

            <Separator />

            <section className="flex flex-col gap-3">
              <Typography type="body-sm" weight="semibold">
                网页
              </Typography>
              <div className="grid grid-cols-2 gap-2">
                {/* The landing page is this project's own site — reachable
                    without a pairing (D11 acceptance round 1). */}
                <Button
                  fullWidth
                  size="sm"
                  variant="secondary"
                  onPress={() => onOpenUrl(LANDING_URL)}
                >
                  <Globe aria-hidden="true" className="size-4 shrink-0" />
                  落地页
                </Button>
                {webLinks.map((link) => {
                  const Icon = link.icon;

                  return (
                    <Button
                      key={link.page}
                      fullWidth
                      size="sm"
                      variant="secondary"
                      onPress={() => onOpenUrl(link.url)}
                    >
                      <Icon aria-hidden="true" className="size-4 shrink-0" />
                      {link.label}
                    </Button>
                  );
                })}
              </div>
              <Description className="text-xs">
                {webLinks.length > 0
                  ? "在浏览器打开项目官网与已配对实例的页面"
                  : "在浏览器打开项目官网"}
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
                <Typography className="tabular-nums" type="body-sm">
                  {updater.currentVersion === null
                    ? "…"
                    : `v${updater.currentVersion}`}
                </Typography>
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
