// Projects page copy (/projects, docs/projects-page-plan.md 批次 1/4). The
// scope note and the session-count label follow the active caliber: session
// metadata (session sidecar) vs hourly usage buckets.

export interface ProjectsCopy {
  rangeLabel: string;
  ranges: Record<"7d" | "30d", string>;
  sortLabel: string;
  sortTokens: string;
  sortCost: string;
  refresh: string;
  lastUpdated: string;
  lastUpdatedNone: string;
  scopeNote: Record<"sessions" | "hourly", string>;
  list: {
    title: string;
    hint: string;
    hintHourly: string;
    project: string;
    tokens: string;
    cost: string;
    dayPeak: string;
    sessions: string;
    sessionsHourly: string;
    lastActive: string;
    unattributed: string;
    unattributedHint: string;
    unattributedHintHourly: string;
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
    scopeNote: {
      sessions:
        "本页数据来自会话元数据（session sidecar），覆盖 Claude Code / Codex / Grok / OpenCode / ZCode / Kimi 等来源（本机实测约占 77% token）；MiniMax Code、Trae、DeepSeek Harness、WorkBuddy 等暂不在其中；Cursor / Trae CN 为账户级来源，永不出现在本页。费用为刊例价（list price）估算，订阅制来源可能与实际账单有偏差。零用量项目（只有会话壳、没有 token/费用/积分的项目，如工具自建的临时目录）不列出行，它们本就为 0，不影响合计。",
      hourly:
        "本页数据来自用量桶（token_usage_hourly），按小时把 token 归到项目名；同一小时无法归因的部分单列为「未归因」，不与项目重复计入，各行合计仍等于仪表盘总量。费用为按刊例价（list price）实时估算，与仪表盘使用同一套定价引擎；订阅制来源可能与实际账单有偏差。项目归因依赖采集器上报项目名，未上报的用量会落在「未归因」。零用量项目（token、费用、积分都为 0 的项目行）不列出行，它们本就为 0，不影响合计。",
    },
    list: {
      title: "项目",
      hint: "按项目名（目录 basename）聚合会话；同名项目跨设备天然合并。",
      hintHourly:
        "按项目名（目录 basename）聚合用量桶；「会话条目」是按小时桶累加的会话计数，并非去重后的会话数量。",
      project: "项目",
      tokens: "Token",
      cost: "费用",
      dayPeak: "日峰值",
      sessions: "会话数",
      sessionsHourly: "会话条目",
      lastActive: "最近活跃",
      unattributed: "未归因",
      unattributedHint:
        "这些会话没有项目名（部分来源不支持上报项目）。升级采集器或改用支持会话元数据的来源后，会自动归入项目。",
      unattributedHintHourly:
        "这些用量桶没有项目名（采集器未上报项目）。升级采集器后，归因会自动落到对应项目。",
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
    scopeNote: {
      sessions:
        "This page is built from session metadata (session sidecar), covering sources such as Claude Code / Codex / Grok / OpenCode / ZCode / Kimi (about 77% of tokens in local measurement); MiniMax Code, Trae, DeepSeek Harness, WorkBuddy and others are not covered yet; Cursor / Trae CN are account-level sources and never appear here. Costs are list-price estimates and may differ from actual billing for subscription-based sources. Zero-usage projects (session shells with no tokens, cost or credits, such as scratch directories created by tools) are not listed; they already carry 0, so the totals are unaffected.",
      hourly:
        "This page is built from hourly usage buckets (token_usage_hourly), attributing tokens to project names per hour; the part that cannot be attributed within an hour is listed separately as Unattributed, never double-counted, and every row still sums to the dashboard total. Costs are list-price estimates computed live with the same pricing engine the dashboard uses, and may differ from actual billing for subscription-based sources. Project attribution depends on the collector reporting a project name; usage that does not carry one lands in Unattributed. Zero-usage project rows (0 tokens, cost and credits) are not listed; they already carry 0, so the totals are unaffected.",
    },
    list: {
      title: "Projects",
      hint: "Sessions grouped by project basename; same-named projects merge across devices.",
      hintHourly:
        'Hourly usage buckets grouped by project basename; "Session entries" sums per-hour bucket conversation counts, not distinct sessions.',
      project: "Project",
      tokens: "Tokens",
      cost: "Cost",
      dayPeak: "Peak day",
      sessions: "Sessions",
      sessionsHourly: "Session entries",
      lastActive: "Last active",
      unattributed: "Unattributed",
      unattributedHint:
        "These sessions carry no project name (some sources cannot report one). Upgrade the collector or use a session-metadata source and they will be attributed automatically.",
      unattributedHintHourly:
        "These usage buckets carry no project name (the collector did not report one). Upgrade the collector and attribution will land on the matching projects automatically.",
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
