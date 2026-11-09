# 桌面端计划（`apps/desktop` · M-desktop）

2026-11-08 立项。本文是桌面端的架构与执行计划真源；里程碑顺序以 `docs/rewrite-plan.md` §5
为准，依赖预算以 `docs/rewrite-plan.md` §4 为准。方向决策经操作者拍板（2026-11-08），
改动需回写 §1 拍板记录。

## 1. 拍板记录（2026-11-08）

| # | 决策点 | 结论 |
|---|--------|------|
| 1 | 定位 | 托盘伴生工具（rewrite-plan §1#20 的既有框定）：CLI 的脸面——本机采集视角的实时监控台 + CLI 操作台；不复制 web 仪表盘 |
| 2 | 技术栈 | Tauri 2 + Vite + React 19 + HeroUI 3 + Tailwind 4（前端与 apps/web 同构；备选 Electron 否决：包体与常驻内存大一个量级，与「轻、自部署」气质不符） |
| 3 | 主题 | 浅/深/系统三态（web 口径；ui-spec「UI 基准」对桌面端 ThemeToggle 的预埋引用就此闭环）；系统跟随用 `prefers-color-scheme`，不引 next-themes |
| 4 | 云端数据 | v1 纯本地 + 浏览器跳转 web；不做 webview 嵌入登录态（后续可选，另行立项） |
| 5 | 平台顺序 | Windows 先行（两台采集机均为 Windows）；mac/Linux 由 Tauri 可出包但真机验证留待有机器 |
| 6 | CLI 增量 | v1 不加 `status --json`；desktop 解析 `logs/sync.log`（JSONL）+ 展示子命令文本输出；CLI 面 JSON 化列 0.6 候选、单独走依赖报批 |
| 7 | 代码签名 | 首版不上（EV 证书成本高）；SmartScreen 提示接受；D5 的 updater 签名密钥由操作者生成 |

## 2. 定位与分工

一句话：**本机采集视角的实时监控台 + CLI 操作台**。

| | web（apps/web） | desktop（apps/desktop） |
|---|---|---|
| 数据视角 | 账号级云端全景（所有设备） | 本机采集视角（`~/.tokenusage` 本地文件） |
| 数据面 | `/api/app/*` + 冻结契约端点 | 本地文件只读 + 子进程调 CLI，零网络 |
| 能力 | 趋势 / Sessions / 项目 / 成就 / 分享 | 今日用量、采集健康、一键 sync/doctor、通知 |
| 离线 | 不可用 | 可用（除跳转 web 外零网络依赖） |

## 3. 架构硬边界

1. **CLI 是唯一采集与上传引擎**：desktop 对 `~/.tokenusage` 全只读（字节偏移增量 tail，
   与 CLI 自身读法一致），绝不写队列/配置，避免抢锁与语义分叉。
2. **动作一律子进程调 `tokenusage` 子命令**（sync / status / doctor / reconcile / pause /
   resume / device-login…），desktop 不重实现任何解析、对账、上传逻辑；CLI 未装则引导
   `npm i -g tokenusage-cli`。
3. **零契约面**：desktop 不请求 `/api/functions/*`，不直连 Supabase，不把设备令牌带出 CLI
   数据目录；云端全景 = 浏览器打开 web。守住「CLI 版本 ↔ 服务端版本配对演进」不被新消费者破坏。
4. **本地不算成本**：定价引擎在 web 读取侧；desktop 只展示 token 数与来源构成，成本看 web。

## 4. 数据面（D2 起）

| 文件 | 用途 |
|---|---|
| `~/.tokenusage/tracker/queue.jsonl` | 本机小时桶 last-wins 基线 → 今日/本周 tokens、来源构成（口径与 AGENTS 约束 8 一致） |
| `…/project.queue.jsonl` / `…/session.queue.jsonl` | 项目/会话队列 → 后续可选展示 |
| `…/queue.state.json` | 上传偏移 → 队列积压健康 |
| `…/logs/sync.log`（JSONL `{ts,msg,...fields}`，1 MiB 滚动一代 `.1`） | 最近一轮 sync 结果/错误：`phase:"finished"` 行带 tokens / buckets / inserted / skipped / sessions_uploaded / pending_bytes / duration_ms 等结构化字段；错误行带 `error` 字段（`phase: upload` / `session-upload` 等） |

永不读取：设备令牌文件（cloud-device-token 存储）、provider key store、配对码。
配对状态（D3）只认 `tokenusage status --json` 的 `device_token_set` 布尔（经 `run_cli` 子进程，
CLI 自己的判定逻辑），webview 以 localStorage 缓存「这台机器配过对」以免每次启动跑
status；CLI 暂缺于 PATH 时由缓存决定，只有 CLI 的回答能把它翻回未配对。
窗口内容 zh-CN 单语（对齐 landing 的单语面；web 双语不强制桌面，如需 i18n 再立项）。

## 5. UI 规范落点与命名登记

- ui-spec 的 Design Tokens、组件规则（HeroUI 内置优先 / 复合结构 / 语义文本组件）、三态与
  响应式、数字格式全部沿用；「桌面端」节（窗口结构、托盘菜单规范）在 D2 动手时回写 ui-spec。
- **命名登记制**：desktop 组件文件遵循与 web 同一登记制、同一后缀集合（`<页名>-body.tsx` /
  `-skeleton.tsx` / `-strip.tsx` / `-card.tsx` / `-cards.tsx` / `-section.tsx` / `-bar.tsx` /
  `-row.tsx` / `-dialog.tsx` / `-header.tsx` / `-states.tsx` / `-icon.tsx` / `-note.tsx` /
  纯计算 `-helpers.ts` / `-filters.ts` / 钩子 `use-*.ts`；D3 起用 `-icon`（向导步骤徽记
  `step-icon.tsx`）与 `-note`（监控盘未配对说明块 `unpaired-note.tsx`），均属 AGENTS 共享集合）；
  新增后缀角色先回写本节再使用；跨页共享件放 `src/components/` 根；拆分目录用 `index.tsx`
  收口。D1 仅有入口件：`src/app.tsx`（根编排）与 `src/lib/` 纯逻辑、`src/styles/`。
- 字体：复用 web 的 Maple Mono CN 自托管子集（woff2 直接复制到 `public/fonts/`，零新依赖）。

## 6. 依赖清单（rewrite-plan §4 报批记录，2026-11-08 随技术栈拍板批准）

- 运行时：web 依赖子集 `react` / `react-dom` / `@heroui/react` / `@heroui/styles` /
  `@gravity-ui/icons` / `clsx` + 新增 `@tauri-apps/api`。
- devDeps：新增名 `vite` / `@vitejs/plugin-react` / `@tauri-apps/cli`；eslint / tailwind /
  prettier / typescript / vitest 组与 web 同版本；Tailwind 走 `@tailwindcss/postcss`
  （web 同款，不引 `@tailwindcss/vite`）。
- 不引入：`next` / `next-themes` / `recharts` / `motion` / `zustand`（桌面用不到的 web
  独有名一律不进）。
- Rust crate 走 cargo、不进 pnpm lockfile：`tauri` 2（`tray-icon` feature）+ `tauri-build`；
  依赖树披露随 D5 发版文档。

## 7. 环境前置（本机开发 / 真机验收）

- Rust stable（rustup，`x86_64-pc-windows-msvc` 工具链）+ MSVC Build Tools（C++ 工作负载）。
  两台采集机均已就绪（2026-11-09 公司机补装）：VS 2022 Build Tools 经 winget 装到
  `C:\BuildTools2022`（`--add Microsoft.VisualStudio.Workload.VCTools --includeRecommended`）；
  rustup-init 走清华镜像下载并以 `static.rust-lang.org` 的 SHA-256 校验，工具链安装时设
  `RUSTUP_DIST_SERVER` / `RUSTUP_UPDATE_ROOT` 指清华镜像；crates 走 rsproxy 稀疏索引
  （用户级 `~/.cargo/config.toml`，不进仓库）。装好后本地 `pnpm dev:desktop`。
- **1420 端口**（Tauri devUrl，`strictPort`）可能落进 Hyper-V/WinNAT 的动态保留段
  （`netsh interface ipv4 show excludedportrange protocol=tcp`；表现为 vite 报
  `EACCES ::1:1420`）。一次性修复（管理员）：`net stop winnat` →
  `netsh interface ipv4 add excludedportrange protocol=tcp startport=1420 numberofports=1`
  （TCP 保留表 v4/v6 共用）→ `net start winnat`；登记后显示为 `1420-1420 *`，WinNAT 不再
  划走它而应用仍可绑定。公司机 2026-11-09 已处理。
- WebView2 Evergreen：Windows 11 内置；异常兜底按 Tauri 官方 bootstrapper 处理。
- CI（Ubuntu）只跑 desktop 的 node 侧门禁（lint / tsc / test / build，并入根 `pnpm verify`）；
  Rust 编译门禁随 D5 发版流程进 Windows runner。

## 8. 里程碑

| 里程碑 | 内容 | 验收线 |
|--------|------|--------|
| **D1 立项与脚手架** | workspace 加 `apps/desktop`（Tauri 2 + Vite + React + HeroUI + Tailwind）；托盘（打开主窗口 / 退出）+ 主窗口骨架 + close-to-tray；`sync.log` 解析模块与测试（D2 数据面第一块）；图标生成脚本与资产；根 `pnpm verify` 并入 desktop lint/tsc/test/build；本文档 + AGENTS / rewrite-plan / requirements 回写 | 根 `pnpm verify` 全绿 + CI 绿；装好 Rust 后 `pnpm dev:desktop` 托盘可见、窗口关闭进托盘、托盘退出（真机项，待操作者） |
| **D2 本地监控盘** | 托盘菜单补全（今日 tokens、采集状态、Sync now、暂停/恢复、打开 web 仪表盘）；主窗口三段（顶部 strip：今日/7 天 tokens + 最近 sync 结果 + 队列体积行数；来源构成 mini 条 + 设备身份行；操作条调 CLI 展示摘要）；三态齐全；ui-spec 回写「桌面端」节 | 本地聚合与 queue.jsonl last-wins 口径一致；无 CLI / 无数据 / 错误三态齐全；离线可用；窄窗不横向滚动 |
| **D3 配对与引导** | 首启向导：检测 CLI → 引导安装 → `device-login` 开浏览器 `/device?user_code=` → 等待→已批准→首同步统计；复用 CLI 现有配对流，desktop 不碰令牌 | 新机器从装 desktop 到配对成功全程有引导 |
| **D4 通知与常驻** | 每日汇总通知、sync 连败/队列积压提醒（阈值可配）、自启动、单实例、ThemeToggle 三态循环与持久化 | 通知免打扰时段可配；reduced-motion 遵守 |
| **D5 发版** | Windows NSIS 安装包 + tauri updater（Ed25519 签名密钥操作者生成入 GitHub secret）；Rust 编译门禁进 CI（Windows runner） | 从 Release 下载安装 → 托盘出现 → D2/D3 功能真机全过 |

工期参考：D1 约 1 天，D2 约 3–5 天，D3 约 2–3 天，D4 约 2 天，D5 约 2 天；全程 Agent
开发，每个里程碑操作者验收后再进下一个。

## 9. 明确不做（防范围失控）

不复刻仪表盘图表全量；不做 Sessions / 成就 / 分享卡页；不做跨端偏好同步；不做 webview
嵌入云端登录态；不碰采集与上传逻辑；不新增契约端点；pet/quota 类桌面 widget 仍留在
requirements 边界表。

## 10. 验收记录

（随里程碑追加）

- **D1（2026-11-08 提交 `ed4e202`，2026-11-09 真机验收通过）**：脚手架与文档回写完成，
  根 `pnpm verify` 全绿；真机托盘四项全过（UIA 验收脚本，`$TEMP/zcode-scratch/`）——
  托盘可见（Win11 隐藏图标飞出层内 40×40 按钮）、关窗进托盘（WM_CLOSE →
  `IsWindowVisible=false` 且进程存活，隔离重测 3/3）、托盘唤窗（UIA InvokePattern →
  窗口复显）、托盘菜单退出（右键菜单 → 退出项 → 进程干净退出）。工具链落地：VS 2022
  Build Tools（`C:\BuildTools2022`，winget）+ rustup stable-msvc 1.99.1（TUNA 镜像；
  rustup 期间与并发任务抢锁导致一次半装状态，手动清理重装解决）+ cargo crates 走
  rsproxy（用户级 `~/.cargo/config.toml`，不进仓库）；`cargo check` / `cargo build`
  全绿零告警。
- **D2（2026-11-09 交付并验收）**：监控盘 UI 与数据面全量落地——`queue.jsonl` last-wins
  聚合（今日/7 天窗口）、`sync.log` 摘要与错误行、`pause.flag.json` 状态、`queue.state.json`
  待上传体积、config.json 白名单读取（baseUrl / dashboardUrl / machineId，deviceToken 与
  anon key 永不出 Rust）；托盘菜单补全（今日 tokens 与采集状态两行只读信息、立即同步 =
  `sync --auto`、暂停/恢复采集、打开 Web 仪表盘、退出）；主窗口三段 UI + 无 CLI/空态/
  错误三态。验收证据：CDP（WebView2 `--remote-debugging-port=9222`）DOM 断言——来源
  构成条宽与 share 逐行精确一致（57/19/17/4/3/2，0% 取 2% 下限），三卡为真实数据（近
  7 天 6.78 亿 / 4220 会话、待上传 0 B / 队列 358 KB）；Doctor 按钮端到端（run_cli 子
  进程 → `tokenusage doctor` exit 0 → 16 OK / 1 warn 结构化输出渲染）；截图目检通过。
  托盘 sync-now / pause-toggle 与 Doctor 共用同一 spawn 构造（`build_cli_command`），
  事件分发已由 quit / show 项实测证明。已知事项：debug 构建的 webview 指向 devUrl
  （须配 `pnpm dev` 使用，`pnpm dev:desktop` 即完整开发流），release 构建内嵌 dist
  （D5 发版形态）；Win11 新托盘图标默认收进隐藏图标飞出层，操作者可在任务栏设置里
  手动常驻。
- **D3（2026-11-09 交付，待操作者真机验收）**：首启配对向导落地。门控见 §4「配对状态」；
  未配对时向导取代监控盘，三步卡——① 安装 CLI（复制安装命令 / 重新检测 / 安装指南）
  ② 配对设备：Rust 托管 `device-login --json` 子进程（`device_login_start/_poll/_cancel`），
  authorize 回包在 Rust 读线程里白名单出 user_code + 验证链接，**`device_code` 不出 Rust**
  （持有者可在批准后轮询到新令牌）；自动开浏览器 `/device?user_code=`、配对码大字 + 复制 +
  15 分钟倒计时、重新打开批准页 / 取消；取消与托盘「退出」以 `taskkill /T /F` 杀整棵进程树
  （只杀 `cmd` 会把 node 孤儿留下继续轮询 16 分钟）；读管道按字节 + lossy 解码（`cmd` 自身
  报错为 GBK，按行 UTF-8 读会提前停读）③ 首次同步：批准后自动 `sync --auto`，统计取本轮
  起点之后的 sync.log 行——finished 行不吞掉同轮的上传错误（与监控盘「最近同步」口径不同，
  有意为之）。流程外可「稍后再说」（会话级跳过），监控盘页头下的「未配对」说明块可回到
  向导；终端里已配对可点「已配对？重新检测」放行。`run_cli` 白名单移除 `device-login`
  （`.output()` 会阻塞整个配对窗口，且重复拉起会抢 config.json）。验收证据：desktop 单测
  45 例（新增 `lib/pairing.ts` 21 例：status 解析、轮询状态机、倒计时、首同步归属）；
  vite dev + 按 Rust serde 实际 wire 形状写的 mock 桥，在 IAB 以 DOM 快照走通 安装检测 →
  申请码 → 批准 → 首同步 → 进入监控台、跳过 → 说明块 → 回向导、配对码过期失败、取消
  全部路径（调用序列逐条核对：浏览器只开一次、取消后不再轮询）；Edge 无头 CDP 截图浅/深
  7 态，400×620 均无横向溢出。过程中修复：Rust `expires_in` 序列化名与 TS `expiresInSec`
  不一致（倒计时会失效）、首同步统计格标签折行、「重新检测」后操作卡读到旧快照的 CLI 状态
  （`refreshCli` 改为同步写 ref + 紧跟 `refresh()`）。
- **D3 补充（2026-11-09 同日，公司机工具链落地 + 真机冒烟）**：① 公司机补齐环境——VS 2022
  Build Tools 17.14.44（winget → `C:\BuildTools2022`，VCTools + 推荐组件）、rustup
  stable-msvc 1.99.1（清华镜像下载 + 官方 SHA-256 校验；crates 走 rsproxy 用户级配置）、
  1420 端口从 WinNAT 保留段解出（§7 记录了可复用的修复命令）；② `cargo check` /
  `cargo build` 全绿零告警，`pnpm dev:desktop` 真机窗口起来；③ WebView2 CDP（9222）真桥
  冒烟全过：真实数据监控盘渲染（今日 1927.74万 / 7 天 6.74亿 / 待上传 0 B，qoder-cn 等
  credits-only 来源不再进 token 榜——`SourceMixCard` 过滤 `tokens<=0`，同批把 D2 手写卡片
  收编为 `Card` 复合结构并修页脚 nowrap 分段）；`run_cli` 白名单确认拒绝 `device-login`
  （"command not allowed"）；`device_login_*` 真实后端全链路——authorize 拿到真码
  （`XXXX-XXXX` 形态、`token-usage.baiwumm.com/device` 深链、`expiresInSec:900`）、
  64 位 hex `device_code` 与 JSON blob 均未出现在 webview 可见输出、运行中进程树为
  `cmd.exe+node.exe`、cancel 后两者皆清（无孤儿）、`running:false` + `code:null`；
  `update_tray` 推送桥实测可用。close-to-tray / 托盘菜单（立即同步、暂停、退出）为 D1/D2
  已验路径、本次未改，且 webview 只有 `core:default`、无窗口命令权限，冒烟中未重放；D3 在
  「退出」里新增的「先结束配对进程」与取消共用 `stop_device_login`（取消已实测杀净进程树）。
  ④ 顺带修 CLI：7 处上游 `tracker <命令>`
  文案改 `tokenusage <命令>`（含 device-login 过期提示这条用户可见错误），branding 守卫
  测试锁死回潮。
- **D3 追记（2026-11-09 下午，操作者报「立即同步」EPERM 后的修复与升级验收）**：
  ① **CLI 升级 0.5.2**（公司机，按 `docs/cli-release.md` 流程）：`npm i -g` → `init
  --yes --no-integrations`（运行时副本 0.5.2、计划任务重登记）→ doctor **17 OK / 0 warn**
  （0.4.7 基线 16/1，kiro 检查转绿）→ reconcile 1 天 / 7 天全 OK → 计划任务手动触发
  `LastTaskResult=0`、sync.log 新行 queue drained；桌面端与终端版本自此一致（此前
  pnpm-PATH 解析 runtime copy 0.5.0、终端 Volta shim 0.4.7 的分叉消除）。
  ② **sync.lock EPERM 修复**（`packages/cli/src/lib/fs.js`，随下次 CLI 发版）：操作者点
  桌面「立即同步」偶发裸 `EPERM: open ...sync.lock`。排查：Win11+Node24 删除挂起不复现
  （POSIX unlink）；活锁持有者恒为 EEXIST（名字冲突先于共享检查）→ 锁名**瞬时创建被拒**
  （过滤驱动 / 释放收尾窗口，ERROR_ACCESS_DENIED→EPERM），而 `openLock` 只认 EEXIST、
  其余错误码裸抛。修复：EPERM/EBUSY 走一轮短重试（3×150ms，递归 `retryTransient:false`
  防嵌套），耗尽后归入既有 held 语义（skip 标记可见、不打断采集）——持久性损坏仍经
  `sync.skip.json` 暴露，符合 issue #431「可观测、可恢复」原则。新增 5 例 mock 注入单测
  （ACL 型向量在本机沙箱与目录只读属性下均不可复现，弃用）。
  ③ **desktop Rust 读 config 字段名 bug**（D2 之来，本次暴露）：`read_instance_config`
  按 snake_case 解析 `base_url` / `dashboard_url` / `machine_id`，而 CLI config.json 写
  camelCase → 三个白名单字段恒 None：页脚 `#machineId` 从未显示、托盘「打开 Web 仪表盘」
  对自部署实例会跳到默认官方地址。加 `#[serde(rename_all = "camelCase")]` 修复，真机复验
  页脚 `PC-20260408RIKF #68e47b34 · tokenusage-cli v0.5.2`。
  ④ **构建形态澄清**：裸 `cargo build --release` 仍是 dev-URL 二进制（连 localhost:1420），
  内嵌 dist 的发版形态必须走 `tauri build`（D5）——§10 D2 记录的「release 构建内嵌 dist」
  指后者。真机验证桌面端时需先起 vite 或用 `pnpm dev:desktop`。
  ⑤ 桌面端「立即同步」真机点击验证：release 实例 CDP 真实点击 → `sync · exit 0`，输出区
  显示 CLI 尾行，页脚版本即时刷新。
- **D3 再追记（2026-11-09 下午，操作者复报 EPERM + 三项 UI 调整）**：
  ⑥ **修复版 CLI 端到端验证**（`bin/tokenusage.js` 正确入口，勿直跑 `src/cli.js`——它只导出
  `run` 不自调用）：预加载注入 EPERM——瞬时一次 → 150ms 后重试成功、完整 sync exit 0；
  持续 → 「Another sync is already running.」+ `sync.skip.json`（`lock_busy`，detail 可读），
  exit 0 不崩；另用 holder 脚本按真锁 → contender 正确走 skip 标记路径。三态全部符合预期。
  ⑦ **探针实测发现更深层问题**：非沙箱计划任务跑连续 `sync --auto`，第 3 轮**整个进程树
  被 0xC0000409（STATUS_STACK_BUFFER_OVERRUN）崩掉**（任务 `LastTaskResult` 即该码；与
  本机已知的 vitest Windows worker fork 崩溃同码），node 写完 finished 行后锁来不及释放 →
  debris（owner pid 已死）。安装的 0.5.2 对 debris 自愈正确（stale reclaim → exit 0）；
  安全侧已排除（Defender 实时防护 + 行为监控在跑但零拦截记录、无 CFA、无第三方 EDR）。
  EPERM（锁名瞬时创建被拒）与 0xC0000409（进程 fork 崩溃）是**两个独立故障**：前者已修复
  待发版，后者是这台机器的系统性问题（fork 链偶发硬崩），需单独观察——探针 2（15:57–16:03
  整点竞争窗口、心跳 + try/finally）已布置，结论到齐后回写本节。
  ⑨ **探针 2 结论（同日 15:10）**：Phase B 未及采集——探针 2 于 15:06:30 在**纯 sleep 等待
  阶段**再次被 0xC0000409 杀掉（`LastTaskResult` 同码），即崩溃与 sync/锁无关，是**本机
  计划任务上下文里 powershell 宿主进程的系统性硬崩**（启动 1–4 分钟内；先后两台探针同一
  死法，首台死在 sync 后的锁释放前、次台死在空闲 sleep）。对照证据：CLI 自己的小时计划
  任务（`TokenUsageSync`，wscript 宿主）14:00/15:00 连续 `LastTaskResult=0`，bash 沙箱内
  直跑 CLI、holder 竞争测试、桌面端点击全部正常——崩溃面局限于「提权 + powershell -File」
  这一种任务形态。整点竞争场景改由 holder 脚本直接验证（见 ⑥）。**处理建议**：不在 CLI 侧
  兜底 0xC0000409（那是 OS 级进程处决，CLI 无从捕获）；保留锁自愈与 skip 标记作为崩溃后
  的观测面（已实测有效）。若操作者桌面端也偶发「窗口/托盘消失」，先查该码。
  ⑧ **三项 UI 调整**（操作者要求，全部落地并 CDP 复验）：a. 采集操作卡失败结果改
  **danger Alert**（HeroUI `status="danger"`，标题 `命令 · exit N` + CLI 输出尾部；长路径
  `break-all` + `Alert.Content` `min-w-0` 防 400 宽溢出——首版漏了这条复验时抓到溢出）；
  b. 来源构成加**品牌 logo**（移植 web `lib/sources.ts` 为桌面 `lib/source-logos.ts` +
  `components/source-icon.tsx` 根级共享件，52 个 MIT 资产复制到 `apps/desktop/public/
  brand-logos/`，暗色双图按登记表 `.dark` 叠放；别名行 trae-cn+trae 归并后 token/占比重算；
  `lib/source-logos.ts` 6 例单测）；c. 四个操作按钮改 **PendingButton**（移植 web 同名件：
  render-prop `isPending` + current-color Spinner），被点的按钮转 Spinner、其余禁用——
  修复前是「点了全部禁用且无任何进行中反馈」。
  ⑩ **「桌面端调旧版 CLI」的 Volta 化石副本**（操作者截图 v0.5.0 的根因，已清理）：
  公司机 `tools/image/node/<ver>/` 下有一份从未被 Volta 接管的 `tokenusage-cli`（npm 全局式
  安装 + 同目录 shim），不随 `npm i -g` 更新；pnpm 把 image-dir 排在 PATH 最前，于是
  `pnpm dev:desktop` 起的桌面端解析到该化石（0.5.0）而非权威全局（`tools/image/packages/`，
  `volta which` 指向它）。表现：操作者升级后桌面端仍显示旧版本号、仍复现已修复的问题。
  清理：删除化石包与 shim；bash 直起 / node 子进程 / pnpm 三种上下文复验均解析到新版。
  判断法：桌面端页脚或 `status` 的版本与 `tokenusage --version`（用户终端）不一致时，先查
  `pnpm --filter @token-usage/desktop exec where tokenusage`。详见 `docs/cli-release.md` §十二。
  **遗留不变**：向导批准环节与托盘菜单点击仍待操作者；0xC0000409 的结论已出（见 ⑨，
  非 CLI 问题、不在 CLI 侧兜底）。
