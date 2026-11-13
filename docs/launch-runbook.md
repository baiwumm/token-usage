# 运维 Runbook

面向**已有实例**的升级、冒烟与回滚。从零部署看 [`docs/deploy-guide.md`](deploy-guide.md)；
采集机身份对照与历史对账记录见 [`docs/archive/machines.md`](archive/machines.md)。

生产实例 `token-usage.baiwumm.com` 承载多台采集机；旧系统已于 2026-10-29 整体退役，
**改回旧 base URL 的回滚路径不存在**。

## 升级已有部署

1. **补迁移**：按文件名顺序执行 `supabase/migrations/` 中尚未应用的迁移（幂等，可重复跑）。
   当前共 16 个；漏跑 `20261103000000`（桶级 `project_key`，是 upsert 键的一部分）会让新版 CLI
   的 ingest 整批失败。`20261104000000` 是纯注释迁移，`20261106000000` 只影响项目仓库链接与
   项目 Profiles（ingest 的 `projects` 写入是 best-effort）。
   **2026-11-13 徽章模型重置**：`20261113000000` 会 drop 旧徽章表（不可重放、历史令牌全部
   作废），`20261113000001` 重建为「账户设置 + 每枚徽章」两表；升级后需在
   `/settings?section=badges` 重新新增徽章、把新链接填回 README / 个人主页，并重建
   `apps/landing`。
2. **配环境变量**：新增变量按 `docs/rewrite-plan.md` §5 与 `apps/web/.env.example` 补到
   Production 与 Preview 各一份。
3. **部署**：main 出 Production，push 出 Preview（Vercel Git 集成）。
4. **冒烟**（下节），全绿后再逐台升级采集机。

采集机升级 CLI 后**必须**跑一次 `tokenusage init --yes --no-integrations --no-open` 刷新运行时
副本，再 `tokenusage doctor`；版本落后、副本缺失或计划任务降级都会在 `doctor` 里报出来。

## 冒烟清单

- `/` 返回 200；`/device` 可达且能提交配对码；
- CLI 全链路：`authorize` → `/device` 批准 → `poll` 拿到令牌 → `ingest` 一批 → 200；
- 仪表盘数值与 `queue.jsonl` last-wins 对账一致；
- **公开徽章**（`/settings?section=badges`）：新增一枚 → 打开复制出的链接出图 → 吊销后同链接
  显示 `badge unavailable` → 恢复后同一链接重新出图 → 删除后 `badge unavailable`；
- 浏览器网络面板零 Supabase 数据表直连请求；
- **旧路径已退役**：`GET /api/functions/tokentracker-public-config` 应为 404、写动词 405
  （契约 §1.5）。这是有声失败，钉版旧 CLI 会在这里被挡住而不是静默丢数据；
  `apps/web/tests/contract/legacy-alias-removed.test.ts` 守护该行为。

## 回滚

采集机异常只能在现行系统侧处理：本地 `queue.jsonl` 与水位保证不丢数据，修复后
`tokenusage sync --drain` 补传断连窗口。web 回滚用 Vercel 的 Promote / Rollback 回到上一版
部署，数据库迁移不回滚（迁移只做增量，保持向后兼容）。

**不可逆操作**（退役项目、删除数据、切换域名）必须操作者明确放行，Agent 代行即违规。

## 落地页部署（`apps/landing` → token-usage.cc）

与 web 部署相互独立：纯静态产物（`pnpm build:landing:deploy` 的 `out/`），无环境变量、无服务端，
托管腾讯云 EdgeOne Pages。接线、素材与快照说明见 [`apps/landing/README.md`](../apps/landing/README.md)。
回滚 = 在 EdgeOne 重新部署上一版产物；页脚实时徽章依赖操作者实例在线（挂掉只影响该 `<img>`）。

## 自动发版

- GitHub Actions 在 main 上跑 `pnpm verify` 作为合并门禁；Vercel Git 集成负责 web 构建。
- CLI 走 tag 流水线：`.github/workflows/release-cli.yml` 在 `cli-v*` tag 上校验版本与 main 祖先、
  跑 `pnpm verify`、`npm publish --provenance` 并生成 GitHub Release；操作步骤见
  [`docs/cli-release.md`](cli-release.md)。
- 桌面端发版见 [`docs/desktop-plan.md`](desktop-plan.md) §11。
