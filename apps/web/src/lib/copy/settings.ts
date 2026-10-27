// Settings page copy (account panel + device table + rename/revoke flows).
// Device mutations consume the frozen contract endpoints device-rename /
// device-revoke; their stable error codes map to friendly copy here.

export interface SettingsCopy {
  pageTitle: string;
  sectionAccount: string;
  sectionAppearance: string;
  sectionDevices: string;
  profileHeading: string;
  profileHint: string;
  profileNameLabel: string;
  profileNamePlaceholder: string;
  profileAvatarChange: string;
  profileAvatarDelete: string;
  avatarHeading: string;
  avatarHint: string;
  passwordHeading: string;
  passwordHint: string;
  passwordNewLabel: string;
  passwordNewPlaceholder: string;
  passwordConfirmLabel: string;
  passwordConfirmPlaceholder: string;
  passwordMismatch: string;
  passwordLengthError: string;
  passwordSave: string;
  passwordSaved: string;
  cropTitle: string;
  budgetHeading: string;
  budgetHint: string;
  budgetLabel: string;
  budgetSave: string;
  budgetSaved: string;
  cropZoom: string;
  cropRotateLeft: string;
  cropRotateRight: string;
  cropUpload: string;
  cropUploading: string;
  profileEmailLabel: string;
  profileSave: string;
  profileSaved: string;
  profileSaveFailed: string;
  devicesHeading: string;
  devicesHint: string;
  columnDevice: string;
  columnPlatform: string;
  columnJoined: string;
  columnUsage: string;
  columnActions: string;
  usageWindowLabel: string;
  loading: string;
  emptyTitle: string;
  emptyBody: string;
  loadError: string;
  retry: string;
  renameAction: string;
  revokeAction: string;
  renameTitle: string;
  renameLabel: string;
  renameSave: string;
  renameCancel: string;
  renameLengthError: string;
  renameSuccess: string;
  revokeTitle: string;
  revokeBody: string;
  revokeConfirm: string;
  revokeCancel: string;
  revokeSuccess: string;
  revokedTokensSummary: string;
  // Stable contract error codes → friendly text.
  errorDeviceNameTaken: string;
  errorGeneric: string;
}

export const SETTINGS_COPY: Record<"zh" | "en", SettingsCopy> = {
  zh: {
    pageTitle: "账户设置",
    sectionAccount: "账户",
    sectionAppearance: "偏好",
    sectionDevices: "设备",
    avatarHeading: "头像",
    avatarHint: "上传图片作为头像；删除后显示名称首字。",
    passwordHeading: "密码",
    passwordHint:
      "设置密码后即可用邮箱 + 密码登录；魔法链接登录的账号也能在此开启密码登录。长度至少 8 位。",
    passwordNewLabel: "新密码",
    passwordNewPlaceholder: "至少 8 位",
    passwordConfirmLabel: "确认新密码",
    passwordConfirmPlaceholder: "再次输入新密码",
    passwordMismatch: "两次输入的密码不一致。",
    passwordLengthError: "密码至少 8 位。",
    passwordSave: "更新密码",
    passwordSaved: "密码已更新。",
    cropTitle: "裁剪头像",
    budgetHeading: "月度预算",
    budgetHint:
      "美元计的月度花费上限（0–1,000,000）；超过后仪表盘的成本指标会标红并提示。填 0 关闭。",
    budgetLabel: "每月预算（USD）",
    budgetSave: "保存预算",
    budgetSaved: "预算已更新。",
    cropZoom: "缩放",
    cropRotateLeft: "左转 90°",
    cropRotateRight: "右转 90°",
    cropUpload: "上传",
    cropUploading: "上传中…",
    profileHeading: "个人信息",
    profileHint: "名称显示在侧边栏；邮箱由管理员分配，不可修改。",
    profileNameLabel: "名称",
    profileNamePlaceholder: "你的名字",
    profileAvatarChange: "更换头像",
    profileAvatarDelete: "删除",
    profileEmailLabel: "邮箱（不可修改）",
    profileSave: "保存",
    profileSaved: "资料已更新。",
    profileSaveFailed: "保存失败。",
    devicesHeading: "设备",
    devicesHint:
      "已配对的采集设备。吊销会立即失效该设备的所有令牌，已上报的用量保留。",
    columnDevice: "设备",
    columnPlatform: "平台",
    columnJoined: "接入时间",
    columnUsage: "用量",
    columnActions: "操作",
    usageWindowLabel: "近 12 个月",
    loading: "正在加载设备…",
    emptyTitle: "还没有已接入的设备",
    emptyBody: "在采集机上完成配对后，设备会出现在这里。",
    loadError: "设备列表加载失败。",
    retry: "重试",
    renameAction: "改名",
    revokeAction: "吊销",
    renameTitle: "重命名设备",
    renameLabel: "设备名",
    renameSave: "保存",
    renameCancel: "取消",
    renameLengthError: "设备名需为 1–60 个字符。",
    renameSuccess: "设备已改名。",
    revokeTitle: "吊销设备",
    revokeBody: "吊销后该设备的令牌将立即失效，需要重新配对才能再次上报。",
    revokeConfirm: "确认吊销",
    revokeCancel: "取消",
    revokeSuccess: "设备已吊销",
    revokedTokensSummary: "{count} 个令牌已失效",
    errorDeviceNameTaken: "该名称已被账户内其他活跃设备使用。",
    errorGeneric: "操作失败，请稍后再试。",
  },
  en: {
    pageTitle: "Account settings",
    sectionAccount: "Account",
    sectionAppearance: "Preferences",
    sectionDevices: "Devices",
    avatarHeading: "Avatar",
    avatarHint:
      "Upload an image as your avatar; deleting it falls back to your initial.",
    passwordHeading: "Password",
    passwordHint:
      "Set a password to sign in with email + password — including accounts created via magic link. At least 8 characters.",
    passwordNewLabel: "New password",
    passwordNewPlaceholder: "At least 8 characters",
    passwordConfirmLabel: "Confirm new password",
    passwordConfirmPlaceholder: "Re-enter the new password",
    passwordMismatch: "Passwords do not match.",
    passwordLengthError: "The password must be at least 8 characters.",
    passwordSave: "Update password",
    passwordSaved: "Password updated.",
    cropTitle: "Crop avatar",
    budgetHeading: "Monthly budget",
    budgetHint:
      "A USD cap on monthly spend (0–1,000,000); the dashboard cost metric turns red and warns once you cross it. Set 0 to disable.",
    budgetLabel: "Monthly budget (USD)",
    budgetSave: "Save budget",
    budgetSaved: "Budget updated.",
    cropZoom: "Zoom",
    cropRotateLeft: "Rotate left 90°",
    cropRotateRight: "Rotate right 90°",
    cropUpload: "Upload",
    cropUploading: "Uploading…",
    profileHeading: "Profile",
    profileHint:
      "The name shows in the sidebar; the email is admin-assigned and read-only.",
    profileNameLabel: "Name",
    profileNamePlaceholder: "Your name",
    profileAvatarChange: "Change avatar",
    profileAvatarDelete: "Delete",
    profileEmailLabel: "Email (read-only)",
    profileSave: "Save",
    profileSaved: "Profile updated.",
    profileSaveFailed: "Saving failed.",
    devicesHeading: "Devices",
    devicesHint:
      "Paired collectors. Revoking instantly invalidates the device's tokens; reported usage is kept.",
    columnDevice: "Device",
    columnPlatform: "Platform",
    columnJoined: "Joined",
    columnUsage: "Usage",
    columnActions: "Actions",
    usageWindowLabel: "Last 12 months",
    loading: "Loading devices…",
    emptyTitle: "No devices yet",
    emptyBody: "Devices appear here once a collector completes pairing.",
    loadError: "Failed to load devices.",
    retry: "Retry",
    renameAction: "Rename",
    revokeAction: "Revoke",
    renameTitle: "Rename device",
    renameLabel: "Device name",
    renameSave: "Save",
    renameCancel: "Cancel",
    renameLengthError: "The name must be 1–60 characters.",
    renameSuccess: "Device renamed.",
    revokeTitle: "Revoke device",
    revokeBody:
      "Revoking immediately invalidates this device's tokens; it must pair again to report.",
    revokeConfirm: "Revoke device",
    revokeCancel: "Cancel",
    revokeSuccess: "Device revoked",
    revokedTokensSummary:
      "{count, plural, one {# token invalidated} other {# tokens invalidated}}",
    errorDeviceNameTaken: "That name is already used by another active device.",
    errorGeneric: "Something went wrong. Please try again later.",
  },
};
