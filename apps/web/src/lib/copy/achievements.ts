// Achievements copy (/achievements, docs/achievements-plan.md §2). One flat
// dictionary per locale keyed exactly like the catalog's copyKey /
// descriptionKey and the shared coverage keys, plus the page chrome keys.
// tests/unit/achievements-copy.test.ts keeps both locales in step with the
// catalog, so a renamed id cannot silently lose its label.

import type { Locale } from "./locale-config";

export const ACHIEVEMENTS_COPY: Record<Locale, Record<string, string>> = {
  zh: {
    "achievements.token_titan.name": "Token 巨擘",
    "achievements.token_titan.description": "累计用量一次次跨过新的数量级。",
    "achievements.wordsmith.name": "妙笔生花",
    "achievements.wordsmith.description": "写出去的 token，最终都成了产出。",
    "achievements.cachekeeper.name": "缓存藏家",
    "achievements.cachekeeper.description":
      "读过的上下文不浪费，缓存替你记住。",
    "achievements.veteran.name": "老兵",
    "achievements.veteran.description": "从第一条记录到现在，你一直都在。",
    "achievements.big_day.name": "高光之日",
    "achievements.big_day.description": "某一天，你把一整年的劲头都用完了。",
    "achievements.cache_alchemy.name": "缓存炼金",
    "achievements.cache_alchemy.description": "单日缓存命中率的最佳手感。",
    "achievements.marathon_session.name": "马拉松会话",
    "achievements.marathon_session.description":
      "一个会话从早开到晚。健康提示：记得起身。",
    "achievements.model_symphony.name": "模型交响",
    "achievements.model_symphony.description": "一天里换过多少种模型来合奏。",
    "achievements.streak.name": "火焰",
    "achievements.streak.description": "连续每天都动手的最长纪录。",
    "achievements.marathoner.name": "长跑者",
    "achievements.marathoner.description": "累计有多少天留下过用量。",
    "achievements.weekend_warrior.name": "周末战士",
    "achievements.weekend_warrior.description": "周六周日也照常打开编辑器。",
    "achievements.night_owl.name": "夜猫子",
    "achievements.night_owl.description": "凌晨 0–6 点还在跑量的日子。早点睡。",
    "achievements.polyglot.name": "模型通",
    "achievements.polyglot.description": "用过多少种不同的模型。",
    "achievements.multitool.name": "多面手",
    "achievements.multitool.description": "同时用过多家 CLI 工具。",
    "achievements.project_hopper.name": "项目游侠",
    "achievements.project_hopper.description": "在不同项目之间来回穿梭。",
    "achievements.project_devotion.name": "专情项目",
    "achievements.project_devotion.description":
      "在一个项目上投入的 token 总量。",
    "achievements.fleet.name": "多设备舰队",
    "achievements.fleet.description": "同一账户下出现过的设备数，含已退役。",
    "achievements.sync_diligence.name": "采集纪律",
    "achievements.sync_diligence.description": "连续每天都有成功采集的日子。",
    "achievements.tier.bronze": "青铜",
    "achievements.tier.silver": "白银",
    "achievements.tier.gold": "黄金",
    "achievements.tier.diamond": "钻石",
    "achievements.tier.king": "王者",
    "achievements.coverage.sessions":
      "自 Sessions 数据可用起统计，不覆盖更早历史。",
    "achievements.coverage.sync": "自采集记录（CLI 0.2.0）起统计。",
    "achievements.ui.subtitle": "五档进阶，全部在读取时计算。",
    "achievements.ui.summaryLabel": "已解锁成就",
    "achievements.ui.summaryUnlocked": "已解锁 {unlocked}/{total}",
    "achievements.ui.category.milestone": "里程碑",
    "achievements.ui.category.peak": "高峰",
    "achievements.ui.category.rhythm": "节奏",
    "achievements.ui.category.exploration": "探索",
    "achievements.ui.sectionProgress": "已解锁 {unlocked}/{total}",
    "achievements.ui.cardLocked": "尚未解锁",
    "achievements.ui.cardProgress": "{name} 进度 {percent}%",
    "achievements.ui.newBadge": "新",
    "achievements.ui.viewDetail": "查看详情",
    "achievements.ui.dialogTimeline": "五档时间线",
    "achievements.ui.dialogTierHistory": "等级历程",
    "achievements.ui.dialogProgressTo": "距{tier}进度",
    "achievements.ui.dialogCurrent": "当前值",
    "achievements.ui.dialogNext": "下一档",
    "achievements.ui.dialogGap": "还差 {gap}",
    "achievements.ui.dialogMaxed": "已达最高段位",
    "achievements.ui.dialogCoverage": "数据覆盖",
    "achievements.ui.dialogLocked": "未达成",
    "achievements.ui.dialogAchieved": "{date} 达成",
    "achievements.ui.dialogClose": "关闭",
    "achievements.ui.loadError": "成就加载失败。",
    "achievements.ui.retry": "重试",
    "achievements.ui.emptyTitle": "还没有可统计的用量",
    "achievements.ui.emptyBody":
      "配对设备并完成一次同步后，成就进度会在这里生成。",
    "achievements.ui.emptyPair": "配对设备",
    "achievements.ui.refresh": "刷新",
    "achievements.ui.refreshPending": "正在刷新…",
    "achievements.ui.refreshSuccess": "成就已刷新",
    "achievements.ui.lastUpdated": "上次更新 {time}",
    "achievements.ui.lastUpdatedNone": "尚未加载数据",
  },
  en: {
    "achievements.token_titan.name": "Token Titan",
    "achievements.token_titan.description":
      "Your lifetime tokens crossed another order of magnitude.",
    "achievements.wordsmith.name": "Wordsmith",
    "achievements.wordsmith.description":
      "Every output token you wrote became something you shipped.",
    "achievements.cachekeeper.name": "Cache Keeper",
    "achievements.cachekeeper.description":
      "Context you already read gets remembered by the cache.",
    "achievements.veteran.name": "Veteran",
    "achievements.veteran.description":
      "From the very first bucket until today, you stayed.",
    "achievements.big_day.name": "Big Day",
    "achievements.big_day.description":
      "One day you spent a whole year's momentum.",
    "achievements.cache_alchemy.name": "Cache Alchemy",
    "achievements.cache_alchemy.description":
      "Your best single-day cache hit rate.",
    "achievements.marathon_session.name": "Marathon Session",
    "achievements.marathon_session.description":
      "A session that ran from morning into the night. Stand up once in a while.",
    "achievements.model_symphony.name": "Model Symphony",
    "achievements.model_symphony.description":
      "How many models played on your busiest day.",
    "achievements.streak.name": "Streak",
    "achievements.streak.description":
      "Your longest run of active days in a row.",
    "achievements.marathoner.name": "Marathoner",
    "achievements.marathoner.description": "Days that actually carried usage.",
    "achievements.weekend_warrior.name": "Weekend Warrior",
    "achievements.weekend_warrior.description":
      "Saturdays and Sundays at the editor too.",
    "achievements.night_owl.name": "Night Owl",
    "achievements.night_owl.description":
      "Days with usage between midnight and 6am. Get some sleep.",
    "achievements.polyglot.name": "Polyglot",
    "achievements.polyglot.description":
      "Different models you have worked with.",
    "achievements.multitool.name": "Multitool",
    "achievements.multitool.description":
      "Different CLI tools running side by side.",
    "achievements.project_hopper.name": "Project Hopper",
    "achievements.project_hopper.description": "Projects you moved between.",
    "achievements.project_devotion.name": "Project Devotion",
    "achievements.project_devotion.description":
      "The most tokens you poured into one project.",
    "achievements.fleet.name": "Fleet",
    "achievements.fleet.description":
      "Devices this account has seen, retired ones included.",
    "achievements.sync_diligence.name": "Sync Diligence",
    "achievements.sync_diligence.description":
      "Consecutive days with a successful sync.",
    "achievements.tier.bronze": "Bronze",
    "achievements.tier.silver": "Silver",
    "achievements.tier.gold": "Gold",
    "achievements.tier.diamond": "Diamond",
    "achievements.tier.king": "King",
    "achievements.coverage.sessions":
      "Counted from the moment Sessions data became available; earlier history is not covered.",
    "achievements.coverage.sync":
      "Counted from sync-run reporting (CLI 0.2.0) onwards.",
    "achievements.ui.subtitle": "Five tiers each, all computed on read.",
    "achievements.ui.summaryLabel": "Achievements unlocked",
    "achievements.ui.summaryUnlocked": "{unlocked} of {total} unlocked",
    "achievements.ui.category.milestone": "Milestones",
    "achievements.ui.category.peak": "Peaks",
    "achievements.ui.category.rhythm": "Rhythm",
    "achievements.ui.category.exploration": "Exploration",
    "achievements.ui.sectionProgress": "{unlocked}/{total} unlocked",
    "achievements.ui.cardLocked": "Not unlocked yet",
    "achievements.ui.cardProgress": "{name} progress {percent}%",
    "achievements.ui.newBadge": "New",
    "achievements.ui.viewDetail": "View details",
    "achievements.ui.dialogTimeline": "Tier timeline",
    "achievements.ui.dialogTierHistory": "Tier history",
    "achievements.ui.dialogProgressTo": "Progress to {tier}",
    "achievements.ui.dialogCurrent": "Current",
    "achievements.ui.dialogNext": "Next tier",
    "achievements.ui.dialogGap": "{gap} to go",
    "achievements.ui.dialogMaxed": "Top tier reached",
    "achievements.ui.dialogCoverage": "Coverage",
    "achievements.ui.dialogLocked": "Locked",
    "achievements.ui.dialogAchieved": "Unlocked {date}",
    "achievements.ui.dialogClose": "Close",
    "achievements.ui.loadError": "Failed to load achievements.",
    "achievements.ui.retry": "Retry",
    "achievements.ui.emptyTitle": "No usage to measure yet",
    "achievements.ui.emptyBody":
      "Pair a device and run a sync — achievement progress shows up here.",
    "achievements.ui.emptyPair": "Pair a device",
    "achievements.ui.refresh": "Refresh",
    "achievements.ui.refreshPending": "Refreshing…",
    "achievements.ui.refreshSuccess": "Achievements refreshed",
    "achievements.ui.lastUpdated": "Updated {time}",
    "achievements.ui.lastUpdatedNone": "No data loaded yet",
  },
};

/** Copy for one key, falling back to the key itself (never renders blank). */
export function achievementCopy(locale: Locale, key: string): string {
  return ACHIEVEMENTS_COPY[locale][key] ?? key;
}

/** All chrome keys shared by both locales (the copy guard asserts this). */
export function achievementChromeKeys(locale: Locale): string[] {
  return Object.keys(ACHIEVEMENTS_COPY[locale]);
}
