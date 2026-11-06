# Changelog

本包（`tokenusage-cli`）的用户可见变更记录。发版时在顶部新增一节，
`## <版本号>` 行会被 release workflow 取作 GitHub Release 正文。

> 0.4.x 之前的条目为压缩摘要；细节与当时的验收记录见 `docs/cli-release.md`
> 与 `docs/archive/`。

## 0.5.0

2026-11-06。定价数据刷新 + WorkBuddy 项目归属 + 仓库地址上报（契约 v3）。服务端需先部署项目仓库
接口（`token_project_repos` / `ingest` 的 `projects` 字段）；旧服务端下仓库上报按「未支持」跳过，
其余功能不受影响。

- **定价数据重建**：两份 `seed-snapshot.json`（web + CLI）从 LiteLLM 上游重新生成
  （`generated_at` 2026-05-26 → 2026-11-06，2284 → 3930 个模型：新增 1996 / 删除 350 /
  调价 264）。费用在读取时现算，历史费用会随新价目变化。
- **WorkBuddy 项目归属**：项目 pass 与总量 pass 使用同一模型表达式，项目桶因此能与小时桶
  同键拆行（项目行 + 未归因余量）。状态新增 `projectAttributionVersion: 2`：升级后第一次
  同步只重扫 WorkBuddy 的项目游标并丢弃无 model 的旧项目桶，总量游标与对账基线不变，
  历史由项目 pass 自行回填。
- **仓库地址上报（契约 v3）**：`ingest` 新增可选 `projects` 数组。CLI 只上报 github.com /
  gitee.com 的规范地址，按 `project.repos.state.json` 的已确认状态差量上报；`null` 清除
  本设备此前上报的值；未确认（旧服务端的 400 / 404 / 405）视为未支持，条目留待下次同步。
  上报失败只记日志，不影响本次同步结果。
- **文档修正**：契约 §2.4 的归因覆盖表（WorkBuddy 已覆盖、`dsh` 未覆盖）；`/projects`
  口径说明不再引用过时的 77%；部署指南补充 0.5.0 的收益说明。

## 0.4.7

2026-11-05。CLI 输出面批次，零契约变更，服务端无需同步升级：命令自报设备身份 + 采集结果摘要补全。
一个账户有两台采集机（家机 / 公司机），而 `status` / `sync` 的输出正是被贴进发版清单与工单的
那段文字——以前它从不说「我是哪台机器」，也不说「传了多少 token」，于是「本机」与「另一台」
在文档里混成一团（`docs/cli-release.md` §四与§五之间「本机」的指代就翻转过一次）。

- **每条命令自报设备身份**：`status` / `sync` / `upload` / `reconcile` / `doctor` / `init`
  的文本输出都带一行 `- Device: <hostname> #<machine_id 前 8 位> (id <device_id>)`，未配对时
  显示 `(not paired)`；`reconcile` 另加 `Local device:` 与 `Cloud device:` 并列。
  设备名规则与契约 `docs/cli-contract.md` §2.2 一致（打印的是**默认名**；仪表盘里改过的
  云端当前名不改变这个稳定标识）。
- **`status --json` 新增 `device` 块**：`name` / `hostname` / `machine_id` / `device_id`；
  `--light` 表格新增 `Device` 与 `Device ID` 两行。
- **`doctor` 新增 `runtime.device_identity` 检查**：有 `machine_id` 记 OK，缺失记 warn；
  检查项数由 15 增至 16。
- **`sync` 摘要补全**：新增 token 数（`Uploaded: 2 rows (23,604,640 tokens), 0 skipped`）、
  会话数、积分、耗时、失败原因；会话上传原本单独打一行且排在汇总之前，现并入汇总。
  摘要抽成纯函数 `buildSyncSummaryLines` 以便单测。
- **数字统一千分位**：文件数 / 行数 / token 数按 `1,234` 输出。
- **自动运行日志**：`sync.log` 的 JSONL 补 `tokens` / `credits` / `sessions_uploaded` /
  `sessions_skipped` / `duration_ms` 字段（纯追加，不改既有字段）。
- **`upload` 命令**：加 `- Device:` 与 `- Credits in this upload:`。
- **身份种子回退**：`uninstall --purge` 删掉 `~/.tokenusage` 后，purge 存活的
  `~/.config/tokenusage/machine-id` 仍能恢复 `machine_id`，命令依旧认得出这台机器。
  身份计算全程只读，不生成也不改写 id。

## 0.4.6

2026-11-05。上游对齐补丁 + 限额面板落地：Cursor cache-only 行、Qoder credits/准入/时间戳、
Trae CN 双目录，Qoder Desktop 0.4.x 的限额改读本机 `main.log` 快照（带 provenance），
`status --limits` 首次把 18 家限额读数暴露出来。无契约变更，服务端无需同步升级。

- **Cursor 准入按 token 分量判断**：CSV 行改用 input / cache write / cache read / output 四列
  判断是否有用量，`Total Tokens=0` 的 cache-only 行不再被丢；0-token request-only 行仍按
  A8 决策不入库（会把 bot/automation 计成对话、凭空造出活跃日）。
- **Qoder credits 与准入**：credits 取 `credits` / `original_credits` 较大值；`billable:false`
  但 credits>0 的 0.4.x 行不再被丢；坏时间戳（> 8.64e15）按行丢弃，不再中断整源。
- **Trae CN 账户级目录**：同时发现 `TRAE SOLO CN` 与 `Trae CN`，优先已安装目录。
- **Qoder Desktop 0.4.x 限额快照**：扫 `main.log` 的 `[Auth] [AccountUsage]` 摘要
  （bundle-id 与旧 `Qoder[CN]` 两种布局、单文件逆向 8 MB 分块、7 天新鲜度、跨文件取最新行、
  旧 `renderer.log` 保留为回退），`cached_at` 记录快照自身观测时间而非读取时间。
- **`status --limits`（新增）**：opt-in 渲染 18 家 provider 的限额行（plan + 各窗口 +
  credits + provenance 的 source/stale/年龄），`--json` 输出 `limits` 键；默认 `status`
  仍是纯本地快路径。
- **文档校正**：Cursor CSV 的 Cost 列实际未接线（成本仍按 token × 定价估算），
  `docs/sources-capture-audit.md` 里 reported-first 的错误表述已改正。
- 回归测试：`qoder-log-limits`（7 例）、`status-usage-limits`（5 例），CLI 共 244 例全绿。

## 0.4.5

2026-11-04。一轮审计修复：`sync` 读队列时把契约 v2 的项目拆分行压回余量行、随后照旧推进
上传偏移，被归因的用量会永久丢失；上传确认、Windows 隐藏启动器编码与首同步统计也各有一处
缺陷。无契约变更，服务端无需同步升级。

- **队列批次不再丢项目行**：`readQueueBatch` 的去重键原来只有 `source|model|hour`，
  契约 v2 的拆分行（同键不同 `project_key`）会被合并成余量行并随偏移推进永久丢失；
  现键含 `project_key`，每行独立上传。
- **拆分行按服务端 basename 身份合并**：写出/合并项目拆分行时统一走共享的
  `lib/project-key.js`（`basenameKey()`），与服务端请求去重口径一致；同名不同 owner 的
  仓库不再互相覆盖。`reconcile` 对旧的 `owner/repo` 行做同样的归一，避免把正常数据报成漂移。
- **上传确认后才推进进度**：`ingest` 需响应含 `inserted` + `skipped`、session 上传需含
  `sessions_upserted` + `sessions_skipped`，才推进队列偏移 / watermark；未确认的 2xx
  响应按失败处理，下次 `sync` 重传而不是静默跳数据。
- **Windows 隐藏启动器改 UTF-16LE + BOM**：`run-sync-hidden.vbs` 按 wscript 期望的编码
  写入，含非 ASCII 字符的安装路径不再乱码或被截断。
- **首同步统计修正**：`init` 的首次同步统计跳过 `kind` 控制行，并把 `project_key` 纳入
  last-wins 键，项目用量不再被余量行盖掉。
- 回归测试：拆分行往返、basename 归一、VBS 编码、未确认 2xx 不推进偏移/watermark。

## 0.4.4

2026-11-04。契约 v2 落地：小时用量桶按项目名拆行（`project_key`），项目键向上回退到真实
项目目录；新增 DeepSeek 余额/状态卡、`status --json` 的计价出处块、`doctor` 计价覆盖自检；
curated 定价扩到 191 条，Cursor / Kimi / Grok 限额卡补磁盘缓存回退。旧 `tokentracker-*`
别名已在服务端移除，仍打旧路径的钉版客户端会得到有声失败（GET 404 / 写动词 405），本地队列不丢。

- **服务端 breaking：旧 `tokentracker-*` API 路径别名已移除**（契约 §1.5，2026-11-03
  操作者拍板）。指向本后端的钉版旧 CLI（tokentracker-cli@1.4.x）上传会得到
  GET 404 / 写动词 405——有声失败、本地 `queue.jsonl` 数据保留，升级到本包后随下次
  `sync` 补传，不丢历史。
- **桶级 `project_key`（契约 v2，2026-11-03）**：小时用量桶按项目名拆行——每个项目一行，
  再加一条 `project_key` 为空的余量行，两者相加等于原聚合值，不重复计数；无法归因的
  历史/账户级用量留在余量行（契约 §2.4）。
- **项目键父级回退（2026-11-04）**：`projectKey()` 不再把 `<repo>/.claude/worktrees/<id>`、
  `<repo>/worktrees/<id>`、`<project>/<session>/subagents` 这类工具目录当成项目名，而是向上
  取真实项目目录；qoder-cn 子代理转录继承记录里的 `cwd`。只影响新采集——历史键不回填
  （会话落库键含 `session_id`，同会话只更新不改名）。`~/.codex/worktrees/<id>` 无上游项目
  规则，保持旧行为。
- **新增 DeepSeek 余额卡与 DeepSeek 服务状态**：`status` 限额面板新增第 18 家提供商
  （pay-as-you-go 余额，含 12h TTL 磁盘缓存与 API key 指纹绑定，凭据错误不回退缓存），
  服务状态探测接入 status.deepseek.com。
- **`status --json` 暴露计价数据出处**：新增 `pricing` 块（数据来源、seed 快照日期、
  LiteLLM/curated 条目数），成本为 0 时可直接区分「未采集」与「未定价」。
- **`doctor` 新增计价覆盖自检**：近 7 天本地队列的桶/token 计价命中率、Top 未定价模型
  （零 token 的积分桶单独计数、不再误报），以及 unknown 模型「对齐到同时段主导模型」的
  只读 dry-run 预览（不改变任何历史归属）。
- **计价覆盖大幅扩充**：curated exact 91 → 191。同步上游新增的 29+9 条
  （claude-opus-4-5/4-6、gpt-5.4/5.5 系、kimi-k3.1-pro 等）；从参照项目选摘
  volcengine/alibaba-cn/xiaomi/muse 四组 69 条（署名见 `THIRD_PARTY_NOTICES.md`）；补
  Unisound `u2-flash` 与 StepFun `step-5-preview` 官价。本机 7 天窗口 token 计价覆盖率
  97.3% → 100%。
- **Cursor / Kimi / Grok 限额卡新增磁盘缓存回退**：请求超时或 5xx 时展示最近一次成功
  读数（卡片标 `stale` + 原 `cached_at`），不再整卡空白。缓存文件各为
  `cursor/kimi/grok-usage-limits-cache.json`（`~/.tokenusage/tracker/`，0600 原子写、
  只在成功时写、reset_at 已过期的窗口自动丢弃）；身份指纹绑定（cursor=规范
  userId、kimi=profile 标识、grok=JWT sub），换号不串用；凭据类错误（401/403/过期）
  不回退、原样上面板。**全部 limits 磁盘缓存的 stale TTL 统一为 12h**（含既有的
  claude/codex/opencodeGo/antigravity/qoder 五家与 DeepSeek 余额卡——额度/余额类读数
  一天内即过时；qoder 促销活动缓存 24h、opencodeGo 本地估算缓存 1h 属不同语义，不动）。
- 单测：`pricing-parity`（CLI/web 两份定价数据逐字节一致守卫）、`pricing-meta`、
  `pricing-coverage`、`deepseek-limits` / `deepseek-status`，以及
  `cursor/grok/kimi-limits-cache-fallback`（命中/过期/失败回退/换号不串用/凭据错误直通/
  无缓存失败，共 22 例）。

## 0.4.3

2026-11-01。两处只有真机首跑才暴露的问题：调度摘要依旧看不出拒绝原因（修的过程中又追出
一层 Windows 控制台代码页乱码），`reconcile` 把「还没上传」的桶报成漂移。

- **调度降级原因改取子进程输出**：`execFileSync` 的 `error.message` 以命令回显开头
  （`Command failed: schtasks /Create /XML C:\Users\...`），0.4.2 打印第一行时正好把
  真正的 `ERROR: Access is denied.` 挤出 200 字符窗口。现在优先读 `stderr` / `stdout`，
  再退回 message，统一折成一行（Windows / macOS / Linux 的注册、启停、卸载错误文案
  共用这一处）。
- **Windows 控制台代码页不再乱码**：只取 stderr 后又暴露一层——中文 Windows 的
  `schtasks` 按控制台代码页（936/GBK）写字节，Node 按 UTF-8 解出来是
  `: ܾʡ`。现按 `chcp.com` 报告的活动代码页（932/936/949/950）回退
  `TextDecoder` 重解，解不通才回到原 UTF-8 文本；65001 与单字节页原样直出。
  zh-CN 非提升 shell 下现在的摘要就是可读的 `错误: 拒绝访问。`。
- **`reconcile` 区分 pending 与 drift**：`queue.state.json` 上传偏移之后的本地桶记入
  `pending`，不计入漂移、不触发退出码 1——真机 `init` + 首跑曾报 5 个「漂移」，实际只是
  队列尾部尚未上传，一次 `sync` 后全部匹配。`--json` 新增 `upload_offset`、
  `counts.pending` 与 `pending[]`；真实漂移仍照常报出并退出 1。
- 单测：stderr 优先 / 多行折叠 / 超长截断、GBK 字节解出可读文本与解不通时回退、
  pending 分类、缺 `queue.state.json` 时全部按 pending、以及已上传行的真漂移仍失败
  （`test/scheduled-task.test.js`、`test/reconcile.test.js`）。

## 0.4.2

2026-11-01。`init` 的调度摘要不再只写 `degraded: xml_rejected`：现在把被拒的第一行原因
（如 `ERROR: Access is denied.`，超过 100 字符截断）一并打印，用户能据此判断是「需要
管理员权限」还是「任务定义本身有问题」。Windows：非提升 shell 下 `schtasks /Create /XML`
必然 `Access is denied`，降级路径照旧每小时采集（隐藏窗口）；要启用 catch-up / retry /
无执行时限，需以管理员身份重跑 `tokenusage init`。单测覆盖原因可见与超长输出截断。

## 0.4.1

2026-11-01。修复 `tokenusage reconcile` 在真实队列上的误报：队列行写的是
`conversation_count`（契约 §2.4 的线名），小时表列名是 `conversations`，按字段名直接比较
会把每一行都报成 `conversations local 0 → cloud N`（本机首跑 41/43 行误报）。现在按别名
归一后比较，真实差异仍照常报出。会话数比较读 `conversations`，缺失时回退
`conversation_count`（两者都没有按 0）。

## 0.4.0

2026-11-01。错误提示更友好（一行 `Error:` + `Hint:` 且不再刷堆栈），帮助信息改为
命令表驱动，新增 `upload` / `reconcile` 两条命令，`init` 可按工具挑选要接管的集成，
自动采集在 macOS / Linux 也改用系统原生调度；包内不再携带从未接线的本地服务模块。

- **用户输入错误统一为 `UsageError`**：未知命令 / 未知参数 / 非法取值只打一行
  `Error: ...` 加 `Hint:`，退出码 2，不再刷堆栈；`--debug` 才展开。
- **命令表驱动 help**：`tokenusage help <cmd>` 与 `tokenusage <cmd> --help` 对每条
  命令都有效，未知命令抛 `UNKNOWN_COMMAND`。
- **新增 `tokenusage upload`**：只刷本地队列、不扫描来源（`--drain` / `--force`
  抬批次上限，`--json` 输出结构），与 `sync` 共用 `drainQueueToCloud` 与
  `sync.lock`；`sync --upload-only` 为同一实现的别名。积压较多时不必再等全量扫描。
- **`--source` 严格校验**：非法 id 直接报错并列出可用列表（此前静默降级为全量扫描，
  容易误以为只采了某个来源）。
- **`sessions` 严格解析**：未知参数、缺值、非法 `--format` 均报错；`--out` 改为
  原子写（0600），避免脚本拿到半截 JSON / CSV。
- **`--watch` 失败退避**：连续失败按 1x → 2x → 5x 拉长间隔并在 stderr 提示，
  成功一次即归零；此前固定间隔会持续打服务端。
- **`init --integrations <ids|all|none>`**：可只接管部分集成；不带该参数时在交互
  确认里提供多选（空格切换 / `a` 全选 / `n` 清空），`--no-integrations` 仍等于
  `none`。12 个 hook 型集成逐个 gate，被动读取器不受影响。
- **移除浏览器登录期死参数**：`--email` / `--password` / `--device-name` /
  `--link-code` / `--no-auth` 改为报错并指向 `device-login`。
- **调度多平台**：Windows 计划任务改用 `schtasks /Create /XML` 定义
  （`StartWhenAvailable`、登录触发、失败重试 3 次、无执行时限；XML 被拒时回退
  `-SC HOURLY`）；macOS 用 launchd（`com.token-usage.sync`）；Linux 用 systemd
  user timer（`token-usage-sync.timer`，`Persistent=true`）。`pause` / `resume` /
  `uninstall` 走同一分发层。
- **`sync.log` 改 JSONL**：`{ts,msg,...}` 每行一条，带上 `phase` / `status` /
  `parsed_files` / `buckets` / `inserted` / `skipped` / `pending_bytes` 等结构化
  字段；TTY 输出仍是人类可读行，1 MiB 滚动一代不变。
- **清理死模块**：删除从未接线的本地服务模块图（`local-api.js` 与 18 个可达性为零
  的模块，约 550 KB），`normalizeQueueRow` 抽到 `src/lib/queue-row-normalize.js`
  并补空值守卫。
- **打包收紧**：`files` 去掉 `test/`；`test/packaging.test.js` 新增两条守卫——
  已退役模块不得回归、`src/` 内每个文件都必须能从 CLI 入口可达。
- **新增 `tokenusage reconcile`**（只读对账）：把本地 `queue.jsonl` 的 last-wins
  基线与云端**本设备**的桶明细按 `(hour_start, source, model)` 逐键比对，输出
  `missing_on_server` / `server_only` / `mismatch` 三类漂移（mismatch 附逐字段
  `local → cloud`），任一存在即退出码 1。窗口默认最近 7 天（`--days`，上限 366），
  也可 `--from` / `--to` 指定 UTC 日历日（`--to` 含当天整天）；`--json` 输出结构化
  明细。命令不上传、不改写队列、不动上传 offset，后端读取面为
  `GET /api/functions/token-usage-reconcile`（契约 §2.13）。
- 测试 76 → 130 条（新增 `cli-dispatch` / `args-strict` / `scheduled-task` /
  `queue-row-normalize` / `integration-gate` / `reconcile`）。

## 0.3.0

2026-10-31。新增三个采集来源/维度，修复 Windows 下 Qoder 会话的发现与口径问题。

- **Trae CN 本地库接入**：`resolveTraeDbPaths` 新增 `Trae CN` 安装目录
  （与 `Trae` / `TRAE SOLO` 同 schema，共享应用密钥直接解密）。此前国内版
  安装的整个本地用量库被静默漏扫。
- **Qoder credits 维度**：Qoder 新版会话日志是 credits-only（token 全零），
  现按桶记录 `credits`（独立维度，不并入 token 列与成本）；会话级 credits
  随 sessions 上报；sync-run 遥测新增 `credits_ingested`。
- **Qoder 会话进入 Sessions**：新增 qoder / qoder-cn 会话清单读取器
  （一文件 = 一会话），并应用与桶解析器一致的 billable 门槛——
  `billable:false` 行是未扣费理论值（实测占总量 81%），不计入消耗。
  `SIDECAR_VERSION` 随之重建一次 sidecar。
- 模型口径：读侧按 model 小写折叠分组（大小写漂移不再拆行），展示名取
  组内 token 份额最大的写法。
- 采集期修复：会话清单缓存签名纳入 qoder 文件（否则永远复用旧 sidecar）；
  `listRolloutFilesDeep` 为异步且只认 `rollout-*` 文件名，qoder 改用专用
  `.jsonl` 深遍历。

## 0.2.6

2026-10-30。移除从未接线的错误上报 SDK，安装体积与运行时副本明显变小；采集行为不变。

- 删除 `@sentry/node` 与 `src/lib/sentry.js`、`src/lib/telemetry-pref.js`：
  CLI 只在启动时 init 了 Sentry，`captureException` 没有任何调用点，实际从不上报；
  但它在运行时副本里占 44 MB（67.5 MB 的约 65%），全局安装还带入
  `@sentry/bundler-plugins` 的构建期依赖链（安装总量 93.1 MB 中约 59 MB）。
  移除后运行时副本 22.9 MB（实测 462 个文件）、干净 prefix 安装 23 MB。
- `bin/tokenusage.js` 未捕获异常的兜底里还留着一个 `require('../src/lib/sentry')`
  （包在 try/catch 里，删模块后永不生效的残留）；一并删除，守卫测试改为同时扫描
  `src/` 与 `bin/`。
- README 隐私边界同步：CLI 不做匿名心跳、也不做任何第三方错误上报。
- 新增 `test/packaging.test.js` 守卫：`@sentry/*` 不得重新出现在依赖或源码中；
  运行时副本回归测试改用 `yauzl` 的传递依赖 `pend` 验证扁平闭包复制。

## 0.2.5

2026-10-30。0.2.4 验收后的小修：去掉安装警告、修正初始化重复文案，并补 Windows CI。

- 移除 `@mongodb-js/zstd` 与两处 Node 20 zstd 回落分支：包 `engines` 已是
  `>=22.19`，`node:zlib` 自带 zstd。`npm i -g` 不再出现 `prebuild-install`
  弃用警告，运行时副本也少一个 native 依赖。
- 修 `init` 跳过行重复文案与 `--dry-run` 收尾的重复行。
- CI 新增 `windows-latest` job：跑 CLI 测试 + `init --dry-run` 烟测并断言
  输出不含 `Skipped - Skipped`，避免 VBS / 入口类回归只靠发版前人工验收。

## 0.2.4

2026-10-29。计划任务抗 Node 版本切换 + 自检一次性收口的采集可靠性修复。

- 0.2.3 的隐藏 VBS 把 npm 全局前缀里的包路径写死，而 nvm-windows 的全局前缀按
  Node 版本分目录。`nvm use` 之后该路径消失，任务每小时以 "file not found" 失败
  （`LastTaskResult` 非 0、日志停更），而任务本身看起来仍"已注册"。VBS 现在先
  `FileExists` 探测包路径，缺失时回落到 init 复制到数据目录的自包含运行时。
- 运行时副本改为"依赖闭包"复制（旧实现整目录 `fs.cp`，在 pnpm 安装下只复制到
  junction 链接，副本一跑就是 `Cannot find module`），并先复制到 `app.new` 暂存
  目录、**实际启动一遍**通过后才替换并写 `.runtime-ready` 标记。
- notify / OpenClaw hook / 自动重试脚本统一按"带标记的副本 → 已安装包入口 → npx"
  三级选择启动器。
- `tokenusage doctor` 新增 `runtime.copy` 检查；`init` 复制失败不再静默；
  `uninstall` 一并清理暂存目录 `app.new`；后台 spawn 全部加 `windowsHide`。
- `sync --watch --interval=<毫秒>` 等号写法不再泄漏进 sync 参数（此前会被当成
  未知参数导致每一轮失败）。

## 0.2.3

2026-10-28。修复 0.2.x 计划任务的两个隐藏缺陷（0.2.2 升级验收时实测发现）。

- 计划任务指向错误入口：init 注册的隐藏 VBS 调用的是 `src/cli.js`——那是只
  导出 `run()` 的库文件、没有命令行入口，任务 0.1 秒内以退出码 0 结束，
  既不采集也不写日志。VBS 现固定指向包内 `bin/tokenusage.js`，并有回归测试锁定。
- 定时运行不落日志：所有自动风味运行（scheduled / hook / retry / watch）统一追加
  到滚动日志 `~/.tokenusage/tracker/logs/sync.log`。
- 品牌残留：init 启动横幅与 local-api 兜底设备名统一为 Token Usage，并加回归测试防回潮。
- 移除上游遗留的匿名安装心跳（`POST /api/functions/tokenusage-telemetry`）：
  本仓库契约与 Web 端都没有该路由，每次 sync 只会拿到 404 并进退避。
- 修正 `sync --watch --interval <ms>` 的非法值处理：该参数始终被剥离，并有单测覆盖。
- 署名与包元数据收敛：`description` 去掉 fork 字样；`THIRD_PARTY_NOTICES.md`
  只保留上游一节。

## 0.2.2

2026-10-27。新机初始化修复与采集口径修正。

- 修复严重初始化缺陷：从 npm 安装后 `tokenusage init` 必崩（包内缺少
  `bin/tracker.js`——fork 改名 bin 后安装器没跟着改，0.1.0 起所有已发布版本
  受影响；单测因跳过运行时拷贝未覆盖）。新增防回归测试直接执行运行时拷贝。
- init 新增 `--no-integrations`：只做扫描根配置、计划任务注册与运行上报，
  **不改动任何 AI 工具的配置**。
- init 的欢迎屏与完成屏改为显示真实站点地址。
- 计划任务运行的口径修正：改跑 `sync --from-scheduled`，运行记录正确标记为"定时"
  并写入滚动日志。

## 0.2.1

2026-10-27。修复 0.2.0 的严重回归：运行上报的版本号读取用了错误的相对路径
（`Cannot find module '../package.json'`），导致每轮 `sync` 启动即崩溃——定时与手动
采集全部中断。本地包实测通过后发布；并新增防回归测试，锁定嵌套模块的 package.json
require 深度。

## 0.2.0

2026-10-26。采集控制与运行记录：采集器从此可暂停、可审计。

- 新增 `tokenusage pause` / `resume`：一键暂停/恢复自动采集。暂停期间
  `sync --auto` / `--watch`（含通知触发）静默退出，手动 `tokenusage sync`
  不受影响；`status` 显示当前采集状态。
- `init` 接管 Windows 计划任务注册（默认经 VBS 隐藏窗口运行；`--no-task` 可跳过）；
  pause/resume 顺势启停任务；`uninstall` 一并清理任务与脚本。
- 同步日志改为滚动文件（`~/.tokenusage/tracker/logs/sync.log`，1 MiB 轮转一代）。
- 每轮 sync 结束后向服务端上报一条运行记录（时间、触发方式、结果、耗时、上报量），
  仪表盘新增"采集记录"页；空跑也上报，作为采集器心跳。不想上报可在 init 时
  `--run-report=off` 关闭。
- 正确性修复：zcode 恢复行补齐 billable/cost 字段；含 `|` 的模型名不再破坏
  用量桶键的往返解析；OpenCode 负 delta 不再产生负计数；`TOKENUSAGE_*`
  环境变量优先于旧 `INSFORGE_*` 名（旧名保留兼容）。

## 0.1.0

2026-10-24。首个公开发布版本：上游 CLI 采集端 fork，重接到 token-usage 契约。

- 设备流配对（`device-login`）、`init`、`sync`（含 `--watch` / `--drain`）、
  `status`、`sessions`、`doctor`、`diagnostics`、`uninstall`
- 会话上传走隐私白名单：只传聚合 token 数字，标题 / 路径 / 正文永不出本机
- 上传链路防毒行硬化：契约非法的用量桶 / 账户会话状态在出批前丢弃或修正，
  而不是让 ingest 边缘整批 400、队头永久停摆
- 请求日志降噪：`node:sqlite` 每次加载都打印的 ExperimentalWarning 不再
  混入重定向的同步日志
- 要求 Node ≥ 22.19（undici 8 的引擎下限；undici 仅用于代理支持）
