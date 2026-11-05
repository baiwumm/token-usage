# 发布 Runbook（v1）

部署、冒烟与回滚的操作手册，目标是人不在场也能重复执行。**从零部署**看
[`docs/deploy-guide.md`](deploy-guide.md)；本页只保留「升级已有部署」与日常运维增量。

**现状**：生产实例 `token-usage.baiwumm.com`，两台采集机在传；旧系统（`tokentracker.baiwumm.com`
+ 旧 Supabase / Vercel / GitHub 仓库）已于 2026-10-29 整体删除，**无回滚路径**。

## 采集机清单（设备身份对照）

文档一律用「家机 / 公司机」指代，**并附云端设备名**。设备名分两个：

- **默认名**（稳定标识）：契约 `docs/cli-contract.md` §2.2 规定的 `<主机名> #<machine_id 前 8 位>`，
  签发时生成、不随改名更新。CLI 打印的也正是默认名（`status` / `doctor` / `sync` 等命令的
  `- Device:` 行——**CLI 0.4.7 起，未发版**；npm 最新仍是 0.4.6）。
- **云端当前名**：操作者可在仪表盘改名（`Home · C Future City` / `Company · Partner`）。

| 别名 | 云端当前名 | 默认名（稳定标识） | device_id | 账号 / 数据目录 | Node 与安装方式 |
|---|---|---|---|---|---|
| 家机 | `Home · C Future City` | `DESKTOP-MHFON1J #48ea790e` | `6a074a51-693b-48e3-9f65-0728f9f2ee5c` | `C:\Users\i\.tokenusage` | nvm-windows + npm 全局（`E:\nodejs` → `E:\nvm\nvm\v24.4.1` 符号链接） |
| 公司机 | `Company · Partner` | `PC-20260408RIKF #68e47b34` | `1bd2ff67-653f-4b9c-80a9-c7589432d431` | `C:\Users\Administrator\.tokenusage` | Volta 管理的 node（`npm prefix -g` 路径不可用） |

设备行以 `GET /api/functions/token-usage-dashboard?range=all_time`（设备令牌即可读）为准。
每个账号还有账户级来源 `cursor`（跨设备去重，不计入任一设备行）。

## 环境变量

清单以 `docs/rewrite-plan.md` §9 与 `apps/web/.env.example` 为准；
部署操作步骤见 [`docs/deploy-guide.md`](deploy-guide.md) §4。

## 部署顺序

1. **建库**：Supabase SQL Editor 按文件名顺序执行 `supabase/migrations/` 下的**全部**迁移
   （当前 13 个）。漏跑会直接导致 ingest 整批失败：
   - `20261031000000` / `20261031000001` / `20261031000003`——credits 列；
   - `20261101000000` / `20261105000000`——公开徽章表；
   - `20261103000000`——契约 v2 桶级 `project_key`（**新版 CLI 必需**，upsert 键的一部分）。
2. **配环境变量**：`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`（浏览器可见）
   与 server-only 的 `SUPABASE_SECRET_KEY` 等，Production 与 Preview 各配一份。
3. **部署 web**：本仓库导入 Vercel，绑定域名；main 出 Production，push 出 Preview。
4. **建管理员**：全新部署的库没有用户且公开注册关闭，用 service-role 建号脚本建管理员
   （`scripts/admin/create-user.cjs`，细则见 [`docs/invite-flow.md`](invite-flow.md)），
   登录后到 `/device` 批准采集机配对。
5. **跑冒烟清单**（下方），全绿后逐台切采集机 base URL 到 `https://token-usage.baiwumm.com/api`。

> 升级已有部署时，**只**补跑尚未应用的迁移（按文件名顺序），再部署新代码。

## 冒烟清单

- `/` 返回 200；`/device` 可达且能提交配对码；
- CLI 全链路：`authorize` → `/device` 批准 → `poll` 拿到令牌 → `ingest` 一批 → 200；
- 仪表盘数值与 `queue.jsonl` last-wins 对账一致；
- 浏览器网络面板零 Supabase 直连请求；
- **旧路径已退役**：`GET /api/functions/tokentracker-public-config` 应为 **404**、
  写动词应为 **405**（契约 §1.5）。这是有声失败，钉版旧 CLI 会在这里被挡住而不是静默丢数据；
  `apps/web/tests/contract/legacy-alias-removed.test.ts` 守护该行为。

## 新 CLI 迁移（tokenusage-cli）

采集器 `packages/cli`（npm 包 `tokenusage-cli`）。与已退役的旧 CLI 的差异：数据目录
`~/.tokenusage`（旧为 `~/.tokentracker`）、命令名 `tokenusage`、契约路径 `token-usage-*`。

逐台迁移（每台完成后进下一台）：

1. `npm i -g tokenusage-cli`（版本见 `docs/cli-release.md`）或从仓库 `packages/cli` 安装；
   升级后跑一次 `tokenusage init --yes --no-integrations --no-open` 刷新运行时副本；
2. `tokenusage device-login` → 浏览器登录新站点 → `/device` 批准 `user_code`；
3. `tokenusage sync --drain` → 仪表盘 / Sessions 出现该设备数据；
4. 桶级对账：`tokenusage reconcile --days 7` 应为 `OK`（有漂移会逐键列出并退出 1）；
5. 会话元数据：`tokenusage sessions --format json` 与 `/sessions` 页一致（token、会话数），
   无标题 / 绝对路径等敏感字段；
6. 对账一致后撤旧计划任务、停旧 hook。

**两台机器的迁移与历史重放已于 2026-10-26 完成**，首采与重放明细见 `docs/cli-release.md` §四/§五。

## 调度与运行时副本

`tokenusage init` 注册每小时自动采集（Windows 计划任务 `TokenUsageSync`，macOS launchd，
Linux systemd user timer），并在 `~/.tokenusage/tracker/app` 维护自包含运行时副本——
全局包路径失效时（如 nvm-windows 切换 Node 版本）自动回落到副本。
**升级 CLI 或切换 Node 版本后，务必重跑一次 `tokenusage init --yes --no-integrations --no-open`**。
`tokenusage doctor` 的 `runtime.copy` 检查会报告副本缺失、缺标记或版本落后。

## 回滚与退役

旧系统已整体退役，**改回旧 base URL 的回滚路径不存在**。采集机异常只能在现行系统侧处理：
本地队列与水位保证不丢数据，修复后 `tokenusage sync --drain` 补传断连窗口。

退役是不可逆的闸门：G1（切换）2026-10-26、G2（旧 Supabase 项目删除）与 G3（旧 Vercel 项目 /
域名 DNS / 旧仓库删除）2026-10-29，均由操作者放行执行完毕，**Agent 代行即违规**。

## 自动发版

- GitHub Actions 跑 `pnpm verify` 作为合并门禁；Vercel Git 集成负责构建：
  每次 push 生成 Preview，main 产出 Production。
- CLI 已接入 tag 触发流水线：`.github/workflows/release-cli.yml` 在 `cli-v*` tag 上
  校验版本与 main 祖先、跑 `pnpm verify`、`npm publish --provenance` 并生成 GitHub
  Release；操作步骤见 `docs/cli-release.md`。web 端仍由 Vercel 部署，不发 npm 版本。
