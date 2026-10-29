# Changelog

本包（`tokenusage-cli`）的用户可见变更记录。发版时在顶部新增一节，
`## <版本号>` 行会被 release workflow 取作 GitHub Release 正文。

## 0.2.6

移除从未接线的错误上报 SDK，安装体积与运行时副本明显变小；采集行为不变。

- 删除 `@sentry/node` 与 `src/lib/sentry.js`、`src/lib/telemetry-pref.js`：
  CLI 只在启动时 init 了 Sentry，`captureException` 没有任何调用点，实际从不上报；
  但它在运行时副本里占 44 MB（67.5 MB 的约 65%），全局安装还带入
  `@sentry/bundler-plugins` 的构建期依赖链（安装总量 93.1 MB 中约 59 MB）。
  移除后运行时副本 22.9 MB（实测 462 个文件）、干净 prefix 安装 23 MB
  （此前 93.1 MB），且不再有第三方上报入口。
- `bin/tokenusage.js` 未捕获异常的兜底里还留着一个 `require('../src/lib/sentry')`
  （包在 try/catch 里，删模块后永不生效的残留）；一并删除，守卫测试改为同时扫描
  `src/` 与 `bin/`。
- README 隐私边界同步：CLI 不做匿名心跳、也不做任何第三方错误上报。
- `THIRD_PARTY_NOTICES.md` 的运行时依赖示例去掉 `@sentry/node`。
- 新增 `test/packaging.test.js` 守卫：`@sentry/*` 不得重新出现在依赖或源码中；
  运行时副本回归测试改用 `yauzl` 的传递依赖 `pend` 验证扁平闭包复制。
- 未随本版改动：macOS/Linux 原生调度、`init` 逐工具集成选择（见
  `docs/cli-release.md` §四，等真机验证/形态确认后再做）。

## 0.2.5

0.2.4 验收后的小修：去掉安装警告、修正初始化重复文案，并补 Windows CI。

- 移除 `@mongodb-js/zstd` 与两处 Node 20 zstd 回落分支：包 `engines` 已是
  `>=22.19`，`node:zlib` 自带 zstd。`npm i -g` 不再出现 `prebuild-install`
  弃用警告，运行时副本也少一个 native 依赖。
- 修 `init` 跳过行重复文案：detail 已以 `Skipped` 开头时不再叠加
  `Skipped - ` 前缀（此前显示 `Skipped - Skipped (--no-integrations)`）。
- 顺手去掉 `--dry-run` 收尾的重复 `Dry run complete` 行，只保留
  `Run init without --dry-run to apply changes.`。
- README 补齐 `init` 的 `--yes` / `--dry-run` / `--no-open` / `--link-code`
  参数说明。
- CI 新增 `windows-latest` job：跑 CLI 测试 + `init --dry-run` 烟测并断言
  输出不含 `Skipped - Skipped`，避免 VBS / 入口类回归只靠发版前人工验收。

## 0.2.4

计划任务抗 Node 版本切换 + 自检一次性收口的采集可靠性修复（发 0.2.3 后立即补；
家里机实测发现）。

- 0.2.3 的隐藏 VBS 把 npm 全局前缀里的包路径写死，而 nvm-windows 的全局前缀
  按 Node 版本分目录（如 `E:\nvm\nvm\v24.4.1\node_modules\tokenusage-cli`）。
  `nvm use` 之后该路径消失，任务每小时以 "file not found" 失败
  （`LastTaskResult` 非 0、日志停更），而任务本身看起来仍"已注册"。
- VBS 现在先 `FileExists` 探测包路径，缺失时回落到 init 复制到数据目录的自包含
  运行时 `~/.tokenusage/tracker/app/bin/tracker.js`，采集不中断。
- VBS 的引号改用 `Chr(34)` 拼接（不再依赖转义写法），行为不变：wscript 直接起
  node、隐藏窗口、用退出码回填 `LastTaskResult`。
- 运行时副本改为"依赖闭包"复制：旧实现整目录 `fs.cp`，在 pnpm 安装下只复制到
  junction 链接（副本里 `node_modules` 只有 1 项），副本一跑就是
  `Cannot find module`；现在按依赖图逐个复制真实目录，npm / pnpm 两种布局都能
  得到自包含副本。
- 副本先复制到 `app.new` 暂存目录，**实际启动一遍**（`require` 全部直接依赖 +
  `--version`）通过后才替换 `app` 并写 `.runtime-ready` 标记。没有标记的副本
  一律不使用——半成品副本在忽略输出的后台进程里静默死掉，表现与"采集正常"
  完全一样，这是最难排查的一类失败。
- notify / OpenClaw hook / OpenClaw session plugin / sync 自动重试脚本统一按
  "带标记的副本 → 已安装包入口 → npx" 三级选择启动器。
- `tokenusage doctor` 新增 `runtime.copy` 检查：缺标记、版本落后都会给出
  warn 与重跑 `init` 的建议（升级 CLI 后重跑之前先能看见）。
- `init` 复制失败不再静默：报告里列一行（stderr 同时提示），并说明会自动回退。
- `uninstall` 一并清理暂存目录 `app.new`。
- 后台 spawn 全部加 `windowsHide`（notify 之外的 hook / 自动重试 / 本地 API），
  避免 GUI 宿主（如 oh-my-pi）每轮闪一个控制台窗口。
- `sync --watch --interval=<毫秒>` 等号写法不再泄漏进 sync 参数（此前会被当成
  未知参数导致每一轮失败）；低于 1 分钟仍按 15 分钟处理。
- 仍然建议升级或切换 Node 版本后重跑一次
  `tokenusage init --yes --no-integrations --no-open`：回落副本是上次 init 的
  快照，重跑才会同步到最新版本。

## 0.2.3

修复 0.2.x 计划任务的两个隐藏缺陷（0.2.2 升级验收时实测发现）。

- 计划任务指向错误入口：init 注册的隐藏 VBS 调用的是 `src/cli.js`——那是只
  导出 `run()` 的库文件、没有命令行入口，任务 0.1 秒内以退出码 0 结束，
  既不采集也不写日志，`LastTaskResult` 永远是 0（看起来永远成功）。VBS 现
  固定指向包内 `bin/tokenusage.js`，并有回归测试锁定（禁止再指向 `src/cli.js`）。
- 定时运行不落日志：`sync --from-scheduled` 只打印到 stdout，隐藏窗口下没有
  任何 trail，与 0.2.2 发布说明不符。现在所有自动风味运行（scheduled / hook /
  retry / watch）统一追加到滚动日志 `~/.tokenusage/tracker/logs/sync.log`。
- 已注册过任务的机器：升级后重跑一次
  `tokenusage init --yes --no-integrations --no-open` 即可修正任务入口。
- 品牌残留：init 启动横幅的 ASCII 与大标题仍是上游的 TOKEN TRACKER，
  local-api 的兜底设备名也写 Token Tracker；按 AGENTS 命名约束统一为
  Token Usage，并加回归测试防回潮。
- 移除上游遗留的匿名安装心跳（`POST /api/functions/tokenusage-telemetry`）：
  本仓库契约与 Web 端都没有该路由，每次 sync 只会拿到 404 并进退避，还与启动屏
  "只有 token 计数离开本机"的口径冲突。要统计安装量，先补服务端路由再恢复。
- 修正 local-api 遗留的本地服务 spawn 路径（`bin/tracker.js` 自 fork 起就不
  存在），并新增发包自检测试：bin 入口存在、spawn 路径可解析、无孤儿端点。
- `--help` 补齐 `init --no-integrations/--no-task` 与 `sync --interval`。
- 修正 `sync --watch --interval <ms>` 的非法值处理：README 承诺低于 1 分钟回退
  15 分钟，但此前参数会漏进 cmdSync，导致每轮以 `Unknown option: --interval`
  失败；现在该参数始终被剥离，并有单测覆盖。
- 署名与包元数据收敛：`description` 去掉 fork 字样；`THIRD_PARTY_NOTICES.md`
  只保留上游 TokenTracker 一节（其余条目是 Web 端资产，本仓库已不存在也不随包）；
  README 的来源说明收为一句，指向 `LICENSE` / `THIRD_PARTY_NOTICES.md`。

## 0.2.2

新机初始化修复与采集口径修正。

- 修复严重初始化缺陷：从 npm 安装后 `tokenusage init` 必崩（包内缺少
  `bin/tracker.js`——fork 改名 bin 后安装器没跟着改，0.1.0 起所有已发布版本
  受影响；单测因跳过运行时拷贝未覆盖）。新增防回归测试直接执行运行时拷贝。
- init 新增 `--no-integrations`：只做扫描根配置、计划任务注册与运行上报，
  **不改动任何 AI 工具的配置**（不装 hooks/notify/插件）。只要定时采集、
  不想被触碰各工具配置的机器终于可以安全重跑 init。
- init 的欢迎屏与完成屏改为显示真实站点地址（原先写死一个本地端口残留）。
- 计划任务运行的口径修正：init 注册的隐藏任务改跑 `sync --from-scheduled`，
  运行记录正确标记为"定时"（此前记成"手动"），并写入滚动日志（此前隐藏
  运行无任何日志痕迹）。已在 0.2.0/0.2.1 注册过任务的机器重跑一次 init 即可升级。

## 0.2.1

修复 0.2.0 的严重回归：运行上报的版本号读取用了错误的相对路径（`Cannot find
module '../package.json'`），导致每轮 `sync` 启动即崩溃——定时与手动采集全部
中断。本地包实测通过后发布；并新增防回归测试，锁定嵌套模块的 package.json
require 深度，此类问题不再可能静默通过测试。

## 0.2.0

采集控制与运行记录：采集器从此可暂停、可审计。

- 新增 `tokenusage pause` / `resume`：一键暂停/恢复自动采集。暂停期间
  `sync --auto` / `--watch`（含通知触发）静默退出，手动 `tokenusage sync`
  不受影响；`status` 显示当前采集状态。
- `init` 接管 Windows 计划任务注册：每小时任务由 init 创建（默认经 VBS
  隐藏窗口运行，不再弹 conhost 黑框；`--no-task` 可跳过）；pause/resume
  顺势启停任务；`uninstall` 一并清理任务与脚本。
- 同步日志改为滚动文件（`~/.tokenusage/tracker/logs/sync.log`，1 MiB 轮转
  一代），不再依赖注册时的 `>>` 重定向。
- 每轮 sync 结束后向服务端上报一条运行记录（时间、触发方式、结果、耗时、
  上报量），仪表盘新增"采集记录"页；空跑也上报，作为采集器心跳。上报为
  尽力而为，失败只记本地日志，绝不影响用量数据采集；不想上报可在 init 时
  `--run-report=off` 关闭。
- 正确性修复：zcode 恢复行补齐 billable/cost 字段；含 `|` 的模型名不再破坏
  用量桶键的往返解析；OpenCode 负 delta 不再产生负计数；`TOKENUSAGE_*`
  环境变量优先于旧 `INSFORGE_*` 名（旧名保留兼容）；移除 init 中的死常量。

## 0.1.0

首个公开发布版本：TokenTracker CLI 采集端 fork，重接到 token-usage 契约
（`docs/cli-contract.md`）。

- 设备流配对（`device-login`）、`init`、`sync`（含 `--watch` / `--drain`）、
  `status`、`sessions`、`doctor`、`diagnostics`、`uninstall`
- 会话上传走隐私白名单：只传聚合 token 数字，标题 / 路径 / 正文永不出本机
- 上传链路防毒行硬化：契约非法的用量桶 / 账户会话状态在出批前丢弃或修正，
  而不是让 ingest 边缘整批 400、队头永久停摆；Grok ACP 小数计数器解析期取整；
  会话 ID 校验对齐服务端的完整 Unicode Cc 控制字符范围
- 请求日志降噪：`node:sqlite` 每次加载都打印的 ExperimentalWarning 不再
  混入重定向的同步日志
- 要求 Node ≥ 22.19（undici 8 的引擎下限；undici 仅用于代理支持）
