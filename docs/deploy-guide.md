# 部署指南（Supabase + Vercel 从零跑通）

面向全新账号的自部署全流程：**建库 → 部署 → 建号 → 配对 CLI → 仪表盘可见**。
免费档（Supabase Free + Vercel Hobby）即可完成。全程约 20–30 分钟。

> 部署与回滚的运维视角（升级顺序、冒烟清单、回滚）见
> [`docs/launch-runbook.md`](launch-runbook.md)；本文只管"从零到能用"。

## 0. 前置条件

- GitHub 账号（fork 或使用本仓库）
- [Supabase](https://supabase.com) 账号（Free 档即可）
- [Vercel](https://vercel.com) 账号（Hobby 档即可）
- 本机 Node.js 24+ 与 pnpm（仅建号脚本需要）

## 1. 创建 Supabase 项目

1. Supabase Dashboard → **New project**，起名（如 `token-usage`），设置数据库密码，选
   近区域（如 Singapore）。等待初始化完成（约 2 分钟）。
2. 记下三组值（**Project Settings → API**）：
   - Project URL —— `NEXT_PUBLIC_SUPABASE_URL`
   - Publishable key（`sb_publishable_...`）—— `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - Secret key（`sb_secret_...`）—— `SUPABASE_SECRET_KEY`（**绝不进浏览器**）

## 2. 建库（token_* 表，RLS 全拒）

迁移文件在仓库 `supabase/migrations/`，幂等，可重复执行。二选一：

**方式 A：Supabase CLI（推荐）**

```bash
git clone https://github.com/baiwumm/token-usage.git && cd token-usage
npx supabase login
npx supabase link --project-ref <your-project-ref>   # ref 是 Project URL 里的子域
npx supabase db push
```

**方式 B：SQL Editor 手动执行**

Supabase Dashboard → SQL Editor → 按文件名顺序依次粘贴执行（**当前共 13 个，不要漏**）：

1. `supabase/migrations/20261024000000_token_core_tables.sql`（必需：全部 `token_*` 表）
2. `supabase/migrations/20261024000001_token_allowed_emails_optional.sql`（可选：自助注册白名单）
3. `supabase/migrations/20261024000002_storage_avatars_optional.sql`（可选：头像 Storage 桶）
4. `supabase/migrations/20261025000000_token_sessions.sql`（必需：Sessions 页 + 3 条 Sessions 类成就）
5. `supabase/migrations/20261027000000_token_sync_runs.sql`（必需：采集端运行记录 + `sync_diligence` 成就）
6. `supabase/migrations/20261030000000_token_achievement_seen.sql`（必需：成就已读水位；缺少时成就页仍可用，只是「新」标记与解锁 toast 不生效）
7. `supabase/migrations/20261031000000_token_usage_credits.sql`（必需：小时桶 `credits` 列；缺列时新版 CLI 的 ingest 会整批报错）
8. `supabase/migrations/20261031000001_token_sync_runs_credits.sql`（必需：采集记录 `credits_ingested` 遥测列）
9. `supabase/migrations/20261031000003_token_sessions_credits.sql`（必需：会话级 `credits` 列与 `token_upsert_sessions` RPC 替换）
10. `supabase/migrations/20261101000000_token_public_badges.sql`（必需：公开徽章表）
11. `supabase/migrations/20261103000000_token_hourly_project_key.sql`（**必需**：契约 v2 桶级 `project_key`——它是 upsert 键的一部分，缺列时新版 CLI 的 ingest 整批失败）
12. `supabase/migrations/20261104000000_token_hourly_cost_usd_comment.sql`（必需：`total_cost_usd` 列注释）
13. `supabase/migrations/20261105000000_token_public_badges_sections.sql`（必需：徽章分区字段）

执行后确认 Table Editor 里出现 `token_devices`、`token_device_tokens`、`token_device_codes`、
`token_usage_hourly`、`token_account_session_states`、`token_sessions`、`token_sync_runs`、
`token_achievement_seen`、`token_public_badges`。**不要**给这些表添加任何 policy——RLS 全拒
（客户端零直连）是本项目的安全姿态，数据只经部署应用的服务端读写。

## 3. 配置 Supabase Auth

Dashboard → **Authentication → URL Configuration**：

- **Site URL**：部署域名根（先按第 4 步的 Vercel 域名填，如 `https://token-usage-delta.vercel.app`，
  绑定自定义域名后改回来）
- **Redirect URLs**：添加 `https://<部署域名>/**`（**通配条目**。精确条目如
  `https://<部署域名>/auth/callback` 盖不住 `/auth/callback?next=…` 这类带查询串的
  子路径，GoTrue 校验不过会回退 Site URL、把用户引到错误的域名——魔法链接与 OAuth
  的会话交换都落在这个路径上）

**注册闸门**：Dashboard → **Authentication → Sign In / Providers**，把
**Allow new users to sign up 关闭**（Supabase 默认开启）。本站是管理员建号制，这个
开关是唯一的注册通道闸门——关闭后陌生人用任何方式（含 OAuth 首次登录）都会被
`signup_disabled` 拒绝、不产生任何用户；临时开启仅用于 OAuth linking 或启用自助
注册白名单的场景。

> 邮件：Supabase 内置 SMTP 有限速，仅够验证与小规模自用；邀请邮件与魔法链接都走这条
> 通道，正式使用建议 Authentication → SMTP 配自定义 SMTP。

**可选：GitHub / Google OAuth 快捷登录**。OAuth 只是给**已有账号**增加登录方式
（automatic linking 按已验证邮箱合并进现有账号），不是注册通道——闸门关闭时陌生人
的首次 OAuth 会被拒绝：

1. **GitHub**：GitHub → Settings → Developer settings → OAuth Apps → New：
   Homepage URL 填部署域名；**Authorization callback URL 填 Supabase 的
   `https://<project-ref>.supabase.co/auth/v1/callback`**（仅此一条——站点域名不进
   GitHub 配置，跳回站点那步由上面的 Redirect URLs 管）。Client ID / Secret 填入
   Supabase → Authentication → Providers → GitHub。
2. **Google**：Google Cloud → Google Auth Platform → 创建 OAuth 客户端（Web 应用）：
   已获授权的 JavaScript 来源 = 部署域名 origin（本地联调再加
   `http://localhost:3000`）；已获授权的重定向 URI = 同一条 Supabase 回调。
   Client ID / Secret 填入 Supabase → Providers → Google。注意验证中心（consent
   screen）处于 Testing 时只有测试用户能登录——自用就发布为生产，或把自己加进测试
   用户。
3. 两家 provider 的 **Allow users without an email** 与 **Skip nonce checks** 保持
   关闭：登录身份按已验证邮箱 automatic linking 合并，无邮箱的账号无法关联。

## 4. 部署到 Vercel

**方式 A：Deploy 按钮（最短路径）**

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fbaiwumm%2Ftoken-usage&project-name=token-usage&repository-name=token-usage)

在 Vercel 的 **Environment Variables** 里填四个值（也可部署后在 Settings 里补）：

| 变量 | 值 |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | 第 1 步的 Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | 第 1 步的 Publishable key |
| `SUPABASE_SECRET_KEY` | 第 1 步的 Secret key |
| `TOKEN_USAGE_DASHBOARD_URL` | 部署域名根，如 `https://token-usage-delta.vercel.app` |

可选：`TOKEN_USAGE_SITE_NAME` 覆盖页签标题后缀与 Apple Web App 标题，默认 `TokenUsage`
（标题格式为 `<页面名> - <TOKEN_USAGE_SITE_NAME>`）。

可选：`NEXT_PUBLIC_PROJECTS_CALIBER` 控制 `/projects` 页口径（详见
[`docs/ui-spec.md`](ui-spec.md)「项目（`/projects`）」节）。它是**部署级、构建期内联**的开关，
CLI 采集端不读它：未设置时走 sessions 口径（只覆盖会话级来源，`cursor` / `trae-cn` 永不
出现），设为 `hourly` 走桶口径（100% token，只有带项目名的桶才有归因；本机 2026-11-04 已用
`scripts/admin/project-backfill.cjs` 回填 opencode 的历史项目行，其他来源、多模型组与无项目
证据的桶仍整体计入「未归因」，不做源库重扫）。改值或删除都必须重新部署（Vercel Redeploy）
才生效；新部署建议先保持默认，等带项目名的桶攒够再切。新采集机器只影响「本机从接入起」的
用量，不影响历史。
注意：桶级项目名从 `tokenusage-cli@0.4.4`（2026-11-04 发布）起才写入，0.4.3 及更早不会；
WorkBuddy / WorkBuddy AI 的项目归因从 `0.5.0`（2026-11-06）起，升级后第一次 `sync` 会自动
重扫本机 WorkBuddy 历史（只重扫项目游标，总量与对账基线不变）。采集机需升级并跑一次
`sync`，`hourly` 口径的项目行才会出现；否则整页都是「未归因」。

Deploy 后得到部署域名（如 `https://token-usage-xxx.vercel.app`）。**回到 Supabase Auth
配置，把 Site URL 与 Redirect URLs 里的域名核对成这个实际域名**；`TOKEN_USAGE_DASHBOARD_URL`
若有出入也在 Vercel 改后 Redeploy 一次。

**方式 B：Vercel CLI / Git 集成**：把仓库导入 Vercel 项目（framework 自动识别 Next.js），
环境变量同上。

部署完成后自检：打开 `https://<部署域名>/api/functions/token-usage-public-config`，
应返回包含 `supabase_url` 的 JSON。

## 5. 创建第一个用户（管理员即你）

公开注册关闭，账号由管理员（service-role）创建。本机执行：

```bash
# 拷贝环境模板并填入第 1 步的三组值
cp apps/web/.env.example apps/web/.env.local

# 方式 A：直接建号 + 临时密码（不依赖邮件可达）
node scripts/admin/create-user.cjs --email you@example.com --password

# 方式 B：发邀请邮件
node scripts/admin/create-user.cjs --email you@example.com
```

用邮箱 + 临时密码（或邮件链接）在 `<部署域名>/login` 登录，进入仪表盘。

## 6. 配对 CLI 采集端（tokenusage-cli）

采集端为本仓库 `packages/cli`（`tokenusage-cli`，fork 上游 CLI）。每个用户**自己批准自己的设备**：

1. 用户在本机安装 CLI 后执行 `tokenusage device-login`，得到 `XXXX-XXXX` 配对码
   （向 `<部署域名>/api/functions/token-usage-device-flow-authorize` 发起）；
2. 用户在**自己的浏览器里登录本站点**，打开 `/device?user_code=XXXX-XXXX` 点批准；
3. 设备令牌自动下发并绑定该账号——这台机器此后上报的数据全部归属该用户，
   `/settings` 里只有该用户能看/吊销自己的设备。

配对的信任锚是**站点账号**：公开注册关闭（第 5 步管理员建号 / 邀请制，可选
`token_allowed_emails` 白名单），没有账号的外来配对码 15 分钟自动过期，什么都不会发生。
多用户各配各的设备，数据按 user_id 隔离。

CLI 机制速查（完整说明见 `packages/cli/README.md`）：

- `tokenusage sync`：解析本地 AI 工具日志 → 上报；**未配对时只采集入队、不上报**
  （提示 skipped），配对后 `sync --drain` 自动补传全部积压，数据不丢；
- `tokenusage sync --watch`：常驻自动上报，默认 15 分钟一轮（`--interval <ms>` 自定义，
  最小 60000）；停止 = 终止进程（Ctrl+C），队列/水位已落盘，随时终止都安全；
- `tokenusage status` / `doctor`：自查令牌、队列积压与各工具接入状态。

> 旧采集端 `tokentracker-cli@1.4.x` 的兼容别名已于 **2026-11-03 退役**：旧路径
> GET 404 / 写动词 405（有声失败、不丢数据），必须升级 `tokenusage-cli`
>（数据目录独立 `~/.tokenusage`，两者可在同一台机器共存）。升级三步与逐台迁移细节见
> 根 `README.md`「从旧版 CLI 升级」与 `docs/launch-runbook.md`「新 CLI 迁移」段。

## 7. 验证闭环

回到 `<部署域名>/`：上报几分钟内仪表盘出现用量（汇总卡、日图、热力图、模型与设备分布）；
`/settings` 可改名与吊销设备（吊销即时生效）；`/wrapped` 年度回顾；`/settings` 设备分区
的「实例诊断」卡自查端点健康；`/sync-runs` 核对各设备采集心跳。

**对账口径提示**：`token_usage_hourly.total_cost_usd` 是**哨兵列**——CLI 写入行恒为 0（只有
grok/cline 的厂商上报成本可能为正），真实费用在读取时按 curated + LiteLLM 定价实时计算
（列注释见迁移 `supabase/migrations/20261104000000_token_hourly_cost_usd_comment.sql`）。
写外部对账脚本时**不要对 `total_cost_usd` 求和**（读到的 0 不是「免费」，而是「读取时才算」）；
请用 `total_tokens` / `billable_total_tokens`，或复刻读取时定价（`computeRowCost()`）。

## 常见问题

| 现象 | 原因与处理 |
| --- | --- |
| CLI authorize 报 500 | 服务端缺 `TOKEN_USAGE_DASHBOARD_URL`（Vercel 环境变量），补上后 Redeploy |
| 魔法链接点了跳回登录页报链接无效 | Redirect URLs 没含 `<部署域名>/auth/callback`，或 Site URL 域名不符 |
| 登录后仪表盘无数据 | 采集端未配对或未 sync；先走第 6 步 |
| 邀请/魔法链接邮件收不到 | 内置 SMTP 限速；稍后再试或配自定义 SMTP |
| 实例诊断某项异常 | 对照 `/settings` 设备分区「实例诊断」卡的目标与延迟定位；首次请求 1–2s 属冷启动；写入侧停摆看 `/sync-runs` 的设备采集状态 |
