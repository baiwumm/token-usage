# Token Usage 重写计划（v1）

TokenTrackerSelfhost（Vite + React SPA + Vercel Functions）的下一代重写：**Next.js + HeroUI + Supabase** 全栈单应用，开源、可自部署。本文是唯一的执行计划；方向决策全部经过访谈定稿（2026-10-23），改动需回访更新本文。

## 1. 已定决策（访谈结论）

> 本表是 2026-10-23 访谈的定稿记录。活需求以 `docs/requirements.md` 为真源；
> 两者不一致时以 requirements.md 为准，并回改本表。

| # | 决策点 | 结论 |
|---|--------|------|
| 1 | 功能基线 | 严格对齐旧系统**活功能**：仪表盘+分享卡片、设置（设备管理/吊销）、wrapped、服务状态、`/device` 配对、全套 CLI API。排行榜/成就/pet/quota//selfhost 降级页**不做**。2026-10-24 路由二次修订：仪表盘挂 `/`（需登录），`/dashboard` 取消；产品落地页迁出本应用，使用 token-usage.cc 独立建站；除登录链路外所有页面未登录跳登录（见 requirements 路由约定） |
| 2 | 许可证 | MIT，保留 "Contains code derived from TokenTracker by xiufengsun (MIT)" |
| 3 | CLI 策略 | 2026-10-23 翻案：fork 上游 CLI（MIT）改造为 **`tokenusage-cli`**——解析器继承上游并跟进 cherry-pick；`sync` 手动为主，`--watch` / `install-task` 可选自动档；自有客户端后契约冻结语义转为「CLI 版本 ↔ 服务端版本配对演进」，旧路径别名降级为过渡品 |
| 4 | 品牌 | 仓库 `token-usage`，UI 显示 **Token Usage** |
| 5 | 认证 | `@supabase/ssr` cookie 会话；仅邮箱密码 + 邮件魔法链接；公开注册关闭、管理员建号制；`token_allowed_emails` 白名单表作为可选迁移供部署者启用自助注册 |
| 6 | 数据访问 | route.ts 内 `@supabase/supabase-js` 服务端客户端 + service-role |
| 7 | RLS 姿态 | 应用表对 `anon`/`authenticated` **全拒**；浏览器零直连 Supabase；所有环境变量 server-only |
| 8 | 表结构 | 保守规范化 + `token_` 前缀：保留桶语义（last-wins upsert 键），表名列名规范化 |
| 9 | 切换拓扑 | 2026-10-23 修订：新系统部署于 `token-usage.baiwumm.com`；旧域名 `tokentracker.baiwumm.com` 保留运行旧系统，互不冲突；采集机迁移 = 逐台把 base URL 指向新域名 |
| 10 | 环境策略 | 2026-10-23 修订：**新建独立 Supabase 项目**承载新系统（与旧系统项目物理分离，free 档两个活跃项目恰好各占一个）；开发期在新项目用测试专用用户/设备，切换前清理测试数据再导入真实数据 |
| 11 | i18n | v1 中英双语，重建轻量 copy 管线，架构留扩展点（2026-10-25 复核：维持轻量——locale 存 cookie + 根布局 SSR、`<html lang>` 同步；带数字/复数的文案用 `intl-messageformat`，不引入 i18n 框架） |
| 12 | 文档 | 中文为主，代码注释英文 |
| 13 | 视觉 | 功能对齐 + 视觉简化：HeroUI 重做到整洁可用；GSAP/Three 不移植；动画优先 CSS，确有必要时可用 **motion**（`motion/react`，2026-10-24 操作者批准，按需安装）。图表实现 2026-10-24 修订（操作者指令）：**recharts**，不再手写 SVG |
| 14 | 里程碑 | 契约层先行（M1 先把 CLI 兼容层做绿） |
| 15 | 旧系统 | 重写期间冻结新功能，只修 bug 和运维问题 |
| 16 | 退役 | 生产接管后 14 天观察期 → 备份 → 退役旧 Supabase 项目（新旧项目独立，无共用表，整项目暂停/删除）；旧仓库 Archive（不删除，届时单独确认） |
| 17 | 契约分档 | 2026-10-23 评审增补：两档制——CLI 面（7 端点）硬冻结；Dashboard 面（account-*×7 + dashboard）可演进、消费者仅新 UI，v1 复用现有形状，变更回写契约并同步 golden 测试与前端 |
| 18 | 分支与门禁 | 直推 main；本地 `pnpm verify` + GitHub Actions CI 兜底（test 自 M1 接入）；`.vscode/` 入库 |
| 19 | 官方域名 | 2026-10-24 注册 **token-usage.cc**（腾讯云，.cc 可备案）——开源项目官方站：落地页、文档（`docs.` 子域）、可选 demo 实例；操作者自部署实例仍为 `token-usage.baiwumm.com`，与官方站相互独立。命名注意：tokenusage.org 为同类 Rust 工具，无横杠的 tokenusage 域名/品牌一律避开 |
| 20 | 官方基础功能 | 2026-10-25 操作者指令：先按官方 TokenTracker 的基础功能对齐——**A. Dashboard 核心 + 外观设置**，**B. Sessions**。不做官方全量复刻；Limits / Skills / Cloud / Leaderboard / Achievements / Pet / Widgets / IP check 仍排除（见 requirements「边界」） |
| 21 | Dashboard A | 官方 Dashboard 的信息架构（rolling stats、Top 模型、趋势、热力图、模型/来源/设备、日/时/月明细、成本分析）全部复用现有 Dashboard 面契约；不新增表/端点，不改 CLI；HeroUI 重做，图表继续 recharts |
| 22 | Sessions B | 设备级会话明细：新增 `token_sessions`（`models` JSONB）、ingest 可选 `sessions` 数组、`account-sessions` series；只收用量元数据（source/session_id/时间/项目标签/token/模型），不收 prompt/正文/绝对路径/resume command/标题；成本读取时算；账户级来源（cursor/trae-cn）不进 Sessions v1；旧 CLI 不传 sessions 时行为不变 |
| 23 | 外观设置 | 2026-10-25 操作者指令：设置增加「外观」分区——主题（浅/深/系统）、语言（系统/中文/English）、货币、Token 显示（紧凑/完整）、数字单位（K/M/B 或 万/亿）、数字分组（3/4 位）。语言 preference 存 cookie（支持 `system`，由 Accept-Language 解析）；其余显示偏好存 localStorage；货币用内置汇率表 + `TOKEN_USAGE_FX_RATES` 可选覆盖，不引入外部汇率 API 或新依赖 |
| 24 | UI 取舍 | 官方 UI 仅作信息架构参考，不复制其 Tailwind/base-ui 样式；一律 HeroUI 内置/复合组件 + 现有主题 token，数字格式走统一 provider，货币换算只改显示不改存储 |

## 2. 目标架构

```
采集机（tokenusage-cli，fork 自上游；手动 sync 为主）
   │  Bearer 设备令牌（配对走 /device 批准）
   ▼
浏览器（React 19 / HeroUI 3 / App Router，apps/web）
   │  cookie 会话（@supabase/ssr）
   ▼
Next.js route.ts（server-only，service-role key）
   ├── /api/functions/token-usage-*  ← CLI 契约层（行为冻结；
   │                                    旧 tokentracker-* 路径经 rewrites 永久别名）
   └── /api/app/*                    ← 新增的仪表盘内部接口（自由演进）
   ▼
Supabase Postgres（token_* 新表，RLS 全拒客户端角色）
```

要点：

- **仓库布局**：pnpm workspace —— `apps/web`（本图除采集机外的全部）、预留 `apps/desktop`
  （桌面端托盘，backlog）与 `packages/*`（共享代码 / CLI 包）。
- **CLI 契约层与内部接口分离**：`/api/functions/token-usage-*` 逐字冻结（`docs/cli-contract.md`），仪表盘自己的数据需求走 `/api/app/*` 新路径，二者不得互相污染——内部接口改动永不触碰契约层。钉版 CLI 1.4.x 请求的旧 `tokentracker-*` 路径由 `next.config.mjs` rewrites 永久别名，行为逐字一致；自有 `tokenusage-cli` 全量替代后别名可退役。
- **自部署实例天然隔离**：CLI 与某个实例一一配对（base URL + 该实例签发的设备令牌），
  `sync` 只上传到配对实例；实例的 route.ts 用它自己环境里的 service-role 写入它自己的
  Supabase。数据跨实例零共享，自部署者无需任何额外配置。
- 账户级来源（cursor / trae-cn）的去重与会话状态聚合、读取时定价引擎（vendored LiteLLM 快照 + curated 覆盖）从旧仓库 `api/_lib/` 移植，作为**纯函数模块**保留并被两层共用。
- Vercel Hobby 12 函数上限：`account-[series]` 一个动态路由覆盖 7 个 series（2026-10-25 追加 `sessions`），总计仍为 10 个 route handler，余量 2。
- 数据访问（2026-10-24 修订，操作者指令）：route.ts 经 **@supabase/supabase-js**（secret key 客户端）访问 PostgREST；封装层保持异常式错误语义（唯一约束 → 409，其余 → 500），与 CLI 契约 §1.3 对齐。

## 3. 新表结构（M1 定稿成 migration；`token_sessions` 于 M5.6 追加）

所有表 `enable row level security`，且对 `anon, authenticated` **无任何 policy**（全拒）；`service_role` 全量授权。迁移文件放在 `supabase/migrations/`，幂等（`if not exists`），部署者可 `supabase db push` 一键建库。

| 表 | 说明 | 关键列 / 约束 |
|---|------|--------------|
| `token_devices` | 每用户多设备，软吊销 | `id uuid pk`, `user_id → auth.users`, `device_name`, `platform`, `machine_id`, `machine_cluster_id`（由旧 `tokentracker_device_machine` 1:1 表折叠为列）, `name_customized bool`, `default_device_name`, `revoked_at`, `created_at`, `updated_at`；部分唯一索引：活跃设备 `(user_id, machine_id)` 与 `(user_id, platform, device_name)` |
| `token_device_tokens` | 设备令牌，只存哈希 | `token_hash unique`, `user_id`, `device_id → token_devices`, `revoked_at`, `last_used_at` |
| `token_device_codes` | CLI 配对码 | `device_code pk(64hex)`, `user_code unique(XXXX-XXXX)`, `status check in (pending/approved/used/expired)`, `user_id`, `expires_at`, `client_info`, `machine_id`, `approved_at` |
| `token_usage_hourly` | 机器级小时桶（旧 tokentracker_hourly） | 主键 `(user_id, device_id, hour_start, source, model)`；6 个 token 列非负 check；`billable_total_tokens` 可空非负；`conversations ≥0`；`total_cost_usd ≥0`（CLI 上报恒 0，成本读取时算） |
| `token_account_session_states` | trae-cn 规范会话 | 主键 `(user_id, source, session_id)`；`total = input+cached+cache_creation+output` check |
| `token_sessions` | 设备级会话明细（Sessions 页，B 阶段） | `id uuid pk`, `user_id`, `device_id → token_devices`, `source`（check 1–100）, `session_id`（check 1–256）, `project_key`（可空，check ≤120，basename），`started_at`, `ended_at`, 6 个 token 列（非负 check）+ `billable_total_tokens`（可空、非负），`models jsonb not null default '[]'`（`[{model, 6 个 token 列}]`，数组 ≤32），`created_at`, `updated_at`；唯一 `(user_id, device_id, source, session_id)`；check `ended_at >= started_at`；check `total_tokens = input_tokens + cached_input_tokens + cache_creation_input_tokens + output_tokens`（reasoning 单列，不计入 total）；check `jsonb_typeof(models) = 'array' and jsonb_array_length(models) <= 32`；check `lower(source) not in ('cursor','trae-cn')`；索引 `(user_id, ended_at desc)` / `(user_id, device_id, ended_at desc)` / `(user_id, source, ended_at desc)` / `(user_id, project_key)` |
| `token_allowed_emails` | 可选：自助注册白名单 | `email citext unique`, `added_by`, `created_at`；配套触发器迁移（单独文件，注释标明 optional） |

与旧结构的映射（迁移用）：`tokentracker_* → token_*` 一一对应，`device_machine` 折叠进 `token_devices.machine_cluster_id`，其余列语义不变——**upsert 键与 last-wins 语义逐字保留**。

### 3.1 Sessions 设计（2026-10-25 草案，B 阶段落地）

**Ingest（可选追加）**：`POST /api/functions/token-usage-ingest` 顶层增加 `sessions` 数组
（≤200 条）。条目字段：`session_id`（非空 ≤256，不含 `/` `\` 与控制字符）、`source`（≤100；
账户级来源 `cursor` / `trae-cn` **整条跳过**，不落库、计入 `sessions_skipped`）、
`started_at` / `ended_at`（ISO，`ended_at >= started_at`）、`project_key`（可选，服务端去掉
尾部路径分隔符后取 basename、去控制字符并截断 120，`.`/`..` 记为 null）、6 个 token 列、
`billable_total_tokens`（可空）、`models`（可选数组 ≤32，`[{model, 6 个 token 列}]`；模型名
重复时合并求和；服务端校验每条 `total_tokens` 等于四项之和（不静默重算），非空时
`sum(models.total_tokens) == total_tokens`）。
空数组不报错；旧 CLI 不传该字段时行为逐字不变；全局 1 MiB 请求体上限仍适用，超体积按
413 拒绝，CLI 需分批。请求内按 `(source, session_id)` 去重，保留 `ended_at` 最大的一条。
Upsert 键 `(user_id, device_id, source, session_id)`；
**last-wins 以 `ended_at` 严格大于现有值为准**，旧快照或等值重放只计 skipped，不得覆盖
新快照；迁移内提供原子 RPC `token_upsert_sessions` 实现条件 upsert（避免读改写竞态）。
该函数 `security invoker`，`revoke all ... from public, anon, authenticated`，仅
`grant execute ... to service_role`。RPC 入参 `(p_user_id uuid, p_device_id uuid,
p_sessions jsonb)`，逐条 `insert ... on conflict (user_id, device_id, source, session_id)
do update ... where excluded.ended_at > token_sessions.ended_at`（更新时刷新 `updated_at`），
返回 `{upserted, skipped}`。响应追加可选 `sessions_upserted` / `sessions_skipped`（请求内
去重丢弃 + 账户级来源 + 旧/等值快照），既有字段不变。

**查询**：`GET /api/functions/token-usage-account-sessions`（继续由 `[...slug]` catch-all
承接，不新增 route handler）。参数：`from` / `to`（ISO 瞬时，必填，窗口按 `ended_at` 落在
`[from, to)`，窗口 ≤1095 天）、`device_id`、`source`、`q`（项目标签大小写不敏感子串，
通配符转义）、`limit`（1–200，默认 50）、`offset`。响应：
`{from,to,total,limit,offset,totals:{sessions,total_tokens,billable_total_tokens,total_cost_usd,duration_ms},facets:{sources:[{source,sessions}],devices:[{device_id,device_name,sessions}]},sessions:[
{device_id,device_name,session_id,source,project_key,started_at,ended_at,duration_ms,
input_tokens,cached_input_tokens,cache_creation_input_tokens,output_tokens,
reasoning_output_tokens,total_tokens,billable_total_tokens,total_cost_usd,
models:[{model,total_tokens,total_cost_usd,share}]}]}`；
按 `ended_at` 倒序（同刻按 `source`、`session_id` 升序）；所有层级的 `total_cost_usd` 均为
6 位小数字符串，读取时按定价引擎逐模型计算后求和；`duration_ms = ended_at - started_at`
（毫秒整数）；`models[].share` 为 0–1、4 位小数；`totals` 是筛选全集而不是当前页；
`billable_total_tokens` 为 null 时聚合按 `total_tokens` 计入。`facets` 供筛选下拉，剔除
吊销设备与账户级来源，不受分页影响。吊销设备的会话不进入账户聚合，行保留在库；账户级
来源永不出现在此序列。跨窗口长会话按结束时间归属单一窗口，不做按天切分（v1 无会话内桶）。

**隐私**：服务端只持久化白名单字段（未知字段忽略）；`project_key` 只保留 basename；
`session_id` 拒绝路径分隔符；不存 prompt、正文、标题、绝对路径、resume command。
迁移文件：`supabase/migrations/20261025000000_token_sessions.sql`。

**依赖**：B 阶段的真实数据依赖 M-CLI 上报 `sessions`；服务端与 UI 先用 fixture 打通，M-CLI
未上线前 Sessions 页面必须显示「等待新版采集器」空态，不能伪造或从小时桶推导会话。

## 4. 依赖预算（新依赖装前必须经操作者批准）

运行时：`@supabase/supabase-js`、`@supabase/ssr`、`@gravity-ui/icons`（HeroUI v3 官方示例同款）、`date-fns`、`html-to-image`（分享卡片导出）、`recharts`（2026-10-24 经操作者批准加入，替代原“图表手写 SVG”决策）、`motion`（`motion/react`，2026-10-24 经操作者批准，动效确有必要时安装）、`intl-messageformat`（2026-10-25 经操作者批准启用，ICU 复数/插值；此前已在依赖中但未使用）。动画优先 CSS（零依赖）；除此之外一律先问；任何新依赖统一选用当前**最流行、最新的稳定版本**（lockfile 锁定）。UI 一律 HeroUI 内置组件优先（项目 Skill `heroui-react` 为准），内置覆盖不了才自研。

2026-10-25 增量：A / B / 外观设置不新增依赖。2026-10-25 第二轮增量（操作者指令隐含批准）：`zustand`（v5，显示偏好持久化——外观/格式偏好的 localStorage 读写统一收编为 zustand persist store）、`react-easy-crop`（v6，与 better-admin 头像裁剪方案一致，设置-头像裁剪上传用）。货币换算用内置汇率表（USD/EUR/GBP/
CNY/JPY/HKD，`as_of` 2026-10-25，USD 基准；具体数值为实现常量）+ 可选
`TOKEN_USAGE_FX_RATES` JSON 覆盖；不从浏览器或服务端调用外部汇率 API（隐私与离线可用
优先）。数字格式统一用 `Intl.NumberFormat`，不安装格式化库。

2026-10-26 增量（操作者指令"仪表盘自定义日期换官方 DateRangePicker 用法"隐含批准）：
`@internationalized/date`（3.12.4）——HeroUI `DateRangePicker` 受控值 / `parseDate` 的官方
配套库，本就是 `@heroui/react` 自身依赖（lockfile 既有、零新增下载），仅提升为
`apps/web` 直接依赖并 pin 到已解析版本；仅用于日键（`YYYY-MM-DD`）与 `CalendarDate`
互转，时区运算仍走 `lib/dashboard/ranges` 的 Intl 实现，不引入 date-fns。

## 5. 里程碑（契约层先行）

| 里程碑 | 内容 | 验收线 |
|--------|------|--------|
| **M0 脚手架清理**（已完成 2026-10-23；CI 随 M1 首次推送验证） | 删 HeroUI 模板演示页；package.json / 品牌文案改为 Token Usage；LICENSE 衍生声明；AGENTS.md；pnpm workspace（`apps/web`）+ src 目录结构；Maple Mono 字体；`.github/workflows/ci.yml`（typecheck + lint + build，test 自 M1 接入） | CI 绿；`apps/web/src` 无模板残留 |
| **M1 契约层**（已完成 2026-10-24，实跑验收全绿） | `token_*` 表 migration（§3 全部实体表 + 可选 `token_allowed_emails`，RLS 零 policy，幂等可 `supabase db push`）；10 个 route handler（六个 series 由 `api/functions/[...slug]` catch-all 承接，M5.6 追加 `sessions` 后为七个，见 `docs/cli-contract.md` §2.7）+ 旧路径别名 rewrites + proxy（OPTIONS 204 / 非 GET·POST 405）；数据访问经 `@supabase/supabase-js`（新 key 体系 env，§9）；移植 `api/_lib`（去重/聚合/定价为纯函数模块）；契约 golden 测试锁定 `docs/cli-contract.md` 第 3 节全部不变量（含服务器级别名等价）+ 单元测试 216 个；移植 seed-queue / verify-two-device / verify-cross-device 对账脚本并新增 accept-m1 实跑验收工具 | **verify 全绿**（lint + tsc + 216 测试 + build）；**实跑验收全绿**（accept-m1：真实项目建库 → 设备流 ×3 → 去重/聚合/定价/吊销语义 → 本机 queue.jsonl last-wins 6,479,004,696 == 新表设备过滤聚合，combined == fixture + queue 总数，重复种子幂等，测试数据零残留）；golden 测试覆盖每端点成功/错误路径与旧别名逐字等价 |
| **M2 认证与设置** | @supabase/ssr middleware、登录（密码+魔法链接）、`/auth/callback`、邀请建号流程文档、设置页（改名/设备列表/吊销/登出）；管理员建号用 service-role 脚本 | 登录闭环可演示；吊销设备后其令牌立即 401（契约测试覆盖） |
| **M2 认证与设置**（已完成 2026-10-24，操作者验收通过——含魔法链接真实点击验证） | @supabase/ssr middleware、登录（密码+魔法链接）、`/auth/callback`、邀请建号流程文档、设置页（改名/设备列表/吊销/登出）；管理员建号用 service-role 脚本；路由守卫（2026-10-24 需求变更：未登录跳登录并回跳原目标；原 `/` 公开落地页经二次修订迁至 token-usage.cc 独立建站，`/` 归还仪表盘，见 requirements 路由约定） | 登录闭环可演示；吊销设备后其令牌立即 401（契约测试覆盖）；未登录访问受保护页跳登录、登录后回跳（`?user_code=` 不丢失） |
| **M3 仪表盘核心**（已完成 2026-10-24，操作者验收通过；对账=种子期望==契约端点==表级真值三方一致，与旧仪表盘的跨项目对账随 M6 演练） | 主仪表盘（`/`）：汇总卡、日/时图表（recharts）、活跃热力图、模型/来源/设备下钻、时间范围与时区切换；数据由 UI 直连冻结 Dashboard 面契约端点（§2.10/§2.7）——`/api/app/dashboard` 内部接口暂不需要（无真实缺口，出现时再建并回写本行） | 数据与旧仪表盘同源对账一致（同一账号同窗口数值相等） |
| **M4 wrapped + 分享 + 服务状态**（已完成 2026-10-24，操作者验收通过；含应用壳导航与语言切换补充、分享卡片 Canvas 方案偏差） | wrapped 年度回顾（简化视觉：年度大数、月度趋势、亮点、模型用量、年份切换）、分享卡片（**Canvas 2D 绘制导出 PNG**——html-to-image 在本页 Tailwind4/oklch 计算样式下 toPng 无论字体开关/像素比均挂起（img.onload 不落定），如实记录该偏差；`html-to-image` 保留 §4 预算位、当前未安装）、服务状态页（public-config / dashboard / account-devices 探活 + 延迟 + 项目与会话状态展示）；应用壳：lg+ 固定全高侧边栏（fixed inset-y-0）、<lg 抽屉、壳内置中英切换（useLocale 共享 store） | 三页可用，中英 copy 齐全 |
| **M5 配对页 + 部署文档**（开发完成 2026-10-24，操作者待验收；页面批准→approved 已实测，"全新账号从零跑通"的完整演练随真实 Vercel 部署由操作者执行） | `/device` 配对/批准页（?user_code= 确认批准 + 手动输入 + 错误三态，调冻结 device-flow-grant）；中文部署指南（`docs/deploy-guide.md`：Supabase 建库 → Auth 配置 → Vercel → 建号 → 配对 → 闭环 + FAQ）、`apps/web/.env.example`、README Deploy to Vercel 按钮 + 英文摘要；本地验收提示：device-flow-authorize 需服务端配置 `TOKEN_USAGE_DASHBOARD_URL` | 全新 Supabase/Vercel 账号按文档从零跑通：建库 → 部署 → CLI 配对 → 上报 → 仪表盘可见 |
| **M5.5 Dashboard 官方核心（A）+ 外观设置**（已完成 2026-10-25，操作者验收通过；二轮 UI 调整同日完成：总 Tokens 头卡、近一年热力图 + 平台筛选（契约 cell 新增可选 `sources` 字段）、卡片级模糊遮罩 Loading、分享卡（canvas Broadsheet）、`@number-flow/react` 数字过渡、卡片标题层级、Tooltip/Popover 箭头、Select 新 API、charts 色板接 `--color-chart-*`） | 仪表盘对齐官方基础信息架构：KPI（总量/计费量/成本/会话/活跃天）+ rolling 7d/30d/日均（复用 `account-summary`）、Top 模型、日/月趋势、活跃热力图、来源/设备（复用现有 Dashboard 面端点）、日/时/月明细表（排序/分页）、成本分析 Modal、统一筛选（范围/时区/设备）；设置新增外观分区：主题/语言/货币/Token 显示/单位/分组；新增统一格式 provider（`Intl.NumberFormat` + 内置汇率表）并替换现有零散格式化；不新增表、端点、CLI 改动、依赖 | 数值与 `dashboard` / `account-summary` / `daily` / `hourly` / `monthly` / `heatmap` / `model-breakdown` 对账一致，设备卡与 `dashboard.devices` 一致；桌面与 375px 无页面级横向滚动；三态齐全；外观偏好即时生效、刷新保留、`system` 语言 SSR 首帧正确；`pnpm verify` 全绿 |
| **M5.6 Sessions（B）**（已完成 2026-10-25；真实数据对账通过 2026-10-26——公司机 448 会话与本地 sidecar 全一致（依赖 M-CLI reasoning 折算修复）；`token_sessions` 迁移、ingest 可选 `sessions`、第七个 series、`/sessions` 页面 + 导航已上线） | `token_sessions` 迁移（RLS 零 policy + 原子 `token_upsert_sessions` RPC）；ingest 可选 `sessions`（≤200、`ended_at` 严格 last-wins、账户级来源跳过）；`account-sessions` 第七个 series（catch-all，不新增 route）；`/sessions` 列表/详情（筛选/分页/汇总/模型拆分）；应用壳导航加入 Sessions；只落用量元数据 | 契约 golden 测试覆盖校验/幂等/乱序快照/吊销/隐私；旧 CLI 请求与响应逐字不变；新 CLI 上报后列表与本地会话对账一致；无会话时显示「等待新版采集器」空态；375px 可用；`pnpm verify` 全绿 |
| **M-CLI 采集端**（真机迁移完成 2026-10-26：两台采集机切换、13.67B 历史重放、总量 20.94B 对账达标；sessions 真实数据对账一致 2026-10-26——zcode/opencode 行的 total 含 reasoning 而 output 不含，违反契约恒等式被映射器整行丢弃，修复为映射时按 `total = identity + reasoning` 精确形状折算进 output（fix(cli) 2026-10-26），公司机 448/448 会话全对上；npm 发布待操作者，包名重评见 §1#19） | fork 上游 CLI（MIT）改造为 `tokenusage-cli`（pnpm workspace 子包，二进制命令 `tokenusage`）：改名、指向新契约路径、`sync` 手动为主、`--watch` / `install-task` 可选自动档、剥离用不到的部分、`sessions` 元数据采集（session_id / source / 时间 / 项目 basename / token / 模型；不采集 prompt、正文、绝对路径、标题、resume command）、npm 发布；采集机迁移（装新 CLI → 配对 → 撤旧计划任务）。命名复查：tokenusage.org 为同类 Rust 工具（crates.io `tokenusage`），npm 发布前需重新评估包名与品牌（见 §1#19） | 任一台采集机 `npm i -g tokenusage-cli` 完成配对 + `tokenusage sync`，数值与该机 queue.jsonl 对账一致；`sessions` 与该机本地会话分析对账一致且无敏感字段；端到端契约测试全绿。**交付补充（2026-10-25）**：`packages/cli` skeleton + 契约重指向（delta.vercel.app / publishable key / `~/.tokenusage` 数据目录与旧 CLI 共存）+ sessions 增量上报（水位去重、恒等式自检、隐私白名单）+ payload golden 测试 14 项；serve/wrapped 本地面板剥除；`--watch` 常驻增量；npm 发布与真机对账留待操作者（见 `docs/launch-runbook.md` 新 CLI 迁移段） |
| **M6 数据迁移与切换** | 迁移演练（见 §6）→ 生产切换 → 观察期 → 退役 | 见 §7 闸门清单逐项打勾 |

工期参考：M1 约 2–4 天，M2–M4 各 2–5 天，M5 1–2 天，M5.5 约 2–4 天，M5.6 约 3–5 天（服务端 + UI，不含 M-CLI），M-CLI 约 1–2 天（fork 改造）+ 联调；全程 Agent 开发，每个里程碑结束由操作者验收后再进下一个。桌面端（backlog）待 CLI 与 Web 稳定后单独立项。

## 6. 数据迁移 runbook

新旧系统使用**两个独立的 Supabase 项目**：新系统落在新建项目（`token_*` 表），旧项目
原样运行旧系统直至退役。迁移因此是跨项目的变换 ETL——旧表 `tokentracker_*` 按 §3 映射
变换为新表 `token_*`，一次性脚本从旧项目 service key 读、向新项目 service key 写。
数据量小（万级行），风险在**顺序与闸门**而不在体量。Sessions 明细不在旧系统中，无需 ETL；
M5.6 上线后由新版 CLI 采集，旧 CLI 继续只报小时桶与 trae-cn 会话状态（不含 `sessions`）。

1. **演练（M6 之前可随时重跑）**：全量映射复制到新项目；用 verify 脚本对账（每台采集机
   queue.jsonl last-wins 总数 vs 新表聚合 vs 旧系统聚合三方一致）；测试用户端到端走一遍
   CLI 配对 + 上报；切换前清理开发期测试数据（测试用户/设备）。
2. **切换日（G1）**：真实数据迁移完成、水位对齐后，新系统在 `token-usage.baiwumm.com`
   上线；旧域名 `tokentracker.baiwumm.com` 原样继续运行旧系统（连着旧项目），两者互不干扰。
3. **迁移期（≥14 天）**：采集机逐台把 base URL 改为 `https://token-usage.baiwumm.com/api`
   （G1 放行后执行）；每台只写一个系统，单机真值 = 该机 `queue.jsonl`；已迁移采集机每日
   对账一次（新表 vs queue.jsonl）。
4. **退役**：全部采集机迁移完成后，旧系统进入只读冻结 → 手动全量备份（旧项目整库导出
   落盘，新项目已有重放副本）→ 确认无回滚需求 → 旧 Supabase 项目退役（G2：新旧项目独立，
   无共用表可删，动作是整项目暂停 → 删除；最终删除时点单独确认）→
   **旧仓库 Archive（不删除，届时单独向操作者确认）**。

回滚预案：任何一台采集机迁移后异常，把它的 base URL 改回旧域名即回到旧系统（旧项目
原封未动）；该机本地队列会补传断连窗口的数据。旧系统在退役闸门（G2）前始终在线，回滚
按台执行、无全局单点。

## 7. 三个不可逆闸门（每个都必须操作者手动放行）

| 闸门 | 危险 | 放行条件 |
|------|------|----------|
| G1 采集机切换（逐台改 base URL 到新域名）**（已完成 2026-10-26，两台采集机，旧系统零增量）** | 改错单台 = 该机断传（本地队列缓冲，改回即恢复） | M5 验收全绿 + 增量复制完成 + 操作者明确指令；M5.5/M5.6 可并行，不阻塞 G1 |
| G2 旧 Supabase 项目退役（整项目暂停 → 删除；新旧项目独立，无删表动作） | 唯一不可逆动作 | 14 天观察期满 + 旧项目备份落盘 + 对账连续一致 + 操作者明确指令 |
| G3 旧仓库处置 | 历史与运维脚本 | 建议 Archive；操作者最终确认；旧系统的 Windows 计划任务须全部停用（2026-10-26 已确认：Sync / Drift Check / Backup 均已 Disable） |

## 8. 风险清单

| 风险 | 对冲 |
|------|------|
| 契约字段凭印象移植 | 本文发布前逐端点核对过源码；golden 测试双保险 |
| 开发期测试数据混入新项目生产数据 | 测试专用用户/设备隔离标识；G1 切换前清理测试数据再导入真实数据；对账脚本只认真实用户 |
| UI 范围失控（重写经典死法） | 功能清单以旧系统活功能为准封闭；新想法记 backlog 不进 v1 |
| Vercel Hobby 函数超限 | 10 handler 固定配额，CI 里加函数计数检查；`account-sessions` 复用 catch-all，不新增函数 |
| 依赖蔓延 | §4 预算制，装前报批 |
| Sessions 真实数据依赖 M-CLI | 服务端与 UI 先用 fixture 打通契约；M-CLI 未上线前 `/sessions` 只显示「等待新版采集器」空态，不从小时桶推导或伪造会话；M5.6 验收拆成「契约/UI 绿」与「真实数据对账」两段 |
| Sessions 隐私与载荷 | `session_id` 拒绝路径分隔符；`project_key` 仅 basename；只持久化白名单字段；200 条/32 模型上限，且受全局 1 MiB 体积上限（超限 413，CLI 分批）；golden 测试断言响应与表中无 prompt、正文、标题、绝对路径、resume command |
| Sessions 成本口径 | 成本读取时按定价引擎逐模型计算；未定价模型计 0，页面脚注说明；不存 provider 上报成本（v1 决策）；若后续需要 provider 成本，按 §4 追加可选字段并回写契约 |
| 外观偏好 hydration / 闪烁 | 语言走 cookie + 服务端 `Accept-Language` 解析，SSR 首帧即正确；主题走 next-themes 注入脚本；货币/Token 显示/单位/分组在客户端挂载后读取 localStorage；数字用 `tabular-nums`，避免切换时布局跳动 |
| 汇率过期 | 内置汇率快照带 `as_of` 日期，UI 标注「参考汇率」；部署者可用 `TOKEN_USAGE_FX_RATES` JSON 覆盖；不调用外部汇率 API，不因汇率失败阻塞页面 |
| 数字格式漂移 | 所有页面只经统一 format provider；组件内禁止散落 `toFixed` / `Intl.NumberFormat`；单测覆盖 K/M/B、万/亿、3/4 位分组、0、负数、null 与进位边界 |

## 9. 环境变量（2026-10-24 修订：切换到 Supabase 新 API key 体系）

新 key 体系（`sb_publishable_*` / `sb_secret_*`，非 JWT）按官方推荐命名；旧
`anon`/`service_role` JWT 名仍作为代码内回退兼容（legacy keys 2026 年底废弃）。
`NEXT_PUBLIC_` 前缀仅用于 M2 浏览器端 `@supabase/ssr` 所需的 URL 与
publishable key；secret key 无前缀、绝不进浏览器包。

| 变量 | 用途 |
|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 项目地址（回退：`SUPABASE_URL`） |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | publishable key：M2 认证客户端 + public-config 端点下发（回退：`SUPABASE_ANON_KEY`） |
| `SUPABASE_SECRET_KEY` | secret key：route.ts 数据访问，绕过 RLS（回退：`SUPABASE_SERVICE_ROLE_KEY`）；绝不进浏览器包 |
| `TOKEN_USAGE_DASHBOARD_URL` | 配对回调地址校验（device-flow-authorize 返回的 verification_uri） |
| `TOKEN_USAGE_FX_RATES`（可选） | 外观设置的汇率覆盖，JSON `{"as_of":"YYYY-MM-DD","rates":{"CNY":6.6849,...}}`；服务端根布局解析后注入 format provider，缺省/解析失败/缺键回退内置快照并记日志；不含机密，但无需 `NEXT_PUBLIC_` |

契约冻结说明：public-config 响应字段名 `supabase_anon_key` 不变（CLI 面冻结），
其值从 publishable key 取——公开客户端值的语义不变。
