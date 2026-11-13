# scripts/

运维与资产生成脚本。**不参与 `pnpm verify`**（web / cli / landing / desktop 的构建与测试都不依赖这里）。
每个文件只承担一件事，一次性脚本用完即删或移入 `archive/`。

## 活脚本（还会被用到）

| 路径 | 用途 | 何时用 |
|---|---|---|
| `admin/create-user.cjs` | 管理员建号：邀请邮件模式或「直接建号 + 临时密码」模式 | 新部署或加人，见 `docs/invite-flow.md` |
| `admin/achievements-calibrate.mjs` | 只读校准：用真实实例全历史算出 20 条成就的当前值与命中分布 | 调成就阈值前，见 `docs/achievements-plan.md` §5 |
| `admin/achievement-assets/generate.mjs` | 成就徽章出图流水线（MiniMax → QA → 圆形裁切 → 量化） | 新增/重做成就插画，见同目录 `README.md` |
| `admin/desktop-assets/generate.mjs` | 桌面端图标与托盘素材生成 | 改桌面端品牌资产时 |
| `admin/desktop-release/assemble-updater-manifest.mjs` | 组装桌面端 updater 清单（`desktop-latest/latest.json`） | `release-desktop.yml` 发版时调用 |
| `selfhost/verify-two-device.cjs` | 两台采集机的聚合对账（契约端点 vs 表级真值） | 怀疑跨设备汇总漂移时 |
| `selfhost/verify-cross-device.cjs` | 跨设备去重与账户级来源的对账 | 同上，覆盖 cursor 账户级来源 |

## 归档（保留为记录，不再执行）

| 路径 | 说明 |
|---|---|
| `archive/replay-legacy-history.mjs` | 旧系统历史重放（2026-10-26 已执行）。依赖旧 Supabase 的导出文件，而旧项目已于 2026-10-29 删除，仅作留档 |
| `archive/project-backfill.cjs` / `archive/project-backfill-core.cjs` | 2026-11-04 一次性回填 opencode 历史桶的 `project_key` 拆分行（255 组 / 337 行）。结果与对账见 `docs/rewrite-plan.md` §10 |
| `archive/seed-queue.cjs` | M1 对账用的种子队列解析器；`apps/web/tests/unit/seed-queue.test.ts` 仍直接测它的 `parseQueue`，所以随测试一起保留 |

## 已删除（2026-11-13 文档审计）

`selfhost/accept-m1.cjs`、`selfhost/preview-m3.cjs`、`selfhost/preview-m4.cjs`
——M1 契约层验收运行器与 M3/M4 里程碑预览工具。结论已固化在 `docs/rewrite-plan.md` §5 的
里程碑验收栏，脚本本身无复跑价值。
