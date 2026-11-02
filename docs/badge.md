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

## §2 徽章端点 GET /api/badge

路由文件 `apps/web/src/app/api/badge/route.ts`（静态路由，全查询参数驱动；动态段
只留给公开页）。服务端 service-role 直查，零浏览器 Supabase。

### §2.1 参数

| 参数 | 必填 | 取值 | 默认 | 说明 |
|---|---|---|---|---|
| `token` | 是 | 非空字符串 | — | 公开徽章令牌（§3.2）；只校验非空，格式与有效性交给哈希查库 |
| `scope` | 否 | `user` \| `repo` | `user` | |
| `project` | `scope=repo` 时必填 | 白名单内 project_key（URL 编码） | — | 长度 1–120；解析层不归一，归一在数据层（§4.2） |
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
| 参数非法（未知 style/theme/range、repo 缺 project、project 空或超 120 字符、token 缺失） | `bad request` |

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
- `display_name` 是**会话快照**（§7.1 写入），公开渲染不回查 auth，也绝不回退到 email
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
- tokens 直接汇总；cost 由 `lib/pricing` 匹配单价计算（同仪表盘明细口径；
  Sessions DeepSeek 计价口径拍板前继承现状）
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
  `TOTAL USAGE · ALL TIME / 30 DAYS`；repo 徽章在副标题下加项目名。头像下方**不放**品牌名
  （品牌只在右上角出现）
- 左下三列：`TOKENS` / `COST` / `ACTIVE DAYS`（标签 10px 大写、55% 透明度；
  数值 24px 700）
- 右上：**品牌标 + 品牌名**——品牌标 16px，取对应主题的资产：light 用 `public/logo.svg`
  （黑底白字形），dark 用 `public/logo-dark.svg`（白底黑字，2026-11-02：原实现用 accent 描
  单色字形，在深色卡上几乎不可见）；`theme=auto` 同时内嵌两版，靠 `.c-lg-l` / `.c-lg-d`
  类与同一 `prefers-color-scheme` 媒体查询切换。品牌名 `TOKEN USAGE`（10px 大写、字距 2、
  右对齐、不带域名——自部署域名各异）
- 右下区块**按 scope 切换**：`scope=user` 显示 `TOP SOURCES` **前 1 行**（来源标 12px +
  来源名 + 占比 + 占比条 72×4 圆角）；`scope=repo` 显示 `TOP MODELS` **前 1 行**
  （模型标 + 模型名 + token 数）。无数据时显示 `—`（2026-11-02 操作者裁定：2 行改 1 行并补标；
  标来自 `lib/badge/marks.ts`，由 `public/brand-logos/*.svg` 生成单色几何，随主题取 text 色）
- **列对齐**（2026-11-02）：`TOP SOURCES` / `TOP MODELS` 标题基线 = 左侧三个标签基线
  （y=120）；行名基线 = 三个数值基线（y=150），占比条 y=157——右侧不再自成一个错位的块
- **头像加载**（2026-11-02）：`lib/badge/data.ts` 用 service-role 读 `auth.users` 的
  `user_metadata.avatar_url`，仅允许本部署 host 且路径落于 `/storage/v1/object/public/avatars/`
  的地址（防 SSRF），类型限 PNG/JPEG/WebP、≤512 KB，内联为 `data:` URI；单飞缓存 5 分钟，
  `invalidateBadgeData` 一并失效；任何失败（缺头像、超大、非白名单、非图片）回退首字母圆

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
  `series` 空时退化为 panel）

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
- 三处：标题区（头像 + 名称 + 副标题）整体上移 4px 归位（0.9s）；三个指标列各上移 5px
  （延迟 0.05 / 0.1 / 0.15s）；来源占比条宽度 0 → 实际值（1.1s，延迟 0.15s）
- 只用 `translate` 与 `width`，**不用 opacity**：静态渲染器（邮件、部分客户端）在 t=0
  冻结时仍能看到全部内容；`fill="freeze"` 保证终态
- 不读 `prefers-reduced-motion`（`<img>` 语境拿不到媒体查询上下文），因此幅度刻意克制
- 不引入随机或 `Date.now()`，字节级快照保持稳定；单枚徽章约 +300B

## §6 公开页 /u/\<token\>

- 路由 `apps/web/src/app/u/[token]/page.tsx`（动态段独占整段）；无 AppShell
  （与 `/login` 同类）；metadata：标题 = `displayName + " · Token Usage"`，
  `robots: noindex`
- 展示：与 panel 徽章同源的汇总卡（tokens / cost / 活跃天数 / 来源占比 / 模型 TOP）
  + 白名单仓库卡片列表（每仓 tokens / cost / 活跃天数）
- 数据：与徽章共用 `src/lib/badge/data.ts` 加载器（同单飞缓存键）；页面 SSR 直查
  service-role，不走 `/api/app`
- 令牌查无或 `enabled=false` → `notFound()`（404）
- 页面客户端代码放 `components/u/`（`<页名>-body.tsx` 等，按 AGENTS.md 命名规范）
- 实现（2026-11-02 P4）：令牌→所有者查找 `findBadgeOwner`（`lib/badge/data.ts`）由
  `/api/badge` 与本页共用，`generateMetadata` 与页面经 React `cache` 共享一次查找；数字
  走 `lib/badge/format.ts`（与 SVG 同一固定口径），文案随访客语言
  （`lib/copy/public-page.ts`）。页面正文不渲染令牌；令牌只以 URL 段的形式出现在
  Next.js 的 RSC 路由状态里——即访客本就持有的请求 URL，动态段路由的固有行为

## §7 Settings 配置面

### §7.1 /api/app/badge（会话守卫沿用 `/api/app/achievements` 模式）

| 方法 | 行为 |
|---|---|
| `GET` | 返回 `{enabled, timezone, allowedProjects, hasToken, tokenLast4, knownProjects}`（永不回明文）；`knownProjects` 是本人 `token_sessions` 去重的非空 project_key（按 tokens 降序，≤200），白名单多选的数据源（§7.2） |
| `GET ?preview=1&style=…&theme=…&range=…&scope=…&project=…` | 本人预览（§7.3）：会话鉴权代替令牌，参数/加载器/渲染器与 `/api/badge` 同源，返回 SVG（`no-store`）；不看 `enabled`（未公开也可预览），repo 预览仍校验白名单 |
| `POST {action:"generate"}` | 生成/重置令牌：写 `token_hash`、`token_last4`、`enabled=true`、`display_name` 快照（取会话 `user_metadata.display_name`，缺省空串），响应**一次性**携带明文 token |
| `PUT` | 更新 `{enabled?, timezone?, allowedProjects?}`；allowedProjects 逐项过 `normalizeProjectKey` + 长度校验，非法项报 `400`；timezone 按 `parseTzContext` 约定归一 |
| `DELETE` | 吊销：`enabled=false`（哈希与末 4 位保留，公开端呈现 `badge disabled`，§3.2） |

- 无会话 → `401 {error:"Unauthorized"}`；非法体 → `400 {error}`；一律 `no-store`
- 预览挂在同一路由（与 `/api/app/achievements` 的 POST 同理：不增加部署函数数）

### §7.2 Settings 卡片 `components/settings/badge-card.tsx`

- 开关；令牌生成/重置（二次确认 + 明文只显示一次 + 复制）；白名单多选（数据源：
  §7.1 `knownProjects`——Sessions 已展示数据的投影，白名单里已不在会话中的项仍列出以便移除）；
  时区只读展示（浏览器时区，保存时随 PUT）
- 细则遵循 `docs/ui-spec.md`（HeroUI 复合结构 + 语义文本组件）；随 P3 在 ui-spec
  增补对应小节

### §7.3 预览

- 卡内实时 `<img src="/api/app/badge?preview=1&…">`（附 cache-busting 查询参数绕浏览器
  缓存），风格/主题/范围/对象切换即换参。2026-11-02 P3 实施修订：原写 `/api/badge?token=…`，
  但明文令牌只在生成时出现一次，页面刷新后无从构造公开 URL，故改用会话鉴权预览分支（§7.1）

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
| `tests/unit/badge-svg.test.ts` | §5 渲染器：确定性、XML 转义、截断、隐私不变量（无 script/外链/NaN）、scope 切换区块、auto 媒体查询、零态渲染；字节级快照（`toMatchSnapshot`）在 P2 实现时随操作者过目落盘 |
| `tests/contract/badge.test.ts` | §2.2 响应头矩阵、§2.3 降级矩阵、方法守卫、隐私清扫（响应不含令牌/哈希/user_id）、§7.1 配置端点守卫与形状 |

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

## §10 实施阶段

| 阶段 | 内容 | 产出文件 |
|---|---|---|
| P2 服务端 | 迁移 + 参数层 + 渲染器 + 数据层 + 两个端点 | `supabase/migrations/20261101000000_token_public_badges.sql`；`src/lib/badge/{types,params,data,render}.ts`；`src/app/api/badge/route.ts`；`src/app/api/app/badge/route.ts` |
| P3 Settings | 配置卡片 + ui-spec 增补 | `src/components/settings/badge-card.tsx` |
| P4 公开页 | `/u/[token]` + 自家 README 挂徽章 | `src/app/u/[token]/page.tsx`；`src/components/u/*` |
| P5 徽章视觉（2026-11-02） | 头像 + 品牌标 + 单行来源（含来源标） | `src/lib/badge/render.ts`；`src/lib/badge/marks.ts`（由品牌标生成）；`src/lib/badge/data.ts`（头像加载） |

- 随 P2 在 AGENTS.md 文档地图增补 `docs/badge.md` 行
- 零新依赖；除 §3.1 迁移外无其他表结构变更（此前评估曾称"零迁移"，为存令牌与
  白名单所必需，以本文件为准）
- 上游署名规则不触发（无上游代码搬入）

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
