# 部署指南

从零把 Token Usage 跑起来：**建库 → 配 Auth → 部署 → 建号 → 配对采集端 → 验证**。免费档
（Supabase Free + Vercel Hobby）即可完成，全程约 20–30 分钟。

本文按「每一步都能由 Agent 执行并自检」编写：每节末尾的**完成条件**就是该步的验收标准。
升级已有实例、冒烟与回滚见 [`docs/launch-runbook.md`](launch-runbook.md)。

## 0. 前置条件

- GitHub 账号（fork 或使用本仓库）
- [Supabase](https://supabase.com) 账号（Free 档即可）
- [Vercel](https://vercel.com) 账号（Hobby 档即可）
- 本机 Node.js ≥ 22.19 与 pnpm（建号脚本与迁移 CLI 需要）

## 1. 创建 Supabase 项目

Dashboard → **New project**，起名（如 `token-usage`），设置数据库密码，选近区域，等待初始化完成。

记下三组值（**Project Settings → API**）：

- Project URL → `NEXT_PUBLIC_SUPABASE_URL`
- Publishable key（`sb_publishable_...`）→ `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- Secret key（`sb_secret_...`）→ `SUPABASE_SECRET_KEY`（**绝不进浏览器，也不提交仓库**）

**完成条件**：三个值写入 `apps/web/.env.local`（从 `apps/web/.env.example` 拷贝）。

## 2. 建库

迁移在 `supabase/migrations/`，幂等，可重复执行。二选一：

**方式 A：Supabase CLI（推荐）**

```bash
git clone https://github.com/baiwumm/token-usage.git && cd token-usage
npx supabase login
npx supabase link --project-ref <your-project-ref>   # ref 是 Project URL 的子域
npx supabase db push
```

**方式 B：SQL Editor 手动执行**

在 SQL Editor 按文件名顺序逐个粘贴执行（共 14 个）：

| 迁移 | 作用 |
| --- | --- |
| `20261024000000_token_core_tables.sql` | 全部 `token_*` 表（必需） |
| `20261024000001_token_allowed_emails_optional.sql` | 自助注册白名单（可选） |
| `20261024000002_storage_avatars_optional.sql` | 头像 Storage 桶（可选） |
| `20261025000000_token_sessions.sql` | Sessions 页与 Sessions 类成就（必需） |
| `20261027000000_token_sync_runs.sql` | 采集运行记录与 `sync_diligence`（必需） |
| `20261030000000_token_achievement_seen.sql` | 成就已读水位（缺省只影响「新」标记与 toast） |
| `20261031000000_token_usage_credits.sql` | 小时桶 `credits` 列（缺列时新版 CLI ingest 整批报错） |
| `20261031000001_token_sync_runs_credits.sql` | 采集记录 `credits_ingested` 遥测 |
| `20261031000003_token_sessions_credits.sql` | 会话级 `credits` 列与 upsert RPC |
| `20261101000000_token_public_badges.sql` | 公开徽章表 |
| `20261103000000_token_hourly_project_key.sql` | 契约 v2 桶级 `project_key`（upsert 键的一部分） |
| `20261104000000_token_hourly_cost_usd_comment.sql` | `total_cost_usd` 列注释（纯注释） |
| `20261105000000_token_public_badges_sections.sql` | 徽章分区字段 |
| `20261106000000_token_project_repos_profiles.sql` | 项目仓库表与项目资料（缺省时 Projects 的仓库链接/Profiles／桌面端项目 logo 不可用） |

**完成条件**：Table Editor 里出现 `token_devices`、`token_device_tokens`、`token_device_codes`、
`token_usage_hourly`、`token_account_session_states`、`token_sessions`、`token_sync_runs`、
`token_achievement_seen`、`token_public_badges`、`token_project_repos`、`token_project_profiles`，
且**没有任何 policy**——RLS 全拒（客户端零直连）是本项目的安全姿态，数据只经应用服务端读写。

## 3. 配置 Supabase Auth

Dashboard → **Authentication → URL Configuration**：

- **Site URL**：部署域名根（如 `https://token-usage-delta.vercel.app`，绑定自定义域名后改回来）
- **Redirect URLs**：添加 `https://<部署域名>/**`（**通配条目**。精确条目盖不住
  `/auth/callback?next=…` 这类带查询串的子路径，GoTrue 校验不过会回退 Site URL，魔法链接与
  OAuth 的会话交换都会失败）

**注册闸门**：Authentication → Sign In / Providers，把 **Allow new users to sign up 关闭**
（Supabase 默认开启）。本站是管理员建号制，这个开关是唯一注册通道；关闭后陌生人用任何方式
（含 OAuth 首次登录）都会被 `signup_disabled` 拒绝。临时开启只用于 OAuth linking 或启用自助
注册白名单。

> 邮件：内置 SMTP 有限速，仅够验证与小规模自用；正式使用建议配自定义 SMTP。

**可选：GitHub / Google OAuth**（只给已有账号增加登录方式，不是注册通道）

1. **GitHub**：Settings → Developer settings → OAuth Apps → New。Homepage URL 填部署域名，
   **Authorization callback URL 填 Supabase 的 `https://<project-ref>.supabase.co/auth/v1/callback`**
   （站点域名不进 GitHub 配置，跳回站点由上面的 Redirect URLs 管）。Client ID / Secret 填入
   Supabase → Providers → GitHub。
2. **Google**：Google Cloud → 创建 OAuth 客户端（Web 应用）。已授权 JavaScript 来源 = 部署域名
   origin（本地联调加 `http://localhost:3000`），重定向 URI = 同一条 Supabase 回调；凭据填入
   Providers → Google。consent screen 处于 Testing 时只有测试用户能登录。
3. 两家 provider 的 **Allow users without an email** 与 **Skip nonce checks** 保持关闭：登录身份
   按已验证邮箱自动关联，无邮箱的账号无法关联。

**完成条件**：Site URL 与 Redirect URLs 与第 4 步得到的实际域名一致；公开注册已关闭。

## 4. 部署到 Vercel

**方式 A：Deploy 按钮（最短路径）**

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fbaiwumm%2Ftoken-usage&project-name=token-usage&repository-name=token-usage)

在 **Environment Variables** 填四个值：

| 变量 | 值 |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | 第 1 步的 Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | 第 1 步的 Publishable key |
| `SUPABASE_SECRET_KEY` | 第 1 步的 Secret key |
| `TOKEN_USAGE_DASHBOARD_URL` | 部署域名根，如 `https://token-usage-delta.vercel.app` |

可选变量（`TOKEN_USAGE_SITE_NAME`、`NEXT_PUBLIC_BEIAN_ICP` / `NEXT_PUBLIC_BEIAN_POLICE`、
`NEXT_PUBLIC_PROJECTS_CALIBER`、`TOKEN_USAGE_FX_RATES`）的语义见 `docs/rewrite-plan.md` §5。

**方式 B：Vercel CLI / Git 集成**：导入仓库，**Root Directory 设为 `apps/web`**，framework 自动
识别 Next.js，环境变量同上。依赖安装由 `apps/web/vercel.json` 固定为
`pnpm install --frozen-lockfile`（Vercel 在嵌套 Root Directory 下探测不到仓库根 lockfile，
回退 npm 会与 eslint 的 peer 约束硬冲突）。项目设置里的
**Include files outside the root directory in the Build Step 必须 Enabled**——pnpm workspace 根与
lockfile 都在仓库根，关掉后 install 阶段即报 `Headless installation requires a pnpm-lock.yaml file`。

**触发判定**：`Skip deployments when there are no changes to the root directory or its
dependencies` 保持 Enabled。`apps/web` 或其依赖变动才构建，`apps/desktop` 等无关 workspace 改动
会被跳过；workspace 定义之外的文件（`docs/`、`.github/`、根级配置）算全局变更，docs-only 的
push 也会部署 web。

**完成条件**：打开 `https://<部署域名>/api/functions/token-usage-public-config` 返回含
`supabase_url` 的 JSON。

## 5. 创建第一个用户（管理员即你）

公开注册关闭，账号由管理员（service-role）创建：

```bash
cp apps/web/.env.example apps/web/.env.local      # 已填好第 1 步的三组值
node scripts/admin/create-user.cjs --email you@example.com --password   # 直接建号 + 临时密码
node scripts/admin/create-user.cjs --email you@example.com              # 或发邀请邮件
```

用邮箱 + 临时密码（或邮件链接）在 `<部署域名>/login` 登录。建成多用户与临时密码改密流程见
[`docs/invite-flow.md`](invite-flow.md)。

**完成条件**：能登录并进入仪表盘。

## 6. 配对 CLI 采集端

采集端为 `packages/cli`（npm `tokenusage-cli`）。每个用户**自己批准自己的设备**：

1. 本机安装后执行 `tokenusage device-login`，得到 `XXXX-XXXX` 配对码；
2. 在自己的浏览器里登录本站，打开 `/device?user_code=XXXX-XXXX` 点批准；
3. 设备令牌自动下发并绑定该账号，此后这台机器的上报全部归属该用户，`/settings` 里只有本人能
   看/吊销自己的设备。

信任锚是**站点账号**：公开注册关闭（管理员建号 / 邀请制，可选白名单），没有账号的外来配对码
15 分钟自动过期，什么都不会发生。多用户各配各的设备，数据按 user_id 隔离。

CLI 机制速查（完整说明见 `packages/cli/README.md`）：

- `tokenusage sync`：解析本地 AI 工具日志 → 上报；**未配对时只采集入队、不上报**，配对后
  `sync --drain` 自动补传积压，数据不丢；
- `tokenusage sync --watch`：常驻自动上报，默认 15 分钟一轮（`--interval <ms>`，最小 60000）；
  停止 = 终止进程，队列与水位已落盘；
- `tokenusage init`：注册每小时自动采集（Windows 计划任务 / macOS launchd / Linux systemd user
  timer）并维护自包含运行时副本；**升级 CLI 或切换 Node 版本后必须重跑**；
- `tokenusage status` / `doctor` / `reconcile --days 7`：自查令牌、队列、各工具接入与逐键对账。

**完成条件**：`/settings` 设备列表出现该机器，`/sync-runs` 有采集记录。

## 7. 验证闭环

回到 `<部署域名>/`：上报几分钟内仪表盘出现用量（汇总卡、日图、热力图、模型与设备分布）；
`/sessions`、`/projects`、`/wrapped`、`/achievements` 可打开；`/settings` 的设备分区「实例诊断」
卡可自查端点健康。

**对账口径提示**：`token_usage_hourly.total_cost_usd` 是**哨兵列**——CLI 写入行恒为 0（只有
grok/cline 的厂商上报成本可能为正），真实费用在读取时按 curated + LiteLLM 定价实时计算。写
外部对账脚本时**不要对 `total_cost_usd` 求和**（读到 0 是「读取时才算」，不是「免费」）；请用
`total_tokens` / `billable_total_tokens`，或复刻读取时定价（`computeRowCost()`）。

## 常见问题

| 现象 | 原因与处理 |
| --- | --- |
| CLI authorize 报 500 | 服务端缺 `TOKEN_USAGE_DASHBOARD_URL`，补上后 Redeploy |
| 魔法链接跳回登录页报链接无效 | Redirect URLs 没含 `<部署域名>/**`，或 Site URL 域名不符 |
| 登录后仪表盘无数据 | 采集端未配对或未 sync，回到第 6 步 |
| 邀请/魔法链接邮件收不到 | 内置 SMTP 限速；稍后重试或配自定义 SMTP |
| 新版 CLI 的 ingest 整批 500 | 漏跑 `20261103000000`（`project_key` 属 upsert 键） |
| `/projects` 全是「未归因」 | 口径为 `hourly` 时需采集机升级到带 `project_key` 的 CLI 并跑过一次 sync |
| 实例诊断某项异常 | 对照 `/settings` 实例诊断卡的目标与延迟；首次请求 1–2s 属冷启动；写入侧停摆看 `/sync-runs` |
