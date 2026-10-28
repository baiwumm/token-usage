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
  **2026-10-28 公司机已升 0.2.1 并验收**（sync/任务触发/运行报告全过）。
  弹窗停泊方案：init 接管未执行前，计划任务动作已手工换成隐藏窗口 VBS
  （`C:\Users\Administrator\.tokenusage\run-sync-hidden.vbs`，内部仍是
  `cmd /c node <包内 tokenusage.js> sync >> ~/.tokenusage/logs/sync.log`，
  保留日志 trail），每小时弹窗消失；init `--no-integrations` 落地后跑一次
  init 即可换成官方接管。注意 `schtasks /TR` 会毁坏带引号参数（实测把
  `"C:\...vbs"` 存成 `" C:\...vbs\` 导致 wscript 挂死）——改任务动作一律用
  PowerShell `Set-ScheduledTask`（参数原样存储），路径无空格时不加引号。
- [ ] **观察首日**：仪表盘数据、sync.log、GitHub Release 页面三处对账。

## 四、CLI 下版本候选（0.1.1 / 0.2.0，不阻塞已发版本）

> **0.2.3（2026-10-28 家里机按 0.2.2 升级清单实测发现）**：0.2.x 的 init 把隐藏
> VBS 注册到 `src/cli.js`（只导出 `run()` 的库文件，没有入口）——Windows 计划
> 任务每轮 0.1 秒退出 0，不采集、不写日志，`LastTaskResult` 恒为 0；且
> `--from-scheduled` 运行不落 autoLog，与 0.2.2 发布说明不符。两处均已修并加
> 回归测试。家里机已用 patch 包实测（任务 7 秒完成、滚动日志追加、
> `token_sync_runs` 记 `trigger=scheduled`）；升级 0.2.3 的机器重跑一次
> `init --yes --no-integrations --no-open` 修正任务入口。发版按 §二：提交 +
> push main → 操作者打 `cli-v0.2.3`。

> **0.2.2（2026-10-28）**：三小项 + 新机初始化严重缺陷修复。验收发现的
> `bin/tracker.js` 缺失（fork 改名 bin 后安装器未跟改，0.1.0 起 npm 全新安装
> 的 init 必崩、单测因跳过运行时拷贝漏网）已修 + 行为级回归测试（真实执行
> 运行时拷贝）；`init --no-integrations`（纯定时机器可安全重跑 init）、
> `--from-scheduled`（任务运行口径记 scheduled + autoLog trail + 不受 cloud
> 偏好门控）、`localhost:7680` 死常量清除，全部落地并经全新机器模拟（temp
> HOME）与 npm pack 产物实测。发版后公司机重跑 `init --yes --no-integrations`
> 完成 VBS 停泊方案 → 官方接管切换；家里机升级后同样可跑。

> **0.2.1 热修（2026-10-28）**：0.2.0 的运行上报在 `src/commands/sync.js` 用了
> 错误深度的 `require("../package.json")`（应为 `../../`），每轮 sync 启动即崩、
> 采集全断——懒加载路径未被任何测试执行，0.2.0 发布前未做本地包实测所以漏网。
> 修复 + 深度守卫测试（`collection-controls.test.js`）+ **先本地包实测通过再发
> 0.2.1**（操作者裁定的发版纪律：本地实测 → 才发包）。验收实测：本地源码 sync
> 全通、运行记录落库（manual/ok/非空跑）、pause/resume 含任务联动全过。
> **init 接管未在公司机执行**：init 会无开关地安装各工具 hooks/notify（本机
> 2026-10-26 拍板"无 hook、纯定时批扫"）——补产品待办：init 集成选择开关。
> 现有手动注册任务与 0.2.x 兼容（shim 已指向新版），不跑 init 不影响任何功能。

> **0.2.0 实施进度（2026-10-28，P1–P4 全部完成，待操作者打 tag 发版）**：
> P1 服务端（`token_sync_runs` 迁移、`token-usage-sync-report`、第 8 个 series
> `account-sync-runs` + golden + §2.11/§2.12 转正式）`731f6f5`；P2 CLI 侧（采集
> 控制 + 五修 + 运行上报）`2ea48be`；P3 web 采集记录页（首个 `/api/app/*`
> route + `/sync-runs` 页面）`d7d6829`（同 commit 修复 account-series golden
> 的日期敏感缺陷——滚动窗口以真实"今天"结尾，fixture 已钉时钟）；P4 版本
> bump + CHANGELOG（本 commit）。`pnpm verify` 全绿。**下一步是操作者手动
> 发版**：`git tag cli-v0.2.0 && git push origin cli-v0.2.0`（首次实战 Trusted
> Publisher，发完按 §三 清单逐项收尾：家里机/公司机升级到 0.2.0 并复验）。
> 注意：0.2.0 的 init 注册的日志在 `~/.tokenusage/tracker/logs/sync.log`（autoLog
> 滚动文件），与旧注册的 `~/.tokenusage/logs/sync.log`（`>>` 重定向）不同路，
> 升级后按新路径看日志。

### P3/P4 接续清单（0.2.0 收尾，2026-10-28 交接——已由接续会话执行完毕，存档）

**P3 —— web 采集记录页**（apps/web，一个 commit 推完；改动全部在 apps/web 侧）：

1. 数据路径（任务书裁定：`/api/app/*` route + service-role）：新建
   `apps/web/src/app/api/app/sync-runs/route.ts`——GET；用 `@supabase/ssr`
   的 server client（cookie store）解析浏览器会话拿 `user_id`，401 时回
   `{"error":"Unauthorized"}`；然后直接调
   `syncRunsPayloadForUser(userId, url.searchParams)`
   （已导出自 `src/lib/api/account-series-handlers.ts`，内部走 service-role +
   TTL 缓存，参数/响应逐字 = §2.12，含 366 天钳制与错误码）。仓库尚无
   `/api/app/*` 先例，这是第一个——不要动 `/api/functions/*` 冻结面。
2. 页面：`apps/web/src/app/sync-runs/page.tsx`（只放路由 + metadata +
   显式组合 AppShell 壳，对齐 2026-10-26 目录规范）+ 客户端代码
   `apps/web/src/components/sync-runs/sync-runs-client.tsx`。
3. 列表页复用 `components/sessions/sessions-client.tsx` 模式（先通读它）：
   `useSessionBootstrap` 引导（登录回跳 `/sync-runs`）、`useUrlFilters`
   （device/trigger/result/offset/page_size 写 URL，时间范围仅组件内状态、
   默认近 30 天、首帧清旧参数）、`DateRangePicker` + `RangePresetButtons`
   + `DeviceFilterSelect`（设备）、trigger/result 两个 Select（枚举
   scheduled/manual/watch/notify 与 ok/partial/error，全部选项 + 空跑可作
   筛选值）、`TablePagination` 默认 20/页、加载遮罩/骨架/错误重试/筛选空态。
4. 列：开始时间（started_at，倒序已由服务端保证）、设备、触发方式、结果
   （error 时显 `error_code`）、耗时（duration_ms）、解析文件/上传桶/上报
   Token（tabular-nums）、空跑 `Chip`（`empty === true`，样式弱化）。
5. 顶部小块（同 Sessions 汇总卡样式）："今日采集次数"与"最近采集时间"——
   复用同一 route：`totals.runs`/`totals.empty_runs`（今日窗口，浏览器时区
   `from=今日00:00&to=明日00:00`，与列表请求并行）、最近采集时间取列表首行
   `started_at`（今日窗口无结果时再发一个近 7 天窗口或直接 `—`）。
6. copy：`apps/web/src/lib/copy/sync-runs.ts`（zh/en typed 字典，对齐
   `lib/copy/sessions.ts` 结构）；文案中英齐、页面 375px 可用、语义组件
   （Typography/Card 复合结构）、Tailwind 数字简写（`N/4`，不写 px）。
7. 侧边栏：`components/app-shell.tsx` 导航加"采集记录"（Sessions 之后；
   图标用 `@gravity-ui/icons`，候选 `ClockArrowRotate` / `ArrowRepeat` /
   `History`——以实际存在为准）；语言切换文案同步进 copy 字典。
8. 验收：`pnpm verify` 全绿；真实账号手测一轮（CLI 0.1.0 不上报，页面
   空态要可看；空态文案引导"升级采集器到 0.2.0 后可见运行记录"）。

**P4 —— 发版前收尾**（一个 commit；**做完即停，tag/npm publish 归操作者**）：

1. `packages/cli/package.json` bump `0.2.0`；
2. `packages/cli/CHANGELOG.md` 顶部补 `## 0.2.0` 节（面向用户：pause/resume、
   init 接管计划任务（隐藏窗口）、autoLog 滚动日志、每轮运行上报（可关）、
   五个正确性修复——措辞参考 0.1.0 节）；
3. 勾掉本节 P3/P4 待办项、更新本进度注记；
4. `pnpm verify` 全绿 → push main → `gh run watch` 确认 CI 绿 → 停手。
5. 操作者手动收尾（勿代行）：`git tag cli-v0.2.0 && git push origin cli-v0.2.0`。

纪律提醒（全程有效）：只 `git add` 明确路径并核对暂存区（并行会话可能同时
在工作）；conventional commits + `Co-Authored-By: ZCode`；不碰
`~/.tokenusage`、不跑 sync、不发 tag、不 publish、不 force push。web 侧既有
4 条 no-console lint 警告与本任务无关。

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
- [x] 仪表盘"采集记录"菜单与列表页：读取 `token-usage-account-sync-runs`（§2.7 第 8
  个 series）；`/sync-runs` 页 + 首个 `/api/app/sync-runs` route（P3，`d7d6829`）。

正确性修复（审计 P2）——**五项全修，用例在 `packages/cli/test/audit-fixes.test.js`**：

- [x] `init.js` 死常量 `www.tokenusage.cc`（已删除并有源码级防回归测试）；
- [x] zcode 恢复行补 billable/cost 字段（`zcodeRowTotals` 填充，恢复行 schema 齐全）；
- [x] 桶键 `|` 分隔符与含 `|` model 名的往返解析（`parseBucketKey` 改末段规则 +
  `zcodeHourFromMainBucketKey` 对齐）；
- [x] OpenCode 负 delta 链路（DB 路径应用签名 delta 后 `clampTotalsNonNegative`）；
- [x] `runtime-config` 的 `INSFORGE_*` env 名（新增 `TOKENUSAGE_BASE_URL` /
  `TOKENUSAGE_ANON_KEY` 优先，旧名保留为兼容回退）。

新增待办（2026-10-28 公司机验收发现的真实缺口）：

- init 集成选择开关：init 目前无条件安装全部检测到的 hooks/notify，机器若拍板
  "纯定时批扫"就无法只接管计划任务。加 `--no-integrations`（或交互式逐工具
  选择），让"只要任务注册、不要 hook"的机器能安全重跑 init。顺带修 init 输出里
  写死的 `http://localhost:7680` 死常量（同类残留，展示用，不影响配置）。
- 计划任务运行的触发口径与日志 trail：init 注册的 VBS 跑裸 `sync`（无
  `--auto`），因此计划任务运行被记成 `trigger: manual`（应为 scheduled），
  且裸 sync 不走 autoLog、隐藏窗口下 stdout 无去处（trail 丢失）。不能简单改
  传 `--auto`——那会引入 cloudSyncEnabled 门控，未设偏好时静默停上传。需要
  专门的 `--from-scheduled` 语义：触发口径记 scheduled、绕过 cloud 偏好门控、
  启用 autoLog。

另案处理：apps/web 的 10 条依赖审计通告（1 low / 5 moderate / 2 high /
2 critical），属仪表盘侧。
