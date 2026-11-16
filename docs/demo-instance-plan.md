# demo 实例 · 立项方案

官方站三件套的最后一件：一个独立部署的 `apps/web` 演示实例，让访客不部署、不配对采集器
就能点开仪表盘看真实功能。

**状态：已上线（2026-11-16）**。P0–P2 代码与文档已交付；P3 已执行完毕：demo Supabase
`ipvyswlsnnciomcfyyma`（21 个迁移）、Vercel 项目 `token-usage-demo`（Root `apps/web`）、
域名 `demo.token-usage.cc`（CNAME → `dade1ad6f76af9b4.vercel-dns-017.com`）、三个 Actions
secret + 一个 variable、首次灌数与 nightly reseed 均成功。实测：匿名 `/` 307 → 自动登录 →
200；契约与 `/api/app/*` 写操作 403；公开页与徽章 SVG 200；`public-config` 指向 demo 库。落地清单：`scripts/demo/`（生成器 + 种子脚本）、
`apps/web/src/lib/demo.ts` + `src/proxy.ts` 闸门 + `/api/app/demo-login`、
`components/app-shell/demo-banner.tsx`、landing 的 `src/lib/demo-url.ts` 与三处入口、
`.github/workflows/demo-reseed.yml`、运维手册 `docs/demo-instance.md`。
操作步骤按 [`docs/demo-instance.md`](demo-instance.md) 执行。

本文是 demo 实例的单一真源：决策、数据面、只读边界、部署接线、验收全在此。
运维手册（建库 / 建号 / 绑域 / 重置 / 排障）在执行期从 §5 扩写为独立的
`docs/demo-instance.md`。

## 1. 已拍板决策（2026-11-16 操作者逐项确认）

| # | 决策点 | 结论 |
| --- | --- | --- |
| D1 | demo 数据来源 | **独立 Supabase 项目 + 确定性 mock 种子脚本**；不借用生产实例、不真跑采集端 |
| D2 | 接入形态 | **`demo.token-usage.cc` 子域**；Vercel 承载 web 实例，子域由操作者在腾讯云控制台绑定 |
| D3 | 注册与配对 | **纯只读演示账号**：关闭公开注册、禁用设备配对、所有写请求 403 |
| D4 | landing 入口 | **保留生产公开页与徽章做数字证据**，另加「在线演示」入口指向 demo 仪表盘 |
| D5 | 成本与生命周期 | **Supabase Free + Vercel Hobby**；GitHub Actions 每晚重灌种子数据（顺带保活 Free 项目） |

## 2. 硬边界

- demo 与操作者生产实例 `token-usage.baiwumm.com` **相互隔离**（官方域名决策 #19，
  `docs/archive/rewrite-plan-2026-11.md`）：不同 Supabase 项目、不同 Vercel 项目、不同域名，
  唯一共享物是 Git 仓库代码；
- 代码里不出现任何实例地址：实例身份只由环境变量决定，`apps/web` 镜像同源；
- 每个 Supabase 实例只写自己的数据；浏览器零直连数据表；`token_*` 表零 policy
  （**本方案不新增迁移**，种子只写现有表）；
- 不可逆操作（删数据、切域名、退役实例）必须停下来问操作者；
- demo 不采集真实用户数据：种子内容是虚构项目名 / 虚构仓库，不含操作者真实账密与业务信息。

## 3. 架构

```text
demo.token-usage.cc  ← Vercel 项目（仓库同源，Root Directory = apps/web）
  │  环境变量全部指向「demo Supabase」，TOKEN_USAGE_DEMO=on
  ▼
apps/web（route.ts + service-role）  ──►  demo Supabase（token_* 表，RLS 零 policy）
  ▲                                        ▲
  │ 访客 cookie 会话（自动登录演示账号）      │ GH Actions 每晚 03:00 UTC 跑 seed
  └─ token-usage.cc（landing）外链 ──────────┘
```

访客路径：点击 landing 的「在线演示」→ demo 根路径 → 未登录时 proxy 直跳
`/api/app/demo-login?next=/` → 服务端以演示账号登录并写 cookie → 302 回仪表盘。

## 4. 数据面：`scripts/demo/`

沿用 `scripts/admin/create-user.cjs` 的风格：`node:` + `fetch` 打 PostgREST / Auth admin，
**零新依赖**（不动 `docs/rewrite-plan.md` §4 依赖预算）。

| 文件 | 职责 |
| --- | --- |
| `scripts/demo/generate.mjs` | 纯函数确定性生成器（mulberry32 + `--seed`）：输入「今天 + 120 天窗口」，输出各表行数组；可单测 |
| `scripts/demo/seed.mjs` | 编排：读 env → 确保演示账号存在（Auth admin，`email_confirm`）→ 只按该 `user_id` 清表 → 批量 upsert → 打印摘要 |

支持参数：`--days 120`、`--seed <int>`、`--dry-run`、`--env-file <path>`、`--force`。

写入内容（窗口固定「最近 120 天」，随日期滚动，永不陈旧）：

| 表 | 规模 | 设计要点 |
| --- | --- | --- |
| `token_devices` | 3 台 | MacBook Pro / Windows 工作站 / Linux 服务器；含 1 台已吊销做展示 |
| `token_usage_hourly` | ≈1.5–3 万行 | 工作日白天重、夜间与周末有量（喂夜猫子 / 周末类成就）；`project_key` 4 个虚构项目 |
| `token_sessions` | ≈500 行 | 避开账户级来源（CHECK `lower(source) not in ('cursor','trae-cn')`）；`models` ≤32 且 `total_tokens` 自洽 |
| `token_sync_runs` | ≈480 行 | 每天 4 轮，以 ok 为主、少量 partial / error 展示三态 |
| `token_project_profiles` | 4 行 | 仅虚构 `display_name` 与不存在的仓库地址 |
| `token_public_badge_settings` | 1 行 | `enabled` / `page_enabled` 开；`display_name="Token Usage Demo"`；时区 `Asia/Shanghai`；`page_token` 由 seed 常量派生并**固定** |
| `token_public_badges` | 1–2 行 | 令牌同样固定派生，`style=sparkline` |
| `token_achievement_seen` | 不写 | 保留「新」标记的观感 |

- **模型取真实可定价集合**：以 `apps/web/src/lib/sources.ts` 的 source id 与
  `apps/web/src/lib/pricing` 的定价表为准；脚本带定价自检，避免成本列全 0。
- **安全护栏**：清表前校验「实例只有 1 个用户」，否则拒绝（仅 `--force` 可越过）——
  种子脚本永远打不进多用户的生产库。
- **确定性**：同一 `--seed` + 同一日期 → 输出逐字节相同；重灌后徽章数字不随机漂移，
  公开页令牌与徽章令牌跨重灌保持不变。

## 5. 只读闸门与演示登录（`apps/web`）

| 位置 | 改动 |
| --- | --- |
| `src/lib/demo.ts`（新） | `isDemoInstance()`（读 `TOKEN_USAGE_DEMO`）、演示文案 key、配置护栏 |
| `src/proxy.ts` | demo 模式：写动词（非 GET / HEAD / OPTIONS）打向 `/api/**` 一律 `403 {"error":"Demo instance is read-only"}`，只放行 `/api/app/demo-login`；未登录访问受保护页 → 直跳 `/api/app/demo-login?next=<原路径>` |
| `src/app/api/app/demo-login/route.ts`（新） | 非 demo 模式 404；demo 模式用服务端 `@supabase/ssr` 客户端以 `TOKEN_USAGE_DEMO_EMAIL` / `TOKEN_USAGE_DEMO_PASSWORD` 登录写 cookie，302 回 `next`（口令不出服务端） |
| `src/components/app-shell/demo-banner.tsx`（新）+ `index.tsx` | 壳顶部 strip：「演示实例 · 只读 · 数据每晚重置 · 前往自部署」，内容水平居中（避开左侧栏视觉重心） |
| Settings / 徽章 / Projects / `/device` 客户端组件 | demo 模式隐藏或 disable 写操作（新增/吊销/删除徽章、改资料、改项目、设备改名/吊销、批准配对），统一提示「演示实例不可修改」 |
| 配置护栏 | demo 模式下 `TOKEN_USAGE_DASHBOARD_URL` 命中生产域名 → 启动即 500「misconfigured demo」 |

新增环境变量（批准后同步回写 `docs/rewrite-plan.md` §5）：

```text
TOKEN_USAGE_DEMO=on                   # 服务端闸门
NEXT_PUBLIC_TOKEN_USAGE_DEMO=on        # 客户端提示与禁用态（构建期内联）
TOKEN_USAGE_DEMO_EMAIL=…               # 服务端专用，自动登录
TOKEN_USAGE_DEMO_PASSWORD=…            # 服务端专用，绝不进浏览器包
```

> **待批准冲突点**：写请求挡在 `proxy.ts`，而不是逐个 handler 加错误码，目的是不触碰
> 「契约层错误码冻结」（AGENTS 硬性约束 1）。代价是 `docs/cli-contract.md` §1 需补一句
> 「部署级 demo 模式对写动词返回 403」。按约束 1 的顺序，动工前先改契约文档草案交操作者
> 确认，再改实现。

## 6. landing 入口（`apps/landing`）

| 文件 | 改动 |
| --- | --- |
| `src/lib/demo-url.ts`（新） | `DEMO_URL = "https://demo.token-usage.cc"` 单一常量（landing 无运行时 env，仍按构建期固化） |
| `src/components/landing/nav-bar.tsx` + `src/lib/copy.ts` | 顶栏「在线演示」纯图标按钮（icon-only + tooltip）；顶栏原「公开页」按钮已移除，公开页入口只留页脚徽章区 |
| `src/components/landing/hero.tsx` 或 `deploy.tsx` 邻近区块 | 主 CTA 旁加次级「在线演示」 |
| `src/components/landing/site-footer.tsx` | 页脚加一行指向 demo；徽章与 `/u/` 公开页**仍解析 README、仍指生产实例**（`badge-url.ts` 不改） |
| 仓库根 `README.md` | 加一处 demo 链接（landing 之外的第二公开出处） |

## 7. 运维接线（操作者执行，Agent 给清单与自检命令）

1. 建第二个 Supabase 项目（Free）→ 取 URL / publishable / secret；`npx supabase link` +
   `npx supabase db push`（21 个迁移）；
2. Auth：关闭 **Allow new users to sign up**；Site URL 与 Redirect URLs 填
   `https://demo.token-usage.cc/**`；
3. Vercel 新项目：导入同仓库，Root Directory `apps/web`，开启 *Include files outside the
   root directory in the Build Step*，填 §5 四个变量 + 三组 Supabase key +
   `TOKEN_USAGE_DASHBOARD_URL=https://demo.token-usage.cc`；
4. Vercel 绑 `demo.token-usage.cc`（按提示加 TXT 校验）；DNSPod 加 CNAME；
5. GitHub Secrets：`DEMO_SUPABASE_URL` / `DEMO_SUPABASE_SECRET_KEY` / `DEMO_DEMO_PASSWORD`；
6. 首次执行一次 seed（本地或 `workflow_dispatch`）。

新增 `.github/workflows/demo-reseed.yml`：`cron: 0 3 * * *` + `workflow_dispatch`，跑
`node scripts/demo/seed.mjs`；失败只在 Actions 内告警，不阻塞 main 的其它门禁。该定时任务
同时承担 Free 项目保活（闲置 7 天会被暂停）。

## 8. 分期

| 期 | 内容 | 负责人 |
| --- | --- | --- |
| P0 | `generate.mjs` + `seed.mjs` + 单测 + 种子摘要自检 | Agent |
| P1 | 只读闸门 + demo 登录 + 只读 UI 提示 + 契约文档草案（先确认后实现）+ contract 测试 | Agent |
| P2 | landing 入口 + 文案 + README + 文档回写（rewrite-plan §7 / requirements / landing README） | Agent |
| P3 | 建库 / 建号 / 部署 / 绑域 / secrets / 启用 nightly workflow | 操作者 |

## 9. 验收标准

- `https://demo.token-usage.cc/` 匿名打开 ≤2 跳直达仪表盘；仪表盘、Sessions、Projects、
  Sync-runs、Wrapped、Achievements 均有数据；`/settings` 只读且写操作被禁；
- 写请求被拒：直接 `POST /api/functions/token-usage-ingest`、`POST /api/app/badge` 返回 403；
- 浏览器网络面板零 Supabase 数据表直连（仅认证流量），demo Supabase 的 `token_*` 仍零 policy；
- 隔离证据：两侧 Supabase project ref 不同，seed 摘要里的 `user_id` 不出现在生产库；
- `token-usage.cc` 顶栏 / 页脚 / CTA 的 demo 链接可达且指向正确；生产公开页与页脚徽章保持原样；
- 本地 `pnpm verify` 全绿。

## 10. 测试

| 文件 | 断言 |
| --- | --- |
| `apps/web/tests/unit/demo-seed-generator.test.ts` | 同 seed 同日期输出一致；模型全部可定价；sessions 不触 CHECK；令牌派生稳定 |
| `apps/web/tests/unit/demo-mode.test.ts` | `isDemoInstance()` 与生产域名护栏；
  `TOKEN_USAGE_DEMO` 缺省为 off（生产行为不变） |
| `apps/web/tests/contract/demo-readonly.test.ts` | demo 环境起 dev server：POST / PATCH / DELETE 打 `/api/**` → 403；GET 与 `/api/app/demo-login` 正常 |

## 11. 风险与对冲

| 风险 | 对冲 |
| --- | --- |
| Supabase Free 项目 7 天闲置暂停 | 每晚 reseed 保活；workflow 停跑需人工补一次 |
| Free 组织项目数上限 | 若操作者已有 2 个项目需先腾位或升级，P3 前确认 |
| 共享演示账号没有访客隔离 | 纯只读 + 每晚重灌；写闸门在服务端（proxy），不靠 UI |
| 契约层改动 | 403 只做部署级 proxy 闸门，不动 handler 与错误码；文档先行并经操作者确认 |
| 子域绑域不可由 Agent 完成 | P3 由操作者控制台操作，Agent 提供逐条清单与自检 |
| 种子内容泄露真实信息 | 全部虚构项目名与仓库；脚本不读任何本机采集数据 |

## 12. 会话中断后的恢复指引

1. 读本文 §1（决策）与 §8（分期），看 `docs/rewrite-plan.md` §7 第 7 条的状态；
2. 未批准 → 等操作者；已批准 → 从 §8 未完成的期开始，先跑 `pnpm verify` 确认基线绿；
3. 每期收尾：回写本文状态、`docs/rewrite-plan.md` §7、必要时 `docs/requirements.md`，
   提交用 conventional commits + `Co-Authored-By: ZCode <noreply@zcode.ai>`。
