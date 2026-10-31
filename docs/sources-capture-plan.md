# 来源接入计划：Trae CN / credits 字段 / 订阅额度（2026-10-31）

> 状态：任务已列出，**待操作者指令派发**（可整批、可只派 P0、可调整顺序）。
> 机制与背景先读 `docs/sources-capture-audit.md`；契约规范 `docs/cli-contract.md`；UI 规范 `docs/ui-spec.md`。
> 本文档是**任务型文档**：派发、进度与验收记录在这里；机制性结论以 audit 文档为准，
> 任务完成或回撤后更新本文档状态，机制性新结论回写 audit 文档。

## 1. 已拍板决策（2026-10-31）

- **P1 积分展示选 C 方案**：明细表积分列 + 来源卡角标 + 独立积分卡，三者都要。
- **Trae CN 本地库数据并入 `source: "trae"`**（依据见 audit §7）。
- **流程折中**（对 AGENTS 硬性约束 1 的"先文档+golden → 确认 → 实现"）：契约文档 + golden + 实现
  **整批完成**后，用本机 `pnpm dev` 的真实效果作为确认点；操作者验收不过则**整体 revert**。
- **积分不换 token**（audit §2 铁律 1）；Hero 大数、成本、成就口径永不混入积分。
- 效果预览：会话内交互式 mockup（credits-dashboard-mockup，四阶段 现状→P0→P0+P1→全量 + 三样式切换），
  版式以其为基线，实施时遵循 `docs/ui-spec.md`。

## 2. P0 批次：Trae CN 本地库接入

零契约/DB 影响，单 commit 可整体 revert；本机立刻回填 2026-10-26 起的真实 token。

- [ ] T0.1 `packages/cli/src/lib/trae-db.js:24` roots 增加 `"Trae CN"`（win32 `%APPDATA%\Trae CN`；darwin `~/Library/Application Support/Trae CN`）
- [ ] T0.2 跨库身份隔离：确认现有 Trae / TRAE SOLO 双库的 rowid 身份如何区分（`parseTraeIncremental` 的 id key），为三库做 per-db 前缀；光标 namespace 独立（照 qoder legacy/new 双光标先例 `rollout.js:6946-6969`），防双计
- [ ] T0.3 `status.js` TRAE 行文案：显示扫描的库数与路径
- [ ] T0.4 本机验证：sync 后 `~/.tokenusage/tracker/queue.jsonl` 出现 `source:"trae"` + 模型 `deepseek-v4.1-flash` 的桶（2026-10-26 起）；仪表盘来源卡出现 Trae；`pnpm verify` 绿

回撤：`git revert` 单 commit；已上传桶是真实数据，可留。

## 3. P1 批次：credits 可选字段全链路

涉契约（AGENTS 硬性约束 1）：T1.1/T1.2 契约文档与 golden 先行，T1.3 起实现；
整批完成后本机看效果（§1 流程折中），验收不过整体 revert。
受益者：qoder-cn（本机唯一活跃的 credits-only 源）；credits 为**浮点**（样本 0.642/条）。

- [ ] T1.1 契约先行：`docs/cli-contract.md` §2.4 bucket 表追加可选字段 `credits` + §3 语义两条——① last-wins 整行覆盖会把旧行 credits 归零（旧客户端行为不变）；② credits-only 行 token 六元组为 0、conversation 照常、credits 记账
- [ ] T1.2 golden + 单测：`apps/web/tests/contract/ingest.test.ts`、`apps/web/tests/unit/ingest-normalize.test.ts`——带/不带 credits 的旧行为**逐字不变**；credits 非负校验；样例用浮点 `0.642`
- [ ] T1.3 CLI：`rollout.js` `initTotals`(:4397)/`totalsKey`/`enqueueTouchedBuckets`(:3672,3753) 透传 credits；`normalizeQoderNewTokens` credits-only 行改记 credits + conversation（token 仍 0）；`packages/cli/src/lib/ingest-sanitize.js` 清洗（数值化、非负）
- [ ] T1.4 服务端：`apps/web/src/lib/ingest/normalize.ts`（`NormalizedBucket` 类型 + `normalizeBucket` 解析，缺省 0；不加则被静默丢弃）；`route.ts` 预计不动
- [ ] T1.5 迁移：`supabase/migrations/<ts>_token_usage_credits.sql`——`alter table public.token_usage_hourly add column credits numeric not null default 0 check (credits >= 0);`（**numeric 不是 bigint**；对 anon/authenticated 零 policy）
- [ ] T1.6 展示（C 方案）：① 明细表「积分」列（无积分来源显示 `—`）② 来源卡积分角标 ③ 独立「积分消耗」卡（放双栏之后、明细之前）；组件命名遵循 AGENTS 组件规范（`components/dashboard/credits-card.tsx` 等）；文案走 `lib/copy` typed 字典（zh/en，单位"积分 / Credits"）；数字格式化走统一 format provider（如需扩展）；Hero 大数、成本、成就口径不动
- [ ] T1.7 `pnpm verify` + 本机 `pnpm dev` 看效果 → 操作者验收 → 推送或整体 revert

验收线：qoder-cn 桶 credits>0 且 token=0 且 conversation 正常；不带 credits 的旧 payload golden 逐字不变；仪表盘三处展示齐备。

回撤：revert 代码；DB 列可留（default 0 无害）或补一个 drop 迁移。

## 4. P2 批次：订阅额度卡（可选，后置）

- [ ] 素材现成：`packages/cli/src/lib/usage-limits.js` 的 qoder（`qoder-limits.js:11-26`）、qoder-cn CLI（`qoder-cn-cli-limits.js:8-112`）、Trae entitlement reader（`rollout.js:23296-23320`）
- [ ] 契约面待拍板：新 `/api/app/*` 订阅快照接口或 CLI 上报快照记录；**不落 `token_usage_hourly`**，仅展示
- [ ] dashboard「订阅额度」卡（Qoder 积分池 total/used/remaining + 到期；Trae basic/bonus/extra 百分比条）；数据标注"示例/快照时间"，获取失败整卡隐藏

## 5. 明确不做

- 积分 × 系数 → token 入库（audit §2 铁律 1）
- status.js 给 cursor 加探测行（本机未装，价值≈0）
- kiro credits sidecar 入桶（依赖 P1，且本机未装，装了再议）

## 6. 派发与进度记录

| 日期 | 动作 | 结果 |
|---|---|---|
| 2026-10-31 | 任务列出，待指令 | — |
| 2026-10-31 | 操作者指令"按 plan 开工"；P0/P1 执行，P2 后置 | **完成（本地提交，未推送）**：P0 `c8b9d9e`、P1 `6ec6220`、文档 `46a054c`；`pnpm verify` 全绿 |

### P0 交付记录（commit `c8b9d9e`）

- T0.1–T0.3 完成：`trae-db.js` roots 增加 `Trae CN`（跨库身份复用既有 per-store ledger，
  零新机制）；status 行显示 `2 database(s): Trae, Trae CN`；新增 `packages/cli/test/trae-db.test.js`。
- T0.4 实测通过：本机 sync 后 ledger `stores: 2, turns: 17`（全部 `deepseek-v4.1-flash`），
  与审计基线一致，桶已上传。
- 注意：本机计划任务跑的是全局 npm 包 0.2.6（无 CN 扫描）——**持续采集 Trae CN 需随下个
  npm 版本发布 + 本机 `init` 升级接管**；历史 17 turns 已由手跑 sync 回填。

### P1 交付记录（commit `6ec6220`）

- T1.1–T1.7 全部完成：契约 §2.4/§2.6/§2.7/§2.10 回写；CLI credits 透传（零值抑制，其他来源
  队列行逐字不变）；credits-only 行记 credits + 对话（token 仍 0）；服务端钳制归一；
  迁移 `20261031000000_token_usage_credits.sql`；展示 C 方案三处（明细积分列自动隐藏、
  来源卡角标、独立积分卡）；golden 71→新增 credits 分组 + series/dashboard 流转断言。
- **验收前置（操作者执行，顺序敏感）**：
  1. 先对 Supabase 应用迁移（`supabase db push` 或 SQL editor 执行该迁移文件的
     `alter table`，幂等）——**必须在部署新 web / 升级 CLI 之前**：新 ingest 会写 `credits`
     列，列不存在时 PostgREST 整批报错；
  2. `pnpm dev` 看仪表盘效果（qoder-cn 自 2026-10-30 起有 credits 数据需由新版 CLI 采集，
     老数据 credits 为 0，积分卡在范围内无 credits 时整卡不渲染）；
  3. 验收通过 → 推送 main（CI 兜底）；不过 → `git revert 6ec6220`（DB 列可留，无害）。
- 明确未做：P2 订阅额度卡（后置，另拍板契约面）；本机 CLI 升级（随 npm 发版）。
