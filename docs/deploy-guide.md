# 部署指南（Supabase + EdgeOne Makers 从零跑通）

面向全新账号的自部署全流程：**建库 → 部署 → 建号 → 配对 CLI → 仪表盘可见**。
免费档（Supabase Free + EdgeOne Makers 免费版）即可完成。全程约 20–30 分钟。

> 部署与回滚的运维视角（升级顺序、冒烟清单、回滚）见
> [`docs/launch-runbook.md`](launch-runbook.md)；本文只管"从零到能用"。

## 0. 前置条件

- GitHub 账号（fork 或使用本仓库）
- [Supabase](https://supabase.com) 账号（Free 档即可）
- 腾讯云账号，开通 [EdgeOne Makers](https://console.cloud.tencent.com/edgeone/makers)（原 EdgeOne
  Pages；免费版即可）。面向中国大陆加速时，自定义域名须已在工信部完成 ICP 备案
- 本机 Node.js 24+ 与 pnpm（仅建号脚本需要）

## 1. 创建 Supabase 项目

1. Supabase Dashboard → **New project**，起名（如 `token-usage`），设置数据库密码，选
   近区域（如 Singapore / Tokyo / Seoul）。等待初始化完成（约 2 分钟）。
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

Supabase Dashboard → SQL Editor → 按文件名顺序依次粘贴执行：

1. `supabase/migrations/20261024000000_token_core_tables.sql`（必需：全部 `token_*` 表）
2. `supabase/migrations/20261024000001_token_allowed_emails_optional.sql`（可选：自助注册白名单）
3. `supabase/migrations/20261024000002_storage_avatars_optional.sql`（可选：头像 Storage 桶）
4. `supabase/migrations/20261025000000_token_sessions.sql`（必需：Sessions 页 + 3 条 Sessions 类成就）
5. `supabase/migrations/20261027000000_token_sync_runs.sql`（必需：采集端运行记录 + `sync_diligence` 成就）
6. `supabase/migrations/20261030000000_token_achievement_seen.sql`（必需：成就已读水位；缺少时成就页仍可用，只是「新」标记与解锁 toast 不生效）
7. `supabase/migrations/20261031000000_token_usage_credits.sql`（必需：小时桶 `credits` 列；缺列时新版 CLI 的 ingest 会整批报错）
8. `supabase/migrations/20261031000001_token_sync_runs_credits.sql`（必需：采集记录 `credits_ingested` 遥测列）
9. `supabase/migrations/20261031000003_token_sessions_credits.sql`（必需：会话级 `credits` 列与 `token_upsert_sessions` RPC 替换）
10. `supabase/migrations/20261101000000_token_public_badges.sql`（必需：公开徽章配置，见 `docs/badge.md`）

执行后确认 Table Editor 里出现 `token_devices`、`token_device_tokens`、`token_device_codes`、
`token_usage_hourly`、`token_account_session_states`、`token_sessions`、`token_sync_runs`、
`token_achievement_seen`、`token_public_badges`。**不要**给这些表添加任何 policy——RLS
全拒（客户端零直连）是本项目的安全姿态，数据只经部署应用的服务端读写。

## 3. 配置 Supabase Auth

Dashboard → **Authentication → URL Configuration**：

- **Site URL**：部署域名根（先按第 4 步得到的域名填，绑定自定义域名后改成自定义域名，
  如 `https://token-usage.example.com`）
- **Redirect URLs**：添加 `https://<部署域名>/auth/callback`（魔法链接会话交换的落点）

> 邮件：Supabase 内置 SMTP 有限速，仅够验证与小规模自用；邀请邮件与魔法链接都走这条
> 通道，正式使用建议 Authentication → SMTP 配自定义 SMTP。

## 4. 部署到 EdgeOne Makers

EdgeOne Makers 原生构建 Next.js 16（App Router、Route Handlers、`proxy.ts` 中间件均支持，
无需 adapter）。仓库已带 [`apps/web/edgeone.json`](../apps/web/edgeone.json)，钉住安装、
构建命令与 Node 版本。

**方式 A：控制台导入 Git 仓库（推荐）**

1. [EdgeOne Makers 控制台](https://console.cloud.tencent.com/edgeone/makers)（国际站：
   `console.intl.cloud.tencent.com`）→ 新建项目 → **导入 Git 仓库**，选择本仓库（或你的
   fork），部署分支 `main`。此后推送到 `main` 即自动重新部署。
2. 构建设置：

   | 项 | 值 |
   | --- | --- |
   | 框架 | Next.js（自动识别） |
   | **根目录** | `apps/web`（**必填**：pnpm monorepo，应用在子目录） |
   | 安装命令 / 构建命令 / 输出目录 / Node 版本 | 由 `apps/web/edgeone.json` 覆盖，可留默认 |

   `edgeone.json` 的取值如下（若控制台未读取到，按此手填）：

   | 项 | 值 |
   | --- | --- |
   | 安装命令 | `npx --yes pnpm@12.11.2 install --frozen-lockfile --filter @token-usage/web` |
   | 构建命令 | `npx --yes pnpm@12.11.2 run build` |
   | 输出目录 | `.next` |
   | Node.js | `24.18.0` |

   之所以用 `npx` 钉 pnpm：平台预装的 pnpm 最高到 11，而仓库锁定 pnpm 12
   （根 `package.json` 的 `packageManager`）；根目录设为 `apps/web` 后该目录下没有
   lockfile，平台默认会退回 `npm install`、无视 pnpm 锁文件。
3. **加速区域**：自定义域名已备案 → 选「全球可用区（含中国大陆）」，大陆访客走大陆节点；
   未备案只能选「全球可用区（不含中国大陆）」（选含中国大陆的区域时，添加的域名须先备案）。
4. **环境变量**（项目设置 → 环境变量；**首次构建前就要填好**——`NEXT_PUBLIC_*` 在构建时
   内联进前端，事后补填须重新部署；可把 `.env` 内容整段粘贴进变量名输入框批量导入）：

   | 变量 | 值 |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | 第 1 步的 Project URL |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | 第 1 步的 Publishable key |
   | `SUPABASE_SECRET_KEY` | 第 1 步的 Secret key |
   | `TOKEN_USAGE_DASHBOARD_URL` | 部署域名根，如 `https://token-usage.example.com` |

   可选：`TOKEN_USAGE_SITE_NAME` 覆盖页签标题后缀与 Apple Web App 标题，默认 `TokenUsage`
   （标题格式为 `<页面名> - <TOKEN_USAGE_SITE_NAME>`）。
5. 部署后得到预设域名（`*.edgeone.cool`）。预设域名仅供验证：在中国大陆访问会带
   `eo_token` 限制、分享后可能 401。正式使用请绑定自定义域名：项目 → 域名管理 → 添加域名
   → 按指引在 DNS 服务商添加验证记录与 CNAME → 申请免费 HTTPS 证书。**回到 Supabase Auth
   配置与 `TOKEN_USAGE_DASHBOARD_URL`，核对成这个最终域名**（改了环境变量须重新部署）。

**方式 B：Deploy 按钮**（跳转国际站 `edgeone.ai`，预填根目录、构建命令与必填变量名；
国内站账号请走方式 A）

[![使用 EdgeOne Makers 部署](https://cdnstatic.tencentcs.com/edgeone/pages/deploy.svg)](https://edgeone.ai/pages/new?repository-url=https%3A%2F%2Fgithub.com%2Fbaiwumm%2Ftoken-usage&project-name=token-usage&root-directory=apps%2Fweb&install-command=npx%20--yes%20pnpm%4012.11.2%20install%20--frozen-lockfile%20--filter%20%40token-usage%2Fweb&build-command=npx%20--yes%20pnpm%4012.11.2%20run%20build&output-directory=.next&env=NEXT_PUBLIC_SUPABASE_URL%2CNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY%2CSUPABASE_SECRET_KEY%2CTOKEN_USAGE_DASHBOARD_URL&env-description=Supabase%20Project%20URL%20%2F%20Publishable%20key%20%2F%20Secret%20key%2C%20and%20the%20deployment%20origin&env-link=https%3A%2F%2Fgithub.com%2Fbaiwumm%2Ftoken-usage%2Fblob%2Fmain%2Fdocs%2Fdeploy-guide.md)

**方式 C：EdgeOne CLI（本地构建后上传）**

```bash
npm install -g edgeone@latest
edgeone login --site china          # 国际站用 --site global
cd apps/web
edgeone makers build                # 可选：本地预检，产物在 .edgeone/（已 gitignore）
edgeone makers env set NEXT_PUBLIC_SUPABASE_URL "https://xxx.supabase.co"   # 其余变量同理
edgeone makers deploy -n token-usage
```

部署完成后自检：打开 `https://<部署域名>/api/functions/token-usage-public-config`，
应返回包含 `supabase_url` 的 JSON。

**函数地域与数据库**：Makers 默认把服务端函数放在大陆 `ap-guangzhou`、海外
`ap-singapore`；Supabase 在海外，大陆函数访问它属于跨境链路，延迟随线路波动。可在
`apps/web/edgeone.json` 用 `cloudFunctions.mainlandRegions` / `overseasRegions` 调整
（每项一个地域 ID，可选值以控制台为准）。浏览器端的登录（Supabase Auth）与头像
（Storage）同样直连 `*.supabase.co`。

**限流**（`docs/cli-contract.md` §1.6）：在 EdgeOne 的 Web 防护 / 速率限制里给
`/api/functions/*` 配置基础的 429 规则。

**其他平台**：代码不绑定托管平台（旧路径别名在 `src/proxy.ts`），Vercel 等平台同样可以
部署——根目录选 `apps/web`、框架 Next.js、环境变量同上，`edgeone.json` 对其无影响。

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
| 构建日志里出现 `npm install`、或报 pnpm 版本 / lockfile 错误 | 根目录不是 `apps/web`，或安装命令被改；核对第 4 步的构建设置与 `apps/web/edgeone.json` |
| 页面 500「Auth not configured」 | 构建时缺 `NEXT_PUBLIC_SUPABASE_*`；补齐环境变量后重新部署（前端变量在构建期内联） |
| CLI authorize 报 500 | 服务端缺 `TOKEN_USAGE_DASHBOARD_URL`（项目设置 → 环境变量），补上后重新部署 |
| 旧 CLI（1.4.x）上报 404 | 旧路径别名由 `src/proxy.ts` 提供；看构建日志是否有 `Compiled edge functions`（中间件已部署） |
| 预设域名打开 401 | 中国大陆访问预设域名的限制；绑定已备案的自定义域名 |
| 魔法链接点了跳回登录页报链接无效 | Redirect URLs 没含 `<部署域名>/auth/callback`，或 Site URL 域名不符 |
| 登录后仪表盘无数据 | 采集端未配对或未 sync；先走第 6 步 |
| 邀请/魔法链接邮件收不到 | 内置 SMTP 限速；稍后再试或配自定义 SMTP |
| `service-status` 某项异常 | 对照 `/service-status` 的目标与延迟定位；首次请求 1–2s 属冷启动 |
