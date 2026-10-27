// Appearance copy for the 偏好 tab (docs/ui-spec.md 设置 · 偏好). Every control
// applies immediately; there is no save button. Preferences stay in this
// browser only.

export interface AppearanceCopy {
  heading: string;
  description: string;
  themeLabel: string;
  themeDescription: string;
  themeLight: string;
  themeDark: string;
  themeSystem: string;
  languageLabel: string;
  languageDescription: string;
  languageSystem: string;
  languageZh: string;
  languageEn: string;
  languageSystemCurrent: string;
  fontLabel: string;
  fontDescription: string;
  fontMaple: string;
  fontSystem: string;
  currencyLabel: string;
  currencyDescription: string;
  currencyRate: string;
  currencyReference: string;
  currencyAsOf: string;
  dateFormatLabel: string;
  dateFormatDescription: string;
  dateFormatLocale: string;
  dateFormatIso: string;
  dateFormatMdy: string;
  dateFormatDmy: string;
  tokenDisplayLabel: string;
  tokenDisplayDescription: string;
  tokenCompact: string;
  tokenFull: string;
  tokenUnitLabel: string;
  tokenUnitDescription: string;
  tokenKmb: string;
  tokenWan: string;
  tokenUnitDisabled: string;
  tokenGroupingLabel: string;
  tokenGroupingDescription: string;
  tokenGrouping3: string;
  tokenGrouping4: string;
  tokenGroupingDisabled: string;
  refreshHeading: string;
  refreshDescription: string;
  refreshOnVisibleLabel: string;
  refreshOnVisibleDescription: string;
  refreshIntervalLabel: string;
  refreshIntervalDescription: string;
  refreshIntervalOff: string;
  refreshIntervalValue: string;
  refreshIntervalHour: string;
  refreshIntervalMax: string;
  previewLabel: string;
  previewTokens: string;
  previewCost: string;
  previewDate: string;
  reset: string;
  resetTitle: string;
  resetBody: string;
  resetCancel: string;
  resetConfirm: string;
  resetDone: string;
  storageNote: string;
}

export const APPEARANCE_COPY: Record<"zh" | "en", AppearanceCopy> = {
  zh: {
    heading: "外观",
    description: "主题、语言与数字格式。所有改动即时生效，无需保存。",
    themeLabel: "主题",
    themeDescription: "浅色、深色或跟随系统；与顶栏的明暗切换共用同一偏好。",
    themeLight: "浅色",
    themeDark: "深色",
    themeSystem: "跟随系统",
    languageLabel: "语言",
    languageDescription: "跟随系统时按浏览器的 Accept-Language 解析。",
    languageSystem: "跟随系统",
    languageZh: "简体中文",
    languageEn: "English",
    languageSystemCurrent: "跟随系统（当前：{locale}）",
    fontLabel: "字体",
    fontDescription:
      "Maple 为内置中英文等宽字体；系统字体跟随操作系统设置。仅本浏览器生效。",
    fontMaple: "Maple",
    fontSystem: "系统字体",
    currencyLabel: "货币",
    currencyDescription: "仅改变显示，存储与接口始终使用 USD。",
    currencyRate: "1 USD = {rate} {currency}",
    currencyReference: "参考汇率",
    currencyAsOf: "快照日期 {date}",
    dateFormatLabel: "日期格式",
    dateFormatDescription:
      "只作用于日期部分；时间仍按语言使用 12/24 小时制，图表月份保持语言格式。",
    dateFormatLocale: "跟随语言",
    dateFormatIso: "YYYY-MM-DD",
    dateFormatMdy: "MM/DD/YYYY",
    dateFormatDmy: "DD/MM/YYYY",
    tokenDisplayLabel: "Token 显示",
    tokenDisplayDescription:
      "紧凑模式使用 K/M/B 或万/亿；完整模式显示全部位数。",
    tokenCompact: "紧凑",
    tokenFull: "完整",
    tokenUnitLabel: "数字单位",
    tokenUnitDescription: "仅紧凑模式生效。",
    tokenKmb: "K/M/B",
    tokenWan: "万/亿",
    tokenUnitDisabled: "切换到紧凑模式后可调整。",
    tokenGroupingLabel: "数字分组",
    tokenGroupingDescription: "仅完整模式生效，明细表与整数同样遵循。",
    tokenGrouping3: "3 位",
    tokenGrouping4: "4 位",
    tokenGroupingDisabled: "切换到完整模式后可调整。",
    refreshHeading: "数据刷新",
    refreshDescription:
      "控制仪表盘何时自动拉取数据；默认关闭，右上角的刷新按钮随时可用。",
    refreshOnVisibleLabel: "切回页面时刷新",
    refreshOnVisibleDescription:
      "标签页重新可见时立即拉取最新数据；60 秒内重复切回不会重复请求。",
    refreshIntervalLabel: "定时刷新",
    refreshIntervalDescription: "仅在页面可见时计时，0 表示关闭。",
    refreshIntervalOff: "关闭",
    refreshIntervalValue: "每 {count} 分钟",
    refreshIntervalHour: "每 1 小时",
    refreshIntervalMax: "1 小时",
    previewLabel: "预览",
    previewTokens: "Token",
    previewCost: "成本",
    previewDate: "日期",
    reset: "恢复默认",
    resetTitle: "恢复默认偏好？",
    resetBody:
      "主题、语言、字体、货币、日期与数字格式、数据刷新都会恢复默认设置。此操作只影响本浏览器，不会改动账户与设备。",
    resetCancel: "取消",
    resetConfirm: "恢复默认",
    resetDone: "偏好已恢复默认。",
    storageNote: "外观与刷新偏好只保存在本浏览器，不写入账户；换设备需重设。",
  },
  en: {
    heading: "Appearance",
    description:
      "Theme, language and number formats. Every change applies immediately.",
    themeLabel: "Theme",
    themeDescription:
      "Light, dark or follow the system; shared with the top-bar toggle.",
    themeLight: "Light",
    themeDark: "Dark",
    themeSystem: "System",
    languageLabel: "Language",
    languageDescription:
      "Follow system resolves the browser's Accept-Language header.",
    languageSystem: "Follow system",
    languageZh: "简体中文",
    languageEn: "English",
    languageSystemCurrent: "Follow system (current: {locale})",
    fontLabel: "Font",
    fontDescription:
      "Maple is the built-in mono CJK font; system font follows your OS. This browser only.",
    fontMaple: "Maple",
    fontSystem: "System font",
    currencyLabel: "Currency",
    currencyDescription: "Display only — storage and the API always use USD.",
    currencyRate: "1 USD = {rate} {currency}",
    currencyReference: "Reference rate",
    currencyAsOf: "snapshot {date}",
    dateFormatLabel: "Date format",
    dateFormatDescription:
      "Applies to the date only; time keeps the language's 12/24-hour clock and chart month labels stay language-based.",
    dateFormatLocale: "Follow language",
    dateFormatIso: "YYYY-MM-DD",
    dateFormatMdy: "MM/DD/YYYY",
    dateFormatDmy: "DD/MM/YYYY",
    tokenDisplayLabel: "Token display",
    tokenDisplayDescription:
      "Compact uses K/M/B or 万/亿; full shows every digit.",
    tokenCompact: "Compact",
    tokenFull: "Full",
    tokenUnitLabel: "Number unit",
    tokenUnitDescription: "Only applies in compact mode.",
    tokenKmb: "K/M/B",
    tokenWan: "万/亿",
    tokenUnitDisabled: "Switch to compact mode to change this.",
    tokenGroupingLabel: "Digit grouping",
    tokenGroupingDescription:
      "Only applies in full mode; detail tables follow it too.",
    tokenGrouping3: "3 digits",
    tokenGrouping4: "4 digits",
    tokenGroupingDisabled: "Switch to full mode to change this.",
    refreshHeading: "Data refresh",
    refreshDescription:
      "Controls when the dashboard fetches fresh data. Off by default; the refresh button in the header always works.",
    refreshOnVisibleLabel: "Refresh when the page becomes visible",
    refreshOnVisibleDescription:
      "Fetches as soon as the tab is visible again; repeat returns within 60 seconds are skipped.",
    refreshIntervalLabel: "Timed refresh",
    refreshIntervalDescription:
      "Counts only while the page is visible; 0 disables it.",
    refreshIntervalOff: "Off",
    refreshIntervalValue: "Every {count} min",
    refreshIntervalHour: "Every hour",
    refreshIntervalMax: "1 hour",
    previewLabel: "Preview",
    previewTokens: "Tokens",
    previewCost: "Cost",
    previewDate: "Date",
    reset: "Reset to defaults",
    resetTitle: "Reset preferences?",
    resetBody:
      "Theme, language, font, currency, date and number formats, and data refresh return to their defaults. This only affects this browser — your account and devices are untouched.",
    resetCancel: "Cancel",
    resetConfirm: "Reset",
    resetDone: "Preferences reset to defaults.",
    storageNote:
      "Appearance and refresh preferences stay in this browser only and are not saved to your account.",
  },
};
