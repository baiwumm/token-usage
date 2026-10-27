# tokenusage-cli 发版手册

npm 包 `tokenusage-cli` 的发布流程、首发未竟事项与发版后检查。机制由
`.github/workflows/release-cli.yml` 承载：`cli-v*` tag 触发 → tag 与
`packages/cli/package.json` 版本强校验且必须落在 main 上 → `pnpm verify` →
`npm publish --provenance`（Trusted Publishing，OIDC 免 token）→ 从
`packages/cli/CHANGELOG.md` 取本版本段落生成 GitHub Release。

## 0. 0.1.0 首发实录（2026-10-27，已完成）

- tag `cli-v0.1.0` 已打在 `875dd54` 并推送，仍是 main 祖先，**无需重打**。
- release run [40359194166](https://github.com/baiwumm/token-usage/actions/runs/40359194166)
  首跑在 npm publish 步失败：**npm PUT 404**（Trusted Publishing 不能创建新包）。
  按 §一 手动首发后重跑该 run：npm 已有该版本 → 自动跳过 publish、补建 GitHub
  Release（正文取 CHANGELOG），整条链转绿。
- 实录教训：手动首发是交互流程——账号 2FA 绑安全密钥（GPM passkey），publish
  会在浏览器再验一次 2FA，非交互终端直接 EOTP 退出；且曾从一个旧检出目录误发
  开发期版本 `0.0.0-stage`，再从正确目录补发 0.1.0（publish 自动把 latest 指向
  新版本）。残留版本清理见 §三。
- 手动首发的 0.1.0 没有 provenance 徽章；从 0.1.1 起由 CI 发布自动带上。

## 一、完成 0.1.0 首发（一次性，任一 npm 已登录环境）

```bash
npm login --registry=https://registry.npmjs.org   # 2FA 会提示 OTP
cd <仓库>/packages/cli
npm publish --access public --registry=https://registry.npmjs.org   # 手动首发；只打包已提交的 CLI 文件
```

注：默认源是 npmmirror 等国内镜像的机器（本机 `~/.npmrc` 即如此）必须显式
`--registry` 指回 npmjs——镜像是只读代理，登录它对发包无用，publish 也发不
上去。npm 凭证按源分别存储（`//registry.npmjs.org/:_authToken`），这样登录
不影响日常安装继续走镜像。

注：浏览器登录若卡在 passkey/Google 密码管理器（到不了 Google 的网络取不出
GPM 里的通行密钥，2026-10-27 公司机实测），改用终端登录，完全不经浏览器：

```bash
npm login --registry=https://registry.npmjs.org --auth-type=legacy
# 依次输入 Username / Password / OTP（2FA 验证器 App 的动态码）
```

然后在网页上登记 Trusted Publisher（无法用命令完成）：

> npmjs.com → tokenusage-cli 包页 → Settings → Trusted Publisher →
> Repository: `baiwumm/token-usage`，Workflow filename: `release-cli.yml`，
> Environment 留空，Allowed actions 勾 `Allow npm publish`（workflow 直接
> `npm publish`，不勾则 CI 发包被拒；`Allow npm dist-tag` 不勾，用不到）。

登记完成后重跑失败的 run（npm 已有该版本 → 自动跳过 publish，只补 Release）：

```bash
gh run rerun 40359194166 --failed
```

验证三件齐活：

```bash
npm view tokenusage-cli version        # → 0.1.0
gh release view cli-v0.1.0             # 正文来自 CHANGELOG 的 0.1.0 段
```

注：手动首发的 0.1.0 没有 provenance 徽章；从下一个版本起由 CI 发布自动带上。

## 二、日常发版（此后每次，全自动）

1. 改 `packages/cli/package.json` 的 `version`，并在 `packages/cli/CHANGELOG.md`
   顶部补一节 `## X.Y.Z`（release notes 的来源，缺了会退回自动生成）。
2. 提交并推送 main，确认 CI 绿。
3. 打 tag 并推送：`git tag cli-vX.Y.Z && git push origin cli-vX.Y.Z`
   （必须打在**已推送**的 main 提交上；打在旧提交上不会触发任何东西且无报错）。
4. workflow 全自动完成：版本校验 → main 祖先校验 → `pnpm verify` → 发包 → Release。
5. 纪律：run 结束前不要 rebase / 强推 main——重写历史会让 tag 脱离 main，
   发布被安全拒绝（只会发不出去，不会发错）。

回滚：误发版本用 `npm deprecate tokenusage-cli@X.Y.Z "reason"` + 发 patch 版；
确需下架走 npm 联系支持（unpublish 有 72h 限制），GitHub Release 手动删除。

## 三、发版后事项（0.1.0 发布后逐项勾掉）

- [x] **清理 npm 残留版本**（2026-10-27 已删，npm 现仅 0.1.0）：首发时误发的
  `0.0.0-stage`，`npm unpublish` 72h 窗口内删除。
- [x] **登记 Trusted Publisher**（2026-10-27 已配）：§一第二步的网页操作，
  0.1.1 起 CI 自动发包的前提。
- [x] **公司机换装正式包**（2026-10-27 完成）：`volta uninstall tokenusage-cli`
  → `volta install tokenusage-cli@0.1.0`（镜像可见后 Volta 可直装，未需
  --force 回退）；装后 `status` 配对信息完好，`sync` 增量 25,387 文件、
  2 会话 + 2 桶上传成功。开发期安装的 init / device-login 无需重做。
- [ ] **本机更新采集器**：`npm i -g tokenusage-cli@latest`。本机全局安装
  （`E:\nodejs\node_modules\tokenusage-cli`）目前是旧版——更新后 94bb8e9 的
  auto 进度输出与 875dd54 的日志降噪才生效；计划任务无需改动（VBS 包装指向
  的 node/CLI 路径不变）。
- [ ] **本机计划任务复验**：`Start-ScheduledTask TokenUsageSync` 后确认
  `LastTaskResult=0`、日志 `C:\Users\i\.tokenusage\logs\sync.log` 正常追加且
  不再出现 SQLite ExperimentalWarning。
- [ ] **公司机换装正式包**（2026-10-27 实查：公司机已装开发期 0.1.0（Volta
  全局），且已配对在传——`tokenusage status` 显示 device token set、queue 0，
  `init` / `device-login` 不必重做）：发布后 `volta install tokenusage-cli@0.1.0`
  换成 npm 正式产物（同版本号下直接 `npm i -g tokenusage-cli` 会被 "up to
  date" 跳过，等价命令 `npm i -g tokenusage-cli@0.1.0 --force`），装完
  `tokenusage status` 确认 device token 仍在，跑一次 `tokenusage sync` 收尾。
  默认源走镜像的机器要等 npmmirror 同步上游后才装得到
  （`curl https://registry.npmmirror.com/sync/tokenusage-cli` 可手动触发），
  急用可对 npmjs 显式 `--registry` 强装。
  旧账迁移按 `docs/launch-runbook.md` 与桌面 replay 材料（约 13.6B 待迁）。
- [ ] **观察首日**：仪表盘数据、sync.log、GitHub Release 页面三处对账。

## 四、CLI 下版本候选（0.1.1 / 0.2.0，不阻塞已发版本）

> **0.2.0 实施进度（2026-10-28）**：P1 服务端（`token_sync_runs` 迁移、
> `token-usage-sync-report`、第 8 个 series `account-sync-runs` + golden 20 例 +
> §2.11/§2.12 转正式）已推送（`731f6f5`）；P2 CLI 侧（下述采集控制 + 五修）已实现，
> 42 个 node --test 全绿。**剩余**：P3 仪表盘"采集记录"页（web 侧）与 P4 发版收尾
> （bump 0.2.0 + CHANGELOG + 勾本节剩余项）。

功能（采集控制，2026-10-27 用户场景提出：不想自动采集、只想手动 `sync`）——**已实现**：

- [x] `tokenusage pause` / `resume` 子命令：`~/.tokenusage/pause.flag.json` 持久标志，
  `sync --auto` / `--watch`（及 notify/retry/background 派生）检测到即静默退出且不上报；
  `status` 显示采集状态。标志位方案跨平台通用（cron/launchd 任务天然兼容）。
- [x] `init` 接管 Windows 计划任务注册（`TokenUsageSync`，每小时；默认经
  `bin/run-sync-hidden.vbs` 隐藏窗口运行、免 conhost；`--no-task` 可跳过）；
  pause/resume 顺势对任务做 disable/enable（无任务时报"not found"不报错）；
  autoLog 落滚动日志 `<trackerDir>/logs/sync.log`（1 MiB 轮转一代），注册不再依赖
  `>>` 重定向；uninstall 顺势删任务与 VBS。
- [x] `init` 持久配置 `--run-report=on|off`（默认开，off 写 `config.json` 的
  `runReport:false` 关闭上报）；`status` 可见；sync 收尾按 §2.11 上报运行记录
  （每轮含空跑；幂等 `run_id`；trigger 区分 scheduled/manual/watch/notify；
  best-effort——失败/404/5xx 只记本地日志，绝不影响 ingest 与退出码）。

功能（采集记录，跨 CLI + web，契约 `docs/cli-contract.md` §2.11/§2.12 已转正式）：

- [x] CLI 每轮 sync（含空跑）向 `token-usage-sync-report` 上报运行记录（见上）。
- [ ] 仪表盘"采集记录"菜单与列表页：读取 `token-usage-account-sync-runs`（§2.7 第 8
  个 series，服务端已上线）。**待 P3**（web 大施工收尾后的最后一块）。

正确性修复（审计 P2）——**五项全修，用例在 `packages/cli/test/audit-fixes.test.js`**：

- [x] `init.js` 死常量 `www.tokenusage.cc`（已删除并有源码级防回归测试）；
- [x] zcode 恢复行补 billable/cost 字段（`zcodeRowTotals` 填充，恢复行 schema 齐全）；
- [x] 桶键 `|` 分隔符与含 `|` model 名的往返解析（`parseBucketKey` 改末段规则 +
  `zcodeHourFromMainBucketKey` 对齐）；
- [x] OpenCode 负 delta 链路（DB 路径应用签名 delta 后 `clampTotalsNonNegative`）；
- [x] `runtime-config` 的 `INSFORGE_*` env 名（新增 `TOKENUSAGE_BASE_URL` /
  `TOKENUSAGE_ANON_KEY` 优先，旧名保留为兼容回退）。

另案处理：apps/web 的 10 条依赖审计通告（1 low / 5 moderate / 2 high /
2 critical），属仪表盘侧。
