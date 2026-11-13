// Settings · public badge card copy (docs/badge.md §7, docs/ui-spec.md
// 设置 · 公开徽章). The repo caveat carries the three known data gaps the
// operator signed off on (docs/badge.md §4.2, 拍板 3).

export interface BadgeCopy {
  heading: string;
  description: string;
  loadError: string;
  retry: string;
  saveError: string;
  enabledLabel: string;
  enabledDescription: string;
  enabledNeedsToken: string;
  enabledOn: string;
  enabledOff: string;
  tokenLabel: string;
  tokenDescription: string;
  tokenHelp: string;
  tokenHelpLabel: string;
  tokenNone: string;
  tokenActive: string;
  generate: string;
  reset: string;
  resetTitle: string;
  resetBody: string;
  resetConfirm: string;
  cancel: string;
  revealTitle: string;
  revealWarning: string;
  revealTokenLabel: string;
  revealDone: string;
  copy: string;
  copied: string;
  copiedPlaceholder: string;
  copyFailed: string;
  nameLabel: string;
  nameDescription: string;
  nameHelp: string;
  nameHelpLabel: string;
  namePlaceholder: string;
  nameSave: string;
  nameSaved: string;
  projectsLabel: string;
  projectsDescription: string;
  projectsHelpLabel: string;
  projectsCaveat: string;
  projectsPlaceholder: string;
  projectsEmpty: string;
  projectsSave: string;
  projectsSaved: string;
  timezoneNote: string;
  previewLabel: string;
  previewDescription: string;
  previewHelp: string;
  previewHelpLabel: string;
  previewAlt: string;
  styleLabel: string;
  stylePanel: string;
  styleCompact: string;
  styleSparkline: string;
  themeLabel: string;
  themeDark: string;
  themeLight: string;
  themeAuto: string;
  rangeLabel: string;
  rangeAll: string;
  range30d: string;
  projectLabel: string;
  projectAll: string;
  projectEmpty: string;
  snippetLabel: string;
  snippetDescription: string;
  snippetSingle: string;
  snippetDual: string;
}

export const BADGE_COPY: Record<"zh" | "en", BadgeCopy> = {
  zh: {
    heading: "公开徽章",
    description:
      "在 README 或个人主页展示你的 AI 编码用量。只公开聚合数字，不含会话明细、提示词、路径或邮箱。",
    loadError: "徽章设置加载失败。",
    retry: "重试",
    saveError: "保存失败，请重试。",
    enabledLabel: "公开展示",
    enabledDescription:
      "关闭后公开链接显示「badge disabled」；令牌保留，重开即恢复。",
    enabledNeedsToken: "先生成令牌才能开启。",
    enabledOn: "已开启公开徽章",
    enabledOff: "已关闭公开徽章",
    tokenLabel: "访问令牌",
    tokenDescription:
      "持有公开链接的人可查看聚合用量；明文只在生成/重置时显示一次。",
    tokenHelp:
      "重置会立即轮换令牌：旧链接全部失效，新令牌与填好的片段只在弹窗里出现一次。",
    tokenHelpLabel: "令牌说明",
    tokenNone: "尚未生成",
    tokenActive: "已生成 · 末四位 {last4}",
    generate: "生成令牌",
    reset: "重置令牌",
    resetTitle: "重置徽章令牌？",
    resetBody:
      "旧令牌会立即失效，所有嵌入旧链接的徽章将显示「badge unavailable」，需要换成新的 README 片段。重置成功后会直接给出填好新令牌的片段。已上报的用量不受影响。",
    resetConfirm: "重置",
    cancel: "取消",
    revealTitle: "保存你的徽章令牌",
    revealWarning:
      "令牌只显示这一次，关闭后无法再次查看。请立即复制保存，或直接复制下方已填好令牌的 README 片段。",
    revealTokenLabel: "令牌",
    revealDone: "我已保存",
    copy: "复制",
    copied: "已复制",
    copiedPlaceholder: "已复制，记得把 YOUR_BADGE_TOKEN 换成你的令牌",
    copyFailed: "复制失败，请手动选择文本。",
    nameLabel: "公开名称",
    nameDescription:
      "公开页与徽章头像旁显示的名称；留空显示「AI Coding Usage」。",
    nameHelp:
      "与个人信息名称相互独立，最多 80 字符。重置令牌会以个人信息名称重新快照。",
    nameHelpLabel: "公开名称说明",
    namePlaceholder: "留空则显示 AI Coding Usage",
    nameSave: "保存名称",
    nameSaved: "公开名称已保存",
    projectsLabel: "仓库白名单",
    projectsDescription: "只有列入白名单的仓库可以生成仓库徽章，最多 32 个。",
    projectsHelpLabel: "白名单口径与时区说明",
    projectsCaveat:
      "口径说明：仓库徽章只统计 Sessions 中带项目名的会话——不含 Cursor / Trae CN 等账户级来源；缺少项目名的历史会话不计入；不同目录下的同名仓库合并统计。",
    projectsPlaceholder: "选择仓库",
    projectsEmpty: "暂无带项目名的会话。",
    projectsSave: "保存白名单",
    projectsSaved: "白名单已保存",
    timezoneNote:
      "活跃天数按 {timezone} 折算；每次保存会同步为当前浏览器时区。",
    previewLabel: "预览",
    previewDescription:
      "切换风格、主题、范围与仓库即时预览；未选仓库即账户徽章。",
    previewHelp: "未开启公开时同样可预览。",
    previewHelpLabel: "预览说明",
    previewAlt: "徽章预览",
    styleLabel: "风格",
    stylePanel: "面板",
    styleCompact: "紧凑",
    styleSparkline: "折线",
    themeLabel: "主题",
    themeDark: "深色",
    themeLight: "浅色",
    themeAuto: "跟随系统",
    rangeLabel: "范围",
    rangeAll: "全部",
    range30d: "30 天",
    projectLabel: "仓库",
    projectAll: "全部仓库",
    projectEmpty: "先在上方把仓库加入白名单。",
    snippetLabel: "README 片段",
    snippetDescription:
      "按当前预览参数生成；把 YOUR_BADGE_TOKEN 换成你的令牌（遗失则重置）。",
    snippetSingle: "单主题",
    snippetDual: "跟随 GitHub 明暗",
  },
  en: {
    heading: "Public badge",
    description:
      "Show your AI coding usage in a README or profile page. Only aggregate numbers go public — never session details, prompts, paths or email.",
    loadError: "Couldn't load the badge settings.",
    retry: "Retry",
    saveError: "Couldn't save. Please try again.",
    enabledLabel: "Public",
    enabledDescription:
      "When off, the public link shows “badge disabled”; the token is kept and comes back with the switch.",
    enabledNeedsToken: "Generate a token first.",
    enabledOn: "Public badge enabled",
    enabledOff: "Public badge disabled",
    tokenLabel: "Access token",
    tokenDescription:
      "Anyone holding the public link sees the aggregates; the plaintext is shown only once, on generate or reset.",
    tokenHelp:
      "Resetting rotates the token immediately: every old link breaks, and the new token plus a filled-in snippet appear once in the dialog.",
    tokenHelpLabel: "About the token",
    tokenNone: "Not generated yet",
    tokenActive: "Active · ends in {last4}",
    generate: "Generate token",
    reset: "Reset token",
    resetTitle: "Reset the badge token?",
    resetBody:
      "The old token stops working right away: every badge embedding the old link will show “badge unavailable” until you swap in the new README snippet. The reset hands you that snippet with the new token already filled in. Reported usage is not affected.",
    resetConfirm: "Reset",
    cancel: "Cancel",
    revealTitle: "Save your badge token",
    revealWarning:
      "This is the only time the token is shown. Copy it now, or copy the README snippet below that already contains it.",
    revealTokenLabel: "Token",
    revealDone: "I've saved it",
    copy: "Copy",
    copied: "Copied",
    copiedPlaceholder:
      "Copied — remember to replace YOUR_BADGE_TOKEN with your token",
    copyFailed: "Couldn't copy — select the text manually.",
    nameLabel: "Public name",
    nameDescription:
      "The name beside the avatar on the public page and badge; empty shows “AI Coding Usage”.",
    nameHelp:
      "Independent of your profile name, up to 80 characters. Resetting the token re-snapshots your profile name.",
    nameHelpLabel: "About the public name",
    namePlaceholder: "Empty shows AI Coding Usage",
    nameSave: "Save name",
    nameSaved: "Public name saved",
    projectsLabel: "Repository allowlist",
    projectsDescription:
      "Only allowlisted repositories can have a repo badge (up to 32).",
    projectsHelpLabel: "Allowlist coverage and time zone",
    projectsCaveat:
      "Coverage: repo badges count Sessions that carry a project name — account-level sources such as Cursor and Trae CN are excluded, older sessions without a project name are left out, and same-named folders in different places are merged.",
    projectsPlaceholder: "Choose repositories",
    projectsEmpty: "No sessions with a project name yet.",
    projectsSave: "Save allowlist",
    projectsSaved: "Allowlist saved",
    timezoneNote:
      "Active days are counted in {timezone}; each save syncs it to this browser's time zone.",
    previewLabel: "Preview",
    previewDescription:
      "Style, theme, range and repository update the preview live; no repository means the account badge.",
    previewHelp: "The preview works before the badge is public too.",
    previewHelpLabel: "About the preview",
    previewAlt: "Badge preview",
    styleLabel: "Style",
    stylePanel: "Panel",
    styleCompact: "Compact",
    styleSparkline: "Sparkline",
    themeLabel: "Theme",
    themeDark: "Dark",
    themeLight: "Light",
    themeAuto: "System",
    rangeLabel: "Range",
    rangeAll: "All time",
    range30d: "30 days",
    projectLabel: "Repository",
    projectAll: "All repositories",
    projectEmpty: "Add a repository to the allowlist above first.",
    snippetLabel: "README snippet",
    snippetDescription:
      "Built from the preview settings; replace YOUR_BADGE_TOKEN with your token (reset it if lost).",
    snippetSingle: "Single theme",
    snippetDual: "Follow GitHub theme",
  },
};
