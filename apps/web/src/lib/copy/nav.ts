// Nav labels shared by the desktop sidebar and the mobile drawer.

export interface NavCopy {
  dashboard: string;
  settings: string;
  wrapped: string;
  status: string;
  menu: string;
  signOut: string;
  signOutConfirm: string;
  cancel: string;
}

export const NAV_COPY: Record<"zh" | "en", NavCopy> = {
  zh: {
    dashboard: "仪表盘",
    settings: "设置",
    wrapped: "年度回顾",
    status: "服务状态",
    menu: "菜单",
    signOut: "登出",
    signOutConfirm: "确定要退出当前账号吗？",
    cancel: "取消",
  },
  en: {
    dashboard: "Dashboard",
    settings: "Settings",
    wrapped: "Wrapped",
    status: "Service status",
    menu: "Menu",
    signOut: "Sign out",
    signOutConfirm: "Sign out of this account?",
    cancel: "Cancel",
  },
};

export const NAV_ITEMS = [
  { href: "/", key: "dashboard" },
  { href: "/wrapped", key: "wrapped" },
  { href: "/service-status", key: "status" },
  { href: "/settings", key: "settings" },
] as const;
