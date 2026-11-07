// Sync runs page copy (/sync-runs, docs/cli-contract.md §2.12). One row per
// collector sync, empty runs included — aggregate telemetry only.

export interface SyncRunsCopy {
  rangeLabel: string;
  ranges: Record<"today" | "7d" | "30d" | "90d" | "custom", string>;
  deviceLabel: string;
  allDevices: string;
  triggerLabel: string;
  allTriggers: string;
  resultLabel: string;
  allResults: string;
  clearFilters: string;
  refresh: string;
  lastUpdated: string;
  lastUpdatedNone: string;
  cards: {
    todayRuns: string;
    todayEmptyHint: string;
    lastRun: string;
    emptyValue: string;
  };
  freshness: {
    title: string;
    hint: string;
    ok: string;
    lagging: string;
    stalled: string;
    failing: string;
    none: string;
    lastSuccess: string;
    lastFailed: string;
    errorCode: string;
    noRuns: string;
  };
  list: {
    title: string;
    hint: string;
    startedAt: string;
    device: string;
    trigger: string;
    result: string;
    duration: string;
    volume: string;
    filesUnit: string;
    bucketsUnit: string;
    creditsUnit: string;
    pageSummary: string;
    pageSize: string;
    pageSizeItem: string;
    previous: string;
    next: string;
  };
  trigger: Record<"scheduled" | "manual" | "watch" | "notify", string>;
  result: Record<"ok" | "partial" | "error", string>;
  emptyChip: string;
  states: {
    loadError: string;
    retry: string;
    emptyTitle: string;
    emptyBody: string;
    emptyPair: string;
    emptyUpgrade: string;
    filterEmptyTitle: string;
    filterEmptyBody: string;
  };
}

export const SYNC_RUNS_COPY: Record<"zh" | "en", SyncRunsCopy> = {
  zh: {
    rangeLabel: "时间范围",
    ranges: {
      today: "今天",
      "7d": "7D",
      "30d": "30D",
      "90d": "90D",
      custom: "自定义",
    },
    deviceLabel: "设备",
    allDevices: "全部设备",
    triggerLabel: "触发方式",
    allTriggers: "全部方式",
    resultLabel: "结果",
    allResults: "全部结果",
    clearFilters: "清除筛选",
    refresh: "刷新",
    lastUpdated: "上次更新 {time}",
    lastUpdatedNone: "尚未加载数据",
    cards: {
      todayRuns: "今日采集",
      todayEmptyHint: "其中空跑 {count} 次",
      lastRun: "最近采集",
      emptyValue: "—",
    },
    freshness: {
      title: "设备采集状态",
      hint: "按各设备最近的采集运行评估链路健康；长时间关机的设备会显示滞后。",
      ok: "正常",
      lagging: "滞后",
      stalled: "中断",
      failing: "失败",
      none: "无记录",
      lastSuccess: "最后成功 {time}",
      lastFailed: "最近一次运行失败",
      errorCode: "错误码 {code}",
      noRuns: "近 7 天没有运行记录",
    },
    list: {
      title: "采集记录",
      hint: "每次采集一行（含空跑），记录采集器的运行状态。",
      startedAt: "开始时间",
      device: "设备",
      trigger: "触发方式",
      result: "结果",
      duration: "耗时",
      volume: "采集数据",
      filesUnit: "文件",
      bucketsUnit: "桶",
      creditsUnit: "积分",
      pageSummary: "第 {start} - {end} 条，共 {total} 条",
      pageSize: "每页条数",
      pageSizeItem: "每页 {count} 条",
      previous: "上一页",
      next: "下一页",
    },
    trigger: {
      scheduled: "定时",
      manual: "手动",
      watch: "常驻",
      notify: "通知",
    },
    result: {
      ok: "成功",
      partial: "部分成功",
      error: "失败",
    },
    emptyChip: "空跑",
    states: {
      loadError: "采集记录加载失败。",
      retry: "重试",
      emptyTitle: "等待新版采集器",
      emptyBody:
        "采集记录由 0.2.0 及以上版本的采集器在每轮 sync 后上报。升级 CLI 并完成一轮 sync 后，这里会显示运行记录。",
      emptyPair: "配对设备",
      emptyUpgrade: "升级文档",
      filterEmptyTitle: "当前筛选没有采集记录",
      filterEmptyBody: "换一个时间范围、设备或触发方式，或清除筛选。",
    },
  },
  en: {
    rangeLabel: "Range",
    ranges: {
      today: "Today",
      "7d": "7D",
      "30d": "30D",
      "90d": "90D",
      custom: "Custom",
    },
    deviceLabel: "Device",
    allDevices: "All devices",
    triggerLabel: "Trigger",
    allTriggers: "All triggers",
    resultLabel: "Result",
    allResults: "All results",
    clearFilters: "Clear filters",
    refresh: "Refresh",
    lastUpdated: "Updated {time}",
    lastUpdatedNone: "No data loaded yet",
    cards: {
      todayRuns: "Runs today",
      todayEmptyHint: "{count} empty",
      lastRun: "Last run",
      emptyValue: "—",
    },
    freshness: {
      title: "Device freshness",
      hint: "Per-device health from the latest sync runs; devices that stay powered off show as lagging.",
      ok: "OK",
      lagging: "Lagging",
      stalled: "Stalled",
      failing: "Failed",
      none: "No runs",
      lastSuccess: "Last success {time}",
      lastFailed: "Latest run failed",
      errorCode: "Error {code}",
      noRuns: "No runs in the last 7 days",
    },
    list: {
      title: "Sync runs",
      hint: "One row per sync, empty runs included — the collector's heartbeat.",
      startedAt: "Started",
      device: "Device",
      trigger: "Trigger",
      result: "Result",
      duration: "Duration",
      volume: "Ingested",
      filesUnit: "files",
      bucketsUnit: "buckets",
      creditsUnit: "credits",
      pageSummary: "Rows {start}–{end} of {total}",
      pageSize: "Rows per page",
      pageSizeItem: "{count} / page",
      previous: "Previous",
      next: "Next",
    },
    trigger: {
      scheduled: "Scheduled",
      manual: "Manual",
      watch: "Watcher",
      notify: "Notify",
    },
    result: {
      ok: "OK",
      partial: "Partial",
      error: "Error",
    },
    emptyChip: "Empty",
    states: {
      loadError: "Failed to load sync runs.",
      retry: "Retry",
      emptyTitle: "Waiting for the new collector",
      emptyBody:
        "Sync runs are reported by collector 0.2.0+ after every sync. Upgrade the CLI and run a sync to see records here.",
      emptyPair: "Pair a device",
      emptyUpgrade: "Upgrade guide",
      filterEmptyTitle: "No sync runs match these filters",
      filterEmptyBody:
        "Try another range, device or trigger, or clear filters.",
    },
  },
};
