# 运维 Runbook

面向**已有实例**的升级、冒烟与回滚。从零部署看 [`docs/deploy-guide.md`](deploy-guide.md)；
采集机身份对照与历史对账记录见 [`docs/archive/machines.md`](archive/machines.md)。

生产实例 `app.token-usage.cc` 承载多台采集机（2026-11-17 域名迁移，旧生产域名已从 DNS 与
Vercel 注销，**改回旧 base URL 的回滚路径不存在**；存量 CLI 安装由
`packages/cli/src/lib/runtime-config.js` 的 legacy 归位机制自动落到新域）。

## 升级已有部署

1. **补迁移**：按文件名顺序执行 `supabase/migrations/` 中尚未应用的迁移（幂等，可重复跑）。
   当前共 21 个；漏跑 `20261103000000`（桶级 `project_key`，是 upsert 键的一部分）会让新版 CLI
   的 ingest 整批失败。`20261104000000` 是纯注释迁移，`20261106000000` 只影响项目仓库链接与
   项目 Profiles（ingest 的 `projects` 写入是 best-effort）。`20261122000000` 是可选的远端
   价目表（写入面见 `docs/deploy-guide.md`「远端价目表」），空表不影响任何行为。
   **2026-11-13 徽章模型重置**：`20261113000000` 会 drop 旧徽章表（不可重放、历史令牌全部
   作废），`20261113000001` 重建为「账户设置 + 每枚徽章」两表；升级后需在
   `/settings?section=badges` 重新新增徽章、把新链接填回 README / 个人主页，并重建
   `apps/landing`。`20261114000000` 把公开名称收紧到 30 字符、新徽章默认折线。
2. **配环境变量**：新增变量按 `docs/rewrite-plan.md` §5 与 `apps/web/.env.example` 补到
   Production 与 Preview 各一份。
3. **部署**：main 出 Production（Vercel Git 集成）。`apps/web/vercel.json` 的 `ignoreCommand`
   三段判定：①非 `main` 分支（`VERCEL_GIT_COMMIT_REF`）一律跳过——`landing-release`（EdgeOne
   镜像分支，机制见 `deploy-landing.yml` 头注释）与 dependabot 分支不再触发 preview 构建；
   ②`main` 上先验 `VERCEL_GIT_PREVIOUS_SHA` 可达——分支久未部署时基线 commit 不在浅克隆
   历史里（`fatal: bad object`），不可达则继续构建（fail-safe，宁可多构建不漏部署）；
   ③**本次推送整批提交**未触及 `apps/web`、根 `pnpm-lock.yaml` / `pnpm-workspace.yaml` /
   `package.json` / `.npmrc` 时跳过构建（Production 与 `token-usage-demo` 共用 Root
   `apps/web`，一并生效；Vercel 显示 Skipped）。diff 基线是 Vercel 注入的
   `VERCEL_GIT_PREVIOUS_SHA`（推送前分支顶端），env 缺失回退 `HEAD^`——单提交推送两者等价。
   依赖升级仍需重建，所以根 lockfile 与安装配置变化不会被跳过。
   删除该字段即恢复每次提交全量构建。控制台手动 Redeploy 不走 ignoreCommand，必触发构建。
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
main 上未触及 `apps/landing/**` 的提交不会触发部署：`deploy-landing.yml` 已用 `paths`
限定，并只把变更镜像到 `landing-release` 分支供 EdgeOne 自动构建。
回滚 = 在 EdgeOne 重新部署上一版产物；页脚实时徽章依赖操作者实例在线（挂掉只影响该 `<img>`）。

## 自动发版

- GitHub Actions 在 main 上跑 `pnpm verify` 作为合并门禁；Vercel Git 集成负责 web 构建。
- CLI 走 tag 流水线：`.github/workflows/release-cli.yml` 在 `cli-v*` tag 上校验版本与 main 祖先、
  跑 `pnpm verify`、`npm publish --provenance` 并生成 GitHub Release；操作步骤见
  [`docs/cli-release.md`](cli-release.md)。
- 桌面端发版见 [`docs/desktop-plan.md`](desktop-plan.md) §9。
