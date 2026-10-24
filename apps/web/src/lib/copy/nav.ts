// Nav labels shared by the desktop sidebar and the mobile drawer.

export interface NavCopy {
  dashboard: string;
  settings: string;
  wrapped: string;
  status: string;
  menu: string;
}

export const NAV_COPY: Record<"zh" | "en", NavCopy> = {
  zh: {
    dashboard: "仪表盘",
    settings: "设置",
    wrapped: "年度回顾",
    status: "服务状态",
    menu: "菜单",
  },
  en: {
    dashboard: "Dashboard",
    settings: "Settings",
    wrapped: "Wrapped",
    status: "Service status",
    menu: "Menu",
  },
};

export const NAV_ITEMS = [
  { href: "/", key: "dashboard" },
  { href: "/settings", key: "settings" },
  { href: "/wrapped", key: "wrapped" },
  { href: "/service-status", key: "status" },
] as const;
