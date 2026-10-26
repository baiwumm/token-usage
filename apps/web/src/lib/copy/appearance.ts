// Appearance section copy (docs/ui-spec.md 设置 · 外观). Every control applies
// immediately; there is no save button. Preferences stay in this browser only.

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
  previewLabel: string;
  previewTokens: string;
  previewCost: string;
  previewDate: string;
  reset: string;
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
    previewLabel: "预览",
    previewTokens: "Token",
    previewCost: "成本",
    previewDate: "日期",
    reset: "恢复默认",
    storageNote: "外观偏好只保存在本浏览器，不写入账户；换设备需重设。",
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
    previewLabel: "Preview",
    previewTokens: "Tokens",
    previewCost: "Cost",
    previewDate: "Date",
    reset: "Reset to defaults",
    storageNote:
      "Appearance preferences stay in this browser only and are not saved to your account.",
  },
};
