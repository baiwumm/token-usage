# tokenusage-cli 发版手册

npm 包 `tokenusage-cli` 的发布流程、首发未竟事项与发版后检查。机制由
`.github/workflows/release-cli.yml` 承载：`cli-v*` tag 触发 → tag 与
`packages/cli/package.json` 版本强校验且必须落在 main 上 → `pnpm verify` →
`npm publish --provenance`（Trusted Publishing，OIDC 免 token）→ 从
`packages/cli/CHANGELOG.md` 取本版本段落生成 GitHub Release。

> 章节编号提示：本文正文中单称的「§四」–「§十三」均指归档文件
> [`docs/archive/cli-releases.md`](archive/cli-releases.md)（2026-11-13 拆分，编号沿用原文）。

## 机器称呼约定（2026-11-05 起）

两台采集机的身份对照。契约 `docs/cli-contract.md` §2.2 规定**默认名** = `<主机名> #<machine_id 前 8 位>`
（与仪表盘设备卡同名），该默认名不随改名更新，是稳定标识：

| 别名 | 云端当前名 | 默认名（稳定标识） | device_id | 账号 / 数据目录 | Node 与安装方式 |
|---|---|---|---|---|---|
| 家机 | `Home · C Future City` | `DESKTOP-MHFON1J #48ea790e` | `6a074a51-693b-48e3-9f65-0728f9f2ee5c` | `C:\Users\i\.tokenusage` | nvm-windows + npm 全局（`E:\nodejs` → `E:\nvm\nvm\v24.4.1` 符号链接），registry 为 npmjs |
| 公司机 | `Company · Partner` | `PC-20260408RIKF #68e47b34` | `1bd2ff67-653f-4b9c-80a9-c7589432d431` | `C:\Users\Administrator\.tokenusage` | Volta 管理的 node（`npm i -g` 落 image-dir `tools/image/node/<ver>`，shim 解析 `volta install` 的 `tools/image/packages/tokenusage-cli`——升级两条都要跑，见 `docs/archive/cli-releases.md` §十三），registry 为 npmmirror |

⚠ 「云端当前名」是操作者在仪表盘改过的名字，可变；「默认名」是签发时按契约生成的快照，
不随改名更新，是**稳定标识**——文档引用机器时两个都写，CLI 打印的也正是默认名。

**从 §八起，本文档每条升级 / 验收记录都带设备名**；`本机` / `另一台` 这类相对称呼不再用于
新记录。**CLI 0.4.7 起 `tokenusage status` 会自报设备身份**（`- Device: <hostname> #<id8>`），
任何一段命令输出都能自证是哪台机器。

⚠ 历史段落里的「本机」/「家机」**不能按字面理解**：0.4.7 之前的输出不带设备身份，记录者只能凭
印象判断身在哪台机器，判错过不止一次。**判定规则**（2026-11-06 在公司机实测核定）：按上表的数据
目录与 Node / registry 列区分——**Volta + npmmirror = 公司机，nvm-windows（`E:\nodejs`）= 家机**；
量级上公司机本地基线约 3B tokens / 数千文件（10-29 误删事故后），家机约 5–6B tokens / 3 万文件。
按此对照，原先的两条注解需更正（2026-11-06）：

- §四 原注「本机 = 公司机、另一台 Volta 安装机 = 家机（当时家机也是 Volta）」只对一部分段落成立
  ——0.2.4 段（2026-10-28）已写明家机是 nvm-windows。按规则：`volta install` 的几段（0.2.4
  「另一台 Volta 安装机复验」、0.2.5、0.2.6 首跑 2.53B）是公司机，5B 量级的本机验收（0.2.4、
  0.2.6 晚间复核、0.4.1–0.4.3）是家机。
- **§五 0.4.4、§六 0.4.5（含数据修复与复验）、§七「Volta 时期」三处记作「家机」的行，实为公司机。**
  证据（2026-11-06 公司机实测）：① 升级前运行时副本 `.runtime-ready` 为 0.4.6、
  `installedAt 2026-11-05T10:31:55Z`（0.4.6 发布后 38 秒）；② init 首采 3,201,752,710 tokens、
  `reconcile --days 7` 239 桶，与 §七「Volta 时期」的 3,201,292,093 / 243 桶吻合（家机同日
  5.94B / 114 桶）；③ §六 重新追加的 `2026-11-04T07:30Z opencode deepseek-v4.1-flash-free`
  10,241,261 行就在公司机 `queue.jsonl`；④ §五 / §六 的 dsh `2026-10-28` 08:30 / 09:00 / 09:30
  server-only 桶属于公司机云端设备 `1bd2ff67-…`（`reconcile --days 10`）。
  同段的推论已由操作者确认（2026-11-06）：「另一台采集机 仍为 0.4.3」指家机；§六 / §七的
  「npm 镜像注意」描述的是公司机，「家机 2026-11-05 从 Volta 换成 nvm」并未发生——**家机一直用
  nvm-windows**；§五 / §六的 `Cursor session expired` 与「已不使用 Cursor」的确认都出自公司机，
  该机已卸载 Cursor（2026-11-06 确认不再使用）。

历史行文不回改，按上述规则对照判定；0.4.7 起每段命令输出自带 `- Device:` 行，新记录不再需要推断。

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
2. 安全审计：`pnpm audit --prod --registry=https://registry.npmjs.org` 应为
   "No known vulnerabilities found"。**注意**：默认配置的 npmmirror 镜像没有
   audit 端点（报 404 错误而非漏洞），必须显式带官方 registry 参数
   （2026-11-03 实测官方源 0 漏洞）。
3. 提交并推送 main，确认 CI 绿。
4. 打 tag 并推送：`git tag -a cli-vX.Y.Z -m "tokenusage-cli X.Y.Z" && git push origin cli-vX.Y.Z`
   （**annotated**，与历史 tag 一致；必须打在**已推送**的 main 提交上——打在旧提交上不会
   触发任何东西且无报错）。
5. workflow 全自动完成：版本校验 → main 祖先校验 → `pnpm verify` → 发包 → Release。
6. 纪律：run 结束前不要 rebase / 强推 main——重写历史会让 tag 脱离 main，
   发布被安全拒绝（只会发不出去，不会发错）。

回滚：误发版本用 `npm deprecate tokenusage-cli@X.Y.Z "reason"` + 发 patch 版；
确需下架走 npm 联系支持（unpublish 有 72h 限制），GitHub Release 手动删除。

## 三、发版后事项（0.1.0 发布后逐项勾掉）

> 本节是 0.1.0 首发时的收尾存档（2026-10-27），未勾项反映当时机器状态，已不作为
> 当前待办；后续版本的升级与实测记录见 §四。

- [x] **清理 npm 残留版本**（2026-10-27 已删，当时 npm 仅 0.1.0）：首发时误发的
  `0.0.0-stage`，`npm unpublish` 72h 窗口内删除。
- [x] **登记 Trusted Publisher**（2026-10-27 已配）：§一第二步的网页操作，
  0.1.1 起 CI 自动发包的前提。
- [x] **公司机换装正式包**（2026-10-27 完成）：`volta uninstall tokenusage-cli`
  → `volta install tokenusage-cli@0.1.0`（镜像可见后 Volta 可直装，未需
  --force 回退）；装后 `status` 配对信息完好，`sync` 增量 25,387 文件、
  2 会话 + 2 桶上传成功。开发期安装的 init / device-login 无需重做。
- [x] **本机更新采集器**：`npm i -g tokenusage-cli@latest`（2026-10-28 随 0.2.4 更新，
  见 §四）。本机全局安装（`E:\nodejs\node_modules\tokenusage-cli`）更新后
  94bb8e9 的 auto 进度输出与 875dd54 的日志降噪生效；计划任务无需改动（VBS
  包装指向的 node/CLI 路径不变）。
- [x] **本机计划任务复验**（2026-10-28 随 0.2.4 复验，见 §四）：`Start-ScheduledTask
  TokenUsageSync` 后 `LastTaskResult=0`、日志正常追加。
- [x] **公司机换装正式包**（2026-10-27 实查：公司机已装开发期 0.1.0（Volta
  全局），且已配对在传——`tokenusage status` 显示 device token set、queue 0，
  `init` / `device-login` 不必重做；2026-10-28 升 0.2.1、2026-10-29 升 0.2.4 / 0.2.6
  并复验）：
  发布后 `volta install tokenusage-cli@0.1.0`
  换成 npm 正式产物（同版本号下直接 `npm i -g tokenusage-cli` 会被 "up to
  date" 跳过，等价命令 `npm i -g tokenusage-cli@0.1.0 --force`），装完
  `tokenusage status` 确认 device token 仍在，跑一次 `tokenusage sync` 收尾。
  默认源走镜像的机器要等 npmmirror 同步上游后才装得到
  （`curl https://registry.npmmirror.com/sync/tokenusage-cli` 可手动触发），
  急用可对 npmjs 显式 `--registry` 强装。
  旧账迁移按 `docs/launch-runbook.md` 与桌面 replay 材料（约 13.6B 待迁）。
  **2026-10-28 公司机已升 0.2.1 并验收**（sync/任务触发/运行报告全过）；
  **2026-10-29 已升 0.2.4 并复验**（init 命名、副本自检、定时任务零弹窗、
  `token_sync_runs` 与小时桶对账全过，见 §四）；
  **同日再升 0.2.6 并复验**（Volta 全局包与 `~/.tokenusage/tracker/app` 副本均为
  v0.2.6，`status` 显示 device token set / queue 0 / 运行上报开，`TokenUsageSync`
  当日 15:20 那轮 `LastTaskResult=0`，见 §四）。
  弹窗停泊方案：init 接管未执行前，计划任务动作已手工换成隐藏窗口 VBS
  （`C:\Users\Administrator\.tokenusage\run-sync-hidden.vbs`，内部仍是
  `cmd /c node <包内 tokenusage.js> sync >> ~/.tokenusage/logs/sync.log`，
  保留日志 trail），每小时弹窗消失；init `--no-integrations` 落地后跑一次
  init 即可换成官方接管。注意 `schtasks /TR` 会毁坏带引号参数（实测把
  `"C:\...vbs"` 存成 `" C:\...vbs\` 导致 wscript 挂死）——改任务动作一律用
  PowerShell `Set-ScheduledTask`（参数原样存储），路径无空格时不加引号。
- **观察首日（存档）**：仪表盘数据、sync.log、GitHub Release 页面三处对账；
  0.1.0 首发时未单独勾选，后续 0.2.x / 0.3.0 的发版验收与日常观察已覆盖同类检查。

## 四–十三、历史发版记录（已归档）

0.4.4–0.5.5 的逐版本候选清单、发版验证与采集机记录已移到
[`docs/archive/cli-releases.md`](archive/cli-releases.md)（保留原 §四–§十三 编号）；
当前版本（0.5.5）的验证清单见下文 §十四。
## 十四、0.5.5 发版（2026-11-11）

npm `tokenusage-cli@0.5.5`（`dist-tags.latest = 0.5.5`）；tag `cli-v0.5.5`（`269f87f`）；
Release workflow run `43000804336` 全绿（verify → npm Trusted Publishing + provenance →
GitHub Release，正文取 CHANGELOG）。**零破坏性变更**：现有子命令行为、对账基线与队列格式
均不变；服务端需部署含该 series 的版本（`token-usage-account-project-profiles`，契约
§2.13，2026-11-11 已上线）。

| 批次 | 内容 | 影响面 |
|---|---|---|
| `feat(cli)` 新子命令 | `tokenusage project-profiles`：无参，凭证解析同 `sync`（运行时配置 → `cloud-device-token`，自定义 base 需 anon key），单行 JSON 打 stdout，诊断一律 stderr + `UsageError`（exit 2） | 桌面端伴生工具据此同步 web 编辑的项目显示名 / logo / 仓库 |
| `chore(cli)` 发版 | 版本号 + CHANGELOG | — |

发版前检查：

- [x] `pnpm verify` 全绿（CLI 296 用例 / web 契约 255 / desktop 121 / landing）
- [x] `pnpm audit --prod --registry=https://registry.npmjs.org` → No known vulnerabilities found
- [x] tag `cli-v0.5.5` 与 `packages/cli/package.json` 一致、落在 `origin/main`（`269f87f`）
- [x] release workflow 全绿；publish 步日志 `+ tokenusage-cli@0.5.5`（10:08:34Z，tag latest）

公司机验收记录（2026-11-11 18:12，`PC-20260408RIKF #68e47b34`，Volta + npmmirror）：

| 项 | 结果 |
|---|---|
| 安装（**两条都要跑**） | `volta install tokenusage-cli@0.5.5`（packages 权威副本）→ `npm i -g tokenusage-cli@0.5.5 --prefer-online --registry=https://registry.npmjs.org`（image-dir 副本，此前被 `npm i -g ./packages/cli` 换成了指向工作区的符号链接，本次复原为正式包）；`volta list` 与 `--version` 均为 0.5.5 |
| 运行时副本 | `init --yes --no-integrations --no-open` 刷新：`.runtime-ready` = 0.5.5（`installedAt 10:12:39Z`）；首同步 3,913,494,786 tokens / 13 providers |
| `doctor` | **17 项全 OK / 0 warn / 0 fail**；`schedule.registered` = enhanced definition |
| `sync`（手动） | exit 0；parsed 6,366 文件、+0 新桶、上传 2 行 / 878,654 tokens、sessions 1/1、24 s（`Cursor sync: fetch failed` 为既有无害告警） |
| `reconcile --days 1` | **OK — every local bucket matches the cloud row**（本地 47 桶 / 云端 47 行），退出码 0 |
| `project-profiles` | 单行 JSON 正常返回 18 条 profile；桌面端重启后项目卡显示 web 上的 logo，页脚 `tokenusage-cli v0.5.5` |

**镜像与缓存坑（本次实测，承接 §十三）**：① npmjs 已 `dist-tags.latest = 0.5.5` 时，
`registry.npmmirror.com` 仍是 0.5.4，`volta install` 首跑 `ETARGET`（Volta 调 npm 用机器
默认源，`--registry` / `npm_config_registry` 不生效）；等镜像同步后重跑即成功——今后发布
后先 `curl https://registry.npmmirror.com/tokenusage-cli/latest` 确认镜像已同步。② 本机
`curl https://registry.npmjs.org/...` 会被中间缓存命中（返回旧 packument，`/0.5.5` 误报
404），核对 npm 是否真发出去要加 `--noproxy '*'` 或 `Cache-Control: no-cache`。
