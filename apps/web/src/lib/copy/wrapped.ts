// Wrapped (annual review) copy. The share card renders from the wrapped data
// itself, not from copy strings beyond labels.

export interface WrappedCopy {
  pageTitle: string;
  yearSuffix: string;
  cards: {
    totalTokens: string;
    cost: string;
    conversations: string;
    activeDays: string;
  };
  monthlyTitle: string;
  highlightsTitle: string;
  topModel: string;
  topSource: string;
  peakDay: string;
  modelsTitle: string;
  emptyTitle: string;
  emptyBody: string;
  loading: string;
  loadError: string;
  retry: string;
  share: {
    button: string;
    exporting: string;
    exported: string;
    exportFailed: string;
    cardTitle: string;
    cardCaption: string;
  };
}

export const WRAPPED_COPY: Record<"zh" | "en", WrappedCopy> = {
  zh: {
    pageTitle: "年度回顾",
    yearSuffix: "年度回顾",
    cards: {
      totalTokens: "全年 Tokens",
      cost: "全年成本（USD）",
      conversations: "全年会话",
      activeDays: "活跃天数",
    },
    monthlyTitle: "月度趋势",
    highlightsTitle: "年度亮点",
    topModel: "最常用模型",
    topSource: "最常用来源",
    peakDay: "最高产的一天",
    modelsTitle: "模型用量",
    emptyTitle: "这一年还没有数据",
    emptyBody: "完成配对并同步用量后，年度回顾会在这里生成。",
    loading: "正在生成年度回顾…",
    loadError: "年度回顾加载失败。",
    retry: "重试",
    share: {
      button: "导出分享卡片",
      exporting: "正在生成…",
      exported: "分享卡片已保存。",
      exportFailed: "导出失败，请重试。",
      cardTitle: "我的 {year} Token Usage",
      cardCaption: "自托管 AI 用量追踪 · token-usage",
    },
  },
  en: {
    pageTitle: "Wrapped",
    yearSuffix: "Wrapped",
    cards: {
      totalTokens: "Tokens this year",
      cost: "Cost this year (USD)",
      conversations: "Conversations",
      activeDays: "Active days",
    },
    monthlyTitle: "Monthly trend",
    highlightsTitle: "Highlights",
    topModel: "Top model",
    topSource: "Top source",
    peakDay: "Biggest day",
    modelsTitle: "Model usage",
    emptyTitle: "No data for this year yet",
    emptyBody: "Pair a collector and sync — your wrapped will show up here.",
    loading: "Generating your wrapped…",
    loadError: "Failed to load your wrapped.",
    retry: "Retry",
    share: {
      button: "Export share card",
      exporting: "Generating…",
      exported: "Share card saved.",
      exportFailed: "Export failed — try again.",
      cardTitle: "My {year} Token Usage",
      cardCaption: "Self-hosted AI usage tracking · token-usage",
    },
  },
};
