# tokenusage-cli

自托管 AI 编码 token 用量采集器，为 [token-usage](https://github.com/baiwumm/token-usage)（自托管仪表盘）上报数据，指向其契约（[CLI 契约](https://github.com/baiwumm/token-usage/blob/main/docs/cli-contract.md)）。代码来源与许可见 `LICENSE` 与 `THIRD_PARTY_NOTICES.md`。

> 运行要求：Node ≥ 22.19（由上传依赖 undici 8 的引擎下限决定）。

## 快速开始（三步）

```bash
# 1) 初始化：扫描根配置、各工具用量 hook，并注册每小时自动采集的计划任务
#    （Windows 经 VBS 隐藏窗口运行，不弹黑框；--no-task 可跳过任务注册。增强任务定义
#     需要管理员权限，非提升 shell 下会自动降级为普通每小时触发并提示 degraded）
tokenusage init

# 2) 配对：输出一个 user_code，浏览器打开提示的链接批准
tokenusage device-login
#    → https://<你的站点>/device?user_code=XXXX-XXXX
#    → 批准后本机自动拿到设备令牌（码 15 分钟内有效）

# 3) 上报
tokenusage sync            # 手动一轮：解析 → 入队 → 上传
tokenusage sync --drain    # 首次/积压补传（更大的批处理预算）
```

完成。init 注册的计划任务每小时自动采集一次；也可以随时手动 `tokenusage sync`，
或用 `--watch` 常驻自动上报（见下）。不想自动采集就 `tokenusage pause`（见下）。

**谁批准配对？** 批准者就是配对时登录站点的那个账号——设备与其全部数据绑定到该账号，账号之间数据完全隔离。自托管用户批准自己的设备即可；站点管理员不需要、也无法替别人审批。陌生人可以对公开站点发起配对码，但没有账号就批不了（注册邀请制 / `token_allowed_emails` 白名单），码 15 分钟自动过期。

## 命令

| 命令 | 说明 |
|---|---|
| `tokenusage init` | 本地初始化：扫描根配置、各工具 hook 安装、注册每小时计划任务（Windows 隐藏窗口）、刷新运行时副本。**不含配对** |
| `tokenusage device-login` | 设备流配对：输出 `user_code`，在站点 `/device` 页批准后本机拿到设备令牌 |
| `tokenusage sync` | 解析本地 AI 工具日志 → 上报小时桶 + 会话元数据 |
| `tokenusage upload` | 只刷本地队列，不扫描来源 |
| `tokenusage reconcile` | 只读对账：本地 `queue.jsonl` 的 last-wins 基线 vs 云端该设备的桶明细，按 `(hour_start, source, model)` 逐键比对，有漂移退出码 1 |
| `tokenusage pause` / `resume` | 暂停/恢复自动采集：定时任务、hook、`--watch` 全部静默停手，手动 `sync` 不受影响 |
| `tokenusage status` | 本地状态：Base URL、令牌、设备身份、采集状态、队列积压、最近解析/上传时间 |
| `tokenusage doctor` | 体检（运行时 / 网络 / 各工具配置），critical 时退出码非 0 |
| `tokenusage diagnostics` | 诊断信息导出（家目录路径脱敏为 `~`） |
| `tokenusage sessions` | 本地导出会话分析（JSON/CSV，元数据级） |
| `tokenusage uninstall [--purge]` | 移除 hook、计划任务与运行时副本；`--purge` 连数据目录一起删（保留机器身份） |

配置优先级：CLI 参数 > `~/.tokenusage/.../config.json` > 环境变量（`TOKENUSAGE_BASE_URL` 等）> 内置默认（你的部署地址 + 其公开 publishable key）。

帮助与错误：`tokenusage help`、`tokenusage help <命令>`、`tokenusage <命令> --help` 都可用。
参数写错（未知命令 / 未知参数 / 非法取值）只输出一行 `Error: ...` 加 `Hint:`，退出码
`2`；其余运行错误退出码 `1`。要堆栈加 `--debug`。

### 常用参数

<details>
<summary><code>init</code></summary>

| 参数 | 说明 |
|---|---|
| `--base-url <url>` | 后端地址（默认托管实例） |
| `--dashboard-url <url>` | 成功提示里显示的仪表盘地址 |
| `--anon-key <key>` / `--anon-key-file <path>` | 自托管实例的 publishable key |
| `--integrations <ids,all,none>` | 逐工具选择要接管的集成；`none` == `--no-integrations`（只做纯定时采集） |
| `--no-integrations` | 不碰任何工具配置 |
| `--no-task` | 不注册自动采集计划任务 |
| `--run-report=on\|off` | 运行记录上报开关（关闭即不再上报心跳） |
| `--yes` | 非交互 |
| `--dry-run` | 只预览不落盘 |
| `--no-open` | 不自动打开浏览器 |

已移除：`--email` / `--password` / `--device-name` / `--link-code` / `--no-auth`（浏览器登录已下线，配对走 `device-login`）。
</details>

<details>
<summary><code>sync</code></summary>

| 参数 | 说明 |
|---|---|
| `--watch` / `--interval <ms>` | 常驻模式，默认每 15 分钟一轮（下限 60000） |
| `--upload-only` | 不扫描来源，只刷队列（等同 `upload`） |
| `--source <id>` | 只扫单个来源；未知 id 直接报错（不再静默全扫） |
| `--drain` | 抬批次上限，补传整个积压 |
| `--no-sessions` | 只上报小时桶，跳过会话元数据 |
| `--publish-account` | 本地发布账户级来源（cursor / trae-cn） |
| `--all-local-sources` | 连后台来源一起扫 |
| `--auto` | 自动档：认暂停标志与云端同步开关 |
| `--from-notify` / `--from-openclaw` / `--from-retry` / `--from-scheduled` | 触发标记（hook / 计划任务用） |
| `--wait-for-lock` | 遇并发 sync 等待而不是跳过 |
| `--background` / `--lightweight` | 精简扫描档 |
| `--repair-grok` | 从会话快照重建 Grok 行 |

可用 `--source` id 见 `tokenusage sync --help` 的来源清单。
</details>

<details>
<summary><code>upload</code> / <code>reconcile</code> / <code>status</code> / <code>doctor</code> / <code>diagnostics</code> / <code>sessions</code> / <code>device-login</code></summary>

| 命令 | 参数 |
|---|---|
| `upload` | `--drain` / `--force`（抬批次上限、忽略冷却）、`--json` |
| `reconcile` | `--days <n>`（默认 7，上限 366）、`--from` / `--to`（UTC 日历日，裸日期含当天整天）、`--limit <n>`（1–2000）、`--json` |
| `status` | `--diagnostics`（含路径 / 光标 / WSL·Kiro 探针）、`--json`、`--light`（无 ANSI 的 ASCII 表）、`--limits`（各家配额面板，会读本机凭据并访问厂商 API）、`--no-spinner`、`--probe-keychain` / `--probe-keychain-details`（macOS） |
| `doctor` | `--json`、`--out <file>`、`--base-url <url>` |
| `diagnostics` | `--out <file>` |
| `sessions` | `--from` / `--to`、`--format json\|csv`（或 `--csv`）、`--out <file>`（原子写，0600）、`--refresh`、`--no-git` |
| `device-login` | `--json`、`--base-url <url>` |
</details>

### 只补传积压、不重扫本地日志

```bash
tokenusage upload            # 刷队列（默认最多 5 批，每批 200 条）
tokenusage upload --drain    # 大积压补传（最多 100 批）
tokenusage upload --json     # 结构化结果，便于脚本消费
```

### 对账（只读，不上传、不改队列、不动上传 offset）

```bash
tokenusage reconcile                     # 最近 7 天
tokenusage reconcile --days 30           # 最近 30 天（上限 366）
tokenusage reconcile --from 2026-10-25 --to 2026-10-31   # UTC 日历日，--to 当天整天包含
tokenusage reconcile --json              # 结构化漂移明细，供脚本/看板消费
```

- 基线就是 `sync` / `upload` 会发出的同一批行：整份 `queue.jsonl` 按
  `(hour_start, source, model)` last-wins，读时同样经过 legacy 修正与 ingestion 形状归一。
- 漂移分三类：`missing_on_server`（本地有、云端没有，通常是待补传）、`server_only`
  （云端有、本地已无，队列被裁剪或换过机器身份）、`mismatch`（同键不同值，附逐字段
  `local → cloud` 差异）。任一存在即以退出码 `1` 结束，便于 cron / CI 判定。
- `queue.state.json` 偏移之后的本地桶记为 **pending**（尚未上传，云端只可能持有更早的值），
  单独列出、不计入漂移、不触发退出码 `1`；`tokenusage sync` 传完后重新对账即可比对这些键。
  `--json` 里对应 `upload_offset`、`counts.pending` 与 `pending[]`。

## `sync --watch`：常驻自动上报

```bash
tokenusage sync --watch                          # 默认每 15 分钟一轮
tokenusage sync --watch --interval 300000        # 每 5 分钟一轮
tokenusage sync --watch --interval 3600000 --no-sessions   # 每小时，只传小时桶
```

- `--interval` 毫秒，最小 60000（小于该值回落到默认 15 分钟——每轮至少要跑一次本地扫描，过密无意义）。
- **停止**：在运行的终端 Ctrl+C 即可；`--watch` 只是前台进程，不注册任何系统计划任务/守护。随时终止都安全——队列与水位都已落盘，下次 `sync` 从断点继续。
- 每轮增量：首轮解析全部历史日志（可能较慢），之后只重扫有变化的文件；上报侧队列 offset + 会话水位双断点，多轮之间不重不漏。
- 失败退避：连续失败按 1x → 2x → 5x 拉长间隔（stderr 提示原因），成功一次即回到正常间隔——服务端抖动时不会持续敲。

## 采集控制：pause / resume 与计划任务

```bash
tokenusage pause            # 暂停自动采集（定时任务 / hook / --watch 全部静默停手）
tokenusage resume           # 恢复
tokenusage status           # 查看当前采集状态
```

- 暂停是持久标志：`sync --auto`、hook/notify 触发、`--watch`、定时任务都会静默
  退出（不报错、不上报、不留运行记录）；**手动 `tokenusage sync` 永远可用**。
- init 会在系统里注册每小时自动采集，按平台分发；pause/resume 顺势停用/启用它，
  `uninstall` 一并删除调度项与脚本。任务以 `--from-scheduled` 运行：运行记录标记
  为"定时"并写入滚动日志。

  | 平台 | 调度形态 |
  |---|---|
  | Windows | 计划任务 `TokenUsageSync`（`schtasks /Create /XML`，隐藏窗口 VBS 启动，登录后可用、错过启动会补跑、失败重试 3 次、无执行时限） |
  | macOS | launchd `~/Library/LaunchAgents/com.token-usage.sync.plist`（`StartInterval` 3600 + `RunAtLoad`） |
  | Linux | systemd user timer `token-usage-sync.timer`（`Persistent=true`，开机/错过补跑） |
  | 其他 | 不支持原生调度，请用 `tokenusage sync --watch` 常驻或手动 `sync` |

- 自动采集的日志落在 `~/.tokenusage/tracker/logs/sync.log`（**JSONL**：每行
  `{ts,msg,...}`，带 `phase` / `status` / `parsed_files` / `buckets` / `inserted` /
  `skipped` / `pending_bytes` 等字段，方便 `jq` 过滤；1 MiB 滚动一代），不依赖终端
  重定向。前台终端输出仍是人类可读行。

## 运行记录上报

每轮 sync 结束后（**空跑也算**），CLI 向服务端上报一条聚合运行记录：时间、触发
方式（定时/手动/常驻/通知）、结果、耗时、解析文件数与上报量。仪表盘的
"采集记录"页用它展示采集器健康度——空跑记录就是"活着"的心跳。

- 内容只有聚合计数与版本字符串，无任何路径/标题/正文。
- 上报尽力而为：失败只记本地日志，绝不影响用量数据采集。
- 不想上报：`tokenusage init --run-report=off`（重跑 init 修改，配对不受影响）。

## 未配对时会发生什么

CLI 未配对也能正常用，只是**降级为“只采集、不上报”**：

- `sync` 照常解析并入队，上传步骤提示 `skipped (no device token)`；数据留在本地队列，**不会丢**——配对后下一次 `sync --drain` 自动补传全部积压。
- `sync --auto`（hook 触发的静默档）静默等待令牌，按重试调度挂起。
- `status` / `doctor` 正常运行，令牌缺失显示为 warn。
- 服务端零暴露：没有配对令牌的请求一律 `401`，未配对机器读不到任何数据。

所以先装 CLI、后配站点（甚至先本地攒数据）是合法路径；配对完成那一刻，积压数据自动补传。

## 隐私边界

上报内容只有**聚合用量**：

- 小时桶：每工具每小时六项 token 计数、模型名、项目名（basename），以及积分（仅积分制来源上报，如 Qoder；独立维度，不参与 token 与成本口径）。
- 会话元数据：`session_id`（厂商会话 UUID，或无 UUID 来源的本地稳定指纹）、来源、起止时间、项目 basename、token 拆分、每模型用量、积分（仅积分制来源）。

**永不上传**：prompt / 助手正文 / 工具参数 / 命令输出 / diff / 会话标题 / 本地绝对路径 / resume 命令。测试（`test/session-upload.test.js`）用字段白名单锁定该边界。

CLI 不发送匿名安装心跳，也不做任何第三方错误上报：上游的 `tokenusage-telemetry` 端点在自托管后端从未实现（0.2.3 移除）；从未接线的 Sentry SDK 也已在 0.2.6 删除。除你自己配对的实例外，CLI 不向任何第三方发送数据。

## 数据目录

`~/.tokenusage/`（`0700` 目录 + `0600` 文件）：

| 文件 | 用途 |
|---|---|
| `tracker/config.json` | 配对与运行配置（base URL、设备令牌、机器 id） |
| `tracker/app/` | 自包含运行时副本（`.runtime-ready` 记录版本） |
| `tracker/queue.jsonl` / `queue.state.json` | 上传队列与上传 offset（对账基线） |
| `tracker/project.queue.jsonl` | 项目级队列（`project_key` 分桶） |
| `tracker/cursors.json` | 各来源增量光标 |
| `tracker/session-upload-watermarks.json` | 会话上报增量水位 |
| `tracker/upload.throttle.json` | 上传节流状态 |
| `tracker/logs/sync.log` | 自动采集滚动日志（JSONL） |

暂停标志另存。与旧版 tokentracker CLI 的 `~/.tokentracker/` 互不干扰，迁移期两套 CLI 可在同一台机器共存。

## 自包含运行时副本（0.2.4+）

init 会把当前 CLI 及其依赖闭包复制到 `~/.tokenusage/tracker/app`，并写入
`.runtime-ready`（版本 + 安装时间）。计划任务 / notify / hook 优先启动已安装包；
包路径失效时（典型是 nvm-windows 切换 Node 版本后全局前缀变化）自动回落到副本，
小时任务不再 `file not found`。副本先复制到 `app.new` 暂存，`require` 全部直接
依赖且 `--version` 实跑通过后才替换并写标记；没有标记的副本不会被任何自动采集
入口使用。

升级 CLI 或切换 Node 版本后重跑一次
`tokenusage init --yes --no-integrations --no-open` 刷新副本；`tokenusage doctor`
的 `runtime.copy` 检查会报告副本缺失、缺标记或版本落后，`uninstall --purge`
连同数据目录一并清理。

## provider 支持面

解析器随上游全量保留（仅未配置对应工具时休眠不扫描）。**完整来源清单以
`tokenusage sync --help` 为准**（当前 46 个本地来源 + 5 个后台来源）；操作者实际启用面
以 `tokenusage status` 为准，未使用的解析器不产生任何上传。

注：`cursor` / `trae-cn` 为账户级来源，会话元数据不会为其上传（服务端契约亦整段跳过）。

## 开发

```bash
pnpm install            # 仓库根
pnpm --filter tokenusage-cli test
```

发布走仓库的 `cli-v*` tag 触发的 GitHub Actions（Trusted Publishing，见
[CLI 发版手册](https://github.com/baiwumm/token-usage/blob/main/docs/cli-release.md)）。
