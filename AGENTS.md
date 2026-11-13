# Agent Instructions

Token Usage — 自托管 AI token 用量追踪（Next.js 16 + HeroUI 3 + Tailwind 4 + Supabase，pnpm
workspace）。开源、可自部署；每个实例只写自己的 Supabase，浏览器零直连数据表。

**优先级链（冲突裁决）**：用户当前明确指令 > `docs/requirements.md` > 本文 > 项目现有代码与
架构 > 框架官方最佳实践。需求与既有规则冲突时，先指出冲突、给出选项，等操作者确认再动手。

## 仓库布局

| 路径 | 内容 |
| --- | --- |
| `apps/web` | Next.js：仪表盘 + CLI 契约层（`src/` 目录结构） |
| `packages/cli` | 采集 CLI（npm `tokenusage-cli`，命令 `tokenusage`） |
| `apps/landing` | 官方落地页（纯静态单页，`output: "export"`，部署 token-usage.cc） |
| `apps/desktop` | 桌面端托盘伴生工具（Tauri 2 + web 同构前端栈） |
| `supabase/migrations/` | Postgres 迁移，按文件名顺序执行，幂等 |
| `scripts/` | 运维脚本；活脚本与归档的区分见 `scripts/README.md` |
| `docs/` | 需求、契约、UI 规范、部署与运维手册；历史记录在 `docs/archive/` |

## Commands

| Task | Command |
| --- | --- |
| 全部门禁（每次提交前） | `pnpm verify` |
| Dev / Build | `pnpm dev` / `pnpm build` |
| 落地页 / 桌面端 dev | `pnpm dev:landing` / `pnpm dev:desktop` |
| 单个测试文件 | `pnpm --filter @token-usage/web exec vitest run <file>` |

本机为 Git Bash：用 POSIX 语法（`ls`/`mv`/`rm`）。跨 `apps/`、`packages/` 的大范围 grep 很慢，
优先用代码检索工具或只扫 `docs/`。

## 文档地图（动手前先读对应文档）

| 任务 | 先读 |
| --- | --- |
| 改 CLI 契约层（`app/api/functions/token-usage-*`） | `docs/cli-contract.md` |
| 改数据库、写迁移 | `docs/rewrite-plan.md` §3 |
| 写任何 UI | `docs/ui-spec.md` |
| 成就阈值、目录、计算规则 | `docs/achievements-plan.md` |
| 公开徽章、公开页、Settings 徽章卡 | `docs/badge.md` |
| 来源采集机制、积分制、账户级来源 | `docs/sources-capture-audit.md` |
| 邀请建号与首次登录 | `docs/invite-flow.md` |
| 从零部署 / 升级与回滚 | `docs/deploy-guide.md` / `docs/launch-runbook.md` |
| CLI 发版与 npm 发布 | `docs/cli-release.md` |
| 落地页（文案、快照、部署接线） | `apps/landing/README.md` |
| 桌面端（定位、边界、发版、updater） | `docs/desktop-plan.md` |
| 运维脚本 | `scripts/README.md` |
| 当前待办与待决策 | `docs/rewrite-plan.md` §7 |
| 历史记录 | `docs/archive/` |

## 目录与命名

**路由**：`apps/web/src/app/` 只放路由，目录与 URL 一一对应（`page.tsx` + `route.ts`，无路由组），
页面级 metadata 也在 `page.tsx`。`AppShell` 由各受保护页面的 `page.tsx` 显式组合（`/login` 与
`/auth/callback` 不套壳）。

**页面组件**：一律放 `apps/web/src/components/<路由名>/`，跨页共享件放 `components/` 根。

**页面级组件文件后缀（登记制）**：

| 后缀 | 角色 |
| --- | --- |
| `-client.tsx` / `-body.tsx` / `-skeleton.tsx` | 编排 / 主体 / 骨架 |
| `-card.tsx` / `-cards.tsx` | 卡片 / 卡片组 |
| `-section.tsx` / `-panel.tsx` / `-panels.tsx` | 栅格、浮层包装 / 侧栏面板块 |
| `-table.tsx` / `-bar.tsx` / `-row.tsx` / `-cells.tsx` | 表格 / 筛选条 / 行 / 单元格 |
| `-dialog.tsx` / `-dialogs.tsx` / `-tooltip.tsx` | 弹窗 / tooltip 面板 |
| `-header.tsx` / `-footer.tsx` / `-states.tsx` | 页头 / 页脚 / 状态与空态 |
| `-helpers.ts` / `-filters.ts` / `-filter.tsx` | 纯计算 / 筛选逻辑 / 单选筛选控件 |
| `use-*.ts` | 钩子 |
| `-chips.tsx` / `-summary.tsx` / `-strip.tsx` / `-preview.tsx` / `-note.tsx` | 徽章组 / 摘要块 / 单值小卡 / 预览 / 说明块 |
| `-art.tsx` / `-logo.tsx` / `-icon.tsx` | 图形插画 / logo / 图标 |

新增后缀角色须先回写本表再使用。单个组件拆成多文件时放进同名目录并以 `index.tsx`（纯 TS 用
`index.ts`）收口。`docs/ui-spec.md` 明确列出的文件名（如公开页 `u/` 下的 `u-body.tsx`）为特批例外。

以下文件不受后缀集合约束，按职责命名：`components/` 根级跨页共享件（如 `flow-number.tsx`、
`data-table-card.tsx`）；拆分目录内的文件（如 `app-shell/sidebar.tsx`、`share-card/vinyl.ts`）；
页面目录内的纯逻辑 `.ts`（如 `dashboard/aggregate.ts`）；桌面端 `app.tsx` 与 `lib/`、`styles/`。

桌面端组件遵循同一登记制，清单登记在 `docs/desktop-plan.md` §4。

## 硬性约束

1. **契约层**：路径、字段、错误码以 `docs/cli-contract.md` §2–3 为唯一规范。变更顺序：先改契约
   文档与 golden 测试 → 操作者确认 → 再改实现（`apps/web/src/app/api/functions/`）。仪表盘自有
   接口走 `/api/app/*`。旧 `tokentracker-*` 路径已退役，请求得到 GET 404 / 写动词 405。
2. **依赖**：运行时预算见 `docs/rewrite-plan.md` §4，新增依赖先报操作者批准并同步修订预算。图表
   用 recharts；动效优先 CSS，确有必要用 motion（`motion/react`）。新依赖取当前最流行的最新稳定版。
3. **UI 组件**：HeroUI 内置 → HeroUI 组合 → 自研（沿用 HeroUI 主题体系）。有复合结构时用复合结构
   （Card.Header/Title/Description、TextField/Label/Input），不手写等价 DOM；文本用语义组件
   （Typography / Label / Description / ErrorMessage / FieldError），不用裸 h1–h6/p。
4. **API 以项目内真实来源为准**：HeroUI 查 `.agents/skills/heroui-react/` 的文档脚本，React/Next
   规范查 `.agents/skills/vercel-react-best-practices/`，其余以 `node_modules` 里的类型与文档为准。
5. **Tailwind spacing** 用数字简写：`[Npx]`（N 为 4 的倍数）写成 `N/4`（`w-23`、`size-4.5`）。
   字号、圆角、模糊等非 spacing 标度保留任意值或语义类。覆盖组件自带尺寸用 important 修饰符（`min-h-2!`）。
6. **数据访问**：全部走 `route.ts` + service-role；`token_*` 表对 `anon`/`authenticated` 保持零
   policy；浏览器端零 Supabase 直连。
7. **机密**：service-role key、设备令牌、配对码只存在于服务端运行时与操作者环境；测试与文档
   一律用伪造值。
8. **对账基线**：本地 `queue.jsonl` 的 last-wins 总数；`token_usage_hourly` 的 upsert 键见
   `docs/rewrite-plan.md` §3，语义跨版本不变。
9. **命名**：内部统一 `token-usage` / `TOKEN_USAGE_*` / Token Usage；`tokentracker` 前缀只允许
   出现在历史记录与迁移事实中（旧域名、旧表名、旧计划任务名），对外路径与配置一律 `token-usage`。
10. **上游署名**只出现在根 `LICENSE`、根 `THIRD_PARTY_NOTICES.md` 与 `packages/cli/` 的两份同名
   文件；README、docs 与 UI 文案只指向它们，不重复罗列上游名。

## 闸门、分支与提交

- **不可逆操作**（退役项目、删除数据、切换域名）必须操作者明确放行，Agent 代行即违规。
- 单人维护，直推 main；推送前本地 `pnpm verify`，CI 兜底，出问题 `git revert`。
- 提交信息用 conventional commits（feat / fix / docs / test / chore / refactor），AI 提交带
  `Co-Authored-By:` trailer。
- 文档与实现同步：改了行为就回写对应文档；需求变更回写 `docs/requirements.md`，历史性记录只
  写进 `docs/archive/`。
