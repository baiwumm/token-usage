# 来源接入计划：Trae CN / credits 字段（2026-10-31）

> 状态：**P0 / P1 / P2 全部完成并已上 main（2026-10-31）；CLI 0.3.0 已发布，本文档转存档，无待派发任务。**
> 机制与背景先读 `docs/sources-capture-audit.md`；契约规范 `docs/cli-contract.md`；UI 规范 `docs/ui-spec.md`。
> 本文档是**任务型文档**：派发、进度与验收记录在这里；机制性结论以 audit 文档为准，
> 任务完成或回撤后更新本文档状态，机制性新结论回写 audit 文档。
> 新来源/新字段任务另开增量章节，不重开本批。

## 1. 已拍板决策（2026-10-31）

- **P1 积分展示选 C 方案**：明细表积分列 + 来源卡角标 + 独立积分卡，三者都要。
- **Trae CN 本地库数据并入 `source: "trae"`**（依据见 audit §7）。
- **流程折中**（对 AGENTS 硬性约束 1 的"先文档+golden → 确认 → 实现"）：契约文档 + golden + 实现
  **整批完成**后，用本机 `pnpm dev` 的真实效果作为确认点；操作者验收不过则**整体 revert**。
- **积分不换 token**（audit §2 铁律 1）；Hero 大数、成本、成就口径永不混入积分。
- 效果预览：会话内交互式 mockup（credits-dashboard-mockup，四阶段 现状→P0→P0+P1→全量 + 三样式切换），
  版式以其为基线，实施时遵循 `docs/ui-spec.md`。

## 2. P0 批次：Trae CN 本地库接入（已完成）

零契约/DB 影响，单 commit 可整体 revert；本机立刻回填 2026-10-26 起的真实 token。

- [x] T0.1 `packages/cli/src/lib/trae-db.js:24` roots 增加 `"Trae CN"`（win32 `%APPDATA%\Trae CN`；darwin `~/Library/Application Support/Trae CN`）
- [x] T0.2 跨库身份隔离：确认现有 Trae / TRAE SOLO 双库的 rowid 身份如何区分（`parseTraeIncremental` 的 id key），为三库做 per-db 前缀；光标 namespace 独立（照 qoder legacy/new 双光标先例 `rollout.js:6946-6969`），防双计
- [x] T0.3 `status.js` TRAE 行文案：显示扫描的库数与路径
- [x] T0.4 本机验证：sync 后 `~/.tokenusage/tracker/queue.jsonl` 出现 `source:"trae"` + 模型 `deepseek-v4.1-flash` 的桶（2026-10-26 起）；仪表盘来源卡出现 Trae；`pnpm verify` 绿

回撤：`git revert` 单 commit；已上传桶是真实数据，可留。

## 3. P1 批次：credits 可选字段全链路（已完成）

涉契约（AGENTS 硬性约束 1）：T1.1/T1.2 契约文档与 golden 先行，T1.3 起实现；
整批完成后本机看效果（§1 流程折中），验收不过整体 revert。
受益者：qoder-cn（本机唯一活跃的 credits-only 源）；credits 为**浮点**（样本 0.642/条）。

- [x] T1.1 契约先行：`docs/cli-contract.md` §2.4 bucket 表追加可选字段 `credits` + §3 语义两条——① last-wins 整行覆盖会把旧行 credits 归零（旧客户端行为不变）；② credits-only 行 token 六元组为 0、conversation 照常、credits 记账
- [x] T1.2 golden + 单测：`apps/web/tests/contract/ingest.test.ts`、`apps/web/tests/unit/ingest-normalize.test.ts`——带/不带 credits 的旧行为**逐字不变**；credits 非负校验；样例用浮点 `0.642`
- [x] T1.3 CLI：`rollout.js` `initTotals`(:4397)/`totalsKey`/`enqueueTouchedBuckets`(:3672,3753) 透传 credits；`normalizeQoderNewTokens` credits-only 行改记 credits + conversation（token 仍 0）；`packages/cli/src/lib/ingest-sanitize.js` 清洗（数值化、非负）
- [x] T1.4 服务端：`apps/web/src/lib/ingest/normalize.ts`（`NormalizedBucket` 类型 + `normalizeBucket` 解析，缺省 0；不加则被静默丢弃）；`route.ts` 预计不动
- [x] T1.5 迁移：`supabase/migrations/20261031000000_token_usage_credits.sql`——`alter table public.token_usage_hourly add column credits numeric not null default 0 check (credits >= 0);`（**numeric 不是 bigint**；对 anon/authenticated 零 policy）
- [x] T1.6 展示（C 方案）：① 明细表「积分」列（无积分来源显示 `—`）② 来源卡积分角标 ③ 独立「积分消耗」卡（放双栏之后、明细之前）；组件命名遵循 AGENTS 组件规范（`components/dashboard/credits-card.tsx` 等）；文案走 `lib/copy` typed 字典（zh/en，单位"积分 / Credits"）；数字格式化走统一 format provider（如需扩展）；Hero 大数、成本、成就口径不动
- [x] T1.7 `pnpm verify` + 本机 `pnpm dev` 看效果 → 操作者验收 → 推送或整体 revert

验收线：qoder-cn 桶 credits>0 且 token=0 且 conversation 正常；不带 credits 的旧 payload golden 逐字不变；仪表盘三处展示齐备。

回撤：revert 代码；DB 列可留（default 0 无害）或补一个 drop 迁移。

## 4. P2 批次：Sessions credits 与遥测（已完成，2026-10-31 二轮增量）

P1 只覆盖小时桶；本批把积分带到会话粒度与采集运行记录，三者共用同一
`credits numeric` 口径（独立维度，永不并入 token / 成本 / 成就）。

- [x] T2.1 **Sessions 会话级 credits**：契约 §2.4 sessions 条目新增可选 `credits`（钳 0 不拒批）；
  `session-analytics` 新增 qoder / qoder-cn 会话 reader（一文件 = 一会话，子代理文件也计入），
  `session-upload` 透传；迁移 `20261031000003_token_sessions_credits.sql`（`token_sessions.credits`
  + RPC 替换）；Sessions 表「积分」列（`totals.credits > 0` 才显示）+ 详情弹窗积分行。
  **历史会话保持 0**（`ended_at` 严格 last-wins 不重写老快照）。
- [x] T2.2 **`credits_ingested` 遥测**：契约 §2.11 / §2.12 追加可选字段；CLI 每轮上报本轮
  入队桶的 credits 之和；服务端归一 + 读侧透传；`/sync-runs` 列表行内显示。旧 CLI 不传按 0。
- [x] T2.3 **模型名大小写归一**：读侧所有聚合按 `lower(model)` 分组，展示名取组内 token
  份额最大的写法（`b19e57b`）；`glm-5.3-flash` / `GLM-5.3-Flash` 不再拆行。契约 §2.7 已回写。

验收线：qoder-cn 会话 `credits>0` 且 token=0；sync-run 行显示本轮积分；大小写变体合并后
总量不变；`pnpm verify` 全绿。

## 5. 明确不做

- 积分 × 系数 → token 入库（audit §2 铁律 1）
- status.js 给 cursor 加探测行（本机未装，价值≈0）
- kiro credits sidecar 入桶（依赖 P1，且本机未装，装了再议）

## 6. 派发与进度记录

| 日期 | 动作 | 结果 |
|---|---|---|
| 2026-10-31 | 任务列出，待指令 | — |
| 2026-10-31 | 操作者指令"按 plan 开工"；P0/P1 执行 | **完成（本地提交，未推送）**：P0 `c8b9d9e`、P1 `6ec6220`、文档 `46a054c`；`pnpm verify` 全绿 |
| 2026-10-31 | 迁移应用 + 历史补记 + 操作者验收 | P0/P1 推送 main（`52e5808..bbc42e8`）；生产库 credits 列与 21 个 qoder-cn 桶落库验证通过 |
| 2026-10-31 | P2 二轮增量 | Sessions credits `8d81282`、`credits_ingested` `bd124cc`、模型归一 `b19e57b`；全部上 main |
| 2026-11-01 | CLI 0.3.0 发布并本机升级 | tag `cli-v0.3.0`（`56ff02c`）；本机全局包与运行时副本均为 0.3.0，Trae CN 已进入持续采集 |
| 2026-11-05 | 上游对齐修复批次（§7） | 执行中：Cursor cache-only/凭据、Qoder credits/准入/时间戳、Trae CN app dirs、文档漂移；A8/A9 留待决策 |

### P0 交付记录（commit `c8b9d9e`）

- T0.1–T0.3 完成：`trae-db.js` roots 增加 `Trae CN`（跨库身份复用既有 per-store ledger，
  零新机制）；status 行显示 `2 database(s): Trae, Trae CN`；新增 `packages/cli/test/trae-db.test.js`。
- T0.4 实测通过：本机 sync 后 ledger `stores: 2, turns: 17`（全部 `deepseek-v4.1-flash`），
  与审计基线一致，桶已上传。
- 持续采集已闭环：本机 2026-11-01 升级到 `tokenusage-cli@0.3.0`，全局包与
  `~/.tokenusage/tracker/app` 运行时副本均为 0.3.0；计划任务不再跑无 CN 扫描的 0.2.6。

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
- 明确未做：本机 CLI 升级（随 npm 发版；已由 0.3.0 关闭）。
- **迁移与补记（2026-10-31 操作者授权执行，已完成）**：
  - 迁移已应用于生产库（`information_schema` 验证 `credits numeric not null default 0`）；
  - 历史补记走账本重算：`totalsKey` 的 `|c:` 后缀使 qoder-cn 全部消息"先减后加"，sync 重发
    22 桶；上传经 `TOKENUSAGE_LOCAL_SYNC_DEVICE_TOKEN` + 本地 dev ingest（新代码）写入，
    避免"旧生产 ingest 白名单丢 credits 且光标已推进"的顺序陷阱——**该陷阱是通用规律：
    凡新增 ingest 字段，采集必须打到已部署新代码的端点**；
  - 本地通道护栏记录：`runtime-config.js:90` 规定 custom base URL + `DEFAULT_ANON_KEY` 一律
    `invalid_insforge_anon_key`（防令牌外泄），本地验证需另给格式合法的占位 publishable key
    （本地 ingest 只认设备令牌，anon key 不参与鉴权）；
  - 落库验证：21 个 qoder-cn 桶 credits>0（10-30 21:00 → 10-31 21:00），合计 747.02 积分，
    token 恒 0、对话数不变；执行后 CLI 配置已还原（baseUrl = 生产）。
- **操作者验收与推送（2026-10-31）**：本地 `pnpm dev` 三处展示确认通过，P0/P1 已推 main
  （`52e5808..bbc42e8`），无 revert。

### P2 交付记录（Commits `8d81282` / `bd124cc` / `b19e57b`）

- Sessions credits：迁移 `20261031000003_token_sessions_credits.sql` 已应用生产库；RPC
  `token_upsert_sessions` 同步替换；Sessions 列表与详情按 `totals.credits > 0` 显示。
- `credits_ingested`：迁移 `20261031000001_token_sync_runs_credits.sql` 已应用生产库；
  契约 §2.11/§2.12、CLI 上报、读侧与 `/sync-runs` 行内展示全链路打通。
- 模型归一：所有聚合按小写折叠，展示名取组内 token 份额最大的写法；golden 覆盖
  `glm-5.3-flash` / `GLM-5.3-Flash` 合并后总量不变。
- `pnpm verify` 全绿；操作者验收通过后推送 main。

## 7. 上游对齐修复批次（2026-11-05）

> 触发：只读对比上游 `TokenTracker`（v1.5.5）与 `juejin-usage`（core 0.1.15）后的差异。
> **零契约/DB 变更**：只修解析器与凭据链路，`docs/cli-contract.md` 无需改动（§2.4 已允许
> 0-token + `conversations ≥ 1` 与 credits-only 桶）。

- [x] A1 **Cursor CSV 准入**：改按 input / cache write / cache read / output 四个分量判断，
  cache-only 行不再因 `Total Tokens=0` 被丢（含真实 cost）。
- [x] A2 **Cursor userId 候选**：JWT `sub` 优先、`cli-config.json` 兜底，401 时按候选重试；
  仍只在 `AUTH_EXPIRED` 时重试，网络/超时不重试。
- [x] A3 **Qoder credits**：取 `credits` / `original_credits` 较大值（`1e-6` 下限），
  修 `credits:0` 且 `original_credits>0` 时归零。
- [x] A4 **Qoder 准入**：`billable:false` 但 credits>0 的 0.4.x 行不再被丢。
- [x] A5 **Qoder 时间戳**：`> 8.64e15` 按 0 丢弃，防单行坏时间戳中断整源。
- [x] A6 **Trae CN app dirs**：`["TRAE SOLO CN", "Trae CN"]`，优先已安装目录。
- [x] A7 **文档漂移**：`source-metadata.js` 引用改为 `session-upload.js` 的
  `ACCOUNT_LEVEL_SOURCES`（该文件为退役态，packaging 测试断言保持删除）。
- [x] A8 **Cursor 0-token request-only 行：决定不采纳**（2026-11-05，操作者授权按建议执行）：
  上游在行携带 model 时准入并计 `conversation_count`，配套的是云端请求留存（本项目没有）；本项目的
  活跃天数由小时桶覆盖到的天数推导，0-token 行会凭空造出活跃日，并把 bot/automation 请求算成对话。
  准入保持四分量判断，决策注释就近留在 `cursor-config.js` 的 `hasTokens` 处。
- [x] A9 **Qoder Desktop 0.4.x 限额（仅限额面板，2026-11-05 已实现）**：`qoder-limits.js`
  增加 `main.log` 的 `[Auth] [AccountUsage]` `qoderUsage` 摘要扫描——bundle-id 目录
  （`com.qoder.app.stable` / `com.qodercn.app.stable`）与旧 `Qoder[CN]` 布局同时发现；
  `main.log` / `renderer.log` 分开排序、单次探测 24 MB 预算、单文件逆向 8 MB 分块（512 KB 块 +
  64 KB 重叠）扫描；只认 7 天内、跨文件按行时间戳取最新快照；`cached_at` 记录快照观测时间
  （行时间戳，缺失回落文件 mtime），缓存写入保留该时间，避免把旧配额当新鲜值；`userType` 的
  `invalid` 视为无 `plan_label`；百分比由配额数字推导（OpenAPI 返回分数、桌面端返回百分数，
  混合标度不可信）。零契约 / 零 DB / 零 token 采集改动。
  **本机验收（2026-11-05）**：Qoder CN 本地日志读出 1143/2400 积分，`cached_at` 为行时间
  2026-11-02T01:01:55Z 而文件 mtime 是 11-05（证明 provenance 取快照时间、不是读取时间）；
  Qoder CN CLI 端（`~/.qoder-cn/.auth` 解密 → `/api/v2/quota/usage`）返回 1061/2600，
  `source: cli-api`，全链优先级高于旧日志；intl 只有 2026-08-19 的日志，超出 7 天窗返回 null，
  全链回落 12h 磁盘缓存（含 `stale/cached_at`）。
  **面板落点（2026-11-05 已接线）**：`tokenusage status --limits` 渲染 18 家限额行
  （plan + primary/secondary/add-on/other 窗口 + credits + provenance 的 source/stale/年龄），
  `--json` 时在 `limits` 键输出完整 payload（含每 provider 的 `provenance`）；该开关 opt-in，
  默认 `status` 保持纯本地快路径。本机实测行：Qoder CN
  `Personal Standard, 0%, add-on: 40.8%, 1061/2600 credits, cli-api, 0s ago`；
  Qoder `Personal Standard, 0%, disk-cache, stale, 25m ago`。web 端仍无限额面板。
- [ ] A10（backlog，仅文档校正已做）**Cursor CSV 的 Cost 列未被使用**：`parseCursorCsv` 解析了
  厂商 Cost，但 `normalizeCursorUsage` 不产出成本、`parseCursorApiIncremental` 不写
  `total_cost_usd`，因此 Cursor 成本实际与其他来源一样是「按 token × 定价」估算。本次只校正
  `docs/sources-capture-audit.md` §3 的 reported-first 表述；是否接线真实成本需单独拍板
  （涉及队列/云端口径与历史重算）。

验收线：新增 3 个解析器 fixture 单测；`pnpm --filter tokenusage-cli test` 与 `pnpm verify` 全绿；
本机 sync 后 Cursor（若安装）与 qoder-cn 队列行 token/credits 与解析结果一致。
