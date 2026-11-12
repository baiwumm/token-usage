import { Alert } from "@heroui/react";

/**
 * Shown when the shell never registered the tray icon (desktop-plan §10/§11):
 * a process with a lower integrity level than the taskbar cannot post its icon
 * there — the app being started by a lower-integrity parent (a script, a
 * restricted scheduled task) is the usual cause, not UAC being off. Window
 * close minimizes instead of hiding in that case, so the app is never stranded
 * without a way back.
 */
export function TrayNote() {
  return (
    <Alert status="warning">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>托盘图标未注册</Alert.Title>
        <Alert.Description>
          任务栏的权限级别高于本应用时，图标无法加入通知区域（常见于由低权限程序或受限计划任务启动）。用「以管理员身份运行」重新启动即可恢复托盘；在此之前关闭窗口只最小化，不会退出。
        </Alert.Description>
      </Alert.Content>
    </Alert>
  );
}
