# 来源采集：积分制 / 账户级 / 缺口

**本文档是采集机制的权威参考（长期维护）**；变动任务与结论索引见
`docs/sources-capture-plan.md`，契约见 `docs/cli-contract.md`。改来源采集相关代码前先读本文 +
契约。行业对照参照掘金 jusage，仅取结论，代码不回搬。

## 1. 核心结论

- CLI 全量 46+5 个来源（`packages/cli/src/commands/sync.js` `AUTO_SYNC_SOURCES` / `BACKGROUND_AUTO_SYNC_SOURCES`）中，**非标准来源只有 7 处**（§4），其余约 40 个均为"本地真实 token 全量"或"本机未装/零数据"，机制完整。
- **Trae CN 本地库缺口已修**：`resolveTraeDbPaths` 的 roots 已含 `Trae CN`（`packages/cli/src/lib/trae-db.js:29`），`%APPDATA%\Trae CN\ModularData\ai-agent\database.db` 真实 token 已进入持续采集。
- **Trae 口径已改为逐请求（2026-11-19）**：`server_history_info` 的 `source='llm_default'` 行每次模型请求一行，`extra_info.exact_*` 是权威计数；`chat_turn.context.token_usage` 只存一轮里**最后一次**请求（`last_turn_total_tokens`），agent 工具循环会漏计 10 倍以上。现在逐请求优先，仅当某会话没有任何可用请求行时才回退 `chat_turn`——包括本机 2 个无请求行的 CN 旧会话，以及国际版/`TRAE SOLO` 里旧构建只写 `token_usage` 总数、没有 `exact_*` 分项的会话（这类历史仍按轮级口径，无法从旧布局还原 input/output 拆分）。`history_v2.token_usage` 是消息/上下文大小快照，仍不参与计费。`TRAE_CURSOR_VERSION` 升 3，升版后首次 sync 会重建全部 `trae` 桶并由服务端 last-wins 覆盖历史。
- **本机唯一"本地只有积分"的活跃源**：qoder-cn 新版 JSONL（`~/.qoder-cn/projects`），credits-only 行 token 记 0、conversation 照常、credits 进独立字段（2026-10-31 P1，`packages/cli/src/lib/rollout.js`）。
- **行业事实（双重验证）**：订阅制工具的云端接口只有余额/百分比快照，**没有任何一家开放按 token 的消耗明细**——我们自己的 `lib/usage-limits.js` 覆盖 20 家、参照项目 12 个订阅渠道，结论一致。唯一例外是 Cursor 的 dashboard CSV 导出（逐事件 token 明细 + 真实美元成本），本项目已实现。
- 改动任务共 2 批（Trae CN 接入 / credits 字段）+ 1 批 Sessions 遥测，均已完成，见 `docs/sources-capture-plan.md` §2；2026-11-05 的上游对齐修复见该文档 §2 表格末行。
- **审计入口**（2026-11-15）：「某个来源到底有没有进来」不再需要临时扫队列——`tokenusage doctor` 的 `sources.coverage` 检查按 30 天窗口列出每个源的最新小时桶、桶数与 token 数，并把超过 7 天无新行的源单列为 silent（`packages/cli/src/lib/doctor.js` `checkSourceCoverage`）。最新桶整队列超过 7 天则降为 warn，因为闲置工具正常停写，与解析器坏了外观相同，必须由人判断。
- **口径卫生（2026-11-19）**：`trae`（本地逐请求）与 `trae-cn`（账户级会话快照）互斥，本地库存在时跳过账户级 API；kiro CLI 的 chars/4 估算行统一标 `usage_precision: "estimated"`。

## 2. 双平面原则（铁律）

采集面分两个互不混合的平面：

| 平面 | 数据来源 | 形态 | 去向 |
|---|---|---|---|
| **token 面** | 各工具写在本地磁盘的会话日志/数据库 | 真实 token 明细 | `queue.jsonl` → ingest → `token_usage_hourly` / `token_sessions` |
| **积分面** | 云端订阅接口（凭据取自本机登录态） | 余额 / 百分比 / 剩余次数快照 | 仅展示（CLI status 面，`lib/usage-limits.js`），**永不落 token 表** |

铁律：

1. **积分永不换算成 token**。无第一方换算率且随版本/商业策略漂移；`rollout.js:6785-6793` 已有同样决策（"no first-party evidence for a credit→token rate"），参照项目文档红线同款（"额度百分比不能推导请求次数、Token 数或金额"）。
2. **积分永不并入 token 六元组、成本估算、成就口径**。credits 是独立维度（落库为独立列，展示为独立位置）。
3. credits-only 行**不是错误**：token 记 0、conversation 照常计数，credits 进独立字段（2026-10-31 P1 起；`rollout.js` `parseQoderNewIncremental`）。credits 取 `credits`/`original_credits` 的较大值，且 `billable:false` 但 credits>0 的 0.4.x 行同样准入（2026-11-05 对齐上游）。

## 3. cursor 账户级机制（详解）

Cursor **没有本地 token 日志**，token 明细只能从云端拿：

| 环节 | 实现 |
|---|---|
| 凭据 | `%APPDATA%\Cursor\User\globalStorage\state.vscdb` → ItemTable 行 `cursorAuth/accessToken`（JWT）；userId 候选 **JWT `sub` 优先**，`~/.cursor/cli-config.json` 的 `authInfo.authId` 兜底，并按候选顺序重试 401（`packages/cli/src/lib/cursor-config.js` `collectCursorSessionUserIds` / `extractCursorAuth`） |
| 取数 | `GET https://cursor.com/api/dashboard/export-usage-events-csv?strategy=tokens`，Cookie `WorkosCursorSessionToken=<userId>%3A%3A<JWT>` + Referer 伪装（`cursor-config.js` `fetchCursorUsageCsv`） |
| 数据形态 | **逐事件 CSV：各 token 列 + 厂商 Cost（USD）**。准入按 **input / cache write / cache read / output 四个分量**判断，cache-only 行不再因 `Total Tokens=0` 被丢；included 请求也计 token。0-token request-only 行**刻意不入库**（2026-11-05 A8 决策：会凭空造出活跃日并把 bot/automation 算成对话）。注意：Cost 列虽被 `parseCursorCsv` 解析，但 `normalizeCursorUsage` 不产出成本、`parseCursorApiIncremental` 不写 `total_cost_usd`，因此成本实际仍按「token × 定价」估算——旧版文档误写为 reported-first，2026-11-05 校正（真实成本接线见 `docs/sources-capture-plan.md` A10） |
| 摄取路径 | `parseCursorApiIncremental`（`rollout.js`）：整份 CSV 当权威，从最早记录起清零重灌，走**普通小时桶**（cursor-status 列在 `lib/usage-limits.js`，仅 status） |
| "账户级"语义 | 数据是账号维度而非设备维度：① 跨设备行级 MAX 去重（`apps/web/src/lib/account/usage.ts:69-83` `dedupeCursorRows`；cursor 无稳定 session id，`packages/cli/src/lib/account-usage-dedup.js:11-13`）；② Sessions 页永久排除：`token_sessions` CHECK `lower(source) not in ('cursor','trae-cn')`（`supabase/migrations/20261025000000_token_sessions.sql:45-46`，注释 "account-level sources; Sessions is device-level only"）+ 上传两端跳过（CLI `session-upload.js:25,109`、服务端 `apps/web/src/lib/ingest/route.ts:130-151`、`normalize.ts:177-179`） |
| 与 trae-cn 的区别 | **`account_session_state` 队列记录只有 trae-cn 发**（`appendTraeCnSessionStates` `rollout.js:23634-23662`）；服务端 `normalizeSessionState` 硬编码只收 `source === "trae-cn"`（`normalize.ts:115`）。cursor 不发状态记录 |
| 本机状态 | 未安装 → `isCursorInstalled` 短路（`sync.js:2246-2249`），零数据、零请求。`status.js` 无 Cursor 输出行 |

评价：这是全仓库最完整的账户级样板，也是业界唯一的"云端 token 明细"接口，**机制无缺口，不改**。

## 4. 非标准来源清单（7 处）

| # | 来源 | 情况 | 关键代码 | 实测 | 定性 |
|---|---|---|---|---|---|
| 1 | trae（CN 本地库，已修） | `resolveTraeDbPaths` roots 已含 `["Trae","TRAE SOLO","Trae CN"]`（2026-10-31 P0）；用量以 `server_history_info` 逐请求行为主，`chat_turn` 按会话兜底（2026-11-19，cursor v3）。逐请求行的 `exact_token_semantics_v1` 必须是 `provider_raw_usage_completion_includes_reasoning`、`exact_usage_v1` 必须是 `chat_completion`，且 `prompt + completion == total` 才准入；异常行计入 `recordsSkipped` | `trae-db.js`（`projectRequestUsage` / `projectTurnUsage`）、`trae-usage.js` `normalizeTraeRequestUsage`、`rollout.js` `parseTraeIncremental` | `%APPDATA%\Trae CN\...ai-agent\database.db`：`server_history_info` 7,827 条 LLM 请求合计 11.6 亿 token，`chat_turn` 558 轮仅 8,621 万（同一时段差 11.4 倍）；仅 2 行缺 `exact_*`、3 行 total 不自洽；内置共享 SQLCipher 密钥解密成功 | **已接入，逐请求口径** |
| 2 | **qoder / qoder-cn（新版 JSONL）** | credits-only 行不换 token：token 六元组记 0、conversation 照常、credits 进独立字段（2026-10-31 P1）；credits 取 `credits`/`original_credits` 较大值，`billable:false` + credits>0 也准入，坏时间戳按行丢弃不中断整源（2026-11-05） | `rollout.js` `normalizeQoderNewTokens` / `parseQoderNewIncremental`、设计注释 `qoderUsageCredits` | `~/.qoder-cn/projects` 38 个会话 JSONL、8397 条 assistant usage **100% credits-only**（input/output=0，credits≈0.64/条）；队列已采 conv=3146、token=0。`~/.qoder/projects` 为空 | **积分制，credits 字段的受益者** |
| 3 | qoder（国际版 legacy SQLite） | 机制正常，但上游停写 | `%APPDATA%\Qoder\SharedClientCache\cache\db\local.db`，SQL `rollout.js:6409-6429` | 库最后写入 2026-02-02（704 行 token_info 历史已在队列，最后桶 2026-02-02） | 无动作（历史已采） |
| 4 | **kiro（CLI 部分）** | 无真实 token 时按 4 字符/token 估算；SQLite（`user_prompt_length`/`response_size`）与字符回退都标记 `usage_precision: "estimated"`（2026-11-19），session 文件带 `input_token_count`/`output_token_count` 时优先真实值；credits 写 sidecar `~/.tokenusage/tracker/kiro-credits.json` 仅诊断、不入队列 | `rollout.js:8777`（`KIRO_CLI_CHARS_PER_TOKEN=4`）、`readKiroCliSessionFiles`、`parseKiroCliIncremental` | 未装（无 sidecar 文件） | 估算制先例，保持 |
| 5 | **cursor** | 账户级 CSV 明细（§3） | `cursor-config.js` 全文件 | 未装，休眠 | 机制完整，不改 |
| 6 | **trae-cn（账户级 API）** | opt-in：`TOKENUSAGE_TRAE_CN_USAGE=1`；凭据 `<APPDATA>/TRAE SOLO CN` 或 `<APPDATA>/Trae CN` 下 `User/globalStorage/storage.json` 的 `iCubeAuthInfo://icube.cloudide`（tc v5 解密）→ `POST https://api.trae.cn/trae/api/v1/pay/query_user_usage_group_by_session`，30 天窗会话快照（2026-11-05 起两个 CN app dir 都发现）。**本地优先**：本机存在 `Trae`/`TRAE SOLO`/`Trae CN` 数据库且 `trae` 源启用时，账户级 API 会被跳过并打印说明——两者描述同一批会话，本地逐请求更细，同时开启会在仪表盘双计（2026-11-19） | `trae-cn-config.js`、`rollout.js` `parseTraeCnApiIncremental`、`sync.js` | 无 `TRAE SOLO CN` 目录 → 通路无对象。注意：status 里的 "Trae SOLO plan: plan Free" 快照（`status.js`、`rollout.js`）是另一条 entitlement 通路，证明 Trae 系登录态可读 | 保持 opt-in 关闭 |
| 7 | **freebuff（Freebuff CLI）** | 不做：本地只有会话客户端投影，**无 token 消耗记录**。会话日志在 `~/.config/manicode/`（npm launcher 沿用前身 manicode 名下载真身二进制，`~/.freebuff` 反而不存在）；日志里全部 token 字段均为上下文窗口占用计数器（`contextTokenCount` / `systemTokens` / `working_set_tokens` 等）或 prompt 构建估计器内部量（`estimatedTokens` / `fileTokenScores`），不是消耗量；credits 本地不计量（免费会话 318 条 `stepCreditsUsed` 与 12 个 ai 快照的 `creditsUsed`/`directCreditsUsed` 全 0）；`run-state.json` 的 `inference.source: "codebuff"` 表明真实模型调用与 token 计量都在 Codebuff 服务端。无可采集的 token 事实，因此既无解析器也无队列行（2026-11-15 实测，含 32MB 会话全文件字段扫描） | — | `~/.freebuff` 不存在，仅 `<repo>/.freebuff/project-id`；真身数据在 `~/.config/manicode/projects/<项目>/chats/<UTC时间戳>/`（`log.jsonl` 运行日志 + `chat-messages.json` 完整转录 + `chat-meta.json` + `run-state.json`）；`credentials.json` / `device-key.json` 为机密不入文档 | **不采集（本地无 token/credits 消耗记录，用量只在服务端）** |
| 附 | workbuddy（SQLite `session_usage`） | 只有 used/size+credits，**刻意忽略**，JSONL 是权威 | `rollout.js:11018-11023,11141,11770` | 53 个 JSONL 正常在采 | 忽略正确，保持 |

## 5. 标准来源速览

其余来源（claude、codex、zcode、dsh、opencode、workbuddy、minimax-code、pi、zed、codebuddy、grok、copilot、gemini、antigravity、cline、kilocode、roocode、kimi、kimi-code、devin、droid、goose、lmstudio、unsloth、anythingllm、craft、muse、omo、omp、hermes、reasonix、dumate、acode、every-code、command-code、openclaw、claude-science、kilo-cli、mimo、workbuddy-ai、qoder legacy 等）均为**本地文件/SQLite 直读真实 token**（个别为累计差分快照：goose、zed、reasonix、droid），路径与解析器见 `sync.js` 与 `rollout.js` 各自的 resolve/parse 函数。其中 grok/copilot/kimi/zcode 等**按积分/限额计费但本地有真实 token** 的源，云端限额已由 `lib/usage-limits.js`（20 家，status-only）覆盖——**它们没有采集问题**，只是 status 限额面板已有的素材。

## 6. 保持现状清单（带理由）

| 项 | 理由 |
|---|---|
| cursor 采集机制 | 账户级样板完整、业界孤例；本机未装休眠 |
| trae-cn opt-in 关闭 | 本机无 TRAE SOLO CN；装了再开 env |
| workbuddy SQLite session_usage 忽略 | JSONL 权威，SQLite 只有 used/size+credits |
| kiro CLI 估算（chars/4 + precision 标注） | 合理先例；与 qoder 不同，qoder 拒绝估算是因为 agent 模式的 prompt 内容不在本地、连字符数都没有 |
| grok/copilot/kimi/zcode 等"积分计费但本地有真 token"的源 | 采集无病；云端限额已有 status-only 面板 |
| freebuff 不采集、不估算 | 本地只有客户端投影，无 token/credits 消耗记录（§4#7）；上下文计数器不是消耗量，估算是无本之木；若未来接云端余额 API，属积分面（`usage-limits.js` status-only），不动 token 面 |
| 其余全部本地源 | 机制完整 |

## 7. 决策记录（数据模型与原则，长期有效）

- **2026-10-31**：积分不换 token——沿用 `rollout.js:6785-6793` 既有决策，见 §2 铁律 1。
- **2026-10-31**：Trae CN 本地库数据并入 `source: "trae"`（展示层 canonical 已合并 `trae-cn|trae→trae`，见 `apps/web/src/lib/sources.ts`；`trae-cn` id 保留给账户级 API 源，且 `token_sessions` CHECK 排除它）。
- **2026-10-31**：credits 是独立维度，落库为独立列；credits 为浮点积分（本机样本 0.642/条），DB 列用 `numeric` 不用 bigint。
- **2026-11-05**：Cursor 0-token request-only 行不采纳（A8）——活跃天数由小时桶覆盖的天数推导，0-token 行会造出活跃日并把自动化请求算成对话；cache-only 行仍准入（token 非零）。
- **2026-11-05**：Qoder Desktop 0.4.x 限额改由本机 `main.log` 的 `[Auth] [AccountUsage]` 摘要兜底（A9），快照带自身观测时间作为 provenance；仍属 status/限额面，不落 token 表，也不改契约。

## 8. 证据索引

| 主题 | 位置 |
|---|---|
| 来源总清单 | `packages/cli/src/commands/sync.js`（AUTO + BACKGROUND）；账户级标记 `packages/cli/src/lib/session-upload.js` `ACCOUNT_LEVEL_SOURCES`（`source-metadata.js` 已退役，`test/packaging.test.js` 断言其保持删除） |
| qoder 新 JSONL credits 丢弃 | `rollout.js:6785-6793,6892-6929,7001-7039`；status 文案 `status.js:611` |
| qoder legacy SQL / 路径 | `rollout.js:6409-6457`（QODER_USAGE_SQL / resolveQoderDbPath） |
| Trae 本地读取 / history_v2 排除 | `packages/cli/src/lib/trae-db.js:15-45,51-54`；解密 `lib/trae-snapshot.js`（内置共享密钥） |
| trae-cn 账户级 | `trae-cn-config.js:27-37`（opt-in/凭据/端点）、`rollout.js:23598-23849`（account_session_state） |
| cursor 账户级 | `cursor-config.js:91-205,451-538`；去重 `apps/web/src/lib/account/usage.ts:69-144`；会话排除 `normalize.ts:177-179`、`route.ts:130-151` |
| DB 约束 | `supabase/migrations/20261024000000_token_core_tables.sql:91-116`（hourly）、`:118-145`（account_session_states）；`20261025000000_token_sessions.sql:45-46`（CHECK） |
| kiro 估算 / credits sidecar | `rollout.js:8497,8600-8603,8832-8849,9034+` |
| workbuddy SQLite 忽略 | `rollout.js:11018-11023,11141,11770` |
| 云端限额面板（20 家） | `packages/cli/src/lib/usage-limits.js` 的 `getUsageLimits` 及 qoder-limits（含 Desktop 0.4.x `main.log` 的 `[Auth] [AccountUsage]` 摘要扫描 + provenance，2026-11-05）/ qoder-cn-cli-limits / grok-limits / zcode-limits 等；WorkBuddy 国内版与 AI 国际版各自独立（`workbuddy` / `workbuddyAi`，桌面端 IPC，2026-11-15）。读数由 `tokenusage status --limits`（opt-in，2026-11-05 接线；`--json` 的 `limits` 键）渲染为 plan + 各窗口 + credits + provenance；web 端仍无限额面板 |
| 本机 baseline（2026-11-15） | `doctor` `sources.coverage`：30 天窗口 11 个源；队列最新桶 workbuddy（1 天前）；silent >7d：minimax-code / dsh / qoder-cn / trae / pi-minimax-cn 等 7 个（均为停用而非漏采）。逐源核验：opencode 5255 条消息（最后 2026-11-13 15:30，100 桶）、qoder-cn 306 桶（最后 11-02）、pi 最后 11-13、codex 本地 rollout 停于 2026-09-01（无新会话）、copilot/claude/cline 无近 7 天文件 |
| 本机 baseline（2026-10-31） | qoder-cn：38 JSONL / 8397 usage 行 100% credits-only（≈0.64/条）、队列 conv=3146 token=0；Trae CN 库 17/18 行 token_usage（10-26~28，deepseek-v4.1-flash）；Qoder legacy 停写 2026-02-02；队列现有 source：zcode(331)/dsh(89)/opencode(56)/workbuddy(50)/codex(25)/qoder(21)/qoder-cn(14)/pi 系(10)/zed/minimax-code |
