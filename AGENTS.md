# Agent Instructions

Token Usage — 自托管 AI token 用量追踪（Next.js 16 + HeroUI 3 + Tailwind 4 + Supabase，pnpm workspace）。
从 TokenTrackerSelfhost 重写而来，开源、可自部署；旧仓库仅作参照，代码不回搬。

仓库布局：`apps/web`（Next.js：仪表盘 + CLI 契约层，src 目录结构）；预留 `apps/desktop`
（桌面端）与 `packages/*`（共享代码 / CLI 包）。

目录规范（2026-10-26 操作者裁定）：`apps/web/src/app/` 只放路由——目录与 URL 一一对应
（`page.tsx` + `route.ts`，无路由组），页面级 metadata 也在各 `page.tsx`；登录壳
`AppShell` 由各受保护页面的 `page.tsx` 显式组合（`/login` 与 `/auth/callback` 不套壳）。
页面客户端代码一律放 `apps/web/src/components/<路由名>/`（如 `components/dashboard/`、
`components/service-status/`，文件名与目录对齐），跨页共享件在 `components/` 根。

组件文件命名（2026-10-28 裁定）：`<页名>-client.tsx` / `<页名>-body.tsx` 为编排与主体，
`<页名>-skeleton.tsx` 为骨架；页面内卡片用 `<内容>-card.tsx`，栅格/浮层包装用同前缀
`<内容>-section.tsx`，侧栏用 `<内容>-panel.tsx`，表格 `-table.tsx`，弹窗 `-dialog.tsx` /
`-dialogs.tsx`，纯计算 `-helpers.ts` / `-filters.ts`，钩子 `use-*.ts`。单个组件拆成多文件时
放进同名目录并以 `index.tsx` 收口（如 `charts/`）；单文件组件直接放在所属目录，不建页面级桶文件。

## 优先级链（冲突裁决）

用户当前明确指令 > docs/requirements.md > AGENTS.md > 项目现有代码与架构 > 框架官方最佳实践。
需求与既有规则冲突时：指出冲突、给出可选方案、等操作者确认后再动。

## Commands

| Task | Command |
|------|---------|
| 全部门禁（每次提交前） | `pnpm verify` |
| Dev / Build | `pnpm dev` / `pnpm build` |
| 单个测试文件 | `pnpm vitest run <file>`（M1 起存在） |

## 文档地图（对应任务动手前先读）

| 任务 | 先读 |
|------|------|
| 改 CLI 契约层（`app/api/functions/token-usage-*`） | `docs/cli-contract.md` |
| CLI 发版与 npm 发布 | `docs/cli-release.md` |
| 改数据库、写迁移、迁移/切换/退役操作 | `docs/rewrite-plan.md` §3、§6–7 |
| 写任何 UI | `docs/ui-spec.md` |
| 部署与回滚 | `docs/launch-runbook.md` |

## 硬性约束

1. 契约层的路径、字段、错误码以 `docs/cli-contract.md` §2–3 为唯一规范；旧路径别名
   （`tokentracker-*`，§1.5）行为冻结。变更顺序：先改契约文档与 golden 测试 → 操作者确认 →
   再改实现（实现位于 `apps/web/src/app/api/functions/`）。仪表盘自有接口走 `/api/app/*`。
2. 运行时依赖以 `docs/rewrite-plan.md` §4 预算为准；新增依赖先报操作者批准，获准后同步
   修订预算文档，并选当前最流行、最新的稳定版本（lockfile 锁定）。图表用 recharts；
   动效优先 CSS，确有必要时用 motion（`motion/react`，2026-10-24 裁决、按需安装）。
3. UI 组件选取顺序：HeroUI 内置 → HeroUI 组合 → 自研（沿用 HeroUI 主题体系）。组件有复合
   结构时优先使用复合结构（如 Card.Header/Title/Description、TextField/Label/Input），不手写
   等价 DOM；标题/说明/错误等文本用语义组件（Typography / Label / Description / ErrorMessage /
   FieldError），不用裸 h1–h6/p 标签。细则见 `docs/ui-spec.md`。
4. 框架与组件 API 以项目内真实来源为准：HeroUI 查 `.agents/skills/heroui-react/` 的文档脚本，
   React/Next 规范查 `.agents/skills/vercel-react-best-practices/`，其余以 `node_modules`
   内随版本安装的类型与文档为准。
5. Tailwind spacing 类用数字简写，不写像素任意值：`[Npx]`（N 为 4 的倍数）一律写成
   `N/4`（如 `w-[92px]`→`w-23`、`size-[18px]`→`size-4.5`）。字号（`text-[10px]`）、圆角
   （HeroUI 重定义了 `--radius-*`，机械换算会变值）、模糊等非 spacing 标度保留任意值或语义类。
   覆盖组件自带尺寸时用 important 修饰符（`min-h-2!`），不依赖样式表顺序。
6. 数据访问全部走 route.ts + service-role；`token_*` 表的迁移文件对 `anon`/`authenticated`
   保持零 policy；浏览器端零 Supabase 直连。
7. 机密（service-role key、设备令牌、配对码）只存在于服务端运行时与操作者环境；
   测试与文档一律用伪造值。
8. 采集对账基线 = 本地 `queue.jsonl` 的 last-wins 总数；`token_usage_hourly` 的 upsert 键
   见 `docs/rewrite-plan.md` §3，语义跨版本保持不变。
9. 内部命名统一 `token-usage` / `TOKEN_USAGE_*` / Token Usage；`tokentracker` 前缀仅允许
   出现在旧路径别名（`next.config.mjs` rewrites）与 `docs/cli-contract.md` §1.5。

## 里程碑与闸门

- 按 `docs/rewrite-plan.md` §5 顺序推进；验收线全绿 + 操作者验收 = 里程碑完成。
- G1 采集机切到新域名 / G2 旧 Supabase 项目退役（整项目暂停→删除，新旧项目独立无删表动作）/
  G3 旧仓库处置（§7）必须操作者明确放行，Agent 代行即违规。
- 分支策略：单人维护，直推 main；推送前本地 `pnpm verify`，CI 兜底，出问题 `git revert`。

## Commit Attribution

提交信息用 conventional commits（feat / fix / docs / test / chore）；
AI 提交带 `Co-Authored-By:` trailer（agent 名）。
