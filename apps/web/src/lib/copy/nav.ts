// Shell copy shared by the desktop sidebar, the top bar and the mobile drawer:
// nav labels, page titles, greeting and the control affordances.

export interface NavCopy {
  dashboard: string;
  sessions: string;
  syncRuns: string;
  settings: string;
  wrapped: string;
  status: string;
  device: string;
  newBadge: string;
  pairDevice: string;
  brandTagline: string;
  menu: string;
  closeMenu: string;
  toggleSidebar: string;
  signOut: string;
  signOutConfirm: string;
  cancel: string;
  accountSettings: string;
  appearance: string;
  randomColor: string;
  language: string;
  languageSystem: string;
  languageZh: string;
  languageEn: string;
  themeMode: string;
  themeCurrent: string;
  themeLight: string;
  themeDark: string;
  themeSystem: string;
  greetingMorning: string;
  greetingAfternoon: string;
  greetingEvening: string;
}

export const NAV_COPY: Record<"zh" | "en", NavCopy> = {
  zh: {
    dashboard: "仪表盘",
    sessions: "Sessions",
    syncRuns: "采集记录",
    settings: "账户设置",
    wrapped: "年度回顾",
    status: "服务状态",
    device: "设备配对",
    newBadge: "新",
    pairDevice: "配对设备",
    brandTagline: "自托管用量",
    menu: "菜单",
    closeMenu: "关闭菜单",
    toggleSidebar: "折叠侧边栏",
    signOut: "退出登录",
    signOutConfirm: "确定要退出登录吗？退出后需要重新登录才能继续使用。",
    cancel: "取消",
    accountSettings: "账户设置",
    appearance: "主题色",
    randomColor: "随机主题色",
    language: "语言",
    languageSystem: "跟随系统",
    languageZh: "简体中文",
    languageEn: "English",
    themeMode: "主题模式",
    themeCurrent: "主题：{mode}",
    themeLight: "浅色",
    themeDark: "深色",
    themeSystem: "跟随系统",
    greetingMorning: "早上好",
    greetingAfternoon: "下午好",
    greetingEvening: "晚上好",
  },
  en: {
    dashboard: "Dashboard",
    sessions: "Sessions",
    syncRuns: "Sync runs",
    settings: "Account settings",
    wrapped: "Wrapped",
    status: "Service status",
    device: "Device pairing",
    newBadge: "New",
    pairDevice: "Pair device",
    brandTagline: "Self-hosted",
    menu: "Menu",
    closeMenu: "Close menu",
    toggleSidebar: "Toggle sidebar",
    signOut: "Sign out",
    signOutConfirm:
      "Sign out of this account? You'll need to sign in again to continue.",
    cancel: "Cancel",
    accountSettings: "Account settings",
    appearance: "Accent color",
    randomColor: "Random accent color",
    language: "Language",
    languageSystem: "Follow system",
    languageZh: "简体中文",
    languageEn: "English",
    themeMode: "Theme mode",
    themeCurrent: "Theme: {mode}",
    themeLight: "Light",
    themeDark: "Dark",
    themeSystem: "System",
    greetingMorning: "Good morning",
    greetingAfternoon: "Good afternoon",
    greetingEvening: "Good evening",
  },
};

export const NAV_ITEMS = [
  { href: "/", key: "dashboard" },
  { href: "/sessions", key: "sessions" },
  { href: "/sync-runs", key: "syncRuns" },
  { href: "/wrapped", key: "wrapped", badge: true },
  { href: "/service-status", key: "status" },
  { href: "/settings", key: "settings" },
] as const;
