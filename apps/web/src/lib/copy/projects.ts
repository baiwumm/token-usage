// Projects page copy (/projects, docs/projects-page-plan.md 批次 1). The list
// aggregates session metadata by project basename; the scope note spells out
// which sources are covered and that costs are list-price estimates.

export interface ProjectsCopy {
  rangeLabel: string;
  ranges: Record<"7d" | "30d", string>;
  sortLabel: string;
  sortTokens: string;
  sortCost: string;
  refresh: string;
  lastUpdated: string;
  lastUpdatedNone: string;
  scopeNote: string;
  list: {
    title: string;
    hint: string;
    project: string;
    tokens: string;
    cost: string;
    dayPeak: string;
    sessions: string;
    lastActive: string;
    unattributed: string;
    unattributedHint: string;
  };
  states: {
    loadError: string;
    retry: string;
    emptyTitle: string;
    emptyBody: string;
    emptyPair: string;
    emptyDocs: string;
  };
}

export const PROJECTS_COPY: Record<"zh" | "en", ProjectsCopy> = {
  zh: {
    rangeLabel: "时间范围",
    ranges: {
      "7d": "7D",
      "30d": "30D",
    },
    sortLabel: "排序",
    sortTokens: "按 Token",
    sortCost: "按费用",
    refresh: "刷新",
    lastUpdated: "上次更新 {time}",
    lastUpdatedNone: "尚未加载数据",
    scopeNote:
      "本页数据来自会话元数据（session sidecar），覆盖 Claude Code / Codex / Grok / OpenCode / ZCode / Kimi 等来源（本机实测约占 77% token）；MiniMax Code、Trae、DeepSeek Harness、WorkBuddy 等暂不在其中；Cursor / Trae CN 为账户级来源，永不出现在本页。费用为刊例价（list price）估算，订阅制来源可能与实际账单有偏差。",
    list: {
      title: "项目",
      hint: "按项目名（目录 basename）聚合会话；同名项目跨设备天然合并。",
      project: "项目",
      tokens: "Token",
      cost: "费用",
      dayPeak: "日峰值",
      sessions: "会话数",
      lastActive: "最近活跃",
      unattributed: "未归因",
      unattributedHint:
        "这些会话没有项目名（部分来源不支持上报项目）。升级采集器或改用支持会话元数据的来源后，会自动归入项目。",
    },
    states: {
      loadError: "项目加载失败。",
      retry: "重试",
      emptyTitle: "还没有项目数据",
      emptyBody:
        "项目页统计来自会话元数据。配对设备并用新版采集器执行 sync 后，支持会话的来源会自动带上项目名。",
      emptyPair: "配对设备",
      emptyDocs: "快速开始",
    },
  },
  en: {
    rangeLabel: "Range",
    ranges: {
      "7d": "7D",
      "30d": "30D",
    },
    sortLabel: "Sort",
    sortTokens: "By tokens",
    sortCost: "By cost",
    refresh: "Refresh",
    lastUpdated: "Updated {time}",
    lastUpdatedNone: "No data loaded yet",
    scopeNote:
      "This page is built from session metadata (session sidecar), covering sources such as Claude Code / Codex / Grok / OpenCode / ZCode / Kimi (about 77% of tokens in local measurement); MiniMax Code, Trae, DeepSeek Harness, WorkBuddy and others are not covered yet; Cursor / Trae CN are account-level sources and never appear here. Costs are list-price estimates and may differ from actual billing for subscription-based sources.",
    list: {
      title: "Projects",
      hint: "Sessions grouped by project basename; same-named projects merge across devices.",
      project: "Project",
      tokens: "Tokens",
      cost: "Cost",
      dayPeak: "Peak day",
      sessions: "Sessions",
      lastActive: "Last active",
      unattributed: "Unattributed",
      unattributedHint:
        "These sessions carry no project name (some sources cannot report one). Upgrade the collector or use a session-metadata source and they will be attributed automatically.",
    },
    states: {
      loadError: "Failed to load projects.",
      retry: "Retry",
      emptyTitle: "No project data yet",
      emptyBody:
        "Projects are aggregated from session metadata. Pair a device and run sync with the new collector, and supported sources will report project names automatically.",
      emptyPair: "Pair a device",
      emptyDocs: "Quick start",
    },
  },
};
