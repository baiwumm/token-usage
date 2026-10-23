# Token Usage 重写计划（v1）

TokenTrackerSelfhost（Vite + React SPA + Vercel Functions）的下一代重写：**Next.js + HeroUI + Supabase** 全栈单应用，开源、可自部署。本文是唯一的执行计划；方向决策全部经过访谈定稿（2026-10-23），改动需回访更新本文。

## 1. 已定决策（访谈结论）

> 本表是 2026-10-23 访谈的定稿记录。活需求以 `docs/requirements.md` 为真源；
> 两者不一致时以 requirements.md 为准，并回改本表。

| # | 决策点 | 结论 |
|---|--------|------|
| 1 | 功能基线 | 严格对齐旧系统**活功能**：仪表盘+分享卡片、设置（设备管理/吊销）、wrapped、服务状态、`/device` 配对、全套 CLI API。排行榜/成就/pet/quota//selfhost 降级页**不做**。2026-10-24 新增：`/` 产品落地页（公开访问），仪表盘挪至 `/dashboard`，其余页面未登录跳登录（见 requirements 路由约定） |
| 2 | 许可证 | MIT，保留 "Contains code derived from TokenTracker by xiufengsun (MIT)" |
| 3 | CLI 策略 | 2026-10-23 翻案：fork 上游 CLI（MIT）改造为 **`tokenusage-cli`**——解析器继承上游并跟进 cherry-pick；`sync` 手动为主，`--watch` / `install-task` 可选自动档；自有客户端后契约冻结语义转为「CLI 版本 ↔ 服务端版本配对演进」，旧路径别名降级为过渡品 |
| 4 | 品牌 | 仓库 `token-usage`，UI 显示 **Token Usage** |
| 5 | 认证 | `@supabase/ssr` cookie 会话；仅邮箱密码 + 邮件魔法链接；公开注册关闭、管理员建号制；`token_allowed_emails` 白名单表作为可选迁移供部署者启用自助注册 |
| 6 | 数据访问 | route.ts 内 `@supabase/supabase-js` 服务端客户端 + service-role |
| 7 | RLS 姿态 | 应用表对 `anon`/`authenticated` **全拒**；浏览器零直连 Supabase；所有环境变量 server-only |
| 8 | 表结构 | 保守规范化 + `token_` 前缀：保留桶语义（last-wins upsert 键），表名列名规范化 |
| 9 | 切换拓扑 | 2026-10-23 修订：新系统部署于 `token-usage.baiwumm.com`；旧域名 `tokentracker.baiwumm.com` 保留运行旧系统，互不冲突；采集机迁移 = 逐台把 base URL 指向新域名 |
| 10 | 环境策略 | 2026-10-23 修订：**新建独立 Supabase 项目**承载新系统（与旧系统项目物理分离，free 档两个活跃项目恰好各占一个）；开发期在新项目用测试专用用户/设备，切换前清理测试数据再导入真实数据 |
| 11 | i18n | v1 中英双语，重建轻量 copy 管线，架构留扩展点 |
| 12 | 文档 | 中文为主，代码注释英文 |
| 13 | 视觉 | 功能对齐 + 视觉简化：HeroUI 重做到整洁可用；GSAP/Three/motion 动效不移植，动画用 CSS。图表实现 2026-10-24 修订（操作者指令）：**recharts**，不再手写 SVG |
| 14 | 里程碑 | 契约层先行（M1 先把 CLI 兼容层做绿） |
| 15 | 旧系统 | 重写期间冻结新功能，只修 bug 和运维问题 |
| 16 | 退役 | 生产接管后 14 天观察期 → 备份 → 删旧表；旧仓库 Archive（不删除，届时单独确认） |
| 17 | 契约分档 | 2026-10-23 评审增补：两档制——CLI 面（7 端点）硬冻结；Dashboard 面（account-*×7 + dashboard）可演进、消费者仅新 UI，v1 复用现有形状，变更回写契约并同步 golden 测试与前端 |
| 18 | 分支与门禁 | 直推 main；本地 `pnpm verify` + GitHub Actions CI 兜底（test 自 M1 接入）；`.vscode/` 入库 |

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
- Vercel Hobby 12 函数上限：`account-[series]` 一个动态路由覆盖 6 个 series，总计 10 个 route handler，余量 2。
- 数据访问（2026-10-24 修订，操作者指令）：route.ts 经 **@supabase/supabase-js**（secret key 客户端）访问 PostgREST；封装层保持异常式错误语义（唯一约束 → 409，其余 → 500），与 CLI 契约 §1.3 对齐。

## 3. 新表结构（草案，M1 定稿成 migration）

所有表 `enable row level security`，且对 `anon, authenticated` **无任何 policy**（全拒）；`service_role` 全量授权。迁移文件放在 `supabase/migrations/`，幂等（`if not exists`），部署者可 `supabase db push` 一键建库。

| 表 | 说明 | 关键列 / 约束 |
|---|------|--------------|
| `token_devices` | 每用户多设备，软吊销 | `id uuid pk`, `user_id → auth.users`, `device_name`, `platform`, `machine_id`, `machine_cluster_id`（由旧 `tokentracker_device_machine` 1:1 表折叠为列）, `name_customized bool`, `default_device_name`, `revoked_at`, `created_at`, `updated_at`；部分唯一索引：活跃设备 `(user_id, machine_id)` 与 `(user_id, platform, device_name)` |
| `token_device_tokens` | 设备令牌，只存哈希 | `token_hash unique`, `user_id`, `device_id → token_devices`, `revoked_at`, `last_used_at` |
| `token_device_codes` | CLI 配对码 | `device_code pk(64hex)`, `user_code unique(XXXX-XXXX)`, `status check in (pending/approved/used/expired)`, `user_id`, `expires_at`, `client_info`, `machine_id`, `approved_at` |
| `token_usage_hourly` | 机器级小时桶（旧 tokentracker_hourly） | 主键 `(user_id, device_id, hour_start, source, model)`；6 个 token 列非负 check；`billable_total_tokens` 可空非负；`conversations ≥0`；`total_cost_usd ≥0`（CLI 上报恒 0，成本读取时算） |
| `token_account_session_states` | trae-cn 规范会话 | 主键 `(user_id, source, session_id)`；`total = input+cached+cache_creation+output` check |
| `token_allowed_emails` | 可选：自助注册白名单 | `email citext unique`, `added_by`, `created_at`；配套触发器迁移（单独文件，注释标明 optional） |

与旧结构的映射（迁移用）：`tokentracker_* → token_*` 一一对应，`device_machine` 折叠进 `token_devices.machine_cluster_id`，其余列语义不变——**upsert 键与 last-wins 语义逐字保留**。

## 4. 依赖预算（新依赖装前必须经操作者批准）

运行时：`@supabase/supabase-js`、`@supabase/ssr`、`@gravity-ui/icons`（HeroUI v3 官方示例同款）、`date-fns`、`html-to-image`（分享卡片导出）、`recharts`（2026-10-24 经操作者批准加入，替代原"图表手写 SVG"决策）。**动效零依赖**（CSS）。除此之外一律先问；任何新依赖统一选用当前**最流行、最新的稳定版本**（lockfile 锁定）。UI 一律 HeroUI 内置组件优先（项目 Skill `heroui-react` 为准），内置覆盖不了才自研。

## 5. 里程碑（契约层先行）

| 里程碑 | 内容 | 验收线 |
|--------|------|--------|
| **M0 脚手架清理**（已完成 2026-10-23；CI 随 M1 首次推送验证） | 删 HeroUI 模板演示页；package.json / 品牌文案改为 Token Usage；LICENSE 衍生声明；AGENTS.md；pnpm workspace（`apps/web`）+ src 目录结构；Maple Mono 字体；`.github/workflows/ci.yml`（typecheck + lint + build，test 自 M1 接入） | CI 绿；`apps/web/src` 无模板残留 |
| **M1 契约层**（已完成 2026-10-24，实跑验收全绿） | `token_*` 表 migration（§3 全部实体表 + 可选 `token_allowed_emails`，RLS 零 policy，幂等可 `supabase db push`）；10 个 route handler（六个 series 由 `api/functions/[...slug]` catch-all 承接，见 `docs/cli-contract.md` §2.7）+ 旧路径别名 rewrites + proxy（OPTIONS 204 / 非 GET·POST 405）；数据访问经 `@supabase/supabase-js`（新 key 体系 env，§9）；移植 `api/_lib`（去重/聚合/定价为纯函数模块）；契约 golden 测试锁定 `docs/cli-contract.md` 第 3 节全部不变量（含服务器级别名等价）+ 单元测试 216 个；移植 seed-queue / verify-two-device / verify-cross-device 对账脚本并新增 accept-m1 实跑验收工具 | **verify 全绿**（lint + tsc + 216 测试 + build）；**实跑验收全绿**（accept-m1：真实项目建库 → 设备流 ×3 → 去重/聚合/定价/吊销语义 → 本机 queue.jsonl last-wins 6,479,004,696 == 新表设备过滤聚合，combined == fixture + queue 总数，重复种子幂等，测试数据零残留）；golden 测试覆盖每端点成功/错误路径与旧别名逐字等价 |
| **M2 认证与设置** | @supabase/ssr middleware、登录（密码+魔法链接）、`/auth/callback`、邀请建号流程文档、设置页（改名/设备列表/吊销/登出）；管理员建号用 service-role 脚本 | 登录闭环可演示；吊销设备后其令牌立即 401（契约测试覆盖） |
| **M2 认证与设置** | @supabase/ssr middleware、登录（密码+魔法链接）、`/auth/callback`、邀请建号流程文档、设置页（改名/设备列表/吊销/登出）；管理员建号用 service-role 脚本；路由守卫 + 产品落地页（2026-10-24 需求变更：`/` 公开落地页，其余页面未登录跳登录并回跳原目标，见 requirements 路由约定） | 登录闭环可演示；吊销设备后其令牌立即 401（契约测试覆盖）；未登录访问受保护页跳登录、登录后回跳（`?user_code=` 不丢失） |
| **M3 仪表盘核心** | 主仪表盘（`/dashboard`）：汇总卡、日/时图表（recharts）、模型/来源/设备下钻、时间范围与时区切换；`/api/app/dashboard` 内部接口 | 数据与旧仪表盘同源对账一致（同一账号同窗口数值相等） |
| **M4 wrapped + 分享 + 服务状态** | 年度回顾（简化视觉）、分享卡片（html-to-image 导出）、服务状态页 | 三页可用，中英 copy 齐全 |
| **M5 配对页 + 部署文档** | `/device` 配对/批准页；中文部署指南（Supabase + Vercel 全流程）、`.env.example`、Deploy to Vercel 按钮；英文 README 摘要 | 全新 Supabase/Vercel 账号按文档从零跑通：建库 → 部署 → CLI 配对 → 上报 → 仪表盘可见 |
| **M-CLI 采集端（独立排期，M2 后可插）** | fork 上游 CLI（MIT）改造为 `tokenusage-cli`（pnpm workspace 子包，二进制命令 `tokenusage`）：改名、指向新契约路径、`sync` 手动为主、`--watch` / `install-task` 可选自动档、剥离用不到的部分、npm 发布；采集机迁移（装新 CLI → 配对 → 撤旧计划任务） | 任一台采集机 `npm i -g tokenusage-cli` 完成配对 + `tokenusage sync`，数值与该机 queue.jsonl 对账一致；端到端契约测试全绿 |
| **M6 数据迁移与切换** | 迁移演练（见 §6）→ 生产切换 → 观察期 → 退役 | 见 §7 闸门清单逐项打勾 |

工期参考：M1 约 2–4 天，M2–M4 各 2–5 天，M5 1–2 天，M-CLI 约 1–2 天（fork 改造）+ 联调；全程 Agent 开发，每个里程碑结束由操作者验收后再进下一个。桌面端（backlog）待 CLI 与 Web 稳定后单独立项。

## 6. 数据迁移 runbook

新旧系统使用**两个独立的 Supabase 项目**：新系统落在新建项目（`token_*` 表），旧项目
原样运行旧系统直至退役。迁移因此是跨项目的变换 ETL——旧表 `tokentracker_*` 按 §3 映射
变换为新表 `token_*`，一次性脚本从旧项目 service key 读、向新项目 service key 写。
数据量小（万级行），风险在**顺序与闸门**而不在体量。

1. **演练（M6 之前可随时重跑）**：全量映射复制到新项目；用 verify 脚本对账（每台采集机
   queue.jsonl last-wins 总数 vs 新表聚合 vs 旧系统聚合三方一致）；测试用户端到端走一遍
   CLI 配对 + 上报；切换前清理开发期测试数据（测试用户/设备）。
2. **切换日（G1）**：真实数据迁移完成、水位对齐后，新系统在 `token-usage.baiwumm.com`
   上线；旧域名 `tokentracker.baiwumm.com` 原样继续运行旧系统（连着旧项目），两者互不干扰。
3. **迁移期（≥14 天）**：采集机逐台把 base URL 改为 `https://token-usage.baiwumm.com/api`
   （G1 放行后执行）；每台只写一个系统，单机真值 = 该机 `queue.jsonl`；已迁移采集机每日
   对账一次（新表 vs queue.jsonl）。
4. **退役**：全部采集机迁移完成后，旧系统进入只读冻结 → 手动全量备份（新项目，指向
   `token_*` 表）→ 确认无回滚需求 → 删除旧项目旧表（G2；旧 Supabase 项目随之退役，最终
   处置届时单独确认）→ **旧仓库 Archive（不删除，届时单独向操作者确认）**。

回滚预案：任何一台采集机迁移后异常，把它的 base URL 改回旧域名即回到旧系统（旧项目
原封未动）；该机本地队列会补传断连窗口的数据。旧系统在退役闸门（G2）前始终在线，回滚
按台执行、无全局单点。

## 7. 三个不可逆闸门（每个都必须操作者手动放行）

| 闸门 | 危险 | 放行条件 |
|------|------|----------|
| G1 采集机切换（逐台改 base URL 到新域名） | 改错单台 = 该机断传（本地队列缓冲，改回即恢复） | M5 验收全绿 + 增量复制完成 + 操作者明确指令 |
| G2 删旧表 | 唯一不可逆动作 | 14 天观察期满 + 备份落盘 + 对账连续一致 + 操作者明确指令 |
| G3 旧仓库处置 | 历史与运维脚本 | 建议 Archive；操作者最终确认；删前确认 Windows 计划任务（备份/drift）已改指向新 checkout |

## 8. 风险清单

| 风险 | 对冲 |
|------|------|
| 契约字段凭印象移植 | 本文发布前逐端点核对过源码；golden 测试双保险 |
| 开发期测试数据混入新项目生产数据 | 测试专用用户/设备隔离标识；G1 切换前清理测试数据再导入真实数据；对账脚本只认真实用户 |
| UI 范围失控（重写经典死法） | 功能清单以旧系统活功能为准封闭；新想法记 backlog 不进 v1 |
| Vercel Hobby 函数超限 | 10 handler 固定配额，CI 里加函数计数检查 |
| 依赖蔓延 | §4 预算制，装前报批 |

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

契约冻结说明：public-config 响应字段名 `supabase_anon_key` 不变（CLI 面冻结），
其值从 publishable key 取——公开客户端值的语义不变。
