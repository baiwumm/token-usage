<p align="center">
  <strong>简体中文</strong> · <a href="./README.en.md">English</a>
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="apps/web/public/logo-dark.svg" />
    <img src="apps/web/public/logo.svg" width="112" height="112" alt="Token Usage Logo" />
  </picture>
</p>

<h1 align="center">Token Usage</h1>

<p align="center">
  自托管的 AI token 用量追踪：一个账号、多台设备，<br />
  用量与成本数据只落在<strong>你自己的 Supabase</strong> 里。
</p>

<p align="center">
  <a href="https://github.com/baiwumm/token-usage/actions/workflows/ci.yml"><img src="https://github.com/baiwumm/token-usage/actions/workflows/ci.yml/badge.svg?branch=main&style=flat-square" alt="CI" /></a>
  <a href="https://token-usage.cc"><img src="https://img.shields.io/badge/%E5%AE%98%E6%96%B9%E7%AB%99-token--usage.cc-0A0A0A?style=flat-square" alt="官方站" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-0A0A0A?style=flat-square" alt="MIT License" /></a>
  <a href="docs/requirements.md"><img src="https://img.shields.io/badge/%E9%9C%80%E6%B1%82-%E7%9C%9F%E6%BA%90-2ea44f?style=flat-square" alt="需求真源" /></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-111?style=flat-square&logo=nextdotjs&logoColor=fff&labelColor=111" alt="Next.js 16" />
  <img src="https://img.shields.io/badge/React-19-111?style=flat-square&logo=react&logoColor=61DAFB&labelColor=111" alt="React 19" />
  <img src="https://img.shields.io/badge/HeroUI-3-111?style=flat-square&logo=heroui&logoColor=fff&labelColor=111" alt="HeroUI 3" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-4-111?style=flat-square&logo=tailwindcss&logoColor=38BDF8&labelColor=111" alt="Tailwind CSS 4" />
  <img src="https://img.shields.io/badge/Supabase-Postgres-111?style=flat-square&logo=supabase&logoColor=3FCF8E&labelColor=111" alt="Supabase Postgres" />
  <img src="https://img.shields.io/badge/TypeScript-5.9-111?style=flat-square&logo=typescript&logoColor=3178C6&labelColor=111" alt="TypeScript 5.9" />
  <img src="https://img.shields.io/badge/Tauri-2-111?style=flat-square&logo=tauri&logoColor=24C8DB&labelColor=111" alt="Tauri 2" />
</p>

<p align="center">
  🌐 <a href="https://token-usage.cc">官方站</a> ·
  📖 <a href="docs/cli-contract.md">API 契约</a> ·
  🚀 <a href="docs/deploy-guide.md">部署指南</a> ·
  🧭 <a href="docs/rewrite-plan.md">架构与计划</a> ·
  🎨 <a href="docs/ui-spec.md">UI 规范</a> ·
  🤖 <a href="AGENTS.md">开发规范</a>
</p>

<p align="center">
  <a href="https://token-usage.baiwumm.com/u/tu_page_bOlbNTnYObADlBpAbskviq2h66gHzoGL">
    <img src="https://token-usage.baiwumm.com/api/badge?token=tu_badge_E99QerXGGOxG7w_BUvBd7GEV9vjzmfT2" alt="Token Usage badge" width="600">
  </a>
  <br />
  <sub>作者实例的实时用量——由本项目的<a href="docs/badge.md">公开徽章</a>渲染，点击进入公开页</sub>
</p>

## ✨ 项目特性

- **一个账号、多台设备**：每台机器独立配对、独立吊销；用量按账号聚合、按设备下钻
- **采集端只上报用量元数据**：解析本地 AI 工具的日志 → 本地队列 → 配对实例；不采集 prompt、对话正文、绝对路径与会话标题
- **面板完整**：仪表盘（KPI / 趋势 / 热力图 / 模型·来源·设备下钻 / 日·时·月明细 / 成本分析）、Sessions 会话明细、Projects 项目归因、采集运行记录、年度回顾、成就墙（20 条 × 5 档）
- **积分独立维度**：厂商 credits 单独展示，永不并入 token 与成本
- **公开徽章**：`/api/badge` 输出确定性 SVG，`/u/<token>` 是无需登录的公开用量页；令牌可随时撤销
- **数据自主**：每个实例绑定自己的 Supabase，跨实例零共享；浏览器零直连数据表（RLS 全拒 + service-role）
- **契约先行**：CLI 面 API 冻结，仪表盘面随 UI 演进（[`docs/cli-contract.md`](docs/cli-contract.md)）
- **多端**：Web 仪表盘、采集 CLI（npm `tokenusage-cli`）、官方落地页、Tauri 2 桌面托盘

## 🧱 技术栈

| 端 | 目录 | 技术栈 |
| --- | --- | --- |
| Web | [`apps/web`](apps/web) | Next.js 16 App Router + React 19 + HeroUI 3 + Tailwind CSS 4 + recharts |
| 采集 CLI | [`packages/cli`](packages/cli) | Node.js ≥ 22.19，npm `tokenusage-cli` |
| 落地页 | [`apps/landing`](apps/landing) | Next.js 16 静态导出（单页营销站） |
| 桌面端 | [`apps/desktop`](apps/desktop) | Tauri 2 + React 19 + HeroUI 3（托盘伴生工具） |
| 数据 | `supabase/` | Supabase Auth + Postgres，迁移按时间戳顺序执行 |

## 📁 项目结构

```text
token-usage/
├── apps/
│   ├── web/          # 仪表盘 + CLI 契约层（src/ 目录结构）
│   ├── landing/      # token-usage.cc 官方落地页（静态导出）
│   └── desktop/      # 桌面端托盘伴生工具（Tauri 2）
├── packages/cli/     # 采集 CLI（npm: tokenusage-cli）
├── supabase/         # Postgres 迁移（按时间戳顺序）
├── scripts/          # 运维脚本（索引见 scripts/README.md）
├── docs/             # 需求真源 / API 契约 / UI 规范 / 部署与运维手册
├── AGENTS.md         # 开发规范与 Agent 硬性约束
└── THIRD_PARTY_NOTICES.md  # 第三方资产与许可登记
```

## 🚀 快速开始

前置：Node.js ≥ 22.19、pnpm（版本由根 `packageManager` 锁定）、一个 Supabase 项目。

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local   # 填入 Supabase URL / publishable key / secret key
pnpm dev                                       # http://localhost:3000
```

### 🤖 交给 Agent 部署

部署全程（建库 → 配 Auth → 部署 → 建管理员 → 配对采集端 → 冒烟）都可交给编码 Agent 执行。
把下面这段原样发给它：

```text
请按本仓库 docs/deploy-guide.md 从零部署 Token Usage，逐节执行并在每节末尾报告结果：

1. 建 Supabase 项目，把 Project URL / publishable key / secret key 记入 apps/web/.env.local（密钥不提交）；
2. 按文件名顺序执行 supabase/migrations/ 下全部迁移（幂等，可重复跑），并确认 token_* 表存在、
   不添加任何 RLS policy；
3. 配置 Supabase Auth：Site URL 与 Redirect URLs（通配 https://<域名>/**），关闭公开注册；
4. 部署 apps/web 到 Vercel（Root Directory 按 monorepo 配置），配齐 4 个环境变量；
5. 用 scripts/admin/create-user.cjs 建管理员账号；
6. 配对采集端：tokenusage device-login → 浏览器 /device 批准 → tokenusage sync --drain；
7. 按 docs/launch-runbook.md 的冒烟清单验收，打印每一步的实际结果。

约束：任何不可逆操作（删除项目、切换域名）先停下来问我；密钥只写本机环境，不回显。
```

Agent 拿到的两个真源：[`docs/deploy-guide.md`](docs/deploy-guide.md)（从零部署，含环境变量与
常见问题）与 [`docs/launch-runbook.md`](docs/launch-runbook.md)（升级、冒烟与回滚）。
也可以直接点下方按钮，部署后在 Vercel 补环境变量：

<p align="center">
  <a href="https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fbaiwumm%2Ftoken-usage&project-name=token-usage&repository-name=token-usage">
    <img src="https://vercel.com/button" alt="Deploy with Vercel" />
  </a>
</p>

## 📚 文档

| 文档 | 内容 |
| --- | --- |
| [`AGENTS.md`](AGENTS.md) | 开发规范、命令、目录与命名、Agent 硬性约束 |
| [`docs/requirements.md`](docs/requirements.md) | 需求真源：范围、边界、角色、验收 |
| [`docs/rewrite-plan.md`](docs/rewrite-plan.md) | 架构、数据模型、依赖预算、环境变量、剩余事项 |
| [`docs/cli-contract.md`](docs/cli-contract.md) | API 契约：端点索引、冻结不变量、演进规则 |
| [`docs/ui-spec.md`](docs/ui-spec.md) | UI 规范：Design Tokens、组件规则、三态、各页面版式 |
| [`docs/achievements-plan.md`](docs/achievements-plan.md) | 成就系统：目录、阈值、计算规则 |
| [`docs/badge.md`](docs/badge.md) | 公开徽章与公开页：端点、令牌、口径、渲染 |
| [`docs/sources-capture-audit.md`](docs/sources-capture-audit.md) | 来源采集机制与账户级来源 |
| [`docs/invite-flow.md`](docs/invite-flow.md) | 邀请建号与首次登录 |
| [`docs/deploy-guide.md`](docs/deploy-guide.md) | 从零部署（Supabase + Vercel） |
| [`docs/launch-runbook.md`](docs/launch-runbook.md) | 升级、冒烟清单与回滚 |
| [`docs/cli-release.md`](docs/cli-release.md) | CLI 发版与 npm 发布 |
| [`apps/landing/README.md`](apps/landing/README.md) | 落地页：快照同步与部署接线 |
| [`docs/desktop-plan.md`](docs/desktop-plan.md) | 桌面端：定位、边界、发版 |
| [`docs/archive/`](docs/archive/) | 历史归档（不再维护） |

## ⚖️ License

[MIT](./LICENSE)。代码来源与第三方资产许可见
[`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md) 与
[`packages/cli/THIRD_PARTY_NOTICES.md`](./packages/cli/THIRD_PARTY_NOTICES.md)。
