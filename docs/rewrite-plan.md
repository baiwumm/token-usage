# 架构与计划

Token Usage 的架构与执行真源。**活需求以 `docs/requirements.md` 为准**（两者不一致时以 requirements
为准并回改本文）；数据模型、依赖预算、环境变量与待办在此维护。已完成的里程碑记录、迁移执行过程与
版本沿革见 `docs/archive/rewrite-plan-2026-11.md`。

## 1. 架构决策

| # | 决策点 | 结论 |
| --- | --- | --- |
| 1 | 功能基线 | 对齐上游活功能：仪表盘 + 分享卡、设置、wrapped、服务状态、`/device` 配对、全套 CLI API。排行榜、上游云端成就、pet/quota、`/selfhost` 降级页不做 |
| 2 | 许可证 | MIT；上游署名集中在根 `LICENSE` 与 `THIRD_PARTY_NOTICES.md`，README 与 docs 只指向它们 |
| 3 | CLI 策略 | fork 上游 CLI（MIT）改造为 `tokenusage-cli`：解析器继承并跟进 cherry-pick，`sync` 手动为主，`--watch` / 计划任务为可选自动档；契约按「CLI 版本 ↔ 服务端版本」配对演进 |
| 4 | 品牌 | 仓库 `token-usage`，UI 显示 **Token Usage** |
| 5 | 认证 | `@supabase/ssr` cookie 会话；邮箱密码 + 魔法链接 + GitHub/Google OAuth（OAuth 只作已有账号的登录方式，按已验证邮箱自动关联）。公开注册关闭，管理员建号；`token_allowed_emails` 为可选的自助注册白名单 |
| 6 | 数据访问 | `route.ts` 内用 `@supabase/supabase-js` + secret key 访问 PostgREST；异常式错误语义（唯一约束 → 409，其余 → 500，见契约 §1.3） |
| 7 | RLS 姿态 | 应用表对 `anon` / `authenticated` **全拒**；浏览器零直连；secret key 只存在于服务端运行时 |
| 8 | 表结构 | 保守规范化 + `token_` 前缀；保留桶语义（last-wins upsert 键），表名列名规范化 |
| 9 | i18n | 中英双语，轻量 copy 管线：locale 存 cookie + 根布局 SSR、`<html lang>` 同步；带数字/复数的文案用 `intl-messageformat`，不引入 i18n 框架。文档中文、代码注释英文 |
| 10 | 视觉 | 功能对齐 + 视觉简化：HeroUI 重做，GSAP/Three 不移植；动画优先 CSS，必要时 motion（`motion/react`）；图表用 recharts |
| 11 | 契约分档 | CLI 面硬冻结（消费者是钉版 CLI）；Dashboard 面可演进（消费者只有新 UI），变更回写契约并同步 golden 测试与前端 |
| 12 | 路由 | 仪表盘挂 `/` 且需登录；落地页在仓库内 `apps/landing` 独立部署到 token-usage.cc；自部署实例域名无关 |
| 13 | Sessions | 设备级会话明细：`token_sessions` + ingest 可选 `sessions` 数组 + `account-sessions` series；只收用量元数据 |
| 14 | 成就 | 账号级、只升不降、按浏览器时区、读时计算；指标限单调白名单；不建成就表（仅 `token_achievement_seen` 存已读水位） |
| 15 | 桌面端 | `apps/desktop` 托盘伴生工具（Tauri 2），只做本机采集视角监控与 CLI 操作台，不复制 web 仪表盘；边界见 `docs/desktop-plan.md` |

## 2. 目标架构

```text
采集机（tokenusage-cli，fork 自上游；手动 sync 为主）
   │  Bearer 设备令牌（配对走 /device 批准）
   ▼
浏览器（React 19 / HeroUI 3 / App Router，apps/web）
   │  cookie 会话（@supabase/ssr）
   ▼
Next.js route.ts（server-only，service-role key）
   ├── /api/functions/token-usage-*  ← CLI 契约层（行为冻结）
   └── /api/app/*                    ← 仪表盘内部接口（自由演进）
   ▼
Supabase Postgres（token_* 表，RLS 全拒客户端角色）
```

要点：

- **仓库布局**：pnpm workspace — `apps/web`（上图除采集机外的全部）、`packages/cli`（npm 包
  `tokenusage-cli`）、`apps/landing`（静态落地页）、`apps/desktop`（Tauri 托盘工具）。
- **契约层与内部接口分离**：`/api/functions/token-usage-*` 逐字冻结（`docs/cli-contract.md`），
  仪表盘自有需求走 `/api/app/*`，两者不得互相污染。
- **实例天然隔离**：CLI 只向配对实例上报（base URL + 该实例签发的设备令牌），route.ts 用自己
  环境里的 secret key 写自己的 Supabase；数据跨实例零共享。
- **共享纯函数模块**：账户级来源（cursor / trae-cn）的去重与会话状态聚合、读取时定价引擎
  （vendored LiteLLM 快照 + curated 覆盖）作为纯函数被契约层与仪表盘共用。
- **函数预算**：route handler 数量以 `apps/web/src/app` 下 `route.ts` 计数为准（文档不写死）。
  新增端点优先并入 catch-all（`/api/functions/[...slug]`）或 `/api/app/*`。

## 3. 数据模型

所有表 `enable row level security`，对 `anon, authenticated` **无任何 policy**（全拒）；
`service_role` 全量授权。迁移文件在 `supabase/migrations/`，幂等（`if not exists`），
部署者可 `supabase db push` 一键建库。

| 表 | 说明 | 关键列 / 约束 |
| --- | --- | --- |
| `token_devices` | 每用户多设备，软吊销 | `id uuid pk`, `user_id → auth.users`, `device_name`, `platform`, `machine_id`, `machine_cluster_id`, `name_customized bool`（v1 未启用）, `default_device_name`（签发时的名称快照，改名不更新）, `revoked_at`, `created_at`, `updated_at`；部分唯一索引：活跃设备 `(user_id, machine_id)` 与 `(user_id, platform, device_name)` |
| `token_device_tokens` | 设备令牌，只存哈希 | `token_hash unique`, `user_id`, `device_id → token_devices`, `revoked_at`, `last_used_at` |
| `token_device_codes` | CLI 配对码 | `device_code pk(64hex)`, `user_code unique(XXXX-XXXX)`, `status check in (pending/approved/used/expired)`, `user_id`, `expires_at`, `client_info`, `machine_id`, `approved_at` |
| `token_usage_hourly` | 机器级小时桶 | 主键 `(user_id, device_id, hour_start, source, model, project_key)`；`project_key text not null default ''`（'' = 未归因，主键列不可为 NULL）；6 个 token 列非负 check；`billable_total_tokens` 可空非负；`conversations ≥ 0`；`total_cost_usd ≥ 0`（CLI 上报恒 0，成本读取时算）；`credits numeric not null default 0`（厂商积分，独立维度，永不并入 token / 成本） |
| `token_account_session_states` | trae-cn 规范会话 | 主键 `(user_id, source, session_id)`；`total = input + cached + cache_creation + output` check |
| `token_sessions` | 设备级会话明细（Sessions 页） | `id uuid pk`, `user_id`, `device_id → token_devices`, `source`（1–100）, `session_id`（1–256）, `project_key`（可空，≤120，basename）, `started_at`, `ended_at`, 6 个 token 列（非负）+ `billable_total_tokens`（可空非负）, `credits`（非负，独立维度）, `models jsonb not null default '[]'`（`[{model, 6 个 token 列}]`，≤32）, `created_at`, `updated_at`；唯一 `(user_id, device_id, source, session_id)`；check `ended_at >= started_at`、`total_tokens = 四项之和`（reasoning 单列，不计入 total）、数组形状、`lower(source) not in ('cursor','trae-cn')`；索引覆盖 `(user_id, ended_at desc)`、设备、来源与 `project_key` |
| `token_allowed_emails` | 可选：自助注册白名单 | `email citext unique`, `added_by`, `created_at`；配套触发器在单独迁移文件，标注 optional |
| `token_sync_runs` | 采集端每轮 sync 运行记录（含空跑） | `id uuid pk`, `user_id`, `device_id`, `run_id`（1–128）, `started_at`, `ended_at`, `duration_ms`（服务端派生）, `trigger`（scheduled/manual/watch/notify）, `result`（ok/partial/error）, `error_code`, `empty`（服务端派生）, `parsed_files` / `buckets_uploaded` / `tokens_ingested` / `sessions_uploaded` / `sessions_skipped`（非负）, `credits_ingested`（可选遥测，不参与对账）, `queue_bytes`, `cli_version`, `os`, `created_at`, `updated_at`；唯一 `(user_id, device_id, run_id)`（幂等，重放 duplicate:true、首写胜出）；索引 `(user_id, started_at desc)` |
| `token_achievement_seen` | 成就已读水位 | `user_id uuid pk → auth.users on delete cascade`, `seen_through date`（≥ 2000-01-01，只前进）, `created_at`, `updated_at`；每用户单行。**只存已读日，不存成就快照** |
| `token_public_badge_settings` | 公开徽章账户级配置：总开关、公开名、时区、仓库白名单 | `user_id uuid pk → auth.users on delete cascade`, `enabled bool`, `display_name`（≤80）、`timezone`（1–64）、`allowed_projects jsonb`（数组 ≤32）、`created_at`、`updated_at`；每用户单行。见 `docs/badge.md` §3.1 |
| `token_public_badges` | 公开徽章令牌（一行一枚，明文）与展示默认值 | `id uuid pk`, `user_id → auth.users on delete cascade`, `token text unique`（CHECK `tu_badge_` + 32 base64url）、`label`（≤40）、`style`/`theme`/`range`（枚举 CHECK）、`project`（可空 1–120）、`revoked_at timestamptz`、`created_at`、`updated_at`；索引 `(user_id, created_at)`。见 `docs/badge.md` §3.1–3.2 |
| `token_project_repos` | 项目仓库地址的**设备级**检测结果（契约 v3，唯一写入方是 ingest 的 `projects`） | 主键 `(user_id, device_id, project_key)`；`user_id` / `device_id`（均 on delete cascade）；`project_key` 1–120；`repo_url` 可空（null = 该设备已检测不到），仅允许 `https://github.com/` 与 `https://gitee.com/` 开头且 ≤200；`created_at`、`updated_at`；读取取未吊销设备中 `updated_at` 最新的非空值 |
| `token_project_profiles` | 项目资料（仪表盘手动设置，唯一写入方是 `/api/app/project-profiles`） | 主键 `(user_id, project_key)`；`display_name`（1–60）、`repo_url`（https、≤500）、`repo_hidden bool`（隐藏检测到的仓库）、`logo_url`、`logo_object`（≤300，必须以 `<user_id>/projects/` 开头，存于公开 `avatars` 桶）；`created_at`、`updated_at` |

与旧结构的映射：`tokentracker_* → token_*` 一一对应，`device_machine` 折叠进
`token_devices.machine_cluster_id`，其余列语义不变——**upsert 键与 last-wins 语义逐字保留**。

成就与段位不建表：由 `token_usage_hourly` / `token_account_session_states` / `token_sessions` /
`token_sync_runs` / `token_devices` 读时计算，仅 `token_achievement_seen` 存已读水位。

### 3.1 Sessions 数据面

**Ingest（可选追加）**：`POST /api/functions/token-usage-ingest` 顶层 `sessions` 数组（≤200 条）。
条目字段：`session_id`（非空 ≤256，不含 `/`、`\` 与控制字符）、`source`（≤100；账户级来源
`cursor` / `trae-cn` 整条跳过并计入 `sessions_skipped`）、`started_at` / `ended_at`（ISO，
`ended_at >= started_at`）、`project_key`（可选，服务端取 basename、去控制字符、截断 120，
`.`/`..` 记为 null）、6 个 token 列、`billable_total_tokens`（可空）、`models`（≤32，
`[{model, 6 个 token 列}]`；同名模型合并求和；每条 `total_tokens` 必须等于四项之和，非空时
`sum(models.total_tokens) == total_tokens`）。

空数组不报错；旧 CLI 不传该字段行为不变；全局 1 MiB 请求体上限适用（超限 413，CLI 分批）；
请求内按 `(source, session_id)` 去重保留 `ended_at` 最大者。

Upsert 键 `(user_id, device_id, source, session_id)`；**last-wins 以 `ended_at` 严格大于现有值为准**，
旧快照或等值重放只计 skipped。迁移内提供原子 RPC `token_upsert_sessions`（`security invoker`，
`revoke all ... from public, anon, authenticated`，仅 `grant execute ... to service_role`），入参
`(p_user_id, p_device_id, p_sessions)`，返回 `{upserted, skipped}`。响应追加可选
`sessions_upserted` / `sessions_skipped`，既有字段不变。

**查询**：`GET /api/functions/token-usage-account-sessions`（由 `[...slug]` catch-all 承接）。
参数 `from` / `to`（ISO 瞬时，必填，窗口按 `ended_at` 落在 `[from, to)`，≤1095 天）、`device_id`、
`source`、`q`（项目标签大小写不敏感子串，通配符转义）、`limit`（1–200，默认 50）、`offset`。
响应含 `totals`（筛选全集）、`facets`（来源与设备的筛选下拉，剔除吊销设备与账户级来源）、
`sessions` 列表（按 `ended_at` 倒序，`models[].share` 为 0–1 四位小数）；所有 `total_cost_usd`
为 6 位小数字符串，读取时按定价引擎逐模型计算求和；`duration_ms = ended_at - started_at`。
跨窗口长会话按结束时间归属单一窗口，不按天切分。

**隐私**：服务端只持久化白名单字段（未知字段忽略）；不存 prompt、正文、标题、绝对路径、resume
command。迁移文件 `supabase/migrations/20261025000000_token_sessions.sql`。

## 4. 依赖预算

新依赖装前必须经操作者批准，批准后同步修订本节。统一选当前**最流行、最新的稳定版本**，lockfile
锁定；UI 一律 HeroUI 内置优先。

**`apps/web` 运行时**：`@supabase/supabase-js`、`@supabase/ssr`、`@gravity-ui/icons`、`recharts`、
`intl-messageformat`、`@number-flow/react`、`@internationalized/date`、`motion`、`zustand`、
`react-easy-crop`。`html-to-image` 只占预算位、**当前未安装**（分享卡用 Canvas 2D）。

- 图表 recharts；动效优先 CSS，`motion` 用于硬币翻面等纯 CSS 无法表达的物理动效（入场旋转、
  惯性甩动、reduced-motion 分级）。
- 货币换算用内置汇率表（USD/EUR/GBP/CNY/JPY/HKD，USD 基准）加可选 `TOKEN_USAGE_FX_RATES`
  覆盖；不调用外部汇率 API。数字格式统一 `Intl.NumberFormat` 走 format provider，不装格式化库。
- 仓库根 `devDependencies` 的 `jpeg-js` / `pngjs` 只供离线资产生成脚本，不进 web 依赖图。

**`packages/cli`**：`@journeyapps/wa-sqlite`、`smol-toml`、`undici`、`yauzl`（`engines.node >= 22.19`，
zstd 用 Node 内置）。

**`apps/landing`**：web 依赖集的子集镜像，零新依赖名；不引 `next-themes`（暗色写死）、`motion`
（动效全 CSS）、`recharts`（趋势为手绘 SVG）。

**`apps/desktop`**：web 子集（`react` / `react-dom` / `@heroui/react` / `@heroui/styles` /
`@gravity-ui/icons` / `clsx` / `recharts` / `@number-flow/react`）+ `@tauri-apps/api` 与
`@tauri-apps/plugin-notification` / `@tauri-apps/plugin-autostart`；devDeps 增
`vite` / `@vitejs/plugin-react` / `@tauri-apps/cli`。Rust crate（`tauri` 2、`tauri-build`、
`tauri-plugin-*`）走 cargo，不进 pnpm lockfile。

## 5. 环境变量

新 key 体系（`sb_publishable_*` / `sb_secret_*`，非 JWT）；旧 `anon` / `service_role` JWT 名可作
回退兼容。`NEXT_PUBLIC_` 前缀只给浏览器端 `@supabase/ssr` 需要的 URL 与 publishable key；
secret key 无前缀、绝不进浏览器包。

| 变量 | 用途 |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 项目地址（回退 `SUPABASE_URL`） |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | publishable key：认证客户端 + public-config 下发（回退 `SUPABASE_ANON_KEY`） |
| `SUPABASE_SECRET_KEY` | secret key：route.ts 数据访问，绕过 RLS（回退 `SUPABASE_SERVICE_ROLE_KEY`） |
| `TOKEN_USAGE_DASHBOARD_URL` | 配对回调地址校验（`verification_uri`）；也是 canonical / Open Graph 的 metadataBase |
| `TOKEN_USAGE_SITE_NAME`（可选） | 页签标题后缀（`<page> - <name>`）与 Apple Web App 标题，默认 `TokenUsage` |
| `NEXT_PUBLIC_PROJECTS_CALIBER`（可选） | `/projects` 口径：`hourly` = 桶口径，缺省 = sessions 口径；构建期内联 |
| `NEXT_PUBLIC_BEIAN_ICP` / `NEXT_PUBLIC_BEIAN_POLICE`（可选） | `/login` 页脚备案号；空/缺省不渲染，构建期内联 |
| `TOKEN_USAGE_FX_RATES`（可选） | 汇率覆盖 JSON，根布局解析后注入 format provider；失败回退内置快照 |

契约冻结：public-config 响应字段名 `supabase_anon_key` 不变（CLI 面冻结），其值取 publishable key。

## 6. 风险与对冲

| 风险 | 对冲 |
| --- | --- |
| UI 范围失控 | 功能清单以需求文档为准封闭；新想法记 backlog |
| 依赖蔓延 | §4 预算制，装前报批 |
| Sessions 隐私与载荷 | `session_id` 拒绝路径分隔符；`project_key` 仅 basename；只持久化白名单字段；200 条 / 32 模型上限与 1 MiB 体积上限；golden 测试断言响应与表内无 prompt、正文、标题、绝对路径、resume command |
| Sessions 成本口径 | 成本读取时按定价引擎逐模型计算；未定价模型计 0，页面脚注说明；不存 provider 上报成本 |
| 外观偏好 hydration / 闪烁 | 语言走 cookie + `Accept-Language`，SSR 首帧即正确；主题走注入脚本；其余偏好挂载后读 localStorage；数字用 `tabular-nums` |
| 汇率过期 | 内置快照带 `as_of`，UI 标注「参考汇率」；可用 `TOKEN_USAGE_FX_RATES` 覆盖；汇率失败不阻塞页面 |
| 数字格式漂移 | 所有页面只经统一 format provider；组件内禁止散落 `toFixed` / `Intl.NumberFormat`；单测覆盖 K/M/B、万/亿、3/4 位分组、0、负数、null 与进位边界 |

## 7. 当前状态与待办

**已交付**：v1 里程碑 M0–M7（契约层、认证与设置、仪表盘、wrapped / 分享 / 服务状态、配对页与
部署文档、上游 Dashboard 核心与外观设置、Sessions、采集端、数据迁移与切换、成就系统）、官方落地页
`apps/landing`、桌面端 `apps/desktop`。生产实例 `token-usage.baiwumm.com` 承载多台采集机。

版本号不写死：CLI 看 `packages/cli/CHANGELOG.md`，桌面端看 `apps/desktop/CHANGELOG.md`。

**待办与待决策**：

1. **macOS / Linux 调度真机验证**：目前只有产物级测试（plist / systemd unit 与文案断言）。
   首次真机 `init` 后确认 `launchctl list` / `systemctl --user list-timers` 有条目。
2. **队列按月分片**：`queue/<month>.jsonl` 可控制 `queue.jsonl` 增长与读取成本；触及对账基线
   文件格式（AGENTS 约束 8），待「队列体积或读取延迟有明显体感」再立项。
3. **keyset 分页 / 预聚合**：暂不立项，触发条件同上。
4. **curated 价目补全**：按 `doctor` 报出的未定价模型按需补，不设人为目标数。
5. **Cursor 厂商真实成本**：近 30 天用量为 0，恢复使用后再评估（机制见
   `docs/sources-capture-audit.md`）。
6. **`deep_thinker` 成就**：reasoning 覆盖率低于 50% 门槛，阈值草案保留在
   `docs/achievements-plan.md` §2.3，覆盖率提升后复议。
7. **`docs.` 子域与 demo 实例**：官方站可选后续项，未立项。
