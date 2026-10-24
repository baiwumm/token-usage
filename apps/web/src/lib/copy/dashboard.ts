// Dashboard shell copy at / (docs/requirements.md 范围表, 2026-10-24 二次修订).
// The M3 dashboard expands this dictionary as it builds real aggregation UI.

export interface DashboardCopy {
  pageTitle: string;
  signOut: string;
  placeholderTitle: string;
  placeholderBody: string;
}

export const DASHBOARD_COPY: Record<"zh" | "en", DashboardCopy> = {
  zh: {
    pageTitle: "仪表盘",
    signOut: "登出",
    placeholderTitle: "用量聚合即将上线",
    placeholderBody: "汇总、图表与下钻将随 M3 交付；当前可在设置页管理设备。",
  },
  en: {
    pageTitle: "Dashboard",
    signOut: "Sign out",
    placeholderTitle: "Usage aggregation is on its way",
    placeholderBody:
      "Totals, charts and drill-downs ship with M3; manage devices in Settings meanwhile.",
  },
};
