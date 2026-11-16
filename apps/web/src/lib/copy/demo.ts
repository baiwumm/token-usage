// Demo instance copy (docs/demo-instance-plan.md §5). One banner plus the
// shared read-only hint; everything else reuses the normal page copy.

import type { Locale } from "./locale-config";

export interface DemoCopy {
  banner: {
    title: string;
    body: string;
  };
  readOnly: string;
}

export const DEMO_COPY: Record<Locale, DemoCopy> = {
  zh: {
    banner: {
      title: "演示实例 · 只读",
      body: "数据为虚构的 120 天样例，每晚重置；写操作与设备配对已关闭。自部署后即可采集自己的用量。",
    },
    readOnly: "演示实例不可修改",
  },
  en: {
    banner: {
      title: "Demo instance · read-only",
      body: "Fictional 120-day sample data, reset nightly. Writes and device pairing are disabled — self-host to collect your own usage.",
    },
    readOnly: "Not editable on the demo instance",
  },
};
