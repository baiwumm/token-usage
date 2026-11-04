# 上游对比落地计划（2026-11-03）

> 依据：`docs/upstream-comparison.md`（同日落盘的证据报告）。
> **2026-11-03 操作者拍板更新**：juejin 署名接受（复制数据/代码时 THIRD_PARTY_NOTICES 加
> juejin-cn MIT 条目，含来源仓库与 commit `f72ca4d`）；D1 CI 周报**取消**（改为 §4 的人工
> 月检文档记录，不新增 scheduled workflow）；C3 opensquilla **取消**（无用户需求）；bucket
> project 维度**记入远期 backlog**（`docs/rewrite-plan.md` §10，需契约 v2，本轮不实现）；
> C2 align-unknown 接受两步走，**本轮只做 dry-run 差异预览**，不改历史归属。
> 全部批次**不触碰契约层**（`docs/cli-contract.md` §2–3 与 golden 测试不动）。
> 与在途计划无冲突：`docs/sources-capture-plan.md` P0/P1/P2 均已完成。

## 0. 批次总览

| 批次 | 包含项 | 人日（区间） | 批次间依赖 |
|---|---|---|---|
| **B1 基础与定价同步** | A1 定价双份 parity 守卫（**必须先做**）、A2 同步 TT curated 29+9、A3 status 暴露定价版本 | 1.5–2 | 无依赖，最先做；A2/A3 依赖 A1 的守卫先就位 |
| **B2 计价覆盖与可观测** | B1 juejin 五组定价选摘、B2 deepseek 限额面板、B3 doctor 计价自检 | 2.5–3.5 | 依赖 B1（A1 守卫、A3 版本字段是 B3 前置）；B1/B2/B3 互相可并行 |
| **B3 健壮性回填** | C1 移植 TT 高价值测试、C2 align-unknown **dry-run 差异预览（不落地）** | 2.5–4.5 | C1 建议含 B2 的 deepseek 测试，宜在 B2 后；C2 只读、无依赖 |
| **B4 长期机制** | ~~D1 CI 周报~~（**取消**，改人工月检，见 §4）、D2 队列按月分片（**留待下轮**） | 0 + 2–3 | D2 独立但建议最后（触对账基线文件格式） |

本轮执行范围（2026-11-03 拍板）：**B1 全部 + B2 全部 + B3 的 C1 与 C2-dry-run**。

总计 10.5–16.5 人日；B1+B2（5 项）是收益/成本比最高的核心，约 4–5.5 人日。

---

## 1. 批次 B1：基础与定价同步

### A1（必须先做）定价数据双份 parity 守卫
- **目标**：CLI 与 web 两处定价数据（`seed-snapshot.json` / `curated-overrides.json`）目前**无任何同步守卫**（本次 grep 全仓 test/scripts 无命中），A2/B1 每次改两份文件靠人工对齐，必漂移。加守卫后漂移 = CI 红。
- **改动范围**：新增 `packages/cli/test/pricing-parity.test.js`（或 `apps/web` 侧 vitest，二选一，建议 CLI 侧因 release-cli.yml 也跑 CLI 测试）：断言两目录的 `curated-overrides.json` 深相等、seed 键集合相等；`apps/web` 的 `selfhost-overrides.json` 为 web 独有，不在守卫范围。
- **工作量**：0.5 人日。
- **风险与回滚**：零风险（纯测试）；回滚 = 删文件。
- **验证门禁**：`pnpm --filter tokenusage-cli test`；故意改坏一边 → 测试必须红（自验）。
- **用户决策**：否。

### A2 同步 TT 新增 curated 定价（29 exact + 9 fuzzy）
- **目标**：消除 29 个已在 TT 定价的新模型（`claude-opus-4-5/4-6`、`claude-sonnet-4-6`、`claude-haiku-5-5`、`gpt-5.4/5.4-pro/5.4-mini/5.5`、`gpt-5.3-codex-spark`、`qwen3.8-max×3`、`gemini-3-flash-preview`、`kimi-k3.1-pro×4`、`mimo-v2.5(-pro)`、`muse-spark-1.2/1.3-contributor(-free)`）在本项目的成本 0 计价。
- **改动范围**：`packages/cli/src/lib/pricing/curated-overrides.json` 与 `apps/web/src/lib/pricing/curated-overrides.json` 同步改；源数据 = `TokenTracker/src/lib/pricing/curated-overrides.json`（diff 清单已在报告 §3-1，可用脚本重算复核）。
- **工作量**：0.5 人日（含逐条复核价格字段，不盲拷）。
- **风险与回滚**：低——新增键不影响既有键；回滚 = `git revert`。风险点是 TT 价格本身错误：抽 3–5 条与官网核对。
- **验证门禁**：A1 parity 测试 + `pnpm verify`；用 `apps/web` 现有 model-breakdown 计价路径对 1 个新键手工算一条核对。
- **用户决策**：否（TT 署名已覆盖，AGENTS.md 规则 10）。

### A3 status 暴露定价数据版本（基础项，B3 前置）
- **目标**：`status --json` 增加 `pricing: {source, seed_date, curated_counts}`，让「成本 0」可自助区分「未采集 vs 未定价」；同时是 B3 doctor 自检的数据源。报告 §6-2。
- **改动范围**：`packages/cli/src/commands/status.js`（JSON 输出块）、读取 `packages/cli/src/lib/pricing/index.js` 已有加载状态（seed `_meta` 元信息）；CLI 输出非契约面，不动契约文档。
- **工作量**：0.5 人日。
- **风险与回滚**：低；`--json` 加字段向后兼容（旧消费者忽略新键）。回滚 = revert。
- **验证门禁**：`pnpm --filter tokenusage-cli test`（status JSON 结构断言）+ `pnpm verify`。
- **用户决策**：否。

## 2. 批次 B2：计价覆盖与可观测

### B1 juejin 五组定价选摘（约 100 条）
- **目标**：补齐 TU 已采集来源对应的定价空白组——volcengine 21（**全缺**，影响 trae 系 ark 模型）、xiaomi/mimo 9（全缺，mimo 来源已采）、meta/muse 6（全缺，muse 来源已采）、alibaba-cn 58 中选高频 qwen3.x-coder/flash/max、moonshotai-cn 8（kimi 已采）。消除这些来源近新模型的成本 0 计价。报告 §5.1。
- **改动范围**：同 A2 的两个 curated-overrides.json；源数据 = `juejin-usage/packages/core/src/pricing/pricing.json`（canonical `provider/model` 键需转写为 TU 的裸模型名键，逐一核对 matcher 命中）；选摘清单先落成 PR 描述供审核。
- **工作量**：0.5–1 人日。
- **风险与回滚**：低-中——juejin 价格字段语义（input/output/cache）与 litellm  Schema 需逐条映射，错配会算错价；回滚 = revert。**juejin 价格数据本身是否算"代码"需按署名处理**（§5 决策项 1）。
- **验证门禁**：A1 parity 测试 + 每个提供商组抽 1 条与官方价目核对 + `pnpm verify`。
- **用户决策**：**是**（juejin 署名）。

### B2 deepseek 限额面板
- **目标**：limits 面板从约 16 家补到 17 家（DeepSeek 余额/额度），对齐 TT 最新 20 家中的新增项。报告 §3-5。
- **改动范围**：新增 `packages/cli/src/lib/deepseek-limits.js`（参照 TT 281 行同名文件）+ `usage-limits.js:30-37` 的 require/分支接线 + `status.js` 展示行；TT 的 `deepseek-status.js`（158 行，服务状态）如要并进 `provider-status.js` 另算 +0.5 天。
- **工作量**：1–1.5 人日。
- **风险与回滚**：低——limits 是 status-only 平面，不落库（audit §2 铁律不受影响）；回滚 = 摘掉分支。
- **验证门禁**：`pnpm --filter tokenusage-cli test`（移植 TT `deepseek-limits.test.js` 287 行断言的适配版）+ `pnpm verify`。
- **用户决策**：否（TT 署名已覆盖）。

### B3 doctor 计价自检（依赖 A3）
- **目标**：`doctor` 新增「近 7 天桶的计价命中率 + unknown 模型 Top N」检查，把报告 §5.1 的缺口变成常驻可观测；两家上游均无此物（报告 §6-3）。
- **改动范围**：`packages/cli/src/lib/doctor.js` 新增只读检查（读 queue.jsonl last-wins + 走 `pricing/index.js` matcher）；`commands/doctor.js` 输出与 `--json` 块；不动服务端。
- **工作量**：1 人日。
- **风险与回滚**：低（只读）；回滚 = revert。
- **验证门禁**：`pnpm --filter tokenusage-cli test`（构造含未知模型桶的 fixture 队列 → 断言命中率与 Top N 输出）。
- **用户决策**：否。

## 3. 批次 B3：健壮性回填

### C1 移植 TT 高价值测试
- **目标**：CLI 测试文件 19 → ≥27，覆盖当前零测试的容错行为：limits 缓存降级（`cursor/grok/kimi-limits-cache-fallback` 三件，TT 共约 980 行断言）、pricing parity（TT `edge-pricing-parity.test.js` 思路，对齐 A1）、`session-response-cache`、B2 的 deepseek 两件。
- **改动范围**：`packages/cli/test/` 新增测试文件；只加测试不改实现，除非测试暴露真实 bug（单独开项）。
- **工作量**：2–4 人日（TT 断言引用 `tokentracker` 命名与私有路径，需逐个适配）。
- **风险与回滚**：低；回滚 = 删测试。
- **验证门禁**：`pnpm --filter tokenusage-cli test` + CI `verify-windows-cli` job 绿。
- **用户决策**：否。
- **执行结果（2026-11-03）**：**4 个目标文件均不可移植**（代码级证据见 §7）——三件 cache-fallback 测的是上游 fork 之后才加的「limits 磁盘缓存回退」功能（本仓库 cursor/grok/kimi limits 无磁盘缓存层），`session-response-cache` 测的是 fork 刻意退役的 local API。结论：C1 收缩为「随 B2 移植 deepseek 两件测试」；limits 磁盘缓存回退作为新功能候选记入 §4 表格。

### C2 align-unknown 对齐（借鉴 juejin，本轮只做 dry-run 预览）
- **目标**：把同小时 `unknown` 模型桶对齐到主导已知模型，消除模型识别漂移造成的拆行（juejin `packages/core/src/queue/align-unknown.ts:151-208`；TU 现状只有 per-source 修补 `kimi-model-repair.js` / `codex-model-attribution.js`）。报告 §3-3。
- **改动范围（本轮）**：只做**只读 dry-run 报告**（复用 B3 doctor 输出「对齐前后差异预览」：哪些 unknown 记录会改归属、影响量级），结论写回本文档 §7；**不改写入路径、不改历史归属**。
- **工作量**：1 人日（dry-run 版）。
- **风险与回滚**：dry-run 零风险；若后续落地写入，会改变历史 unknown 桶展示归属——需快照 queue.jsonl 备份 + revert 预案，落地前再次报操作者确认。
- **验证门禁**：dry-run 输出人工复核。
- **用户决策**：已拍板（2026-11-03）：接受两步走；juejin 署名接受。

### ~~C3 opensquilla 来源接入~~（已取消，2026-11-03 拍板）
- **取消原因**：无用户需求（操作者确认本机与目标用户均不使用 OpenSquilla）。若未来 TT 侧该来源流行度上升，可按原评估（TT `rollout.js:14259+` 约 209 行解析器，1–2 人日）重新立项。

## 4. 不做 / 延后的项（2026-11-03 拍板版）

| 项 | 状态与原因 |
|---|---|
| bucket 加 project 维度（契约 v2） | **记入远期 backlog**（`docs/rewrite-plan.md` §10）。触发 AGENTS.md 硬性约束 1 的契约变更流程 + 服务端聚合改造（≥5 人日）；若要做，单独立项走「契约文档 + golden → 确认 → 实现」 |
| **定价差集人工月检**（原 D1 CI 周报） | **CI 定时任务取消**（不占 Actions 额度）。改为人工月检，方法：① TT 差集——`node` 脚本 diff `TokenTracker/src/lib/pricing/curated-overrides.json` 与本仓两份 curated（exact/fuzzy 双向键差集）；② LiteLLM 差集——比对上游 `model_prices_and_context_window.json` 的 `generated_at` 与本仓 seed `_meta.generated_at`，落后 >45 天则按 `docs/rewrite-plan.md` §4 流程重建 seed；③ models.dev 差集——参考 juejin `packages/core/scripts/sync-pricing.mjs` 的 kept/added/changed 日志口径，人工抽查 CN 提供商组。检查结果记入 `docs/rewrite-plan.md` §10 |
| 队列按月分片（juejin 式，原 D2） | **留待下轮**。触及对账基线文件 `queue.jsonl` 格式（硬性约束 8），风险中；当前队列体积无实测问题，有体感再立项 |
| opensquilla 来源（原 C3） | **取消**（无用户需求） |
| 桌面端 / 本地面板回搬 | 本地面板是 fork 时的明确裁撤决策（`cli.js:348-349`）；桌面端是数周级独立工程，与本报告收益无关 |
| TT `wrapped` 年报 / juejin `service` 命令 / 订阅卡片 UI / juejin 其余 8 个独有 parser | 单人自托管场景价值低或流行度未确认；如未来公开实例化再评估 |
| juejin `local_metrics` 本地缓存命中率 | 价值中等但无展示位（TU 无本地 CLI 面板页），待桌面端/面板决策后一并考虑 |
| Sentry 等遥测回搬 | 0.2.6 已决策移除，不回摆 |
| ~~limits 磁盘缓存回退~~（原 2026-11-03 C1 新发现候选） | **已交付（2026-11-03 起，见 `packages/cli/CHANGELOG.md` 的 `## Unreleased`）**：cursor/kimi/grok 限额卡与 DeepSeek 余额卡新增磁盘缓存回退（请求超时/5xx 时展示上次成功读数并标 `stale`），身份指纹绑定、凭据类错误不回退；limits 磁盘缓存 stale TTL 统一 12h。测试 `cursor/grok/kimi-limits-cache-fallback` 等 22 例。 |

## 5. 用户输入（2026-11-03 已全部拍板）

1. **juejin 署名** → **接受**。凡复制其数据或代码，在 `THIRD_PARTY_NOTICES.md`（根 + `packages/cli/`）新增 juejin-cn MIT 条目（含来源仓库与 commit `f72ca4d`）。
2. **CI 周报（D1）** → **不做**。不新增 scheduled workflow；改为人工月检，方法见 §4「定价差集人工月检」。
3. **opensquilla（C3）** → **取消**（无用户需求）。
4. **bucket project 维度** → **记入远期 backlog**（`docs/rewrite-plan.md` §10），需契约 v2，本轮不实现。
5. **C2 align-unknown** → **接受两步走**：本轮只做 dry-run 差异预览并给出结论，不改历史 unknown 桶归属；落地需再次确认。

## 6. 完成定义（全部批次后的可测指标）

| 指标 | 现状（2026-11-03 实测） | 目标 |
|---|---|---|
| curated 定价覆盖 | exact 91 / fuzzy 47（web 与 CLI 同步） | exact ≥ 220 / fuzzy ≥ 56（+TT 29+9，+juejin 选摘约 100） |
| 定价双份漂移 | 无守卫，靠人工 | parity 测试进 CI，漂移即红 |
| limits 面板提供商数 | ~16 家 | 17 家（+deepseek） |
| CLI 测试文件数 | 19 | ≥ 27 |
| 计价可观测 | 无 | `status --json` 含 pricing 版本块；`doctor` 输出近 7 天计价命中率与 unknown Top N |
| 计价命中率 | 未知（B3 产出 baseline） | mimo/muse/qoder/kimi 来源近 7 天命中率 ≥ 95% |
| CI 门禁 | `pnpm verify` + Windows CLI 冒烟 | 上述新增测试全部纳入，全绿 |
| 契约层 | 未动 | 未动（证明：cli-contract.md 与 golden 测试零 diff） |

## 7. 执行记录与 dry-run 结论（2026-11-03）

**B1/A2 核价记录**：A2（TT 29+9）抽取 8 条与官方页核对全部一致——claude-opus-4-5 /
opus-4-6 / sonnet-4-6 / haiku-5-5（platform.claude.com）、kimi-k3.1-pro / k3.1-pro-highspeed
（platform.kimi.ai）、gpt-6.1-terra / gpt-6-luna（developers.openai.com）。qwen3.8-max
与 gpt-5.x 条目依据 TT note 中的官方链接与核对日期（2026-10-25/10-31），本轮页面 JS
渲染未能在线复核。B1（juejin 69 条）抽取 doubao-seed-2.0-pro 核对：官方 ¥3.2/¥16
每 MTok（≤32k 档），条目 $0.442/$2.213 按汇率换算一致；juejin 数据来自 models.dev
官方渠道集（其 `_meta` 有逐次同步日志）。volcengine 官方按输入长度分段计价，条目为
≤32k 档参考价——与其他 flat-rate 条目的口径一致，估算用途可接受。

**B3 基线（本机实测，2026-11-03，7 天窗口）**：102 桶；桶覆盖 92.2%（94/102），
token 覆盖 97.3%（365.3M / 375.3M）。Top 未定价：`u2-flash`（dsh，7.87M tokens）、
`step-5-preview`（pi-stepfun，2.18M tokens）、`dfmodel`（qoder-cn，0 tokens，
credits-only 桶，无害）。**新发现**：`step-5-preview` 在 juejin stepfun 组有官价
（本轮五组未含 stepfun），`u2-flash` 两家上游均无定价——两者是下一轮月检的首选候选。

**C2 align-unknown dry-run 结论**：本机 7 天窗口内 `unknown` 模型桶为 **0**（unknown
桶 / 可对齐桶 / 不可解桶全部为 0），落地对齐对本机历史数据**零影响**。机制已实现为
`doctor` 常驻只读预览（`pricing-coverage.js` 的 `previewUnknownAlignment`，fixture
测试覆盖对齐与不可解两条路径）。**结论：两步走的第二步（落地写入对齐）无收益，不执行**；
若未来 doctor 报告显示 unknown 桶 >0 再议。

**C1 移植结果（2026-11-03）**：4 个目标测试文件**均未移植**，证据：
① `cursor/grok/kimi-limits-cache-fallback` 三件测的是上游 fork 后新增的 limits 磁盘缓存
（上游 `usage-limits.js` 的 `CURSOR/KIMI/GROK_LIMITS_CACHE_FILE` 与 `read/write*LimitsCache`，
本仓库全量检索零匹配；本仓库 cursor/grok/kimi 的 live 结果连 `stale`/`cached_at` 字段都没有）；
② `session-response-cache` 测上游 `local-api.js` 的响应缓存，而本仓库 fork 刻意退役了整个
local API（`test/packaging.test.js` 有「the retired local API stays deleted」守护断言）。
属功能缺失而非实现 bug，符合「只加测试」范围外，故转入 §4 新候选（limits 磁盘缓存回退，
待拍板）。本轮 CLI 测试增量改由 A1 parity / A3 pricing-meta / B3+C2 pricing-coverage /
B2 deepseek 承担。

**缺口官价核实（2026-11-03，当日已落地，commit `863e81d`）**：
- `u2-flash`（dsh 来源桶，7 天 7.87M tokens，其中缓存命中 6.91M）= 云知声 Unisound
  U2-Flash。官价已核实：<https://maas.unisound.com/docs/price/overview> 与模型广场页
  （2026-10-12 更新）——输入 ¥1 / 缓存命中 ¥0.2 / 输出 ¥2 每 MTok（按量付费档；
  另有 U Plan 订阅档，若实际走订阅则参考价会高估，与 grok/kimi/zcode 订阅制来源的
  估算口径一致）。落地条目：`{"input":0.14,"output":0.28,"cache_read":0.03}`
  （7.2 汇率、两位小数，同 iFlytek 先例）。此前三家（本仓库两份 + LiteLLM/models.dev
  系）均未收录：该模型 2026-09-15 才发布，Unisound 不在两个目录内。
- `step-5-preview`（pi-stepfun 来源桶，7 天 2.18M tokens，其中缓存命中 2.01M）= 阶跃星辰
  Step 5 Preview。官价已核实：国际站 <https://platform.stepfun.ai/docs/en/guides/pricing/details>
  $1.00 / $0.10（缓存命中）/ $2.70 每 MTok；国内站 ¥7 / ¥0.70 / ¥20（缓存命中价
  2026-10-14 起由 ¥0.35 调至 ¥0.70）。**更正**：该模型在 web 端自 2026-10-22 起已由
  `selfhost-overrides.json` 覆盖（同价），真实缺口仅在 CLI 侧与「curated 为价格源」的
  归属；本轮按设计把它从 selfhost **提升为 curated 正式条目**（沿用官价与
  cache_write=input 口径），selfhost exact 表随之清空，web provenance 测试改由
  source_exact 的 `opencode/big-pickle` 承担。juejin 虽有该模型但转录值偏离官价
  4–10%，未采用。
- 落地后实测（同窗口平移约 1 小时，桶数 102→105）：token 覆盖 **100.0%**
  （368.7M/368.7M），桶覆盖 96.2%（101/105）；残留 unpriced 仅 `dfmodel`
  （qoder-cn credits-only 零 token 桶 ×4，设计内无害）。
