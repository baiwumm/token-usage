// Shell copy shared by the desktop sidebar, the top bar and the mobile drawer:
// nav labels, page titles, greeting and the control affordances.

export interface NavCopy {
  dashboard: string;
  sessions: string;
  projects: string;
  syncRuns: string;
  settings: string;
  wrapped: string;
  achievements: string;
  device: string;
  newBadge: string;
  pairDevice: string;
  brandTagline: string;
  menu: string;
  closeMenu: string;
  toggleSidebar: string;
  signOut: string;
  signOutConfirm: string;
  signOutError: string;
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
  backToTop: string;
}

export const NAV_COPY: Record<"zh" | "en", NavCopy> = {
  zh: {
    dashboard: "仪表盘",
    sessions: "Sessions",
    projects: "项目",
    syncRuns: "采集记录",
    settings: "账户设置",
    wrapped: "年度回顾",
    achievements: "成就",
    device: "设备配对",
    newBadge: "新",
    pairDevice: "配对设备",
    brandTagline: "自托管用量",
    menu: "菜单",
    closeMenu: "关闭菜单",
    toggleSidebar: "折叠侧边栏",
    signOut: "退出登录",
    signOutConfirm:
      "确定要退出登录吗？只退出当前浏览器，其他已登录设备不受影响。",
    signOutError: "退出登录失败，请重试。",
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
    backToTop: "回到顶部",
  },
  en: {
    dashboard: "Dashboard",
    sessions: "Sessions",
    projects: "Projects",
    syncRuns: "Sync runs",
    settings: "Account settings",
    wrapped: "Wrapped",
    achievements: "Achievements",
    device: "Device pairing",
    newBadge: "New",
    pairDevice: "Pair device",
    brandTagline: "Self-hosted",
    menu: "Menu",
    closeMenu: "Close menu",
    toggleSidebar: "Toggle sidebar",
    signOut: "Sign out",
    signOutConfirm:
      "Sign out of this browser only? Other signed-in devices stay signed in.",
    signOutError: "Sign out failed. Please try again.",
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
    backToTop: "Back to top",
  },
};

export const NAV_ITEMS = [
  { href: "/", key: "dashboard" },
  { href: "/sessions", key: "sessions" },
  { href: "/projects", key: "projects" },
  { href: "/sync-runs", key: "syncRuns" },
  // Wrapped shipped on 2026-10-30; the "new" chip had no expiry logic and
  // stayed on permanently. Drop it rather than keep a stale marker.
  { href: "/wrapped", key: "wrapped" },
  { href: "/achievements", key: "achievements" },
  // /service-status (nav key "status") was removed on 2026-11-07: the probes
  // re-proved what reaching the page already proved. The instance self-check
  // lives on as the 实例诊断 card in Settings · 设备.
  { href: "/settings", key: "settings" },
] as const;
