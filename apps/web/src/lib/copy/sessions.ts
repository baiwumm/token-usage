// Sessions page copy (/sessions, docs/ui-spec.md Sessions). Device-level
// metadata only: no prompts, message bodies, titles, absolute paths or resume
// commands are ever rendered.

export interface SessionsCopy {
  rangeLabel: string;
  ranges: Record<"7d" | "30d" | "90d" | "custom", string>;
  deviceLabel: string;
  allDevices: string;
  sourceLabel: string;
  allSources: string;
  projectLabel: string;
  projectPlaceholder: string;
  clearFilters: string;
  cards: {
    sessions: string;
    tokens: string;
    cost: string;
    avgDuration: string;
    avgHint: string;
    emptyValue: string;
  };
  list: {
    title: string;
    hint: string;
    endedAt: string;
    source: string;
    project: string;
    device: string;
    duration: string;
    tokens: string;
    cost: string;
    models: string;
    detail: string;
    noProject: string;
    pageSummary: string;
    previous: string;
    next: string;
    moreModels: string;
  };
  detail: {
    title: string;
    duration: string;
    tokensTitle: string;
    input: string;
    cached: string;
    cacheCreation: string;
    output: string;
    reasoning: string;
    total: string;
    billable: string;
    modelsTitle: string;
    modelName: string;
    modelTokens: string;
    modelShare: string;
    modelCost: string;
    privacy: string;
    costNote: string;
    close: string;
  };
  states: {
    loadError: string;
    retry: string;
    emptyTitle: string;
    emptyBody: string;
    emptyPair: string;
    emptyDocs: string;
    filterEmptyTitle: string;
    filterEmptyBody: string;
  };
}

export const SESSIONS_COPY: Record<"zh" | "en", SessionsCopy> = {
  zh: {
    rangeLabel: "时间范围",
    ranges: {
      "7d": "近 7 天",
      "30d": "近 30 天",
      "90d": "近 90 天",
      custom: "自定义",
    },
    deviceLabel: "设备",
    allDevices: "全部设备",
    sourceLabel: "来源",
    allSources: "全部来源",
    projectLabel: "项目",
    projectPlaceholder: "搜索项目名",
    clearFilters: "清除筛选",
    cards: {
      sessions: "会话数",
      tokens: "总 Tokens",
      cost: "成本",
      avgDuration: "平均时长",
      avgHint: "每个会话",
      emptyValue: "—",
    },
    list: {
      title: "会话",
      hint: "按结束时间倒序；仅显示设备级会话元数据。",
      endedAt: "结束时间",
      source: "来源",
      project: "项目",
      device: "设备",
      duration: "时长",
      tokens: "Token",
      cost: "成本",
      models: "模型",
      detail: "详情",
      noProject: "未标注",
      pageSummary: "{start}–{end} / {total}",
      previous: "上一页",
      next: "下一页",
      moreModels: "+{count}",
    },
    detail: {
      title: "会话详情",
      duration: "时长",
      tokensTitle: "Token 拆分",
      input: "输入",
      cached: "缓存读取",
      cacheCreation: "缓存写入",
      output: "输出",
      reasoning: "推理",
      total: "总计",
      billable: "计费",
      modelsTitle: "模型拆分",
      modelName: "模型",
      modelTokens: "Token",
      modelShare: "占比",
      modelCost: "成本",
      privacy: "仅用量元数据，不含对话内容、路径或命令。",
      costNote: "按模型定价估算，可能与仪表盘 provider 上报成本存在差异。",
      close: "关闭",
    },
    states: {
      loadError: "会话加载失败。",
      retry: "重试",
      emptyTitle: "等待新版采集器",
      emptyBody:
        "Sessions 只读取设备上报的会话元数据，不会从小时用量推导。升级 CLI 并执行 sync 后，会话会出现在这里。",
      emptyPair: "配对设备",
      emptyDocs: "升级文档",
      filterEmptyTitle: "当前筛选没有会话",
      filterEmptyBody: "换一个时间范围、设备或来源，或清除筛选。",
    },
  },
  en: {
    rangeLabel: "Range",
    ranges: {
      "7d": "Last 7 days",
      "30d": "Last 30 days",
      "90d": "Last 90 days",
      custom: "Custom",
    },
    deviceLabel: "Device",
    allDevices: "All devices",
    sourceLabel: "Source",
    allSources: "All sources",
    projectLabel: "Project",
    projectPlaceholder: "Search project",
    clearFilters: "Clear filters",
    cards: {
      sessions: "Sessions",
      tokens: "Total tokens",
      cost: "Cost",
      avgDuration: "Average duration",
      avgHint: "per session",
      emptyValue: "—",
    },
    list: {
      title: "Sessions",
      hint: "Newest first; device-level session metadata only.",
      endedAt: "Ended",
      source: "Source",
      project: "Project",
      device: "Device",
      duration: "Duration",
      tokens: "Tokens",
      cost: "Cost",
      models: "Models",
      detail: "Details",
      noProject: "Unlabeled",
      pageSummary: "{start}–{end} / {total}",
      previous: "Previous",
      next: "Next",
      moreModels: "+{count}",
    },
    detail: {
      title: "Session details",
      duration: "Duration",
      tokensTitle: "Token breakdown",
      input: "Input",
      cached: "Cache read",
      cacheCreation: "Cache write",
      output: "Output",
      reasoning: "Reasoning",
      total: "Total",
      billable: "Billable",
      modelsTitle: "Model breakdown",
      modelName: "Model",
      modelTokens: "Tokens",
      modelShare: "Share",
      modelCost: "Cost",
      privacy:
        "Usage metadata only — no conversation content, paths or commands.",
      costNote:
        "Estimated from model pricing and may differ from provider-reported cost on the dashboard.",
      close: "Close",
    },
    states: {
      loadError: "Failed to load sessions.",
      retry: "Retry",
      emptyTitle: "Waiting for the new collector",
      emptyBody:
        "Sessions reads device-reported session metadata only — it never derives sessions from hourly buckets. Upgrade the CLI and run sync to see them here.",
      emptyPair: "Pair a device",
      emptyDocs: "Upgrade guide",
      filterEmptyTitle: "No sessions match these filters",
      filterEmptyBody: "Try another range, device or source, or clear filters.",
    },
  },
};
