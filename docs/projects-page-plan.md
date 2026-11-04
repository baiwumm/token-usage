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

> 实现（2026-11-04）：`GET /api/app/projects-hourly`（`apps/web/src/lib/api/projects-hourly.ts`）按 `token_usage_hourly.project_key` 聚合，payload 与 `/api/app/projects` 同形（新增 `caliber: "sessions" | "hourly"` 标明口径）。空串桶固定排在列表末尾，并单独计入 `totals.unattributed_tokens` / `unattributed_sessions`，不与项目桶合并——项目行本身已是「聚合减去余量」的结果（契约 §2.4），整表求和仍等于 dashboard 总量。页面切换由 `NEXT_PUBLIC_PROJECTS_CALIBER=hourly` 控制（`apps/web/src/lib/dashboard/api.ts`）：未设置或任何其他值仍走 sessions 口径，回退=删除该环境变量，无需改代码。旧 `/api/app/projects` 行为与默认值未动。
>
> 复核补丁（2026-11-04，线上验收后）：
> - **费用改为读取时实时计价**：生产 `token_usage_hourly.total_cost_usd` 全为 0（历史遗留哨兵），小时桶口径改用与服务端 dashboard/session 一致的 `computeRowCost()` 逐行重算再聚合；grok/cline 仍优先采用厂商上报值。无第二套定价逻辑，7 天 199 行量级下开销可忽略（`WeakMap` 行缓存）。
> - **`totals` 补齐** `total_cost_usd`（6 位小数字符串）与 `credits`（6 位小数），两口径同形，页面合计有来源。
> - **会话指标改名**：小时桶表没有会话维度，`Σ conversations` 是按小时累加值，故 hourly 口径列头改为「会话条目 / Session entries」，并在提示条说明「并非去重后的会话数量」；sessions 口径保持「会话数」。
> - **口径标注条按口径切换**：`scopeNote` 拆为 `sessions` / `hourly` 两段文案，由 `projectsCaliber()` 选取；hourly 段说明「来自用量桶、含未归因余量、费用为实时估价、归因依赖采集器上报项目名」。
> - **库内 `total_cost_usd` 恒 0 的语义已显式化（2026-11-04）**：迁移
>   `20261104000000_token_hourly_cost_usd_comment.sql` 给该列加了 DB 列注释（哨兵值：CLI 写入行恒 0，
>   成本在读取时按 curated + LiteLLM 定价实时计算，只有 grok/cline 的厂商上报成本可能为正），
>   生产库已落库该注释。**外部对账脚本不要对该列求和**——读到的 0 是哨兵而非真实费用；应复刻读取时
>   定价（`computeRowCost()`），或直接用 `total_tokens` / `billable_total_tokens` 对账。
> - **零用量项目行不列出行（2026-11-04）**：窗口内 `total_tokens`、读取时费用、`credits` 三者全为 0 的
>   项目行从列表剔除（Codex Desktop 教程目录、子代理转录壳等会不断产生这类键）；「未归因」组仍固定保留，
>   即使为 0。`totals` 仍为整窗口合计（被滤行本就是 0，故数值不变），payload 新增
>   `filtered_zero_usage_projects` 记录过滤条数。**两口径共用同一实现**（`splitProjectGroups()`），
>   hourly 口径同样过滤，避免口径间出现静默差异。
> - **CLI 项目键回退到父项目（2026-11-04）**：`projectKey()` 遇到 `worktrees`（`<repo>/.claude/worktrees/<id>`）
>   或 `subagents`（`<project>/<session>/subagents`）时向上取真实项目目录；qoder-cn 子代理转录还会继承
>   记录里的 `cwd`。只影响新采集，历史 `subagents` 键不回填（会话落库键含 `session_id`，同会话只更新不改名）。
> - **credits-only 来源口径标注（2026-11-04）**：项目页口径条（sessions / hourly 两段）与 Sessions
>   列表提示条都补了同一句说明——credits-only 来源（如 qoder-cn）只贡献积分，不贡献 token 与费用，
>   因此这类会话仍可见、积分非零，而 token/费用为 0 属正常。文案不含会随数据变化的硬编码数字；
>   `apps/web/tests/unit/projects-caliber.test.ts` 锁定该说明在中英两种语言、两种口径与 Sessions 页都存在。
> - **批次 3（CLI 桶级 `project_key`）状态（2026-11-04 实测）**：写入逻辑已在 main（`fe4fb26`，
>   按契约 §2.4 写项目行 + 余量 `''` 行），已随 **`tokenusage-cli@0.4.4` 于 2026-11-04 发版**
>   （tag `cli-v0.4.4`）。采集机仍运行 0.4.3（早于该提交），生产库实测 2,311 行桶行里
>   `project_key` 非空数为 **0**，即 hourly 口径此刻全部落在「未归因」。升级采集机后新桶才会
>   带项目名；历史桶不回填（有界重扫已决定不做）。
>   逐来源「能拿 / 拿不到项目」清单需在发版升级后按真实桶行回填 `docs/sources-capture-audit.md`。
> - **`~/.codex/worktrees/<id>` 无上游项目规则（2026-11-04）**：该路径下没有可靠的仓库名，
>   `projectKey()` 保持旧行为（落 `<id>`），由 `packages/cli/test/session-project-key.test.js` 显式锁定；
>   不做猜测式回退。

> 部署与历史口径（2026-11-04 补注）：该开关是部署级、`NEXT_PUBLIC_` 构建期内联——CLI 采集端不读，
> 改值或删除都需重新部署（回退 = Vercel 删除变量后 Redeploy）。历史桶没有项目名且不做回溯
> （有界重扫功能已决定不做），因此 hourly 口径下的历史只能整体计入「未归因」；新采集机器只影响
> 「本机从接入起」的用量，不影响历史。新部署建议先保持默认 sessions 口径，等带项目名的桶攒够再切
> （部署步骤见 [`docs/deploy-guide.md`](deploy-guide.md) §4）。

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

1. ~~契约破坏性变更：bucket 加 `project_key` + upsert 键扩展~~ → **已拍板并交付（2026-11-03）**：
   `docs/cli-contract.md` §2.4 与迁移 `20261103000000_token_hourly_project_key.sql` 已落地，golden 先行。
2. ~~迁移期「未归因」分组~~ → **已交付（2026-11-04）**：hourly 口径把 `project_key=''` 单列「未归因」，
   `totals.unattributed_tokens` / `unattributed_sessions` 与项目行不重复计。
3. ~~旧图表口径保持~~ → **已按默认保持**：总量页与既有图表仍为整表求和，未按新键拆分。
4. **项目名隐私开关默认值**（唯一仍未拍板项）：现状为明文 basename 上传（跨设备同名天然合并）；
   若改为默认脱敏属协议层行为变更，需按硬性约束 1 走契约 v2 流程，上了协议再改代价更高。
5. ~~阶段 0 精度标注文案~~ → **已交付（2026-11-04）**：`scopeNote.sessions` / `scopeNote.hourly`
   双口径文案 + `projects-caliber.test.ts` 锁定。

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
