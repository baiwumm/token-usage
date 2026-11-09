# docs/badge.md — 公开徽章与公开页规范

> **文档地位**：本文件是公开徽章端点 `GET /api/badge`、配置端点 `GET/POST/PUT/DELETE
> /api/app/badge` 与公开页 `/u/<token>` 的唯一规范。三者都**不属于** CLI 契约层
> （`docs/cli-contract.md` 不约束，也不进 `next.config.mjs` 旧路径别名），但变更
> 顺序沿用同一流程：先改本文档与 golden 测试 → 操作者确认 → 再改实现。
>
> **需求与拍板（2026-11-01，操作者四项）**：
> 1. RANK 位改为**活跃天数**（自托管无排行榜语义）；
> 2. 访问凭证采用**每用户随机公开徽章令牌**（生成/重置/吊销，不暴露 user_id）；
> 3. 知情确认仓库徽章三项口径缺口（§4.2）与**仓库白名单制**；
> 4. 做公开页 `/u/<token>` 作为徽章点击落地。
>
> 上游（xiufengsun/TokenTracker 的 embed SVG）仅作形态参照，不搬实现、不搬命名；
> 端点、表名、参数全部走 token-usage 体系（AGENTS.md 约束 9）。

---

## §0 2026-11-05 二轮裁定（操作者指令，**覆盖下文冲突条目**）

1. 公开页默认展示：Hero 显示**用户头像**（内联 `data:` URI，无头像回退首字母圆）+ 显示名；「来源占比」「主要模型」各 5 行、**逐行等高对齐**（来源行含 `Meter`）。
2. 热力图改为**与仪表盘同款**：近一年 52 周、月份/周几标尺、共享 portal tooltip（含来源明细）、时区脚注与图例；**无平台筛选、无点击下钻、无设置开关、默认展示**；位置移到两列拆分**之前**。
3. 成就**默认展示、全部已解锁徽章都列出**；点击打开与 `/achievements` **同一个** `AchievementDialog`（含当前值、阈值时间线、达成日期），仅隐藏分享入口。
4. Settings 删除「公开页增强模块 / 全历史热力图 / 成就徽章」三块；配置端点 `showHeatmap` / `showAchievements` 字段一并移除，DB 两列**保留但不再读写**（见 §3.5）；公开页**删除仓库模块**。
5. 隐私口径相应放宽为：公开聚合用量、近一年逐日用量（含 tooltip 来源明细）与已解锁成就完整详情；仍绝不含会话明细、提示词、正文、路径、email、user_id、原始令牌 / 哈希，页脚声明同步。
6. 公开页 Token 数值改用 `useFormat().formatTokens`（成本仍走 §4.5 固定 USD 口径）；顶部品牌栏用 HeroUI `Button variant="outline"`；Hero 口径行为「全量数据 · 更新于 {UTC 时间}」，起止日改由 `Tooltip.Trigger` 浮层展示；成就项用 `Button variant="ghost"`、头像用 `Avatar`。
7. 后续各轮微调中仍然生效的部分已并入正文对应小节（§4.7、§6.2–§6.5、§6.8、§7.1、§7.2）；被下文正文吸收的旧描述（开关默认关 / 编年式全历史热力图 / 成就仅前 6 枚 + 独立轻量弹窗 / 仓库模块）一律以正文为准。

## §1 定位与隐私立场

三个组成面：

| 面 | 载体 | 受众 |
|---|---|---|
| SVG 徽章 | `GET /api/badge`，嵌 README / 个人主页 | 公开 |
| 公开页 | `/u/<token>`（徽章点击落地） | 公开 |
| 配置面 | Settings 页 `badge-card` + `/api/app/badge` | 登录用户本人 |

隐私立场（与 `token_sessions` 表注释同源）：**只出聚合数字**。任何响应（SVG、HTML、
JSON）永不包含 session 明细、提示词、正文、绝对路径、email、user_id、原始令牌或
令牌哈希。仓库名（project_key）属敏感面，默认不公开，白名单逐个开启（§3.3）。

分级补充（2026-11-05 操作者放行，公开页改版）：

- `GET /api/badge` 口径不变，仍只出账户 / 仓库的汇总数字。
- `/u/<token>` **始终展示**（无开关）：聚合汇总数字之外，额外公开 ① 近一年逐日聚合用量
  （含 tooltip 里的按来源构成）、② 已解锁成就的完整详情（当前值、阈值与达成日）。
- 公开页仍**永不包含**：会话明细、提示词、正文、绝对路径、email、user_id、设备标识、
  原始令牌 / 哈希，以及上段列出的全部敏感项（§3.5 的两个开关已移除）。
- 页面页脚隐私声明按上述口径固定表述（§6）。

## §2 徽章端点 GET /api/badge

路由文件 `apps/web/src/app/api/badge/route.ts`（静态路由，全查询参数驱动；动态段
只留给公开页）。服务端 service-role 直查，零浏览器 Supabase。

### §2.1 参数

| 参数 | 必填 | 取值 | 默认 | 说明 |
|---|---|---|---|---|
| `token` | 是 | 非空字符串 | — | 公开徽章令牌（§3.2）；只校验非空，格式与有效性交给哈希查库 |
| `project` | 否 | 白名单内 project_key（URL 编码） | — | 长度 1–120；**有则渲染仓库徽章，无则渲染账户徽章**（2026-11-04 操作者裁定：project 即开关）；解析层不归一，归一在数据层（§4.2） |
| `scope` | 否 | `user` \| `repo` | — | **遗留参数**（2026-11-04 起不再决定对象，仅为兼容既有嵌入保留）：值仍校验；`scope=repo` 而缺 `project` 仍按 bad request，避免旧链接静默变成账户徽章；`scope=user&project=…` 以 project 为准 |
| `style` | 否 | `panel` \| `compact` \| `sparkline` | `panel` | |
| `theme` | 否 | `dark` \| `light` \| `auto` | `dark` | |
| `range` | 否 | `all` \| `30d` | `all` | |

### §2.2 响应

- 成功：`200`，`Content-Type: image/svg+xml; charset=utf-8`，
  `Cache-Control: public, max-age=300, s-maxage=600, stale-while-revalidate=1800`
- 业务降级（§2.3）：`200` 兜底 SVG + `Cache-Control: no-store` —— 徽章在 README
  里永远不呈现为破图
- 方法守卫：`POST`/`PUT`/`DELETE` → `405` JSON `{error:"Method not allowed"}`；
  `OPTIONS` → `204`；错误响应一律 `no-store`
- 未预期异常：`500` JSON `{error:"Internal Server Error"}`，`no-store`，不回栈

### §2.3 降级矩阵

| 情形 | 兜底卡文案 |
|---|---|
| 令牌查无 / 哈希不匹配 | `badge unavailable` |
| `enabled=false` | `badge disabled` |
| `scope=repo` 且 project 不在 `allowed_projects` | `unknown project` |
| 参数非法（未知 style/theme/range/scope、`project` 超 120 字符、token 缺失、遗留 `scope=repo` 缺 `project`） | `bad request` |

注意：`scope=repo` 且白名单命中但该仓库暂无会话**不是降级**——正常渲染，计数为 0
（见附录 A fixture B）。

## §3 令牌与配置存储

### §3.1 迁移 `supabase/migrations/20261101000000_token_public_badges.sql`

```sql
create table if not exists public.token_public_badges (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token_hash text unique check (token_hash is null or char_length(token_hash) = 64),
  token_last4 text check (token_last4 is null or char_length(token_last4) = 4),
  enabled boolean not null default false,
  display_name text not null default '' check (char_length(display_name) <= 80),
  timezone text not null default 'UTC' check (char_length(timezone) between 1 and 64),
  allowed_projects jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check (jsonb_typeof(allowed_projects) = 'array'
         and jsonb_array_length(allowed_projects) <= 32)
);
```

- RLS enabled 零 policy + 仅 `service_role`（与 `token_*` 表同姿态，浏览器零直连）
- `token_hash` 可空：`null` = 未生成；PG unique 允许多个 NULL
- `token_last4` 是生成时落库的明文末 4 位，仅供 §7.1 GET 的 `tokenLast4` 展示；
  sha256 不可逆、末 4 位无法从哈希还原，必须随生成持久化（2026-11-02 P2 实施修订，
  由 contract golden 钉定）
- `display_name` 初始为**会话快照**（§7.1 generate 写入），公开渲染不回查 auth，也绝不
  回退到 email；2026-11-09 起可经 §7.1 `PUT {displayName}` 单独改写（含清空，空串由渲染
  器回退 `AI Coding Usage`），令牌不动
- `allowed_projects` 元素级校验（每项 ≤120 字符、过 `normalizeProjectKey`）在应用层
  完成（PG CHECK 不能含子查询）

### §3.2 令牌

- 格式：`tu_badge_` + 32 字符 base64url（24 字节 CSPRNG）；前缀便于密钥扫描
- 服务端只存 `sha256(token)` hex（64 位小写）+ 明文末 4 位（`token_last4`，§3.1）；
  明文只在生成响应里出现一次，之后不可再取
- 重置 = 覆盖 `token_hash`（旧令牌即刻失效，相当于轮换；公开端呈现 `badge unavailable`）
- 吊销（§7.1 DELETE）= `enabled=false`，哈希与末 4 位保留——公开端按 §2.3 呈现
  `badge disabled`，重新启用无需重发令牌（2026-11-02 P2 实施修订：golden 的 DELETE
  用例要求吊销后仍渲染 `badge disabled`，哈希置空将呈现 `badge unavailable`，与断言冲突）
- 令牌出现在 URL 查询里 → 会进各级访问日志：这是公开徽章的设计前提（令牌只控制
  聚合数字的公开），泄露面 = 重置即换锁

### §3.3 allowed_projects

- jsonb 字符串数组，元素为 project_key（= cwd basename，与 `token_sessions` 同口径）；
  ≤32 项、每项 ≤120 字符；空数组 = 仓库徽章全关，account 徽章不受影响

### §3.4 timezone

- IANA 名称；Settings 保存时由浏览器提供并按 `parseTzContext` 约定归一
  （`lib/account/series.ts`，非法回退 UTC）；活跃天数按此时区折算（§4.3）

### §3.5 公开增强模块开关（**已废弃**，见 §0；DB 列保留但代码不再读写）

新迁移（P9 创建；文件名以落地时复核 `supabase/migrations` 最新序号为准，本节以
`20261105000000_token_public_badges_sections.sql` 示意）只做增量，不重建表：

```sql
alter table public.token_public_badges
  add column if not exists show_heatmap boolean not null default false,
  add column if not exists show_achievements boolean not null default false;
```

- 两列曾用于控制公开页是否渲染全历史热力图与已解锁成就墙（默认 `false`、无回填、
  无新表、无新 policy，RLS 零 policy + 仅 `service_role` 姿态不变）。
- 2026-11-05 起两个开关随 §0 第 5 条**整体移除**：配置端点不再暴露 `showHeatmap` /
  `showAchievements`，代码也不再读写这两列（避免不可逆 DDL，列与迁移保留）；公开页的热力图
  与成就**始终计算并展示**，无开关、无「关了就不算不传」的分支。

## §4 数据与口径

### §4.1 account 徽章（scope=user）

- 与仪表盘同口径（2026-11-02 P3 实测修订，操作者裁定）：数据取账户快照的
  `canonicalRows`（仅活跃设备、Cursor 跨设备去重、Trae CN 取会话态），tokens 汇总
  `total_tokens`；成本逐行 `rowCost`（`lib/pricing` 读时定价，仅 grok/cline 采信正的
  上报成本）。原文「汇总存储列 `total_cost_usd`」作废：采集端上报行的存储成本恒为 0，
  实测真实账户徽章会永远显示 `$0.00`
- TOP 来源：按 `source` 聚合 `total_tokens` 降序取前 2 + 占比（panel 右下）
- TOP 模型：按 `model` 聚合降序 ≤5（公开页展示，徽章不展示）
- **复用** `lib/api/account-data.ts` 的快照单飞加载，不新增第二条全量拉取路径

### §4.2 repo 徽章（scope=repo）

- 源表 `token_sessions`（`user_id` + `project_key` eq；索引 `token_sessions_user_project_idx`）
- tokens 直接汇总；cost 由 `lib/pricing` 匹配单价计算（同仪表盘 Sessions 视图口径：
  每模型行不带计价时间上下文，恒按**峰值价**，DeepSeek 峰谷 / 周末半价不生效——
  `docs/cli-contract.md` §2.7 计价口径注记 2026-10-27 方案 b）
- 三项口径缺口（拍板 3 知情确认，写入 UI 提示文案）：
  1. `cursor` / `trae-cn` 为账户级来源，不进 `token_sessions` → 仓库徽章天然不含；
  2. `project_key` 为空的历史会话不计入（旧 CLI 回放可能缺失）；
  3. 同名 basename（不同目录同名仓库）合并统计。
- 白名单校验：请求 project 与 `allowed_projects` **精确匹配**（归一后比较）

### §4.3 活跃天数（RANK 替代位，拍板 1）

- 定义：去重 `dayKeyInTz(时间点, badge 所有者 timezone)` 计数
  （`lib/dashboard/ranges.ts` 的既有日折算）
- account 对 `hour_start`；repo 对 `ended_at`
- `range=30d` 时窗口为最近 30 个自然日（所有者时区），值上限 30

### §4.4 range

- `all`：全部历史；`30d`：以请求时刻为终点滚动 30 天。缓存 TTL 内的 "now" 取值
  属实现细节，不进 golden 断言

### §4.5 数字格式（v1 固定服务端默认，不随操作者本地偏好）

- tokens：以固定默认偏好调用 `lib/format/core.ts` `formatTokens` 的 compact KMB
  口径（如 `18.48B`）；禁止把预格式化字符串当数值二次格式化（对账三条陷阱之一）
- cost：`$` + en-US 分组；`< 10000` 保留 2 位小数（`$8.42` / `$1,318.40`），
  `≥ 10000` 取整（`$13,207`）
- 活跃天数：整数
- 本地化偏好（wan 单位、货币切换、日期格式）是 localStorage-only，不进服务端；
  v1 明确不本地化徽章

### §4.6 渲染输入类型（实现放 `src/lib/badge/types.ts`）

```ts
export type BadgeStyle = "panel" | "compact" | "sparkline";
export type BadgeTheme = "dark" | "light" | "auto";
export type BadgeRange = "all" | "30d";

export interface BadgeTotals { tokens: number; costUsd: number; activeDays: number }
export interface BadgeSource { key: string; label: string; tokens: number; share: number } // share 0..1
export interface BadgeModel { key: string; label: string; tokens: number }

export interface BadgeData {
  scope: "user" | "repo";
  project: string | null;      // repo 时为展示用 project_key（已截断前原值）
  displayName: string;         // 行内快照；空串由渲染器回退（§5.2）
  avatarDataUri?: string | null; // 头像内联 data: URI（§5.2，2026-11-02）；缺失 → 首字母圆
  range: BadgeRange;
  totals: BadgeTotals;
  sources: BadgeSource[];      // tokens 降序
  models: BadgeModel[];        // tokens 降序，≤5
  series: number[];            // 最近 30 个自然日日用量（所有者时区，升序）；可为空
}

export interface RenderOptions { style: BadgeStyle; theme: BadgeTheme }
```

### §4.7 公开页总数据口径（2026-11-05 操作者裁定）

- 页面固定 `range=all`，**删除近 30 天维度**：不渲染 30 日柱图、30 日汇总文案、任何
  时间范围切换，也不引入日均 / 环比 / rolling 窗口派生值。§2.1 的 `range=30d` 仅保留给
  徽章端点与既有嵌入链接，本页不消费；`BadgeData.series` 仍只服务 §5.4 sparkline。
- 范围 = 自首条记录日 → 最近一次同步日的**真全历史**，不截断 365 天（线上参照页的
  "total" 实为一年窗口，属形态参照不照搬）。与 §4.1 同源 `canonicalRows`（活跃设备、
  Cursor 跨设备去重、Trae CN 会话态）；成本仍逐行 `rowCost` 读时定价估算；活跃天数按
  §3.4 所有者时区折算。
- 展示字段：`totals`（tokens / costUsd / activeDays）、`sources`、`models`；另增
  `firstDay` / `lastDay` / `updatedAt`、来源数与模型数，以及两个全历史派生事实
  （最长连续活跃天数、单日峰值日 + 用量）。公开页**不含仓库模块**（白名单仓库投影已删除，
  §0 第 4 条）。
- 热力图日桶：**与仪表盘同款**——近一年 52 周（`lib/public-page/data.ts` 的 `buildHeatmap`
  按所有者时区取 52 周日桶，Mon-start），走 `HeatmapPayload` 链路交给
  `components/heatmap-card.tsx` 渲染；页面不提供任何时间范围控件（热力图解释
  分布，不改变总量）。`lib/public-page/heatmap.ts` 的编年分段（`splitYears`）、分位数分档
  （`quantileStops` / `levelFor`）**不再参与渲染**，但该模块仍供全历史派生事实（最长连续
  天数、单日峰值）使用，10 年 / 3650 天上限也仍作用于全历史日桶（`capDayPoints`）。
- 成就：SSR 直出 `computeAchievements`（组装沿用 `lib/achievements/payload.ts` 的
  `loadAccountUsage` / `loadSessionRows` / `loadSyncRunRows`，抽成纯函数复用，不读
  `loadAchievementSeen`）；`lib/public-page/data.ts` 传入**完整** `snapshot.achievements`，
  `lib/public-page/project.ts` 的 `unlockedAchievements` 只保留 `tier >= 1` 的条目（目录
  顺序不变），**投影字段完整**：含 `value` / `unit` / `thresholds` / `next_threshold` /
  `achieved_at`，因此公开页展示当前值、下一段位阈值与进度、段位历史与阈值时间线（§6.5）。
  解锁判定沿用既有 compute（含历史设备）。
- 数据契约隔离：新增 `PublicPageData` 与 `src/lib/public-page/data.ts`（P9），**不改
  `BadgeData`**（§4.6，它是 §5 渲染输入，改动会牵动 §9 字节级快照）。日桶聚合抽成共享
  helper 供徽章与公开页复用，保证单一口径；不新增 SQL、不新增端点
  （`docs/rewrite-plan.md` §10 函数槽位 12/12）。
- 加载与缓存：`page.tsx` SSR service-role 直出，不走 `/api/app`；公开页专用单飞键
  `(userId)`、TTL 60s；热力图与成就**始终加载与计算**（无开关分支）。
- 文案：`lib/copy/public-page.ts` 删 `last30` / `last30Total`，增口径行、热力图 / 成就空态
  与页脚隐私声明；Token 数字走 `useFormat().formatTokens`（随访客偏好，§0 第 6 条），
  成本与占比走 `lib/badge/format.ts` 的 `formatBadgeCost` / `formatBadgeShare`（固定口径）。

## §5 SVG 渲染规范

### §5.1 确定性与安全（`src/lib/badge/render.ts`，纯函数）

- `renderBadgeSvg(data: BadgeData, options: RenderOptions) → string`；禁
  `Date.now()` / `Math.random()` 等不确定源——同一输入字节级相同（golden 快照稳定）
- 全部动态文本过 XML 转义；project_key 展示截断 ≤24 字符加 `…`
- 输出永不包含：原始令牌、token_hash、user_id、绝对路径、email、`<script`、
  外链资源（`http://` / `https://` 引用）；唯一例外是根元素的 SVG 命名空间声明
  `xmlns="http://www.w3.org/2000/svg"`——它是标识符、不发起请求，缺了它浏览器拒绝
  解码独立的 image/svg+xml（实测 0×0 破图；2026-11-02 操作者裁定，golden 精确豁免该串）
- 字体栈（GitHub camo 禁外链字体，只能系统字体）：
  `-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`
- 头像与标记（2026-11-02）只能以两种内联形态出现：几何图形（`<path>` / `<rect>` /
  `<circle>` / `<polygon>`，品牌标与来源标）与 `data:` URI 图片（头像）。两者都不发起网络
  请求，输出仍不得含 `http(s)://`（xmlns 声明例外）
- 文本宽度用实现内固定字宽表估算（同字符集 → 同宽度，纯函数确定）

### §5.2 style=panel（默认，上游同款布局）

- 画布 600×176、圆角 12
- 左上：**头像 + 标题**。头像仅在本人上传过头像时出现（36px 圆，图为内联 `data:` URI）；
  未上传则不画任何占位圆（首字母圆已按 2026-11-02 操作者裁定取消），标题回到卡片左边距
  x=24。有头像时标题 x=74、最大宽 360；无头像时最大宽 410，超出以省略号收口。标题
  （`displayName`）空串回退 `AI Coding Usage`（**绝不**回退 email）；标题下副标题
  `TOTAL USAGE · ALL TIME / 30 DAYS`。repo 徽章的副标题把仓库名**转大写**顶替
  `ALL TIME`（`TOTAL USAGE · BETTER-ADMIN`，2026-11-04 操作者裁定，原「副标题下另起
  一行项目名」作废）；`range=30d` 时追加 ` · 30 DAYS`。头像下方**不放**品牌名
  （品牌只在右上角出现）
- 左下三列：`TOKENS` / `COST` / `ACTIVE DAYS`（标签 10px 大写、55% 透明度；
  数值 24px 700）
- 右上：**品牌名 + 品牌标（标在右）**——品牌名 `TOKEN USAGE`（10px 大写、字距 2、
  右对齐，右边界 x=540）在上，项目站点 `token-usage.cc`（9px、muted、字距 0.5、右对齐，
  2026-11-03 操作者裁定）在下（基线 32 / 45）；**品牌标在右侧**（x=552、y=24、24px，
  右边缘 = 24px 页边），其方块高度覆盖两行文本（约 y25–47）并**按两行整体垂直居中**，
  不与品牌名单独对齐（2026-11-04 操作者裁定，原「标在左、16px、与品牌名同行」作废）。
  品牌标取对应主题的资产：light 用 `public/logo.svg`（黑底白字形），dark 用
  `public/logo-dark.svg`（白底黑字，2026-11-02：原实现用 accent 描单色字形，在深色卡上
  几乎不可见）；`theme=auto` 同时内嵌两版，靠 `.c-lg-l` / `.c-lg-d` 类与同一
  `prefers-color-scheme` 媒体查询切换。站点是**固定文本**，不取请求 host：自部署域名各异，而 host
  进渲染会破坏字节级确定性（§5.1）；compact 单行版不画（§5.3）
- 右下区块**两个 scope 同款**（2026-11-04 操作者裁定，原「repo 显示 TOP MODELS + token 数」
  作废）：固定 `TOP SOURCES` **前 1 行**——来源标 12px + 来源名 + 占比 + 占比条。repo 的来源取
  `token_sessions` 的 `source` 聚合（数据层两个 scope 都已有 `sources`，只是范围不同），模型
  TOP 只出现在公开页（§4.1）。占比条从行名起点拉到卡片右边界 x=576（宽 = 576 − 起点；
  2026-11-04：原固定 72px 与右侧百分比之间空出一截），高 4、圆角 2；无数据时显示 `—`
  （2026-11-02 操作者裁定：2 行改 1 行并补标；标来自 `lib/badge/marks.ts`，由
  `public/brand-logos/*.svg` 生成单色几何，随主题取 text 色）
- **列对齐**（2026-11-02 / 2026-11-04）：`TOP SOURCES` 标题基线 = 左侧三个标签基线
  （y=120），左边界 x=452（两个 scope 统一）；行名基线 = 三个数值基线（y=150），占比条
  y=157；行名宽 = `右边界 576 − 百分比实测宽 − 8px 间隙 − 行名起点`，不写死
- **头像加载**（2026-11-02；2026-11-08 改读取键）：`lib/badge/data.ts` 用 service-role 读
  `auth.users` 的 `user_metadata.custom_avatar_url`（上传写入口 `lib/auth/profile.ts` 同步
  维护），缺省时回退遗留键 `user_metadata.avatar_url`。读取结果仍仅允许本部署 host 且路径
  落于 `/storage/v1/object/public/avatars/`（防 SSRF），类型限 PNG/JPEG/WebP、≤512 KB，内联为
  `data:` URI；单飞缓存 5 分钟，`invalidateBadgeData` 一并失效；任何失败（缺头像、超大、
  非白名单、非图片）回退首字母圆。键调整的原因：`avatar_url` 是 provider 自有键，每次
  GitHub/Google OAuth 登录都会被 Supabase 用 provider 头像 URL 覆盖（2026-11-08 实测本部署
  命中，公开页/徽章白名单拒收该 URL → 首字兜底，而仪表盘侧栏无白名单直接显示 provider
  头像，两处表现分叉）；`custom_avatar_url` 是 provider 不会触碰的自定义键，读取优先级
  custom > 遗留 avatar_url（后者仍需过白名单，provider URL 天然被拒）。account 与 repo 两个
  scope 渲染同一张头像（2026-11-03 修复：账户分支曾漏传 `avatarDataUri`，导致只有仓库徽章
  显示头像）

### §5.3 style=compact

- 单行高 20 双段徽章：左段品牌板 + 右段数值（`TOKEN USAGE ▏18.48B · $1,318.40`）；
  radius 3
- **品牌段（2026-11-02 操作者裁定）**：固定黑底 `#0A0A0A` + 白字大写 `TOKEN USAGE`
  （10px 600）+ 品牌标 14px。底板是黑的，所以标取 **dark 资产**（`logo-dark.svg`：
  白底圆角块 + 深色字形，与面板徽章在深色主题下同款）——不取 light 资产的黑色版
  （会与黑底融成一片、只剩字形）。黑白在任意页面背景都可读，因此**不随主题变化**；
  段宽 = 内边距 6 + 标 14 + 间隙 5 + 文本宽 + 6
- **数值段**：保留主题调色板（不透明 bg + track 叠层 + text 色），保证深浅主题下的数字可读；
  11px、左右内边距 6
- 无新增色板 token（品牌板是固定常量，不进 `--` 变量）

### §5.4 style=sparkline

- panel 基础上右上区域加 120×28 折线（`series` 归一化 polyline，仅描边 2px 不填充；
  `series` 空时退化为 panel）；折线位于品牌区下方（x=456、y=56，2026-11-03 随站点行下移
  8px，避免与 `token-usage.cc` 相撞）

### §5.5 theme 色板

| token | dark | light |
|---|---|---|
| bg | `#0d0f1a → #161a2e` 纵向渐变 | `#ffffff` |
| border | `rgba(255,255,255,.08)` | `rgba(15,23,42,.10)` |
| text | `#f5f6fa` | `#0f172a` |
| muted | `rgba(245,246,250,.55)` | `rgba(15,23,42,.55)` |
| accent | `#7c8cff` | `#4f46e5` |
| track | `rgba(255,255,255,.12)` | `rgba(15,23,42,.12)` |

- `theme=auto`：同一 SVG 内嵌 `<style>` + `@media (prefers-color-scheme: dark)`
  切换上述 token（跟随系统而非 GitHub 主题设置）；README 要精确跟随 GitHub 主题
  用 §7.4 的 picture 双主题片段

### §5.6 入场动效（2026-11-02）

- 只用 **SMIL**（`<animate>` / `<animateTransform>`），无脚本、无 CSS 动画：`<img>` 里的
  SVG 会播放 SMIL，而脚本在静态图片模式下被禁用
- 两处（2026-11-04 修订）：标题区（头像 + 名称 + 副标题）整体上移 4px 归位（0.9s）；
  **四个指标列共用一个 `<g>` + 一次 `reveal(0.05)`** 整体上移 5px（原按
  0.05/0.1/0.15/0.2s 错峰，动画途中右上块与前三列会差几像素，看起来未顶对齐）；来源
  占比条宽度 0 → 实际值（1.1s，延迟 0.15s）
- 只用 `translate` 与 `width`，**不用 opacity**：静态渲染器（邮件、部分客户端）在 t=0
  冻结时仍能看到全部内容；`fill="freeze"` 保证终态
- 不读 `prefers-reduced-motion`（`<img>` 语境拿不到媒体查询上下文），因此幅度刻意克制
- 不引入随机或 `Date.now()`，字节级快照保持稳定；单枚徽章约 +300B

## §6 公开页 /u/\<token\>

> **状态（2026-11-05）**：P9–P11 已实现。§0 二轮裁定（「开关默认关 / 编年式全历史
> 热力图 / 成就仅前 6 枚 + 轻量弹窗 / 仓库模块」）已并入本节正文，实现以正文为准。
> 上游线上 `/u/:id` 仅作形态参照，端点、命名与实现不回搬。

### §6.1 路由与基础约束

- 路由 `apps/web/src/app/u/[token]/page.tsx`（动态段独占整段）；无 AppShell
  （与 `/login` 同类）；metadata：标题 = `displayName + " · Token Usage"`，
  `robots: noindex`（**保持**，不做 SEO 收录）
- 令牌查无或 `enabled=false` → `notFound()`（404）；`findBadgeOwner` 由 `/api/badge`
  与本页共用，`generateMetadata` 与页面经 React `cache` 共享一次查找
- 页面 SSR service-role 直出（`PublicPageData`，§4.7），不走 `/api/app`；正文不渲染令牌，
  令牌只以 URL 段形式出现在访客本就持有的请求 URL 里
- 主题跟随系统（无明暗切换入口、不做深色专属变体）；文案随访客语言
  （`lib/copy/public-page.ts`），数字走 `lib/badge/format.ts` 固定口径
- 视觉方向 **A 档案式**：主栏 720–880px、区块间距 64 / 96px（8pt 网格）、1px 发丝线
  分区、拆掉等权 `Card` 堆叠、accent 面积 ≤10%、零裸色值；组件遵循 `docs/ui-spec.md`
  （HeroUI 复合结构 + 语义文本组件）

### §6.2 信息层级

| 层 | 内容 | 权重 |
|---|---|---|
| L0 | 身份与口径：显示名（空则「AI 编码用量」）、`全部时间 · 起止日 · 数据更新于` | 主视区 |
| L1 | 总 Tokens **唯一巨数**；成本（估算）/ 活跃天数 / 来源数 / 模型数降级为无边框指标带 | 强 |
| L2 | 结构拆分：来源占比与模型 TOP 两列；两枚全历史事实胶囊 | 中 |
| L3 | 热力图（近一年 52 周，与仪表盘同款，始终展示） | 中 |
| L4 | 已解锁成就墙（全部已解锁，始终展示） | 弱 |
| L5 | 口径、估算说明、时区、隐私声明、品牌落款 | 辅助 |

### §6.3 模块与组件（`components/u/`，命名按 AGENTS.md）

| 文件 | 职责 |
|---|---|
| `u-body.tsx` | 编排、区块间距、页脚口径与隐私声明 |
| `u-hero.tsx` | L0 + 唯一巨数；空账号给 `—` 与空态文案，375px 数字用 `clamp` 不裁切 |
| `u-metrics.tsx` | 四列指标带 + 最长连续天数 / 单日峰值两枚胶囊；`sm` 以下两列 |
| `u-breakdown-section.tsx` | 来源占比（`Meter`）与模型 TOP 两列 |
| `u-heatmap.tsx` | 仪表盘同款热力图（`HeatmapCard bare hideFilter`，近一年 52 周）；无数据时显示空态 |
| `u-achievements.tsx` / `u-achievement-dialog.tsx` | 成就墙（全部已解锁）与共享详情弹窗 |
| `u-public-number.tsx`（如需） | `FlowNumber` 的公开页包装：`<noscript>` 终值 + `aria-label` 完整数值 |

### §6.4 热力图

- **与仪表盘同款**：`u-heatmap.tsx` 直接渲染 `components/heatmap-card.tsx` 的
  `HeatmapCard`，传 `bare`（去掉卡片外壳与底色）与 `hideFilter`（无平台 / 来源筛选），
  复用 `DashboardCopy`；月份 / 周几标尺、共享 portal tooltip（`HeatmapTooltip`，含按来源
  构成）、时区脚注与图例全部沿用仪表盘实现，不再有公开页自有的纯 CSS grid。
- **窗口**：近一年 52 周（`lib/public-page/data.ts` 的 `buildHeatmap` 按所有者时区取 52 周
  日桶，Mon-start），与仪表盘一致；不铺开全历史，也无年份切换器或任何范围控件。
- **交互**：不传 `onDaySelect`，格子不可点击、不下钻；不可点击格子同样有
  `hover:scale-110`；数字随访客偏好走 `HeatmapCard` 默认的 `useFormat`。
- 原「编年式分年 / 全历史分位数分档 / 窄屏月格 / 原生 title tooltip」等公开页自有的热力图
  实现描述作废：色阶、标尺、tooltip 与响应式全部由 `HeatmapCard` 承担（§4.7）。

### §6.5 成就

- **全部已解锁**：`u-achievements.tsx` 列出全部 `tier >= 1` 的成就（目录顺序，不再取前 6 枚），
  标题右侧给出「共 N 枚」计数；未解锁条目不展示。
- **复用共享详情弹窗**：`u-achievement-dialog.tsx` 复用
  `components/achievement-dialog.tsx` 的 `AchievementDialog`——与 `/achievements`
  同一个弹窗，展示当前值与单位、当前段位与达成日期、下一段位阈值与进度条、五段段位历史
  与五段阈值时间线（每段阈值与达成日）；只因不传分享回调而隐藏分享入口（原「独立轻量
  弹窗」描述作废）。
- 徽章资产复用 `achievement-medallion.tsx` / `achievement-tiers.ts` 与既有 PNG；徽章放大到
  `size-20 md:size-24`，外层用 HeroUI `Button variant="ghost"`；格内段位用共享的
  `achievement-tier-badge.tsx` 金属渐变标签（同 `/achievements` 墙格，2026-11-06 起替换纯文本）。
- 无解锁条目时渲染空态文案；公开页始终计算并投影，无开关（§3.5）。

### §6.6 数字动画（2026-11-05 操作者指定 NumberFlow）

- 复用 `components/flow-number.tsx`（`FlowNumber`，`@number-flow/react` 0.6.2 已在
  `apps/web`），不另写动画组件；传 §4.5 固定口径字符串：`18.48B` / `$1,318.40` / `214`
  均能解析，无法解析或万进制分组自动退化为静态文本。
- 只给 **L1 巨数与四个次级指标**加滚动，来源 / 模型列表数字不加，避免全页跳动；
  `tabular-nums` + 容器预留宽度防布局跳动。
- 挂载从 `0` 滚到终值（沿用项目既有约定，`docs/ui-spec.md` 数字动画条目）。公开页补
  三层兜底：`<noscript>` 输出终值文本、容器 `aria-label` 给完整数值、
  `aria-live="off"` 避免朗读滚动过程；`noindex` 下抓取影响可接受。
- `respectMotionPreference` 保持默认开启；`prefers-reduced-motion` 下自动静态。

### §6.7 动效节奏（纯 CSS、零新依赖、只播一次、总窗口 ≤1.5s）

| 时刻 | 动作 |
|---|---|
| 0–120ms | 眉题 / 口径行淡入上移 8px；除 NumberFlow 外不以 `opacity:0` 作 SSR 初态 |
| 120–900ms | 巨数与四个次级指标滚动，次级错峰 80ms |
| 600–1400ms | 热力图按周 +20ms 级联点亮（色阶 0 级 → 目标，非空白起步）；徽章每枚 +60ms 抬升并掠过一次金属高光 |
| 滚动后 | 下方区块 IntersectionObserver 一次性 reveal（10px / ≤350ms） |
| hover | 徽章 `-4px` + 外环高光 180ms；格子 tooltip 120ms |

`prefers-reduced-motion` 下全部降级为静态；不引入循环动画，不新增运行时依赖。

### §6.8 三态、响应式与隐私文案

- 每个数据面保留 Loading / Empty / Error 三态；热力图与成就无数据时显示空态文案，不阻塞
  其余区块；公开页不做客户端重试入口（无会话态）。
- 375px 单列、页面零横向滚动。
- 页脚固定声明：公开全历史汇总、近一年逐日用量（含按来源构成）、来源 / 模型分布及成本、
  已解锁成就完整详情与头像；不含会话明细 / 提示词 / 正文 / 路径 / 邮箱 / user_id / 设备标识 /
  徽章令牌；成本为读时定价估算、活跃天数按所有者时区折算，并带品牌落款（文案见
  `lib/copy/public-page.ts` 的 `footer`）。

## §7 Settings 配置面

### §7.1 /api/app/badge（会话守卫沿用 `/api/app/achievements` 模式）

| 方法 | 行为 |
|---|---|
| `GET` | 返回 `{enabled, timezone, allowedProjects, displayName, hasToken, tokenLast4, knownProjects}`（永不回明文）；`knownProjects` 是本人 `token_sessions` 去重的非空 project_key（按 tokens 降序，≤200），白名单多选的数据源（§7.2）；**不含** `showHeatmap` / `showAchievements`（§3.5 已移除，契约测试断言响应无此两属性） |
| `GET ?preview=1&style=…&theme=…&range=…&scope=…&project=…` | 本人预览（§7.3）：会话鉴权代替令牌，参数/加载器/渲染器与 `/api/badge` 同源，返回 SVG（`no-store`）；不看 `enabled`（未公开也可预览），repo 预览仍校验白名单 |
| `POST {action:"generate"}` | 生成/重置令牌：写 `token_hash`、`token_last4`、`enabled=true`、`display_name` 快照（取会话 `user_metadata.display_name`，缺省空串），响应**一次性**携带明文 token |
| `PUT` | 更新 `{enabled?, timezone?, allowedProjects?, displayName?}`；allowedProjects 逐项过 `normalizeProjectKey` + 长度校验，非法项报 `400`；displayName 须为 string（trim、截 80，**空串合法**=清空，渲染回退 `AI Coding Usage`），非 string 报 `400`；timezone 按 `parseTzContext` 约定归一；**只接受这四个字段**（`showHeatmap` / `showAchievements` 已随 §3.5 移除，不解析）；变更成功失效公开页缓存 |
| `DELETE` | 吊销：`enabled=false`（哈希与末 4 位保留，公开端呈现 `badge disabled`，§3.2） |

- 无会话 → `401 {error:"Unauthorized"}`；非法体 → `400 {error}`；一律 `no-store`
- 预览挂在同一路由（与 `/api/app/achievements` 的 POST 同理：不增加部署函数数）

### §7.2 Settings 卡片 `components/settings/badge-card.tsx`

- 开关；公开名称输入框（§7.1 `PUT {displayName}`，2026-11-09：与个人信息名称解耦，
  清空保存后公开面显示 `AI Coding Usage`，令牌不动；重生成令牌会以会话名重新快照，卡内
  随 GET 重新同步）；令牌生成/重置（二次确认 + 明文只显示一次 + 复制）；白名单多选（数据源：
  §7.1 `knownProjects`——Sessions 已展示数据的投影，白名单里已不在会话中的项仍列出以便移除）；
  时区只读展示（浏览器时区，保存时随 PUT）
- 公开展示开关：**仅 1 个 `Switch`**（`enabled`，公开展示开关），沿用现有 `enabled` 开关的复合
  结构与 `onChange` 写法；变更走 §7.1 PUT，成功 `toast.success`，失败保留原态不乐观更新
- 原「公开增强模块 / 全历史热力图 / 成就徽章」三块与其两个 `Switch`（`show_heatmap` /
  `show_achievements`）已随 §0 第 5 条移除（2026-11-05，commit `064c1f2`）；DB 两列保留但
  代码不再读写（§3.5）
- 预览筛选（§7.3）：风格 / 主题 / 范围 / **仓库**；不再有「对象」开关——仓库下拉默认空
  = 账户徽章，选中 = 该仓库，清空（`Select.ClearButton`）= 回到账户（2026-11-04 操作者裁定，
  与 §2.1 的 project 开关同构）
- 细则遵循 `docs/ui-spec.md`（HeroUI 复合结构 + 语义文本组件）；随 P3 在 ui-spec
  增补对应小节

### §7.3 预览

- 卡内实时 `<img src="/api/app/badge?preview=1&…">`（附 cache-busting 查询参数绕浏览器
  缓存），风格/主题/范围/仓库切换即换参（仓库下拉的空值 = 账户徽章）。2026-11-02 P3 实施修订：原写 `/api/badge?token=…`，
  但明文令牌只在生成时出现一次，页面刷新后无从构造公开 URL，故改用会话鉴权预览分支（§7.1）
- 换参后到新图解码完成之间，预览容器盖一层半透明遮罩 + `Spinner`（共享
  `PanelOverlay`，容器 `aria-busy`）：切换时不会先看到上一张图（2026-11-03 操作者裁定）。
  `onLoad` / `onError` 都解除遮罩，加载失败也不会卡住转圈

### §7.4 README 片段复制（两版都给）

- 单主题：`<a href="<origin>/u/<token>"><img src="<origin>/api/badge?token=…&style=…&theme=…" alt="…"></a>`
- 双主题：`<picture>` + `<source media="(prefers-color-scheme: dark)">`（GitHub 现行推荐
  写法，README 里的 prefers-color-scheme 跟随访客的 GitHub 主题设置；`#gh-*-mode-only`
  片段为其旧式替代，不再输出）
- `<origin>` 用部署自身 origin（自部署各自填）
- 令牌只在生成/重置后的一次性揭示弹窗里填入片段；此后卡片内的片段以
  `YOUR_BADGE_TOKEN` 占位，由操作者替换为自己保存的令牌（遗失则重置）

## §8 缓存与滥用面

- 成功响应按 §2.2 缓存；GitHub camo 尊重 Cache-Control（shields.io 同款打法）
- 单飞加载防击穿：badge 自有缓存键 `(user_id, scope, project, range)`——style/theme
  只影响渲染不进缓存键
- 令牌 24 字节熵、可随时吊销；暴露面只有聚合数字；无写路径、无明细泄露
- v1 不做按 IP 限流（观察后议）

## §9 golden 测试

> **状态**：本节测试与本文档同步落地（spec-first）。三个文件对实现模块做**条件
> 加载——存在则跑、缺失则整文件 skip**，`pnpm verify` 在 P2 落地前保持绿；实现
> 落地后无需改测试自动激活。断言即本文档的可执行形态，实现必须原样满足。

| 文件 | 覆盖 |
|---|---|
| `tests/unit/badge-params.test.ts` | §2.1 参数默认值/非法值矩阵、§2.3 bad_request 分类 |
| `tests/unit/badge-svg.test.ts` | §5 渲染器：确定性、XML 转义、截断、隐私不变量（无 script/外链/NaN）、两个 scope 共用区块、auto 媒体查询、零态渲染、品牌区站点行存在且 compact 不含（P6）；字节级快照（`toMatchSnapshot`）在 P2 实现时随操作者过目落盘 |
| `tests/contract/badge.test.ts` | §2.2 响应头矩阵、§2.3 降级矩阵、方法守卫、隐私清扫（响应不含令牌/哈希/user_id）、§7.1 配置端点守卫与形状（GET 响应**不含** `showHeatmap` / `showAchievements`）、两个 scope 都内联头像（P6） |
| `tests/unit/public-page-data.test.ts`（P9 新增） | §4.7 / §6：全历史日桶投影、编年分段、全历史分位数分级、`PublicPageData` 形状、空态、10 年上限 |

- canonical fixtures（附录 A）是单测与实现的共同输入；契约测试经 FakeSupabase
  播种 `token_public_badges` / `token_usage_hourly` / `token_sessions`
- P2 落地修订（2026-11-02，操作者逐条批准）：① 转义用例期望值补上漏写的 `&amp;`
  （`'a<b>&"c'` 的正确转义为 `a&lt;b&gt;&amp;&quot;c`）；② 外链断言精确豁免 SVG
  命名空间声明（§5.1）。测试基建同步：FakeSupabase 注册 `token_public_badges`，
  契约 fixture 补 `token_last4`（§3.1）；其余断言原样
- P3 修订（2026-11-02，操作者批准）：③ 账户徽章改仪表盘口径（§4.1），契约用例的
  成本期望由 `$1,318.40` 改为同一 fixture 的读时定价结果 `$111,721`；fixture 补播种
  一台活跃设备（canonicalRows 只保留活跃设备）。仓库徽章与 `knownProjects` 同步按
  Sessions 页可见性过滤（活跃设备、排除账户级来源）
- P5 增量（2026-11-02，操作者裁定）：④ 单行 TOP SOURCES/TOP MODELS + 来源/模型标、
  双主题品牌标、头像（内联 `data:` URI，未上传则完全不画）与 §5.6 入场动效。
  `tests/unit/badge-svg.test.ts` 新增「单行 + 标」「头像内联 / 无头像不画」「品牌标随主题」
  「SMIL 无脚本」用例，字节级快照随实现重录（操operator 过目）；compact 品牌段同期改为
  黑底白字大写 + 品牌标（§5.3）
- P7 增量（2026-11-04，操作者裁定）：⑧ repo 徽章副标题改为大写仓库名替换 `ALL TIME`
  （§5.2，`TOTAL USAGE · BETTER-ADMIN`；30d 追加 ` · 30 DAYS`），删掉原副标题下
  单独一行的项目名以避免重复；`tests/unit/badge-svg.test.ts` 的 repo/转义/截断三例同步
  改为大写期望；⑨ 品牌区改为「品牌名 + 站点两行在左、品牌标 24px 在右并跨两行垂直居中」
  （§5.2），fixture A 面板快照随之重录（操作者过目）——该条取代⑧「fixture A 输出不变」
  的说法，account 副标题本身仍不变；⑩ `TOP MODELS` 块左边界 452→420 并按右侧 token 数
  实测宽度给行名分配空间（§5.2），新增「完整模型名不被截断」用例；⑪ 右上 TOP 块改为
  第四个入场列（共用 `reveal(0.2)` 上移 5px，§5.6），修掉静态渲染里它比前三列高 5px 的
  伪错位；十/⑪ 使 fixture A 面板快照重录（操作者过目）；⑫ 右下块两 scope 统一为
  `TOP SOURCES` + 占比条 + 百分比（repo 不再显示 TOP MODELS）、占比条拉满到 x=576、
  四列合并为同一入场组（§5.2 / §5.6），fixture A 面板快照再次重录；⑬ `/api/badge` 与
  `/api/app/badge?preview=1` 的参数层改为 **project 即开关**（有 `project` → 仓库，无 → 账户），
  `scope` 降为遗留参数（值仍校验，`scope=repo` 缺 project 仍 bad request）；`lib/badge/api.ts`
  的 `badgeQuery` 不再输出 `scope`，README 片段与预览 URL 随之变短（§2.1）；⑭ 设置页预览
  去掉「对象」开关（`BadgeView` 去 `scope`），改为**仓库下拉**：默认空 = 账户徽章、选中 =
  该仓库、`Select.ClearButton` 清空回全部（§7.2 / §7.3）
- P6 增量（2026-11-03，操作者裁定）：⑤ panel 品牌区加项目站点行、sparkline 下移 8px
  （§5.2 / §5.4），`tests/unit/badge-svg.test.ts` 断言站点行存在且 compact 不含，字节级
  快照重录（操作者过目）；⑥ 修复账户徽章不显示头像（§5.2，账户分支漏传
  `avatarDataUri`），契约测试新增「两个 scope 都内联头像」用例，FakeSupabase 补
  `/auth/v1/admin/users/:id` 与公开头像存储对象两条读路径；⑦ 预览换参加载遮罩（§7.3，
  `PanelOverlay` 自 `components/dashboard/` 提为跨页共享）
- P8 增量（2026-11-05，操作者确认公开页改版方向）：⑮ 上表两处契约 / 单测增补；
  ⑯ `tests/unit/badge-svg.test.ts` 字节级快照**不重录**——`PublicPageData` 与
  `BadgeData` 隔离（§4.7），§5 渲染输入未变；⑰ 验收清单含 375px、深浅主题、
  `prefers-reduced-motion`、no-JS 终值、`noindex`、公开页始终展示热力图与成就

## §10 实施阶段

| 阶段 | 内容 | 产出文件 |
|---|---|---|
| P2 服务端 | 迁移 + 参数层 + 渲染器 + 数据层 + 两个端点 | `supabase/migrations/20261101000000_token_public_badges.sql`；`src/lib/badge/{types,params,data,render}.ts`；`src/app/api/badge/route.ts`；`src/app/api/app/badge/route.ts` |
| P3 Settings | 配置卡片 + ui-spec 增补 | `src/components/settings/badge-card.tsx` |
| P4 公开页 | `/u/[token]` + 自家 README 挂徽章 | `src/app/u/[token]/page.tsx`；`src/components/u/*` |
| P5 徽章视觉（2026-11-02） | 头像 + 品牌标 + 单行来源（含来源标） | `src/lib/badge/render.ts`；`src/lib/badge/marks.ts`（由品牌标生成）；`src/lib/badge/data.ts`（头像加载） |
| P6 徽章细化（2026-11-03） | 品牌区站点行 + 预览加载遮罩 + 账户头像修复 | `src/lib/badge/render.ts`；`src/lib/badge/data.ts`；`src/components/panel-overlay.tsx`（自 dashboard 提为跨页共享）；`src/components/settings/badge-card.tsx` |

- 随 P2 在 AGENTS.md 文档地图增补 `docs/badge.md` 行
- P2–P7 零新依赖；表结构变更为 §3.1（建表）与 §3.5（两列增量）。P8–P11 同样零新增
  运行时依赖：NumberFlow 已在 `apps/web` 的依赖预算内（`docs/rewrite-plan.md` §4），
  热力图走 CSS grid + 既有色阶 token
- 上游署名规则不触发（无上游代码搬入）

### 公开页改版（2026-11-05 操作者确认方向）

> 变更顺序沿用 §1 文档地位：**先改本文档与 `docs/ui-spec.md` → 操作者确认 → 再改实现**。
> 数据口径以 §4.7 为唯一规范，页面规格以 §6 为唯一规范，UI 写法见 `docs/ui-spec.md`
> 公开页节。

| 阶段 | 内容 | 产出文件 | 状态 |
|---|---|---|---|
| P8 文档先行 | §1 / §3.5 / §4.7 / §6 / §7 / §9 与 ui-spec 公开页节定稿 | `docs/badge.md`；`docs/ui-spec.md` | **已完成（仅文档）** |
| P9 数据层 | 迁移两列、`PublicPageData` 加载器、共享日桶 helper、配置端点字段、Settings 双开关、单测 / 契约断言 | `supabase/migrations/20261105000000_token_public_badges_sections.sql`；`src/lib/public-page/*`；`src/lib/badge/data.ts`；`src/lib/achievements/payload.ts`；`src/app/api/app/badge/route.ts`；`src/components/settings/badge-card.tsx` | **已完成（2026-11-06 操作者验收通过）** |
| P10 页面 | Hero / 指标带 / 结构区 / 热力图（后改为复用 `HeatmapCard`）/ 成就墙 / 页脚与文案字典 | `src/app/u/[token]/page.tsx`；`src/components/u/*`；`src/lib/copy/public-page.ts` | **已完成（2026-11-06 操作者验收通过）** |
| P11 动效与验收 | NumberFlow 接入、CSS 动效、页面级隐私断言、定向与全量测试 | `src/styles/globals.css`；`src/components/u/u-public-number.tsx`；`tests/unit/u-page-privacy.test.ts` | **已完成（2026-11-06 操作者验收通过）** |

- P8 只改两份 markdown：未改代码、未跑构建 / 测试、未创建迁移、未执行任何 git 写操作。
- P9 已复核迁移序号（`20261105000000` 未占用）。**部署顺序**：迁移必须先于代码上线，
  否则 `findBadgeOwner` / 配置端点查询新列会报错，徽章端点也会受影响。
- **二轮调整（2026-11-05 15:23，操作者指令）**：见 §0。Settings 三项、配置端点
  两个开关字段、`PublicPageData` 的开关 / 仓库字段均已移除；热力图改复用
  `HeatmapCard`（近一年、无筛选、无下钻），成就改复用 `AchievementDialog`。
  新增 `tests/unit/heatmap-alignment.test.ts` 钉住周几对齐回归。
- **迁移执行记录（2026-11-05 14:59，操作者授权）**：`20261105000000_…` 已应用到
  `apps/web/.env.local` 的 `DATABASE_URL` 所指实例。回读校验：两列均为 `boolean
  not null default false`、表 RLS 仍开启且零 policy、现有 1 行配置的两个开关均为
  `false`；幂等复跑走 skipped 分支；以应用实际的 PostgREST `select` 串请求返回 200
  且包含新列。新增列向后兼容，旧代码不查询这两列，不会破坏尚未部署的线上版本。
- P9 定向验证：`tsc --noEmit --incremental false` 通过；`public-page-data` 单测与
  `badge` / `badge-settings` 契约测试 3 文件 28 例通过；改动文件 eslint 0 error。
  全量 `pnpm verify` 已于 2026-11-06 统一跑绿（web + CLI 全部用例通过）。
- §9 的页面级隐私断言已由 `tests/unit/u-page-privacy.test.ts` 落地（服务端渲染
  `UBody`，验证头像 / 口径行 / 热力图 / 成就墙常在、两列各 5 行等高对齐、全部已解锁徽章
  列出，HTML 无 30 天 / 仓库 / 令牌痕迹，页脚声明与实际公开口径一致）。
- P10 / P11 定向验证：`tsc --noEmit --incremental false` 通过；`vitest run` 全量
  576 例断言通过。⚠ 其中一个既有套件 `tests/contract/legacy-alias-removed.test.ts`
  的 `afterAll` 清理 `.next-alias-test` 被本机安全删除机制拦截（trash 失败），
  8 个用例本身全部通过，与本次改动无关；换可清理临时构建目录的环境时顺手复跑即可。
- 浏览器人工验收已由操作者完成（2026-11-06）：375px、深浅主题、`prefers-reduced-motion`、
  no-JS 终值、`noindex`、公开页热力图与成就展示、迁移应用后的线上页面均确认通过。
- 每阶段开工前复查工作区状态与目标文件 mtime。

---

## 附录 A canonical fixtures（渲染器与单测共同输入）

**fixture A — seasoned account（panel 全量）**

```json
{
  "scope": "user",
  "project": null,
  "displayName": "Ming Wei",
  "range": "all",
  "totals": { "tokens": 18480000000, "costUsd": 1318.4, "activeDays": 214 },
  "sources": [
    { "key": "codex", "label": "Codex", "tokens": 18480000000, "share": 1 },
    { "key": "cursor", "label": "Cursor", "tokens": 0, "share": 0 }
  ],
  "models": [
    { "key": "gpt-5.2-codex", "label": "GPT-5.2 Codex", "tokens": 12000000000 },
    { "key": "claude-sonnet-4-5", "label": "Claude Sonnet 4.5", "tokens": 6480000000 }
  ],
  "series": [0, 120000, 480000, 0, 96000]
}
```

**fixture B — new repo（零会话仓库，正常渲染非降级）**

```json
{
  "scope": "repo",
  "project": "fresh-repo",
  "displayName": "Ming Wei",
  "range": "all",
  "totals": { "tokens": 0, "costUsd": 0, "activeDays": 0 },
  "sources": [],
  "models": [],
  "series": []
}
```

## 附录 B 兜底卡

- 文案见 §2.3；样式 = compact 形态灰卡（muted 底 + text 字色），固定 160×20，
  不携带任何请求上下文信息
