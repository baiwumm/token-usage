# M-CLI 任务书（tokenusage-cli）

> 2026-10-25 派发。执行者先读：`docs/cli-contract.md`（§1.5 路径别名 / §2.4 ingest / §2.7
> series）、`docs/rewrite-plan.md` §5 #149、上游仓库 `F:\projects\TokenTracker`（MIT）。
> 本文是唯一执行规范；与计划冲突时以本文为准并回写计划。

## 已确认决策（操作者拍板，2026-10-25）

| 决策项 | 结论 |
|---|---|
| npm 包名 | `tokenusage-cli`（bin 命令 `tokenusage`；crates.io 同名 Rust 工具不冲突 npm） |
| 默认生产 base URL | `https://token-usage-delta.vercel.app`（init 可 `--base-url` 覆盖，env `TOKENUSAGE_BASE_URL` 最高优先；**G1 前操作者核对实际生产地址**） |
| provider 范围 | 只保留操作者实际在用的解析器（以本机真实数据为准：claude / codex / zcode / opencode / cursor / trae-cn，另加 grok / kimi 若与 claude/codex 共享基础设施成本低），其余 provider 模块剥除并在 README 列出 |
| 上报节奏 | 手动 `sync` + `--watch` 常驻增量；`install-task` 计划任务 v1 不做（留接口） |

## 目标

fork 上游 CLI 为 pnpm workspace 子包 `packages/cli`（CommonJS，独立 package.json），实现：

1. 用量小时桶上报（与上游逐字同语义，指向新契约路径）。
2. **sessions 元数据上报（新增）**：`buildSessionAnalytics()` 的本地行 → 契约 §2.4
   `sessions` 数组 → 随 ingest 分批 POST。
3. 设备配对（`token-usage-device-flow-*` + `/device` 批准页）、`doctor` / `status` / `sync`
   / `uninstall` 命令保留，`--watch` 增量。

## 契约要点（sessions 上传映射）

| 契约字段 | 来源（session-analytics 行） | 注意 |
|---|---|---|
| `session_id` | 行 `session_id`（保留！上游在 summarize 时剥离） | ≤256，无路径分隔符 |
| `source` | 行 `source` | trim+小写；`cursor`/`trae-cn` 为账户级来源，**服务端整条跳过**——CLI 侧直接不采集，省流量 |
| `started_at` / `ended_at` | 行起止 ISO | `ended_at >= started_at` |
| `project_key` | 行 `project_ref` | 服务端取 basename；CLI 直接传 basename 更稳 |
| 六项 token 拆分 | 行 tokens | `total_tokens === input + cached + cache_creation + output`（reasoning 单列不计入），不满足则整批 400——映射处做恒等式自检 |
| `billable_total_tokens` | 无可靠来源时传 `null`（服务端按 total 计） | |
| `models[]` | 行 per-model 用量 | ≤32 条；每条同样满足四项之和 = 自身 total；数组非空时 sum = 会话 total |
| `title` / `project_ref` / resume 相关 | **不上传**（上游 privacy 边界沿用） | |

上报节奏：每批 ≤200 条、按 `ended_at` 升序；本地持久化每 `(device, source, session_id)`
的已报 `ended_at` 水位（沿用上游 0600 配置目录），等值/更旧跳过；与小时桶同请求发送
（契约：仅带 sessions 的请求也合法，桶为空时可不带桶）。

## 阶段拆解

1. **骨架迁移**：上游 `src/` → `packages/cli`；根 workspace 收编；`bin: { tokenusage }`；
   name `tokenusage-cli`；剥除 dashboard/、pet、桌面壳（TokenTrackerWin/Linux/Bar）、
   wrapped/serve 本地面板及未采用 provider 模块；` THIRD_PARTY_NOTICES` 保留上游 MIT 署名。
2. **指向新契约**：endpoint slug 全部换 `token-usage-*`（上游的 `tokentracker-*` 旧路径
   别名只存在于我们服务端，CLI 侧不留）；配对流走 `token-usage-device-flow-authorize /
   poll`，配对页 `/device`；base URL 决策见表。
3. **sessions 上传**（新模块 `src/lib/session-upload.js`）：按上表映射 + 水位去重 + 分批；
   `sync` 末尾调用；`--watch` 增量复用同一水位。
4. **测试**：上传 payload 的 golden 测试（对照 §2.4 校验清单逐条：恒等式、账户级来源、
   路径分隔符、≤200 分批、水位跳过）；复用上游可保留的单元测试；`apps/web` 的
   contract/ingest 测试不动。
5. **文档与迁移 runbook**：README（安装/配对/sync/watch）、
   `docs/launch-runbook.md` 增补「新 CLI 迁移」段（装新 → 配对 → 撤旧计划任务，进 G1）。

## 验收线

- 根 `pnpm verify` 全绿（CLI 测试纳入 workspace test script）。
- 真机冒烟：`tokenusage init --base-url ...` → `/device` 批准 → `tokenusage sync` →
  仪表盘/Sessions 页出现该设备数据；sessions 与上游本地 `tokenusage sessions --format json`
  （对账脚本）数值一致，无 title/绝对路径等敏感字段。
- **不做 npm publish**（发布是操作者动作）；不触碰 G1/G2/G3 闸门。

## 交付协议

- 按主题拆分提交（feat/chore/test/docs），带 `Co-Authored-By: ZCode`，`pnpm verify` 绿后
  push main。
- 遇到需要操作者决策的阻塞项：采用保守默认并继续，把决策点写入最终报告，不停工等待。
- 完成后输出：改造清单（保留/剥除的模块）、测试覆盖、遗留风险、G1 前检查清单。
