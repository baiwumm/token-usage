## 变更说明

<!-- 一句话说明「为什么改」，以及改前改后的行为差异 -->

Closes #

## 涉及范围

- [ ] 仪表盘 / 契约层（`apps/web`）
- [ ] 采集 CLI（`packages/cli`）
- [ ] 落地页与文档（`apps/landing`）
- [ ] 桌面端（`apps/desktop`）
- [ ] 数据库迁移（`supabase/migrations`）
- [ ] 仅仓库级（`docs/` / `scripts/` / `.github/`）

## 一致性与真源检查

- [ ] 若改 CLI 契约层（`token-usage-*`）：已先更新 `docs/cli-contract.md` 与 golden 测试
- [ ] 若改数据库：迁移保持幂等，upsert 键与 `docs/rewrite-plan.md` §3 一致
- [ ] 若写 UI：遵循 `docs/ui-spec.md`，组件后缀按 `AGENTS.md` 的登记表命名
- [ ] 若新增运行时依赖：已获得批准并同步 `docs/rewrite-plan.md` §4 的预算
- [ ] 若行为变化：已回写对应文档（需求变更回 `docs/requirements.md`）
- [ ] 若涉及机密：测试与文档只用伪造值，没有 service-role key / 设备令牌 / 配对码

## 验证结果

<!-- 填实际跑过的命令与结果；未跑的项写明原因 -->

- 本地 `pnpm verify`：
- 额外的针对性验证（单个测试文件 / 桌面端 Rust 门禁等）：

## 截图 / 录屏

<!-- UI 变更必填；无视觉变化可删除本节 -->
