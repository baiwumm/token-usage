// Demo instance copy (docs/demo-instance-plan.md §5). One banner plus the
// shared read-only hint; everything else reuses the normal page copy.

import type { Locale } from "./locale-config";

export interface DemoCopy {
  banner: {
    title: string;
    body: string;
  };
  readOnly: string;
  login: {
    title: string;
    body: string;
    action: string;
    unavailable: string;
  };
}

export const DEMO_COPY: Record<Locale, DemoCopy> = {
  zh: {
    banner: {
      title: "演示实例 · 只读",
      body: "数据为虚构的 120 天样例，每晚重置；写操作与设备配对已关闭。自部署后即可采集自己的用量。",
    },
    readOnly: "演示实例不可修改",
    login: {
      title: "演示实例无需登录",
      body: "打开首页即自动进入演示仪表盘；这里没有可登录的表单。",
      action: "前往仪表盘",
      unavailable: "演示自动登录暂时不可用，请稍后重试。",
    },
  },
  en: {
    banner: {
      title: "Demo instance · read-only",
      body: "Fictional 120-day sample data, reset nightly. Writes and device pairing are disabled — self-host to collect your own usage.",
    },
    readOnly: "Not editable on the demo instance",
    login: {
      title: "No sign-in on the demo",
      body: "Opening the site root enters the demo dashboard automatically; there is no login form here.",
      action: "Open the dashboard",
      unavailable:
        "Automatic demo sign-in is temporarily unavailable. Please try again later.",
    },
  },
};
