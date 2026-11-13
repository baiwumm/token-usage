// Settings · public badge tab copy (docs/badge.md §7, docs/ui-spec.md
// 设置 · 公开徽章). 2026-11-13 multi-badge model: account-level settings, one
// list of badges, and a detail panel for the selected badge.

export interface BadgeCopy {
  settingsTitle: string;
  settingsDescription: string;
  loadError: string;
  retry: string;
  saveError: string;

  enabledLabel: string;
  enabledDescription: string;
  enabledNeedsBadge: string;
  enabledOn: string;
  enabledOff: string;

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
  projectsCascaded: string;
  timezoneNote: string;

  listTitle: string;
  listDescription: string;
  listEmpty: string;
  addBadge: string;
  addBadgeLimit: string;
  untitled: string;
  copyLink: string;
  copyLinkDone: string;
  revoke: string;
  restore: string;
  revokeDone: string;
  restoreDone: string;
  revokedChip: string;
  activeChip: string;
  deleteBadge: string;
  deleteTitle: string;
  deleteBody: string;
  deleteConfirm: string;
  deleteDone: string;
  cancel: string;

  detailEmpty: string;
  labelDialogAdd: string;
  labelDialogEdit: string;
  labelField: string;
  labelFieldPlaceholder: string;
  labelRequired: string;
  labelDuplicate: string;
  labelConfirmAdd: string;
  labelConfirmEdit: string;
  labelSaved: string;
  paramsLabel: string;
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
  previewAlt: string;
  previewHelp: string;
  previewHelpLabel: string;
  snippetLabel: string;
  snippetDescription: string;
  snippetSingle: string;
  snippetDual: string;
  copy: string;
  copied: string;
  copyFailed: string;
}

export const BADGE_COPY: Record<"zh" | "en", BadgeCopy> = {
  zh: {
    settingsTitle: "公开设置",
    settingsDescription:
      "在 README 或个人主页展示你的 AI 编码用量。只公开聚合数字，不含会话明细、提示词、路径或邮箱。",
    loadError: "徽章设置加载失败。",
    retry: "重试",
    saveError: "保存失败，请重试。",

    enabledLabel: "公开展示",
    enabledDescription:
      "关闭后所有徽章显示「badge disabled」；徽章与链接都保留，重开即恢复。",
    enabledNeedsBadge: "先新增一枚徽章才能开启。",
    enabledOn: "已开启公开徽章",
    enabledOff: "已关闭公开徽章",

    nameLabel: "公开名称",
    nameDescription:
      "公开页与徽章头像旁显示的名称；留空显示「AI Coding Usage」。",
    nameHelp:
      "与个人信息名称相互独立，最多 30 字符。新增第一枚徽章时会快照个人信息名称。",
    nameHelpLabel: "公开名称说明",
    namePlaceholder: "留空则显示 AI Coding Usage",
    nameSave: "保存名称",
    nameSaved: "公开名称已保存",

    projectsLabel: "仓库白名单",
    projectsDescription: "只有列入白名单的仓库才能绑定到徽章，最多 32 个。",
    projectsHelpLabel: "白名单口径与时区说明",
    projectsCaveat:
      "口径说明：仓库徽章只统计 Sessions 中带项目名的会话——不含 Cursor / Trae CN 等账户级来源；缺少项目名的历史会话不计入；不同目录下的同名仓库合并统计。",
    projectsPlaceholder: "选择仓库",
    projectsEmpty: "暂无带项目名的会话。",
    projectsSave: "保存白名单",
    projectsSaved: "白名单已保存",
    projectsCascaded: "白名单已保存；{count} 枚徽章的仓库已回落为账户徽章",
    timezoneNote:
      "活跃天数按 {timezone} 折算；每次保存会同步为当前浏览器时区。",

    listTitle: "我的徽章",
    listDescription:
      "每枚徽章有独立链接与展示参数。吊销随时可恢复（链接不变），删除永久生效。",
    listEmpty: "还没有徽章。新增一枚即可拿到可粘贴的 README 片段。",
    addBadge: "新增徽章",
    addBadgeLimit: "最多 10 枚；删除不再需要的徽章后可再新增。",
    untitled: "未命名徽章",
    copyLink: "复制链接",
    copyLinkDone: "链接已复制",
    revoke: "吊销",
    restore: "恢复",
    revokeDone: "已吊销，可随时恢复",
    restoreDone: "已恢复，链接重新可用",
    revokedChip: "已吊销",
    activeChip: "有效",
    deleteBadge: "删除",
    deleteTitle: "永久删除这枚徽章？",
    deleteBody:
      "「{name}」会被直接删除，链接立即失效且无法恢复，需要重新新增一枚。已贴出的图片可能最长约 10 分钟仍显示缓存。已上报的用量不受影响。",
    deleteConfirm: "永久删除",
    deleteDone: "徽章已删除",
    cancel: "取消",

    detailEmpty: "先新增或选择一枚徽章。",
    labelDialogAdd: "新增徽章",
    labelDialogEdit: "编辑名称",
    labelField: "名称",
    labelFieldPlaceholder: "例如 README 徽章",
    labelRequired: "请输入名称",
    labelDuplicate: "名称已存在",
    labelConfirmAdd: "新增",
    labelConfirmEdit: "保存",
    labelSaved: "名称已保存",
    paramsLabel: "展示参数",
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
    previewAlt: "徽章预览",
    previewHelp: "未开启公开时同样可预览；参数保存后已贴出的链接立即跟着变。",
    previewHelpLabel: "预览说明",
    snippetLabel: "README 片段",
    snippetDescription:
      "链接不带展示参数，始终跟随上面的设置；想临时固定样式可在链接后自行追加参数。",
    snippetSingle: "单主题",
    snippetDual: "跟随 GitHub 明暗",
    copy: "复制",
    copied: "已复制",
    copyFailed: "复制失败，请手动选择文本。",
  },
  en: {
    settingsTitle: "Public settings",
    settingsDescription:
      "Show your AI coding usage in a README or profile page. Only aggregate numbers go public — never session details, prompts, paths or email.",
    loadError: "Couldn't load the badge settings.",
    retry: "Retry",
    saveError: "Couldn't save. Please try again.",

    enabledLabel: "Public",
    enabledDescription:
      "When off, every badge shows “badge disabled”; the badges and links are kept and come back with the switch.",
    enabledNeedsBadge: "Add a badge first.",
    enabledOn: "Public badge enabled",
    enabledOff: "Public badge disabled",

    nameLabel: "Public name",
    nameDescription:
      "The name beside the avatar on the public page and badge; empty shows “AI Coding Usage”.",
    nameHelp:
      "Independent of your profile name, up to 30 characters. The first badge snapshots your profile name.",
    nameHelpLabel: "About the public name",
    namePlaceholder: "Empty shows AI Coding Usage",
    nameSave: "Save name",
    nameSaved: "Public name saved",

    projectsLabel: "Repository allowlist",
    projectsDescription:
      "Only allowlisted repositories can be bound to a badge (up to 32).",
    projectsHelpLabel: "Allowlist coverage and time zone",
    projectsCaveat:
      "Coverage: repo badges count Sessions that carry a project name — account-level sources such as Cursor and Trae CN are excluded, older sessions without a project name are left out, and same-named folders in different places are merged.",
    projectsPlaceholder: "Choose repositories",
    projectsEmpty: "No sessions with a project name yet.",
    projectsSave: "Save allowlist",
    projectsSaved: "Allowlist saved",
    projectsCascaded:
      "Allowlist saved; {count} badge(s) fell back to the account badge",
    timezoneNote:
      "Active days are counted in {timezone}; each save syncs it to this browser's time zone.",

    listTitle: "My badges",
    listDescription:
      "Each badge has its own link and display settings. Revoke is reversible (same link); delete is permanent.",
    listEmpty: "No badges yet. Add one to get a README snippet you can paste.",
    addBadge: "Add badge",
    addBadgeLimit: "10 badges max — delete one to free a slot.",
    untitled: "Untitled badge",
    copyLink: "Copy link",
    copyLinkDone: "Link copied",
    revoke: "Revoke",
    restore: "Restore",
    revokeDone: "Revoked — restore any time",
    restoreDone: "Restored — the link works again",
    revokedChip: "Revoked",
    activeChip: "Active",
    deleteBadge: "Delete",
    deleteTitle: "Delete this badge for good?",
    deleteBody:
      "“{name}” is removed immediately, the link stops working and cannot be restored — you would have to add a new badge. Already embedded images may stay cached for up to about 10 minutes. Reported usage is unaffected.",
    deleteConfirm: "Delete permanently",
    deleteDone: "Badge deleted",
    cancel: "Cancel",

    detailEmpty: "Add or select a badge first.",
    labelDialogAdd: "Add badge",
    labelDialogEdit: "Edit name",
    labelField: "Name",
    labelFieldPlaceholder: "e.g. README badge",
    labelRequired: "Enter a name",
    labelDuplicate: "That name is already in use",
    labelConfirmAdd: "Add",
    labelConfirmEdit: "Save",
    labelSaved: "Name saved",
    paramsLabel: "Display",
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
    previewAlt: "Badge preview",
    previewHelp:
      "The preview works before the badge is public, and saved settings apply to already-embedded links right away.",
    previewHelpLabel: "About the preview",
    snippetLabel: "README snippet",
    snippetDescription:
      "The link carries no display parameters and always follows the settings above; append parameters if you want to pin a style.",
    snippetSingle: "Single theme",
    snippetDual: "Follow GitHub theme",
    copy: "Copy",
    copied: "Copied",
    copyFailed: "Couldn't copy — select the text manually.",
  },
};
