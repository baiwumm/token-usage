# 上游对比分析：tokenusage-cli vs TokenTracker vs juejin-usage（2026-11-03）

> 状态：一次性评估快照（只读调研，未改任何代码）。采集机制的**长期权威参考仍是
> `docs/sources-capture-audit.md`**；本文聚焦「与两个上游的逐项差异与可借鉴点」。
> 调研基线：三仓库均 fast-forward/工作区干净；证据全部落到文件路径 + 行号。

## 0. 仓库基线

| 项 | token-usage（本仓库） | TokenTracker | juejin-usage |
|---|---|---|---|
| 角色 | 自托管重写版（CLI + Next.js/Supabase 仪表盘） | 上游源头（CLI + 本地面板 + 云端 + 三原生端） | 行业对照（core 库 + CLI + Tauri 桌面 + 掘金云） |
| HEAD / 日期 | 工作区 | `ce8bc2da` · 2026-11-03 11:13 (+08:00) | `f72ca4d` · 2026-10-29 21:25 (+08:00) |
| 默认分支 | main | main | main |
| CLI 包 / 版本 | `tokenusage-cli` 0.4.3，bin `tokenusage` | `tokentracker-cli` 1.5.4，bin `tokentracker` 等 4 个别名 | `@juejin-opensource/jusage` 0.1.15，bin `jusage` |
| 语言/架构 | Node CJS 单包 CLI + `apps/web` | Node CJS 单仓（CLI 与 dashboard 同仓） | pnpm workspace TS：`packages/core` + `packages/cli` + `packages/dashboard` + `apps/desktop`(Tauri) |
| LICENSE | MIT（上游署名已在 LICENSE/THIRD_PARTY_NOTICES） | MIT © xiufengsun | MIT © juejin-cn |
| CLI 测试规模 | **19 个 test 文件**（`node --test`） | **429 个**（`node --test`） | **63 个**（TS 编译后 `node --test`） |

## 1. 三份实现的一分钟画像

- **TokenTracker**：CLI 既扫本地日志上报云端，又内置 `serve` 本地面板（默认 7680 端口，`src/commands/serve.js:14`；`src/lib/static-server.js` + `src/lib/local-api.js` 直接读本地 `queue.jsonl` 聚合展示）。增量靠 inode/offset 文件游标 + 事件哈希去重（`src/lib/rollout.js:324-601`），上报节流/退避在 `src/lib/upload-throttle.js:31-130`。配置根目录 `~/.tokentracker`（`src/lib/tracker-paths.js:5`）。
- **juejin-usage**：`packages/core` 把采集做成库，CLI 与 Tauri 桌面共享；本地队列按**月分片** `queue/<month>.jsonl` + manifest（`packages/core/src/queue/index.ts:106-124`），去重键 `source|collector|model|project|hour_start`（`queue/keys.ts:1-22`）——**bucket 带 project 维度**，两家 tokentracker 系都没有。上报掘金云 `POST /v1/model-usage/reports`（`upload/client.ts:104-165`），按远端 watermark 决定全量/增量（:263-354）。配置根目录 `~/.ai-usage`（`packages/core/src/paths.ts:5-14`）。CLI **无任何 `--json` 输出**。
- **tokenusage-cli**：本地面板被有意裁撤（`packages/cli/src/cli.js:348-349` 注释），只保留采集 → 自托管云端；契约冻结 + golden 测试（`docs/cli-contract.md` §2）；三者中唯一有**只读 `reconcile` 对账命令**和 `pause/resume`、`sync --watch` 退避阶梯（1→2→5，`cli.js:33`）。

## 2. 逐项对比（文件 → 行为 → 差异）

### 2.1 命令面

| 能力 | tokenusage-cli | TokenTracker | juejin-usage |
|---|---|---|---|
| 子命令 | init / sync / upload / reconcile / pause / resume / status / diagnostics / doctor / uninstall / device-login / sessions（`packages/cli/src/cli.js:35-224`） | serve / init / sync / status / diagnostics / doctor / uninstall / device-login / **wrapped** / sessions（`src/cli.js:42-75`）；无 upload/reconcile/pause | start / stop / status / sync / upload / service / doctor / help（`packages/cli/src/args.ts:150-179`） |
| 无参行为 | 打印 help | **启动本地面板** | 启动本地面板（前台） |
| JSON 输出 | upload / reconcile / status / doctor / device-login 均有 `--json`；sessions `--format json\|csv` | 仅 doctor / device-login / wrapped 有 `--json`；status 无（`src/cli.js:90`） | **无** |
| 常驻同步 | `sync --watch --interval`（进程内循环） | 由 `serve` 内嵌 | `start` 前台 + `service start` 后台服务 |
| 对账 | `reconcile` 只读、exit 1 报漂移（`commands/reconcile.js`） | 无 | `upload --reconcile`（上报顺带全量对账，非独立只读命令） |

### 2.2 数据来源清单

| 集合 | 内容 |
|---|---|
| tokenusage-cli AUTO 46 + BACKGROUND 5 | `packages/cli/src/commands/sync.js:340-395` |
| TokenTracker AUTO 47 + BACKGROUND 5 | `src/commands/sync.js:348-404`；**= TU + `opensquilla`**（OpenSquilla 网关 SQLite，`src/lib/rollout.js:14259+`），其余逐字相同 |
| juejin 40 个 parser | `packages/core/src/sync/index.ts:7-46`；**独有 9 个**：`amp`、`autoclaw`、`deveco`、`kinetaios`、`qwen`(Qwen Code CLI)、`qwenwork`、`teleagent`、`warp`、`wps-comate` |
| TU 独有（vs juejin）15 个 | acode、anythingllm、claude-science、craft、devin、dumate、kimi-code、lmstudio、muse、omo、qoder-cn、reasonix、trae-cn、unsloth、workbuddy-ai |

来源类型三家一致：本地 JSONL/SQLite 直读为主；cursor 为云端 CSV 账户级（TU `cursor-config.js` ≈ TT 同源）；juejin 的 cursor 走轮询节流（`CURSOR_POLL_MIN_FETCH_INTERVAL_MS`，`sync/index.ts:4`）。

### 2.3 解析 / 归一化 / 增量 / 去重

| 环节 | tokenusage-cli | TokenTracker | juejin-usage |
|---|---|---|---|
| 统一记录 | hourly bucket 六 token 列 + `billable_total_tokens` + `credits` + conversations（契约 §2.4） | 同左（契约同源），**无 credits**（edge-patch ingest 未见 credits 字段，见 §6 未确认） | `QueueBucket`（`packages/core/src/types.ts:10-33`）：token 列 + `reported_cost_usd` + `local_metrics`（缓存命中率等，**不上报**） |
| bucket 键 | `hour_start\|source\|model`（服务端 upsert 加 user/device） | 同左（`src/lib/upload-queue.js:59`） | **`source\|collector\|model\|project\|hour_start`**——多 project/collector 两维 |
| 增量 | inode/offset 游标 + cursors + queue last-wins | 同左（`rollout.js:560-601`） | `cursors.json` 文件游标，全源共享一轮加载（`sync/index.ts:73-83` 注释：减少重复读盘） |
| 事件去重 | sessionUUID:eventTimestamp 哈希 | 同左（`rollout.js:365-457`） | bucketKey 合并（`queue/index.ts:33-39`） |
| 队列存储 | 单文件 `queue.jsonl`（+ project 队列） | 同左 | **按月分片 + manifest**，范围读取只载相关月份 |
| unknown 模型 | kimi-model-repair / codex-model-attribution（按源修补） | 同左 | **`align-unknown.ts`**：同小时 unknown 桶对齐到主导已知模型，通用机制 |

### 2.4 缓存 / 重试 / 容错

- 三家都有：上报失败保队列、指数退避、429/`Retry-After` 处理（TU/TT `upload-throttle.js`；juejin `upload/client.ts`）。
- TT 独有：**limits/status 云数据的缓存 fallback 测试矩阵**（`test/cursor-limits-cache-fallback.test.js`、`grok-`、`kimi-` 各数百行断言），TU 无对应测试。
- TU 独有：sync.lock、`--wait-for-lock`、watch 退避阶梯、队列偏移只读 reconcile。
- juejin 独有：远端 watermark 协商 full/incremental；CLI/Desktop **observer/owner 角色**避免双进程重复采集（`packages/cli/src/index.ts:173-220`）。

### 2.5 计价（pricing）

| 项 | tokenusage-cli | TokenTracker | juejin-usage |
|---|---|---|---|
| 数据来源 | LiteLLM 在线抓取 + 静态 seed-snapshot（2285 键）+ curated-overrides（exact 91 / fuzzy 47）；CLI 与 `apps/web/src/lib/pricing/` **两份数据完全同步**（本次逐项比对 0 差异） | 同构：seed 2285 键 + curated **exact 120 / fuzzy 56**（`src/lib/pricing/curated-overrides.json`） | **models.dev** 定期同步（`sync:pricing` 脚本）：exact **456** / alias 8 / sourceAlias 4 / fuzzy 196，canonical `provider/model` 命名 |
| 特殊计价 | DeepSeek 峰谷、Fast/Ultrafast 溢价、长上下文、订阅/本地推理计 0、cursor reported-first | 同左（`src/lib/pricing/index.js:342-412`） | 按 provider 分组的 exact/fuzzy 匹配 |
| 计价时机 | **服务端读取时**（契约 §2.7），CLI 侧 seed 供本地展示 | 本地 local-api + 云端双轨（有 `edge-pricing-parity.test.js` 守一致性） | 本地聚合时（`aggregate.ts:27-127`） |

## 3. 结论一：值得借鉴（性价比排序）

1. **同步 TT 新增 curated 定价（29 exact + 9 fuzzy）**——含 `claude-opus-4-5/4-6`、`claude-sonnet-4-6`、`claude-haiku-5-5`、`gpt-5.4/5.4-pro/5.4-mini/5.5`、`gpt-5.3-codex-spark`、`qwen3.8-max(×3 写法)`、`gemini-3-flash-preview`、`kimi-k3.1-pro(×4 写法)`、`mimo-v2.5(-pro)`、`muse-spark-1.2/1.3-contributor(-free)`。证据：TT `src/lib/pricing/curated-overrides.json` vs TU `packages/cli/src/lib/pricing/curated-overrides.json`（本次脚本 diff）。**为什么好**：读取时计价直接受益，差一行就是成本 0；纯 JSON 拷贝。**成本**：≤0.5 天（含 golden 测试）。**风险**：极低；注意 web/CLI 两份同步改。
2. **TT 的高价值测试移植**——TT 429 个测试文件 vs TU 19 个。优先：`cursor/grok/kimi-limits-cache-fallback`（缓存降级行为）、`edge-pricing-parity`（计价双轨一致性）、`session-response-cache`、`deepseek-limits/status`、`opencode-status`。**为什么好**：TU 的 limits/计价代码与 TT 同源，移植摩擦小。**成本**：2–4 天分批。**风险**：低；需逐个核对 TU 已改名的内部标识（`tokenusage` 前缀）。
3. **juejin 的 `align-unknown` unknown 模型对齐**（`packages/core/src/queue/align-unknown.ts:151-208`）——把同小时 unknown 桶并入主导已知模型，避免模型识别漂移拆行。TU 目前只有 per-source 修补（`kimi-model-repair.js`、`codex-model-attribution.js`）。**成本**：1–2 天（队列读取侧加一个对齐 pass）。**风险**：中——会改变历史 unknown 桶的展示归属，需先只读试运行对比。
4. **juejin 队列按月分片 + manifest**（`queue/index.ts:106-124`）——TU/TT 单文件 `queue.jsonl` 长期运行会持续增长，范围读取（reconcile/sessions）需扫全量。**成本**：2–3 天（读写两侧 + 迁移）。**风险**：中——触及对账基线文件格式，须保留旧文件读取路径。
5. **TT 的 deepseek limits/status**（新增 `src/lib/deepseek-limits.js` 280 行、`deepseek-status.js` 157 行 + 测试）——TU limits 面板（`usage-limits.js` 约 16 家）缺 deepseek，TT 已 20 家（`usage-limits.js:70-75`）。**成本**：1 天。**风险**：低。

## 4. 结论二：他们有我们没有的功能

| 功能 | 出处 | 价值 | 大致工作量 | 备注 |
|---|---|---|---|---|
| `opensquilla` 来源 | TT `rollout.js:14259+`、`sync.js:383` | 低-中（取决于该网关流行度，**未确认**） | 1–2 天（有现成解析器参照） | TU 与 TT 来源清单唯一差异 |
| deepseek 限额面板 | TT `deepseek-limits.js`/`deepseek-status.js` | 中 | 1 天 | 见 §3-5 |
| `wrapped` 年度回顾命令 | TT `commands/wrapped.js`（`--json --year`） | 低（单人自托管场景娱乐向） | 1 天 | 可作为未来公开实例的分享功能 |
| 本地面板（serve:7680） | TT `serve.js`/`local-api.js`/`static-server.js` | 低 | — | **TU fork 时已决策裁撤**（`cli.js:348`），不建议回搬 |
| 桌面/原生端 | TT：macOS Swift + Win C# + Linux Tauri；juejin：Tauri `apps/desktop` | 中 | 数周 | TU 已预留 `apps/desktop`；juejin 的「core 库共享 + observer/owner」架构是现成参照 |
| bucket 带 project 维度 | juejin `queue/keys.ts` | **高**（每项目成本/用量分析） | **大**：契约 bucket 加字段 = CLI 面冻结条款下的 v2 演进 + 服务端聚合改造 |  TU 目前 project 只在 session 级；若做，建议走 §7 建议的 v2 可选字段路线 |
| `local_metrics`（缓存命中率等本地-only 指标） | juejin `local-metrics.ts:10-166` | 中（诊断缓存有效性） | 1–2 天（本地采集 + status 展示，不入契约） | 设计上明确不上报，隐私友好 |
| `service` 后台服务管理子命令 | juejin `args.ts:159` | 低-中 | 1 天 | TU 用 init 注册 + pause/resume 覆盖大半场景 |
| 订阅卡片 UI 组件 | juejin `packages/dashboard/src/components/*SubscriptionCard.tsx` ×5 | 低 | — | TU 是 Next.js 仪表盘 + service-status 页，形态不同 |

## 5. 结论三：值得加入或优化

### 5.1 缺失模型清单（计价覆盖对照）

口径：juejin `pricing.json` exact 456 键 vs TU seed-snapshot（2285 键）+ curated exact（91 键）的**精确匹配下限**；TU 另有 47 条 fuzzy 与 CLI 侧 LiteLLM 在线抓取可覆盖一部分，故下表是「离线精确覆盖缺口」的上界。cursor 来源因 reported-first（真实成本上报）不受缺口影响。

| 提供商组 | juejin 收录 | TU 缺失（exact 口径） | 影响面 |
|---|---|---|---|
| alibaba + alibaba-cn（通义/qwen） | 57 + 59 | **56 + 58** | qoder/qoder-cn 已采集，新 qwen3.x 模型成本可能计 0 |
| volcengine（豆包/doubao-seed） | 21 | **21（全缺）** | trae 系 ark 模型计价缺口 |
| xiaomi（mimo） | 9 | **9（全缺）** | TU 已有 mimo 来源采集 |
| meta（muse-spark） | 6 | **6（全缺）** | TU 已有 muse 来源采集 |
| moonshotai + moonshotai-cn（kimi） | 19 + 12 | 14 + 8 | kimi/kimi-code 已采集；k2.x/k3.x 新型号缺 |
| openai / anthropic / google / xai / mistral / deepseek | 66/28/34/18/38/12 | 21/11/17/10/15/2 | 主要为最新一代（gpt-5.4+、claude 4.5+、gemini 3.x、grok 4.20+）；TT curated 已补一部分（见 §3-1） |
| zhipuai + zai（GLM） | 20 + 18 | 6 + 4 | zcode 已采集；glm-4.6v/5v 等缺 |
| stepfun / inclusionai / sapiens / tencent / meituan / cursor | 6/4/4/3/1/5 | 4/4/4/1/0/1 | 长尾；cursor 走 reported-first 不受影响 |

**建议动作**（优先级从高到低）：
1. 先同步 TT curated 29+9（§3-1，立即收益）；
2. 再从 juejin `pricing.json` 选摘 **volcengine / xiaomi / meta(muse) / alibaba-cn / moonshotai-cn** 五组入 curated（对应 TU 已在采的来源），约 100 条，0.5–1 天；
3. 长期：建一个 CI 周期任务对齐 LiteLLM seed 与 models.dev 差集（juejin 的 `sync:pricing` + 分支 `chore/sync-model-pricing-20261102` 是现成流程参照），避免人工追新模型。

### 5.2 性能与健壮性

- **测试覆盖率差距是最大的健壮性风险**：TU CLI 19 个测试文件 vs TT 429 / juejin 63。TT 本轮新增（cache-fallback 矩阵、pricing parity、session-response-cache、deepseek/opencode status）都与 TU 同源代码直接对应，移植性价比最高（§3-2）。
- **队列增长**：单文件 queue.jsonl 无分片；juejin 月分片方案可借鉴（§3-4）。
- **limits 面板**：补 deepseek（§3-5）；TT 的 `usage-limits.js` 还有 visibility-gating 测试（`usage-limits-visibility-gating.test.js`）可一并移植。

## 6. 结论四：我的额外建议（两家上游都没做）

1. **计价口径一致性显式化**。已知差异：sessions 视图按峰值价、hourly 按 DeepSeek 峰谷（契约 §2.7 注记已接受）；TT 有同样问题且只在代码注释里。建议：dashboard sessions 页加一行口径说明 + `docs/cli-contract.md` 保持注记。**收益**：消除「两个页面成本对不上」的误判；**代价**：纯文案，0.5 天。
2. **pricing 数据版本可见性**。juejin/TT 都不向用户暴露定价数据年龄。TU 可在 status `--json` 里加 `pricing: {source, seed_date, curated_count}`（seed `_meta` 已有元信息）。**收益**：成本为 0 时可自助定位是「未采集」还是「未定价」；**代价**：0.5 天。
3. **采集覆盖自检（reconcile 的反向）**。TU 已有云端 vs 本地的 reconcile；反向「本地有数据但未定价/未归一」无工具。建议在 `doctor` 加「近 7 天 unknown 模型 Top N + 计价命中率」检查。**收益**：把 §5.1 的缺口变成可观测；**代价**：1 天。juejin 有 align-unknown 但无观测面，TT 两者皆无。
4. **隐私差集审计测试**。三家都宣称「只采元数据」，但只有 TU 把隐私规则写进契约（§2.4 白名单字段）。建议加契约测试：ingest 请求带 prompt/路径/标题字段时断言服务端不持久化（现有 golden 测试可扩展）。**收益**：自托管场景的核心卖点可被回归守护；**代价**：0.5 天。
5. **credits 维度的上游反哺观察**。TU 2026-10-31 已落 credits 独立维度（契约 §2.4/§2.6），TT ingest 补丁中未见 credits（**未确认**其云端是否已跟进）。若 TT 后续实现，关注其钳制/舍入口径与 TU 的差异，避免双向移植时语义漂移。

## 7. LICENSE 与许可兼容性（单列提醒）

| 仓库 | 许可证 | 商用 | 署名要求 | 兼容性风险 |
|---|---|---|---|---|
| TokenTracker | **MIT** © xiufengsun | 允许 | 复制/修改需保留版权与许可声明 | **低**：TU 本就 fork 自其 selfhost 版，署名已在根 `LICENSE` / `THIRD_PARTY_NOTICES.md` / `packages/cli/` 同名文件（AGENTS.md 规则 10），继续回搬无需新增动作 |
| juejin-usage | **MIT** © juejin-cn | 允许 | 同上 | **低，但需注意**：若首次从 juejin 回搬代码（如 align-unknown、月分片队列、pricing 选摘），需在 `THIRD_PARTY_NOTICES.md` 新增 juejin-cn 署名条目；只借鉴「思路」不复制代码则无需 |

## 8. 未确认事项（诚实清单）

- TT 云端 ingest 是否已支持 credits：仅在 `dashboard/edge-patches/tokentracker-ingest.ts` grep 无命中，该文件可能不是其服务端唯一/最新实现。
- `opensquilla` 工具的实际用户基数与数据形态流行度未调研。
- §5.1 缺口为 exact 口径上界；TU 47 条 fuzzy 与 CLI 在线 LiteLLM 抓取可能实际覆盖其中一部分，未逐模型验证。
- TT `status` 是否真的无 `--json`：以其 help 文本（`src/cli.js:90`）为准，未逐行读 status.js 实参解析。
- juejin 面板/桌面端的云端数据回流展示（掘金云侧）超出本次「CLI 采集」范围，未调研。
