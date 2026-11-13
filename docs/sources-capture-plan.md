# 来源接入结论索引

本文只记来源接入的已拍板决策与已落地结论（索引）；机制与背景以
`docs/sources-capture-audit.md` 为准，契约以 `docs/cli-contract.md` 为准，UI 以
`docs/ui-spec.md` 为准。新来源 / 新字段另开增量文档，不在本文件续写。

## 1. 已拍板决策

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

## 4. 未决项

无。最后一项 A10 已关闭，记录保留如下：

- **A10 — Cursor 厂商真实成本是否接线** → **关闭**：近 30 天 Cursor 用量为 0（历史累计约 340 万
  tokens），接线要改成本算法并重算历史，恢复使用后再立项。机制现状：`parseCursorCsv` 解析厂商
  Cost 列，但 `normalizeCursorUsage` 不产出成本、`parseCursorApiIncremental` 不写
  `total_cost_usd`，因此 Cursor 成本与其他来源一样按「token × 定价」估算。
