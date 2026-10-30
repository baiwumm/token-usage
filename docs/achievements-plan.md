# 成就系统实施计划（Achievements Plan）

> 状态：**P2 代码完成（成就页 / 侧栏 / wrapped / 文案）；待浏览器人工验收（P2.6）**
> 创建 / 最后更新：2026-10-30
> 决策来源：2026-10-30 方案讨论，操作者已确认方向与 §1 全部决策
> 执行方式：按 §4 阶段顺序推进；**每阶段 `pnpm verify` 全绿后才打钩**，并同步更新 §0 与 §8，再进入下一阶段

---

## 0. 当前进度

| 阶段 | 内容 | 状态 |
|---|---|---|
| 计划 | 方案与决策定稿 | ✅ 2026-10-30 |
| 文档回写 | requirements / rewrite-plan / ui-spec / AGENTS 已更新 | ✅ 2026-10-30 |
| P0 | 领域层：catalog + compute + 单测 + 校准 | ✅ 2026-10-30（阈值已按真实实例校准） |
| P1 | 数据面：`/api/app/achievements` + 鉴权 + 测试 | ✅ 2026-10-30（已上线并线上验证） |
| P2 | 界面：成就页 + 侧栏 + wrapped + 文案 | 🟡 2026-10-30 代码完成，待人工验收 |
| Backlog | 见 §4 P3 | — |

- 当前阶段：**P2 代码完成**（`/achievements` 页面 + 侧栏入口 + wrapped「今年解锁」+ zh/en 文案；`pnpm verify` 全绿）
- 下一步：**P2.6 浏览器人工验收**（正常 / 空 / 锁定进度 / 时区切换 / 窄屏 / 深色 / reduced-motion；Sessions 类覆盖说明可见），通过后打钩 §4 阶段完成，并按 §9 回填 requirements / ui-spec 细节
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
| 1 | v1 界面范围 | **A**：成就页 + 侧栏入口 + wrapped 年度回顾；页内用 localStorage 标记「新解锁」。仪表盘成就条、全局 toast 进 backlog |
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

---

## 2. 成就目录

### 2.1 通用规则

- **段位**：`0 = 未解锁`，`1 铜（bronze）`、`2 银（silver）`、`3 金（gold）`、`4 钻（diamond）`、`5 王者（king）`
- **指标单调白名单**（tier 只升不降的前提）：累计和、历史最大值、最长连续、去重计数、距首日天数。**禁止**：平均值、比率（比率类一律改写为「单日最佳 + 量门槛」）、成本（定价快照更新会使历史成本回缩）
- **时间语义**：日界 / 周末 / 夜间一律按用户本地时区；`achieved_at` 为本地日期 `YYYY-MM-DD`（日粒度，不做小时精度）
- **数据口径**：账号级、跨设备、跨 source；含 `cursor` / `trae-cn`（经会话状态合并）；含已吊销设备历史。Sessions 类成就天然不含账户级来源（其本无 sessions 行）
- **阈值唯一真源**：`apps/web/src/lib/achievements/catalog.ts`；前端不重复定义，payload 下发阈值
- **校准目标**：一年重度使用 ≈ 金/钻；王者 2 年+；任何情况下不允许「首月全钻」
- **文案基调**：个人编年史，不鼓励烧 token、不鼓励熬夜；健康相关成就文案带调侃

### 2.2 18 条成就（2026-10-30 校准定稿）

| 分类 | id / 名称 | 指标口径 | 铜 | 银 | 金 | 钻 | 王者 | 数据源 |
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

---

## 3. 技术方案

### 3.1 数据通路

- **接口**：`GET /api/app/achievements?tz=<IANA>&tz_offset_minutes=<n>`
- **鉴权**：浏览器会话 cookie，复用 `apps/web/src/app/api/app/sync-runs/route.ts` 的 `@supabase/ssr` 模式；响应 `Cache-Control: no-store`
- **数据加载**
  - 小时行 / 账户级会话状态：复用 `loadAccountUsage(userId)`（10s TTL 快照；见 `apps/web/src/lib/api/account-data.ts:139`）
  - 成就专用规范集：`canonicalizeUsage(usage.hourly, usage.sessionStates, null)` —— **不传 activeDeviceIds**，包含已吊销设备；`cursor` 去重与 `trae-cn` 聚合逻辑不变
  - 会话：`loadSessionRows(userId, fromIso, toIso)`，`fromIso` 取最早记录日或固定 `2000-01-01T00:00:00Z`，`toIso` 取当日 UTC 次日零点（避免缓存键随分钟变化）
  - 同步记录：`loadSyncRunRows(userId, fromIso, toIso)`，窗口同上
  - 设备行：`usage.deviceRows`（含已吊销与从未产生用量的已配对设备，供 `fleet` 判定）
- **计算**：`lib/achievements/compute.ts` 纯函数；不建表、不 cron、不写库
- **缓存**：v1 不加额外结果缓存；若实测单次 >300ms，再加按 `user + tz` 的 60s 内存缓存
- **函数预算**：仓库现有 13 个 route handler（`docs/rewrite-plan.md` §2 记载 Hobby 上限 12，文档已过时或套餐已变）。P1.4 在 Vercel 控制台核对；若超限，改为 `app/achievements/page.tsx` Server Component 直出，零新增函数

### 3.2 模块布局（新增文件）

```
apps/web/src/lib/achievements/catalog.ts        # 唯一阈值真源、分类、指标 kind、文案 key
apps/web/src/lib/achievements/compute.ts        # 纯函数：输入数据 → 成就进度
apps/web/src/lib/achievements/api.ts            # 客户端 fetch 封装 + 响应类型
apps/web/src/app/api/app/achievements/route.ts  # cookie 鉴权 + 参数校验
apps/web/src/app/achievements/page.tsx          # metadata + AppShell + client
apps/web/src/components/achievements/
  achievements-client.tsx                       # 编排（取数、时区参数、错误态）
  achievements-body.tsx                         # 主体：摘要 + 分区栅格
  achievements-summary.tsx                      # 已解锁统计
  achievement-card.tsx                          # 单条卡片
  achievement-dialog.tsx                        # 详情弹窗（五档时间线）
  achievement-medallion.tsx                     # 徽章视觉（预留 art 覆盖位）
  achievements-skeleton.tsx                     # 骨架
  use-achievements.ts                           # 数据 hook
apps/web/src/lib/copy/achievements.ts           # zh / en 文案
apps/web/tests/unit/achievements-compute.test.ts
apps/web/tests/unit/achievements-catalog.test.ts
scripts/admin/achievements-calibrate.mjs        # 一次性只读校准脚本
```

命名遵循 `AGENTS.md`：`<页名>-client/body/skeleton`、`<内容>-card/dialog`、`use-*.ts`；跨页共享件放 `components/` 根。

### 3.3 响应形状

```json
{
  "generated_at": "2026-10-30T08:00:00.000Z",
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

- **页面结构**：摘要（已解锁 x/18、各段位数）→ 按「里程碑 / 高峰 / 节奏 / 探索」分区 → 卡片栅格；已解锁在前，锁定的展示当前值与下一档进度
- **卡片**：medallion（图标 + 段位渐变环 + 五段刻度点）+ 名称 + 一句话描述 + 进度条 + 达成日期（已解锁时）
- **详情弹窗**：大道具 medallion、五档时间线（达成日期）、距下一档差额、分享按钮（复用 `share-card` 基建，P3 实装）
- **段位视觉**：铜/银/金/钻用现有金属渐变语义；王者用黑金/紫金镭射渐变 + CSS 微光，`prefers-reduced-motion` 下降级为静态
- **新解锁标记**：localStorage 按 `userId` 记录上次查看时间，与 `achieved_at` 比较；页内展示「新」标记，不做全局 toast
- **入口**：`components/app-shell/nav-items.tsx` 增加「成就」（`@gravity-ui/icons` 的 `Medal` 图标）
- **wrapped**：年度回顾增加「今年解锁 N 枚」（按 `achieved_at` 落在当年判定）
- **空数据**：未配对设备/无用量时展示锁定栅格 + 引导文案

### 3.6 性能与安全

- 快照加载复用 10s TTL 缓存；成就只增加 CPU 遍历，不增加小时行查询
- 全历史 sessions 扫描是唯一新增 I/O；如会话量级过大，先限制窗口（如 3 年）并在文案说明，或后续改为 SQL 聚合 RPC
- 数据访问仅服务端 service-role；浏览器零 Supabase 直连；`anon`/`authenticated` 对 `token_*` 表保持零 policy（本方案不新增表）
- 接口不缓存（no-store），避免跨用户串数据

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
- [x] **P2.2** `components/achievements/*`：`achievements-client.tsx`（刷新 / 骨架 / 错误 / 新解锁）/ `achievements-body.tsx`（摘要 + 四分区 + 空态引导 + 弹窗编排）/ `achievements-summary.tsx` / `achievements-section.tsx` / `achievement-card.tsx` / `achievement-dialog.tsx` / `achievements-medallion.tsx` / `achievements-skeleton.tsx` / `use-achievements.ts` / `use-achievements-format.ts`
- [x] **P2.3** `lib/copy/achievements.ts`（zh + en，扁平键对齐 catalog 的 copyKey / descriptionKey / coverageKey）+ 侧栏 `nav-items.tsx` 入口（Medal 图标，`/wrapped` 之后）+ 页面标题映射 + metadata 文案
- [x] **P2.4** localStorage「新解锁」标记：键 `token-usage.achievements.seen.<userId>`（`useSessionBootstrap` 新增 `userId`），访问后把 marker 推进到最近一次 `achieved_at`，本次访问仍显示「新」
- [x] **P2.5** `/wrapped` 集成「今年解锁 N 枚」：与既有三个请求并行拉取成就、按 `achieved_at` 年度前缀计数；请求失败只隐藏该卡
- [ ] **P2.6** 浏览器人工验收：正常数据 / 空数据 / 锁定进度 / 时区切换 / 窄屏 / 深色模式 / reduced-motion；Sessions 类成就的覆盖说明可见
- [x] **P2.7** `pnpm verify` 全绿（lint 0 error / 4 条基线 warning、`tsc` 无输出、web 380 passed (27 files)、build 成功、CLI 72 passed）；§0 / §8 已更新
- [ ] **阶段完成**（待 P2.6 人工验收）

### P3 Backlog（不在本轮，确认后再排期）

- 仪表盘成就条（最近解锁 / 最接近解锁 top 3）
- 全局解锁 toast / 跨设备已读状态（需持久化表）
- 成就分享卡实装
- 每条成就专属插画，替换 medallion 占位
- 持久化 `token_achievements` 写穿缓存（仅当快照加载成为瓶颈或需跨设备状态时）
- 元成就（集齐 N 个钻石 → 王者之证）
- 年度挑战 / 赛季机制

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
- **catalog 守卫**：id 唯一；阈值数组长度 = 5 且严格递增；kind ∈ 单调白名单；每条有 zh/en 文案；图标 key 可解析
- **路由测试**：未登录 401；非法 `tz` 处理；响应字段类型与 `achieved_at` 键集合
- **人工验收**：§4 P2.6 清单
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
| 回滚 | 纯增量功能、零迁移：`git revert` 对应提交即完全回滚（侧栏入口随代码一起消失） |

---

## 8. 进度日志

| 日期 | 阶段 | 状态 | 提交 | 备注 |
|---|---|---|---|---|
| 2026-10-30 | 计划 | ✅ | — | 计划定稿，等待操作者放行 P0 |
| 2026-10-30 | 文档回写 | ✅ | — | requirements / rewrite-plan / ui-spec / AGENTS 已回写；覆盖原「成就系统不做」的边界结论并注明原因与实施计划入口 |
| 2026-10-30 | P0 | ✅ | 本次提交 | catalog（18 条 × 5 档、阈值唯一真源）+ compute（五类扫描、本地日 `achieved_at`、含吊销设备）+ 34 条守卫测试 + 只读校准脚本 |
| 2026-10-30 | P0.5 校准 | ✅ | 本次提交 | 真实实例校准：0 王者 / 7 钻（15 个月、21.66B tokens、94 活跃日）；改 `wordsmith` 50M/100M、`cache_alchemy` 70/85/93/98/99.8%、`marathon_session` 2h/6h/24h/3d/14d、`multitool` 王者 20、`project_hopper` 王者 60；reasoning 覆盖 36.5%，第 19 条不上线 |
| 2026-10-30 | P1 | ✅ | 本次提交 | `/api/app/achievements`（cookie 鉴权 + `lib/achievements/payload.ts` 组装 + `lib/achievements/api.ts` 客户端封装）与 6 条路由测试；14 个 handler 部署无异常，线上 401 + `no-store` 验证通过 |
| 2026-10-30 | P2 | 🟡 | 本次提交 | 成就页（page / client / body / summary / section / card / dialog / medallion / skeleton / hook / 格式化）+ zh/en 文案（含守卫测试）+ 侧栏入口 + 按 user 的 localStorage 新解锁 + wrapped「今年解锁 N 枚」；卡片整块为单一可聚焦按钮，锁定态仍显示当前值与下一档差值；待 P2.6 浏览器人工验收 |

> 每次阶段推进在此追加一行：日期、阶段、状态、commit hash、关键备注（校准结果、偏差、决策变更）。

---

## 9. 文档联动

- **已完成（2026-10-30，先于 P0）**：
  - `docs/requirements.md`：范围表新增 `/achievements`；边界表移除「成就系统」并保留排行榜 / 云端成就排除；路由约定、数据模型（无新表）、M7 验收标准
  - `docs/rewrite-plan.md`：§1 #1 / #20 修订 + 新增 #25 成就系统决策；§2 函数预算按实际 13 个 route handler 订正并挂 P1.4 核对点；§3 说明无新表；§5 新增 M7 里程碑行与工期
  - `docs/ui-spec.md`：新增「成就（`/achievements`，M7）」页面规范
  - `AGENTS.md`：文档地图新增本文件索引
- **P2 完成时**：用实现结果补全上述文档中的细节（阈值定稿值、页面实现偏差），不重复建规范
- **不触碰** `docs/cli-contract.md`（成就走 `/api/app/*`，不属于 CLI 契约层）
- **依赖预算**：不新增运行时依赖，`docs/rewrite-plan.md` §4 无需变更

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
  - `apps/web/src/lib/account/series.ts`（`parseTzContext` / `zonedDayKey` / 时区工具）
  - `apps/web/src/app/api/app/sync-runs/route.ts`（cookie 鉴权范式）
  - `apps/web/src/lib/copy/`（zh/en 文案模块模式）
  - `apps/web/src/components/app-shell/nav-items.tsx`（侧栏入口）
