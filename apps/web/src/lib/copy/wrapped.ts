// Wrapped (annual review) copy. Share-card strings live in lib/copy/share-card
// (shared with the dashboard modal).

export interface WrappedCopy {
  pageTitle: string;
  yearSuffix: string;
  yearAriaLabel: string;
  cards: {
    totalTokens: string;
    cost: string;
    conversations: string;
    activeDays: string;
  };
  achievementsTitle: string;
  achievementsCount: string;
  achievementsEmpty: string;
  monthlyTitle: string;
  // Composition legend + tooltip rows for the monthly chart (distinct labels:
  // reusing one string for every series collapses the legend and tooltip).
  trend: {
    input: string;
    cached: string;
    output: string;
  };
  highlightsTitle: string;
  topModel: string;
  topSource: string;
  peakDay: string;
  sourcesTitle: string;
  modelsTitle: string;
  modelsEmpty: string;
  table: {
    model: string;
    tokens: string;
    cost: string;
    share: string;
  };
  emptyTitle: string;
  emptyBody: string;
  loadError: string;
  retry: string;
}

export const WRAPPED_COPY: Record<"zh" | "en", WrappedCopy> = {
  zh: {
    pageTitle: "年度回顾",
    yearSuffix: "年度回顾",
    yearAriaLabel: "选择年份",
    cards: {
      totalTokens: "全年 Tokens",
      cost: "全年成本（USD）",
      conversations: "全年会话",
      activeDays: "活跃天数",
    },
    achievementsTitle: "已解锁成就",
    achievementsCount: "共 {count} 枚",
    achievementsEmpty: "还没有解锁成就。",
    monthlyTitle: "月度趋势",
    trend: {
      input: "输入",
      cached: "缓存",
      output: "输出",
    },
    highlightsTitle: "年度亮点",
    topModel: "最常用模型",
    topSource: "最常用来源",
    peakDay: "最高产的一天",
    sourcesTitle: "来源用量",
    modelsTitle: "模型用量",
    modelsEmpty: "这一年没有上报模型明细。",
    table: {
      model: "模型",
      tokens: "Tokens",
      cost: "成本",
      share: "占比",
    },
    emptyTitle: "这一年还没有数据",
    emptyBody: "完成配对并同步用量后，年度回顾会在这里生成。",
    loadError: "年度回顾加载失败。",
    retry: "重试",
  },
  en: {
    pageTitle: "Wrapped",
    yearSuffix: "Wrapped",
    yearAriaLabel: "Year",
    cards: {
      totalTokens: "Tokens this year",
      cost: "Cost this year (USD)",
      conversations: "Conversations",
      activeDays: "Active days",
    },
    achievementsTitle: "Achievements unlocked",
    achievementsCount: "{count} earned",
    achievementsEmpty: "No achievements unlocked yet.",
    monthlyTitle: "Monthly trend",
    trend: {
      input: "Input",
      cached: "Cached",
      output: "Output",
    },
    highlightsTitle: "Highlights",
    topModel: "Top model",
    topSource: "Top source",
    peakDay: "Biggest day",
    sourcesTitle: "Source usage",
    modelsTitle: "Model usage",
    modelsEmpty: "No model breakdown was reported this year.",
    table: {
      model: "Model",
      tokens: "Tokens",
      cost: "Cost",
      share: "Share",
    },
    emptyTitle: "No data for this year yet",
    emptyBody: "Pair a collector and sync — your wrapped will show up here.",
    loadError: "Failed to load your wrapped.",
    retry: "Retry",
  },
};
