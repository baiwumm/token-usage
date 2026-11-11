<h1 align="center">Token Usage</h1>

<p align="center">
  自托管的 AI token 用量追踪：一个邮箱、多台设备，<br />
  用量与成本数据完全落在<strong>你自己的 Supabase</strong> 里。
</p>

<p align="center">
  <a href="https://github.com/baiwumm/token-usage/actions/workflows/ci.yml"><img src="https://github.com/baiwumm/token-usage/actions/workflows/ci.yml/badge.svg?branch=main&style=flat-square" alt="CI" /></a>
  <img src="https://img.shields.io/badge/%E7%8A%B6%E6%80%81-v1_%E5%B7%B2%E4%B8%8A%E7%BA%BF-3FB950?style=flat-square" alt="状态：v1 已上线" />
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-0A0A0A?style=flat-square" alt="MIT License" /></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-111?style=flat-square&logo=nextdotjs&logoColor=fff&labelColor=111" alt="Next.js 16" />
  <img src="https://img.shields.io/badge/React-19-111?style=flat-square&logo=react&logoColor=61DAFB&labelColor=111" alt="React 19" />
  <img src="https://img.shields.io/badge/HeroUI-3-111?style=flat-square&logo=heroui&logoColor=fff&labelColor=111" alt="HeroUI 3" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-4-111?style=flat-square&logo=tailwindcss&logoColor=38BDF8&labelColor=111" alt="Tailwind CSS 4" />
  <img src="https://img.shields.io/badge/Supabase-Postgres-111?style=flat-square&logo=supabase&logoColor=3FCF8E&labelColor=111" alt="Supabase Postgres" />
  <img src="https://img.shields.io/badge/TypeScript-5.9-111?style=flat-square&logo=typescript&logoColor=3178C6&labelColor=111" alt="TypeScript 5.9" />
  <img src="https://img.shields.io/badge/pnpm-workspace-111?style=flat-square&logo=pnpm&logoColor=F9AD00&labelColor=111" alt="pnpm workspace" />
</p>

<p align="center">
  <a href="https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fbaiwumm%2Ftoken-usage&project-name=token-usage&repository-name=token-usage">
    <img src="https://vercel.com/button" alt="Deploy with Vercel" />
  </a>
</p>

<p align="center">
  🌐 <a href="https://token-usage.cc">token-usage.cc</a> ·
  📖 <a href="docs/cli-contract.md">API 契约</a> ·
  📌 <a href="docs/requirements.md">需求真源</a> ·
  🧭 <a href="docs/rewrite-plan.md">计划</a> ·
  🎨 <a href="docs/ui-spec.md">UI 规范</a> ·
  🚀 <a href="docs/launch-runbook.md">发布手册</a> ·
  🤖 <a href="AGENTS.md">开发规范</a>
</p>

<p align="center">
  <a href="https://token-usage.baiwumm.com/u/tu_badge_JTYz-Anbuv5AfcW8rOaoNNeB472Dqsw-">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://token-usage.baiwumm.com/api/badge?token=tu_badge_JTYz-Anbuv5AfcW8rOaoNNeB472Dqsw-&style=sparkline&theme=dark&project=token-usage">
      <img src="https://token-usage.baiwumm.com/api/badge?token=tu_badge_JTYz-Anbuv5AfcW8rOaoNNeB472Dqsw-&style=sparkline&theme=light&project=token-usage" alt="Token Usage badge" width="600">
    </picture>
  </a>
  <br />
  <sub>作者本人的实时用量——由本项目的<a href="docs/badge.md">公开徽章</a>渲染，点击查看公开页</sub>
</p>

> [!NOTE]
> 独立社区项目。代码来源与第三方许可见 [`LICENSE`](./LICENSE) 与
> [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md)。

## ✨ 简介

- **一个账户、多台设备**：桌面 / 笔记本各自的采集端独立配对、独立吊销，用量按账户聚合、按设备下钻
- **数据自主**：每个部署实例绑定自己的 Supabase 项目，采集端只向配对实例上报，跨实例零共享
- **可观测**：仪表盘 / Sessions 会话明细（支持按当前筛选导出 CSV）/ 采集运行记录 / 成就墙；积分（credits）作为独立维度展示，不混入 token 与成本
- **契约先行**：CLI 采集契约两档制——采集面硬冻结、仪表盘面随 UI 演进（[`docs/cli-contract.md`](docs/cli-contract.md)）
- **项目名明文**：项目名按工作目录的 basename 明文上报并原样展示（用于跨设备同名合并），暂不提供脱敏开关；敏感目录请自行评估
- **开源自部署**：Vercel free + Supabase free 即可跑通，见[部署指南](docs/deploy-guide.md)

## 🧱 技术栈

Next.js 16（App Router）· React 19 · HeroUI 3 · Tailwind CSS 4 · TypeScript 5.9 ·
Supabase（Auth + Postgres，RLS 全拒客户端角色，服务端 service-role 访问）· pnpm workspace

## 📁 项目结构

```text
token-usage/
├── apps/
│   └── web/          # Next.js：仪表盘 + CLI 契约层（src/ 目录结构）
├── packages/
│   └── cli/          # 采集 CLI（npm: tokenusage-cli）
├── supabase/
│   └── migrations/   # Postgres 迁移（按时间戳顺序）
├── scripts/          # 运维脚本（admin 工具等）
├── docs/             # 需求真源 / API 契约 / 计划 / UI 规范 / 发布手册
├── .agents/          # 项目级 Agent Skills（heroui-react、vercel-react-best-practices）
├── .github/          # CI 工作流
├── AGENTS.md         # 开发规范（含 AI Agent 硬性约束）
├── THIRD_PARTY_NOTICES.md  # 第三方资产与许可登记
└── LICENSE         # MIT
```

## 🚀 快速开始

```bash
pnpm install
pnpm dev        # http://localhost:3000
pnpm verify     # 提交前门禁：lint + typecheck + test + build
```

前置要求：Node.js 22.19+（CLI 采集端的 `engines` 下限）、pnpm（版本由根 `packageManager` 字段锁定）。
完整运行需配置服务端环境变量（见 [`docs/rewrite-plan.md`](docs/rewrite-plan.md) §9，
本地放 `apps/web/.env.local`，**密钥严禁提交仓库**）。

## 🗺️ 路线图

v1（M0–M7）已于 2026-10-30 全部完成并上线；采集端 CLI 当前 0.4.7。
剩余待办与待拍板事项见 [`docs/rewrite-plan.md`](docs/rewrite-plan.md) §10。

## 📚 文档

| 文档 | 内容 |
| --- | --- |
| [`AGENTS.md`](AGENTS.md) | 开发规范与 AI Agent 硬性约束 |
| [`docs/requirements.md`](docs/requirements.md) | 需求真源：范围、边界、角色、验收标准 |
| [`docs/rewrite-plan.md`](docs/rewrite-plan.md) | 计划：表结构、里程碑、数据迁移、当前状态与剩余事项 |
| [`docs/cli-contract.md`](docs/cli-contract.md) | API 契约（两档制）：CLI 面硬冻结 + Dashboard 面可演进 |
| [`docs/ui-spec.md`](docs/ui-spec.md) | UI 规范：Design Tokens、组件规则、三态与响应式、各页面版式 |
| [`docs/achievements-plan.md`](docs/achievements-plan.md) | 成就系统：18 条 × 5 档、阈值校准、实施与验收记录 |
| [`docs/badge.md`](docs/badge.md) | 公开徽章与公开页：SVG 端点、令牌、口径、Settings 配置面 |
| [`docs/sources-capture-audit.md`](docs/sources-capture-audit.md) | 来源采集机制：双平面原则、账户级来源、缺口审计 |
| [`docs/sources-capture-plan.md`](docs/sources-capture-plan.md) | 来源接入结论索引（Trae CN / credits 全链路 / 上游对齐） |
| [`docs/cli-release.md`](docs/cli-release.md) | CLI 发版手册：tag 流水线、版本升级与实测记录 |
| [`docs/invite-flow.md`](docs/invite-flow.md) | 邀请注册与设备配对流程 |
| [`docs/deploy-guide.md`](docs/deploy-guide.md) | 部署指南：Supabase + Vercel 从零跑通 |
| [`docs/launch-runbook.md`](docs/launch-runbook.md) | 发布手册：部署顺序、冒烟清单、回滚 |
| [`docs/archive/`](docs/archive/) | 历史归档（已完成且不再维护的计划与对比结论） |
| [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) | 第三方资产与许可登记（品牌图标、字体、定价快照、代码来源） |

## 🌍 English

**Token Usage** is a self-hosted AI token usage tracker — one account, many collector
devices, CLI-based reporting, aggregated usage & cost dashboards, session details,
collector run history, vendor credits, and an account-level achievement wall. All data
lives in **your own Supabase** project; nothing is shared across instances. It is an
independent community project; code provenance and third-party licenses live in
[`LICENSE`](./LICENSE) and [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md).

- **Stack**: Next.js 16 (App Router) · React 19 · HeroUI 3 · Tailwind CSS 4 · Supabase (Auth + Postgres, RLS denies all client roles) · pnpm workspace
- **Deploy**: Supabase (free tier) + Vercel (Hobby) is enough — see the [deploy guide](docs/deploy-guide.md) (Chinese, step by step) or use the Deploy button above
- **Pairing**: the collector CLI prints a `XXXX-XXXX` code and opens `/device?user_code=...`; you approve it after signing in, and reporting starts immediately
- **CLI contract**: two-tier — the collector-facing API is frozen, the dashboard API evolves with the UI ([`docs/cli-contract.md`](docs/cli-contract.md))
- **Plaintext project names**: the collector reports each project as the working directory's basename and the dashboard shows it verbatim (so the same name merges across devices). There is no redaction switch yet — evaluate sensitive directory names before collecting

## ⚖️ License

[MIT](./LICENSE)。代码来源与第三方资产的许可登记见
[`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md) 与
[`packages/cli/THIRD_PARTY_NOTICES.md`](./packages/cli/THIRD_PARTY_NOTICES.md)。
