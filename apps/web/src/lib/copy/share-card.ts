// Share-card copy shared by the dashboard and /wrapped (docs/ui-spec.md 分享
// 卡片). The dialog chrome and the canvas variants both render from these
// strings plus the ShareCardData projection — no literals inside the drawers.

export interface ShareCardCopy {
  /** Switcher labels, keyed by variant id. */
  variants: Record<"broadsheet" | "receipt" | "neon" | "vinyl", string>;
  /** Trigger tooltip / aria label — every entry point uses the same wording. */
  share: string;
  title: string;
  subtitle: string;
  displayName: string;
  displayNamePlaceholder: string;
  note: string;
  close: string;
  styleLabel: string;
  save: string;
  copyImage: string;
  copied: string;
  copyFailed: string;
  /** Quotable hook templates; placeholders filled at build time. */
  hook: {
    loyal: string;
    days: string;
    led: string;
    multi: string;
    year: string;
  };
  broadsheet: {
    user: string;
    totalTokens: string;
    estSpend: string;
    activeDays: string;
    yearInPrint: string;
    models: string;
    issue: string;
    rosterSubtitle: string;
    daysOnRecord: string;
    empty: string;
    streak: string;
    daysCount: string;
    trackYours: string;
  };
  receipt: {
    title: string;
    subtotal: string;
    cost: string;
    active: string;
    sessions: string;
    peak: string;
    paid: string;
    thanks: string;
    brand: string;
  };
  neon: {
    yearTokens: string;
    heatmapTitle: string;
    less: string;
    more: string;
    streak: string;
    daysUnit: string;
    topModel: string;
    cost: string;
    sessions: string;
    activeDays: string;
    brand: string;
  };
  vinyl: {
    tracks: string;
    runtime: string;
    label: string;
    brand: string;
  };
}

export const SHARE_CARD_COPY: Record<"zh" | "en", ShareCardCopy> = {
  zh: {
    variants: {
      broadsheet: "特刊",
      receipt: "小票",
      neon: "霓虹",
      vinyl: "唱片",
    },
    share: "分享卡片",
    title: "分享用量卡片",
    subtitle: "生成海报卡片，随时分享。",
    displayName: "显示名称",
    displayNamePlaceholder: "留空则使用当前用户名",
    note: "卡片只包含聚合数字与热力图，不含明细数据。",
    close: "关闭",
    styleLabel: "风格",
    save: "保存 PNG",
    copyImage: "复制图片",
    copied: "已复制到剪贴板。",
    copyFailed: "复制失败，请改用保存。",
    hook: {
      loyal: "{percent}% 的 tokens 都给了 {name}",
      days: "{days} 天都在产出 token",
      led: "{name} 领跑，占 {percent}%",
      multi: "{count} 个模型轮番上阵",
      year: "{year}，一份 token 年度答卷",
    },
    broadsheet: {
      user: "使用者",
      totalTokens: "总 TOKENS",
      estSpend: "预估费用",
      activeDays: "活跃天数",
      yearInPrint: "全年用量",
      models: "模型",
      issue: "特刊",
      rosterSubtitle: "按用量排名",
      daysOnRecord: "{active} / {total} 天有记录",
      empty: "暂无模型数据",
      streak: "最长连续",
      daysCount: "{days} 天",
      trackYours: "追踪你自己的",
    },
    receipt: {
      title: "年度用量账单",
      subtotal: "小计",
      cost: "费用",
      active: "活跃",
      sessions: "会话",
      peak: "峰值",
      paid: "已结算",
      thanks: "感谢惠存 · 明年再会",
      brand: "自托管用量追踪 · token-usage.cc",
    },
    neon: {
      yearTokens: "全年 TOKEN",
      heatmapTitle: "全年热力图",
      less: "少",
      more: "多",
      streak: "最长连续",
      daysUnit: "天",
      topModel: "最常用模型",
      cost: "成本",
      sessions: "会话",
      activeDays: "活跃天",
      brand: "自托管 AI 用量追踪",
    },
    vinyl: {
      tracks: "曲目",
      runtime: "全年总量",
      label: "厂牌",
      brand: "自托管 Token 用量追踪",
    },
  },
  en: {
    variants: {
      broadsheet: "Broadsheet",
      receipt: "Receipt",
      neon: "Neon",
      vinyl: "Vinyl",
    },
    share: "Share card",
    title: "Share your usage",
    subtitle: "Generate a poster card and share it anywhere.",
    displayName: "Display name",
    displayNamePlaceholder: "Leave blank to use your current name",
    note: "Cards carry aggregated numbers and the heatmap only — no row-level data.",
    close: "Close",
    styleLabel: "Style",
    save: "Save PNG",
    copyImage: "Copy image",
    copied: "Copied to clipboard.",
    copyFailed: "Copy failed — try saving instead.",
    hook: {
      loyal: "{percent}% of tokens went to {name}",
      days: "{days} days of nonstop tokens",
      led: "{name} leads at {percent}%",
      multi: "{count} models shared the load",
      year: "{year} in tokens, reviewed",
    },
    broadsheet: {
      user: "USER",
      totalTokens: "TOTAL TOKENS",
      estSpend: "EST. SPEND",
      activeDays: "ACTIVE DAYS",
      yearInPrint: "THE YEAR IN PRINT",
      models: "MODELS",
      issue: "SPECIAL EDITION",
      rosterSubtitle: "RANKED BY USAGE",
      daysOnRecord: "{active} / {total} DAYS ON RECORD",
      empty: "No model data yet",
      streak: "LONGEST STREAK",
      daysCount: "{days} DAYS",
      trackYours: "TRACK YOURS",
    },
    receipt: {
      title: "USAGE STATEMENT",
      subtotal: "SUBTOTAL",
      cost: "COST",
      active: "ACTIVE",
      sessions: "SESSIONS",
      peak: "PEAK",
      paid: "PAID",
      thanks: "THANK YOU · SEE YOU NEXT YEAR",
      brand: "SELF-HOSTED TRACKING · token-usage.cc",
    },
    neon: {
      yearTokens: "YEARLY TOKENS",
      heatmapTitle: "YEAR HEATMAP",
      less: "Less",
      more: "More",
      streak: "Longest streak",
      daysUnit: "days",
      topModel: "Top model",
      cost: "Cost",
      sessions: "Sessions",
      activeDays: "Active days",
      brand: "Self-hosted AI usage tracking",
    },
    vinyl: {
      tracks: "TRACKS",
      runtime: "TOTAL RUNTIME",
      label: "LABEL",
      brand: "Self-hosted token tracking",
    },
  },
};
