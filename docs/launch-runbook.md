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
   互不冲突。

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

1. `npm i -g tokenusage-cli`（发布后）或从仓库 `packages/cli` 安装；
2. `tokenusage device-login` → 浏览器登录新站点 → `/device` 批准 `user_code`；
3. `tokenusage sync --drain` → 仪表盘/Sessions 出现该设备数据；
4. 对账：`tokenusage sessions --format json` 汇总与 /sessions 页一致（token、会话数），
   无标题/绝对路径等敏感字段；
5. 对账一致后撤旧计划任务/停旧 tokentracker CLI（该机 G1 完成）。

回滚：停新 CLI、恢复旧计划任务即可——两套数据目录互不干扰，旧 CLI 的队列与偏移原样保留。

## 回滚

任何一台采集机迁移后异常：把该机 base URL 改回 `https://tokentracker.baiwumm.com/api`
即回到旧系统，本地队列自动补传断连窗口的数据。旧系统在退役闸门（G2）前始终在线，
回滚按台执行、互不影响。

## 退役

按 `docs/rewrite-plan.md` §6 第 4 步与 §7 的 G2 / G3 闸门执行：全部采集机迁移完成 →
旧系统只读冻结 → 手动全量备份 → 对账连续一致 → 删旧表（G2）→ 旧仓库 Archive（G3）。

## 自动发版

- GitHub Actions 跑 `pnpm verify` 作为合并门禁；Vercel Git 集成负责构建：
  每次 push 自动生成 Preview，main 产出 Production。
- M6 接入：tag 触发版本号、CHANGELOG、Release 的自动流水线。
