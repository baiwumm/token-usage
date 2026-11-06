# tokenusage-cli 发版手册

npm 包 `tokenusage-cli` 的发布流程、首发未竟事项与发版后检查。机制由
`.github/workflows/release-cli.yml` 承载：`cli-v*` tag 触发 → tag 与
`packages/cli/package.json` 版本强校验且必须落在 main 上 → `pnpm verify` →
`npm publish --provenance`（Trusted Publishing，OIDC 免 token）→ 从
`packages/cli/CHANGELOG.md` 取本版本段落生成 GitHub Release。

## 机器称呼约定（2026-11-05 起）

两台采集机的身份对照。契约 `docs/cli-contract.md` §2.2 规定**默认名** = `<主机名> #<machine_id 前 8 位>`
（与仪表盘设备卡同名），该默认名不随改名更新，是稳定标识：

| 别名 | 云端当前名 | 默认名（稳定标识） | device_id | 账号 / 数据目录 | Node 与安装方式 |
|---|---|---|---|---|---|
| 家机 | `Home · C Future City` | `DESKTOP-MHFON1J #48ea790e` | `6a074a51-693b-48e3-9f65-0728f9f2ee5c` | `C:\Users\i\.tokenusage` | nvm-windows + npm 全局（`E:\nodejs` → `E:\nvm\nvm\v24.4.1` 符号链接），registry 为 npmjs |
| 公司机 | `Company · Partner` | `PC-20260408RIKF #68e47b34` | `1bd2ff67-653f-4b9c-80a9-c7589432d431` | `C:\Users\Administrator\.tokenusage` | Volta 管理的 node（`npm i -g` 由 Volta 接管，`npm prefix -g` 路径不可用），registry 为 npmmirror |

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
  由此推论（**待操作者确认**）：同段「另一台采集机 仍为 0.4.3」指的是家机；§六 / §七「npm 镜像
  注意」描述的也是公司机，「家机 2026-11-05 从 Volta 换成 nvm」多半并未发生；§五 / §六 的
  `Cursor session expired` 出自公司机（2026-11-06 仍在），「家机已不使用 Cursor」的确认是否也
  适用于公司机需另行确认。

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

## 四、CLI 后续版本候选与实测记录（不阻塞已发版本）

> **已发版批次（0.4.4 ~ 0.4.7，2026-11-03 ~ 11-05）**：契约 v2 桶级 `project_key`（`fe4fb26`，
> 随 0.4.4 发版）、项目键父级回退（`823ee14`）、DeepSeek 余额/状态卡、`status --json` 的
> pricing 块、`doctor` 计价覆盖自检、curated 定价扩充、cursor/kimi/grok limits 磁盘缓存回退
> （均随 0.4.4 发版）；0.4.5 修队列去重丢项目拆分行，0.4.6 修 Cursor 准入 / Qoder credits 与
> 限额快照并加 `status --limits`，0.4.7 让每条命令自报设备身份并补全采集结果摘要。
> 明细以 `packages/cli/CHANGELOG.md` 的对应版本节为准。
> 两台采集机均已升到 0.4.7（家机 2026-11-05、公司机 2026-11-06，见 §八 8.3）；`/projects` 的 hourly 口径见
> `docs/ui-spec.md`「项目（`/projects`）」节。

> **原「未发版候选」（2026-11-01 盘点；两项均已随 0.4.0 交付）**：① `init` 逐工具集成
> 选择（当时 `--no-integrations` 只有全有 / 全无）；② macOS / Linux 原生调度（当时仅
> Windows 计划任务，其他平台靠 `--watch` / 手动）。
>
> **2026-11-01 操作者拍板（最终）**：对上一条「下个版本不做 / 单独评估」的结论做出修订——
> **两项随本版开发**，并与同一批的 CLI 加固一起交付（见下条记录）。
>
> **CLI 加固批（2026-11-01，已随 0.4.0 发版）**：对照上游 `tokentracker-cli` / `jusage` 核对后落地：
> ① 用户输入错误统一为 `UsageError`（`src/lib/cli-errors.js`，bin 只打一行 + hint、退出码 2、
> 不再打堆栈）；② 命令表驱动 help（`src/cli.js` 的 `COMMANDS`），`tokenusage <cmd> --help`
> 对每条命令有效，未知命令抛 `UNKNOWN_COMMAND`；③ 新增 `tokenusage upload`（只刷队列不扫描，
> 复用同一 `drainQueueToCloud` + `sync.lock`，`sync --upload-only` 为别名）；④ `--source`
> 非法值改为报错并列出可用 id（原实现静默降级为全量扫描）；⑤ `sessions` 严格解析 +
> `--out` 原子写（0600）；⑥ `--watch` 失败退避 1x → 2x → 5x（成功即归零）；
> ⑦ `init --integrations <ids|all|none>` + 交互式多选（12 个 hook 型集成逐个 gate，
> 被动读取器不 gate）；⑧ 移除浏览器登录期死参数（`--email/--password/--device-name/
> --link-code/--no-auth`，改为指向 `device-login` 的报错）；⑨ 调度多平台化（Windows 改
> `schtasks /Create /XML` 定义：`StartWhenAvailable` + 登录触发 + `RestartOnFailure 3` +
> 无执行时限；macOS launchd `com.token-usage.sync`；Linux systemd `--user` timer
> `token-usage-sync.timer`，`Persistent=true`），pause/resume/uninstall 走同一分发层；
> ⑩ 删除从未接线的本地服务模块图（`local-api.js` + 18 个可达性为零的模块 + `pricing/`
> 数据，共约 550 KB），`normalizeQueueRow` 抽到 `src/lib/queue-row-normalize.js`；
> ⑪ `package.json` 的 `files` 去掉 `test/`；⑫ `autoLog` 落盘改 JSONL（`{ts,msg,...}`，
> 仍 1 MiB 滚动一代，TTY 行保持人类可读）。
> 测试：CLI 76 → 131 条（新增 `cli-dispatch` / `args-strict` / `scheduled-task` /
> `queue-row-normalize` / `integration-gate` / `reconcile`，并把「src 内零可达模块」写成
> packaging 守卫）。
> **对账命令 `reconcile`（2026-11-01 同批第二批交付）**：先按硬性约束 1 改契约——
> `docs/cli-contract.md` §2.13（`GET /api/functions/token-usage-reconcile`，仅设备令牌、
> `[from,to)` 半开窗口、366 天钳制、limit 1–2000、按 `hour_start → source → model` 升序、
> 行原样返回不聚合不剔除账户级来源、无 `total_cost_usd`）与 §3 条目 15，golden 测试
> `apps/web/tests/contract/reconcile.test.ts`（11 条）先行通过；随后实现端点
> `apps/web/src/app/api/functions/token-usage-reconcile/route.ts` 与 CLI 命令
> `packages/cli/src/commands/reconcile.js`（只读：本地 `queue.jsonl` last-wins 基线 per
> `(hour_start, source, model)`，漂移分 `missing_on_server` / `server_only` / `mismatch`，
> 有漂移退出码 1，`--json` 结构化输出）。已知残余：ingest 对**同一请求内**同键重放取
> `total_tokens` 较大值，极端情况下云端可能保留较大值而本地已下调——此类键以 `mismatch`
> 呈现供人工判断，命令本身永不写入。

> **0.4.3（2026-11-01 已发 npm 并完成本机升级）**：两处只有真机首跑才暴露的问题收口。
> ① 调度降级原因改取子进程输出（`stderr` / `stdout` 优先，`error.message` 末位），修掉
> 0.4.2「首行仍是 `Command failed: schtasks …` 命令回显」的遗留；由此追出第二层——中文
> Windows 的 `schtasks` 按控制台代码页（936/GBK）写字节，Node 按 UTF-8 解出
> `����: �ܾ����ʡ�`。现在用 `chcp.com` 取活动代码页（932/936/949/950），回退
> `TextDecoder` 重解，解不通才回退原 UTF-8 文本，65001 与单字节页直出
> （`src/lib/scheduled-task.js` 的 `consoleEncoding` / `decodeStream` / `errorText`）。
> ② `reconcile` 把 `queue.state.json` 偏移之后的桶记为 `pending`：它们从未上传，云端只
> 可能持有更早的值，不再算 `missing_on_server` / `mismatch`、不再触发退出码 1；`--json`
> 新增 `upload_offset` / `counts.pending` / `pending[]`，真实漂移仍退出 1
> （`src/commands/reconcile.js`）。
> 同批关闭「待查观测」：用 `node:sqlite` 只读探针核对 `~/.zcode/cli/db/db.sqlite`，10:30Z
> 窗口 `rows 97 / rawInput 46,855,920 / cacheRead 46,779,776 / rawOutput 47,616 /
> cacheWrite 0`，其 disjoint 口径 `76,144 + 46,779,776 + 47,616 = 46,903,536` 与队列
> last-wins 行（conv 97）逐位一致 ⇒ 同键多行是「累计重入队」（`enqueueTouchedBuckets` 把
> 桶累计总量整行入队），last-wins 取最后一行即正确总量，不是重复计数，无需改动。
> 发版：commit `22364be` → tag `cli-v0.4.3` → release run 41312131772 全绿（workflow 内
> `pnpm verify`：web 33 files / 455 tests + build；CLI 138 tests；lint 0 error / 5 warning），
> `npm publish --provenance` 成功（111 files / 764.7 kB、unpacked 3.2 MB，sigstore
> logIndex 3631387482），GitHub Release 正文取 CHANGELOG 的 0.4.3 段；publish 后 registry
> 有十余分钟延迟（`npm view` 读缓存会滞后，核对用 `--prefer-online`），解析到后
> `dist-tags.latest` 为 0.4.3。
> 本机验收（`npm i -g tokenusage-cli@0.4.3` → `tokenusage --version` v0.4.3 →
> `tokenusage init --yes --no-integrations --no-open`）：`~/.tokenusage/tracker/app`
> `.runtime-ready` 为 0.4.3（13:41Z），调度摘要显示可读的
> `degraded: xml_rejected — 错误: 拒绝访问。`（乱码已消失），首采 5,847,588,241 tokens /
> 13 providers；`reconcile --days 7` OK 100/100、退出码 0；`reconcile --days 1 --json` 含
> `upload_offset 230844` / `counts.pending 0` / `pending []`；`pause` →
> `TokenUsageSync disabled.`、`resume` → enabled（真实 `schtasks /Change`）、`upload` 报
> 队列已清空、`doctor` 14 ok / 0 warn / 0 fail、计划任务 Ready 且 `Last Result: 0`。
> 剩余待办只剩两条（另一台采集机升级、macOS/Linux 调度真机验证），见
> `docs/rewrite-plan.md` §10。

> **0.4.2（2026-11-01 已发 npm 并完成本机升级）**：`init` 的调度摘要显示降级原因
> ——`degraded: xml_rejected — <被拒文本首行>`（裁到一行），不再只报类别：非提升 shell
> 下用户能直接区分「改以管理员再跑一次 `init`」与「任务定义本身写错」。发版：commit
> `0829050`（+ 文档 `3571cd7`）→ tag `cli-v0.4.2` → release run 41303962434 全绿
> （workflow 内 `pnpm verify`：web 33 files / 455 tests + build；CLI 131 tests），
> `npm publish --provenance` 成功，GitHub Release 正文取 CHANGELOG 的 0.4.2 段；
> registry `dist-tags.latest` 为 0.4.2。本机 `npm i -g tokenusage-cli@0.4.2` 后
> `--version` 为 v0.4.2；`init --yes --no-integrations --no-open` 把
> `~/.tokenusage/tracker/app` 副本刷到 0.4.2（449 文件 / 22.6 MB / `.runtime-ready`
> 为 v0.4.2，首采 5,847,530,955 tokens / 13 providers）。
> 本机验收：首跑 `reconcile --days 7` 报 5 个漂移（3 `missing_on_server` + 2
> `mismatch`），逐项核对后全部落在 `queue.state.json` 未覆盖的队列尾部（offset
> 228331 vs 文件 230536，7 行待传、按 last-wins 折成 5 键）；补跑一次 `tokenusage
> sync` 后同一窗口为 **OK 103/103 桶匹配、退出码 0**——drift 报的是「尚未上传」，
> 不是数据不一致，`reconcile` 无需改动。
> 同批 CI 修复：`.github/workflows/ci.yml` 的 Windows smoke 仍在传已删除的
> `--no-auth`（41300932457 / 41301237077 / 41302095486 三次 `verify-windows-cli` 都报
> `Error: --no-auth was removed` → `init --dry-run exited 2`），commit `c6d7b68` 去掉该
> 参数后 CI 41304070415 转绿。
> 未修观测（记入 `docs/rewrite-plan.md` §10 待办）：同一小时键在 `queue.jsonl` 里会出现
> 多行递增值（当次全队列 735 行 / 644 桶 / 56 个重复键，例如
> `2026-11-01T10:30|zcode|GLM-5.3-Flash` 4,075,888 conv 9 → 46,903,536 conv 97），
> last-wins 取后者、云端补传后核对一致；成因未定位（继承来的解析器对同一 30 分钟桶
> 重复聚合），暂不改。另：`degraded` 文案首行仍是 `Command failed: schtasks …` 的命令
> 回显，真正原因 `ERROR: Access is denied.` 在第二行被 `errorText()` 的 200 字符截断
> ——0.4.3 候选：改取 `stderr`。
>
> **0.4.1（2026-11-01 已发 npm 并完成本机升级）**：修复 `reconcile` 在真实队列上的
> 误报——队列行写 `conversation_count`（`docs/cli-contract.md` §2.4 的线名），小时表列名
> `conversations`，按字段名直接比较把 41/43 行报成 `conversations local 0 → cloud N`；
> 改为按别名归一后比较，真差异仍报 `mismatch`。发版：commit `51768d6` → tag
> `cli-v0.4.1` → release run 41300310934 全绿（workflow 内 `pnpm verify`：web 33 files /
> 455 tests + build；CLI 131 tests；lint 0 error / 5 warning），`npm publish --provenance`
> 成功，GitHub Release 正文取 CHANGELOG 的 0.4.1 段。本机 `npm i -g tokenusage-cli@0.4.1`
> 后 `--version` 为 v0.4.1。真机验收（同日）：`reconcile --days 1` 43/43 桶匹配；
> 默认 7 天窗口 103/103 桶匹配、`--json` 结构正常、退出码 0。
> 本机 `init --yes --no-integrations --no-open` 已把 `~/.tokenusage/tracker/app` 运行时
> 副本从 0.3.0 刷到 0.4.1（首采 5,823,062,224 tokens / 13 providers）。调度健康检查：
> 任务 `\TokenUsageSync` 为 Ready、上次运行结果 0、动作为 `wscript.exe
> run-sync-hidden.vbs`（隐藏窗口），下次整点触发。**但 XML 定义注册被系统拒绝**
> （`degraded: xml_rejected`，实测 `schtasks /Create /XML` 报 `ERROR: Access is denied.`：
> 非提升 shell 下 XML 注册需提升权限，普通 `/SC HOURLY` 不受限），因此自动降级为每小时
> 触发，丢失 `StartWhenAvailable`（漏跑补采）/ `RestartOnFailure`（失败重试）/ 无执行
> 时限三项增强。要启用增强调度需以管理员身份再跑一次 `tokenusage init`（行为未验证，
> 待操作者决定是否值得；降级路径本身按设计工作，采集不受影响）。
>
> **0.4.0（2026-11-01 已发 npm 并完成本机升级）**：交付 CLI 加固批（错误模型、命令表
> help、`upload`、`--source` 严格校验、`sessions` 严格解析、watch 退避）、
> `reconcile` 对账命令、`init --integrations` 逐工具选择、macOS / Linux 原生调度，并删除
> 18 个从未接线的本地服务模块。发版：commit `3690db0` → tag `cli-v0.4.0` → release run
> 41299668944 全绿（workflow 内 `pnpm verify`：web 33 files / 455 tests + build；CLI 130
> tests），`npm publish --provenance` 成功，GitHub Release 正文取 CHANGELOG 的 0.4.0 段；
> registry `dist-tags.latest` 为 0.4.0。本机升级后首跑暴露 `conversation_count` 别名误报
> （见 0.4.1）。⚠ 同批新增 `token-usage-reconcile` 端点占满最后一个 Vercel function 槽位
> （12/12）。macOS / Linux 调度仅有产物级测试，无真机验证。
>
> **0.3.0（2026-11-01 已发 npm 并完成本机升级）**：新增 Trae CN 本地库扫描、Qoder
> credits 维度（桶级 / 会话级 / sync-run `credits_ingested` 遥测）、Qoder 会话进入
> Sessions（一文件 = 一会话，应用与桶解析器一致的 billable 门槛），读侧模型名按
> 小写折叠分组。采集期修复 Qoder 文件未纳入会话缓存签名、`listRolloutFilesDeep`
> 只认 `rollout-*` 文件名的问题。发版：tag `cli-v0.3.0`（`56ff02c`）→ release run
> 41220305466 全绿，`npm publish --provenance` 成功，GitHub Release 正文取 CHANGELOG
> 的 0.3.0 段；registry `dist-tags.latest` 为 0.3.0。本机 `pnpm verify` 全绿
> （web 31 files / 435 tests + build；CLI 76 tests；lint 0 error / 5 warning）。
> 本机验收（2026-11-01）：`tokenusage --version` 为 v0.3.0，
> `~/.tokenusage/tracker/app/.runtime-ready` 为 0.3.0（2026-10-31T16:38Z），
> 运行时副本已刷新；计划任务下次运行走 0.3.0。Trae CN 已具备持续采集条件（P0 起）。
> 另一台采集机升级同样需重跑 `tokenusage init --yes --no-integrations --no-open`
> 刷新运行时副本。
>
> **本机升级复核（2026-10-29 晚，0.2.4 → 0.2.6 重装）**：复核发现本机全局
> `tokenusage` 与 `~/.tokenusage/tracker/app` 副本实际停在 0.2.4（计划任务运行
> 记录 `cli=0.2.4`），与本节 0.2.6 验收记录不符。处理：`npm i -g
> tokenusage-cli@latest --prefer-online`（registry `dist-tags.latest=0.2.6`，全局
> 包依赖 `@journeyapps/wa-sqlite 2.0.7` / `smol-toml 1.9.1` / `undici 8.12.2` /
> `yauzl 3.4.0`）→ `tokenusage init --yes --no-integrations --no-open` 重建副本
> （`.runtime-ready` v0.2.6、462 文件、23,964,924 B、顶层依赖
> `@journeyapps`/`pend`/`smol-toml`/`undici`/`yauzl`，副本 `bin/tracker.js
> --version` 为 v0.2.6）。
> 采集复核：init 首跑与后续手动 `sync` 均解析 15,091 文件、0 新增桶、0 上传，
> 首跑输出 4,998,501,932 tokens / 9 providers，与本机 queue last-wins 基线
> （563 桶、malformed 0）逐位一致；`doctor` 14 项全 ok（`runtime.copy` = v0.2.6）；
> 手动触发计划任务 `TokenUsageSync` 后 `LastTaskResult=0`、`sync.log` 追加一条
> 0 新增桶记录，`token_sync_runs` 新增 `trigger=scheduled` / `cli=0.2.6` /
> `result=ok` / `parsed_files=15091`。服务端设备总量未变动：zcode 2.43B 与
> cursor 1.7M 的既有差异保持不变（前者为 2026-10-25 G1 种子历史，后者为账户级
> 来源，均非本次升级引入）。
>
> **0.2.6（2026-10-29 已发 npm 并完成本机验收）**：按依赖预算评审整体删除
> 从未接线的错误上报 SDK（`@sentry/node`、`src/lib/sentry.js`、
> `src/lib/telemetry-pref.js`），并清掉 `bin/tokenusage.js` 未捕获异常兜底里那段
> 包在 try/catch 中、删模块后永不生效的 `require('../src/lib/sentry')`；守卫
> 测试改为同时扫描 `src/` 与 `bin/`，`THIRD_PARTY_NOTICES.md` 的示例运行时依赖
> 去掉 `@sentry/node`。
> 本地实测（2026-10-29）：`pnpm verify` 全绿（web 325 tests / 22 files、
> eslint 0 error 4 warning、tsc、build 成功；CLI 72 tests 全过）；`npm pack`
> 产物 854,353 B / 136 files；临时 prefix 装 6 个包、`node_modules` 8 个条目
> （含 `.bin` 与 lock），无任何 `@sentry`，安装总量 23 MB，`--version` 为
> `v0.2.6`；临时 HOME 跑
> `init --yes --no-task --no-auth --no-integrations --no-open`，运行时副本
> 22.9 MB / 462 文件、`.runtime-ready` 为 v0.2.6、顶层依赖只剩
> `@journeyapps`（wa-sqlite）、`pend`、`smol-toml`、`undici`、`yauzl`，副本
> 自身 `bin/tracker.js --version` 输出 v0.2.6（自包含）。
> 发版（2026-10-29）：tag `cli-v0.2.6`（`c6292c7`）→ release run 40827992421
> 全绿（12 个步骤全 success），`npm publish --provenance` 成功（136 files、
> `gitHead=c6292c7`、SLSA attestation 已生成），GitHub Release 正文取 CHANGELOG
> 的 0.2.6 段；registry 直查 `dist-tags.latest` 已为 0.2.6（`npm view` 读本地
> 缓存会滞后一版，核对发版结果要用 registry 直查或 `--prefer-online`）。
> 本机验收（2026-10-29）：`volta install tokenusage-cli@0.2.6` 后 `--version`
> 为 v0.2.6；`device-login` 重新配对成功（设备令牌写入
> `~/.tokenusage/tracker/config.json`）；`init --yes --no-integrations --no-open`
> 重建运行时副本（`.runtime-ready` v0.2.6、22.9 MB / 462 文件、顶层依赖 5 项），
> 首跑 2,525,218,906 tokens / 6 providers；`doctor` 14 项全 ok；计划任务
> `TokenUsageSync` 为 wscript + `run-sync-hidden.vbs`（`shell.Run(cmd, 0, True)`
> 隐藏窗口），`Start-ScheduledTask` 后 `LastTaskResult=0`、19.8 s 完成、可见窗口数
> 前后不变（12 → 12、无新增标题）、`logs/sync.log` 追加（parsed 195 /
> uploaded 362 / queue drained）；`token_sync_runs` 新增两条 `cli=0.2.6` /
> `trigger=scheduled` / `result=ok`，其 `tokens_ingested=2,525,218,906` 与 init
> 首跑的本机 queue last-wins 总数逐位一致；`token_usage_hourly` 该设备行数
> 1,475 → 1,477（全库 2,099 → 2,101），无重复回补。
> 注意：该机当日发生过一次误删用户目录的事故，本地可重建的 AI 日志因此减少，
> 首跑总量从 0.2.5 的 10.18B 降到 2.53B（服务端历史数据未受影响）。
> 升级到 0.2.6 的机器重跑一次
> `tokenusage init --yes --no-integrations --no-open` 即可把 67 MB 的旧副本
> 换成 ~23 MB 的新副本。

> **0.2.5（2026-10-29 已发 npm 并完成本机验收）**：`npm i -g
> tokenusage-cli` 安装时的 `prebuild-install@7.1.3: No longer maintained` 警告
> 已随删除 `@mongodb-js/zstd` 消除。该包只在 `zlib.zstdDecompressSync` 不存在时
> 回落，而 `engines.node >= 22.19` 已保证内置 zstd；`rollout.js` 的两处回落分支
> 已删，缺失内置解码器改为硬错误。回归测试覆盖 Zed thread blob 与 DeepSeek
> Harness 多帧 zstd（`test/zstd-native.test.js`）；`docs/rewrite-plan.md` §4 已
> 同步记录 CLI 依赖集变化。
> 运行时副本体积分布（0.2.4 本机 67.1 MB）：`@sentry` 43.1 MB、
> `@journeyapps/wa-sqlite` 17.2 MB、`@mongodb-js/zstd` 0.6 MB。zstd 于 0.2.5
> 删除（少 0.6 MB）；Sentry 只在启动时 init、从未上报，0.2.6 经操作者批准整包
> 移除，副本降到 22.9 MB（见本节开头 0.2.6 记录）。
> 本地实测（2026-10-29）：`pnpm verify` 全绿（web 325 tests / 22 files、
> eslint 0 error 4 warning、tsc、build 成功；CLI 72 tests 全过）；`npm pack`
> 产物 856,688 B / 138 files；临时 prefix 装 30 个包、无 `prebuild-install`
> 警告、`node_modules` 下无任何 `*zstd*` 目录、`--version` 为 `v0.2.5`；
> 打包后 `init --yes --dry-run --no-auth --no-integrations --no-open` 退出 0、
> 输出无 `Skipped - Skipped`、`Dry run complete` 恰好 1 条、临时 HOME 零文件落盘。
> CI（run 40801871121，`81470df`）两个 job 均绿：Ubuntu `verify` + 新增
> `verify-windows-cli`（Windows 跑 CLI 72 测试与 `init --dry-run` 烟测）。
> 发版（2026-10-29）：tag `cli-v0.2.5`（`fb1a849`）→ release run 40802493313 全绿，
> `npm publish --provenance` 成功（852.9 kB / 138 files，sigstore logIndex
> 3555122628），GitHub Release 正文取 CHANGELOG 的 0.2.5 段；npmjs 与 npmmirror
> 均已可解析 0.2.5。
> 本机验收（同样 2026-10-29）：`volta install tokenusage-cli@0.2.5`（0.2.4 → 0.2.5）
> 后 `--version` 为 v0.2.5；重跑 `init --yes --no-integrations --no-open` 刷新副本
> （`.runtime-ready` v0.2.5、67.5 MB、7 个顶层依赖，zstd 目录已消失），首次 sync
> 得 10,177,056,345 tokens / 14 providers，集成行只显示
> `Skipped (--no-integrations)`（不再有重复前缀）；从 `C:\` 直跑副本 `--version`
> 自包含通过，`doctor` 14 项全 ok（`runtime.copy` ready v0.2.5）。
> `Start-ScheduledTask` 返回 0、日志追加、运行期间 0 个可见窗口、queue drained；
> `token_sync_runs` 新增两条 `cli=0.2.5` / `trigger=scheduled` / `result=ok`
> （25,359 parsed、0 桶），`token_usage_hourly` 总行数仍 2,099（无重复回补）；
> 本机设备累计 13,672,295,855（迁移重放）+ 528,501,289（切换后增量），最新小时桶
> 停在 2026-10-28T09:30Z（当天尚无新用量，属正常）。
> 本地 queue last-wins 合计 10,177,056,345 与 init 扫描总量逐位一致（本机自洽）。

> **2026-10-29 0.2.4 验收发现（0.2.5 已修）**：`tokenusage init
> --no-integrations` 的集成行会打成 `Skipped - Skipped (--no-integrations);
> tool configs stay untouched`。原因是 `init.js` 的 detail 已以 `Skipped` 开头
> （如 `Skipped (--no-integrations); …`），`cli-ui.js` 的 `statusLabel` 又统一
> 补了 `Skipped - ` 前缀。0.2.5 改为 `statusLabel` 检测到 detail 已以
> `Skipped` 开头时不再重复；`test/cli-ui.test.js` 断言输出不含
> `Skipped - Skipped`，Windows CI 的 `init --dry-run` 烟测再兜一层。
> 同轮去掉 `--dry-run` 收尾的重复 `Dry run complete` 行。

> **0.2.4（2026-10-28 发 0.2.3 后立即补）**：0.2.3 的 VBS 把 npm 全局前缀里的包
> 路径写死，而 nvm-windows 的全局前缀按 Node 版本分目录（家里机是
> `E:\nvm\nvm\v24.4.1\node_modules\tokenusage-cli`），`nvm use` 之后路径消失，
> 计划任务每小时 `file not found`（`LastTaskResult` 非 0、日志停更）。VBS 现在先
> 探测包路径，缺失时回落到 init 复制到数据目录的自包含运行时
> `~/.tokenusage/tracker/app/bin/tracker.js`；引号改用 `Chr(34)` 拼接。
> 同轮自检（"一次修完再发"要求）补齐了副本自身的可靠性：pnpm 安装下整目录
> `fs.cp` 只复制到 junction（副本 `node_modules` 仅 1 项，运行即
> `Cannot find module`），改为按依赖闭包复制真实目录；副本先进 `app.new` 暂存，
> `require` 全部直接依赖 + `--version` 实跑通过后才替换并写 `.runtime-ready`，
> 没有标记的副本所有启动点（notify / OpenClaw hook / session plugin / 自动重试）
> 一律跳过、回落到已安装包再回落 npx；`doctor` 新增 `runtime.copy` 检查（缺标记
> / 版本落后报 warn），`init` 复制失败不再静默，`uninstall` 清理 `app.new`。
> 升级/切换 Node 后仍建议重跑 `init --yes --no-integrations --no-open`，让回落
> 副本同步到新版。验证方式：临时 HOME 跑一次 init →
> `tracker/app/bin/tracker.js --version` → `bin/notify.cjs --source claude`
> 触发采集并看到 `tracker/logs/sync.log` 追加；删掉标记再触发，日志仍追加
> （走回退链），即"副本坏了不会静默停采"。CHANGELOG 见
> `packages/cli/CHANGELOG.md`。
> **2026-10-28 已发 npm 0.2.4 并本机验收**：`npm i -g tokenusage-cli@0.2.4
> --prefer-online` → 重跑 init（副本 67.1 MB、8 个顶层依赖目录、写 `.runtime-ready`
> v0.2.4，首跑 4,984,409,815 tokens / 9 providers）→ 副本从 `C:\` 直接
> `--version` 得 v0.2.4（自包含）→ `doctor` 的 `runtime.copy` 转 OK →
> `Start-ScheduledTask` 后 `LastTaskResult=0`、日志追加（parsed 15015、上传 2 buckets、
> tokens 4,759,340、sessions 1、10.1s）→ `token_sync_runs` 两条 `cli=0.2.4` →
> 手动跑一次 `notify.cjs --source claude` 得 `trigger=notify` 运行（118ms，走的正是
> 带标记副本），`token_usage_hourly` 当日 9 行 / 46,503,582 tokens 无重复回补。
> **2026-10-29 另一台 Volta 安装机复验**：`volta install tokenusage-cli@0.2.4`
> （0.2.2 → 0.2.4）后重跑 `init --yes --no-integrations --no-open`，副本
> `.runtime-ready` v0.2.4 / 68.1 MB / 8 个顶层依赖，从 `C:\` 直跑 `--version`
> 自包含通过；`doctor` 14 项全 ok。`Start-ScheduledTask` 返回 0、日志追加、
> 运行期间 0 个可见窗口；`token_sync_runs` 记 `trigger=scheduled` /
> `cli=0.2.4` / 8 桶 / 69,589,523 tokens，与小时桶 8 行合计完全一致。

> **0.2.3（2026-10-28 家里机按 0.2.2 升级清单实测发现）**：0.2.x 的 init 把隐藏
> VBS 注册到 `src/cli.js`（只导出 `run()` 的库文件，没有入口）——Windows 计划
> 任务每轮 0.1 秒退出 0，不采集、不写日志，`LastTaskResult` 恒为 0；且
> `--from-scheduled` 运行不落 autoLog，与 0.2.2 发布说明不符。两处均已修并加
> 回归测试。家里机已用 patch 包实测（任务 7 秒完成、滚动日志追加、
> `token_sync_runs` 记 `trigger=scheduled`）；升级 0.2.3 的机器重跑一次
> `init --yes --no-integrations --no-open` 修正任务入口。发版按 §二：提交 +
> push main → 操作者打 `cli-v0.2.3`。同日发包自检另清理了上游遗留的匿名安装
> 心跳（`tokenusage-telemetry` 端点不存在，每次 404）、local-api 的失效 bin
> 路径与 `--watch --interval` 非法值漏传，并加 `test/packaging.test.js` /
> `test/branding.test.js` 守卫（详情见 `packages/cli/CHANGELOG.md` 0.2.3）。同轮把署名
> 收敛到 `LICENSE` / `THIRD_PARTY_NOTICES.md`（包内 NOTICE 只留上游一节，`description`
> 去掉 fork 字样）。

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

新增待办（2026-10-28 公司机验收发现的真实缺口）——均已由 0.2.2 落地：

- [x] init 集成选择开关：`--no-integrations` 已实现（全有/全无；暂未做逐工具
  交互式选择），"只要任务注册、不要 hook"的机器可安全重跑 init。同轮修掉
  init 输出里写死的 `http://localhost:7680` 死常量。
- [x] 计划任务运行的触发口径与日志 trail：`--from-scheduled` 已实现（触发口径
  scheduled、绕过 cloud 偏好门控、启用 autoLog），计划任务不再被误记为 manual。

另案处理：apps/web 的 10 条依赖审计通告（1 low / 5 moderate / 2 high /
2 critical），属仪表盘侧。

## 五、0.4.4 发版验证清单（2026-11-04）

| 项 | 结果 |
|---|---|
| npm 版本 | `tokenusage-cli@0.4.4`，`dist-tags.latest = 0.4.4`；publish 于 2026-11-04T06:42:23Z，约 2.5 分钟后 registry 可读（`time["0.4.4"] = 06:45:02Z`） |
| git tag | `cli-v0.4.4`（annotated，指向 `478eead`）；本地与 `git ls-remote` 一致 |
| GitHub Actions | run `41787116998` 成功，耗时 1m43s；版本校验 → main 祖先校验 → `pnpm verify` → Trusted Publishing 发包 → Release 全部通过 |
| provenance | 已写入 sigstore transparency log（logIndex 3686619441） |
| Release notes | 取 CHANGELOG `## 0.4.4` 段（44 行），未退回 `--generate-notes` |
| 干净安装 | 临时目录 `npm i tokenusage-cli@0.4.4`（6 包 / 6s）后 `--version` → `v0.4.4`，`help` 正常；临时目录已删除，未污染全局 |
| 安全审计 | `pnpm audit --prod --registry=https://registry.npmjs.org` → No known vulnerabilities found |
| [x] 家机 `DESKTOP-MHFON1J #48ea790e` 升级与验证（2026-11-04） | Volta `tokenusage-cli@0.4.3 → 0.4.4`，`init --yes` 刷新 runtime copy；`doctor` 15 OK / 0 warn / 0 fail；`sync --drain` 解析 2,150 文件、上传 4 行；`reconcile --days 7` 有 **3 个既有 server-only**（dsh `2026-10-28` 08:30/09:00/09:30，本地队列的 dsh 行从 10-29 起才有，升级前快照即如此），非本次升级引入。升级后 7 天窗口 `project_key` 非空仍为 0——新桶来自 trae/workbuddy，项目型来源产生新桶后才会带上项目名 |
| [x] cursor 重新登录 | 家机已不使用 Cursor（2026-11-04 确认），跳过；如后续需要 Cursor 用量，再在客户端登录并跑 `tokenusage doctor` 复核 |
| [x] 公司机 `Company · Partner`（默认名 `PC-20260408RIKF #68e47b34`）升级 | 当时仍为 0.4.3 → **2026-11-05 已完成**（操作者在那台机器上升级到 0.4.6 并验收，记录见 §七） |
| [x] 公司机升级后验收 | **2026-11-05 完成**（操作者在那台机器上执行 `tokenusage reconcile --days 7` 验收通过；服务端侧核对见 §七） |

## 六、0.4.5 发版验证清单（2026-11-04）

修复批：契约 v2 拆分行的队列去重键补 `project_key`（旧键会压掉被归因的行、偏移照旧推进 →
永久丢数据）；拆分行改按服务端 basename 身份合并；ingest / session 上传必须拿到确认字段才推进
offset / watermark；Windows 隐藏启动器写 UTF-16LE + BOM；`init` 首同步统计跳过控制行。无契约
变更，服务端与 web 不需要跟着升级。

| 项 | 结果 |
|---|---|
| npm 版本 | `tokenusage-cli@0.4.5`，`dist-tags.latest = 0.4.5`；publish 于 2026-11-04T08:49:45Z，npm 异步处理约 2.5 分钟后可读（`time["0.4.5"] = 08:52:23Z`） |
| git tag | `cli-v0.4.5`（annotated，指向 `939ffc8`，即已推送 main 的发版提交） |
| GitHub Actions | main CI run `41802149885` 全绿（verify 1m17s / Windows CLI 1m5s）；Release run `41802352267` 成功，耗时 1m12s，版本校验 → main 祖先校验 → `pnpm verify` → Trusted Publishing 发包 → Release 全部通过 |
| provenance | 已写入 sigstore transparency log（logIndex 3687445085） |
| Release notes | 取 CHANGELOG `## 0.4.5` 段（20 行），未退回 `--generate-notes` |
| 干净安装 | 临时目录 `npm i tokenusage-cli@0.4.5 --registry=https://registry.npmjs.org`（6 包 / 20s）后 `--version` → `v0.4.5`，`help` 正常；临时目录已删除，未污染全局 |
| 安全审计 | `pnpm audit --prod --registry=https://registry.npmjs.org` → No known vulnerabilities found |
| [x] 家机 `DESKTOP-MHFON1J #48ea790e` 升级与验证（2026-11-04） | Volta `tokenusage-cli@0.4.4 → 0.4.5`；`init --yes --no-integrations --no-open` 刷新 runtime copy（`.runtime-ready` v0.4.5，从 `C:\` 直跑副本 `--version` → v0.4.5）；`doctor` 15 OK / 0 warn / 0 fail（`runtime.copy` OK，7 天 token 计价覆盖 100%）；`sync --drain` 解析 1,886 文件、新入队 1 桶、上传 6 行，sessions 4/4 |
| [x] 数据修复（家机） | 升级后首次 `reconcile --days 7` 报 1 条 `missing_on_server`：`2026-11-04T07:30Z opencode deepseek-v4.1-flash-free` 10,241,261 tokens——正是 0.4.4 旧去重键压掉项目拆分行后偏移照旧推进留下的缺口，本地队列仍保留该行。把该行重新追加到 `queue.jsonl` 末尾（追加即 last-wins，无需改 offset）→ `upload --drain` 上传 1 行 → 该缺口消失 |
| [x] 复验 | 再次 `reconcile --days 7`：0 missing / 0 mismatched，仅剩 **2 条既有 server-only**（dsh `2026-10-28` 09:00 / 09:30，0.4.4 升级时就存在，本地队列的 dsh 行从 10-29 起才有），非本次升级引入 |
| [x] Cursor | 同步提示 `Cursor session expired`，家机已不使用 Cursor（2026-11-04 确认），跳过 |
| npm 镜像注意 | 家机 npm registry 是 `registry.npmmirror.com`（**2026-11-05 起家机已换成 nvm + npm 全局，registry 为 `registry.npmjs.org`，本条不再适用**），发版后镜像尚未同步 0.4.5，`volta install` 会 `ETARGET`；用 `npm_config_registry=https://registry.npmjs.org volta install tokenusage-cli@0.4.5` 绕过。日常升级若不想等镜像，可沿用同一写法 |
| [x] 公司机 `Company · Partner`（默认名 `PC-20260408RIKF #68e47b34`）升级 | **2026-11-05 完成**（操作者在那台机器上升级到 0.4.6 并验收，记录见 §七） |

## 七、0.4.6 发版验证清单（2026-11-05）

上游对齐补丁 + 限额面板：Cursor 准入改按 token 分量（cache-only 行不再丢）、Qoder credits 取
较大值 / `billable:false` 但 credits>0 准入 / 坏时间戳按行丢弃、Trae CN 双 app dir；Qoder Desktop
0.4.x 限额改扫 `main.log` 摘要并带 provenance；新增 opt-in `status --limits`（`--json` 的
`limits` 键）。零契约 / 零 DB 变更，服务端与 web 不需要跟着升级。

| 项 | 结果 |
|---|---|
| npm 版本 | `tokenusage-cli@0.4.6`，`dist-tags.latest = 0.4.6`；publish 于 2026-11-05T10:31:17Z |
| git tag | `cli-v0.4.6`（annotated，指向 `414c513`，即已推送 main 的发版提交） |
| GitHub Actions | main CI run `42010816281` 全绿；Release run `42010824329` 成功（版本校验 → main 祖先校验 → `pnpm verify` → Trusted Publishing 发包 → Release） |
| provenance | 已写入 npm attestations（`dist.attestations.url` 可查） |
| Release notes | 取 CHANGELOG `## 0.4.6` 段，未退回 `--generate-notes` |
| [x] 家机 `DESKTOP-MHFON1J #48ea790e` 升级与验证（2026-11-05，Volta 时期） | Volta `tokenusage-cli@0.4.5 → 0.4.6`；`init --yes --no-integrations --no-open` 刷新 runtime copy（`.runtime-ready` v0.4.6，首采 3,201,292,093 tokens / 13 providers）；`doctor` 15 OK / 0 warn / 0 fail（`runtime.copy` v0.4.6，7 天 token 计价覆盖 100%）；`status --limits` 首次可见 Qoder 两行：CN `Personal Standard, 0%, add-on: 40.8%, 1061/2600 credits, cli-api, 0s ago`、国际版 `disk-cache, stale, 36m ago`；`reconcile --days 7` **OK**（243 桶、51 条未上传、0 drift） |
| npm 镜像注意 | 家机 npm registry 是 `registry.npmmirror.com`（**2026-11-05 起家机已换成 nvm + npm 全局，registry 为 `registry.npmjs.org`，本条不再适用**），发版后镜像通常滞后，`volta install` 会 `ETARGET`；用 `npm_config_registry=https://registry.npmjs.org volta install tokenusage-cli@0.4.6` 绕过 |
| [x] 家机 `DESKTOP-MHFON1J #48ea790e` 重新升级与验收（2026-11-05，换装 nvm 后） | 家机已从 Volta 换成 nvm-windows + npm 全局（`E:\nodejs` 是指向 `E:\nvm\nvm\v24.4.1` 的符号链接），npm registry = `registry.npmjs.org`，故镜像滞后不适用。换装后全局包落在 **0.4.5**（较 §七 Volta 时期的 0.4.6 落后一档）→ `npm i -g tokenusage-cli@0.4.6 --prefer-online` → `tokenusage --version` = v0.4.6；`init --yes --no-integrations --no-open` 刷新 runtime copy（`.runtime-ready` v0.4.6，14:29:31Z），首采 **5,936,534,278 tokens / 13 providers**；从 `C:\` 直跑运行时副本 `--version` → v0.4.6 |
| [x] 家机升级后验收（2026-11-05） | `sync` 解析 30,124 文件、上传 **231 行 / 0 跳过**；`reconcile --days 1` 与 `--days 7` 均 **OK**（114 桶逐键匹配、0 drift、退出码 0）；`doctor` 15 OK / 0 warn / 0 fail（`runtime.copy` v0.4.6，7 天 token 计价覆盖 100%）；计划任务 `\TokenUsageSync` 手动触发后 `LastTaskResult=0`，`tracker/logs/sync.log` 记录 `parsed 30126 files, +1 buckets, uploaded 1`，队列清空——确认 VBS 里写死的 `E:\nvm\nvm\v24.4.1\node_modules\tokenusage-cli` 与 npm 全局是同一份安装（符号链接指向同一目录），不存在旧副本残留 |
| 调度降级（家机预期） | `init` 摘要仍为 `degraded: xml_rejected — 错误: 拒绝访问。`：非提升 shell 下 `schtasks /Create /XML` 需管理员权限，自动降级为每小时触发，丢失 catch-up / retry / 无执行时限三项增强；采集与上传不受影响，要启用需以管理员身份重跑 `tokenusage init` |
| `status --limits` 观察（家机） | ZCode `Lite, 0%, secondary: 16%, resets 2026-11-09T07:45:03Z, provider-api`；Qoder CN `Personal Standard, 0%, add-on: 40.8%, 1061/2600 credits, cli-api`；Codex 一行 `error: fetch failed`（该 provider 限额接口在家机不可达，非升级引入） |
| 家机遗留项 | `Trae SOLO CN: usage sync off`（需 `TOKENUSAGE_TRAE_CN_USAGE=1` 开启）——0.4.6 已修 Trae CN 双 app dir 识别，开启后即可采到 Trae CN 用量 |
| [x] 公司机 `Company · Partner`（默认名 `PC-20260408RIKF #68e47b34`）升级与验收 | **2026-11-05 操作者在那台机器上完成**：`npm i -g tokenusage-cli@0.4.6` → `tokenusage init --yes --no-integrations --no-open` → `tokenusage reconcile --days 7` 验收通过。服务端核对（`token-usage-dashboard?range=all_time`，设备令牌只读）：device `1bd2ff67-653f-4b9c-80a9-c7589432d431`、云端名 `Company · Partner`、active、2,037 桶 / 14,835,125,523 tokens、`last_used_at 2026-11-05T11:00:16Z`（升级后仍在按小时上报） |

## 八、0.4.7 发版验证清单（2026-11-05）

**背景**：一个账户两台采集机，而 `status` / `doctor` 的输出正是被贴进发版清单与工单的那段
文字。旧版 CLI 从不说「我是哪台机器」，于是「本机」与「另一台」在文档里混成一团——本文件
§四与§五之间「本机」的指代就翻转过一次（§四 = 公司机，§五起 = 家机）。本批把身份写进输出，
让机器归属不再依赖人记。

**范围**：纯 CLI 输出面，零契约变更，服务端与 web 不需要跟着升级。

### 8.1 设备身份（机器是谁）

| 项 | 内容 |
|---|---|
| `status` 文本输出 | 新增 `- Device: <hostname> #<machine_id 前 8 位> (id <device_id>)`；未配对时显示 `(not paired)` |
| `status --json` | 新增 `device` 块：`name` / `hostname` / `machine_id` / `device_id` |
| `status --light` | 表格新增 `Device` 与 `Device ID` 两行（AI / CI 友好输出同样可辨识机器） |
| `doctor` | 新增 `runtime.device_identity` 检查：有 `machine_id` 记 OK，缺失记 warn；检查项由 15 增至 16 |
| `sync` / `upload` / `reconcile` | 同样打印 `- Device:` 行；`reconcile` 额外加 `Local device:` 一行，与 `Cloud device:` 并列 |
| `init` | `Setup complete!` 段落里加一行 `Device: <name> (id <device_id>)` |
| 身份来源 | `~/.tokenusage/tracker/config.json` 的 `machineId` / `deviceId`；config 丢失时回退到 purge 存活的 `~/.config/tokenusage/machine-id`。全程只读，不生成也不改写 id |
| 设备名规则 | 与契约 `docs/cli-contract.md` §2.2 一致（`<主机名> #<machine_id 前 8 位>`）——注意打印的是**默认名**；仪表盘里改过的云端当前名（如 `Home · C Future City` / `Company · Partner`）不改变这个稳定标识 |
| 测试 | `packages/cli/test/device-identity.test.js` 7 条 |

### 8.2 采集结果摘要（采了多少）

`sync` 过去的输出只有「解析了几个文件 / 排了几桶 / 插入了几行」，既不说是哪台机器，也不说
传了多少 token、多久、还剩多少。这批把摘要补全并抽成纯函数（`buildSyncSummaryLines`）：

```
Sync finished:
- Device: DESKTOP-MHFON1J #48ea790e (id 6a074a51-693b-48e3-9f65-0728f9f2ee5c)
- Parsed files: 30,125
- New 30-min buckets queued: 1
- Uploaded: 2 rows (86,538,406 tokens), 0 skipped
- Duration: 8.5s
```

| 变化 | 说明 |
|---|---|
| 新增 `- Device:` | 每条命令自报机器 |
| 新增 token 数 | 「插入了几行」不够，token 总量才是仪表盘上的数字 |
| 新增 `- Sessions:` | 会话上传原本单独打一行、且排在汇总之前；现在并入汇总，顺序正确 |
| 新增 `- Credits:` | 仅当本次上传带积分时显示（积分是独立维度，不并入 token） |
| 新增 `- Duration:` | 采集耗时，便于判断是否卡在大目录扫描上 |
| 新增 `- Upload error:` | 上传失败时明确出现在汇总里，而不是只静默留在日志 |
| 千分位 | 文件数 / 行数 / token 数统一 `1,234` 格式 |
| 自动运行日志 | `sync.log` 的 JSONL 同步补 `tokens` / `credits` / `sessions_uploaded` / `sessions_skipped` / `duration_ms` 字段（纯追加，不改既有字段） |
| `upload` 命令 | 同样加 `- Device:` 与 `- Credits in this upload:` |

**升级后怎么用**（两台机器都跑一遍即可自动对上号）：

```bash
tokenusage status            # 文本输出里的 - Device: 就是这台机器
tokenusage status --json     # .device.name / .device.device_id
tokenusage doctor            # 新增 runtime.device_identity 检查
```

**公司机 `device_id` 已核对**（2026-11-05）：`1bd2ff67-653f-4b9c-80a9-c7589432d431`，
云端当前名 `Company · Partner`，默认名 `PC-20260408RIKF #68e47b34`。取值方式：
家机用设备令牌读 `GET /api/functions/token-usage-dashboard?range=all_time`，
`devices[]` 里逐台核对；已回填本文档开头「机器称呼约定」与 `docs/launch-runbook.md`
的采集机清单表。

### 8.3 发版验证清单

| 项 | 结果 |
|---|---|
| npm 版本 | `tokenusage-cli@0.4.7`，`dist-tags.latest = 0.4.7`；publish 于 2026-11-05T15:50:56Z，npm 异步处理约 **60 秒**后 registry 可读 |
| git tag | `cli-v0.4.7`（lightweight tag，指向 `324e883`，即已推送 main 的发版提交） |
| GitHub Actions | Release run `42058837663` 成功，耗时 1m41s；版本校验 → main 祖先校验 → `pnpm verify` → Trusted Publishing 发包 → Release notes 取段 → 建 Release 全部通过 |
| provenance | 已发布（npm 提示 `Signed provenance statement`，transparency log logIndex 3695689270） |
| Release notes | 取 CHANGELOG `## 0.4.7` 段，未退回 `--generate-notes`；GitHub Release `cli-v0.4.7` 已建（作者 github-actions[bot]） |
| 安全审计 | `pnpm audit --prod --registry=https://registry.npmjs.org` → No known vulnerabilities found |
| 提交分批 | `feat(cli)` 设备身份与摘要（`15e2fad`）→ `docs` 文档集规范化（`bc24f5e`）→ `chore(cli)` 发版 bump（`324e883`） |
| [x] 家机 `DESKTOP-MHFON1J #48ea790e` 升级与验证（2026-11-05） | `npm i -g tokenusage-cli@0.4.7 --prefer-online --registry=https://registry.npmjs.org`（6 包 / 9s）→ `tokenusage --version` = **v0.4.7**；`init --yes --no-integrations --no-open` 刷新运行时副本（`.runtime-ready` v0.4.7，15:55:45Z），首采 **6,035,697,672 tokens / 13 providers**，完成页已带 `Device:` 行 |
| [x] 家机采集验证 | `sync` 解析 **30,125** 文件、新入队 1 桶、上传 **2 行 / 86,538,406 tokens / 0 跳过**，耗时 8.5s，摘要带 `- Device:`；`reconcile --days 1` **OK**（4 桶逐键匹配）、`--days 7` **OK**（117 桶逐键匹配），退出码均 0 |
| [x] 家机体检 | `doctor` **16 OK / 0 warn / 0 fail / 0 critical**（新增 `runtime.device_identity` 检查项 OK；`runtime.copy` v0.4.7；7 天 token 计价覆盖 100%） |
| [x] 家机计划任务 | 手动触发 `\TokenUsageSync` → `LastTaskResult=0`；`sync.log` 记录 `parsed 30127 files, +1 buckets, uploaded 1, 31373059 tokens, queue drained`，JSONL 已带新字段 `tokens` / `credits` / `sessions_uploaded` / `sessions_skipped` / `duration_ms` |
| [x] 家机输出面抽查 | `status --json` 的 `device` 块四字段齐全（`name` / `hostname` / `machine_id` / `device_id`）；`status --light` 表格含 `Device` 与 `Device ID` 两行 |
| 调度降级（家机预期） | `init` 摘要仍为 `degraded: xml_rejected — 错误: 拒绝访问。`：非提升 shell 下 `schtasks /Create /XML` 需管理员权限，自动降级为每小时触发；采集与上传不受影响 |
| [x] 公司机 `PC-20260408RIKF #68e47b34`（云端名 `Company · Partner`）升级与验证（2026-11-06） | Volta + npmmirror，镜像已同步（两源 `dist-tags.latest` 均为 0.4.7），无需绕道 npmjs：`npm i -g tokenusage-cli@0.4.7`（由 Volta 接管，6 包 / 1s）→ `tokenusage --version` = **v0.4.7**（`volta list`：`tokenusage-cli@0.4.7 / node@24.15.0`）；`init --yes --no-integrations --no-open --dry-run` 预览集成 Skipped → 正式 init 把运行时副本从 0.4.6 刷到 **0.4.7**（`.runtime-ready` 01:32:42Z），首采 **3,201,752,710 tokens / 13 providers**，完成页 `Device: PC-20260408RIKF #68e47b34 (id 1bd2ff67-653f-4b9c-80a9-c7589432d431)` 与开头对照表一致 |
| [x] 公司机采集验证 | `sync` 解析 **3,389** 文件、新入队 1 桶、上传 **4 行 / 587,381 tokens / 0 跳过**、sessions 1/1，耗时 9.4s，摘要带 `- Device:`；`reconcile --days 1` **OK**（28 桶）、`--days 7` **OK**（239 桶），逐键匹配、`Local device` / `Cloud device` 并列、退出码 0 |
| [x] 公司机体检 | `doctor` **16 OK / 0 warn / 0 fail / 0 critical**（`runtime.device_identity` OK；`runtime.copy` v0.4.7；7 天 token 计价覆盖 100%） |
| [x] 公司机输出面抽查 | `status` 文本带 `- Device:`；`status --json` 的 `device` 块四字段齐全；`status --light` 含 `Device` / `Device ID` 两行 |
| [x] 公司机计划任务（增强调度首次真机验证） | 该机 shell 为提升权限，init 摘要为 `TokenUsageSync: hourly, hidden window`、**无 degraded**——`schtasks /Create /XML` 注册成功：每小时（Daily 触发 + `PT1H` 重复）+ 登录触发、`StartWhenAvailable=True`、失败重试 3 次 / `PT5M`、`ExecutionTimeLimit=PT0S`，即 §四 0.4.1 所记「以管理员身份重跑 init 启用增强调度（行为未验证）」的首次真机验证。手动触发 → `LastTaskResult=0`，`sync.log` 记 `parsed 3397 files, +1 buckets, uploaded 1, 1047761 tokens, queue drained`，JSONL 带 0.4.7 新字段（定时任务已走新版本） |
| 公司机观察（均非本次升级引入） | ① `reconcile --days 10` 报 22 个 server-only，全部落在 10-27 / 10-28：10-29 误删用户目录事故后本地队列已无这些行、服务端保留（§四 0.2.6），7 天窗口不受影响；② `sync` 提示 `Cursor session expired`（账户级来源，见开头更正）；③ `codex rescan repair: rebuild produced 0 codex buckets from 2 files — skipping to avoid data loss`：CLI 骨架起即有的保护性跳过，本地队列 0 条 codex 行，无影响；④ Volta 的 Windows shim 会把非零退出码改写为 **126**：`reconcile` 有漂移时直跑 `node <包>/bin/tokenusage.js` 退出码为约定的 1、经 `tokenusage` shim 为 126，脚本按退出码判漂移时只判非零或直调 node |

**升级后怎么用**（两台机器都跑一遍即可自动对上号）：

```bash
tokenusage status            # 文本输出里的 - Device: 就是这台机器
tokenusage status --json     # .device.name / .device.device_id
tokenusage doctor            # 新增 runtime.device_identity 检查
```

