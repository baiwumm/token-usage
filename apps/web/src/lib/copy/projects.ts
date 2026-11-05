// Projects page copy (/projects, docs/ui-spec.md「项目（`/projects`）」节). The
// scope note and the session-count label follow the active caliber: session
// metadata (session sidecar) vs hourly usage buckets.
//
// 2026-11-05: list/card views, the project detail modal and the review-mode
// effect catalogue all keep their strings here (zh / en typed dictionary).

export type ProjectEffectId =
  | "hoverLift"
  | "meterFlow"
  | "selectedRail"
  | "staggerRows"
  | "dialogEntrance"
  | "detailCrossfade"
  | "flowNumbers"
  | "chartBars"
  | "dayDrilldown"
  | "skeletonShimmer"
  | "stateMotion";

export interface ProjectsCopy {
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
    viewLabel: string;
    viewList: string;
    viewCards: string;
    count: string;
    sortedBy: string;
    relativeBar: string;
    sourcesMore: string;
    filteredNote: string;
    openDetail: string;
    estimated: string;
    shareOfWindow: string;
    limitLabel: string;
    limitAll: string;
    limitTop: string;
    showing: string;
  };
  summary: {
    title: string;
    tokens: string;
    cost: string;
    projects: string;
    unattributed: string;
    filtered: string;
    period: string;
    allTime: string;
  };
  detail: {
    title: string;
    badge: string;
    close: string;
    previous: string;
    next: string;
    total: string;
    share: string;
    shareHint: string;
    cost: string;
    conversations: string;
    activeDays: string;
    avgPerActiveDay: string;
    dayPeak: string;
    lastActive: string;
    credits: string;
    fields: string;
    daily: string;
    sources: string;
    composition: string;
    input: string;
    cached: string;
    cacheCreation: string;
    output: string;
    reasoning: string;
    sourceDays: string;
    sourceConversations: string;
    daySelected: string;
    dayClear: string;
    pinHint: string;
    empty: string;
    loadError: string;
    retry: string;
    costNote: string;
    creditsNote: string;
    privacyNote: string;
    caliberNote: string;
    chartLabel: string;
    dailyHint: string;
  };
  states: {
    loadError: string;
    retry: string;
    emptyTitle: string;
    emptyBody: string;
    emptyPair: string;
    emptyDocs: string;
    emptyFilterTitle: string;
    emptyFilterBody: string;
    emptyFilterAction: string;
    stale: string;
  };
  review: {
    open: string;
    close: string;
    title: string;
    subtitle: string;
    demo: string;
    live: string;
    demoBadge: string;
    reset: string;
    preview: string;
    on: string;
    off: string;
    useDemo: string;
    useLive: string;
    allOn: string;
    allOff: string;
    groups: Record<"rows" | "dialog" | "states", string>;
    stateLabel: string;
    stateReady: string;
    stateLoading: string;
    stateEmpty: string;
    stateError: string;
    stateDetailError: string;
    openDetail: string;
  };
  effects: Record<ProjectEffectId, { label: string; description: string }>;
}

export const PROJECTS_COPY: Record<"zh" | "en", ProjectsCopy> = {
  zh: {
    sortLabel: "排序",
    sortTokens: "按 Token",
    sortCost: "按费用",
    refresh: "刷新",
    lastUpdated: "上次更新 {time}",
    lastUpdatedNone: "尚未加载数据",
    scopeNote: {
      sessions:
        "本页数据来自会话元数据（session sidecar），覆盖 Claude Code / Codex / Grok / OpenCode / ZCode / Kimi 等来源（本机实测约占 77% token）；MiniMax Code、Trae、DeepSeek Harness、WorkBuddy 等暂不在其中；Cursor / Trae CN 为账户级来源，永不出现在本页。费用为刊例价（list price）估算，订阅制来源可能与实际账单有偏差。零用量项目（只有会话壳、没有 token/费用/积分的项目，如工具自建的临时目录）不列出行，它们本就为 0，不影响合计。另有 credits-only 来源（如 qoder-cn）只贡献积分，不贡献 token 与费用，因此它们的会话可见、积分非零，但 token/费用为 0 属正常。",
      hourly:
        "本页数据来自用量桶（token_usage_hourly），按小时把 token 归到项目名；同一小时无法归因的部分单列为「未归因」，不与项目重复计入，各行合计仍等于仪表盘总量。费用为按刊例价（list price）实时估算，与仪表盘使用同一套定价引擎；订阅制来源可能与实际账单有偏差。项目归因依赖采集器上报项目名，未上报的用量会落在「未归因」。零用量项目（token、费用、积分都为 0 的项目行）不列出行，它们本就为 0，不影响合计。另有 credits-only 来源（如 qoder-cn）只贡献积分，不贡献 token 与费用，因此它们的会话条目可见、积分非零，但 token/费用为 0 属正常。",
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
      viewLabel: "展示",
      viewList: "列表",
      viewCards: "卡片",
      count: "共 {count} 个项目",
      sortedBy: "按{sort}降序",
      relativeBar: "相对最高项（非占比）",
      sourcesMore: "+{count}",
      filteredNote: "另有 {count} 个零用量项目未列出",
      openDetail: "查看 {project} 详情",
      estimated: "估算",
      shareOfWindow: "占窗口 {percent}",
      limitLabel: "数量",
      limitAll: "全部项目",
      limitTop: "前 {count} 名",
      showing: "显示前 {count} 名 · 共 {total} 个项目",
    },
    summary: {
      title: "窗口概览",
      tokens: "总 Token",
      cost: "总费用",
      projects: "项目数",
      unattributed: "未归因",
      filtered: "零用量未列出",
      period: "{from} – {to}",
      allTime: "全部时间 · {from} – {to}",
    },
    detail: {
      title: "项目详情",
      badge: "项目",
      close: "关闭项目详情",
      previous: "上一个项目",
      next: "下一个项目",
      total: "Token 总量",
      share: "占总量比例",
      shareHint: "分母为同窗口全部项目（含未归因）的 Token 合计",
      cost: "费用（估算）",
      conversations: "会话数",
      activeDays: "活跃天数",
      avgPerActiveDay: "日均（活跃日）",
      dayPeak: "日峰值",
      lastActive: "最近活跃",
      credits: "积分",
      fields: "完整字段",
      daily: "每日活跃",
      sources: "按来源",
      composition: "TOKEN 构成",
      input: "输入",
      cached: "缓存读取",
      cacheCreation: "缓存写入",
      output: "输出",
      reasoning: "推理",
      sourceDays: "{count} 天",
      sourceConversations: "{count} 次对话",
      daySelected: "已选 {date}",
      dayClear: "清除日期",
      pinHint: "点击柱子可固定当天明细",
      empty: "所选时间范围内该项目没有用量",
      loadError: "项目详情加载失败。",
      retry: "重试",
      costNote:
        "费用为按模型定价的刊例价估算，订阅制来源可能与实际账单有偏差。",
      creditsNote: "积分为独立维度，不计入 Token、费用与占比。",
      privacyNote: "仅展示用量元数据，不含对话内容、路径或命令。",
      caliberNote: "口径：{caliber}",
      chartLabel: "每日 Token 用量柱状图",
      dailyHint: "每日活跃展示最近 {days} 天",
    },
    states: {
      loadError: "项目加载失败。",
      retry: "重试",
      emptyTitle: "还没有项目数据",
      emptyBody:
        "项目页统计来自会话元数据。配对设备并用新版采集器执行 sync 后，支持会话的来源会自动带上项目名。",
      emptyPair: "配对设备",
      emptyDocs: "快速开始",
      emptyFilterTitle: "没有可展示的项目",
      emptyFilterBody:
        "部分项目只有会话壳、没有 token / 费用 / 积分，已被隐藏。",
      emptyFilterAction: "刷新",
      stale: "刷新失败，当前显示的是上次成功加载的数据。",
    },
    review: {
      open: "效果审阅",
      close: "退出审阅",
      title: "候选效果审阅",
      subtitle:
        "逐项开关并单独预览，用于审核决定最终保留哪些效果。演示数据仅用于效果核对，不会写入任何接口。",
      demo: "演示数据",
      live: "真实数据",
      demoBadge: "演示数据 · 非真实用量",
      reset: "恢复默认",
      preview: "预览",
      on: "已启用",
      off: "已关闭",
      useDemo: "使用演示数据",
      useLive: "使用真实数据",
      allOn: "全部启用",
      allOff: "全部关闭",
      groups: { rows: "列表与卡片", dialog: "弹窗与详情", states: "状态反馈" },
      stateLabel: "模拟状态",
      stateReady: "正常",
      stateLoading: "加载中",
      stateEmpty: "空态",
      stateError: "错误",
      stateDetailError: "详情错误",
      openDetail: "打开详情",
    },
    effects: {
      hoverLift: {
        label: "悬停抬升",
        description: "列表项悬停时上浮 1px 并加深底色",
      },
      meterFlow: {
        label: "刻度条流动",
        description: "相对刻度条带宽度过渡与高光",
      },
      selectedRail: {
        label: "选中侧栏",
        description: "当前打开详情的项目显示左侧强调条",
      },
      staggerRows: {
        label: "列表交错入场",
        description: "首屏行按顺序错峰淡入",
      },
      dialogEntrance: {
        label: "弹窗回弹进场",
        description: "遮罩淡入 + 面板轻微缩放回弹",
      },
      detailCrossfade: {
        label: "详情交叉淡入",
        description: "切换项目时内容淡入而非硬切",
      },
      flowNumbers: {
        label: "数字滚动",
        description: "关键数值用数字滚动过渡，关闭则为静态文本",
      },
      chartBars: { label: "图表柱入场", description: "柱状图渲染时逐柱生长" },
      dayDrilldown: {
        label: "按日联动",
        description: "点击柱子固定当天，并联动下方明细",
      },
      skeletonShimmer: {
        label: "骨架微光",
        description: "加载骨架带缓慢微光扫过",
      },
      stateMotion: {
        label: "状态动效",
        description: "空态淡入、错误条滑入与淡出",
      },
    },
  },
  en: {
    sortLabel: "Sort",
    sortTokens: "By tokens",
    sortCost: "By cost",
    refresh: "Refresh",
    lastUpdated: "Updated {time}",
    lastUpdatedNone: "No data loaded yet",
    scopeNote: {
      sessions:
        "This page is built from session metadata (session sidecar), covering sources such as Claude Code / Codex / Grok / OpenCode / ZCode / Kimi (about 77% of tokens in local measurement); MiniMax Code, Trae, DeepSeek Harness, WorkBuddy and others are not covered yet; Cursor / Trae CN are account-level sources and never appear here. Costs are list-price estimates and may differ from actual billing for subscription-based sources. Zero-usage projects (session shells with no tokens, cost or credits, such as scratch directories created by tools) are not listed; they already carry 0, so the totals are unaffected. Credits-only sources (such as qoder-cn) contribute credits but no tokens or cost, so their sessions and credits stay visible while 0 tokens and $0 cost is expected.",
      hourly:
        "This page is built from hourly usage buckets (token_usage_hourly), attributing tokens to project names per hour; the part that cannot be attributed within an hour is listed separately as Unattributed, never double-counted, and every row still sums to the dashboard total. Costs are list-price estimates computed live with the same pricing engine the dashboard uses, and may differ from actual billing for subscription-based sources. Project attribution depends on the collector reporting a project name; usage that does not carry one lands in Unattributed. Zero-usage project rows (0 tokens, cost and credits) are not listed; they already carry 0, so the totals are unaffected. Credits-only sources (such as qoder-cn) contribute credits but no tokens or cost, so their rows and credits stay visible while 0 tokens and $0 cost is expected.",
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
      viewLabel: "View",
      viewList: "List",
      viewCards: "Cards",
      count: "{count} projects",
      sortedBy: "Descending by {sort}",
      relativeBar: "Relative to the top project (not a share)",
      sourcesMore: "+{count}",
      filteredNote: "{count} zero-usage projects are hidden",
      openDetail: "Open {project} details",
      estimated: "est.",
      shareOfWindow: "{percent} of window",
      limitLabel: "Show",
      limitAll: "All projects",
      limitTop: "Top {count}",
      showing: "Showing top {count} of {total} projects",
    },
    summary: {
      title: "Window overview",
      tokens: "Total tokens",
      cost: "Total cost",
      projects: "Projects",
      unattributed: "Unattributed",
      filtered: "Zero-usage hidden",
      period: "{from} – {to}",
      allTime: "All time · {from} – {to}",
    },
    detail: {
      title: "Project details",
      badge: "Project",
      close: "Close project details",
      previous: "Previous project",
      next: "Next project",
      total: "Total tokens",
      share: "Share of total",
      shareHint:
        "Denominator: all projects in the same window, unattributed included",
      cost: "Cost (estimated)",
      conversations: "Conversations",
      activeDays: "Active days",
      avgPerActiveDay: "Daily avg (active days)",
      dayPeak: "Peak day",
      lastActive: "Last active",
      credits: "Credits",
      fields: "Full fields",
      daily: "Daily activity",
      sources: "By source",
      composition: "Token composition",
      input: "Input",
      cached: "Cache read",
      cacheCreation: "Cache write",
      output: "Output",
      reasoning: "Reasoning",
      sourceDays: "{count} d",
      sourceConversations: "{count} conv.",
      daySelected: "Selected {date}",
      dayClear: "Clear date",
      pinHint: "Click a bar to pin that day",
      empty: "No usage for this project in the selected window",
      loadError: "Failed to load project details.",
      retry: "Retry",
      costNote:
        "Costs are list-price estimates by model and may differ from actual billing for subscription sources.",
      creditsNote:
        "Credits are a separate dimension, never folded into tokens, cost or shares.",
      privacyNote: "Usage metadata only — no prompts, paths or commands.",
      caliberNote: "Caliber: {caliber}",
      chartLabel: "Daily token usage bar chart",
      dailyHint: "Daily activity shows the latest {days} days",
    },
    states: {
      loadError: "Failed to load projects.",
      retry: "Retry",
      emptyTitle: "No project data yet",
      emptyBody:
        "Projects are aggregated from session metadata. Pair a device and run sync with the new collector, and supported sources will report project names automatically.",
      emptyPair: "Pair a device",
      emptyDocs: "Quick start",
      emptyFilterTitle: "No projects to show",
      emptyFilterBody:
        "Projects with session shells but no tokens, cost or credits are hidden.",
      emptyFilterAction: "Refresh",
      stale: "Refresh failed. Showing the last successfully loaded data.",
    },
    review: {
      open: "Effect review",
      close: "Exit review",
      title: "Candidate effect review",
      subtitle:
        "Toggle and preview each candidate individually to decide what stays. Demo data is for visual checks only and never calls an API.",
      demo: "Demo data",
      live: "Live data",
      demoBadge: "Demo data · not real usage",
      reset: "Reset defaults",
      preview: "Preview",
      on: "On",
      off: "Off",
      useDemo: "Use demo data",
      useLive: "Use live data",
      allOn: "Enable all",
      allOff: "Disable all",
      groups: {
        rows: "List & cards",
        dialog: "Modal & detail",
        states: "State feedback",
      },
      stateLabel: "Simulated state",
      stateReady: "Ready",
      stateLoading: "Loading",
      stateEmpty: "Empty",
      stateError: "Error",
      stateDetailError: "Detail error",
      openDetail: "Open detail",
    },
    effects: {
      hoverLift: {
        label: "Hover lift",
        description: "Rows lift 1px with a deeper surface on hover",
      },
      meterFlow: {
        label: "Meter flow",
        description: "Relative meter animates its width with a highlight",
      },
      selectedRail: {
        label: "Selected rail",
        description: "Accent rail marks the row whose detail is open",
      },
      staggerRows: {
        label: "Staggered rows",
        description: "Rows fade in sequentially on first paint",
      },
      dialogEntrance: {
        label: "Dialog entrance",
        description: "Backdrop fade plus a soft scale entrance",
      },
      detailCrossfade: {
        label: "Detail crossfade",
        description: "Content fades in when switching projects",
      },
      flowNumbers: {
        label: "Rolling numbers",
        description: "Key figures roll into place; off renders static text",
      },
      chartBars: {
        label: "Bar entrance",
        description: "Chart bars grow in on render",
      },
      dayDrilldown: {
        label: "Day drilldown",
        description: "Click a bar to pin a day and filter the sections below",
      },
      skeletonShimmer: {
        label: "Skeleton shimmer",
        description: "Slow shimmer across loading placeholders",
      },
      stateMotion: {
        label: "State motion",
        description: "Empty states fade in, error bars slide in",
      },
    },
  },
};
