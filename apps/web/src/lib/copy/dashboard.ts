// Dashboard copy at / (docs/requirements.md 范围表). The M3 dashboard uses
// the shared zh/en pipeline; device management lives in Settings copy.

export interface DashboardCopy {
  pageTitle: string;
  rangeLabel: string;
  tzLabel: string;
  tzBrowser: string;
  ranges: Record<"7d" | "30d" | "90d" | "12m" | "custom", string>;
  cards: {
    totalTokens: string;
    billableTokens: string;
    cost: string;
    conversations: string;
    activeDays: string;
    allTimeSuffix: string;
  };
  charts: {
    dailyTitle: string;
    dailyBar: string;
    hourlyTitle: string;
    hourlyEmpty: string;
    heatmapTitle: string;
    heatmapMonths: string;
  };
  panels: {
    modelsTitle: string;
    sourcesTitle: string;
    devicesTitle: string;
    devicesHint: string;
    devicesManage: string;
    sharedNote: string;
    columnModel: string;
    columnTokens: string;
    columnCost: string;
    columnShare: string;
    columnSource: string;
    columnDevice: string;
    columnPlatform: string;
    columnLastUsed: string;
    columnStatus: string;
    statusActive: string;
    statusRevoked: string;
    never: string;
  };
  states: {
    loading: string;
    loadError: string;
    retry: string;
    emptyTitle: string;
    emptyBody: string;
    sessionExpired: string;
  };
}

export const DASHBOARD_COPY: Record<"zh" | "en", DashboardCopy> = {
  zh: {
    pageTitle: "仪表盘",
    rangeLabel: "时间范围",
    tzLabel: "时区",
    tzBrowser: "浏览器时区",
    ranges: {
      "7d": "近 7 天",
      "30d": "近 30 天",
      "90d": "近 90 天",
      "12m": "近 12 个月",
      custom: "自定义",
    },
    cards: {
      totalTokens: "总 Tokens",
      billableTokens: "计费 Tokens",
      cost: "成本（USD）",
      conversations: "会话数",
      activeDays: "活跃天数",
      allTimeSuffix: "全部时间",
    },
    charts: {
      dailyTitle: "每日用量",
      dailyBar: "Tokens",
      hourlyTitle: "当日分时",
      hourlyEmpty: "点击上方柱形查看该日分时用量。",
      heatmapTitle: "活跃热力图",
      heatmapMonths: "近半年",
    },
    panels: {
      modelsTitle: "模型分布",
      sourcesTitle: "来源分布",
      devicesTitle: "设备",
      devicesHint: "管理与吊销在设置页进行。",
      devicesManage: "前往设置",
      sharedNote: "cursor / trae-cn 为账户级来源，跨设备已去重。",
      columnModel: "模型",
      columnTokens: "Tokens",
      columnCost: "成本",
      columnShare: "占比",
      columnSource: "来源",
      columnDevice: "设备",
      columnPlatform: "平台",
      columnLastUsed: "最近上报",
      columnStatus: "状态",
      statusActive: "活跃",
      statusRevoked: "已吊销",
      never: "从未",
    },
    states: {
      loading: "正在加载仪表盘…",
      loadError: "仪表盘加载失败。",
      retry: "重试",
      emptyTitle: "该时间范围内没有用量数据",
      emptyBody: "在采集机上完成配对并 sync 后，数据会出现在这里。",
      sessionExpired: "登录状态已失效，请重新登录。",
    },
  },
  en: {
    pageTitle: "Dashboard",
    rangeLabel: "Range",
    tzLabel: "Timezone",
    tzBrowser: "Browser timezone",
    ranges: {
      "7d": "Last 7 days",
      "30d": "Last 30 days",
      "90d": "Last 90 days",
      "12m": "Last 12 months",
      custom: "Custom",
    },
    cards: {
      totalTokens: "Total tokens",
      billableTokens: "Billable tokens",
      cost: "Cost (USD)",
      conversations: "Conversations",
      activeDays: "Active days",
      allTimeSuffix: "all time",
    },
    charts: {
      dailyTitle: "Daily usage",
      dailyBar: "Tokens",
      hourlyTitle: "Intraday",
      hourlyEmpty: "Click a bar above to see that day's hourly usage.",
      heatmapTitle: "Activity heatmap",
      heatmapMonths: "last 6 months",
    },
    panels: {
      modelsTitle: "Models",
      sourcesTitle: "Sources",
      devicesTitle: "Devices",
      devicesHint: "Manage and revoke in Settings.",
      devicesManage: "Open Settings",
      sharedNote:
        "cursor / trae-cn are account-level sources, deduped across devices.",
      columnModel: "Model",
      columnTokens: "Tokens",
      columnCost: "Cost",
      columnShare: "Share",
      columnSource: "Source",
      columnDevice: "Device",
      columnPlatform: "Platform",
      columnLastUsed: "Last report",
      columnStatus: "Status",
      statusActive: "Active",
      statusRevoked: "Revoked",
      never: "never",
    },
    states: {
      loading: "Loading dashboard…",
      loadError: "Failed to load the dashboard.",
      retry: "Retry",
      emptyTitle: "No usage in this range",
      emptyBody: "Pair a collector and sync — data will show up here.",
      sessionExpired: "Your session has expired. Please sign in again.",
    },
  },
};
