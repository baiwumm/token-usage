# 来源接入计划（存档索引）

> 状态：P0 / P1 / P2 三批与 2026-11-05 上游对齐批次**全部完成并已上 main**。
> 本文已从任务型文档压缩为结论索引；机制与背景以 `docs/sources-capture-audit.md` 为准，
> 契约以 `docs/cli-contract.md` 为准，UI 以 `docs/ui-spec.md` 为准。
> 新来源/新字段另开增量文档，不在本文件续写。

## 1. 已拍板决策（2026-10-31）

- **积分展示选 C 方案**：明细表积分列 + 来源卡角标 + 独立积分卡，三者都要。
- **Trae CN 本地库数据并入 `source: "trae"`**（依据见 audit §7）。
- **积分不换 token**（audit §2 铁律 1）；Hero 大数、成本、成就口径永不混入积分。
- **流程折中**（对硬性约束 1「先文档+golden → 确认 → 实现」）：契约文档 + golden + 实现
  整批完成后，用本机 `pnpm dev` 的真实效果作为确认点；操作者验收不过则整体 revert。
- **通用规律**：凡新增 ingest 字段，采集必须打到已部署新代码的端点，否则旧 ingest 白名单
  会静默丢字段而光标已推进。

## 2. 已落地结论

| 批次 | 内容 | 关键落点 |
|---|---|---|
| P0 | Trae CN 本地库接入（零契约/DB 影响，可整体 revert） | `trae-db.js` roots 增加 `Trae CN`；跨库 per-store ledger；`status` 显示库数与路径 |
| P1 | `credits` 可选字段全链路（浮点，如 0.642） | 契约 §2.4 + §3 语义；`ingest-sanitize.js` 清洗；迁移 `20261031000000`；`normalize.ts` 解析（缺省 0，缺失即被丢弃） |
| P2 | Sessions 会话级 credits + `credits_ingested` 遥测 + 模型名大小写归一 | 迁移 `20261031000003` / `20261031000001`；RPC `token_upsert_sessions` 替换；读侧按 `lower(model)` 分组 |
| 上游对齐 | Cursor CSV 准入与 userId 候选、Qoder credits/准入/时间戳、Trae CN app dirs、文档漂移 | `cursor-config.js`、`qoder-limits.js`、`qoder-*` 解析器；零契约 / 零 DB 变更 |

已明确**不做**：积分 × 系数换 token 入库；给 cursor 加探测行（未安装）；kiro credits sidecar 入桶。

## 3. 积分展示 C 方案（代码注释引用本节）

明细表「积分」列（无积分来源显示 `—`）+ 来源卡积分角标 + 独立「积分消耗」卡（双栏之后、明细之前）。
credits 是**独立维度**：历史会话保持 0（`ended_at` 严格 last-wins 不重写老快照），永不并入
token / 成本 / 成就口径。展示文案走 `lib/copy` typed 字典，数字格式走统一 format provider。

## 4. 唯一未决项

- [ ] **A10 — Cursor 厂商真实成本是否接线**：`parseCursorCsv` 解析了厂商 Cost 列，但
  `normalizeCursorUsage` 不产出成本、`parseCursorApiIncremental` 不写 `total_cost_usd`，
  因此 Cursor 成本实际与其他来源一样是「token × 定价」估算。2026-11-05 仅校正了
  `docs/sources-capture-audit.md` §3 的 reported-first 表述（实现未动）。
  **是否接线真实成本需操作者单独拍板**——涉及队列/云端口径与历史重算。

## 5. 历史锚点

| 事件 | 结果 |
|---|---|
| 2026-10-31 | P0/P1 执行并上 main（`c8b9d9e` / `6ec6220` / 文档 `46a054c`）；迁移应用 + 历史补记 + 验收通过（`52e5808..bbc42e8`） |
| 2026-10-31 | P2 增量上 main：`8d81282`（Sessions credits）、`bd124cc`（遥测）、`b19e57b`（模型归一） |
| 2026-11-01 | CLI 0.3.0 发布（tag `cli-v0.3.0` / `56ff02c`），全局包与运行时副本均升级，Trae CN 进入持续采集 |
| 2026-11-05 | 上游对齐批次完成（A8 决定不采纳、A9 已接线限额面板）；A10 留待决策 |
