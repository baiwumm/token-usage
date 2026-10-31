# 来源采集审计：积分制 / 账户级 / 缺口（2026-10-31）

> 状态：审计完成，结论经操作者过目。**本文档是采集机制的权威参考（长期维护）**；
> 本轮开发任务单独在 `docs/sources-capture-plan.md`。
> 调研方式：全程只读（CLI `status`、用 CLI 自带解密/SQLite 库解剖本机数据库、grep 源码），未改任何代码。
> 参照项目 `F:\projects\juejin-usage`（掘金 jusage）仅用于行业对照结论，其代码不回搬。
> 改来源采集相关代码前先读本文 + `docs/cli-contract.md`。

## 1. 核心结论

- CLI 全量 46+5 个来源（`packages/cli/src/commands/sync.js:338-393`）中，**非标准来源只有 6 处**（§4），其余约 40 个均为"本地真实 token 全量"或"本机未装/零数据"，机制完整。
- **本机唯一有真实数据却未被采集的缺口**：Trae CN 的本地库（`%APPDATA%\Trae CN\ModularData\ai-agent\database.db`，SQLCipher 加密但内置共享密钥可解）不在 `resolveTraeDbPaths` 的扫描范围（`packages/cli/src/lib/trae-db.js:24`）。
- **本机唯一"本地只有积分"的活跃源**：qoder-cn 新版 JSONL（`~/.qoder-cn/projects`），credits-only 行被有意丢弃、只计对话（`packages/cli/src/lib/rollout.js:6892-6929`）。
- **行业事实（双重验证）**：订阅制工具的云端接口只有余额/百分比快照，**没有任何一家开放按 token 的消耗明细**——我们自己的 `lib/usage-limits.js` 覆盖 16 家、参照项目 12 个订阅渠道，结论一致。唯一例外是 Cursor 的 dashboard CSV 导出（逐事件 token 明细 + 真实美元成本），本项目已实现。
- 改动任务共 3 批（Trae CN 接入 / credits 字段 / 订阅额度），见 `docs/sources-capture-plan.md`；其余保持现状（§6）。

## 2. 双平面原则（铁律）

采集面分两个互不混合的平面：

| 平面 | 数据来源 | 形态 | 去向 |
|---|---|---|---|
| **token 面** | 各工具写在本地磁盘的会话日志/数据库 | 真实 token 明细 | `queue.jsonl` → ingest → `token_usage_hourly` / `token_sessions` |
| **积分面** | 云端订阅接口（凭据取自本机登录态） | 余额 / 百分比 / 剩余次数快照 | 仅展示（CLI status 现状；P2 若做则进仪表盘），**永不落 token 表** |

铁律：

1. **积分永不换算成 token**。无第一方换算率且随版本/商业策略漂移；`rollout.js:6785-6793` 已有同样决策（"no first-party evidence for a credit→token rate"），参照项目文档红线同款（"额度百分比不能推导请求次数、Token 数或金额"）。
2. **积分永不并入 token 六元组、成本估算、成就口径**。credits 是独立维度（落库为独立列，展示为独立位置）。
3. credits-only 行**不是错误**：token 记 0、conversation 照常计数，credits 进独立字段（credits 字段落地前则整行丢弃积分、只计对话——`rollout.js:7018-7039` 现状）。

## 3. cursor 账户级机制（详解）

Cursor **没有本地 token 日志**，token 明细只能从云端拿：

| 环节 | 实现 |
|---|---|
| 凭据 | `%APPDATA%\Cursor\User\globalStorage\state.vscdb` → ItemTable 行 `cursorAuth/accessToken`（JWT）；userId 取 `~/.cursor/cli-config.json` 的 `authInfo.authId`（兜底 JWT payload `sub`）——`packages/cli/src/lib/cursor-config.js:91-146` |
| 取数 | `GET https://cursor.com/api/dashboard/export-usage-events-csv?strategy=tokens`，Cookie `WorkosCursorSessionToken=<userId>%3A%3A<JWT>` + Referer 伪装（`cursor-config.js:150,196-205`） |
| 数据形态 | **逐事件 CSV：各 token 列 + 真实 Cost（USD）**——全仓库唯一 `reported-first`（真实成本优先）来源（`parseCursorCsv` `cursor-config.js:451-507`、`normalizeCursorUsage` :512-538，included 请求也计 token :525-536） |
| 摄取路径 | `parseCursorApiIncremental`（`rollout.js:7551-7650`）：整份 CSV 当权威，从最早记录起清零重灌，走**普通小时桶**（cursor-status 列在 `lib/usage-limits.js:789-823`，仅 status） |
| "账户级"语义 | 数据是账号维度而非设备维度：① 跨设备行级 MAX 去重（`apps/web/src/lib/account/usage.ts:69-83` `dedupeCursorRows`；cursor 无稳定 session id，`packages/cli/src/lib/account-usage-dedup.js:11-13`）；② Sessions 页永久排除：`token_sessions` CHECK `lower(source) not in ('cursor','trae-cn')`（`supabase/migrations/20261025000000_token_sessions.sql:45-46`，注释 "account-level sources; Sessions is device-level only"）+ 上传两端跳过（CLI `session-upload.js:25,109`、服务端 `apps/web/src/lib/ingest/route.ts:130-151`、`normalize.ts:177-179`） |
| 与 trae-cn 的区别 | **`account_session_state` 队列记录只有 trae-cn 发**（`appendTraeCnSessionStates` `rollout.js:23634-23662`）；服务端 `normalizeSessionState` 硬编码只收 `source === "trae-cn"`（`normalize.ts:115`）。cursor 不发状态记录 |
| 本机状态 | 未安装 → `isCursorInstalled` 短路（`sync.js:2246-2249`），零数据、零请求。`status.js` 无 Cursor 输出行 |

评价：这是全仓库最完整的账户级样板，也是业界唯一的"云端 token 明细"接口，**机制无缺口，不改**。

## 4. 非标准来源清单（6 处）

| # | 来源 | 情况 | 关键代码 | 本机实测（2026-10-31） | 定性 |
|---|---|---|---|---|---|
| 1 | **trae（CN 目录缺口）** | `resolveTraeDbPaths` roots 只有 `["Trae","TRAE SOLO"]`，不扫 `Trae CN` | `trae-db.js:24`（TRAE SOLO CN 是另一目录，属 trae-cn 账户级：`trae-cn-config.js:34-35`） | `%APPDATA%\Trae CN\...ai-agent\database.db` 存在：`chat_turn` 18 行、17 行带真实 `token_usage`（≈2026-10-26~28，模型 `deepseek-v4.1-flash`）；内置共享 SQLCipher 密钥解密成功 | **缺口，P0 修** |
| 2 | **qoder / qoder-cn（新版 JSONL）** | credits-only 行被有意丢弃（无换算率），只计对话 | `rollout.js:6892-6929`（credits 已解析在 6894/6920，仅随 token 行携带）、设计注释 :6785-6793、conv-only totals :7018-7039 | `~/.qoder-cn/projects` 38 个会话 JSONL、8397 条 assistant usage **100% credits-only**（input/output=0，credits≈0.64/条）；队列已采 conv=3146、token=0。`~/.qoder/projects` 为空 | **积分制，credits 字段的受益者** |
| 3 | qoder（国际版 legacy SQLite） | 机制正常，但上游停写 | `%APPDATA%\Qoder\SharedClientCache\cache\db\local.db`，SQL `rollout.js:6409-6429` | 库最后写入 2026-02-02（704 行 token_info 历史已在队列，最后桶 2026-02-02） | 无动作（历史已采） |
| 4 | **kiro（CLI 部分）** | 无真实 token：按 4 字符/token 估算（带 `usage_precision`）；credits 写 sidecar `~/.tokenusage/tracker/kiro-credits.json` 仅诊断、不入队列 | `rollout.js:8497`（`KIRO_CLI_CHARS_PER_TOKEN=4`）、:8600-8603 注释、:8832-8849、:9034+ | 未装（无 sidecar 文件） | 估算制先例，保持 |
| 5 | **cursor** | 账户级 CSV 明细（§3） | `cursor-config.js` 全文件 | 未装，休眠 | 机制完整，不改 |
| 6 | **trae-cn（账户级 API）** | opt-in：`TOKENUSAGE_TRAE_CN_USAGE=1`；凭据 `%APPDATA%\TRAE SOLO CN\User\globalStorage\storage.json` 的 `iCubeAuthInfo://icube.cloudide`（tc v5 解密）→ `POST https://api.trae.cn/trae/api/v1/pay/query_user_usage_group_by_session`，30 天窗会话快照 | `trae-cn-config.js:27-37,229-345`、`rollout.js:23598-23849`、`sync.js:2309-2329` | 无 `TRAE SOLO CN` 目录 → 通路无对象。注意：status 里的 "Trae SOLO plan: plan Free" 快照（`status.js:1460`、`rollout.js:23296-23320`）是另一条 entitlement 通路，证明 Trae 系登录态可读 | 保持 opt-in 关闭 |
| 附 | workbuddy（SQLite `session_usage`） | 只有 used/size+credits，**刻意忽略**，JSONL 是权威 | `rollout.js:11018-11023,11141,11770` | 53 个 JSONL 正常在采 | 忽略正确，保持 |

## 5. 标准来源速览

其余来源（claude、codex、zcode、dsh、opencode、workbuddy、minimax-code、pi、zed、codebuddy、grok、copilot、gemini、antigravity、cline、kilocode、roocode、kimi、kimi-code、devin、droid、goose、lmstudio、unsloth、anythingllm、craft、muse、omo、omp、hermes、reasonix、dumate、acode、every-code、command-code、openclaw、claude-science、kilo-cli、mimo、workbuddy-ai、qoder legacy 等）均为**本地文件/SQLite 直读真实 token**（个别为累计差分快照：goose、zed、reasonix、droid），路径与解析器见 `sync.js` 与 `rollout.js` 各自的 resolve/parse 函数。其中 grok/copilot/kimi/zcode 等**按积分/限额计费但本地有真实 token** 的源，云端限额已由 `lib/usage-limits.js`（16 家，status-only）覆盖——**它们没有采集问题**，只是订阅额度展示（plan 文档 P2）的素材。

## 6. 保持现状清单（带理由）

| 项 | 理由 |
|---|---|
| cursor 采集机制 | 账户级样板完整、业界孤例；本机未装休眠 |
| trae-cn opt-in 关闭 | 本机无 TRAE SOLO CN；装了再开 env |
| workbuddy SQLite session_usage 忽略 | JSONL 权威，SQLite 只有 used/size+credits |
| kiro CLI 估算（chars/4 + precision 标注） | 合理先例；与 qoder 不同，qoder 拒绝估算是因为 agent 模式的 prompt 内容不在本地、连字符数都没有 |
| grok/copilot/kimi/zcode 等"积分计费但本地有真 token"的源 | 采集无病；云端限额已有 status-only 面板 |
| 其余全部本地源 | 机制完整 |

## 7. 决策记录（数据模型与原则，长期有效）

- **2026-10-31**：积分不换 token——沿用 `rollout.js:6785-6793` 既有决策，见 §2 铁律 1。
- **2026-10-31**：Trae CN 本地库数据并入 `source: "trae"`（展示层 canonical 已合并 `trae-cn|trae→trae`，见 `apps/web/src/lib/sources.ts`；`trae-cn` id 保留给账户级 API 源，且 `token_sessions` CHECK 排除它）。
- **2026-10-31**：credits 是独立维度，落库为独立列；credits 为浮点积分（本机样本 0.642/条），DB 列用 `numeric` 不用 bigint。

## 8. 证据索引

| 主题 | 位置 |
|---|---|
| 来源总清单 | `packages/cli/src/commands/sync.js:338-393`（AUTO 46 + BACKGROUND 5）；账户级标记 `packages/cli/src/lib/source-metadata.js:1` |
| qoder 新 JSONL credits 丢弃 | `rollout.js:6785-6793,6892-6929,7001-7039`；status 文案 `status.js:611` |
| qoder legacy SQL / 路径 | `rollout.js:6409-6457`（QODER_USAGE_SQL / resolveQoderDbPath） |
| Trae 本地读取 / history_v2 排除 | `packages/cli/src/lib/trae-db.js:15-45,51-54`；解密 `lib/trae-snapshot.js`（内置共享密钥） |
| trae-cn 账户级 | `trae-cn-config.js:27-37`（opt-in/凭据/端点）、`rollout.js:23598-23849`（account_session_state） |
| cursor 账户级 | `cursor-config.js:91-205,451-538`；去重 `apps/web/src/lib/account/usage.ts:69-144`；会话排除 `normalize.ts:177-179`、`route.ts:130-151` |
| DB 约束 | `supabase/migrations/20261024000000_token_core_tables.sql:91-116`（hourly）、`:118-145`（account_session_states）；`20261025000000_token_sessions.sql:45-46`（CHECK） |
| kiro 估算 / credits sidecar | `rollout.js:8497,8600-8603,8832-8849,9034+` |
| workbuddy SQLite 忽略 | `rollout.js:11018-11023,11141,11770` |
| 云端限额面板（16 家） | `packages/cli/src/lib/usage-limits.js:4003-4213` 及 qoder-limits / qoder-cn-cli-limits / grok-limits / zcode-limits 等 |
| 本机 baseline（2026-10-31） | qoder-cn：38 JSONL / 8397 usage 行 100% credits-only（≈0.64/条）、队列 conv=3146 token=0；Trae CN 库 17/18 行 token_usage（10-26~28，deepseek-v4.1-flash）；Qoder legacy 停写 2026-02-02；队列现有 source：zcode(331)/dsh(89)/opencode(56)/workbuddy(50)/codex(25)/qoder(21)/qoder-cn(14)/pi 系(10)/zed/minimax-code |
