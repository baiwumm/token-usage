# 公开徽章与公开页

本文件是公开徽章 `GET /api/badge`、聚合快照 `GET /api/badge/data`（§2.4）、配置端点
`GET/POST/PUT /api/app/badge` + `PATCH/DELETE /api/app/badge/links/<id>` 与公开页
`/u/<token>` 的唯一规范。它们都**不属于** CLI 契约层（`docs/cli-contract.md` 不约束），但变更
顺序同契约层：先改本文档与 golden 测试 → 操作者确认 → 再改实现。页面视觉见
`docs/ui-spec.md` 公开页与「设置 · 公开徽章」节；分轮裁定与实施记录见
`docs/archive/badge-2026-11.md`。

**现行口径要点**：

1. 徽章第三列是**活跃天数**（自托管无排行榜语义）。
2. 凭证是**每用户最多 10 枚随机公开徽章令牌**（一行一枚，令牌即行 ID），可新增 / 吊销 / 恢复 /
   删除；令牌**明文存库**，本人设置页任何时候都能看到完整链接（§3.2）。
3. 仓库名属敏感面：带 `project` 的徽章走**仓库白名单**（§3.3）。
4. 公开页 `/u/<token>` 固定展示：Hero（头像 + 显示名）、总数据口径（§4.7）、近一年热力图
   （与仪表盘同款、无筛选无下钻）、全部已解锁成就（复用 `AchievementDialog`，隐藏分享入口）、
   页脚隐私声明；**无仓库模块**，无时间范围切换。
5. 隐私：公开聚合用量、近一年逐日用量（含 tooltip 来源明细）与已解锁成就详情；公开响应永不
   包含会话明细、提示词、正文、绝对路径、email、user_id、设备标识、令牌本身。
6. Token 数值随访客偏好（`useFormat().formatTokens`），成本与占比固定 USD 口径（§4.5）。
7. 公开页引用的静态资源**不得落在登录守卫的页面前缀下**：成就插画固定走
   `/achievement-art/<id>.png`（刻意避开受保护的 `/achievements` 页面路径）。路径撞车时匿名
   访客的图片请求会被 307 到 `/login`，徽章静默降级为参数化 SVG（§6.5）。

## §1 定位与隐私立场

四个组成面：

| 面 | 载体 | 受众 |
|---|---|---|
| SVG 徽章 | `GET /api/badge`，嵌 README / 个人主页 | 公开 |
| 公开页 | `/u/<token>`（徽章点击落地） | 公开 |
| 聚合快照 JSON | `GET /api/badge/data`（静态营销站构建期拉取，§2.4） | 公开（同一令牌） |
| 配置面 | Settings 页「公开徽章」tab `badge-card` + `/api/app/badge`（含 `/links/<id>`） | 登录用户本人 |

隐私立场（与 `token_sessions` 表注释同源）：**只出聚合数字**。任何**公开**响应（SVG、
HTML、JSON）永不包含 session 明细、提示词、正文、绝对路径、email、user_id、令牌本身。
令牌只由会话鉴权的配置端点回给本人（§7.1）；数据库明文保存是 2026-11-13 的操作者决定
（§3.2）。仓库名（project_key）属敏感面，默认不公开，白名单逐个开启（§3.3）。

分级补充（2026-11-05 操作者放行，公开页改版）：

- `GET /api/badge` 口径不变，仍只出账户 / 仓库的汇总数字。
- `/u/<token>` **始终展示**（无开关）：聚合汇总数字之外，额外公开 ① 近一年逐日聚合用量
  （含 tooltip 里的按来源构成）、② 已解锁成就的完整详情（当前值、阈值与达成日）。
- 公开页仍**永不包含**：会话明细、提示词、正文、绝对路径、email、user_id、设备标识、
  令牌本身，以及上段列出的全部敏感项（§3.5 描述的两个历史开关已随表重建消失）。
- 页面页脚隐私声明按上述口径固定表述（§6）。

## §2 徽章端点 GET /api/badge

路由文件 `apps/web/src/app/api/badge/route.ts`（静态路由，全查询参数驱动；动态段
只留给公开页）。服务端 service-role 直查，零浏览器 Supabase。

### §2.1 参数

| 参数 | 必填 | 取值 | 缺省 | 说明 |
|---|---|---|---|---|
| `token` | 是 | `tu_badge_` + 32 字符 base64url | — | 公开徽章令牌（§3.2）；只校验长度（≤128）与字符集，有效性交给明文等值查行 |
| `project` | 否 | 白名单内 project_key（URL 编码） | 行内 `project`（`null` = 账户徽章） | 长度 1–120；**有则渲染仓库徽章，无则渲染账户徽章**（2026-11-04 操作者裁定：project 即开关）；解析层不归一，归一在数据层（§4.2） |
| `style` | 否 | `panel` \| `compact` \| `sparkline` | 行内 `style`（默认 `sparkline`，2026-11-14 起新徽章即折线） | |
| `theme` | 否 | `dark` \| `light` \| `auto` | 行内 `theme`（默认 `auto`） | |
| `range` | 否 | `all` \| `30d` | 行内 `range`（默认 `all`） | |

取值优先级：**查询串 > 徽章行内值 > 内置默认**（2026-11-13）。README 片段只带 `token`，
操作者在设置页改风格 / 主题 / 范围 / 仓库即时作用于已嵌入的徽章，无需改 README（§7.4）。

`scope` 已于 2026-11-13 退役：出现即 `bad request`（旧嵌入与旧令牌一同作废；静默忽略会
把一条坏链接伪装成正常徽章）。

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
| 令牌查无 / 已吊销（`revoked_at` 非空） | `badge unavailable` |
| `project`（查询串或行内值）不在 `allowed_projects` | `unknown project` |

> 行内值理论上不会落进这一行：§7.1 的白名单保存会把行内 `project` 级联回落到
> 账户徽章（2026-11-14 操作者裁定）。仍保留该降级，是因为查询串显式指定的
> `project` 无法被服务端回收——那是操作者自己的 URL。
| `enabled=false` | `badge disabled` |
| 参数非法（未知 style/theme/range、`project` 超 120 字符、token 缺失或格式非法、出现 `scope`） | `bad request` |

判定顺序固定：参数 → 令牌 → 白名单 → 总开关。吊销与查无表现完全一致（不暴露存在性），
且被吊销或禁用时不泄露行内配置。

注意：`project` 白名单命中但该仓库暂无会话**不是降级**——正常渲染，计数为 0
（见附录 A fixture B）。

## §2.4 聚合快照 JSON `GET /api/badge/data`

2026-11-11 操作者拍板：静态营销站（`apps/landing`）不再手工抄数字，构建期从本端点
拉一份与 `/u/<token>` **同源同口径**的聚合快照。数据来自 `loadPublicPageData`（§4.7），
因此同一时刻两处数字必然一致；本端点不新增任何查询路径。

路由 `apps/web/src/app/api/badge/data/route.ts`（静态路由，`dynamic = "force-dynamic"`）。

### §2.4.1 参数

| 参数 | 必填 | 取值 | 说明 |
|---|---|---|---|
| `token` | 是 | **公开页令牌**（§3.2，`tu_page_` 前缀） | 校验规则同 §2.1（≤128 字符、`[A-Za-z0-9_-]`），有效性同样交给明文查行；**徽章令牌一律 404**（2026-11-14 起公开页与徽章彻底解耦） |

不接受 `project` / `style` / `theme` / `range`：本端点只出**账户级**快照，也不读取徽章行内的
`project`。

### §2.4.2 响应

- 成功：`200`，`Content-Type: application/json`（JSON 恒为 UTF-8，不带 charset 参数），
  `Cache-Control: public, max-age=300, s-maxage=600, stale-while-revalidate=1800`
- 响应体（`schemaVersion` 固定 `1`；其余字段与落地页 `src/data/snapshot.json` 对齐）：

```json
{
  "schemaVersion": 1,
  "fetchedAt": "2026-11-11",
  "updatedAt": "2026-11-11T08:12:00.000Z",
  "totals": { "tokens": 24582974474, "costUsd": 1708.11, "activeDays": 106 },
  "meta": {
    "firstDay": "2025-07-20",
    "lastDay": "2026-11-11",
    "sourceCount": 17,
    "modelCount": 59,
    "longestStreakDays": 52,
    "peakDay": { "day": "2026-09-01", "tokens": 882141104 }
  },
  "heatmap": {
    "from": "2025-11-13",
    "to": "2026-11-11",
    "activeDays": 106,
    "cells": [["2025-11-13", 0, 0]]
  },
  "sources": [{ "label": "ZCode", "tokens": 15767035267, "share": 0.6619 }],
  "models": [{ "label": "GLM-5.3-Flash", "tokens": 14436724623 }],
  "series": [0]
}
```

字段口径：

| 字段 | 来源 / 口径 |
|---|---|
| `fetchedAt` | 热力图窗口右端（所有者时区的今天），即 `heatmap.to` |
| `updatedAt` | 用量行最新的 `updated_at`（UTC ISO），可为 `null` |
| `totals` | 与 SVG 徽章同一份 `BadgeData.totals`；`costUsd` 取到分（2 位） |
| `meta` | `/u` 页首同款全部事实；`peakDay` 无数据时为 `null` |
| `heatmap.cells` | 近 52 周（364 格）周序 `[day, tokens, level]`，`level` 0–4，与仪表盘同一套「相对最大值 25/50/75%」分档 |
| `sources` / `models` | 各前 5 行，`share` 取到 4 位小数（0–1） |
| `series` | 最近 30 个自然日日用量（所有者时区，升序），与 sparkline 徽章同源 |

### §2.4.3 错误

| 情形 | 状态 | 响应体 |
|---|---|---|
| 缺 `token` / 格式非法 | `400` | `{"error":"bad request"}` |
| 令牌查无 / 已吊销 / `enabled=false` | `404` | `{"error":"badge unavailable"}` |
| `POST`/`PUT`/`DELETE` | `405` | `{"error":"Method not allowed"}` |
| 未预期异常 | `500` | `{"error":"Internal Server Error"}` |

- 禁用与查无不区分（同 `/u/<token>` 的 404 语义），避免用本端点探测令牌是否存在；
- `OPTIONS` → `204`（`Allow: GET, OPTIONS`）；
- 错误响应一律 `Cache-Control: no-store`，不回栈。

### §2.4.4 隐私

只含 §1 的聚合口径：总量、来源 / 模型各前 5、近 52 周逐日用量等级、近 30 日序列。
**不含**头像（`data:` URI 只在 SVG 与 `/u` 页面内联）、email、user_id、令牌本身、
会话明细、project_key。

## §3 令牌与配置存储

### §3.1 迁移 `20261113000000_token_public_badges_reset.sql` + `20261113000001_token_public_badge_rows.sql`

2026-11-13 操作者拍板：**不做数据迁移**，旧表一次性 drop（历史令牌全部作废，当时用量极少），
再按新模型重建两张表：

```sql
-- 20261113000000_token_public_badges_reset.sql（不可重放）
drop table if exists public.token_public_badges;

-- 20261113000001_token_public_badge_rows.sql（幂等）
create table if not exists public.token_public_badge_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  display_name text not null default '' check (char_length(display_name) <= 80),
  timezone text not null default 'UTC' check (char_length(timezone) between 1 and 64),
  allowed_projects jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check (jsonb_typeof(allowed_projects) = 'array'
         and jsonb_array_length(allowed_projects) <= 32)
);

create table if not exists public.token_public_badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique
    check (token ~ '^tu_badge_[A-Za-z0-9_-]{32}$'),
  label text not null default '' check (char_length(label) <= 40),
  style text not null default 'panel'
    check (style in ('panel', 'compact', 'sparkline')),
  theme text not null default 'auto'
    check (theme in ('dark', 'light', 'auto')),
  range text not null default 'all'
    check (range in ('all', '30d')),
  project text check (project is null or char_length(project) between 1 and 120),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  revoked_at timestamptz
);

create index if not exists token_public_badges_user_idx
  on public.token_public_badges (user_id, created_at);

-- 20261114000000_token_public_badge_display_name_style.sql（幂等，操作者拍板）
alter table public.token_public_badge_settings
  drop constraint if exists token_public_badge_settings_display_name_check;
alter table public.token_public_badge_settings
  add constraint token_public_badge_settings_display_name_check
  check (char_length(display_name) <= 30);
alter table public.token_public_badges
  alter column style set default 'sparkline';

-- 20261114000001_token_public_badge_label_20.sql（幂等，操作者拍板）
alter table public.token_public_badges
  drop constraint if exists token_public_badges_label_check;
alter table public.token_public_badges
  add constraint token_public_badges_label_check
  check (char_length(label) <= 20);

-- 20261114000002_token_public_badge_settings_page_entry.sql（幂等，操作者拍板）
alter table public.token_public_badge_settings
  add column if not exists show_page_entry boolean not null default true;
alter table public.token_public_badge_settings
  add column if not exists page_token text
    check (page_token is null or page_token ~ '^tu_page_[A-Za-z0-9_-]{32}$');
create unique index if not exists token_public_badge_settings_page_token_key
  on public.token_public_badge_settings (page_token)
  where page_token is not null;

-- 20261114000003_token_public_badge_settings_page_enabled.sql（幂等，操作者拍板）
alter table public.token_public_badge_settings
  add column if not exists page_enabled boolean not null default true;
```

- 两表 RLS enabled 零 policy + 仅 `service_role`（与 `token_*` 表同姿态，浏览器零直连）
- **账户级 vs 每枚**：`enabled`（总开关）、`display_name`（公开名）、`timezone`（活跃天口径）、
  `allowed_projects`（暴露边界）在 settings 行——一处收紧全局生效；`label`、
  `style`/`theme`/`range`/`project`、`revoked_at`、`created_at` 在每枚徽章行
- 新增首枚徽章时若 settings 行不存在则创建：`enabled=true`、`display_name` 快照会话
  `user_metadata.display_name`（缺省空串）、`timezone` 取请求值、`allowed_projects=[]`。
  已有行时只在 `enabled=false` 时打开。公开渲染不回查 auth；空串由渲染器回退
  `AI Coding Usage`，可经 §7.1 `PUT {displayName}` 单独改写
- `allowed_projects` 元素级校验（每项 ≤120 字符、过 `normalizeProjectKey`）在应用层完成
  （PG CHECK 不能含子查询）
- `display_name` 上限 30 字符（2026-11-14 从 80 收紧，DB CHECK 与应用层截断同步）；
  新徽章 `style` 默认 `sparkline`（同日操作者拍板，设置页风格选择折线居首）
- `label` 上限 20 字符（2026-11-14 从 40 收紧）且**新增必填**：label 现在是徽章的名称，
  经设置页新增/编辑共用弹窗设置；`POST` 缺失或空 label → `400 {error:"Label required"}` /
  `{error:"Invalid label"}`，`PATCH` 空 label → `400 {error:"Invalid label"}`；
  历史空名行（服务端默认 `''`）在列表中显示「未命名徽章」兜底
- **名称判重（2026-11-14）**：每个用户内唯一，trim 后大小写不敏感比较、排除自身、
  已吊销行也计入；命中 → `409 {error:"Label already exists"}`。弹窗先用本地列表即时
  判重，服务端同步镜像校验，409 回显为弹窗内联错误；不设 DB 唯一索引（写入路径唯一，
  应用层校验足够，且避免卡死历史空名行）
- `show_page_entry`（默认 true，2026-11-14）控制登录后顶栏是否显示「公开页」入口按钮，
  **不控制公开页本身**；`page_enabled`（默认 true，2026-11-14）是公开页自己的开关——关闭时
  `/u/` 404，开启时正常访问；徽章总开关 `enabled` 只影响徽章图片（§2.3），不触及页面；
  `page_token` 是每用户一份公开页的唯一钥匙（§3.2），settings 行创建时生成，迁移前的
  旧行首次读取配置时懒生成

### §3.2 令牌、吊销与删除

- 格式：`tu_badge_` + 32 字符 base64url（24 字节 CSPRNG）；前缀便于密钥扫描，PG CHECK 兜底
- **明文存库，令牌即行 ID**（2026-11-13 操作者决定）：令牌本来就是印在 README 里的公开
  标识，哈希只带来「自己也看不到自己的链接」；数据库已持有徽章渲染所需的全部聚合，明文
  不扩大泄露面。公开端点仍从不回显令牌（§1），只有会话鉴权的 §7.1 返回
- **新增**（`POST /api/app/badge`）：插入一行并生成新令牌；已有徽章的令牌与链接完全不受
  影响；上限 10 枚（含已吊销行）
- **吊销**（`PATCH {revoked:true}`）：写 `revoked_at`；公开端与「查无」表现完全一致
  （`badge unavailable`，§2.3），行与令牌保留，不暴露曾经存在
- **恢复**（`PATCH {revoked:false}`）：清空 `revoked_at`，恢复的是**同一个链接**，令牌不轮换
- **删除**（`DELETE /links/<id>`）：物理删行、不可恢复；此后访问呈现 `badge unavailable`
- 令牌出现在 URL 查询里 → 会进各级访问日志：这是公开徽章的设计前提（令牌只控制聚合数字的
  公开）。泄露处置 = 吊销该枚（之后可恢复）或删除后新建；**不再有「重置换锁」**

**公开页令牌（2026-11-14 新增）**：`/u/<token>` 是**每用户一份**的账户级页面，由 settings 行
的 `page_token`（`tu_page_` + 32 字符 base64url，同熵）唯一标识——**徽章令牌不再打开公开页**
（§2.3/§2.4 的查无语义同样适用）。公开页与徽章彻底解耦：吊销、删除、新增徽章都不影响公开页
URL；页面由**独立开关** `page_enabled`（§3.2，2026-11-14）控制，关闭时 404、开启时正常访问，
徽章总开关 `enabled` 只管徽章图片（§2.3）。settings 行创建时生成，迁移前的旧行在首次读取
配置时懒生成；`PUT {resetPageToken:true}` 可轮换（泄露处置：旧 `/u/` 链接全部立即失效，
徽章图片不受影响）。

### §3.3 allowed_projects

- jsonb 字符串数组，元素为 project_key（= cwd basename，与 `token_sessions` 同口径）；
  ≤32 项、每项 ≤120 字符；空数组 = 仓库徽章全关，account 徽章不受影响

### §3.4 timezone

- IANA 名称；Settings 保存时由浏览器提供并按 `parseTzContext` 约定归一
  （`lib/account/series.ts`，非法回退 UTC）；活跃天数按此时区折算（§4.3）

### §3.5 公开增强模块开关（**已移除**；2026-11-13 随表重建消失）

历史上 `token_public_badges` 曾有 `show_heatmap` / `show_achievements` 两列，控制公开页是否
渲染全历史热力图与已解锁成就墙。两个开关早已从配置端点与 UI 移除（公开页始终计算并展示，
无「关了就不算不传」的分支）；本次重建没有保留这两列，新迁移里不再出现它们，旧迁移只作为
历史事实留在 `supabase/migrations`。

## §4 数据与口径

### §4.1 account 徽章（不带 `project`）

- 与仪表盘同口径（2026-11-02 P3 实测修订，操作者裁定）：数据取账户快照的
  `canonicalRows`（仅活跃设备、Cursor 跨设备去重、Trae CN 取会话态），tokens 汇总
  `total_tokens`；成本逐行 `rowCost`（`lib/pricing` 读时定价，仅 grok/cline 采信正的
  上报成本）。原文「汇总存储列 `total_cost_usd`」作废：采集端上报行的存储成本恒为 0，
  实测真实账户徽章会永远显示 `$0.00`
- TOP 来源：按 `source` 聚合 `total_tokens` 降序取前 2 + 占比（panel 右下）
- TOP 模型：按 `model` 聚合降序 ≤5（公开页展示，徽章不展示）
- **复用** `lib/api/account-data.ts` 的快照单飞加载，不新增第二条全量拉取路径

### §4.2 repo 徽章（带 `project`）

- 源表 `token_sessions`（`user_id` + `project_key` eq；索引 `token_sessions_user_project_idx`）
- tokens 直接汇总；cost 由 `lib/pricing` 匹配单价计算（同仪表盘 Sessions 视图口径：
  每模型行不带计价时间上下文，恒按**峰值价**，DeepSeek 峰谷 / 周末半价不生效——
  `docs/cli-contract.md` §2.7 计价口径注记 2026-10-27 方案 b）
- 三项口径缺口（拍板 3 知情确认，写入 UI 提示文案）：
  1. `cursor` / `trae-cn` 为账户级来源，不进 `token_sessions` → 仓库徽章天然不含；
  2. `project_key` 为空的历史会话不计入（旧 CLI 回放可能缺失）；
  3. 同名 basename（不同目录同名仓库）合并统计。
- 白名单校验：生效的 project（查询串优先，其次行内值）与 `allowed_projects` **精确匹配**
  （归一后比较）

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
  displayName: string;         // settings 行快照；空串由渲染器回退（§5.2）
  avatarDataUri?: string | null; // 头像内联 data: URI（§5.2，2026-11-02）；缺失 → 首字母圆
  range: BadgeRange;
  totals: BadgeTotals;
  sources: BadgeSource[];      // tokens 降序
  models: BadgeModel[];        // tokens 降序，≤5
  series: number[];            // 最近 30 个自然日日用量（所有者时区，升序）；可为空
}

export interface RenderOptions { style: BadgeStyle; theme: BadgeTheme }
```

### §4.7 公开页总数据口径（2026-11-05 操作者裁定；2026-11-14 收敛为每用户一份）

- **公开页恒为账户级（2026-11-14）**：`/u/<page_token>` 与徽章解耦，任何徽章行的仓库口径
  都不影响本页；仓库范围只存在于 SVG 徽章（§4.1–4.2）。页面 URL 见 §3.2 公开页令牌。
- **页面开关独立（2026-11-14）**：`page_enabled` 管 `/u/` 可达性（关 = 404），徽章总开关
  `enabled` 只管 SVG 徽章；两开关互不影响。

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
  ——头像 + 显示名之外不展示仓库）。
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
  helper 供徽章与公开页复用，保证单一口径；不新增 SQL、不新增端点。
- 加载与缓存：`page.tsx` SSR service-role 直出，不走 `/api/app`；公开页专用单飞键
  `(userId)`、TTL 60s；热力图与成就**始终加载与计算**（无开关分支）。
- 文案：`lib/copy/public-page.ts` 删 `last30` / `last30Total`，增口径行、热力图 / 成就空态
  与页脚隐私声明；Token 数字走 `useFormat().formatTokens`（随访客偏好），
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

### §5.2 style=panel（上游同款布局）

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

### §5.4 style=sparkline（默认，2026-11-14 起）

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

> 本节是公开页的页面规格唯一规范；上游线上 `/u/:id` 仅作形态参照，端点、命名与实现不回搬。

### §6.1 路由与基础约束

- 路由 `apps/web/src/app/u/[token]/page.tsx`（动态段独占整段）；无 AppShell
  （与 `/login` 同类）；metadata：标题 = `displayName + " · Token Usage"`，
  `robots: noindex`（**保持**，不做 SEO 收录）
- 令牌查无、已吊销（`revoked_at` 非空）或 `enabled=false` → `notFound()`（404）；三者表现
  一致，不暴露链接是否曾经存在。`findBadgeOwner` 由 `/api/badge` 与本页共用，
  `generateMetadata` 与页面经 React `cache` 共享一次查找
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
- **资产路径（2026-11-14 修复）**：插画固定为 `/achievement-art/<id>.png`
  （`apps/web/public/achievement-art/`），刻意避开受登录守卫保护的 `/achievements` 页面前缀。
  `/u/<token>` 是匿名页，资源一旦落在守卫前缀下会被 307 到 `/login`，`<img>` 解码失败后
  `achievement-medallion.tsx` 回退参数化 SVG，表现为「线上徽章与本地长得不一样」而非报错。
  守卫测试锁定该约束。
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

### §7.1 `/api/app/badge` 与 `/api/app/badge/links/<id>`（会话守卫沿用 `/api/app/achievements` 模式）

| 方法 | 行为 |
|---|---|
| `GET` | 返回 `{enabled, timezone, allowedProjects, displayName, showPageEntry, pageEnabled, pageToken, knownProjects, badges:[{id, token, label, style, theme, range, project, createdAt, revokedAt}]}`；**徽章令牌明文返回**（本人会话鉴权，链接必须随时可复制）；`pageToken` 是公开页钥匙（§3.2，缺失时读取即懒生成）；`showPageEntry` 控制顶栏入口；`pageEnabled` 是公开页开关（§3.2）；`knownProjects` 是本人 `token_sessions` 去重的非空 project_key（按 tokens 降序，≤200），白名单多选的数据源；**不含** `hasToken` / `tokenLast4` / `showHeatmap` / `showAchievements` |
| `GET ?preview=1&style=…&theme=…&range=…&project=…` | 本人预览（§7.3）：会话鉴权代替令牌，参数 / 加载器 / 渲染器与 `/api/badge` 同源，返回 SVG（`no-store`）；不看 `enabled`（未公开也可预览）；白名单仍校验；出现 `scope` 同样 `bad request` |
| `POST` | 新增一枚：生成令牌并插入行，`label` **必填**（1–20 字符，缺失或空 → `400 {error:"Label required"}` / `{error:"Invalid label"}`）且**用户内判重**（trim、大小写不敏感，重名 → `409 {error:"Label already exists"}`，2026-11-14）；`style` / `theme` / `range` / `project` 取请求值（缺省 `sparkline` / `auto` / `all` / `null`，`project` 须命中白名单）；若 settings 行不存在则创建（`enabled=true`、快照会话名、`timezone` 取请求值、`allowed_projects=[]`），已存在则仅在 `enabled=false` 时打开；响应 `{badge, enabled:true}`；第 11 枚（含已吊销行）→ `409 {error:"Badge limit reached"}` |
| `PUT` | 更新账户级 `{enabled?, timezone?, allowedProjects?, displayName?, showPageEntry?, pageEnabled?, resetPageToken?}`；allowedProjects 逐项过 `normalizeProjectKey` + 长度校验，非法项 `400`；**级联回落（2026-11-14 操作者裁定）**：白名单移除某项目时，行内 `project` 指向它的徽章自动置 `null`（回落为账户徽章），响应带 `badges`（最新行）与 `fallbackBadgeIds`（被回落行）；displayName 须为 string（trim、截 30，**空串合法**=清空，渲染回退 `AI Coding Usage`），非 string `400`；`showPageEntry` 布尔（顶栏入口）；`pageEnabled` 布尔（公开页开关，独立于徽章总开关）；`resetPageToken:true` 轮换公开页令牌（旧 `/u/` 链接全部立即失效，§3.2）；timezone 按 `parseTzContext` 约定归一；成功失效公开页缓存；settings 行不存在时创建（含公开页令牌）；响应 `{...config, badges, fallbackBadgeIds}` |
| `PATCH /links/<id>` | 更新该枚的 `{label?, style?, theme?, range?, project?, revoked?}`；`label` 出现时必须 1–20 字符（空 → `400 {error:"Invalid label"}`）并参与用户内判重（排除自身，重名 → `409 {error:"Label already exists"}`，2026-11-14）；`project:null` = 回到账户徽章，非空值必须命中白名单（否则 `400 {error:"Project not allowed"}`）；`revoked:true` 写 `revoked_at`、`false` 清空（同链接恢复）；非本人或不存在的 id → `404 {error:"Badge not found"}`；响应为更新后的 badge |
| `DELETE /links/<id>` | 物理删行，`204`（无 body）；非本人或不存在 → `404` |

- 无会话 → `401 {error:"Unauthorized"}`；非法体 → `400 {error}`；存储异常 → `503`；一律 `no-store`
- 预览挂在同一路由（与 `/api/app/achievements` 的 POST 同理：不增加部署函数数）
- 字段校验集中在 `lib/badge/input.ts`（POST 与 PATCH 共用，同一输入同一错误码）：label
  trim 后 1–20、时区归一、枚举值只接受 §2.1 的集合

### §7.2 Settings 卡片（`/settings?section=badges`）

公开徽章是独立 tab（`components/settings/badge-card.tsx` 为状态编排器），自上而下三张卡：

1. **账户设置卡**（`badge-settings-card.tsx`）——总开关 `Switch`（没有徽章时禁用并提示先
   新增；切换即 `PUT {enabled, timezone}`）；公开名称输入 + 保存（`PUT {displayName}`，≤30
   字符，与个人信息名称解耦，清空后公开面显示 `AI Coding Usage`）；仓库白名单多选（数据源
   `knownProjects`，已不在会话中的项仍列出以便移除；`PUT {allowedProjects}`，移除项触发
   §7.1 级联回落并 toast 告知受影响徽章数）；时区只读展示（浏览器时区，随每次保存 PUT）。
   一处收紧白名单全局生效（§3.3）。
2. **徽章列表卡**（`badge-links-card.tsx`）——右上「新增徽章」打开共用名称弹窗（异步只
   发生在弹窗确认按钮上；到 10 枚禁用并提示）；每行
   `badge-link-row.tsx` 显示名称（空则「未命名徽章」）、生效 / 已吊销 Chip 与
   一行摘要（风格 · 主题 · 范围 · 仓库）；行内动作 = 编辑（`Pencil`，打开共用弹窗）/
   复制链接 / 吊销或恢复 / 删除；吊销 /
   恢复 PATCH 期间该按钮图标换成 `Spinner`（2026-11-14）。吊销
   **无**二次确认（可逆）；删除用 `AlertDialog status="danger"` 二次确认、不可恢复。已吊销
   行仍占位，直到删除。
3. **选中徽章卡**（`badge-detail-card.tsx`）——**无顶部**（名称与状态只在列表行出现，
   卡片从「展示参数」开始，2026-11-14）；风格
   （折线居首、默认选中）/ 主题（跟随系统居首）/ 范围 / 仓库单选，改动**即时 PATCH**（失败 toast，界面按
   服务端返回值回写，无乐观回滚）；实时预览
   （`PanelOverlay` 遮罩）；README 片段（§7.4）。仓库下拉的空值 = 账户徽章，选中 = 该仓库，
   `Select.ClearButton` 清空回账户（与 §2.1 的 project 开关同构）。

- **名称弹窗**（`badge-dialogs.tsx` 的 `BadgeNameDialog`）——新增与编辑共用（编辑预填当前
  名称）：`Modal` + `Form` + `TextField isRequired`（≤20 字，Enter 提交），空值禁用确认钮、
  内联 `FieldError`；新增确认后自动选中新徽章，直接在下方详情卡调参；失败 toast 且弹窗
  保留草稿（2026-11-14）
- **公开页卡片在账户 tab（2026-11-14 二次调整）**：徽章 tab 的账户设置卡只管徽章
  （公开展示 / 公开名称 / 白名单）；「公开页」开关与「重置链接」操作移到**账户 tab** 的
  `public-page-card.tsx`（自取数 `/api/app/badge`）——「公开页」开关（`PUT {pageEnabled}`，
  **独立于徽章总开关**：关 = `/u/` 404，开 = 正常访问）+「重置公开页链接」按钮
  （`AlertDialog status="danger"` 确认后 `PUT {resetPageToken:true}` 轮换令牌，旧链接全部失效）。
  顶栏（`top-actions.tsx`，`ChartLineArrowUp` 图标）**恒显示**：页面开关开时新标签页打开
  `/u/<page_token>`，关（或配置不可用）时 toast 提示先去设置开启；配置经 `GET /api/app/badge`
  获取，读取即顺带回填 page_token
- 次要说明（公开名称细则、白名单口径与时区、预览前置条件）收进 label 旁的 `CircleInfo`
  图标按钮 + `Tooltip`，行内 `Description` 只留一句动作前必读文案；对应文案键为
  `nameHelp` / `projectsCaveat` / `timezoneNote` / `previewHelp` 与 `*HelpLabel`
  （`lib/copy/badge.ts`）
- 细则遵循 `docs/ui-spec.md`（HeroUI 复合结构 + 语义文本组件）

### §7.3 预览

- 选中徽章卡内实时 `<img src="/api/app/badge?preview=1&style=…&theme=…&range=…&project=…&v=…">`：
  客户端把该行已保存的展示参数带进查询（`v` 为变更计数，绕浏览器缓存），切风格 / 主题 /
  范围 / 仓库即换参。令牌已明文存库，但仍走会话鉴权分支，因为预览必须①不受公开总开关影响、
  ②吊销后仍可预览（正式链接已经不可用）
- 换参后到新图解码完成之间，预览容器盖一层半透明遮罩 + `Spinner`（共享 `PanelOverlay`，
  容器 `aria-busy`）：切换时不会先看到上一张图（2026-11-03 操作者裁定）。`onLoad` /
  `onError` 都解除遮罩，加载失败也不会卡住转圈

### §7.4 README 片段复制（两版都给）

- 单主题：`<a href="<origin>/u/<page_token>"><img src="<origin>/api/badge?token=<badge_token>" alt="…"></a>`
  （2026-11-14：`<a>` 指向**公开页令牌**——页面 URL 不随徽章增删吊销变化；`<img>` 仍用
  徽章令牌）
- 双主题：`<picture>` + `<source media="(prefers-color-scheme: dark)">`（GitHub 现行推荐
  写法，README 里的 prefers-color-scheme 跟随访客的 GitHub 主题设置；`#gh-*-mode-only`
  片段为其旧式替代，不再输出）。两条 URL 只额外带 `theme=dark|light`
- `<origin>` 用部署自身 origin（自部署各自填）
- 片段**只带令牌**：风格 / 主题 / 范围 / 仓库存在徽章行里，设置页改完对已嵌入徽章即时
  生效，README 永远不用跟着改
- 令牌任何时候都可用：复制按钮与片段给出完整链接；不再有一次性揭示或
  `YOUR_BADGE_TOKEN` 占位符（2026-11-14 起列表与详情不再显示令牌末四位）

## §8 缓存与滥用面

- 成功响应按 §2.2 缓存；GitHub camo 尊重 Cache-Control（shields.io 同款打法）。吊销 / 删除
  之后的旧图最多按 CDN 窗口（`s-maxage=600` + `stale-while-revalidate=1800`）滞后消失
- 单飞加载防击穿：badge 自有缓存键 `(user_id, scope, project, range)`——徽章行内值与查询串
  最终都归一到这四个维度，style/theme 只影响渲染不进缓存键；配置变更调用
  `invalidateBadgeData(userId)`
- 每枚令牌 24 字节熵、可随时吊销或删除、账号上限 10 枚；暴露面只有聚合数字；无写路径、
  无明细泄露
- v1 不做按 IP 限流（观察后议）

## §9 golden 测试

> **状态**：本节测试与本文档同步落地（spec-first）。测试文件对实现模块做**条件加载——存在则
> 跑、缺失则整文件 skip**，`pnpm verify` 在 P2 落地前保持绿；实现落地后无需改测试自动激活。
> 断言即本文档的可执行形态，实现必须原样满足。

| 文件 | 覆盖 |
|---|---|
| `tests/unit/badge-params.test.ts` | §2.1 参数缺省 → `null`（交还行内默认）、非法值矩阵、§2.3 bad_request 分类（含 `scope` 退役） |
| `tests/unit/badge-svg.test.ts` | §5 渲染器：确定性、XML 转义、截断、隐私不变量（无 script/外链/NaN）、两个 scope 共用区块、auto 媒体查询、零态渲染、品牌区站点行存在且 compact 不含（P6）；字节级快照（`toMatchSnapshot`）在 P2 实现时随操作者过目落盘 |
| `tests/contract/badge.test.ts` | §2.2 响应头矩阵、§2.3 降级矩阵（吊销与查无同表现）、参数覆盖行内默认、方法守卫、隐私清扫（公开响应不含令牌/user_id）、§7.1 配置端点守卫与形状（GET 含明文令牌、**不含** `hasToken` / `tokenLast4`）、两个 scope 都内联头像（P6） |
| `tests/contract/badge-settings.test.ts` | §7.1 多枚模型：GET 形状、POST 新增 / 首枚建行快照 / 10 枚上限 `409`、PATCH 吊销与恢复同链接、展示参数即时作用于公开链接、DELETE 硬删、跨用户 `404`、`knownProjects`、会话预览 |
| `tests/unit/public-page-data.test.ts`（P9 新增） | §4.7 / §6：全历史日桶投影、编年分段、全历史分位数分级、`PublicPageData` 形状、空态、10 年上限 |

- canonical fixtures（附录 A）是单测与实现的共同输入；契约测试经 FakeSupabase
  播种 `token_public_badge_settings` / `token_public_badges` / `token_usage_hourly` /
  `token_sessions`
- **2026-11-13 多枚模型重置**：旧「单令牌 + sha256 + 一次性揭示」的 golden 全部重写为
  行模型（`id` 主键、`token` unique 明文、`revoked_at`）；FakeSupabase 两表夹具同步。
  同一文件里保留了 `scope` 退役断言（出现即 bad request）。
- P2 落地修订（2026-11-02，操作者逐条批准）：① 转义用例期望值补上漏写的 `&amp;`
  （`'a<b>&"c'` 的正确转义为 `a&lt;b&gt;&amp;&quot;c`）；② 外链断言精确豁免 SVG
  命名空间声明（§5.1）。测试基建同步：FakeSupabase 注册 `token_public_badges`；
  该夹具与 `token_last4` 字段已在 2026-11-13 多枚模型重置中作废（见上）
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

## §10 实现落点

| 面 | 文件 |
| --- | --- |
| 迁移 | `supabase/migrations/20261113000000_token_public_badges_reset.sql`（drop 旧表）、`20261113000001_token_public_badge_rows.sql`（settings + 每枚徽章两表） |
| 徽章端点 | `src/app/api/badge/route.ts`；`src/lib/badge/{types,params,data,render,marks,format}.ts` |
| 配置端点 | `src/app/api/app/badge/route.ts`（GET/POST/PUT + 预览）、`src/app/api/app/badge/links/[id]/route.ts`（PATCH/DELETE）；共享层 `src/lib/badge/{store,input,session,limits}.ts` |
| Settings 卡片 | `src/components/settings/badge-card.tsx`（编排）、`badge-settings-card.tsx`、`badge-links-card.tsx`、`badge-link-row.tsx`、`badge-detail-card.tsx`、`badge-dialogs.tsx`、`badge-snippet-section.tsx`、`badge-helpers.ts` |
| 公开页 | `src/app/u/[token]/page.tsx`；`src/components/u/*`；`src/lib/public-page/*`；`src/lib/copy/public-page.ts` |
| 测试 | `tests/unit/u-page-privacy.test.ts`、`tests/unit/heatmap-alignment.test.ts`、badge / badge-settings 契约测试 |

**部署顺序**：迁移必须先于代码上线，否则 `findBadgeOwner` 与配置端点查询新列会报错。

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
