<h1 align="center">Token Usage</h1>

<p align="center">
  自托管的 AI token 用量追踪：一个邮箱、多台设备，<br />
  用量与成本数据完全落在<strong>你自己的 Supabase</strong> 里。
</p>

<p align="center">
  <a href="https://github.com/baiwumm/token-usage/actions/workflows/ci.yml"><img src="https://github.com/baiwumm/token-usage/actions/workflows/ci.yml/badge.svg?branch=main&style=flat-square" alt="CI" /></a>
  <img src="https://img.shields.io/badge/%E7%8A%B6%E6%80%81-v1_%E9%87%8D%E5%86%99%E4%B8%AD-F59E0B?style=flat-square" alt="状态：v1 重写中" />
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
  📖 <a href="docs/cli-contract.md">API 契约</a> ·
  📌 <a href="docs/requirements.md">需求真源</a> ·
  🧭 <a href="docs/rewrite-plan.md">计划</a> ·
  🎨 <a href="docs/ui-spec.md">UI 规范</a> ·
  🚀 <a href="docs/launch-runbook.md">发布手册</a> ·
  🤖 <a href="AGENTS.md">开发规范</a>
</p>

> [!NOTE]
> 本项目是 [TokenTracker](https://github.com/xiufengsun/TokenTracker)（MIT）的社区重写版：
> Next.js + HeroUI + Supabase 全栈单应用，与上游无隶属关系。

## ✨ 简介

- **一个账户、多台设备**：桌面 / 笔记本各自的采集端独立配对、独立吊销，用量按账户聚合、按设备下钻
- **数据自主**：每个部署实例绑定自己的 Supabase 项目，采集端只向配对实例上报，跨实例零共享
- **契约先行**：CLI 采集契约两档制——采集面硬冻结、仪表盘面随 UI 演进（[`docs/cli-contract.md`](docs/cli-contract.md)）
- **开源自部署**：Vercel free + Supabase free 即可跑通，部署指南随 M5 发布

## 🧱 技术栈

Next.js 16（App Router）· React 19 · HeroUI 3 · Tailwind CSS 4 · TypeScript 5.9 ·
Supabase（Auth + Postgres，RLS 全拒客户端角色，服务端 service-role 访问）· pnpm workspace

## 📁 项目结构

```text
token-usage/
├── apps/
│   ├── web/        # Next.js：仪表盘 + CLI 契约层（src/ 目录结构）
│   └── desktop/    # 桌面端（预留，backlog）
├── docs/           # 需求真源 / API 契约 / 计划 / UI 规范 / 发布手册
├── .agents/        # 项目级 Agent Skills（heroui-react、vercel-react-best-practices）
├── AGENTS.md       # 开发规范（含 AI Agent 硬性约束）
└── LICENSE         # MIT（含上游衍生声明）
```

## 🚀 快速开始

```bash
pnpm install
pnpm dev        # http://localhost:3000
pnpm verify     # 提交前门禁：lint + typecheck + build
```

前置要求：Node.js 24+、pnpm（版本由根 `packageManager` 字段锁定）。
完整运行需配置服务端环境变量（见 [`docs/rewrite-plan.md`](docs/rewrite-plan.md) §9，
本地放 `apps/web/.env.local`，**密钥严禁提交仓库**）。

## 🗺️ 路线图

M1 契约层 → M2 认证与设置 → M3 仪表盘 → M4 wrapped / 分享 / 服务状态 → M5 配对页与部署文档 →
M-CLI 采集端（`tokenusage-cli`）→ M6 数据迁移与切换。详见 [`docs/rewrite-plan.md`](docs/rewrite-plan.md) §5。

## 📚 文档

| 文档 | 内容 |
| --- | --- |
| [`AGENTS.md`](AGENTS.md) | 开发规范与 AI Agent 硬性约束 |
| [`docs/requirements.md`](docs/requirements.md) | 需求真源：范围、边界、角色、验收标准 |
| [`docs/cli-contract.md`](docs/cli-contract.md) | API 契约（两档制）：CLI 面硬冻结 + Dashboard 面可演进 |
| [`docs/ui-spec.md`](docs/ui-spec.md) | UI 规范：Design Tokens、组件规则、三态与响应式 |
| [`docs/rewrite-plan.md`](docs/rewrite-plan.md) | 计划：表结构、里程碑、数据迁移与切换闸门 |
| [`docs/launch-runbook.md`](docs/launch-runbook.md) | 发布手册：部署顺序、冒烟清单、回滚 |

## ⚖️ License

[MIT](./LICENSE) —— 包含衍生自 [TokenTracker](https://github.com/xiufengsun/TokenTracker)
by xiufengsun (MIT) 的代码，声明见 `LICENSE`。
