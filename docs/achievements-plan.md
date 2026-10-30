# 成就系统实施计划（Achievements Plan）

> 状态：**M7 完成（P0 / P1 / P2 与浏览器人工验收全部通过）；P4 视觉改版已完成（P4.1–P4.7）；P3 收尾已完成（2026-10-30：仪表盘成就条、服务端已读水位 + 全局 toast、分享卡、CSS 3D 翻面；元成就、赛季、写穿缓存按触发条件明确关闭）；`pnpm verify` 全绿，操作者浏览器验收通过（2026-10-30）**
> 创建 / 最后更新：2026-10-30
> 决策来源：2026-10-30 方案讨论，操作者已确认方向与 §1 全部决策；2026-10-30 视觉改版决策见 §1.3
> 执行方式：按 §4 阶段顺序推进；**每阶段 `pnpm verify` 全绿后才打钩**，并同步更新 §0 与 §8，再进入下一阶段

---

## 0. 当前进度

| 阶段 | 内容 | 状态 |
|---|---|---|
| 计划 | 方案与决策定稿 | ✅ 2026-10-30 |
| 文档回写 | requirements / rewrite-plan / ui-spec / AGENTS 已更新 | ✅ 2026-10-30 |
| P0 | 领域层：catalog + compute + 单测 + 校准 | ✅ 2026-10-30（阈值已按真实实例校准） |
| P1 | 数据面：`/api/app/achievements` + 鉴权 + 测试 | ✅ 2026-10-30（已上线并线上验证） |
| P2 | 界面：成就页 + 侧栏 + wrapped + 文案 | ✅ 2026-10-30（代码完成 + 操作者验收通过） |
| P4 | 视觉改版：插画徽章 + 徽章墙 | ✅ 2026-10-30（P4.1–P4.7 全部完成并验收） |
| P3 | 收尾：仪表盘成就条 / 已读水位 + 全局 toast / 分享卡 / 3D 翻面 / 代理守卫 | ✅ 2026-10-30（4 项实现 + 守卫修复 + 3 项按触发条件关闭；`pnpm verify` 全绿，浏览器人工验收通过） |

- 当前阶段：**M7 全部收尾**（2026-10-30，P3 浏览器验收通过；提交 `772ec68..84f0ef6`）
- 后续：无待办；元成就 / 赛季 / 写穿缓存按 §4 P3.6–P3.8 的触发条件关闭，需先满足触发条件再开新计划
- 换机器恢复：`pnpm install` → `pnpm verify` 确认基线 → 读本节与 §8 → 从 §4 第一个未勾选条目继续
- 执行规则：
  1. 开始某阶段时，把 §0 对应行改为「进行中」并注明日期；
  2. 阶段内每完成一项就打钩（`- [x]`）；
  3. 阶段收尾必须 `pnpm verify` 全绿，然后把该阶段所有条目标记完成，更新 §0、§8，与代码同一个 commit 提交（conventional commits + `Co-Authored-By:` trailer）；
  4. 发现事实与文档不符（函数预算、source 数、数据覆盖等）时，先修订本文件再继续；
  5. 阈值任何变更都必须改 `catalog.ts` + 守卫测试，并同步 §2 表格。

---

## 1. 已定决策（2026-10-30）

### 1.1 操作者拍板的 8 项

| # | 决策 | 结论 |
|---|---|---|
| 1 | v1 界面范围 | **A**：成就页 + 侧栏入口 + wrapped 年度回顾；页内用 localStorage 标记「新解锁」。仪表盘成就条、全局 toast 进 backlog（2026-10-30 P3 已实现，见 §4 P3） |
| 2 | 王者稀有度 | **A**：一年重度使用止步金/钻；王者需要 2 年以上，个别成就终身稀有 |
| 3 | Sessions 类成就 | **A**：v1 上线 3 条（`marathon_session` / `project_hopper` / `project_devotion`），UI 标注「自 Sessions 数据可用起统计」 |
| 4 | 第 19 条成就 | 先留位置；P0 校准时看 reasoning 覆盖率再定（见 §2.3） |
| 5 | 阈值校准 | **A**：写一次性校准脚本，对真实实例跑完再定稿 |
| 6 | 数据通路 | **A**：新增 `GET /api/app/achievements`；P1.4 核对 Vercel 函数预算，超限则成就页改 Server Component 直出（零新增函数） |
| 7 | 视觉投入 | **A**：图标 + 五档渐变 medallion，组件预留插画覆盖位 |
| 8 | 实施拆分 | **B**：P0 / P1 / P2 三个提交依次验收，每个都过 `pnpm verify` |

### 1.2 默认执行、操作者未反对的事项

- **双语文案**：`lib/copy/achievements.ts` 同时提供 zh / en；英文段位名用 King
- **吊销设备历史计入成就**：成就口径 `canonicalizeUsage(hourly, sessionStates, null)`，只升不降；与 Sessions 页「吊销即排除」语义不同，代码注释写明原因
- **时间基准**：沿用 heatmap 的浏览器实时时区（`tz` + `tz_offset_minutes`），不做固定时区偏好
- **页内附带「当前连续天数」统计**：仅展示，不参与成就判定
- **文档联动**：P2 完成时更新 `docs/requirements.md`、`docs/ui-spec.md`；不触碰 `docs/cli-contract.md`
- **不新增运行时依赖**：图标用 `@gravity-ui/icons`，动效纯 CSS

### 1.3 视觉改版决策（2026-10-30，操作者已确认）

背景：P2 的徽章是参数化 SVG（同心圆 + 渐变面 + 通用图标），18 条成就共用一套模具、只靠色相区分，网格观感偏平；上游 TokenTracker 的「插画式浮雕徽章 + 徽章墙」观感明显更好。上游仓库仅作参照（MIT），**不取其素材、不搬其代码**。

| # | 决策 | 结论 |
|---|---|---|
| 9 | 徽章资产来源 | **A**：自有 AI 生成（MiniMax `image-01`），统一「浮雕硬币」风格模板；不取上游 PNG、不引用上游代码。生成脚本与 prompt 清单入库 `scripts/admin/achievement-assets/` |
| 10 | 页面版式 | **B**：改「徽章墙」——分区保留，卡片边框去掉，徽章为主体，名称 + 段位文字 / 未解锁细进度条，数字与描述沉到弹窗 |
| 11 | 3D 翻面硬币 | 暂不做（需新增 `motion` 依赖，属运行时预算变更，留 P3 再议）。**2026-10-30 P3 实现**：纯 CSS（`transform-style: preserve-3d` + `rotateY(180deg)` + `backface-visibility`，`motion-reduce:transition-none`），不新增 `motion` |
| 12 | 资产段位表达 | 插画本身与段位无关：段位由徽章外的金属外环表达（青铜 / 白银 / 黄金 / 钻石 / 王者），一张图复用五档 |
| 13 | 加载失败回退 | 必须回退到现有参数化 SVG 徽章（`achievement-art.tsx`），页面不得出现空徽章位 |

补充（2026-10-30 实现时定，Operator 交接时的待定项之一）：插画是满幅圆盘，自带最外圈
铆钉边；为避免与段位外环叠成「双环」，`achievement-medallion.tsx` 在圆形框内按 1.0526 倍
放大（即裁掉 5 % 直径）后再裁切，裁切只发生在展示层，不改动 PNG 资产。

> 资产落地：18 张 256×256 透明 PNG 已在 `apps/web/public/achievements/`；QA 规则（纯黑虚空背景 + 正圆硬币居中占幅 70–95 %）与生成脚本见 §4 P4.2。

---

## 2. 成就目录

### 2.1 通用规则

- **段位**：`0 = 未解锁`，`1 青铜（bronze）`、`2 白银（silver）`、`3 黄金（gold）`、`4 钻石（diamond）`、`5 王者（king）`
- **指标单调白名单**（tier 只升不降的前提）：累计和、历史最大值、最长连续、去重计数、距首日天数。**禁止**：平均值、比率（比率类一律改写为「单日最佳 + 量门槛」）、成本（定价快照更新会使历史成本回缩）
- **时间语义**：日界 / 周末 / 夜间一律按用户本地时区；`achieved_at` 为本地日期 `YYYY-MM-DD`（日粒度，不做小时精度）
- **数据口径**：账号级、跨设备、跨 source；含 `cursor` / `trae-cn`（经会话状态合并）；含已吊销设备历史。Sessions 类成就天然不含账户级来源（其本无 sessions 行）
- **阈值唯一真源**：`apps/web/src/lib/achievements/catalog.ts`；前端不重复定义，payload 下发阈值
- **校准目标**：一年重度使用 ≈ 金/钻；王者 2 年+；任何情况下不允许「首月全钻」
- **文案基调**：个人编年史，不鼓励烧 token、不鼓励熬夜；健康相关成就文案带调侃

### 2.2 18 条成就（2026-10-30 校准定稿）

| 分类 | id / 名称 | 指标口径 | 青铜 | 白银 | 黄金 | 钻石 | 王者 | 数据源 |
|---|---|---|---|---|---|---|---|---|
| 里程碑 | `token_titan` Token 巨擘 | 累计 `total_tokens` | 100M | 1B | 10B | 100B | 1T | 小时行 |
| 里程碑 | `wordsmith` 妙笔生花 | 累计 `output_tokens` | 5M | 25M | 50M | 100M | 300M | 小时行 |
| 里程碑 | `cachekeeper` 缓存藏家 | 累计 `cached_input_tokens` | 10M | 100M | 1B | 10B | 100B | 小时行 |
| 里程碑 | `veteran` 老兵 | 距首条记录所在本地日的天数 | 30d | 90d | 180d | 365d | 730d | 小时行 |
| 高峰 | `big_day` 高光之日 | 单日本地日最大 `total_tokens` | 10M | 100M | 500M | 3B | 10B | 日桶 |
| 高峰 | `cache_alchemy` 缓存炼金 | 单日最高缓存命中率（当日 `total_tokens ≥ 1M`） | 70% | 85% | 93% | 98% | 99.8% | 日桶 |
| 高峰 | `marathon_session` 马拉松会话 | 最长单会话时长（线程存活跨度） | 2h | 6h | 24h | 3d | 14d | sessions |
| 高峰 | `model_symphony` 模型交响 | 单日出现过的不同模型数 | 2 | 3 | 5 | 8 | 12 | 日桶 models |
| 节奏 | `streak` 火焰 | 最长连续活跃天数 | 3d | 7d | 30d | 100d | 365d | 日桶 |
| 节奏 | `marathoner` 长跑者 | 累计活跃天数 | 7d | 30d | 100d | 365d | 730d | 日桶 |
| 节奏 | `weekend_warrior` 周末战士 | 本地周六/周日的活跃天数 | 5 | 20 | 50 | 100 | 200 | 日桶 |
| 节奏 | `night_owl` 夜猫子 | 本地 00:00–05:59 有活跃小时桶的**不同日期数** | 3 | 10 | 30 | 60 | 120 | 小时行 |
| 探索 | `polyglot` 模型通 | 不同模型数 | 5 | 15 | 30 | 60 | 100 | 小时行 |
| 探索 | `multitool` 多面手 | 不同 `source` 数 | 2 | 4 | 6 | 12 | 20 | 小时行 |
| 探索 | `project_hopper` 项目游侠 | 不同 `project_key` 数（非空） | 3 | 5 | 12 | 25 | 60 | sessions |
| 探索 | `project_devotion` 专情项目 | 单项目累计 `total_tokens` 最大值 | 1M | 10M | 100M | 1B | 10B | sessions |
| 探索 | `fleet` 多设备舰队 | 曾出现过的不同 `device_id` 数（含已吊销） | 2 | 3 | 4 | 5 | 7 | 设备/小时行 |
| 探索 | `sync_diligence` 采集纪律 | 连续有成功 sync 的本地日数（`result ∈ {ok, partial}`） | 7d | 30d | 90d | 180d | 365d | sync_runs |

补充定义：

- **活跃日**：本地时区当天 `total_tokens > 0`
- **缓存命中率**：`cached_input / (input + cached_input + cache_creation)`，输出不计
- **模型数**：按小时桶 `model` 字段去重（不做别名归一，校准后如噪声大可加归一规则）
- **单项目 token**：按 `project_key` 聚合 `token_sessions.total_tokens` 后取最大
- **采集纪律**：同一本地日至少一条成功 run 即算；断档即归零，取历史最长
- **多面手王者上限**：王者阈值不得超过 CLI 真实可达 source 数（`AUTO_SYNC_SOURCES`，当前 46）；2026-10-30 校准定为 20
- **校准基线（2026-10-30）**：真实实例 15 个月 / 21.66B tokens / 94 活跃日 / 636 会话 / 16 个 source。校准后最高仅 7 条钻石、0 条王者，符合「王者需 2 年以上」；`wordsmith` 金/钻下调到 50M/100M，`cache_alchemy` 上移到 70/85/93/98/99.8%（该实例前 5 个达标日 99.08–99.55%），`marathon_session` 按线程存活跨度改为 2h/6h/24h/3d/14d（实例最长 288.75h，≥24h 会话 21 个），`multitool` 王者 20、`project_hopper` 王者 60

数据覆盖说明（必须进 UI 文案）：

- 3 条 Sessions 类成就（`marathon_session` / `project_hopper` / `project_devotion`）**自 `token_sessions` 开始采集起统计**，不覆盖更早历史
- `sync_diligence` 自 `token_sync_runs`（CLI 0.2.0）起统计

### 2.3 候选第 19 条（P0 校准后决定）

- **`deep_thinker` 深度思考**：累计 `reasoning_output_tokens`，初版阈值 1M / 10M / 100M / 1B / 10B。前提：校准实例中 reasoning 字段覆盖率足够（多数在用模型有上报）；覆盖不足则放弃
- **2026-10-30 校准结论：暂不上线**。实例 reasoning 覆盖率 36.5% 行（16.8M tokens），低于 50% 门槛；阈值草案保留在本节，覆盖率提升后复议（不上线也不影响 18 条成就）
- 备选：`conversationalist` 对话家（累计 `conversations`，100 / 500 / 2K / 10K / 50K），区分度较低，除非操作者偏好
- **元成就「王者之证」（集齐 N 个钻石 → 专属徽章）：已关闭**（2026-10-30 P3）。它需要第 19 张专属插画资产（本机无 `mmx` 环境，无法生成），且与「18 条独立指标」的目录设计冲突；操作者提供资产并明确要求时再复议

---

## 3. 技术方案

### 3.1 数据通路

- **接口**：`GET /api/app/achievements?tz=<IANA>&tz_offset_minutes=<n>`；`POST /api/app/achievements`（body `{"seen_through":"YYYY-MM-DD"}`，P3 新增，复用同一个 route、零新增函数）
- **鉴权**：浏览器会话 cookie，复用 `apps/web/src/app/api/app/sync-runs/route.ts` 的 `@supabase/ssr` 模式；响应 `Cache-Control: no-store`
- **数据加载**
  - 小时行 / 账户级会话状态：复用 `loadAccountUsage(userId)`（10s TTL 快照；见 `apps/web/src/lib/api/account-data.ts:139`）
  - 成就专用规范集：`canonicalizeUsage(usage.hourly, usage.sessionStates, null)` —— **不传 activeDeviceIds**，包含已吊销设备；`cursor` 去重与 `trae-cn` 聚合逻辑不变
  - 会话：`loadSessionRows(userId, fromIso, toIso)`，`fromIso` 取最早记录日或固定 `2000-01-01T00:00:00Z`，`toIso` 取当日 UTC 次日零点（避免缓存键随分钟变化）
  - 同步记录：`loadSyncRunRows(userId, fromIso, toIso)`，窗口同上
  - 设备行：`usage.deviceRows`（含已吊销与从未产生用量的已配对设备，供 `fleet` 判定）
- **计算**：`lib/achievements/compute.ts` 纯函数；不建快照表、不 cron、不写库
- **已读水位（P3）**：`token_achievement_seen` 每用户单行 `seen_through`（本地日，只前进）；`GET` 在 payload 里下发 `seen_through`，`POST` 推进水位（`400` 非法日期 / `503` 写失败，迁移缺失时 GET 自动退化为 `null`）。成就本身仍是读时计算，这张表只存「看到哪一天」
- **缓存**：v1 不加额外结果缓存；若实测单次 >300ms，再加按 `user + tz` 的 60s 内存缓存
- **函数预算**：仓库现有 13 个 route handler（`docs/rewrite-plan.md` §2 记载 Hobby 上限 12，文档已过时或套餐已变）。P1.4 在 Vercel 控制台核对；若超限，改为 `app/achievements/page.tsx` Server Component 直出，零新增函数

### 3.2 模块布局（新增文件）

```
apps/web/src/lib/achievements/catalog.ts        # 唯一阈值真源、分类、指标 kind、文案 key
apps/web/src/lib/achievements/compute.ts        # 纯函数：输入数据 → 成就进度
apps/web/src/lib/achievements/art-fit.ts             # 徽章尺寸归一化表（实测硬币半径）
apps/web/src/lib/achievements/highlights.ts     # 新解锁 / 最近解锁 / 最接近解锁（客户端纯函数）
apps/web/src/lib/achievements/seen.ts           # token_achievement_seen 读写（服务端）
apps/web/src/lib/achievements/share.ts          # 成就分享卡投影 + 文件名
apps/web/src/lib/achievements/api.ts            # 客户端 fetch 封装 + 响应类型
apps/web/src/app/api/app/achievements/route.ts  # cookie 鉴权 + 参数校验
apps/web/src/app/achievements/page.tsx          # metadata + AppShell + client
apps/web/src/components/achievements/
  achievements-client.tsx                       # 编排（取数、时区参数、错误态）
  achievements-body.tsx                         # 主体：摘要 + 分区栅格
  achievements-summary.tsx                      # 已解锁统计
  achievement-card.tsx                          # 单条墙格
  achievement-coin.tsx                          # 详情里的 3D 翻面硬币（CSS）
  achievement-dialog.tsx                        # 详情弹窗（五档时间线）
  achievement-share-dialog.tsx                  # 成就分享卡弹窗
  achievement-medallion.tsx                    # 位图徽章（段位外环 + 锁定灰化 + SVG 回退）
  achievement-art.tsx                           # 参数化 SVG 徽章（回退用）
  achievement-tier-badge.tsx                    # 段位渐变标签（青铜 / 白银 / 黄金 / 钻石 / 王者）
  achievement-tiers.ts                          # 段位金属 / 渐变坡道 / 色相（两处徽章共用）
  achievements-skeleton.tsx                     # 骨架
  achievement-unlock-watcher.tsx                # 全局解锁 toast（挂在 AppShell）
  use-achievements.ts                           # 数据 hook
apps/web/src/components/dashboard/
  achievement-strip-section.tsx                 # 仪表盘成就条（槽位 + 状态）
  achievement-strip.tsx                         # 最近解锁 / 最接近解锁两组
apps/web/src/components/share-card/
  achievement.ts                                # 成就分享卡 Canvas（1080×1350）
apps/web/src/lib/copy/achievements.ts           # zh / en 文案
apps/web/tests/unit/achievements-compute.test.ts
apps/web/tests/unit/achievements-catalog.test.ts
apps/web/tests/unit/achievements-highlights.test.ts
apps/web/tests/unit/achievement-share.test.ts
scripts/admin/achievements-calibrate.mjs        # 一次性只读校准脚本
```

命名遵循 `AGENTS.md`：`<页名>-client/body/skeleton`、`<内容>-card/dialog`、`use-*.ts`；跨页共享件放 `components/` 根。

### 3.3 响应形状

```json
{
  "generated_at": "2026-10-30T08:00:00.000Z",
  "seen_through": "2026-10-29",
  "achievements": [
    {
      "id": "token_titan",
      "category": "milestone",
      "unit": "tokens",
      "tier": 2,
      "value": 2345678901,
      "thresholds": [100000000, 1000000000, 10000000000, 100000000000, 1000000000000],
      "next_threshold": 10000000000,
      "achieved_at": {
        "bronze": "2025-01-03",
        "silver": "2025-06-11",
        "gold": null,
        "diamond": null,
        "king": null
      }
    }
  ]
}
```

- `unit ∈ {tokens, days, count, duration_ms, percent, ratio}`；`cache_alchemy` 的 value / thresholds 用 0–1 小数（UI 格式化为 %）
- `achieved_at` 键固定五档，未达成 `null`；日期为用户本地日
- 前端按 `value` 与 `thresholds` 自行计算进度条比例；阈值只来自 payload
- `seen_through` 为账号级已读水位（本地日）；`null` = 从未记录（新账号，或迁移未落地时的降级态）
- `POST` 只回 `{ "seen_through": "<生效值>" }`；已读水位只前进，旧值不会覆盖新值

### 3.4 计算规则（`achieved_at` 回推）

| 指标类型 | 扫描逻辑 | 达成日 |
|---|---|---|
| 累计型 | 日桶按日期升序，running sum 累加 | running sum 首次越过阈值的那天 |
| 峰值型 | 逐日维护历史最大值（比率型带当日量门槛） | 首个满足该档条件的日期 |
| 连续型 | 维护 current streak，断档归零，记录历史最长 | current streak 首次达到该档的那天 |
| 去重型 | 按时间顺序把模型/source/项目/设备加入 Set | Set 大小首次达到该档的日期 |
| 时间型 | 首条记录本地日 → now | 首条记录日 + N 天 |

实现细节：

- 复用 `lib/account/series.ts` 的 `parseTzContext`、`zonedDayKey`、`zonedParts`，保证与 heatmap/sessions 时区语义一致
- `now` 由调用方注入（路由传 `new Date()`，测试传固定值），保证结果可测
- 单遍扫描日桶（O(rows + days)），会话按 `project_key` 聚合为 Map，sync runs 按本地日归并
- 单调性不变量：追加任意新数据后，任一成就 tier 不得下降（单测覆盖）

### 3.5 UI / UX

- **页面结构**：摘要（标题 + 副标题 + 已解锁 x/18 + 细进度条 + 段位计数行）→ 按「里程碑 / 高峰 / 节奏 / 探索」分区 → 徽章墙栅格；已解锁在前，锁定的展示当前值与下一档进度
- **墙格**：位图插画徽章（96px）+ 名称（单行截断）+ 段位文字（已解锁）/ 细进度条（未解锁）；整格是单一可聚焦按钮，数字与描述下沉到弹窗（P4 版式，见 §1.3）
- **徽章**：段位金属外环叠在位图之外（外环占直径 6 %），未解锁灰化 + 锁标，位图加载失败回退参数化 SVG 徽章
- **段位视觉**：铜/银/金/钻用现有金属渐变语义；王者用黑金/紫金镭射渐变 + CSS 微光，`prefers-reduced-motion` 下降级为静态
- **新解锁标记（P3 改服务端水位）**：游标是账号级的 `seen_through`（跨设备一致），不再是 localStorage；成就页用 `unlocksSince(rows, seen_through)` 得出本次「新」标记，「新」角标在本次访问内保持可见，渲染后再把水位推进到 `maxAchievedDay` 写回服务端。`seen_through === null` 视为首次基线：静默把水位写成「最近一次达成日 ?? 本地今天」，**不标任何「新」**，老账号升级后不会被历史成就刷屏
- **全局解锁 toast（P3）**：`achievement-unlock-watcher.tsx` 挂在 `AppShell`，无 UI、只弹 toast；每次整页加载跑一次（SPA 内导航不重复，刷新才重置），延迟约 1.2 s 启动，`/achievements` 页与隐藏标签页直接跳过。命中 `unlocksSince` 后用一条聚合 toast（`success`，6 s）列出最多 2 个「名称 · 段位」，其余写「等 N 枚」，随后推进水位；上一页刚解锁、下一轮登录在仪表盘看到的就是这条提示
- **仪表盘成就条（P3）**：位于 **Heatmap 之后、趋势之前**（2026-10-30 操作者裁定下移），两组**上下纵向排列**、各 ≤5 条（2026-10-30 操作者裁定：取代左右两栏，由 3 条调为 5 条，徽章加大、间距收紧）——「最近解锁」（最晚达成日降序）与「最接近解锁」（`progressRatioForNext` 降序，跳过 0 进度与满王者）；每组采用成就页徽章墙的卡片形式（居中徽章 + 名称 + 段位标签 / 细进度），**只读不跳转**（Header 的「查看全部」是唯一入口）；全部无数据时整条隐藏。数据走 `fetchAchievementsShared`，与全局 watcher 同屏且时区参数一致时共用在途请求（无 TTL，settle 即清）
- **分享卡（P3）**：已解锁的详情弹窗在正文最底部出现 `fullWidth` 的「分享成就」，先关详情再开分享弹窗（避免嵌套 Modal）；左侧预览、右侧「复制图片 / 下载 PNG」。卡片由 Canvas 2D 画出（1080×1350，`components/share-card/achievement.ts`），背景、段位色与金属外环取 `achievement-tiers.ts` 的原始色值；徽章位图走同源 `/achievements/<id>.png`（不污染 canvas），加载失败画金属盘 + 首字母占位，仍可导出。文件名 `token-usage-<id>-<tier>.png`；只含聚合数据（名称 / 描述 / 段位 / 当前值 / 达成日 / handle），不含行级信息
- **3D 翻面硬币（P3）**：详情弹窗头部换成可翻面硬币（`achievement-coin.tsx`），纯 CSS `perspective` + `rotateY`（不装 `motion`）；原生 `button` + `aria-pressed`，Enter / Space 可翻，`Tooltip` 提示；背面为段位金属盘 + 段位名 + 达成日（未解锁显示「尚未解锁」与下一档阈值）；弹窗关闭或切换成就时复位正面，`prefers-reduced-motion` 下无过渡
- **入口**：`components/app-shell/nav-items.tsx` 增加「成就」（`@gravity-ui/icons` 的 `Medal` 图标）；`src/proxy.ts` 把 `/achievements` 纳入受保护页面（未登录跳 `/login?next=/achievements`）
- **wrapped**：年度回顾顶部保持四张统计卡；成就单独做成占一行的卡（`components/wrapped/achievements-card.tsx`），列出当前已获得的全部成就（`tier ≥ 1`，段位降序）并带段位标签；请求失败整卡隐藏，零解锁显示空态（2026-10-30 操作者裁定，取代原「今年解锁 N 枚」第五卡）
- **空数据**：未配对设备/无用量时展示锁定栅格 + 引导文案；仪表盘成就条整条隐藏、全局 toast 不弹

### 3.6 性能与安全

- 快照加载复用 10s TTL 缓存；成就只增加 CPU 遍历，不增加小时行查询
- 全历史 sessions 扫描是唯一新增 I/O；如会话量级过大，先限制窗口（如 3 年）并在文案说明，或后续改为 SQL 聚合 RPC
- **客户端并发**：成就页、仪表盘条与全局 watcher 都走 `fetchAchievementsShared`，按 `tz|offset` 在途去重（settle 即清、无 TTL），同一时区参数下同屏最多一次全历史计算；仪表盘选了自定义时区时与 watcher 的浏览器时区不同，会各算一次（达成日口径不同，属预期）
- 数据访问仅服务端 service-role；浏览器零 Supabase 直连；`anon` / `authenticated` 对所有 `token_*` 表保持零 policy
- **新增表 `token_achievement_seen`**（P3，迁移 `20261030000000_token_achievement_seen.sql`）：每用户单行 `seen_through`（`date`，`>= 2000-01-01` 约束），RLS 开启且零 policy，`revoke all from public, anon, authenticated` + `grant all to service_role`；只存已读水位，**成就本身仍是读时计算**，不建快照 / 不写 `token_achievements`
- **写路径**：`advanceAchievementSeen` 用「条件更新 + 首写 insert（主键冲突 → 409 重读重试，最多 3 次）」保证只前进；写失败回 `503`，读失败只记日志并降级为 `seen_through: null`（已读是装饰性状态，不能拖垮页面）
- 接口不缓存（`GET` / `POST` 全部 `no-store`），避免跨用户串数据
- 分享卡在浏览器内绘制，不进服务端；读取的徽章图是同源静态 PNG（`canvas` 不被跨域污染，`toDataURL` 稳定）

---

## 4. 阶段与验收

> 每阶段收尾：`pnpm verify` 全绿 → 勾选本阶段全部条目 → 更新 §0 / §8 → 提交。单个测试可先跑 `pnpm vitest run <file>`。

### P0 领域层（无网络、无 UI）

- [x] **P0.1** `lib/achievements/catalog.ts`：18 条定义、5 档阈值、分类、指标 kind、单位、图标 key、文案 key；导出 `TIERS`、`ACHIEVEMENTS`、查询辅助
- [x] **P0.2** `lib/achievements/compute.ts`：纯函数 `computeAchievements({ hourly, sessionStates, sessions, syncRuns, devices, tzContext, now })`；内部自建 canonical 集（含吊销设备）；实现 §3.4 五类扫描与 `achieved_at` 回推
- [x] **P0.3** `tests/unit/achievements-compute.test.ts`：每档边界、时区日界（跨午夜/跨年）、streak 断档、周末/夜间、去重计数、**吊销设备不清零**、achieved_at 正确、`now` 注入、单调性不变量
- [x] **P0.4** `tests/unit/achievements-catalog.test.ts`：id 唯一、阈值严格递增且长度 5、kind 在单调白名单、每条有 zh/en 文案 key、图标 key 存在
- [x] **P0.5**（2026-10-30 校准完成） `scripts/admin/achievements-calibrate.mjs`：只读脚本，加载真实实例全历史，输出每条指标当前值、五档命中情况与分布建议；核对 CLI 真实 source 数、reasoning 覆盖率；据此定稿 §2 阈值（含第 19 条取舍）并回填 catalog 与 §2 表格
- [x] **P0.6** `pnpm verify` 全绿；更新 §0 / §8
- [x] **阶段完成**（2026-10-30，P0）

### P1 数据面

- [x] **P1.1** `app/api/app/achievements/route.ts`：cookie 鉴权（照抄 sync-runs 模式）、`tz`/`tz_offset_minutes` 校验（非法参数回退服务端默认或 400，实现时对齐现有 series 处理）、调用 compute、返回 §3.3 形状
- [x] **P1.2** `lib/achievements/api.ts`：客户端 fetch 封装与响应类型（含 401 语义，复用 `isUnauthorized` 模式）
- [x] **P1.3** 路由测试：未登录 401、参数校验、响应形状与字段类型
- [x] **P1.4** 核对 Vercel 函数预算：新增后共 14 个 route handler；控制台无异常，线上验证 `GET /api/app/achievements` 返回 401 + `Cache-Control: no-store` 且 `X-Matched-Path` 命中该路径（2026-10-30），函数已部署。现行 Vercel 文档（Functions Limits / Hobby 套餐页）已不再列出每次部署的函数数量上限，故不需改 Server Component 直出
- [x] **P1.5** `pnpm verify` 全绿；更新 §0 / §8
- [x] **阶段完成**（2026-10-30，P1）

### P2 界面

- [x] **P2.1** `app/achievements/page.tsx`：页面级 metadata（`createPageMetadata` key `achievements`）+ AppShell 组合；无 `useSearchParams`，不需要 Suspense
- [x] **P2.2** `components/achievements/*`：`achievements-client.tsx`（刷新 / 骨架 / 错误 / 新解锁）/ `achievements-body.tsx`（摘要 + 四分区 + 空态引导 + 弹窗编排）/ `achievements-summary.tsx` / `achievements-section.tsx` / `achievement-card.tsx` / `achievement-dialog.tsx` / `achievement-art.tsx`（参数化 SVG 徽章） / `achievements-skeleton.tsx` / `use-achievements.ts` / `use-achievements-format.ts`
- [x] **P2.3** `lib/copy/achievements.ts`（zh + en，扁平键对齐 catalog 的 copyKey / descriptionKey / coverageKey）+ 侧栏 `nav-items.tsx` 入口（Medal 图标，`/wrapped` 之后）+ 页面标题映射 + metadata 文案
- [x] **P2.4** localStorage「新解锁」标记：键 `token-usage.achievements.seen.<userId>`（`useSessionBootstrap` 新增 `userId`），访问后把 marker 推进到最近一次 `achieved_at`，本次访问仍显示「新」
- [x] **P2.5** `/wrapped` 集成「今年解锁 N 枚」：与既有三个请求并行拉取成就、按 `achieved_at` 年度前缀计数；请求失败只隐藏该卡（2026-10-30 改为独立成就卡，见 §3.5）
- [x] **P2.6** 浏览器人工验收（2026-10-30 操作者确认通过）：正常数据 / 空数据 / 锁定进度 / 时区切换 / 窄屏 / 深色模式 / reduced-motion；Sessions 类成就的覆盖说明可见
- [x] **P2.7** `pnpm verify` 全绿（lint 0 error / 4 条基线 warning、`tsc` 无输出、web 380 passed (27 files)、build 成功、CLI 72 passed）；§0 / §8 已更新
- [x] **阶段完成**（2026-10-30，P2）

### P4 视觉改版：插画徽章 + 徽章墙（2026-10-30 完成并验收）

背景与决策见 §1.3。目标：把「参数化 SVG 徽章 + 卡片网格」换成「每条成就一张插画徽章 + 徽章墙」。

- [x] **P4.1** 风格样张：2 张（`token_titan` / `night_owl`）出图 + 圆形 alpha 裁切验证，**操作者确认风格通过**
- [x] **P4.2** 18 张徽章资产生成并入库：`apps/web/public/achievements/*.png`（256×256 透明 PNG，文件名 = 成就 id，调色板量化后 17–30 KB / 张，合计 ~420 KB）；prompt 模板 + 生成脚本入库 `scripts/admin/achievement-assets/`（`prompts.json` + `generate.mjs` + README）；资产来源与使用约定写进 `apps/web/public/achievements/README.md`
- [x] **P4.3** 组件改造：`achievement-art.tsx` → `achievement-medallion.tsx`（位图 + 段位金属外环 + 锁定灰化与锁标 + SVG 回退；回退同时覆盖 `onError` 与挂载后 `naturalWidth` 检查）；`achievement-card.tsx` 改墙格（无边框，徽章 + 名称 + 段位文字 / 细进度条）；`achievements-summary.tsx` 改页头摘要（大号 x/18 + 细进度条 + 段位计数行）；`achievements-skeleton.tsx` 改圆形占位；`achievement-dialog.tsx` 换大徽章（176px）；`achievements-section.tsx` 栅格改 3/4/5/6 列
- [x] **P4.4** 目录层：`catalog.ts` 增 `art` 字段（`/achievements/<id>.png`），`ACHIEVEMENT_ICONS` 退为回退用；`tests/unit/achievements-catalog.test.ts` 守卫同步（id 与文件名一一对应 + 资产存在）
- [x] **P4.5** 文档回写：`docs/ui-spec.md` 成就节改徽章墙规范；本文件 §0 / §8 更新
- [x] **P4.6**（2026-10-30 操作者验收通过） `pnpm verify` 全绿 + 浏览器人工验收（浅色 / 深色 / 375px 窄屏 / 图片加载失败回退 / reduced-motion / 键盘可达）；机器核对（headless Chrome + CDP）覆盖深色、375px 无横向滚动、断图回退 SVG、reduce 下 `transition-property: none`、Enter / Esc 开合弹窗并把焦点还给墙格；验收反馈的「当前值不弱化」与「刷新过程/结果 Toast」已修复
- [x] **P4.7**（2026-10-30 操作者批准并执行）体积收口与脚本可复现：**资产侧已量化**（18 张合计 ~420 KB，单张 17–30 KB）；`jpeg-js@0.4.4` + `pngjs@7.0.0` 加入**仓库根** `package.json` 的 `devDependencies`（不算运行时预算，不改 `apps/web` 依赖图；`docs/rewrite-plan.md` §4 已记录）；生成脚本从脚本目录可直接解析这两个包，`--only` / `--seed` / `--optimize-only` 均可在仓库内跑通。`sharp`（原生二进制的调色板量化）仍为可选、未安装，缺它时量化步骤自动跳过（重新出图的成片约 80–110 KB / 张，用时再补装）

### P3 收尾（2026-10-30：4 项实现 / 1 项顺带修复 / 3 项按触发条件关闭）

- [x] **P3.1** 仪表盘成就条：`components/dashboard/achievement-strip-section.tsx`（Card + 标题 + 「查看全部」+ `SectionSkeleton` / `SectionError`）+ `achievement-strip.tsx`（最近解锁 / 最接近解锁**上下两组、各 ≤5 条**，采用成就页徽章墙卡片形式，**只读不跳转**），插在 Heatmap 之后、趋势之前（2026-10-30 操作者调整）；`dashboard-client.tsx` 第 7 个加载槽走 `fetchAchievementsShared`（与全局 watcher 共用在途请求），空账号整条隐藏；骨架与 zh/en 文案同步
- [x] **P3.2** 已读水位 + 全局解锁 toast：迁移 `20261030000000_token_achievement_seen.sql`（每用户单行 `seen_through`、RLS 零 policy）；`lib/achievements/seen.ts`（条件更新 + 首写 insert、主键冲突 409 重试；读失败降级 `null`）；`GET` 下发 `seen_through`、同一 route 新增 `POST`（401 / 400 非法或未来日 / 503 写失败，全部 `no-store`，零新增函数）；`lib/achievements/highlights.ts` + 单测；`achievement-unlock-watcher.tsx` 挂 `AppShell`（整页一次、1.2 s 延迟、跳过 `/achievements` 与隐藏页、聚合 toast 后推进水位）；成就页「新」标记改由服务端水位推导，旧 localStorage 键不再使用
- [x] **P3.3** 成就分享卡：Canvas 2D 引擎 `components/share-card/achievement.ts`（1080×1350，等字体就绪后绘制，徽章同源 PNG + 金属盘占位回退），纯投影 `lib/achievements/share.ts`（`buildAchievementShareData` / `achievementShareFilename`），弹窗 `achievement-share-dialog.tsx`（预览 + 复制 / 下载 + 失败提示），详情弹窗已解锁时提供入口且先关详情再开分享；零新增依赖，只含聚合数据
- [x] **P3.4** 3D 翻面硬币：`components/achievements/achievement-coin.tsx` 纯 CSS（`perspective` / `preserve-3d` / `rotateY`，`motion-reduce` 无过渡），原生 button + `aria-pressed` + Tooltip，正面徽章 / 背面段位盘 + 达成日或下一档阈值，切换成就与关闭弹窗复位
- [x] **P3.5**（顺带修复）`/achievements` 纳入 `src/proxy.ts` 的受保护页面与 matcher，未登录跳 `/login?next=/achievements`；契约测试补齐。`docs/requirements.md` 要求除 `/login`、`/auth/callback` 与 CLI API 外全部需登录，此前漏配
- [x] **P3.6** 元成就（集齐 N 个钻石 → 王者之证）—— **评估后不做**。理由：需要第 19 张专属插画资产（本机无 `mmx` 环境），且与「18 条独立指标」的目录设计相冲突。触发条件：操作者提供资产并明确要求
- [x] **P3.7** 年度挑战 / 赛季机制 —— **评估后不做**。缺产品定义（窗口 / 重置 / 奖励 / 存储），需要单独的需求文档。触发条件：先有书面产品需求
- [x] **P3.8** `token_achievements` 写穿缓存 —— **评估后不做**。当前无性能瓶颈，写路径改造只会扩大侵入面。触发条件：全历史快照加载 P95 > 1 s，或 `/api/app/achievements` P95 > 1.5 s，或小时 / 会话行数 > 50 万
- [x] **P3.9**（2026-10-30 操作者验收通过）`pnpm verify` 全绿（web 30 files / 418 tests + build，CLI 72；lint 0 error / 5 warning，其中 4 条为既有基线、1 条为 `seen.ts` 的降级日志）+ 浏览器人工验收（仪表盘条浅色 / 深色 / 375px、全局 toast 整页一次且成就页不弹、翻面点击与键盘、reduce 无过渡、分享卡预览 / 复制 / 下载 / 断图占位、未登录直跳登录）。已完成的机器核对：未登录 `/achievements` → 307 `/login?next=%2Fachievements`；`GET`/`POST /api/app/achievements` 未登录均 401 + `no-store`；构建产物含 `preserve-3d` / `rotateY(180deg)` / `backface-visibility:hidden` 与 `prefers-reduced-motion:reduce` 规则；迁移已通过 `DATABASE_URL` 执行，`token_achievement_seen` 存在、RLS 开启且 0 policy、anon/authenticated 无权限、service_role 可读写
- [x] **阶段完成**（2026-10-30，P3）：P3.1–P3.9 全部收尾，提交 `772ec68..84f0ef6`

---

## 5. 阈值校准流程（P0.5）

1. 脚本只读：读取 `SUPABASE_URL`、`SUPABASE_SECRET_KEY`、`ACHIEVEMENTS_USER_ID` 环境变量；不写库、不打印任何 token 明文
2. 加载该用户全历史（小时行 + 账户级会话状态 + sessions + sync runs），按本地时区计算 18 条指标与五档命中
3. 输出：每条成就的 current value、按初版阈值命中的段位、以及「如果一年重度使用达到 X」的参考区间
4. 校准原则：一年重度 ≈ 金/钻；王者 2 年+；无成就首月满级；不可达档位（如 source 数上限）及时下调
5. 定稿：更新 `catalog.ts` 阈值 → 更新 §2 表格 → 守卫测试通过
6. 说明：读时计算下，阈值变更会立即重算并可能追授段位，这是预期行为；不做历史冻结

---

## 6. 测试与守卫清单

- **compute 单测**：五类指标边界值、时区日界、跨月/跨年 streak、周末/夜间计数、去重计数、吊销设备不清零、`achieved_at` 回推、单调性（追加数据 tier 不降）、固定 `now`
- **catalog 守卫**：id 唯一；阈值数组长度 = 5 且严格递增；kind ∈ 单调白名单；每条有 zh/en 文案；图标 key 可解析；`art` 与资产文件一一对应
- **highlights 单测**（P3）：`recentUnlocks` / `nearestUnlocks` 排序与并列、`unlocksSince` 的 `null`（首访不报新）/ 新旧水位、`countUnlocked`、`isDayKey` 拒绝非法日期（如 `2026-02-30`）
- **分享卡投影单测**（P3）：字段、zh/en 段位名、空 handle 回退、未解锁 / 未知 id → `null`、文件名
- **路由测试**：未登录 401；非法 `tz` 处理；响应字段类型与 `achieved_at` 键集合；GET 带 `seen_through`；POST 的 401 / 400（坏 JSON、非法日、未来日）/ 首次插入 / 旧值不回退 / 新值前进 / 503，且全部 `no-store`
- **代理守卫**：契约测试断言 `/achievements` 未登录跳 `/login?next=/achievements`
- **文案守卫**：新增 toast / 翻面 / 分享卡 key 在 zh/en 两侧成对（现有 copy 测试覆盖）
- **人工验收**：§4 P2.6 清单 + P3.9 清单（仪表盘条、全局 toast、翻面、分享卡、守卫）
- **机器核对**：headless Chrome + CDP（375px 无横向滚动、reduce 下 `transition-property: none`、toast 每次加载只出现一次、下载 PNG 为 1080×1350）
- **性能**：记录一次全历史请求的耗时（服务端日志），超过 300ms 时启用结果缓存

---

## 7. 风险与回滚

| 风险 | 应对 |
|---|---|
| Vercel 函数预算不足 | P1.4 先核对；超限切 Server Component 直出，零新增函数 |
| Sessions 历史覆盖有限 | UI 明示「自 Sessions 数据可用起统计」；不接受就不上这 3 条（需操作者改决策） |
| 阈值定得不合理 | 校准脚本 + 守卫测试；读时计算可随时调，立即生效 |
| 数据被人工删改导致掉级 | 自部署场景接受；正常采集路径 append-only，不会触发 |
| 历史行数过大导致请求变慢 | 先加 60s 结果缓存；再不行改 SQL 聚合 RPC 或持久化写穿表 |
| 健康类成就价值观风险 | 阈值保守 + 文案调侃；不做「当前连续」压力机制 |
| 插画风格漂移（AI 出图不一致） | 统一风格模板 + 硬性 QA（纯黑虚空背景 / 正圆硬币居中占幅 70–95 %）；不合格换 seed 重生成，最多 4 次；生成脚本与 prompt 清单入库可复现 |
| 资产体积（18 张 PNG 入库） | 已收口：调色板量化后单张 17–30 KB，合计 ~420 KB；量化由可选 `sharp` 完成，未安装时脚本跳过该步（成片偏大但不影响显示） |
| 资产生成脚本的依赖 | 已批准并落地（2026-10-30）：`jpeg-js@0.4.4` + `pngjs@7.0.0` 为仓库根 `devDependencies`，仅离线脚本使用、不参与 web 构建与运行时拷贝；`sharp` 未安装，需要时再单独申请 |
| 全局 toast 刷屏 | 每次整页加载只检查一次（模块级标记），跳过 `/achievements`（该页自己管水位）与隐藏页；首次基线静默写入不弹；一次最多一条聚合 toast（最多列 2 个名称） |
| 未执行迁移 | GET 读 `token_achievement_seen` 失败时降级 `seen_through: null`（只记日志），页面与仪表盘条正常，「新」标记与 toast 自动关闭；`POST` 回 503，客户端静默。补齐迁移后无需改代码 |
| 已读水位并发 / 回退 | 写入是「只前进」的条件更新；首次写入用 insert（主键冲突返回 409，重读后走条件更新），旧值不会覆盖新值。水位写失败只会让下次多报一次「新」，不会丢数据 |
| 分享卡字体 / 断图 | 绘制前 `await document.fonts.ready`；徽章图同源、加载失败画金属盘 + 首字母占位，导出不中断；渲染异常显示「卡片渲染失败」并可重开 |
| Canvas 在测试环境不可用 | 分享卡只在浏览器弹窗内按需绘制，单测只覆盖纯投影（`share.ts`），不依赖 canvas |
| 回滚 | 代码侧 `git revert` 对应提交即回到 P4 状态；数据库侧新增表是独立且无外键依赖业务数据（仅 `auth.users` 级联），保留不删也无副作用。回滚 P3 前须先回滚依赖 `seen_through` 的前端提交 |

---

## 8. 进度日志

| 日期 | 阶段 | 状态 | 提交 | 备注 |
|---|---|---|---|---|
| 2026-10-30 | 计划 | ✅ | 043d466 | 计划定稿，等待操作者放行 P0 |
| 2026-10-30 | 文档回写 | ✅ | 043d466 | requirements / rewrite-plan / ui-spec / AGENTS 已回写；覆盖原「成就系统不做」的边界结论并注明原因与实施计划入口 |
| 2026-10-30 | P0 | ✅ | 90e1c0c | catalog（18 条 × 5 档、阈值唯一真源）+ compute（五类扫描、本地日 `achieved_at`、含吊销设备）+ 34 条守卫测试 + 只读校准脚本 |
| 2026-10-30 | P0.5 校准 | ✅ | ea12142 | 真实实例校准：0 王者 / 7 钻（15 个月、21.66B tokens、94 活跃日）；改 `wordsmith` 50M/100M、`cache_alchemy` 70/85/93/98/99.8%、`marathon_session` 2h/6h/24h/3d/14d、`multitool` 王者 20、`project_hopper` 王者 60；reasoning 覆盖 36.5%，第 19 条不上线 |
| 2026-10-30 | P1 | ✅ | d25c4a7 | `/api/app/achievements`（cookie 鉴权 + `lib/achievements/payload.ts` 组装 + `lib/achievements/api.ts` 客户端封装）与 6 条路由测试；14 个 handler 部署无异常，线上 401 + `no-store` 验证通过 |
| 2026-10-30 | P2 视觉 | ✅ | cf77e37 | 徽章改为参数化 SVG 艺术（金属环 + 成就专属色相 + 段位星辉 + 锁定态锁标），卡片改为徽章画廊式布局与五段进度轨，摘要改英雄带 + 段位分布条，弹窗改大徽章 + 时间线；无位图资产、无新增依赖 |
| 2026-10-30 | P2 | ✅ | 0e5f0f9 + a67bbaf | 成就页（page / client / body / summary / section / card / dialog / art / skeleton / hook / 格式化）+ zh/en 文案（含守卫测试）+ 侧栏入口 + 按 user 的 localStorage 新解锁 + wrapped「今年解锁 N 枚」；卡片整块为单一可聚焦按钮，锁定态仍显示当前值与下一档差值 |
| 2026-10-30 | P2.6 验收 + 文档回填 | ✅ | 本次提交 | 操作者确认浏览器验收通过（P2.6），P2 阶段完成；修正文档中的徽章组件旧名（`achievement-medallion.tsx` → `achievement-art.tsx`），并按实现回填 ui-spec（英雄带摘要 + 段位分布条、SVG 徽章、五段进度轨、整卡按钮）与 requirements 的校准结论 |
| 2026-10-30 | P4 决策 | ✅ | 本次提交 | 操作者确认 §1.3 全部 5 项：资产来源自有 AI 生成、页面改徽章墙、暂不做 3D 翻牌、段位由外环表达、加载失败回退 SVG |
| 2026-10-30 | P4.1–P4.2 资产 | ✅ | 本次提交 | 18 张徽章插画生成并入库 `apps/web/public/achievements/`（256×256 透明 PNG）；出图 QA（纯黑虚空背景 + 正圆硬币居中占幅 70–95 %）+ 圆形 alpha 裁切；prompt 模板与生成脚本入库 `scripts/admin/achievement-assets/`（脚本依赖 `jpeg-js` + `pngjs` 待批准，未写入 package.json） |
| 2026-10-30 | P4.3–P4.5 界面 | ✅ | 本次提交 | 徽章墙改造：`achievement-medallion.tsx`（位图 + 段位金属外环 + 裁 5 % 自带外圈 + 锁定灰化 + SVG 回退，含 SSR 首屏 404 的 `naturalWidth` 兜底）、墙格 `achievement-card.tsx`、页头摘要 `achievements-summary.tsx`、圆形骨架、弹窗大徽章 176px；`catalog.ts` 增 `art` 字段 + 资产存在性守卫测试；段位金属与色相抽到 `achievement-tiers.ts`（两个徽章组件共用一份） |
| 2026-10-30 | P4 段位渐变标签 + 详情排版 | ✅ | 本次提交 | 按操作者要求参考上游 TokenTracker：① 段位改「金属渐变标签」并写全名（青铜 / 白银 / 黄金 / 钻石 / 王者），坡道集中在 `TIER_RAMPS`，同一坡道刷外环、标签、等级历程条、进度条与摘要圆点；② 详情正文改成上游格式（标签左 / 数值右）：当前值 + 段位渐变徽章 → `dl` 分隔线下的「距{tier}进度 + 渐变进度条」与「等级历程五段条」→ 五档时间线（每档一个渐变段位徽章 + 阈值 + 达成日）；③ 达成日期改走 Tooltip（等级历程段与时间线徽章）。文案新增 `dialogTierHistory` / `dialogProgressTo`，删去已无引用的卡片期文案 |
| 2026-10-30 | P4 进度口径修正 + 间距/字号 | ✅ | 本次提交 | 操作者验收指出进度不对：原实现按「当前档区间」（上一档 → 下一档）算比例，与上游 `badgeProgress` 不一致，且刚升档时进度条会归零；改为「当前值 ÷ 下一档阈值」并钳在 0–100 %（`catalog.ts` 新增 `progressRatioForNext`，守卫测试覆盖）。同时按反馈：分隔线上方留间距、等级历程 / 五档时间线 / 数据覆盖各留间距、五档时间线标题弱化为与等级历程同款小字、摘要的段位计数行加大一号（`text-xs` + 数字 `text-sm`） |
| 2026-10-30 | P4 徽章尺寸归一化 + 放大 | ✅ | 本次提交 | 操作者反馈「有的徽章大、有的徽章小、整体偏小」。查明原因：出图 QA 允许硬币占画幅 70–95 %，18 张资产实测占幅 0.697–0.848（差 22 %），徽章框统一但里面的硬币不等大。新增 `lib/achievements/art-fit.ts` 记录每张图的实测硬币半径，徽章按 `(1 + 裁切) ÷ 半径` 缩放，所有硬币同大且裁切一致；徽章内部几何改为全比例（外环 6 %、裁切 5 %、锁标按比例），尺寸改由 CSS 决定：墙格 `w-24 md:w-28`（96 → 112px），弹窗 `w-44`（176px），骨架同步。守卫测试 `tests/unit/achievement-art-fit.test.ts` 直接解 PNG 的 alpha 圆盘重测半径与居中度，资产重新生成后表对不上即失败 |
| 2026-10-30 | P4 段位金属色对齐上游 | ✅ | 本次提交 | 操作者反馈「上游的渐变比较逼真」。核对上游 `tier-palette.js`：它的金属感来自「中间色 → 窄高光带 → 深色」的配方（外环 135° / 高光 42 %，标签与进度条 120° / 55 %）+ 深色 `glyph` 字色 + 内高光阴影；我们之前是「亮 → 中 → 深」铺开，高光带太宽所以发塑料。改法：段位色值与渐变角度整体对齐上游色板（`TIER_METALS` / `TIER_RAMPS` / 锁定中性灰同步），外环与 SVG 回退徽章的渐变停靠点改成上游顺序（0 % 中间色 / 42 % 高光 / 100 % 深色），标签与进度条/等级历程条共用 `tierGradient`。上游只有四档，`王者` 按同一配方取紫水晶色 |
| 2026-10-30 | P4 当前值 + 刷新反馈 | ✅ | 本次提交 | 操作者验收反馈两处：① 弹窗正文被 HeroUI 的 `.modal__body` 默认染成 muted，当前值一并变灰；正文改 `text-foreground`（标签仍显式走 muted），与上游「标签灰 / 数值纯黑」的配方一致。② 刷新按钮只有图标旋转，过程与结果都没有提示；改为两段式 Toast——按下即出「正在刷新…」（`timeout: 0`），结束原地切换为成功「成就已刷新」或失败「成就加载失败。(原因)」；刷新中按钮禁用并带 `aria-busy`；`useAchievements.refresh` 返回 `ok / error / unauthorized / skipped`，首载与 401 跳登录不弹。新增 zh/en 文案，`docs/ui-spec.md` 同步 |
| 2026-10-30 | P4.6 验收 | ✅ | 本次提交 | 操作者浏览器验收通过（浅色 / 深色 / 375px / 加载失败回退 / reduced-motion / 键盘可达）；同日机器核对：headless Chrome + CDP 量得 375px 无页面级横向滚动、断图时徽章回退参数化 SVG、reduce 下 `transition-property: none`、Enter 打开弹窗 / Esc 关闭且焦点回到触发墙格；`pnpm verify` 全绿（web 28 files / 390 tests + build，CLI 72）。P4.7（资产生成脚本 devDependency 批准）仍未勾选 |
| 2026-10-30 | P4.7 收尾 | ✅ | 本次提交 | 操作者批准后执行：`jpeg-js@0.4.4` + `pngjs@7.0.0` 以精确版本加入**仓库根** `package.json` 的 `devDependencies`（lockfile 同步；不做运行时依赖，不进 `apps/web` 依赖图），`generate.mjs` 的静态 import 从脚本目录可直接解析；修正 `scripts/admin/achievement-assets/README.md` 的安装位置说明（原写 `apps/web/package.json`，实际 Node 从脚本目录向上解析到仓库根）；`sharp` 仍为可选、未安装（量化跳过）。`docs/rewrite-plan.md` §4 增加 2026-10-30 增量记录。P4 阶段收尾 |
| 2026-10-30 | P3 决策 | ✅ | — | 操作者拍板：已读水位走、服务端小表 + 全局 toast；元成就关闭；赛季与写穿缓存关闭并写下触发条件。顺带发现 `/achievements` 未进 proxy 守卫，本轮一并修 |
| 2026-10-30 | P3.5 守卫 | ✅ | 772ec68 | `src/proxy.ts` 补 `/achievements`（页面清单 + matcher），契约测试补未登录跳 `/login?next=/achievements` |
| 2026-10-30 | P3.2 水位 | ✅ | 1a70d15 | 迁移 `token_achievement_seen`（RLS 零 policy）+ `lib/achievements/seen.ts`（条件更新 / 首写 insert + 409 重试）+ `GET` 下发 `seen_through` + 同 route 新增 `POST`（401/400/503、`no-store`）+ `highlights.ts` 与单测 + fake-supabase 表 |
| 2026-10-30 | P3.2 toast | ✅ | e4cb721 | `achievement-unlock-watcher.tsx` 挂 `AppShell`；成就页「新」标记改服务端水位（移除 localStorage 键与私有 `latestAchievedDay`）；zh/en 文案 |
| 2026-10-30 | P3.1 仪表盘条 | ✅ | 8012a91 | `achievement-strip-section.tsx` + `achievement-strip.tsx`；`dashboard-client.tsx` 第 7 槽复用 `fetchAchievementsShared`；骨架 / 文案 / 空账号隐藏 |
| 2026-10-30 | P3.3–P3.4 分享卡 + 翻面 | ✅ | 4e2e086 | Canvas 1080×1350 分享卡（`share-card/achievement.ts` + `lib/achievements/share.ts` + 弹窗，零新依赖，断图回退金属盘）；详情硬币 CSS 3D 翻面（原生 button + `aria-pressed`，reduce 无过渡） |
| 2026-10-30 | P3 验收 + 文档 | ✅ | 84f0ef6 | 文档回写完成（本文件 + requirements + rewrite-plan + deploy-guide + ui-spec）；`pnpm verify` 全绿（web 30 files / 418 tests + build，CLI 72；lint 0 error / 5 warning）；机器核对未登录跳转、GET/POST 401 + no-store、3D/reduce CSS 产物；迁移已用 `DATABASE_URL` 执行并核对（RLS 开启、0 policy、anon/authenticated 无权限、service_role 可读写）；操作者浏览器验收通过（2026-10-30） |

> 每次阶段推进在此追加一行：日期、阶段、状态、commit hash、关键备注（校准结果、偏差、决策变更）。

---

## 9. 文档联动

- **已完成（2026-10-30，先于 P0）**：
  - `docs/requirements.md`：范围表新增 `/achievements`；边界表移除「成就系统」并保留排行榜 / 云端成就排除；路由约定、数据模型（无新表）、M7 验收标准
  - `docs/rewrite-plan.md`：§1 #1 / #20 修订 + 新增 #25 成就系统决策；§2 函数预算按实际 13 个 route handler 订正并挂 P1.4 核对点；§3 说明无新表；§5 新增 M7 里程碑行与工期
  - `docs/ui-spec.md`：新增「成就（`/achievements`，M7）」页面规范
  - `AGENTS.md`：文档地图新增本文件索引
- **已完成（2026-10-30，P2 收尾）**：用实现结果补全细节，不重复建规范——`docs/ui-spec.md` 成就页改为英雄带摘要 + 段位分布条、参数化 SVG 徽章（`achievement-art.tsx`）、五段进度轨、整卡按钮；`docs/requirements.md` M7 验收补上阈值唯一真源 `apps/web/src/lib/achievements/catalog.ts`、校准结论与第 19 条未上线的原因
- **已完成（2026-10-30，P4）**：`docs/ui-spec.md` 成就节已按实现回填（徽章墙三/四/五/六列、位图徽章 + 段位外环 + 裁切规则、页头摘要、弹窗 176px 徽章、弹窗数值走前景色、刷新按钮禁用 + 两段式 Toast、圆形骨架）；P4.6、P4.7 均已通过，P4 阶段收尾
- **已完成（2026-10-30，P3）**：本文件全量回写（§0 / §1 / §3 / §4 P3 / §6 / §7 / §8 / §9）；
  `docs/requirements.md` 修正「不新增表」为「成就仍读时计算，仅新增 `token_achievement_seen`
  存已读水位」；`docs/rewrite-plan.md` 记录 `token_achievement_seen`（§3 表矩阵 + 成就仍读时
  计算）、`POST` 复用现有 route（§2 函数预算）、P3 零新增运行时依赖（§4）、M7 里程碑收尾；
  `docs/deploy-guide.md` 迁移清单补齐 6 个文件（含 sessions / sync_runs / achievement_seen 与
  可选 storage）；`docs/ui-spec.md` 仪表盘加成就条、成就节改写「新解锁」为服务端水位 + 全局
  toast、补分享按钮 / 分享弹窗 / 3D 翻面、分享卡一节补成就卡（1080×1350）
- **不触碰** `docs/cli-contract.md`（成就走 `/api/app/*`，不属于 CLI 契约层）
- **依赖预算**：不新增运行时依赖。2026-10-30 经操作者批准，仓库根 `devDependencies` 增加 `jpeg-js@0.4.4` + `pngjs@7.0.0`（仅离线资产生成脚本用，不进 `apps/web` 依赖图与构建产物），已在 `docs/rewrite-plan.md` §4 记录；`sharp` 未安装

---

## 10. 参考

- 上游页面：`https://www.tokentracker.cc/achievements`
- 旧仓库实现（参照，不回搬）：
  - `E:\personal-project\TokenTracker\scripts\ops\user-badges.sql`（catalog + 计算函数 + RPC）
  - `E:\personal-project\TokenTracker\dashboard\src\ui\achievements\`（catalog、tier 调色板、徽章与弹窗）
  - `E:\personal-project\TokenTracker\src\lib\local-api.js`（本地三徽章实时计算）
- 当前代码锚点：
  - `apps/web/src/lib/api/account-data.ts:139`（全历史快照 + 10s TTL）
  - `apps/web/src/lib/account/usage.ts:121`（`canonicalizeUsage`，吊销设备语义）
- 成就徽章资产（2026-10-30 新增）：
  - `apps/web/public/achievements/*.png`（18 张插画徽章）
  - `scripts/admin/achievement-assets/prompts.json`（风格模板 + 逐条主体描述）
  - `scripts/admin/achievement-assets/generate.mjs`（出图 + QA + 圆形裁切）
  - `apps/web/src/lib/account/series.ts`（`parseTzContext` / `zonedDayKey` / 时区工具）
  - `apps/web/src/app/api/app/sync-runs/route.ts`（cookie 鉴权范式）
  - `apps/web/src/lib/copy/`（zh/en 文案模块模式）
  - `apps/web/src/components/app-shell/nav-items.tsx`（侧栏入口）
