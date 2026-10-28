# Changelog

本包（`tokenusage-cli`）的用户可见变更记录。发版时在顶部新增一节，
`## <版本号>` 行会被 release workflow 取作 GitHub Release 正文。

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
