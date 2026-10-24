// Settings page copy (account panel + device table + rename/revoke flows).
// Device mutations consume the frozen contract endpoints device-rename /
// device-revoke; their stable error codes map to friendly copy here.

export interface SettingsCopy {
  pageTitle: string;
  accountHeading: string;
  profileHeading: string;
  profileHint: string;
  profileNameLabel: string;
  profileNamePlaceholder: string;
  profileAvatarLabel: string;
  profileAvatarHint: string;
  profileAvatarChange: string;
  profileAvatarDelete: string;
  profileAvatarTooLarge: string;
  profileEmailLabel: string;
  profileSave: string;
  profileSaved: string;
  profileSaveFailed: string;
  signedInAs: string;
  signOut: string;
  devicesHeading: string;
  devicesHint: string;
  columnDevice: string;
  columnPlatform: string;
  columnJoined: string;
  columnUsage: string;
  columnActions: string;
  usageWindowLabel: string;
  usageUnit: string;
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
  revokedTokensSuffix: string;
  sessionExpired: string;
  // Stable contract error codes → friendly text.
  errorDeviceNameTaken: string;
  errorGeneric: string;
}

export const SETTINGS_COPY: Record<"zh" | "en", SettingsCopy> = {
  zh: {
    pageTitle: "设置",
    accountHeading: "账户",
    profileHeading: "编辑资料",
    profileHint: "名称与头像显示在侧边栏；邮箱由管理员分配，不可修改。",
    profileNameLabel: "名称",
    profileNamePlaceholder: "你的名字",
    profileAvatarLabel: "头像",
    profileAvatarHint: "上传图片作为头像；删除后显示名称首字。",
    profileAvatarChange: "更换头像",
    profileAvatarDelete: "删除",
    profileAvatarTooLarge: "图片超过 2 MB。",
    profileEmailLabel: "邮箱（不可修改）",
    profileSave: "保存",
    profileSaved: "资料已更新。",
    profileSaveFailed: "保存失败。",
    signedInAs: "登录账号",
    signOut: "登出",
    devicesHeading: "设备",
    devicesHint:
      "已配对的采集设备。吊销会立即失效该设备的所有令牌，已上报的用量保留。",
    columnDevice: "设备",
    columnPlatform: "平台",
    columnJoined: "接入时间",
    columnUsage: "用量",
    columnActions: "操作",
    usageWindowLabel: "近 12 个月",
    usageUnit: "tokens",
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
    revokedTokensSuffix: "个令牌已失效",
    sessionExpired: "登录状态已失效，请重新登录。",
    errorDeviceNameTaken: "该名称已被账户内其他活跃设备使用。",
    errorGeneric: "操作失败，请稍后再试。",
  },
  en: {
    pageTitle: "Settings",
    accountHeading: "Account",
    profileHeading: "Edit profile",
    profileHint:
      "Name and avatar show in the sidebar; the email is admin-assigned and read-only.",
    profileNameLabel: "Name",
    profileNamePlaceholder: "Your name",
    profileAvatarLabel: "Avatar",
    profileAvatarHint:
      "Upload an image; delete it to fall back to your initial.",
    profileAvatarChange: "Change avatar",
    profileAvatarDelete: "Delete",
    profileAvatarTooLarge: "Image exceeds 2 MB.",
    profileEmailLabel: "Email (read-only)",
    profileSave: "Save",
    profileSaved: "Profile updated.",
    profileSaveFailed: "Saving failed.",
    signedInAs: "Signed in as",
    signOut: "Sign out",
    devicesHeading: "Devices",
    devicesHint:
      "Paired collectors. Revoking instantly invalidates the device's tokens; reported usage is kept.",
    columnDevice: "Device",
    columnPlatform: "Platform",
    columnJoined: "Joined",
    columnUsage: "Usage",
    columnActions: "Actions",
    usageWindowLabel: "Last 12 months",
    usageUnit: "tokens",
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
    revokedTokensSuffix: "token(s) invalidated",
    sessionExpired: "Your session has expired. Please sign in again.",
    errorDeviceNameTaken: "That name is already used by another active device.",
    errorGeneric: "Something went wrong. Please try again later.",
  },
};
