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
| 6 | CLI 增量 | v1 不新增 CLI 契约面；配对状态经 `run_cli` 调 `status --json`，只读其 `device_token_set` 布尔（§4），其余子命令仍展示文本输出；CLI 面全量 JSON 化列 0.6 候选、单独走依赖报批（2026-11-13 按实现回写，原「不加 `status --json`」口径作废） |
| 7 | 代码签名 | 首版不上（EV 证书成本高）；SmartScreen 提示接受；updater 签名密钥 2026-11-10 改由 Agent 代生成（操作者委托：口令操作者自设；私钥唯一副本在操作者机器 `%USERPROFILE%\.tauri\`，GitHub secrets 只写不可读，须另行备份） |
| 8 | 成本展示（2026-11-10 初判，2026-11-11 反转） | 初判**不进桌面**；D9 起「预计费用」进四统计卡，D10.1 起移植 web 同源读时计价引擎（`lib/pricing.ts`），成本分析弹窗与 web 同口径；账号成就仍不进桌面。§3 边界 4「本地不算成本」按此反转口径理解，见 §12.1 / §12.12 |
| 9 | 成就（2026-11-10） | **不做账号成就页/进度**；只保留 web 深链（`/achievements`），不新增设备只读端点 |
| 10 | 窗口状态（2026-11-10） | 手写 localStorage 记录宽高并在启动时恢复，**不引入** `tauri-plugin-window-state`（D11 起同时记录位置与最大化状态） |
| 11 | 会话读取（2026-11-10） | 新增只读 `read_tracker_tail(rel, max_bytes)`（尾部 ≤512 KiB，同一 canonical 目录守卫），不引依赖、不写文件 |
| 12 | 0.2 产品迭代（2026-11-10） | 范围与分期见 §12：D6 用量构成（模型 / 项目仓库 / 周期切换 / 深链）、D7 使用节奏（热力图 / 最近会话）、D8 交互打磨；D6 于 2026-11-10 放行，后续各轮（含 D9–D11、§12.14）均已验收关闭，见 §12.8 |

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
| `…/project.queue.jsonl` / `…/session.queue.jsonl` | 项目/会话队列 → 项目构成随 D6、会话视图随 D11 落地（原「后续可选展示」口径作废） |
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
  `-tooltip.tsx` / `-table.tsx` / `-filter.tsx` /
  纯计算 `-helpers.ts` / `-filters.ts` / 钩子 `use-*.ts`；D3 起用 `-icon`（向导步骤徽记
  `step-icon.tsx`）与 `-note`（监控盘未配对说明块 `unpaired-note.tsx`），D6 起用 `-filter`
  （`period-filter.tsx`），D7.1 起用 `-tooltip`（热力图共享悬浮说明
  `heatmap-tooltip.tsx`），D10 起用 `-table`（`monitor/breakdown-table.tsx`），均属
  AGENTS 共享集合）；
  新增后缀角色先回写本节再使用；跨页共享件放 `src/components/` 根；拆分目录用 `index.tsx`
  收口。D1 仅有入口件：`src/app.tsx`（根编排）与 `src/lib/` 纯逻辑、`src/styles/`。
- 字体：复用 web 的 Maple Mono CN 自托管子集（woff2 直接复制到 `public/fonts/`，零新依赖）。

## 6. 依赖清单（rewrite-plan §4 报批记录，2026-11-08 随技术栈拍板批准）

- 运行时：web 依赖子集 `react` / `react-dom` / `@heroui/react` / `@heroui/styles` /
  `@gravity-ui/icons` / `clsx` + 新增 `@tauri-apps/api`。**2026-11-11 追加报批（操作者已
  批准）：`recharts` 3.10.1（web 同版本）**——D9 统计卡迷你图与 D10 趋势/环形图按操作者
  拍板引入图表库（原「零图表依赖、手写 CSS/SVG」约束自当日起废止），lockfile 锁定，
  安装包体积约 +100 kB。**2026-11-11 追加报批（操作者本轮指定 NumberFlow）：
  `@number-flow/react` 0.6.2（web 同版本）**——统计卡数值滚动过渡，
  `components/flow-number.tsx` 为 web 同名组件逐字移植，零新增依赖名。
- devDeps：新增名 `vite` / `@vitejs/plugin-react` / `@tauri-apps/cli`；eslint / tailwind /
  prettier / typescript / vitest 组与 web 同版本；Tailwind 走 `@tailwindcss/postcss`
  （web 同款，不引 `@tailwindcss/vite`）。
- 不引入：`next` / `next-themes` / `motion` / `zustand`（桌面用不到的 web 独有名一律
  不进）。
- Rust crate 走 cargo、不进 pnpm lockfile：`tauri` 2（`tray-icon` feature）+ `tauri-build`；
  依赖树披露随 D5 发版文档。
- **2026-11-09 D4 报批（操作者批准「三个官方插件全上」）**：前端增
  `@tauri-apps/plugin-notification@2.8.0`、`@tauri-apps/plugin-autostart@2.7.0`；Rust 增
  `tauri-plugin-notification@2.8.0` / `tauri-plugin-autostart@2.7.0` /
  `tauri-plugin-single-instance@2.5.5`。选址理由：通知、开机自启、单实例都是 Tauri 官方
  维护件，自写同等功能还需额外 crate，与升级路径也最不齐。能力面（`capabilities/default.json`）
  只对主窗口开 `notification:default` + `autostart:default`（core 默认之外唯一两项）；托盘、
  窗口、CLI 子进程仍全在 Rust。
- **2026-11-10 D5 报批（随 D5 开工，操作者拍板「updater 配置 + CI + 先发布后验收」）**：
  前端增 `@tauri-apps/plugin-updater@2.14.1`、`@tauri-apps/plugin-process@2.4.0`；Rust 增
  `tauri-plugin-updater@2.14.1` / `tauri-plugin-process@2.4.0`（均为官方件，npm 与 crate
  版本一一对应；process 为 updater 安装后 relaunch 的伴生件，属 §8 D5「tauri updater」
  的固有组成）。能力面只加 `updater:default` + `process:default`。

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
| **D1 立项与脚手架** | workspace 加 `apps/desktop`（Tauri 2 + Vite + React + HeroUI + Tailwind）；托盘（打开主窗口 / 退出）+ 主窗口骨架 + close-to-tray；`sync.log` 解析模块与测试（D2 数据面第一块）；图标生成脚本与资产；根 `pnpm verify` 并入 desktop lint/tsc/test/build；本文档 + AGENTS / rewrite-plan / requirements 回写 | 根 `pnpm verify` 全绿 + CI 绿；`pnpm dev:desktop` 托盘可见、窗口关闭进托盘、托盘退出（**已真机验收 2026-11-09**） |
| **D2 本地监控盘** | 托盘菜单补全（今日 tokens、采集状态、Sync now、暂停/恢复、打开 web 仪表盘）；主窗口三段（顶部 strip：今日/7 天 tokens + 最近 sync 结果 + 队列体积行数；来源构成 mini 条 + 设备身份行；操作条调 CLI 展示摘要）；三态齐全；ui-spec 回写「桌面端」节 | 本地聚合与 queue.jsonl last-wins 口径一致；无 CLI / 无数据 / 错误三态齐全；离线可用；窄窗不横向滚动 |
| **D3 配对与引导** | 首启向导：检测 CLI → 引导安装 → `device-login` 开浏览器 `/device?user_code=` → 等待→已批准→首同步统计；复用 CLI 现有配对流，desktop 不碰令牌 | 新机器从装 desktop 到配对成功全程有引导。**已收尾**（2026-11-09 操作者验收：向导默认流程通过）；托盘菜单点击已随 D5 补验（2026-11-10，按 §11 对安装版 exe 打 High 标签后全项可用） |
| **D4 通知与常驻** | 每日汇总通知、sync 连败/队列积压提醒（阈值可配）、自启动、单实例、ThemeToggle 三态循环与持久化 | 通知免打扰时段可配；reduced-motion 遵守。**已验收关闭**（2026-11-10 操作者验收，见 §10；自启随 D5 首次真正写入，重启周期待观察；toast 已于 2026-11-12 实测通过（见 §10 D5 补验）） |
| **D5 发版** | Windows NSIS 安装包 + tauri updater（Ed25519 签名，密钥 Agent 代生成入 GitHub secret，见 §1 #7）；Rust 编译门禁进 CI（Windows runner）；发版流程见 §11。**已验收关闭**（2026-11-10 发布 `desktop-v0.1.0` 并操作者本机安装验收，M-desktop 收官，见 §10） | 从 Release 下载安装 → 应用启动 → D2–D4 功能真机全过；托盘按 §11 兜底（High 标签）后本机补验成功；（2026-11-12）系统级每日汇总 toast 实测弹出，D5 遗留观察① 已闭合 |
| **D6 用量构成**（0.2 产品迭代，**已验收关闭** 2026-11-10 放行 → 两轮反馈随 `desktop-v0.2.0` / `v0.2.1`） | 周期切换 + 主要模型卡 + 项目与仓库卡 + 用量卡收敛 + web 深链 + 数据新鲜度；范围见 §12.3 | 模型/项目 Top 5 与 web 同设备同窗口人工一致；仓库链接正确；三卡联动；400 / 340 px 无横向滚动；`pnpm verify` 全绿 |
| **D7 使用节奏**（0.3 产品迭代，**已验收关闭** 2026-11-11，D7.1 追加轮一并验收） | 热力图（近一年，展示同 web 活跃热力图）+ 最近会话（只读尾部）+ 卡片显隐；范围见 §12.4 / §12.9 | 日聚合计与单值卡边界一致；最近 5 条与 `session.queue.jsonl` 尾部一致且无正文；隐私字段不出现 |
| **D8 交互打磨**（原范围已被 D9–D11 全部吸收） | 维护操作收进页头图标按钮（窄窗按钮行保留在采集与同步卡）/ 失败输出复制按钮 / GitHub 入口 / 空态与可达性随 D9–D10 落地，窗口尺寸记忆随 D11 落地；其中复制按钮原记「随 D9–D10 落地」有误，2026-11-13 在 `sync-status-card.tsx` 补齐；**已验收关闭**（2026-11-12） | 重启保留窗口尺寸；无新增依赖 |
| **D9 头部与统计卡**（2026-11-11 操作者八点需求第 1/2/3/7 项，**已验收关闭**） | 头部改周期筛选 + 图标按钮、采集操作卡并入采集与同步卡、四统计卡（NumberFlow 动画 + Chip 环比）、热力图 web 同款移植；范围见 §12.10 | 统计卡费用非零、口径与 web 同源；热力图格数与周期解耦；`pnpm verify` 全绿 |
| **D10 趋势与构成**（同上第 4/5 项，**已验收关闭**） | 用量趋势照搬 web、来源构成 logo 榜 + 「查看全部」、项目与仓库卡重写 + 项目详情双栏；范围见 §12.11 | 图表与 web 同窗口人工一致；项目详情 KPI / 每日柱图 / 构成条齐全 |
| **D10.1 验收修复**（2026-11-11 三轮验收反馈，**已验收关闭**） | 费用美元符号、读时计价（移植 web 计价引擎）、NumberFlow + Chip 环比、热力图跟周期（格数不变）、项目 logo 同步（`project-profiles` 端点 + CLI 子命令 + Volta 化石副本清理）；范围见 §12.12–§12.12.2 | 四卡与成本分析费用非零；web 编辑的 logo / 显示名在桌面同步；未配对机静默降级 |
| **D11 会话与分享**（2026-11-12 交付并验收，含窗口尺寸记忆） | 会话视图照搬 web /sessions（列表 + 汇总卡 + 筛选 + 详情弹窗 + CSV，单机口径裁掉设备列 / 设备筛选）、分享卡四变体完整移植（本地投影 + Downloads 保存）、窗口尺寸记忆（localStorage + `visible:false` 恢复 + Rust 看门狗）；范围见 §12.13 | 会话列表与 web 同窗口人工一致（成本为 sessions 峰值价口径）；分享卡四变体渲染正确、复制 / 保存 PNG 可用、关闭态不重绘；重启保留窗口尺寸 / 位置 / 最大化，看门狗兜底不丟窗口；400 / 340 px 无横向滚动；`pnpm verify` 全绿 |

工期参考：D1 约 1 天，D2 约 3–5 天，D3 约 2–3 天，D4 约 2 天，D5 约 2 天；全程 Agent
开发，每个里程碑操作者验收后再进下一个。

## 9. 明确不做（防范围失控）

不复刻仪表盘图表全量；不做 Sessions / 成就 / 分享卡页；不做跨端偏好同步；不做 webview
嵌入云端登录态；不碰采集与上传逻辑；不新增契约端点；pet/quota 类桌面 widget 仍留在
requirements 边界表。

以上为 **0.1（M-desktop）范围**的历史边界。0.2 迭代起已反转：Sessions 视图与分享卡随
D11 落地、会话内项目 / 模型筛选随 §12.14 落地、读时计价随 D10.1 落地；仍维持不做的是
账号成就页、公开徽章、云端探活、Projects 全页与全库筛选、webview 登录态（见 §12.6）。

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
- **D3（2026-11-09 交付并验收，见本节末「D3 收尾」）**：首启配对向导落地。门控见 §4「配对状态」；
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
  **遗留项去向**：向导批准环节已随 D3 收尾（2026-11-09）验证通过；托盘菜单点击已随 D5
  补验（2026-11-10，见 §11）。0xC0000409 的结论已出（见 ⑨，非 CLI 问题、不在 CLI 侧兜底）。
- **D3 三追记（2026-11-09 傍晚，操作者复报 skip 标记 / pause 标志写入 EPERM）**：
  ① 现场证据：tracker 目录 ACL 正常（Administrator 继承 F），bash 与终端直跑
  `cmd /C tokenusage sync --auto` 均 exit 0；仅桌面端起的 CLI 子进程**创建新文件**被拒
  （EPERM: open `*.tmp`），且两次报错分别落在 `sync.skip.json.tmp…`（锁未拿到后写跳过
  标记）与 `pause.flag.json.<pid>.tmp`——即这两个此前未加保护的写路径。属系统层瞬时/上下文
  拒绝，CLI 无法根治。
  ② CLI 侧补同样的瞬时创建重试：`writeFileAtomic` 的 tmp 创建 3×150 ms（与 `sync.lock`
  同一策略）；`setCollectionPaused` 改 async 并复用 `writeFileAtomic`（原手写 `${pid}.tmp`
  写入无保护）；skip 标记写入失败不再把一次「跳过」升级成崩溃，改为同义 stderr 提示
  （exit 0），标记缺失只影响可观测面（issue #431 语义不变）。单测 11 例回绿，mock 注入
  复验：首次 EPERM → 重试成功；持续 EPERM → 约 300 ms 后原样抛出。
  ③ 桌面端 pending 图标：有前置图标的按钮（立即同步 / 暂停·恢复）在 Spinner 出现时隐藏
  原图标——`PendingButton` 新增 `icon` prop，按官方同槽替换（`isPending ? <Spinner/> :
  <Icon/>`），不再并排显示两个字形（ui-spec 采集操作卡节已回写）。
- **D3 四追记（2026-11-09，写入 EPERM 的根因定位）**：桌面端点「暂停采集」持续 EPERM，重试
  无效。排查：tracker 目录 ACL 正常（High 进程可自由读写），但 `token-usage-desktop.exe`
  的进程令牌是 **Low 完整性级别**（cargo / rustup / node / pnpm / Zed / explorer 全为 High，
  直接启动同一 exe 亦然），其 CLI 子进程继承 Low，向默认 Medium 的 `~/.tokenusage/tracker`
  **创建文件**被强制完整性控制拒绝、读取不受限——与「读全正常、写全 EPERM、重试无效」完全吻合。
  根因：构建产物 `src-tauri/target/debug/token-usage-desktop.exe` 带 **Low 完整性标签**（SACL，
  `Get-Acl -Audit` 下不可见；进程 IL 取父令牌与镜像标签的较低者）。
  ① **反证：不能把 exe 改 Medium**。改标后桌面端直接崩：
  `Failed to setup app: failed to create webview: WebView2 error: HRESULT(0x80070005) 拒绝访问`。
  本机会话整体提权（UAC 关闭：explorer/full shell 都是 High），Medium 及以上进程被 WebView2
  拒绝、Low 才允许创建 webview。清空 profile 后的对照（同一 exe 只改标签）：Low → 进程存活且
  `EBWebView` 正常生成；Medium → panic 0x80070005。⇒ **本机桌面端必须留在 Low**，改 Medium
  的方案作废。
  ② **写权限改从目标目录侧解决（本机环境，不入库）**：
  `icacls %USERPROFILE%\.tokenusage /setintegritylevel "(OI)(CI)Low"`，并对已有子项逐个设
  `Low`（父目录继承让新建文件也是 Low；已存在的 queue/config 需逐个改，否则 Low 进程无法覆盖
  它们）。实测：复制并标 Low 的 `cmd.exe` 作为 Low 探针 —— tracker 内创建/覆盖文件成功，
  `tokenusage pause` exit 0 并落下 `pause.flag.json`，`resume` 成功删除。构建侧保留
  `(OI)(CI)Low` 于 `src-tauri/target` + `target/debug`，重链接产物自动继承，dev 重启即一致。
  ③ **副作用**：Low 进程改不了计划任务 → `pause` 末尾出现
  `TokenUsageSync could not be disabled (错误: 拒绝访问。)`；标志仍是权威（所有 auto sync 都
  看标志），采集开关功能不受影响。
  ④ CLI 侧可见面：`writeFileAtomic` 遇 EPERM/EACCES/EBUSY/EROFS 时挂 `hint`（bin 打印
  `Hint:`，桌面端 Alert 可见），skip 标记写入失败不再致命。
  ⑤ 新机器排查顺序：先看进程 IL（`Get-Process` + 令牌 IL），再查镜像 SACL 与 `target/debug`
  的继承标签，最后才查目录 ACL。构建目录若被沙箱类工具打了 Low 标签会周期性复现。
- **D3 五追记（2026-11-09 晚，中文反馈 + 品牌图标 + 0.5.4）**：
  ① **中文 Toast**（操作者要求：CLI 输出只有英文）：结果块保留 CLI 原文，另加中文摘要——
  `hooks/use-monitor-toasts.ts` 把 `CliRunOutcome` 映射成 success / danger / 中性三类；中性
  覆盖两种「成功但需解释」的情形（同步被跳过、暂停成功但计划任务未能关闭 → 补一句「暂停标志
  仍然生效」）。启动期同理：CLI 探测未完成时四个按钮全禁用，先发常驻 `isLoading` toast「正在
  检测本地 tokenusage-cli……」，落定后同一 toast `toast.update` 成「已就绪」或 danger「未检测到
  tokenusage-cli：采集操作已禁用…」。`Toast.Provider`（`placement="bottom end"`）挂在
  `app.tsx`。设计规则已回写 `docs/ui-spec.md`「采集操作卡反馈 Toast」条。
  ② **图标改用 `logo-dark`**：`apps/desktop/public/logo-dark.svg`（白底深色 mark，与页头 dark 态
  同源）作为 `scripts/admin/desktop-assets/generate.mjs` 的唯一输入，重出 1024 源图 → `tauri icon`。
  ⚠ 图标是**嵌在 exe 资源里**的：`tauri icon` 改写 `icons/*` 后 crate 本身未变，cargo 认为构建是
  新的、直接复用旧 exe，窗口与托盘仍显示上一版图标（本次实测：exe 12:15 / 图标 16:40）。修复：
  `src-tauri/build.rs` 声明 `cargo:rerun-if-changed=icons/icon.ico` 与 `icons/icon.png`，
  重建后从 exe 抽出 32×32 图标比对 md5（`f9892f…` → `0557bf…`）并目检为新 mark。
  排查口径：任务栏图标不对时先看 exe 时间戳，确认真的重建过，再怀疑 Windows 图标缓存。
  ③ **真机复验**（CDP `Input.dispatchMouseEvent` 真点击 + `Page.reload`）：`sync` →「同步完成」；
  `pause` →「采集已暂停；计划任务未能关闭（权限不足），暂停标志仍然生效」；`resume` →「采集已
  恢复，自动同步重新生效」；重载后启动 toast 只有一条「tokenusage-cli v0.5.4 已就绪」，2.5 s
  自动消失（无常驻/重复）。
  ④ 同日发布 **CLI 0.5.4** 并在公司机升级验收（运行时副本 v0.5.4、`doctor` 17 OK、`reconcile
  --days 7` 271 桶逐键匹配、计划任务 `LastTaskResult=0`），明细见 `docs/cli-release.md` §十三；
  桌面端经 PATH 解析到的 CLI 与运行时副本均已是 v0.5.4。（**2026-11-10 更正**：当时桌面端
  经 PATH 命中的 Volta 托管副本实为 0.5.3，页脚即由此而来；已 `volta install` 对齐，见本节
  末「顺手核对项」。）
- **D3 六追记（2026-11-09 晚，本机托盘不可注册的根因与降级）**：操作者报「`pnpm dev:desktop`
  起来后没有托盘图标」。排查：进程活着、`TrayIconBuilder::build` 返回 `Ok`、tray 的隐藏窗口
  `tray_icon_app` 存在，但 `Shell_NotifyIconGetRect` 给出 `Ok(None)`（Shell 从未登记它）；UIA
  树里可见区与 Win11 折叠区都找不到。用「同一 exe、只改进程完整性标签」做 A/B 对照确认：
  **High 注册成功**（图标进折叠区，所以可见区列表里没有，`rect=Some`）、**Medium / Low 注册
  失败**（`rect=None`）——这台机器 UAC 关闭，explorer/任务栏跑在 High，`Shell_NotifyIcon` 的
  消息被 UIPI 丢弃；`tray-icon` 有意吞掉这次失败（等 `TaskbarCreated` 再重试），所以 `build`
  照旧 `Ok`、进程也不报错。而四追记已证 Medium 及以上建不了 WebView2 ⇒ 「能建窗口」与「能进
  托盘」在本机互斥：**托盘不可用是环境事实，不是代码 bug**。
  ① **降级**：`on_window_event` 的 CloseRequested 先查 `tray_registered()`（`rect()` 是否为
  `Ok(Some(_))`，这是唯一诚实的判据）；有托盘 → `hide()`（原行为），无托盘 → `minimize()`，
  避免「藏起来又没有托盘可召回」把用户锁在窗口外。
  ② **可见面**：新增 `tray_status` 命令 + `hooks/use-tray.ts`（400 / 1200 / 3000 ms 三次探测，
  任一 `true` 即判定可用，躲开「注册晚于查询」的误报）+ `components/monitor/tray-note.tsx`
  （`warning` Alert「托盘图标未注册」：任务栏权限更高，关闭窗口只最小化）。CDP 断言：本机
  监控盘顶部出现该说明块，与降级行为一致。
  ③ **验收口径**：托盘菜单点击只能在「托盘可用」的环境验（原判：UAC 正常的机器），本机以
  窗口上的「立即同步 / 暂停·恢复」验同一批 `spawn_cli_detached` 路径（五追记已测）。**D5 实测
  修正**：本机无需 UAC 正常——对安装版 exe 打 High 标签后托盘注册成功，该验收项已在本机补验
  （见 §11）。
  ④ **在已配对的机器上重走向导**（本次验收路径）：关掉桌面端 → 把
  `%USERPROFILE%\.tokenusage\tracker\cloud-device-token.json` 改名备份（`config.json` 里若有
  `deviceToken` 一并清掉）→ 重开桌面端，`status --json` 的 `device_token_set` 转假 → 向导出现
  →「配对设备」拿码 → 浏览器 `/device?user_code=…` 用已登录账号批准 → 向导自动跑首同步 →
  「进入监控台」（新令牌由批准时签发，旧文件留作对照）。
- **D3 收尾（2026-11-09 操作者验收）**：**D3 关闭**。
  - 验收结论：向导默认流程通过（首次启动 → 检测 CLI → 配对码 + 自动开批准页 → 已批准 →
    首同步统计 → 进入监控台）；操作者原话「向导默认没问题」。向导不另加交互改动。
  - 遗留项去向：托盘菜单点击（立即同步 / 暂停·恢复 / 打开仪表盘 / 打开主窗口 / 退出）在本机
    因 UAC 关闭而无图标可点（六追记），**已随 D5 补验**（2026-11-10，安装版 exe + §11 High
    标签，五类菜单项全项可用）；同一批 `spawn_cli_detached` 与窗口控制路径已由窗口按钮、
    托盘 quit / show 事件分发（D2）覆盖，不在 D3 挂账。
  - 环境相关事项不入库、继续有效：本机 `~/.tokenusage` 与 `src-tauri/target` 的 Low 完整性标签、
    dev 构建须跑在 Low（四追记）、托盘不可用降级与说明块（六追记）。**D5 修正**：以上只约束
    `pnpm dev:desktop` 这类 Low 标签构建目录；安装版走 `%APPDATA%` Medium + 打 High 标签，
    WebView2 与托盘均正常（见 §11）。
  - D3 范围外的已知问题：计划任务上下文里的 0xC0000409（再追记⑧，系统层、CLI 不兜底）。
  - 下一步：**D4 通知与常驻**（每日汇总通知、sync 连败/队列积压提醒 ±阈值、自启动、单实例、
    ThemeToggle 三态持久化）。
- **D4（2026-11-09 交付，2026-11-10 操作者验收）**：通知与常驻四项 + 主题持久化全量落地。
  ① **依赖与接线**（操作者批准"三个官方插件全上"，预算回写 §6 与 rewrite-plan §4）：
  `tauri-plugin-single-instance` 作为**第一个**注册的插件，第二次启动把 argv 交给已跑实例并
  退出（实测：再跑一次 exe → exit 0，进程数仍为 1）；`notification` + `autostart` 插件；
  能力表只给主窗口加 `notification:default` / `autostart:default`。
  ② **偏好模型**（`lib/preferences.ts`，localStorage `tokenusage.desktop.preferences`）：
  主题 / 每日汇总 + 时间 / 连败提醒 + 阈值（2·3·5 次）/ 积压提醒 + 阈值（10·20·50·100 MB）/
  免打扰 + 起止小时 / 自启动镜像。每个字段经 `normalizePreferences` 校验（非法值回默认、
  越界夹回），坏 JSON 与禁用 storage 都不崩。
  ③ **判定层**（`lib/notifications.ts`，纯函数 + 22 例单测）：免打扰窗口（跨零点）只**抑制发送**、
  不标记已发——到期未发的会顺延到窗口结束后；每日汇总按本地日期键去重（当天一次，到点才发）；
  连败按 `syncFailureStreak`（`finished` 分隔 run，上传失败也计一次；尾部未收尾的 error 计入
  进行中那一轮）每段连败只报一次，恢复后重新武装；积压越阀报一次、回落才重新武装。
  ④ **发送**（`hooks/use-notifications.ts`）：每次快照刷新 + 30 s tick 重算；先落去重状态再发送
  （崩在中间不会重启后重发）；权限首次发送时请求。真机：`isPermissionGranted=true`、
  `sendNotification` 返回无错、去重状态落到 `lastDailyDate=2026-11-09`。
  ⚠ **本机看不到 toast 是开发形态 + 系统的限制，不是接线错**：`tauri-plugin-notification`
  在 `target/debug|release` 下**有意不设** `System.AppUserModel.ID`（安装后才有），而本机对
  未注册 AUMID 的 toast 直接丢弃（对照：High 权限 PowerShell 用
  `Microsoft.Windows.PowerShell` AUMID 发的探针同样没出现在通知历史）；D5 的 NSIS 安装
  包带开始菜单快捷方式 + AUMID，真实弹出在发版形态验收。
  ⑤ **主题三态**（`components/theme-toggle.tsx` + `hooks/use-theme.ts`）：页头单个按钮循环
  跟随系统 → 浅色 → 深色，图标与 tooltip 始终显示**当前**模式；`index.html` 首帧前读同一
  storage key 先上 dark 类（无闪烁），系统模式下监听 `prefers-color-scheme` 变化。CDP 实测：
  两下点击 → `dark` 类切换、label 变「主题：深色」、localStorage 持久化，重载后仍为 dark。
  ⑥ **设置面板**（`components/monitor/settings-dialog.tsx`，页头齿轮 + 向导页头同样可见）：
  Modal 复合结构，五组开关（每日汇总 / 连败 / 积压 / 免打扰 / 开机自启）与按开关联动显示的
  下拉（时间、次数、体积、起止）；副标题明写「仅保存在本机，不随账号同步」。CDP 实机：
  打开后 5 个 switch 与全部文案正确渲染。
  ⑦ **自启动的真机结论**：本机点击开关抛 `拒绝访问。(os error -2147024891)`——写
  `HKCU\…\Run` 同样被 Low 完整性挡住（与四追记的 tracker 写入同源），开关保持关闭；错误文案
  已按 E_ACCESSDENIED 映射成「系统拒绝写入启动项（本应用权限或完整性级别低于登录会话）」。
  在 Low 环境下这是环境限制，需在正常 UAC 机器上验收自启成效；单实例与主题在两种环境都可验。
  ⑧ **reduced-motion**：新增交互均为 HeroUI 默认过渡，无自写动画；设置面板/开关的过渡由
  组件层的 `prefers-reduced-motion` 处理，未新增任何 animation 代码。
- **D4 验收（2026-11-10 操作者）：D4 关闭**。
  - 验收范围：主题三态循环与重启持久化、设置面板渲染与开关联动、偏好持久化、判定层去重
    状态落盘（`tokenusage.desktop.notifications`）、单实例、自启动开关的降级错误文案（Low
    完整性环境限制下的映射文案）。操作者结论：验收通过。
  - 验收要求的一处调整：设置面板全部 `Select` 加 `variant="secondary"`（Modal 即 Surface
    场景的低强调变体），已落地并过 desktop 门禁；ui-spec「设置面板」节同步回写。
  - 遗留三项随 D5 验收（本机结构性验不了，见 D4 交付记录 ④⑦）：toast 真实弹出与免打扰
    真实抑制（等 NSIS 安装包的 AUMID）、自启动成效（等 UAC 正常机器）。
  - 下一步：**D5 发版**（Windows NSIS 安装包 + tauri updater + Rust 编译门禁进 CI）。
- **D5（2026-11-10 交付并发布）**：updater/发版链路全量落地。
  ① **密钥**：Ed25519 密钥对由 Agent 代生成（§1 #7 改判），secrets
  `TAURI_SIGNING_PRIVATE_KEY[_PASSWORD]` 已推 GitHub（值不落仓库与文档），公钥进
  `tauri.conf.json`。② **updater 接线**：`plugins.updater`（endpoint = Releases 的
  latest.json）+ `bundle.createUpdaterArtifacts` + NSIS（`installMode: currentUser`、
  SimpChinese/English 双语言）；Rust 注册 updater + process 插件（能力面仅加
  `updater:default` / `process:default`）；webview 侧 `hooks/use-updater.ts`——启动 8 s
  静默检查只**播报**（中性 toast「发现新版本…」），安装永远走设置面板「检查更新」
  （点击即同意：下载→安装→relaunch，进度与失败各有中文 toast，对齐 D4 反馈规范），
  后台启动绝不自行重启应用。设置面板新增「更新」节（当前版本行 + 手动检查按钮，
  PendingButton，检测/下载期 Spinner）。③ **CI**：`ci.yml` 增 `rust-gate`（Windows
  runner，`cargo fmt/clippy/check --locked`；先跑 vite build 满足 generate_context! 对
  frontendDist 的存在性校验）；`release-desktop.yml`（tag `desktop-v*` → 三处版本校验 +
  desktop verify → `tauri build` 签名出包 → `assemble-updater-manifest.mjs` 组装
  latest.json → **draft Release**，操作者 publish 即放行闸门，§11）。④ **本机 Rust 编译
  受阻**：新依赖树引入 `ring`（updater→rustls），其 C 构建在本机 cargo 上下文恒
  D8050（c1.dll 无法加载）——同参数 cl 在 cmd+vcvars、以及 node 直起 ring 构建脚本
  （cc-rs 同路径同环境二分）均成功，排除环境变量面，属本机 cargo×cc 进程上下文怪癖
  （与再追记 ⑨ 的 0xC0000409 同类，机器层，不在项目侧兜底）；**Rust 门禁以 CI Windows
  runner 为权威**。⑤ **验收顺序**：CI（含 rust-gate）绿 → 操作者放行打 tag
  `desktop-v0.1.0` → CI 出 draft Release → 操作者本机安装，按 §8 新验收线走。
- **D5 验收（2026-11-10 操作者）：D5 关闭，M-desktop 收官**。
  - 发布：tag `desktop-v0.1.0` → release-desktop.yml 8m48s 出包 → draft Release 经
    操作者委托 Agent publish（draft=false）→ updater 端点实测返回 0.1.0 manifest。
    过程中修两处流水线 bug（`cargo fmt` 不吃 `--locked`；版本校验的 Cargo.toml 正则
    在 bash 双引号里转义塌了一层，改 grep+cut）。
  - **本机安装实测（操作者截图验收，全过）**：安装 → SmartScreen 通过 → 启动正常
    （安装版 `%APPDATA%` 数据目录 Medium 继承的推断成立，WebView2 无碍）；监控盘真实
    数据（今日 6637.46 万 / 近 7 天 7.88 亿 / 待上传 0 B，来源构成 logo 榜正常）；全部
    操作按钮成功——立即同步 / Doctor / 对账（258 桶 exit 0 逐键全对齐）/ 暂停恢复，
    **无任何 EPERM**（Low IL 一族问题随安装版 Medium IL 整体关闭）；设置面板全开关
    成功，**开机自启开关首次真正写入**。
  - **托盘在本机注册成功**（六追记以来首次）：按 §11 兜底对安装版 exe 打 High 完整性
    标签后，托盘图标出现、右键菜单全项可用（今日 tokens / 立即同步 / 暂停采集 / 打开
    主窗口 / 打开 Web 仪表盘 / 退出，截图实测）；D3 收尾挂账的「托盘菜单点击待 UAC
    正常环境补验」就此了结（High 进程 ↔ High 任务栏互信）。同时修正四追记 ① 的结论：
    High 进程 WebView2 创建正常，Medium 的 0x80070005 是 Low 标签构建目录的 profile
    继承问题，不是「Medium 及以上全拒」。（「升级/重装后需重打 High 标签」的推论已于
    2026-11-12 复核推翻：安装包未打标签时托盘正常，见 §11。）
  - 遗留观察：① **已闭合（2026-11-12）**：系统级每日汇总 toast 到点实测弹出通过
    （in-app 中文反馈 toast 此前已全过）；连败 / 积压与每日汇总共用同一通知通道与判定层
    （`lib/notifications.ts` 单测覆盖），操作者判定无需单独造状态验证。② 自启动的「重启后
    生效」仍未做整周期验证（写入已成功），属时间因素，出问题再单开事项。
  - 顺手核对项（**2026-11-10 已结，非桌面端 bug**）：页脚 v0.5.3 来自 Volta 托管副本——
    `npm i -g` 只更新了 image-dir 副本，`~/.volta/bin/tokenusage` shim 仍解析
    `tools/image/packages/tokenusage-cli`（0.5.3），桌面端 `cmd /C tokenusage` 命中的就是它。
    已 `volta install tokenusage-cli@0.5.4` 对齐：cmd / image-dir shim / pnpm 三处均 v0.5.4，
    `init` 刷新副本、`doctor` 17 OK、`reconcile` 63（1d）/ 262（7d）桶逐键 OK；桌面端重载后
    页脚即显示 v0.5.4。根因与「升级后必须补 `volta install`」的操作规则见
    `docs/cli-release.md` §十三「0.5.4 复验」。

- **D6–D10.1 验收（2026-11-11 操作者）：0.2 产品迭代全部关闭**。D6 用量构成（两轮反馈随
  `desktop-v0.2.0` / `v0.2.1`）、D7 使用节奏 + D7.1 追加轮、D9 头部与统计卡、D10 趋势与
  构成、D10.1 三轮验收修复（费用美元符号 / 读时计价 / NumberFlow 与 Chip 环比 / 热力图
  跟周期且格数不变 / 项目 logo 同步）逐项验收通过。验收要点与实测：四统计卡与成本分析
  费用非零（本机 1150 行去重队列 $132.24，此前恒 $0.00）；项目详情双栏版式；web 编辑的
  logo 在桌面项目卡与详情同步（截图复验 `better-nav` / `free-for-dev-zh` / `margin`）。
  门禁：`pnpm --filter @token-usage/desktop verify` 全绿（lint / tsc / 121 例测试 / build），
  web 契约 255 例、CLI 296 例全过。**遗留（① 已于当日闭合）**：① `project-profiles`
  子命令已随 `tokenusage-cli@0.5.5` 发版（2026-11-11，tag `cli-v0.5.5`），其他机器升级 CLI
  即可同步显示名 / logo，旧 CLI 仍静默降级（设计如此）；② Volta 两份副本的坑已收尾：本机
  `volta install tokenusage-cli@0.5.5` + image-dir 正式包重装，junction 与备份目录均已移除，
  升级后两份都要跑（`docs/cli-release.md` §十四）；
  ③ `tauri build` 末步仍因缺 `TAURI_SIGNING_PRIVATE_KEY` 返回 1（NSIS 包完整，仅 updater
  `.sig` 未生成），发版走 CI 不受影响。下一步：D11（会话列表 + 详情、分享卡完整移植）。

- **D11 验收（2026-11-12 操作者）：D11 关闭，0.3.0 交付**。会话视图（列表 / 汇总卡 /
  筛选 / 详情弹窗 / CSV 导出）、分享卡四变体、窗口尺寸记忆三块交付，经两轮操作者反馈修正
  （§12.13.1 / §12.13.2）后本机安装验收通过：详情列不再截断、CSV 导出弹原生保存对话框
  （默认桌面、可改目录、取消不弹提示）、总计口径说明改为「总 Tokens」标签旁 Tooltip、
  检查更新不再报失败。门禁：`pnpm --filter @token-usage/desktop verify` 全绿（lint / tsc /
  131 例 / build）。**发版与安装验收（2026-11-12）**：tag `desktop-v0.3.0` → CI 出 draft →
  当日 publish（`--latest=false`，不抢 CLI 的 latest 标记）→ 新工作流
  `release-desktop-latest.yml` 首次建出 `desktop-latest` 滚动 Release 并上传 `latest.json`
  （端点实测返回 0.3.0）→ 操作者从 Release 下载安装，**打开与功能均正常，D11 全项关闭**。
  发版同轮 CI 暴露两处 Rust 门禁问题（`cargo fmt --check` 导入顺序、`clippy::single_match`
  看门狗写成 `match`），均属格式/风格、不影响出包，已随 main 修复；发版流水线不跑
  fmt/clippy（只有 ci.yml 的 rust-gate 跑），本地发版前应补跑两者。遗留项「安装/升级后需
  手动重打 High 标签」**已于同日复核推翻**：同一安装包未打任何标签，托盘正常注册（原因
  与证据见 §11）。

- **0.3.1 维护版本（2026-11-12）**：唯一用户可见改动是「托盘图标未注册」提示的成因与恢复
  指引（改为「任务栏权限高于本应用」，并写明用「以管理员身份运行」重启可恢复），其余为
  版本号与文档。目的：用一次真实的小版本验证应用内更新链路（0.3.0 → 0.3.1）。三处版本 +
  Cargo.lock 同步，`desktop-v0.3.1` 已 publish（`--latest=false`），`desktop-latest/latest.json`
  实测返回 0.3.1、exe 指向 `desktop-v0.3.1`（4,833,553 B）。**端到端验收通过（2026-11-12
  操作者）**：在已装 0.3.0 上点「检查更新」→ 检测到 0.3.1 → 启动下载 → 安装完成 → 应用
  自动重启并打开主窗口，设置里版本显示 v0.3.1；窗口几何、托盘图标与监控数据均正常。更新
  链路自此闭环。

- **0.4 产品迭代验收（2026-11-12 操作者）：本地 0.4.0 安装包通过**。三项（会话项目 / 模型
  筛选、设置目录入口、托盘周期切换，§12.14）交付后经三轮反馈修正：① 长项目名撑开触发器 +
  去掉「清除筛选」按钮（§12.14.1）；② 下拉项溢出与 Select 样式统一（下拉去掉会话数、弹层
  限宽截断、会话视图四个 Select 回落默认 variant；复验补修全局 `.select__value`
  `min-w-0 truncate`，对齐 web `globals.css`，§12.14.2）；③ 切换周期时已选 facet 从选项表
  消失导致触发器回落占位、筛选却仍生效（补 `withSelectedFacet` 置顶回注，§12.14.3）。
  门禁：`pnpm --filter @token-usage/desktop verify` 全绿（135 例）；本地重打 0.4.0 NSIS 包
  （无签名私钥，`tauri build` 末步 updater 签名报错属预期）。GitHub Release 发版仍按 §11
  由操作者放行。

- **0.4.0 发版前置与记录纠错（2026-11-13）**：`cargo fmt --check`、
  `cargo clippy --release --all-targets -- -D warnings` 与
  `pnpm --filter @token-usage/desktop verify` 全绿（135 例），三处版本 +
  `Cargo.lock` 均 0.4.0；`desktop-v0.4.0` tag 已推送、CI 出 draft Release，
  **publish 仍由操作者在 Release 页放行**（§11）。同轮补齐 D8 遗留的失败输出复制按钮、
  修正成本分析弹窗与 `queue-lines.ts` 的读时计价口径文案、把托盘未注册时的
  CloseRequested 从 `minimize()` 改为不拦截（补上退出路径）、补 `lib/version.test.ts`，
  并回写 §1 / §4 / §9 / §12 / ui-spec 的陈旧条目与 CHANGELOG 0.3.0 的 High 标签矛盾。
  **上述 2026-11-13 改动未纳入 `desktop-v0.4.0` tag（tag 指向 `47a9f39`），随下一版带走。**

- **0.4.1 设置改版（2026-11-13 立项并完成，待操作者安装验收）**：四项合并为同一版本——
  ① 「卡片显示」五个 `Switch` 改 `ToggleButtonGroup selectionMode="multiple" size="sm"`
  （顺序照监控盘渲染：热力图 / 趋势 / Top 模型 / 来源 / 项目；与 `Label` 同行右对齐、
  窄窗换行）；② 「当前版本」改 `Chip size="sm" variant="soft"`；③ 页头「跟随系统」图标
  改 web 页头同款 Lucide sun-moon 内联 SVG，移除「设置-网页」整组文字跳转，落地页与
  仪表盘改为页头 `isIconOnly` tertiary 图标按钮（仪表盘仅在已配对时出现，`webUrl` 门控不变）；
  ④ 设置新增「显示格式」分组（货币 / Token 显示 / 数字单位 / 数字分组），字段落在
  `lib/preferences.ts` 的 `tokenusage.desktop.preferences`，**零新增依赖、不与 web 同步**（§9）。
  格式规则由 `lib/display-format.ts`（web `lib/format/core.ts` 纯函数移植，含内置 FX 快照）
  提供，`lib/format-tokens.ts` 保持 9 个导出签名不变、改由模块级偏好单例驱动，因此
  100+ 调用点（含托盘用量文案与通知正文这类 React 树外调用）零改动即生效；偏好变更经
  `formatKey` 立即重推托盘并重建分享卡输入。默认保留桌面原有的紧凑 / 万·亿 / USD 视觉，
  切「完整」才用分组位数（与 web 默认 `full` 不同，两端偏好独立）。
  门禁：desktop verify 15 文件 / 154 例、根 `pnpm verify`（web 663 / CLI 296 /
  landing / desktop 154）、`cargo fmt --check` 与
  `cargo clippy --release --all-targets -- -D warnings` 全绿；本地 NSIS 包
  `src-tauri/target/release/bundle/nsis/Token Usage_0.4.1_x64-setup.exe`
  （复核修复后重出包 4,842,436 B，覆盖同版本旧包）已产出，末步因无
  `TAURI_SIGNING_PRIVATE_KEY` 未生成 `.sig`
  （退出码 1，属预期）。**本轮只出本地 NSIS 包供安装验收，不推 main / 不打 tag /
  不 publish**；`desktop-v0.4.0` draft 保持原状。

- **0.4.1 同版复核修复（2026-11-13，随本地包一起验收）**：操作者问「今天会话数为 0」，
  只读排查确认属预期——当天 23 条小时桶来自 workbuddy / minimax-code / trae，均不在
  会话侧车 8 类扫描来源内；侧车 219 行、最新 `ended_at` 为 `2026-11-12T10:22Z`，
  7D / 30D 分别有 27 / 99 条。两项复核修复并入 0.4.1（尚未发布，重出本地包覆盖）：
  ① 会话空态由两分改三分（无会话元数据 / 当前时间范围没有会话 / 筛选无结果），
  **预设时间范围不再算筛选**，`hasNarrowingFilters` 只认来源 / 项目 / 模型（桌面）或
  自定义起止时间 / 设备 / 来源（web），同步回写 ui-spec 空态规范与 web 中英文案；
  桌面端以整份侧车解析行数区分「真没数据」与「窗口内没数据」，第三类给
  「查看全部会话」直达总计。② CLI 的 `session.queue.jsonl` 按 `ended_at` 降序全量
  重写（最新在文件头），而 >8 MiB 时原降级走 `read_tracker_tail` 读末尾会拿到最旧
  记录；新增 Rust 命令 `read_tracker_head`（同样的 canonical 守卫与 512 KiB 上限、
  丢弃被截断的末行），`use-sessions.ts` 降级改调它，`partial` 提示「仅显示最新部分」
  自此名实相符。§12.4 D7 的「只读尾部」口径已加复核注记。

## 11. 发版流程（D5 起）

发布流水线 `release-desktop.yml`，机制对齐 `release-cli.yml`：

- **tag 触发**：`desktop-v*`；tag 必须落在 main 上（旧提交打 tag 不触发）；三处版本
  强校验（`apps/desktop/package.json` = `src-tauri/tauri.conf.json` =
  `src-tauri/Cargo.toml` = tag）。
- **构建**：Windows runner + stable Rust；`tauri build`（NSIS +
  `createUpdaterArtifacts` 产出 `.sig`）；Ed25519 私钥经 GitHub secrets 注入
  （`TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`），公钥在
  `tauri.conf.json`——密钥由操作者持有、Agent 代生成（§1 #7），**私钥文件是唯一本地
  副本，丢失后已装用户永远无法再收更新**。
- **发布**：`scripts/admin/desktop-release/assemble-updater-manifest.mjs` 组装
  `latest.json`（安装包改名 `token-usage-desktop_<ver>_x64-setup.exe` 免 URL 空格编码，
  签名内联进 manifest），Release 以 **draft** 创建、正文取 `apps/desktop/CHANGELOG.md`
  对应段。**updater 端点读专用滚动 Release**：`releases/download/desktop-latest/latest.json`
  （不是 `/releases/latest/download/latest.json`——本仓库同时发 CLI 与桌面端，CLI 发版会
  占据 `releases/latest`，该 Release 没有 latest.json，已装客户端「检查更新」因此报
  `Could not fetch a valid release JSON`，2026-11-12 实测 `cli-v0.5.5` 即触发）。滚动清单由
  `.github/workflows/release-desktop-latest.yml` 维护：`release: published`（仅 `desktop-v*`）
  时下载该版 `latest.json` 并覆盖上传到 `desktop-latest` Release（`--latest=false`，不抢
  GitHub 的 latest 标记）。draft 不含可下载的清单，操作者 publish 前已装用户不会收到更新
  提示——publish 即人工放行闸门。同时 `hooks/use-updater.ts` 把清单缺失（404 / invalid
  release JSON）降级为「尚未发布更新清单」，不再当作失败报错。
- **日常步骤**：bump 三处 version + CHANGELOG 顶部补节 → push main（CI 全绿）→
  `git tag desktop-v0.x.y && git push origin desktop-v0.x.y` → CI 出 draft → 操作者
  Release 页 publish。
- **Rust 依赖披露**（§6 承诺）：Rust 侧直接依赖 = `tauri 2`（tray-icon feature）+
  `tauri-build 2` + D4 三插件（notification / autostart / single-instance）+ D5 两插件
  （updater / process）+ 2026-11-12 操作者要求「导出自己选保存位置」引入的 `dialog 2.8.4`
  （官方件，只在 Rust 侧驱动保存对话框，webview 不开 `dialog:*` 权限；传递依赖 rfd /
  tauri-plugin-fs 以 Cargo.lock 为准）；其余传递依赖以入库的 `src-tauri/Cargo.lock` 为准
  （lockfile 入库 + CI `--locked` 锁死，防漂移）。
- **本机（公司机）验收注记**：UAC 关闭 + 任务栏 High ⇒ 安装版托盘注册不上，可尝试对
  安装后的 exe 打 **High** 完整性标签兜底（六追记证明 High 可注册；Medium 的 WebView2
  拒绝仅出现在 Low 标签的构建目录 profile 下，安装版数据目录在 `%APPDATA%` 继承
  Medium，理论可启动，实测为准）；toast 依赖系统通知管道，D4 记录 ④ 的系统 AUMID
  探针未弹出 ⇒ 本机通知可能整体关闭，验收时先查系统设置的通知总开关。
  **2026-11-10 实测补充**：  兜底有效——对安装版 exe 打 High 标签后托盘注册成功、菜单
  全项可用，High 进程的 WebView2 也正常（修正四追记「Medium 及以上全拒」的表述：那是
  Low 标签构建目录的 profile 继承问题）。
  **2026-11-12 复核（推翻「每次升级都要重打」）**：0.3.0 从 GitHub 安装后，`icacls` 看
  安装版 exe **没有任何完整性标签**，进程由 `explorer.exe` 拉起，父子双方 IL 均为 High
  （本机 UAC 关闭 + 内置 Administrator，整个 shell 在 High）；UI Automation 遍历任务栏
  能看到 `Token Usage` 托盘按钮。结论：真正的充分条件是 **应用进程 IL ≥ 任务栏 IL**，
  从 explorer 启动天然满足，手动打标签只是历史兜底手段，**不再作为安装/升级后的必做
  步骤**（该建议已从验收流程中移除；只有应用被低完整性父进程拉起时才会缺托盘，此时按
  六追记 ① 降级为「关窗只最小化」并在监控盘顶部显示 `TrayNote`）。

## 12. 0.2 产品迭代计划（2026-11-10 立项；D6 当日放行，各轮验收状态见 §12.8）

M-desktop 0.1.0 收官后的产品向迭代：把桌面端从「来源构成 + 采集健康」推进到「本机用量
构成与使用节奏」，仍守本机视角、零网络、零新依赖。范围经操作者 2026-11-10 拍板：**成本
不进桌面、不做账号成就页（只留 web 深链）、窗口状态手写、会话读取新增只读尾部命令**；
D6 → D7 → D8 逐期由操作者验收后进入下一期。

### 12.1 原则

- 单列 400×620（min 340×480），所有卡片沿用 `Card` 复合结构、既有 tokens 与三态规范。
- 数据只读：继续走 `read_tracker_file`（canonical + 8 MiB 上限）；新增 `read_tracker_tail`
  只读尾部、同样目录守卫，不写任何文件，CLI 仍是唯一写入方。
- 零网络（默认）：除用户点击深链 / 仓库链接外不发请求；不请求 `/api/functions/*`、不直连 Supabase。
  2026-11-10 操作者追加的例外：点击采集操作卡的 CLI 版本 Chip 时请求一次 npm registry 最新版
  （`use-cli-latest`，8 s 超时、结果只存组件态、失败降级为「检查失败」）——仍不发请求给
  自托管实例，页面加载也不自动探。
- 零新运行时依赖：图表用手写 CSS / SVG；窗口尺寸记忆用 localStorage。（2026-11-11：
  图表约束废止，见 §6 recharts 报批记录。）
- 成本与计价不进桌面（边界 4 不变，即便 `project.queue.jsonl` 自带 `total_cost_usd`）；
  账号成就只做深链。（2026-11-11 反转：统计卡「预计费用」随 D9 进入桌面，D10.1 起读时
  计价——`lib/pricing.ts` 与 web 逐字同源、`rowCostUsd()` 同 `computeRowCost` 规则，
  口径见 §12.12；账号成就边界不变。）

### 12.2 数据面增量

| 来源 | 用途 | 读法 |
|---|---|---|
| `queue.jsonl`（已有） | 模型 / 项目聚合、日聚合（热力图） | 既有 last-wins + 窗口过滤；`QueueBucketRow` 已含 `model` / `projectKey` |
| `project.repos.state.json` | `project_key → GitHub URL`（`confirmed` 映射） | 新增只读；缺失 / 损坏按「无链接」降级 |
| `session.queue.jsonl` | 最近会话（只取尾部） | 新增 `read_tracker_tail(rel, max_bytes≤512 KiB)` |
| `queue.state.json` / `logs/sync.log`（已有） | 数据新鲜度 / 最近同步 | 不变 |

项目口径：以 `queue.jsonl` 的项目拆分行聚合（与来源 / 模型同一 last-wins 基线），仓库链接
按 `project_key` 查 `confirmed` 映射；无映射的项目只显示名字，不推断 URL。

两边的键口径不同（2026-11-10 第一轮验收发现）：`queue.jsonl` 的 `project_key` 是目录
basename（`token-usage`），`confirmed` 映射的键是 CLI 的仓库身份（`baiwumm/token-usage`），
同一个工作区还可能在队列里两种键各留一批行。因此 `lib/project-repos.ts` 建**别名索引**
（完整键 + 仓库名，均小写），命中后把同一仓库的行**合并成一行**（显示名优先裸 basename），
占比按窗口总量重算。仍是精确匹配，不做任何 URL 推断。

### 12.3 D6（desktop v0.2.0，约 2 天）：用量构成

| 项 | 内容 | 验收线 |
|---|---|---|
| 周期切换 | `period-filter.tsx`：「今日 / 近 7 天」（默认近 7 天），作用于模型 / 来源 / 项目三卡；选择写 preferences | 三卡联动；重启保留；顶部单值卡口径不变 |
| 主要模型卡 | `model-mix-card.tsx`：Top 5（最多 8 行）+「其余 N 个模型」；模型名截断 + tooltip；占比条与来源卡同构 | Top 5 与 web 同设备同窗口人工核对一致；空态正常 |
| 项目与仓库卡 | `project-repos-card.tsx`：Top 5 项目（同一仓库的 basename / `owner/name` 行已合并）；有 confirmed 仓库的显示 GitHub 图标 + 项目名（点击 `open_in_browser`），无仓库只显名字；底部「已归因 X% · 其余未归因」；右上「在 web 查看项目」 | 链接打开正确 URL；未归因占比与 queue 残差行一致；无网络请求 |
| 用量卡收敛 | 顶部三格改两格（今日 / 近 7 天）；「待上传」并入同步卡（数据已有） | 400 / 340 宽无横向滚动；同步卡信息不重复 |
| 深链 | `lib/links.ts` 统一拼 `${dashboardUrl}` + `/`、`/projects`、`/sessions`、`/achievements`；项目卡 footer 与设置「网页」组提供入口；未配对时隐藏入口 | 未配对无入口；已配对点击正确 |
| 数据新鲜度 | 同步卡加「更新于 HH:mm:ss」+ 手动刷新图标（复用现有 refresh） | 轮询后时间更新；失败态可见 |

验收补充：`pnpm verify` 全绿；`read_tracker_file` 白名单未放宽；断网时除点击链接外功能不变。

**第一轮验收反馈（2026-11-10，操作者，8 条）**：① 周期切换未选中段与卡片底色融为
一体 → 去掉 `variant="ghost"`，用 HeroUI 默认填充态 + `ToggleButtonGroup.Separator`；
② 主要模型卡补 vendor Logo（移植 web `modelLogoFile` 前缀表，`components/model-icon.tsx`
+ 共用 `components/brand-logo.tsx`）；③ 项目卡同一仓库出现 basename 与 `owner/name`
两行、且 basename 行无链接 → 别名索引 + 按仓库合并（见 §12.2）；④ 手动刷新太快看不见
→ 图标钮改 `Spinner`，且 `refreshNow` 至少保持 400 ms；⑤ 托盘「立即同步 / 暂停·恢复」
不动窗口 → Rust 在派生 CLI 前后发 `tray-cli-start/done` 事件，`use-monitor` 据此置
pending、退出后重读文件；⑥ 设置「网页」四钮太散 → `fullWidth`；⑦ CLI 版本从说明行改为
页头右侧 `Chip`（与标题垂直居中）；⑧ 页头主题钮旁加 GitHub 仓库图标钮（`lib/links.ts`
的 `REPO_URL`，配对向导页头同源）。

**第二轮验收反馈（2026-11-10，操作者，4 条）**：① 三张构成卡不再重复周期文案（周期只由
`PeriodFilter` 表达）；② 设置「网页」组四钮补图标，取 web 侧栏同一组（Display / Folder /
ListUl / Medal）；③ CLI 版本 Chip 点击可探测 npm 最新版，是最新时旁边显示「最新」Chip
（网络例外见 §12.1）；④ 底部脚注去掉 CLI 版本与实例 host，只留「主机名 #machineId 前 8 ·
© 2026 Token Usage」。⑤ CLI 自报版本带 `v` 前缀时卡内拼成「vv0.5.4」→ 展示统一经
`lib/version.ts` 的 `bareVersion` 去前缀后再加一个 `v`。以上 5 条随 desktop-v0.2.1 发布。

### 12.4 D7（desktop v0.3.0，约 1.5 天）：使用节奏

1. **热力图** `heatmap-section.tsx` + `heatmap-helpers.ts`：近一年（53 周 × 7 天），展示
   同 web 仪表盘活跃热力图（月份 / 星期标尺、5 档色阶、横向滚动并默认滚到最新），日聚合按本机
   时区；tooltip「日期 · tokens · 会话」；legend；`aria-label` 汇总。
   验收：日合计与「今日 / 近 7 天」卡边界一致；栅格自身横向滚动、页面不出横向滚动；reduced-motion 无动画。
   **（2026-11-11 本项实现已被 D7.1 取代，见 §12.9；横向滚动与「不拉伸」验收随之作废。）**
2. **最近会话** `recent-sessions-card.tsx`：最近 5 条（相对时间 + 模型 + 项目 + tokens），
   只读会话元数据，**不显示正文 / 标题 / 绝对路径**；Rust 加 `read_tracker_tail`，每 60 s
   或跟随主轮询但只读尾部。
   验收：与 `session.queue.jsonl` 尾部逐条一致；隐私字段不出现；1.7 MB 文件不全量 IPC。
   **（2026-11-13 复核：本条「只读尾部」口径已被 D7.1 取代；会话侧车由 CLI 按
   `ended_at` 降序全量重写、最新在文件头。0.4.1 起会话视图整读全文件，超 8 MiB
   时降级改走 `read_tracker_head` 读头部 512 KiB，见 §10。）**
3. **卡片显隐**（设置面板）：来源 / 模型 / 项目 / 热力图 / 最近会话，默认前三开。
   验收：开关即时生效并持久化；默认界面保持简洁。

### 12.5 D8（desktop v0.4.0，约 1 天）：交互打磨

1. 采集操作卡：立即同步 / 暂停·恢复留主区；Doctor / 对账收进「维护」折叠（默认收起），
   结果块跟随折叠展开。（**D9 起实际改为页头图标按钮 + 窄窗按钮行，折叠未落地**，见 §8。）
2. 窗口尺寸记忆：localStorage 存宽高，启动时 `set_size`；不引窗口状态插件。
3. 失败输出加复制按钮（**2026-11-13 在 `sync-status-card.tsx` 补齐**）；设置补「GitHub 仓库」
   入口（本应用仓库，非项目仓库）。
4. 空态 / 骨架补齐新卡片；340 px 复核；热力图键盘可达复验。

验收：重启后窗口尺寸保留；默认折叠不挡主操作；复制可用；`pnpm verify` 全绿。

### 12.6 明确不做（本轮）

成本 / 计价与费用弹窗、账号成就页与进度、Sessions / Projects 全页与筛选、wrapped / 分享卡 /
公开徽章、云端服务探活、webview 登录态。（2026-11-11 操作者反转其中三项并立项 D9–D11，
见 §12.10：成本进统计卡、会话/项目本地详情、分享卡完整移植；账号成就、公开徽章、
云端探活、webview 登录态维持不做。）**2026-11-12 再反转一项**：会话视图的项目 / 模型
筛选已随 §12.14 落地（仅会话视图内，Projects 页与全库筛选仍不做）。

### 12.7 规范与发版

- 文件命名沿用登记集，不新增后缀角色：`period-filter.tsx`（`-filter`）、`model-mix-card.tsx` /
  `project-repos-card.tsx` / `recent-sessions-card.tsx`（`-card`）、`heatmap-section.tsx`
  （`-section`）、`heatmap-helpers.ts`（`-helpers`）、`use-heatmap.ts`（钩子）、`lib/links.ts`
  （纯逻辑）。
- 实现时把新卡片 anatomy 回写 `docs/ui-spec.md`「桌面端」节；AGENTS 的 UI 规则不变。
- 每期 bump 三处 version + CHANGELOG，tag `desktop-v0.2.0` / `desktop-v0.3.0` /
  `desktop-v0.4.0`。（2026-11-12 复核后，安装/升级不再需要给 exe 打完整性标签，见 §11。）

### 12.8 放行状态

**D6 / D7 / D7.1 / D9 / D10 / D10.1 均已验收关闭（2026-11-11 操作者验收，见 §10）**：
0.2 产品迭代（含 D10.1 三轮验收修复）到此整体收尾；
**D11（会话视图 / 分享卡 / 窗口尺寸记忆）已于 2026-11-12 交付并验收关闭**（§12.13，两轮操作者反馈修正后本机安装验收）；
D8 原范围（维护操作 / 复制按钮）被 D9–D11 吸收：维护折叠实际改为页头图标按钮 + 窄窗
按钮行，复制按钮原记「随 D9–D10 落地」有误、于 2026-11-13 在 `sync-status-card.tsx`
补齐；**窗口尺寸记忆已随 D11 落地**（操作者 2026-11-12 拍板「一起做」）。
**§12.14 三项（会话项目 / 模型筛选、设置目录入口、托盘周期切换）已于 2026-11-12 交付，
经三轮操作者反馈修正（§12.14.1–.3）后本地 0.4.0 安装包验收通过**；`desktop-v0.4.0`
tag 于 2026-11-13 推送、CI 出 draft Release，publish 仍由操作者在 Release 页放行。
**0.4.1 设置改版（四项合并，见 §10）已完成开发并验收通过；同版复核修复（会话空态
三分 + `read_tracker_head`）已并入、重出本地 NSIS 包供复验，未推 main / 未打 tag /
未 publish。**

### 12.10 D9（2026-11-11，操作者八点需求的第 1/2/3/7 项）：头部改造 + 四统计卡 + 热力图对齐

口径拍板：热力图**本机口径**（web 是账号全设备口径，数字必然有差异，卡内注明「仅本机
数据」）；热力图**恒近一年**锚定末日（web 同款）；图表渲染**引入 recharts**（§6 报批）；
分享卡完整移植放 D11。**零契约变更**——cost/缓存拆分/credits 本就在 queue.jsonl 行内，
仅桌面解析器此前丢弃。

1. **头部改造**（`monitor-header.tsx`）：品牌 lockup 移除（窗口标题已表明身份），左侧改为
   `PeriodFilter`（今日 / 7D / 30D / 总计，size sm，连接式 ToggleButtonGroup）；右侧按钮全部
   `variant="tertiary"`；新增 4 个 CLI 图标按钮（立即同步 / 暂停·恢复 / Doctor / 对账，
   ArrowRotateRight·CirclePause·CirclePlay·Stethoscope·ListCheck）置于 GitHub 左侧，
   **<640px（sm 断点）隐藏**——400px 默认窗口头部放不下 7 个图标（宽度账见 §12.7 探查），
   窄窗由「采集与同步」卡内按钮兜底。
2. **采集操作卡溶解**：`cli-actions-card.tsx` 删除；版本 / 更新探针 chip、运行输出块
   （danger Alert / 输出 tail）并入「采集与同步」卡（`sync-status-card.tsx`），四按钮在该卡
   内以 `sm:hidden` 行保留窄窗兜底。
3. **四统计卡**（`usage-cards.tsx` 重写）：总 Tokens / 预计费用（采集端 `total_cost_usd`
   求和，口径注明「采集端估算」）/ 会话数 / 缓存率（`(cached + cache_creation) / total`），
   全部跟随头部筛选；环比 = 与前一等长窗口对比（今日 vs 昨日、7D vs 前 7 天、30D vs 前
   30 天、总计无基线隐藏），↑ accent / ↓ danger；迷你图 recharts `Sparkline`
   （`mini-charts.tsx`，今日按小时 / 7D·30D 按日 / 总计按近 12 个月）；窗口无用量则
   环比与迷你图都不显示（操作者规则）。数据面：`queue-lines.ts` 解析器补收 cost / 缓存
   拆分 / input / output / reasoning / credits，`UsageWindow` 扩展对应字段与 `cacheRate`，
   快照新增 `yesterday` / `prevWeek` / `prevMonth` 窗口与 `series`（时 / 日 / 月 fold，
   单次 dedupe 复用）。
4. **热力图对齐 web**（`heatmap-helpers.ts` + `heatmap-section.tsx`）：窗口改 **364 天
   （52×7）锚定今天**（`from = to − weeks*7 + 1`），**未来日不再渲染**；移植 web
   `alignWeeks`（首列周一前补 null、尾列 null 收口、null 占位防 auto-flow 漂移）；加入
   web「全部平台」多选筛选（`heatmap-filter.tsx` 移植，全部 / 清空 / 已选计数，等级与
   合计按所选来源客户端重算，筛选后合计入描述行）；常量 53→52 周。
5. **设置弹窗**加宽 `max-w-md` → `max-w-2xl`（操作者要求；仅 ≥472px 窗口可见差异）。
6. `app.css` 补 `--color-chart-1..8` 两组色板（web globals.css 同款），recharts 图表
   上色与 web 一致。
   验收：头部筛选四档切换全页联动、统计卡环比与迷你图随窗口出现/隐藏、热力图无未来
   格且首列周一前补空、≥640px 头部出 4 图标按钮而窄窗按钮在同步卡、`verify` 全绿。

### 12.11 D10（2026-11-11，操作者八点需求的第 4/5 项）：用量趋势 + 构成照搬 + 项目详情

recharts 已随 D9 落地（§6）。**仍零契约变更**——成本列当时来自 queue.jsonl 行内
`total_cost_usd` 求和（采集端估算口径，预计费用同理）；**D10.1 起改为读时计价**，见
§12.12，本段保留 D10 当时口径。

1. **用量趋势卡**（`trend-card.tsx` + `components/charts.tsx` + `lib/charts-theme.ts`，
   web 趋势同款移植）：按日 / 按月 + Token / 成本双 Tabs；Token 视 = 堆叠柱 输入 / 缓存 /
   输出（chart-1/3/2），成本视 = 单列 amber 柱；共享 tooltip 全指标；figure + sr-only
   figcaption 文字摘要。数据 = 快照新增 `trend: Record<UsagePeriod, {daily, monthly}>`
   （预设窗口日桶零填充，总计只保有数据的桶）；新 `showTrend` 偏好默认开，设置「卡片显示」
   加第 6 个开关。UsagePoint / DailyUsage 扩 `inputTokens` / `outputTokens`。
2. **Top 模型卡**（`top-models-card.tsx`，取代 `model-mix-card.tsx` 已删除）：前 8 行
   `ModelIcon` + tokens · 占比 · **成本**（`ModelUsage.totalCostUsd`，`SourceUsage`
   同步加成本列）+ `Meter` 条；「成本分析」按钮开 `cost-dialog.tsx`（总成本 / 总 Tokens
   头部、每日成本 CostTrendChart 面积图、按模型 / 按来源两组表；无 web 的未定价提示——
   D10 当时桌面不做读时计价，**D10.1 已反转**：移植 web 同源计价引擎，仅未定价提示仍不做）。
3. **来源构成卡重写**（`source-mix-card.tsx`）：web 来源面板同款——`DonutChart`
   （`mini-charts.tsx` 补齐，内孔 64% / 外径 94% / 中心合计）+ 前 5 行点击隐藏/显示
   （隐藏出分母、占比显示「—」）+「查看全部（N）」Modal（`monitor/breakdown-table.tsx`
   新组件，web BreakdownTable 移植，`-table` 后缀经 §5 登记）+「恢复显示全部来源」。
4. **项目与仓库卡重写**（`project-repos-card.tsx`）：web `/projects` 列表行同款——字母
   方块 logo + 名称 + GitHub mark + 占窗口 caption + 来源 icon 条（≤5 +「+N」）、tokens +
   相对 meter、底边「成本 · 会话条目 · 最近活跃」细线；行点击开
   `project-detail-dialog.tsx`（6 KPI + 每日 Token 柱图 ≤60 天 + Token 构成条 + 逐来源
   行 + 打开仓库），按需经 `lib/project-detail.ts` 从快照 `rows`（去重行随快照保留，供
   drill-down）折叠；`ProjectUsage` / `ProjectRepoUsage` 扩 `totalCostUsd` /
   `lastActiveMs` / `sourceTokens` / `memberKeys`（仓库合并折算 sum/max/merge）。
5. **布局**：趋势卡插入热力图之后；Top 模型 + 来源构成 `lg:grid-cols-2` 双栏（web
   breakdown 同款），单一可见时占满整行；原「用量构成」分组标签行删除（各卡自题）。
   验收：趋势双 Tab / 双指标切换、双栏宽窗并排、成本分析弹窗三段、来源隐藏/显示与
   环形图联动、项目行点击出详情且数字与行一致；`verify` 全绿。

### 12.12 D10.1 验收修复（2026-11-11，操作者 D10 验收三点反馈）

1. **费用全 0 的根因与修复**：采集端对每行写 `total_cost_usd: 0`——计价是 web 读时行为
   （vendored LiteLLM 快照 + 匹配器）。桌面同步移植该引擎（`lib/pricing.ts` +
   `pricing-matcher.ts` + 三份 JSON 快照，web 逐字同源），`queue-lines.ts` 的
   `rowCostUsd()` 按 web `computeRowCost` 同规则计价（权威上报值优先、免费/订阅
   源为 0、DeepSeek 时段价、长上下文与 priority 分层），WeakMap 按行缓存；**所有成本
   口径（统计卡 / 趋势 / Top 模型 / 来源 / 成本分析 / 项目）随之切换为读时计价**。
   实测本机 1150 行去重队列 = **$132.24**（此前恒 $0.00）。
2. **项目详情对齐 web 版式**（`project-detail-dialog.tsx` 重写）：web 双栏结构——
   左栏 identity（logo / 显示名 / 目录名 / 打开仓库）+「周期 · 口径：小时桶 · 仅本机
   数据」行 + 六格 KPI + 三段脚注；右栏 其他字段（日峰值 / 最近活跃 / 积分）+ 每日
   活跃柱图（≤60 天，悬停含成本与会话条目）+ Token 构成条（输入/缓存/输出 + 含推理）
   + 按来源行（含「N 次对话」）。`buildProjectDetail` 增补 `peakDay` / `credits`。
3. **同步 web 编辑的项目信息**（契约 §2.13 + CLI 子命令 + 桌面拉取，操作者拍板「CLI
   中转完整方案」）：新增只读端点 `GET /api/functions/token-usage-account-project-profiles`
   （§2.7 catch-all 第 9 个 series，`loadProjectProfiles` 同读取路径，golden 测试
   `tests/contract/project-profiles-series.test.ts` 4 例）；CLI 新增
   `tokenusage project-profiles`（无参、单行 JSON stdout；凭证解析同 sync：config →
   cloud-device-token 文件、自定义 base 需配 anon key；未配对/HTTP 失败走 UsageError，
   5 个单测）；桌面经 `run_cli` 拉取（`use-monitor.ts` `refreshProfiles`，挂载 +
   5 分钟节流 + 窗口可见性触发，失败静默保留旧值），`lib/project-profiles.ts` 解析，
   项目卡/详情按 `project_key`（含 `memberKeys` 兜底）取显示名 / logo（上传直链
   优先）/ repo_url；编辑仍走 web，桌面无 profile 写入面。
   验收：费用各卡非零且与 web 量级一致；详情双栏版式；web 改过显示名/logo 的项目在
   桌面列表与详情同步；未配对机器静默降级为队列 key + 字母方块。

### 12.12.1 D10.1 第二轮验收反馈（2026-11-11，三点）

1. **费用显示统一美元窄符号**：`lib/format-tokens.ts` 的 `formatCost` 改
   `currencyDisplay: "narrowSymbol"` + 两位小数（zh-CN 默认输出 `US$11.98`，现为
   `$11.98`），与 web `formatCost` 同规则；不足 1 分同 web 记 `<$0.01`。所有费用口径
   （统计卡 / 趋势 / Top 模型 / 来源 / 成本分析 / 项目行与详情）经此一处格式化。
2. **统计卡数值动画 + 环比 Chip + 删说明行**（`usage-cards.tsx`）：数值改 `FlowNumber`
   （`components/flow-number.tsx`，web 同名组件逐字移植，`@number-flow/react` 0.6.2，
   依赖登记见 §6）——切周期时卡片保持挂载、数字滚动；环比徽章改 HeroUI `Chip`
   （`size="sm" variant="soft"`，↑ `success` / ↓ `danger`）；删除第三行说明文案（原
   「会话 N / tokens N / 缓存 N tokens / 采集端估算」与卡内信息重复）。
3. **项目 logo 同步修正**（`lib/project-profiles.ts` + `monitor/project-logo.tsx`）：
   候选顺序改为与 web 一致——`logo_url`（手工链接）→ `logo_upload_url`（上传直链）→
   字母方块；`ProjectLogo` 对 `<img>` 加载失败逐级回落。此前上传优先，web 改成链接
   logo 后（上传对象仍在库中）桌面一直显示旧上传图，即本轮反馈的「没同步」。
   验收：`pnpm --filter @token-usage/desktop verify` 全绿（lint / tsc / 119 例测试 /
   vite build）。

### 12.12.2 D10.1 第三轮验收反馈（2026-11-11，三点）

1. **环比数字也做动画**（`usage-cards.tsx`）：Chip 内容改 `FlowNumber`，箭头作为字符串前缀、
   百分比作数字滚动，切周期时与卡值同步过渡。
2. **热力图跟随周期**（`heatmap-helpers.ts` + `heatmap-section.tsx` + `monitor-body.tsx`）：
   新增纯函数 `heatmapPeriodStartMs`（今日 / 近 7 天 / 近 30 天按日历日，总计为 0）与
   `clipHeatmap`（**网格格数与列数不变**，窗口外日期置零、活跃日 / 合计重算；2026-11-11
   验收第四轮按操作者口径修正：切周期只换数据、不换格子数）；卡片接收 `period`，标题后缀
   显示 今日 / 近 7 天 / 近 30 天 / 近一年。新增 2 例单测。
3. **项目 logo 仍不同步的根因**：`run_cli` 的 `CLI_COMMANDS` 白名单漏了 `project-profiles`
   （Rust 侧直接返回 `command not allowed`，前端 catch 后静默保留字母方块）；本机全局 CLI
   还是 npm 上的 v0.5.4（不含 §2.13 子命令）。修复：白名单补第 7 项（需重编译安装包）；
   本地验收环境用 `npm i -g ./packages/cli` 安装工作区 CLI（与 0.5.4 同版本号但含新子命令）。
   **发行注意**：当时 `project-profiles` 子命令尚未随 npm 发版，其他机器需先升级
   `tokenusage-cli` 才能看到 web 编辑的显示名 / logo（已于 2026-11-11 随 0.5.5 发版解决，
   见下段）；旧 CLI 仍静默降级（设计如此）。
   **服务端前提（已解除）**：当时部署的 web 实例仍只认 8 个 series，返回 `404 Unknown
   account series: project-profiles`；2026-11-11 该版部署上线后实测 200（18 条 profile，
   其中 9 条带 logo，`logo_url` 地址均可加载）。
   **真正的最后一环——Volta 化石副本**（§12.1 ⑩ 的反方向：那次是 image-dir 副本盖住了
   packages 权威副本，这次是 packages 副本没跟上）：公司机 PATH 命中
   `%LOCALAPPDATA%\Volta\bin\tokenusage.cmd` 垫片，垫片执行 `volta run tokenusage`，用的是
   `tools/image/packages/tokenusage-cli/node_modules/tokenusage-cli` 这份 2026-11-10 的**旧
   副本**（不含 §2.13 子命令，`Unknown command` → exit 1 → 前端 catch 静默降级）；而
   `npm i -g ./packages/cli` 只改了 `tools/image/node/<ver>/node_modules/tokenusage-cli`
   （符号链接到工作区，终端里 `which tokenusage` 命中的是它，所以人工验证一直是好的）。
   临时修复：把 packages 下那份旧副本改名为 `tokenusage-cli.bak-20261111`，同路径建
   junction 指向 `packages/cli`（重启应用后 logo 立即正常，截图复验）；0.5.5 发版后已改为
   `volta install tokenusage-cli@0.5.5` 的正式副本，备份目录已删。**判断法**：桌面端行为
   与终端 `tokenusage` 不一致时，先
   看 `volta list` 里 `tokenusage-cli` 的路径与 `grep -c project-profiles
   .../tools/image/packages/tokenusage-cli/node_modules/tokenusage-cli/src/cli.js`，两份副本
   都要是新代码；junction 会被后续 `volta install` 覆盖，升级后需重新对齐。
   **发行（2026-11-11 已完成，`tokenusage-cli@0.5.5`）**：`project-profiles` 子命令已随 npm
   发版，其他机器升级 CLI 后即可同步；旧 CLI 仍静默降级（设计如此）。本机验收：Volta 两份
   副本（packages 权威副本 + image-dir 副本）均为 0.5.5，`.runtime-ready` 0.5.5，`doctor`
   17 OK，`sync` 6,366 文件 / 上传 2 行 / sessions 1-1，`reconcile --days 1` 47-47 桶全对齐，
   桌面端重启后页脚 `tokenusage-cli v0.5.5` 且项目卡 logo 正常。发版与验收记录见
   `docs/cli-release.md` §十四。
   另：服务端对 `token-usage` / `margin-app` / `TokenTracker` / `TokenTrackerSelfhost` /
   `baiwumm` 等尚未设置 logo 的项目返回 null，这些行在 web 与桌面都是字母方块。

### 12.9 D7.1 验收期追加轮（2026-11-11，操作者需求；无独立版本号，随下次发版带走）

1. **定宽居中**：`monitor-body.tsx` 主内容列加 `mx-auto w-full max-w-6xl`（同 web 仪表盘
   1152px），最大化窗口不再满宽拉伸；默认窗口 400×620 不变（尺寸记忆仍归 D8）。
2. **活跃热力图 web 同款移植**：`heatmap-section.tsx` 重写为 web `heatmap-card.tsx` 移植件
   ——`--heatmap-0..4` 色阶入 `app.css`、格子满年优先 15 px 下限、放不下自左裁周（与 web
   现行预期一致，2026-11-11 复核裁定）、月份 / 星期标尺、共享 portal tooltip
   `heatmap-tooltip.tsx`（日期 + 当日 tokens + 来源明细行；`-tooltip` 后缀经 §5 登记启用；
   不设「全部平台」来源筛选，同 web 公开页形态）。数据面：`heatmap-helpers.ts` 产出 web
   payload 形状（53 周一对其列、逐日 `canonicalSource` 归并来源、活跃日数、宽度适配纯函数），
   `aggregateQueueDays` 增逐日 sources，快照单次 dedupe 复用今日 / 7 天 / 30 天 / 总计四窗口；
   旧「使用节奏」固定 12 px 横向滚动实现连同其「不拉伸」验收修正作废（ui-spec 桌面端节已同步）。
3. **四档周期**：`PeriodFilter` 扩为「今日 / 近 7 天 / 近 30 天 / 总计」，默认改为今日
   （存量存储的「近 7 天」仍合法）；快照新增 `month`（滚动 30 天）与 `all`（全文件）窗口，
   只驱动三张构成卡，顶部单值卡口径不变。
   验收：最大化窗口满 52 周、悬浮格出 portal tooltip 来源明细；四档切换与默认今日生效；
   顶部两张单值卡不随筛选变化；`pnpm --filter @token-usage/desktop verify` 全绿。

### 12.13 D11 会话与分享 + 窗口尺寸记忆（2026-11-12 交付并验收）

操作者四点拍板（2026-11-12）：① 会话视图 = 头部图标切换的独立视图（非弹窗）；② PNG 保存 =
Rust 命令写系统 Downloads（首版零新 crate；2026-11-12 第二轮操作者要求 CSV 导出自己选
保存位置，故新增对话框命令，见 §12.13.2）；③ 设备列 / 设备筛选
去掉（本机单设备数据，列恒为本机名无信息量）；④ 会话周期预设跟 web（今天 / 7D / 30D /
90D，默认 30D）。窗口尺寸记忆并入 D11，方案按 §12.1 既定裁定走 localStorage。

**数据面（`lib/sessions.ts`，全部只读）**：整读 `session.queue.jsonl`（复用
`read_tracker_file` 8 MiB 上限；超限报错含 "too large" 时降级 `read_tracker_tail` 512 KiB
并在视图顶部出「仅显示最新部分」提示条）；解析规则逐字对齐 CLI 上传映射
（`session-upload.js mapSessionRow`）：`session_id` 优先、`session_hash` 兜底，账户级来源
（cursor / trae-cn）整条剔除，token 计数会话级取嵌套 `tokens.*`、模型级取扁平字段（零值
省略补 0），zcode / opencode 的「reasoning 在 output 之外」按 CLI 同款 fold（仅当
`total ≠ identity 且 total = identity + reasoning` 时把 reasoning 吸进 output，total 不动），
恒等校验不过整行丢弃；`duration_ms` 按 `ended_at − started_at` 墙钟（wire 口径，非采集端
active-ms）；credits 仅收正值（四舍五入 6 位）。**成本 = web sessions 口径**：逐
`model_usage` 行以移植的计价引擎按峰值价读时计算（会话行无 `hour_start`，
`isDeepSeekOffPeak` 得 NaN → 不走峰谷价，同契约 §2.11 计价口径注记），会话成本 = 模型行
求和；CSV / 详情的每模型成本按 token 占比从会话成本等比拆分，列间永不打架。
排序 = `ended_at` 倒序、同刻按 `source`、`session_id` 升序（契约 §2.11）。
CSV 导出 = wire `format=csv` 形态：同列名（`device_name` = 本机 hostname）、UTF-8 BOM +
CRLF + RFC4180 引号 + `= + - @` 制表前缀 `'` 防公式注入、10,000 行上限、文件名
`token-usage-sessions-<from>-<to>.csv`。**隐私**：title / `project_ref`（绝对路径）/
cache key 在解析层丢弃，永不进 UI；`project_key` 只取 basename。

**会话视图（`components/sessions/`）**：头部新增视图切换图标钮（`ListUl` ⇄ `ChartColumn`，
tooltip「会话」/「用量监控」，恒显——4 图标组下宽度账仍成立），监控盘 ⇄ 会话两视图互斥；
会话视图下头部周期筛选隐藏（其驱动构成卡，与会话无关）。筛选条（`sessions-bar.tsx`）：
周期预设连接式 `ToggleButtonGroup` + 来源 `Select`（本地 facets，`SourceIcon` + 显示名）+
「清除筛选」（有收窄条件才出现）+ CSV / 刷新图标簇（tooltip 带「上次更新」）。四张汇总卡
（`sessions-summary-cards.tsx`）：会话数 / 总 Tokens / 成本 / 平均时长（`每会话` 副标），
首载保留真标签、只对数字出骨架。列表（`sessions-table.tsx`）：**≥md 表格列 = 结束时间 /
来源 Chip / 项目 / 时长 / Token / 积分（窗口内 credits>0 才出现）/ 成本 / 模型（前 3 Chip
+ `+N`）/ 详情**，整行 `onAction` 开详情；**<md 堆叠 Card 行**（web 移动端同款）——400px
默认窗走堆叠形态，最大化走表格；分页默认 20/页（10/20/50/100，切页大小锚定当前页），
页脚「第 x-y 条，共 n 条」+ 上一页 / 下一页 / 页码。详情弹窗（`sessions-detail-dialog.tsx`）：
来源 / 项目双 Chip（无设备 Chip）、meta 两列（结束时间含相对时间 + 时长）、Token 拆分
（输入 / 缓存读取 / 缓存写入 / 输出 / 推理 / 总计 / 计费[=总计] + 积分卡）、模型拆分
`BreakdownTable`（`ModelIcon` + Token / 占比 / 成本）、隐私与成本双脚注；`session_id`
只在内部作 key。空态两分（无数据 → 等待新版采集器 + 升级文档；筛选无结果 → 清除筛选）。
模型 Chip 组 `model-chips.tsx`（`-chips` 已登记后缀）。数据钩子 `use-sessions.ts`：挂载 +
手动刷新读文件（不进 10 s 轮询，切视图即重挂载拿新数据）。

**分享卡（`components/share-card/` 拆分目录 + `share-card-dialog.tsx`）**：web 引擎逐字
移植——`broadsheet.ts` / `receipt.ts` / `neon.ts` / `vinyl.ts` 四画师、`helpers.ts`（去
`loadShareImage`，桌面无成就卡）、`palette.ts` 固定印刷色、`types.ts` 输入契约、`copy.ts`
（web zh 块逐字 + 桌面新增「已保存到下载目录」两条）、`share-hook-helpers.ts`（去 locale
形参，桌面单语）、`index.ts`（VARIANTS + 2x `drawShareCard` + ClipboardItem 复制）。
字体零新增：Maple Mono CN 已随桌面打包（`app.css` @font-face，THIRD_PARTY_NOTICES 已
登记），衬线走 Windows 系统栈。**本地投影（`lib/share-input.ts`）**：hero / 成本（读时
计价窗口合计）/ 来源榜 / 模型榜 / 峰值日（trend daily argmax）/ 会话数取自头部周期对应
用量窗；热力图按 D9 既定口径——本机、跟随周期裁剪（`clipHeatmap` 同思路），格级 = 窗口
内最大日四分位（与热力图卡同阈值），`streakDays` = 窗口内最长连续活跃日；`handle` =
hostname（缺省 "Token Usage"）；`periodLabel` = 预设日期区间（`M月d日 — M月d日`），总计 =
年份；`tickLabel` = 本机 UTC 偏移。窗口无用量 → 投影 null，头部按钮禁用。
**对话框**：左右两栏（预览 = 导出 PNG 本身，`<img>`；右 = 显示名称 TextField（不持久化，
`useDeferredValue` 防连击）+ 2×2 风格磁贴（特刊 / 小票 / 霓虹 / 唱片）+ 复制图片 / 保存
PNG + 隐私说明；切换交叉淡入淡出、`prefers-reduced-motion` 直接切换、**关闭态不重绘**
（最后一帧留在状态里过退场动画）。**入口**：头部 `NodesRight` 图标钮（`hidden
sm:inline-flex`，与 CLI 四钮同规则——400px 默认窗放不下，最大化/宽窗可用）。**导出**：
复制走 WebView2 原生 ClipboardItem（安全上下文可用），失败 toast 引导保存；保存走新增
Rust 命令 **`save_to_downloads`**（文件名字符白名单 `[A-Za-z0-9._-]` + 必须带扩展名 +
120 长度帽，Downloads 目录内撞名自动 `-2`/`-3`，返回落盘完整路径由 toast 播报）；
`lib/save-file.ts` 封装（dataURL → bytes / 文本 → bytes）。CSV 同走该命令。零新 Rust
crate（`download_dir` 是 tauri 核心 path API）。

**窗口尺寸记忆（`hooks/use-window-geometry.ts`）**：localStorage 键
`tokenusage.desktop.window`（width / height / x / y / maximized）；`onMoved` / `onResized` /
`onCloseRequested` / `visibilitychange→hidden` 四路防抖 300 ms 保存；尺寸存 CSS 逻辑 px
（跨 DPI 不变形）、位置存物理 px。恢复：窗口配置改 **`visible: false`**，挂载时读档 →
校验位置落在任一可用显示器范围内（否则放弃位置保居中）→ `LogicalSize` + `PhysicalPosition`
（或 `maximize()`）→ `show()`，无启动跳窗；lib.rs 加 **3 s 看门狗**（setup 后单次：届时仍
不可见则按默认几何 show），webview 异常不再丟窗口。capabilities 新增四条窗口 setter 权限
（`allow-set-size` / `allow-set-position` / `allow-show` / `allow-maximize`，仅 main 窗——
§12.1「窗口管理在 Rust」的既定例外，恢复本身必须在 webview 侧完成）。

**测试**：`lib/sessions.test.ts`（12 项：映射 / 隐私剔除 / 账户级剔除 / 恒等门 / fold /
models 求和门 / credits 与 last-wins / 排序 / 窗口 / 筛选聚合 facets / 分页 / CSV 形态）、
`lib/share-input.test.ts`（3 项：投影 / 周期标签与 handle 兜底 / 空窗口 null）。
`pnpm verify` 全绿（desktop 136 tests）。发版：三处 bump **0.3.0** + CHANGELOG，tag
`desktop-v0.3.0`。

#### 12.13.1 D11 第一轮验收修正（2026-11-12，操作者六条反馈）

1. **分页换行 / 形态**：手写分页（`w-28` 每页条数触发器换行 + 「上一页 n/m 下一页」
   挤一行）废弃；新增共享 **`components/table-pagination.tsx`**（web `TablePagination`
   单语移植，桌面统一表尾）——左范围摘要 / 中页码 `Pagination`（省略号窗口，内置
   `pageItems`）/ 右固定 `w-36` 每页条数；三栏 `md:grid-cols-[1fr_auto_1fr]` 同 web。
   页码组件 + 固定宽 Select 触发器同时根治换行。
2. **CSV 导出 toast 带路径**：成功播报改「已导出 N 条会话：<落盘完整路径>」，与分享卡
   保存同规则（回答「存哪了」）。
3. **分享卡排版塌**：移植时漏抄 web 弹窗的 **`max-w-none`**——HeroUI 默认 `max-w-md`
   把双栏压成 28rem，预览缩成一条；补上即复现 web 当年的同一修复（web 源码注释即化石
   证据）。
4. **默认今日 + 删最近会话卡**：会话视图周期默认与清除筛选目标改「今天」（原 30D）；
   **最近会话卡整体退役**（`recent-sessions.ts` / 卡组件 / 测试删除，`MonitorSnapshot`
   去 `recentSessions`，`use-monitor` 去尾部读取——`read_tracker_tail` Rust 命令保留，
   会话视图超限降级仍用），设置「卡片显示」五开关收为四开关，存量 localStorage 的
   `showRecentSessions` 键 normalize 掉不楔面板；ui-spec 桌面端节同步。
5. **刷新遮罩**：会话列表行区加 web `DataTableCard` 同款刷新遮罩（`bg-surface/60` +
   `backdrop-blur-[2px]` + 居中 `Spinner`，有行才盖）——此前只有刷新图标自转，快速点击
   肉眼无感。
6. **落地页入口**：设置「网页」组改**恒显**，首枚「落地页」（`Globe`，
   `LANDING_URL = https://token-usage.cc`，不依赖配对）；配对后追加原四枚实例深链，
   描述文案按配对态切换。落地页 2026-11-12 已上线（EdgeOne，`apps/landing`）。

修正后 `pnpm verify` 全绿（desktop 131 tests——recent-sessions 五测试随卡退役），安装包
重建 `Token Usage_0.3.0_x64-setup.exe`（本地无签名密钥，`.sig` 仍由 CI 发版生成）。

#### 12.13.2 D11 第二轮验收修正（2026-11-12，操作者四条反馈；**验收通过**）

1. **会话列表「详情」列被裁**：首版 `Table.Content` 用 `table-fixed` 把列宽钉死，「详情」
   `w-16`（4rem，减去单元格 `px-4` 只剩 2rem 内容宽）容不下「查看」按钮——按钮溢出
   单元格、越过表右缘，表现为被裁一截 + 横向滚动条。改自动布局（去 `table-fixed`，
   `min-w` 40rem），「详情」列给 `w-24`；列宽只剩偏好值，真实最小宽度由内容决定。
2. **CSV 导出可选保存位置**：新增 Rust 命令 `save_file_as`，用 `tauri-plugin-dialog`
   原生保存对话框（默认目录 = 桌面，文件名仍走同一白名单校验函数），对话框在 Rust 侧
   驱动，webview 只拿到落盘结果、不获得任意路径写权限。`lib/save-file.ts` 增
   `saveTextAs` 返回 `saved / cancelled / failed` 三态：取消不弹 toast，失败提示重试，
   成功播报完整路径。分享卡 PNG 仍走 `save_to_downloads`（不改动）。
3. **总计 vs web 数字不一致（39.92 亿 vs 156 亿）**：确认是口径差异——桌面只读本机
   `queue.jsonl`（本机开始采集起、含未上传部分），web 聚合账号全部设备与更早的服务器侧
   记录。说明挂在统计卡上：`period = 总计` 时「总 Tokens」标签旁一个 `CircleInfo` 图标 +
   HeroUI `Tooltip`（悬停/聚焦展开，其余周期不渲染）。首版是卡下一行
   `components/monitor/local-data-note.tsx`，操作者当日第二轮否决（说明行顶破卡片布局），
   该文件已删——仍保留 2026-11-11 「统计卡不长说明行」的裁定。
4. **手动检查更新恒失败**：根因不是网络——同仓库 CLI 发版（`cli-v0.5.5`）占据了
   `/releases/latest`，该 Release 没有 `latest.json`，插件报 `Could not fetch a valid
   release JSON from the remote`。端点改 `releases/download/desktop-latest/latest.json`
   （滚动清单，CI 在 `release: published` 时覆盖上传，见 §11）；`use-updater` 把清单缺失
   降级为「尚未发布更新清单，暂无更新可安装」，不再显示「检查更新失败」。

修正后门禁：`pnpm --filter @token-usage/desktop verify` 全绿（lint / tsc / 131 tests /
vite build）；本地重建 NSIS 安装包（无签名密钥，`.sig` 仍由 CI 生成）。

第三轮（同日，操作者点名「总 Tokens 旁图标 + Tooltip，不要额外一行」）：第 3 条的说明行
改挂到标签旁的 `CircleInfo` + `Tooltip`，`local-data-note.tsx` 删除；重建安装包。

**验收结论（2026-11-12 操作者）**：四项全部通过，D11 关闭。发版后（`desktop-v0.3.0`
已 publish，`desktop-latest/latest.json` 实测返回 0.3.0）操作者从 GitHub Release 下载安装，
打开与功能均正常。

### 12.14 0.4 迭代：会话 facet 筛选 / 目录入口 / 托盘周期（2026-11-12 立项）

操作者从候选里点名的三项，均在本机口径内、零新依赖：

1. **会话视图项目 / 模型筛选**：数据层 `filterSessions` 改收 `SessionFilters`（source /
   project / model，空串 = 全部；模型命中看行的 `model_usage`），新增
   `sessionProjectFacets` / `sessionModelFacets`（统一 `SessionFacet { key, sessions }`，
   按会话数降序 + 键名升序）。hook 里三张 facet 各按「时间窗 + 另外两个筛选」重算
   （faceted search：选项目不会把自己的选项收窄），任一筛选变更重置分页；
   `sessions-bar.tsx` 在来源 `Select` 后追加项目 / 模型两个 `Select`（纯文本 + 会话数，
   无新文件——`FacetSelect` 留在同文件）。CSV 导出跟随筛选结果，行为不变。
2. **设置「本机数据」**：Rust 新增 `open_tracker_dir {which: "tracker" | "logs"}`，白名单两
   目标 + 目录不存在时返回错误；`open_path` 按平台分派（Windows `explorer` / macOS `open`
   / 其他 `xdg-open`）。UI 为 2 列 secondary 按钮（`Folder` / `FileText`），失败 toast 区分
   「目录还不存在」与一般错误。
3. **托盘周期切换**：托盘菜单在用量行 / 状态行后插入 今日 / 7D / 30D / 总计 四项，点击由
   Rust 发 `tray-period`（payload `today|7d|30d|all`）；`monitor-body` 监听后写 preferences，
   `useMonitor(period)` 把用量行改成「今日 / 近 7 天 / 近 30 天 / 总计 tokens：…」，并在周期
   变更时立即重推（不等 10 s 轮询）。`TrayLabels.today` 更名 `metric`（Rust 结构 + JS payload
   同步）——这行已不再是「今日」专属。

#### 12.14.1 第一轮验收修正（2026-11-12，操作者四条反馈）

1. **Select 溢出**：长项目名把触发器撑开、压到相邻控件。照 web `device-filter-select` 的
   做法自定义 `Select.Value` 渲染（`truncate` + `min-w-0` 容器），并把项目 / 模型宽度定
   为 `w-40` / `w-44`（来源 `w-36` 不变）。
2. **去掉「清除筛选」按钮**：三个下拉未选时显示「全部 …」占位（列表里不再有「全部」项），
   选中后触发器长出 `Select.ClearButton`（空态自动隐藏，键盘 Backspace / Delete 同效）；
   筛选条不再有清除按钮，仅表格无结果态保留一个引导按钮。
3. **90D → 总计**：会话周期改为 今天 / 7D / 30D / **总计**，与用量页同名；总计窗口
   `fromMs = 0`（全量侧车），CSV 文件名对应段写 `all` 而不是 1970 日期。
4. **托盘周期加勾选**：四项改为 `CheckMenuItem` 单选组（Rust 结构多四个句柄）；
   `TrayLabels` 增 `period` 字段，`update_tray` 按它刷新四个勾选态，JS 在每次推标签时带
   当前周期。

测试：`lib/sessions.test.ts` 新增「总计窗口从 epoch 起」一例，共 134 例。修正后
`pnpm --filter @token-usage/desktop verify` 全绿，`cargo fmt --check` 与
`cargo clippy --release --all-targets -- -D warnings` 零告警；本地重建 0.4.0 安装包。

测试：`lib/sessions.test.ts` 14 例（新增项目 / 模型筛选与两张 facet；来源 facet 返回形状
改为 `{key, sessions}`）。门禁：`pnpm --filter @token-usage/desktop verify` 全绿；
`cargo fmt --check` 与 `cargo clippy --release --all-targets -- -D warnings` 本地通过。

#### 12.14.2 第二轮验收修正（2026-11-12，会话列表两条反馈；**验收通过**）

1. **下拉项溢出**：长项目名把 `Select.Popover` 撑宽、越过窗口右缘。项目 / 模型选项去掉右侧
   会话数（计数是首版最宽的那一段），`FacetSelect` 弹层加 `max-w-72`、选项文本
   `min-w-0 truncate`——长名以省略号收尾，弹层宽度不再随内容增长。
2. **触发器溢出（同一轮复验补修）**：HeroUI 的 `.select__value` 自带 `wrap-break-word`，
   选中值不截断、直接把 Trigger 撑破压到相邻控件。web 是在 `globals.css` 全局覆盖
   `.select__value { min-w-0 truncate }`，桌面端漏了这条——已照搬到 `src/styles/app.css`
   的 `@layer components`（与 HeroUI 同层、后置覆盖），一处生效于全部 Select。
3. **Select 样式统一**：会话视图的四个 `Select`（来源 / 项目 / 模型 + 表尾每页条数）去掉
   `variant="secondary"`，回落默认（primary）variant，与 web 仪表盘筛选条同形。设置面板的
   `Select` 保持 `variant="secondary"`（D4 验收要求，Modal 即 Surface 场景，不在本次范围）。

门禁：`pnpm --filter @token-usage/desktop verify` 全绿（134 例）；本地重建
`apps/desktop/src-tauri/target/release/bundle/nsis/Token Usage_0.4.0_x64-setup.exe`
（无签名私钥，`tauri build` 末步 updater 签名报错属预期，NSIS 包完整），交操作者安装验收。

#### 12.14.3 第三轮验收修正（2026-11-12，筛选联动；**验收通过**）

**问题**：三个 facet Select 已有选中值时切换周期（今天 / 7D / 30D / 总计），新窗口的
选项表可能不再包含该值——React Aria 找不到对应 item，触发器回落到「全部 …」占位，
但筛选状态仍在生效（列表按旧 key 过滤），ClearButton 变成孤立按钮，看上去像「清空了
却还是空列表」。

**修法**（照 web `sessions-client` 的做法）：新增 `lib/sessions.ts` 的
`withSelectedFacet(facets, selected)`——选中值不在新选项表里时，以 `sessions: 0` 置顶
补进选项表（计数只参与排序、不渲染），触发器保持显示已选名称、清除按钮语义正确。
`use-sessions.ts` 三张 facet 各包一层，选中值纳入 memo 依赖。数据层筛选行为不变（仍按
旧 key 过滤，空结果走既有「清除筛选」空态）。

测试：`lib/sessions.test.ts` 新增 1 例（共 135 例）。门禁同上全绿，并重打 0.4.0 安装包。
