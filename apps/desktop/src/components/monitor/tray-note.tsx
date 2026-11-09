import { Alert } from "@heroui/react";

/**
 * Shown when the shell never registered the tray icon (desktop-plan §10):
 * a process of lower integrity than the taskbar cannot post its icon there
 * (typical on Windows with UAC disabled). Window close minimizes instead of
 * hiding in that case, so the app is never stranded without a way back.
 */
export function TrayNote() {
  return (
    <Alert status="warning">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>托盘图标未注册</Alert.Title>
        <Alert.Description>
          当前会话的任务栏权限高于本应用（关闭 UAC 的 Windows
          常见），图标无法加入通知区域。关闭窗口会最小化到任务栏，不会退出。
        </Alert.Description>
      </Alert.Content>
    </Alert>
  );
}
