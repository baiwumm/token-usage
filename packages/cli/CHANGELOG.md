# Changelog

本包（`tokenusage-cli`）的用户可见变更记录。发版时在顶部新增一节，
`## <版本号>` 行会被 release workflow 取作 GitHub Release 正文。

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
