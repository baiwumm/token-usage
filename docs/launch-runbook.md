# 发布 Runbook（v1）

部署、回滚、退役的操作手册，目标是人不在场也能重复执行。
闸门与迁移的完整背景：`docs/rewrite-plan.md` §6–7。

## 环境变量

清单以 `docs/rewrite-plan.md` §9 为准（全部 server-only，无 `NEXT_PUBLIC_*`）；
在 Vercel 项目的 Production 与 Preview 各配一份。

## 部署顺序

0. 本地开发：`.env.local` 由操作者提供（或 `vercel env pull`）；开发用测试专用用户与设备
   （操作者经 service-role 创建），生产数据零触碰。
1. 新建**独立的 Supabase 项目**（与旧系统项目分离），跑 `supabase/migrations` 建表；
   本仓库导入为新 Vercel 项目，绑定域名 `token-usage.baiwumm.com`，按 §9 配齐环境变量
   （Supabase 三项指向新项目）。
2. 在新域名跑下方冒烟清单，全绿（含旧路径别名）。
3. 【G1 闸门——操作者放行】采集机逐台把 base URL 改为
   `https://token-usage.baiwumm.com/api`。
4. 旧域名 `tokentracker.baiwumm.com` 与旧 Vercel 项目原样保留、继续运行旧系统，与新系统
   互不冲突（**2026-10-29 已整体退役**：旧 Supabase 项目、旧 Vercel 项目、域名 DNS 与旧
   GitHub 仓库全部删除，G2/G3 关闭）。

### 首个管理员账户

全新部署的库没有任何用户且公开注册关闭：部署者先用 service-role 建号脚本创建管理员
（M2 交付），登录后再在 `/device` 批准采集机配对。

## 冒烟清单

- `/` 返回 200；`/device` 可达且能提交配对码；
- CLI 全链路：`authorize` → `/device` 批准 → `poll` 拿到令牌 → `ingest` 一批 → 200；
- 旧路径别名：`GET /api/functions/tokentracker-public-config` 经 rewrite 返回与规范路径相同的结果；
- 仪表盘数值与 `queue.jsonl` last-wins 对账一致；
- 浏览器网络面板零 Supabase 直连请求。

## 新 CLI 迁移（M-CLI，tokenusage-cli）

新版采集器 `packages/cli`（fork 上游 CLI，命名/契约已对齐本仓库）。与旧 CLI 的差异：
数据目录 `~/.tokenusage`（旧为 `~/.tokentracker`）、命令名 `tokenusage`、契约路径
`token-usage-*`（旧 `tokentracker-*` 别名仅服务端兼容保留）、新增会话元数据上报
（`/sessions` 页面的数据源）。

逐台迁移（每台完成后进下一台；属于 G1 闸门，操作者放行）：

1. `npm i -g tokenusage-cli`（已发布，当前 0.2.6）或从仓库 `packages/cli` 安装；
2. `tokenusage device-login` → 浏览器登录新站点 → `/device` 批准 `user_code`；
3. `tokenusage sync --drain` → 仪表盘/Sessions 出现该设备数据；
4. 对账：`tokenusage sessions --format json` 汇总与 /sessions 页一致（token、会话数），
   无标题/绝对路径等敏感字段；
5. 对账一致后撤旧计划任务/停旧 tokentracker CLI（该机 G1 完成）。

回滚：旧系统（Vercel + Supabase + 域名）已于 2026-10-29 整体删除，恢复旧计划任务已无意义。
旧任务定义与旧数据目录仅作本地留档：
`%USERPROFILE%\Backups\tokentracker-retired-20261029.zip`（`retired-tasks/` + `tracker/`）。

### 第二台机器（公司机）迁移 + 历史补齐（已完成 2026-10-26，G1 全部完成）

两台采集机均已切至新系统（逐台步骤见上文「逐台迁移」；公司机实际执行序：tarball 安装 →
`device-login` 配对 → `sync --drain` 首采 → `scripts/replay-legacy-history.mjs` 重放历史 →
注册每小时任务 → 停旧 hook 与计划任务）。实测记录：

- 设备 `PC-20260408RIKF #68e47b34`：首采 1,281 桶 + 350 会话（0 跳过）；历史重放
  1,403 行 / 13.672B（脚本幂等，读刚配对的设备令牌，历史归该公司设备）。
- 验收（`account-devices` 实测）：设备 2 台、总量 20.94B（公司机 13.675B + 本机
  7.267B，本机含迁移后继续采集的增量），达成 ≈20.86B 预期。
- 公司机每小时任务 `TokenUsageSync`（/sc hourly）。注意：公司机为 Volta 管理的 node，
  全局包真实路径在 `%LOCALAPPDATA%\Volta\tools\image\packages\tokenusage-cli\...`，
  `npm prefix -g` 给出的路径不可用。0.2.4 起 init 会维护 `~/.tokenusage/tracker/app`
  自包含副本；Volta / NVM 切换 Node 版本后重跑 `init --yes --no-integrations --no-open`
  即可刷新，计划任务不再依赖原包路径。
- 旧 CLI 停用四处：Claude settings hooks 两处（备份 `settings.json.bak-tokentracker`）、
  计划任务 `TokenTracker Selfhost Sync` / `Drift Check` / `Backup` 已 Disable；
  2026-10-29 清理本机残留时连同 `~/.tokentracker` 与旧运行时数据一并移入归档并删除。

旧库（`tokentracker.baiwumm.com` + 旧 Supabase 项目）**已于 2026-10-29 整体删除**：旧 Vercel
项目、域名 DNS、旧 GitHub 仓库与旧 Supabase 项目均无残留，G2/G3 关闭。


## 回滚

旧系统已于 2026-10-29 整体退役（旧 Supabase 项目、旧 Vercel 项目、域名 DNS 与旧 GitHub
仓库全部删除，G2/G3 关闭），改回旧 base URL 的回滚路径不再存在。采集机异常只能在现行系统
侧处理：本地队列与水位保证不丢数据，修复后 `tokenusage sync --drain` 补传断连窗口。

## 退役

**已于 2026-10-29 完成**（操作者执行，未保留备份）：全部采集机迁移完成 → 旧定时任务停用
→ 旧 Supabase 项目删除（G2；新旧项目独立，无删表动作）→ 旧 Vercel 项目、
`tokentracker.baiwumm.com` 的域名 DNS 与旧 GitHub 仓库一并删除（G3，原 Archive 方案作废）。
旧系统自此无任何残留。

## 自动发版

- GitHub Actions 跑 `pnpm verify` 作为合并门禁；Vercel Git 集成负责构建：
  每次 push 自动生成 Preview，main 产出 Production。
- M6 接入：tag 触发版本号、CHANGELOG、Release 的自动流水线。
