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

两张迁移文件在仓库 `supabase/migrations/`，幂等，可重复执行。二选一：

**方式 A：Supabase CLI（推荐）**

```bash
git clone https://github.com/baiwumm/token-usage.git && cd token-usage
npx supabase login
npx supabase link --project-ref <your-project-ref>   # ref 是 Project URL 里的子域
npx supabase db push
```

**方式 B：SQL Editor 手动执行**

Supabase Dashboard → SQL Editor → 依次粘贴执行：

1. `supabase/migrations/20261024000000_token_core_tables.sql`（必需：全部 token_* 表）
2. `supabase/migrations/20261024000001_token_allowed_emails_optional.sql`（可选：自助注册白名单）

执行后确认 Table Editor 里出现 `token_devices`、`token_device_tokens`、`token_device_codes`、
`token_usage_hourly`、`token_account_session_states`。**不要**给这些表添加任何 policy——
RLS 全拒（客户端零直连）是本项目的安全姿态，数据只经部署应用的服务端读写。

## 3. 配置 Supabase Auth

Dashboard → **Authentication → URL Configuration**：

- **Site URL**：部署域名根（先按第 4 步的 Vercel 域名填，如 `https://token-usage-delta.vercel.app`，
  绑定自定义域名后改回来）
- **Redirect URLs**：添加 `https://<部署域名>/auth/callback`（魔法链接会话交换的落点）

> 邮件：Supabase 内置 SMTP 有限速，仅够验证与小规模自用；邀请邮件与魔法链接都走这条
> 通道，正式使用建议 Authentication → SMTP 配自定义 SMTP。

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

> 旧采集端 `tokentracker-cli@1.4.x` 仍可经旧路径别名兼容（base URL 指向
> `<部署域名>/api`）；`tokenusage-cli` 数据目录独立（`~/.tokenusage`），两者可在同一台
> 机器共存，迁移步骤见 `docs/launch-runbook.md`「新 CLI 迁移」段。

## 7. 验证闭环

回到 `<部署域名>/`：上报几分钟内仪表盘出现用量（汇总卡、日图、热力图、模型与设备分布）；
`/settings` 可改名与吊销设备（吊销即时生效）；`/wrapped` 年度回顾；`/service-status`
自查端点健康。

## 常见问题

| 现象 | 原因与处理 |
| --- | --- |
| CLI authorize 报 500 | 服务端缺 `TOKEN_USAGE_DASHBOARD_URL`（Vercel 环境变量），补上后 Redeploy |
| 魔法链接点了跳回登录页报链接无效 | Redirect URLs 没含 `<部署域名>/auth/callback`，或 Site URL 域名不符 |
| 登录后仪表盘无数据 | 采集端未配对或未 sync；先走第 6 步 |
| 邀请/魔法链接邮件收不到 | 内置 SMTP 限速；稍后再试或配自定义 SMTP |
| `service-status` 某项异常 | 对照 `/service-status` 的目标与延迟定位；首次请求 1–2s 属冷启动 |
