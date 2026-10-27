// Dashboard copy at / (docs/ui-spec.md 仪表盘). The M5.5 dashboard follows the
// official core information architecture: filters, KPI + rolling, trend,
// models/heatmap, sources/devices, detail tabs and the cost modal.

export interface DashboardCopy {
  pageTitle: string;
  rangeLabel: string;
  tzLabel: string;
  tzBrowser: string;
  deviceLabel: string;
  allDevices: string;
  clearFilters: string;
  refresh: string;
  share: string;
  ranges: Record<"today" | "7d" | "30d" | "90d" | "all" | "custom", string>;
  cards: {
    totalTokens: string;
    billableTokens: string;
    conversations: string;
    activeDays: string;
    avgPerActiveDay: string;
    allTimeSuffix: string;
    heroAll: string;
    heroModelsCount: string;
    heroCostApprox: string;
    heroCostNote: string;
  };
  charts: {
    trendTitle: string;
    daily: string;
    monthly: string;
    tokens: string;
    cost: string;
    inputTokens: string;
    cachedTokens: string;
    outputTokens: string;
    heatmapTitle: string;
    heatmapMonths: string;
    heatmapActiveDays: string;
    heatmapLess: string;
    heatmapMore: string;
    heatmapAllPlatforms: string;
    heatmapAll: string;
    heatmapClear: string;
    heatmapPickOne: string;
    heatmapFiltered: string;
    heatmapSelectedCount: string;
    noData: string;
    ariaLabel: string;
  };
  panels: {
    modelsTitle: string;
    modelsHint: string;
    viewAll: string;
    noModels: string;
    sourcesTitle: string;
    sourcesHint: string;
    sourcesViewAll: string;
    resetHidden: string;
    devicesTitle: string;
    devicesHint: string;
    sharedNote: string;
    lastReport: string;
    never: string;
    selected: string;
    columnTokens: string;
    columnCost: string;
    columnShare: string;
  };
  detail: {
    title: string;
    daily: string;
    hourly: string;
    monthly: string;
    dayLabel: string;
    columnTime: string;
    columnTokens: string;
    columnInput: string;
    columnCached: string;
    columnOutput: string;
    columnBillable: string;
    columnCost: string;
    columnConversations: string;
    columnModels: string;
    viewModels: string;
    empty: string;
    loadError: string;
    retry: string;
    pageSummary: string;
    previous: string;
    next: string;
  };
  cost: {
    title: string;
    description: string;
    byModel: string;
    bySource: string;
    total: string;
    dailyTrend: string;
    unpriced: string;
    unpricedHint: string;
    noData: string;
    columnName: string;
    columnTokens: string;
    columnShare: string;
    columnCost: string;
    close: string;
  };
  states: {
    loadError: string;
    retry: string;
    emptyTitle: string;
    emptyBody: string;
    filterEmptyTitle: string;
    filterEmptyBody: string;
  };
  shareCard: {
    title: string;
    note: string;
    save: string;
    copyImage: string;
    copied: string;
    copyFailed: string;
    close: string;
  };
}

export const DASHBOARD_COPY: Record<"zh" | "en", DashboardCopy> = {
  zh: {
    pageTitle: "仪表盘",
    rangeLabel: "时间范围",
    tzLabel: "时区",
    tzBrowser: "浏览器时区",
    deviceLabel: "设备",
    allDevices: "全部设备",
    clearFilters: "清除筛选",
    refresh: "刷新",
    share: "分享",
    ranges: {
      today: "今天",
      "7d": "7D",
      "30d": "30D",
      "90d": "90D",
      all: "总计",
      custom: "自定义",
    },
    cards: {
      totalTokens: "总 Tokens",
      billableTokens: "计费 Tokens",
      conversations: "会话数",
      activeDays: "活跃天数",
      avgPerActiveDay: "日均（30 天）",
      allTimeSuffix: "全部时间",
      heroAll: "全部",
      heroModelsCount: "{count, plural, other {# 个模型}}",
      heroCostApprox: "≥ 为估算下限：未定价模型按 0 计，实际费用可能更高。",
      heroCostNote:
        "按读取时定价估算；未定价模型计 0，可能与 provider 上报成本存在差异。",
    },
    charts: {
      trendTitle: "用量趋势",
      daily: "按日",
      monthly: "按月",
      tokens: "Token",
      cost: "成本",
      inputTokens: "输入",
      cachedTokens: "缓存",
      outputTokens: "输出",
      heatmapTitle: "活跃热力图",
      heatmapMonths: "近一年",
      heatmapActiveDays: "{count} 个活跃日",
      heatmapLess: "少",
      heatmapMore: "多",
      heatmapAllPlatforms: "全部平台",
      heatmapAll: "全部",
      heatmapClear: "清空",
      heatmapPickOne: "请至少选择一个平台。",
      heatmapFiltered: "筛选后用量",
      heatmapSelectedCount: "已选 {count} 个平台",
      noData: "该时间范围内没有数据",
      ariaLabel: "{title}：{from} 至 {to}",
    },
    panels: {
      modelsTitle: "Top 模型",
      modelsHint: "按 Token 用量排序，前 8 个。",
      viewAll: "成本分析",
      noModels: "该时间范围内没有模型数据。",
      sourcesTitle: "来源",
      sourcesHint: "随设备筛选收窄；占比按 Token。点击来源可隐藏/显示。",
      sourcesViewAll: "查看全部（{count}）",
      resetHidden: "恢复显示全部来源",
      devicesTitle: "设备",
      devicesHint: "点击设备可只看该设备的数据。",
      sharedNote: "cursor / trae-cn 为账户级来源，跨设备已去重。",
      lastReport: "最后上报",
      never: "从未",
      selected: "已筛选",
      columnTokens: "Tokens",
      columnCost: "成本",
      columnShare: "占比",
    },
    detail: {
      title: "用量明细",
      daily: "日",
      hourly: "时",
      monthly: "月",
      dayLabel: "日期",
      columnTime: "时间",
      columnTokens: "Token",
      columnInput: "输入",
      columnCached: "缓存",
      columnOutput: "输出",
      columnBillable: "计费 Token",
      columnCost: "成本",
      columnConversations: "会话",
      columnModels: "模型数",
      viewModels: "查看模型明细",
      empty: "该时间范围内没有明细数据。",
      loadError: "明细加载失败。",
      retry: "重试",
      pageSummary: "{start}–{end} / {total}",
      previous: "上一页",
      next: "下一页",
    },
    cost: {
      title: "成本分析",
      description:
        "按读取时定价估算；未知模型计 0，可能与 provider 上报成本存在差异。",
      byModel: "按模型",
      bySource: "按来源",
      total: "总成本",
      dailyTrend: "每日成本",
      unpriced: "未定价模型",
      unpricedHint: "以下模型没有匹配到定价，成本按 0 计：{models}",
      noData: "该时间范围内没有成本数据。",
      columnName: "名称",
      columnTokens: "Token",
      columnShare: "占比",
      columnCost: "成本",
      close: "关闭",
    },
    states: {
      loadError: "仪表盘加载失败。",
      retry: "重试",
      emptyTitle: "该时间范围内没有用量数据",
      emptyBody: "在采集机上完成配对并 sync 后，数据会出现在这里。",
      filterEmptyTitle: "当前筛选没有结果",
      filterEmptyBody: "换一个时间范围或设备，或清除筛选。",
    },
    shareCard: {
      title: "分享用量卡片",
      note: "卡片只包含聚合数字与热力图，不含明细数据。",
      save: "保存图片",
      copyImage: "复制图片",
      copied: "图片已复制到剪贴板。",
      copyFailed: "复制失败，请改用「保存图片」。",
      close: "关闭",
    },
  },
  en: {
    pageTitle: "Dashboard",
    rangeLabel: "Range",
    tzLabel: "Timezone",
    tzBrowser: "Browser timezone",
    deviceLabel: "Device",
    allDevices: "All devices",
    clearFilters: "Clear filters",
    refresh: "Refresh",
    share: "Share",
    ranges: {
      today: "Today",
      "7d": "7D",
      "30d": "30D",
      "90d": "90D",
      all: "All time",
      custom: "Custom",
    },
    cards: {
      totalTokens: "Total tokens",
      billableTokens: "Billable tokens",
      conversations: "Conversations",
      activeDays: "Active days",
      avgPerActiveDay: "Daily avg (30d)",
      allTimeSuffix: "all time",
      heroAll: "All",
      heroModelsCount: "{count, plural, one {# model} other {# models}}",
      heroCostApprox:
        "≥ is a lower bound: unpriced models count as 0; actual cost may be higher.",
      heroCostNote:
        "Estimated with read-time pricing; unpriced models count as 0 and may differ from provider-reported cost.",
    },
    charts: {
      trendTitle: "Usage trend",
      daily: "Daily",
      monthly: "Monthly",
      tokens: "Tokens",
      cost: "Cost",
      inputTokens: "Input",
      cachedTokens: "Cache",
      outputTokens: "Output",
      heatmapTitle: "Activity heatmap",
      heatmapMonths: "last 12 months",
      heatmapActiveDays: "{count} active days",
      heatmapLess: "less",
      heatmapMore: "more",
      heatmapAllPlatforms: "All platforms",
      heatmapAll: "All",
      heatmapClear: "Clear",
      heatmapPickOne: "Select at least one platform.",
      heatmapFiltered: "Filtered usage",
      heatmapSelectedCount: "{count} selected",
      noData: "No data in this range",
      ariaLabel: "{title}: {from} to {to}",
    },
    panels: {
      modelsTitle: "Top models",
      modelsHint: "Ranked by tokens, top 8.",
      viewAll: "Cost analysis",
      noModels: "No model data in this range.",
      sourcesTitle: "Sources",
      sourcesHint:
        "Narrowed by the device filter; share by tokens. Click a source to hide/show it.",
      sourcesViewAll: "View all ({count})",
      resetHidden: "Show all sources",
      devicesTitle: "Devices",
      devicesHint: "Select a device to filter the dashboard.",
      sharedNote:
        "cursor / trae-cn are account-level sources, deduped across devices.",
      lastReport: "Last report",
      never: "never",
      selected: "Filtered",
      columnTokens: "Tokens",
      columnCost: "Cost",
      columnShare: "Share",
    },
    detail: {
      title: "Usage detail",
      daily: "Daily",
      hourly: "Hourly",
      monthly: "Monthly",
      dayLabel: "Date",
      columnTime: "Time",
      columnTokens: "Tokens",
      columnInput: "Input",
      columnCached: "Cache",
      columnOutput: "Output",
      columnBillable: "Billable",
      columnCost: "Cost",
      columnConversations: "Conversations",
      columnModels: "Models",
      viewModels: "View model breakdown",
      empty: "No detail rows in this range.",
      loadError: "Failed to load detail.",
      retry: "Retry",
      pageSummary: "{start}–{end} / {total}",
      previous: "Previous",
      next: "Next",
    },
    cost: {
      title: "Cost analysis",
      description:
        "Estimated with read-time pricing; unknown models count as 0 and may differ from provider-reported cost.",
      byModel: "By model",
      bySource: "By source",
      total: "Total cost",
      dailyTrend: "Daily cost",
      unpriced: "Unpriced models",
      unpricedHint: "No pricing matched for: {models}",
      noData: "No cost data in this range.",
      columnName: "Name",
      columnTokens: "Tokens",
      columnShare: "Share",
      columnCost: "Cost",
      close: "Close",
    },
    states: {
      loadError: "Failed to load the dashboard.",
      retry: "Retry",
      emptyTitle: "No usage in this range",
      emptyBody: "Pair a collector and sync — data will show up here.",
      filterEmptyTitle: "No results for these filters",
      filterEmptyBody: "Try another range or device, or clear the filters.",
    },
    shareCard: {
      title: "Share usage card",
      note: "The card contains aggregate numbers and the heatmap only — no row-level data.",
      save: "Save image",
      copyImage: "Copy image",
      copied: "Image copied to the clipboard.",
      copyFailed: "Copy failed — use Save image instead.",
      close: "Close",
    },
  },
};
