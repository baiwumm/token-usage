# 项目维度（Projects 页）实施计划（2026-11-03）

> 目标：新增「项目」菜单页，展示每个项目的 token 消耗、费用、峰值、会话数。
> 本计划只排期与论证，不含代码改动。实测数据均为本机 2026-11-03 读数。
> 关键路径判断：**先用 sessions 数据做阶段 0（不动契约），契约 v2 作为精确口径后续批次**。

## 0. 批次总览

| 批次 | 内容 | 人日 | 依赖 |
|---|---|---|---|
| **批次 1（阶段 0）** | 基于 sessions 的项目页（不动契约、不动 CLI）：聚合接口走 `/api/app/*` 自有面 | 2–2.5 | 无；含「我的建议」中标注 P-必须的三条 |
| **批次 2（契约 v2 + 存储）** | 契约文档 + golden → **操作者确认** → `token_usage_hourly` 加列 + 唯一键扩展 + ingest 实现 | 2 | 批次 1 上线后；**需拍板** |
| **批次 3（CLI 分批套用）** | 46 来源解析器分批把 project 写进桶行；分批顺序按"能可靠拿到项目路径"排序 | 2 | 批次 2 完成（否则新字段被 ingest 白名单丢弃） |
| **批次 4（精确口径切换）** | 聚合 API 双口径并存 → 项目页切换到桶口径；双计防护与混合窗口期规则 | 1.5 | 批次 3 至少交付第一批来源 |

合计 ≈ 8 人日；批次 1 单独即可交付一个可用的项目页。

## 1. 阶段 0 可行性（实测）

**结论：能做，精度代价明确且可标注。** 依据：

- **project_key 覆盖率**：本机 session 队列 182 行 **100% 带 project_key**（opencode 171 / zcode 7 / qoder-cn 2 / codex 2；机制：sidecar 的 `project_ref`（本地 cwd）→ 服务端取 basename 落 `token_sessions.project_key`，表上已有 `(user_id, project_key)` 索引——`supabase/migrations/20261025000000_token_sessions.sql:25,59`）。
- **但 sessions 只覆盖部分来源**：session sidecar 仅 claude/codex/grok/opencode/zcode/kimi 等少数来源产出（`packages/cli/src/lib/session-analytics.js` 的逐源构建分支）；本机 7 天 token 窗口实测 **session 来源占 77.0%**（zcode 54.1% + opencode 22.9%），minimax-code(7.6%) / pi-minimax-cn(6.5%) / trae(3.4%) / dsh(3.2%) / workbuddy(1.7%) / pi-stepfun(0.6%) 的 token 在项目页**不可见**。
- **账户级来源永不出现**：cursor / trae-cn 被 Sessions 设计排除（`token_sessions` CHECK + 上传两端跳过），项目页同样不出现。
- **会失真的指标**：① token 总量/费用按来源天然偏小（缺 23% + 账户级）；② 「峰值」只能到**会话粒度**（单会话 total_tokens 或按 ended_at 的日聚合），v1 无会话内小时桶（契约 §2.7 注记）；③ 跨项目会话整体归入采集时的单一 cwd basename；④ 费用 = 读取时定价引擎估算（订阅制来源为 list price 估算，需标注）。

**阶段 0 交付物**：`/projects` 页面（项目卡列表 + 项目详情：总量/费用/日峰值/会话数/日趋势/Top 模型占比），数据接口走 `/api/app/*`（dashboard 自有面，**不动契约**），页内固定口径标注条（覆盖哪些来源、账户级缺失、估算口径）。估时 2–2.5 人日。

## 2. 批次 1（阶段 0）逐项

| 项 | 改动范围 | 人日 | 验证 |
|---|---|---|---|
| 项目聚合接口 | 新增 `apps/web/src/app/api/app/projects/route.ts`（读 `token_sessions` 按 project_key 分组；时区参数沿用既有 `tz` 约定）；`lib/account/` 加查询函数 | 0.5 | vitest 单测（FakeSupabase 夹具）+ 与 sessions 页同筛选结果对账 |
| 项目页 UI | `app/projects/page.tsx` + `components/projects/`（projects-client / projects-body / project-card / projects-skeleton，命名按 AGENTS 规范）；导航菜单加「项目」；空态与「未归因」卡 | 1 | `pnpm verify` + 浏览器冒烟 |
| 指标口径与标注 | 口径定义（峰值=单日 token 峰值；会话数=session 行数；跨项目会话归单一项目并标注；成本标注估算/实报）；页内固定说明条列出覆盖来源与缺口 | 0.3 | 说明条文案评审 |
| 项目归一化（建议 1，必须） | 展示层归一：同名 basename 合并显示 + 本地映射表（手动改名/合并，存设置）；不做路径上传 | 0.5 | 映射表单测 |
| 未归因引导（建议 2，必须） | null/空 project_key 显式「未归因」分组 + 补齐引导文案（哪些来源不支持） | 0.2 | UI 冒烟 |

## 3. 批次 2（契约 v2 + 存储，需拍板）

| 项 | 改动范围 | 人日 | 风险 | 验证 |
|---|---|---|---|---|
| 契约文档 | `docs/cli-contract.md` §2.4 桶字段表加可选 `project_key`（复用 session 同名规则：basename、去控制字符、≤120）；upsert 键条款改为 `(..., model, project_key)`；§3 不变量加双口径规则；§2.7 聚合语义补 null=未归因 | 0.5 | 契约变更流程本身（约束 1） | golden 先行 |
| golden 测试 | `apps/web/tests/contract/`：ingest 带/不带 project_key 两路、请求内去重键含 project、旧 CLI 行为逐字不变 | 0.5 | — | `pnpm verify` |
| 存储迁移 | 新 migration：`token_usage_hourly` 加 `project_key text`（null 默认）+ 唯一索引重建为 `(user_id, device_id, hour_start, source, model, project_key)`（null 用 `coalesce` 进键或 `nulls not distinct`—— Postgres 15+ 语法，Supabase 可用）；旧数据 project_key=null 即「未归因」，不动数值 | 0.5 | 索引重建锁表（本表行数小，分钟级） | 迁移前后总量比对 SQL |
| ingest 实现 | `lib/ingest/normalize.ts` 白名单 + `route.ts` 校验/upsert 键；`ingest-sanitize.js`（CLI 侧）同步放行 | 0.5 | 键扩展后旧桶（null）与新桶（项目）并存 | golden + 混合窗口测试 |

## 4. 批次 3（CLI 采集分批）

- **能可靠拿到项目的来源**（第一批，约 8–10 个）：session sidecar 已有 `project_ref` 的来源（claude/codex/grok/opencode/zcode/kimi 等）——桶化时把同一项目标识写进桶行，改动集中在 `rollout.js` 各 `appendXxxBuckets` 与 `ingest-sanitize.js` 白名单。
- **能推断但需逐个验证的**（第二批）：qoder/qoder-cn（JSONL 路径含项目段）、workbuddy、dsh（sessions 路径含 project-key 段）等——逐源核对解析器已有路径信息。
- **拿不到的**（文档化、桶落 null）：账户级 cursor/trae-cn（Sessions 本就排除）、kiro 估算制等。
- 每批交付：解析器改动 + fixture 测试 + `reconcile --days 7` 无回归。两批各约 1 人日。

## 5. 批次 4（精确口径切换 + 双计防护）

- 聚合 API：桶口径的项目分组接口（新 `/api/app/*` 路由），与 sessions 口径并存一个版本周期。
- **双计规则**（写进契约 §2.7）：同一 `(hour, source, model)` 若同时存在 null 桶与项目桶，项目页按项目桶展示、null 桶归入「未归因」；总量页（既有图表）保持整表求和——**旧图表口径不变**（默认项，除非拍板改）。
- 切换与验收：项目页切到桶口径后，与 sessions 口径对账误差应收敛到「非 session 来源不再缺失」带来的正向增量；验收阈值：同窗口两口径差 = 非 session 来源 token 量 ±5%。
- 回滚：接口双跑，UI 切换是前端单点改动，`git revert` 即回 sessions 口径。

## 6. 我的建议（计划外新增节）

| # | 建议 | 理由 | 优先级 | 代价 | 风险 |
|---|---|---|---|---|---|
| 1 | **项目归一化映射表**（同名 basename 合并、手动改名/合并，存设置、纯展示层） | 真实坑：`~/work/app` 与 `~/play/app` 都落成 `app`；git worktree 多副本同名；项目改名后历史断裂。不做这个，项目页第一天就会显示错 | **必须**（批次 1） | 0.5–1 | 低；注意别把本地全路径上传（隐私） |
| 2 | **「未归因」显式分组 + 补齐引导** | null 桶若藏进总数，用户会误以为"数字对不上"；显式分组把口径差异变成可解释的产品行为 | **必须**（批次 1） | 0.2 | 低 |
| 3 | **指标口径定义与页内标注**（峰值=日峰值；会话数=session 行数；跨项目会话归主项目并标注；成本区分估算/实报） | 避免「项目页 vs 仪表盘数字对不上」的信任危机；订阅制来源按 list price 估算必须标注 | **必须**（批次 1） | 0.2（设计） | 低 |
| 4 | **项目名隐私开关**（可选脱敏：上传 hash 或本地别名映射；默认维持明文 basename） | 项目名可能带客户/公司信息——与本项目「隐私优先」定位直接相关，契约 v2 落地前表态最便宜（上了协议再改就是行为变更） | **建议**（批次 2 拍板点之一） | 0.5–1 | 中：脱敏后跨设备同名合并变难 |
| 5 | **项目日趋势图**（不仅是总量卡） | 峰值与趋势是项目页区别于 Sessions 页的核心价值；阶段 0 用 `ended_at` 日聚合即可做 | **建议**（批次 1） | 含在批次 1 | 低 |
| 6 | **与全局页口径对账说明条**（项目页底部一行：本页覆盖 X 来源/缺失 Y） | 一条文案消除"两页数字不同"的疑惑，比做完美口径便宜得多 | **建议**（批次 1） | 0.1 | 低 |
| 7 | 项目级预算/阈值提醒、异常突增提示 | 真实价值有，但依赖桶口径精确化；阶段 0 做会基于 77% 覆盖率的错误基数误报 | **可选**（批次 4 后另议） | 1–2 | 中 |
| 8 | 服务端预聚合表 | 项目数 < 数百时分页查询足够；预聚合表是新的对账面，不值 | **不建议现在做** | — | — |
| 9 | 多设备合并展示 | `token_sessions` 本就按 user 聚合、带 device_id——项目页天然跨设备合并，**无需额外工作**，只需文案说明 | 无需做 | 0 | 低 |

**最值得先做的 3 条**：#1 归一化映射（决定数据可信度）、#3 口径定义与标注（决定用户信任）、#2 未归因分组（决定迁移期体验）——三条都在批次 1 内，合计约 1 人日。

## 7. 待拍板事项

1. **契约破坏性变更**：bucket 加 `project_key` + upsert 键扩展（批次 2 前提，按约束 1 流程走）。
2. **迁移期「未归因」分组**：接受混合版本窗口期存在 null 桶分组（预计持续一个 CLI 版本周期）。
3. **旧图表口径保持**：总量页整表求和不变（默认）；若要让总量页也按新键拆分需另议。
4. **项目名隐私开关默认值**：明文 basename（现状语义）还是默认脱敏。
5. **阶段 0 精度标注文案**：页面固定说明条的措辞与位置（UI 评审）。

## 8. 完成定义（可测）

- 批次 1：项目页四项指标与 Sessions 页同筛选口径**完全一致**（同源数据，差异为 0）；口径说明条展示覆盖/缺失来源清单；`pnpm verify` 绿 + 浏览器冒烟通过。
- 批次 2：契约 golden 全绿；迁移前后 `token_usage_hourly` 总量逐键一致（迁移校验 SQL）；旧 CLI（不带 project_key）行为逐字不变。
- 批次 3：分批来源清单全量落地；「能拿/拿不到项目」清单写入 `docs/sources-capture-audit.md`。
- 批次 4：混合窗口期双计防护有契约测试；项目页桶口径 vs sessions 口径差 = 非 session 来源量 ±5%；`reconcile --days 7` 在两台采集机均无漂移。

## 9. 批次 1 交付记录（2026-11-03）

- 已交付：`/api/app/projects`（cookie 会话鉴权，与 `/api/app/sync-runs` 同模式）+ `/projects`
  页面（列表/排序/7D·30D 切换/口径标注条/未归因沉底/空态）+ 单测 14 例；`pnpm verify` 全绿。
- 口径实测（本机 2026-10-28..11-03，Asia/Shanghai）：sessions 口径 20 会话 / 253.02M tokens /
  $6.38；与 7 天 token 队列（343.40M）的差即非 session 来源与账户级来源量（≈26%，与 §1
  的 77% 覆盖率估算一致）。
- 范围裁剪：手动改名/合并只做挂点（`components/projects/identity.ts` 直通函数），完整映射表
  UI 留待后续；项目日趋势图、隐私开关、预算提醒未做（见 §6 优先级）。
