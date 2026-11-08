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
窗口内容 zh-CN 单语（对齐 landing 的单语面；web 双语不强制桌面，如需 i18n 再立项）。

## 5. UI 规范落点与命名登记

- ui-spec 的 Design Tokens、组件规则（HeroUI 内置优先 / 复合结构 / 语义文本组件）、三态与
  响应式、数字格式全部沿用；「桌面端」节（窗口结构、托盘菜单规范）在 D2 动手时回写 ui-spec。
- **命名登记制**：desktop 组件文件遵循与 web 同一登记制、同一后缀集合（`<页名>-body.tsx` /
  `-skeleton.tsx` / `-strip.tsx` / `-card.tsx` / `-bar.tsx` / `-row.tsx` / `-dialog.tsx` /
  `-header.tsx` / `-states.tsx` / 纯计算 `-helpers.ts` / `-filters.ts` / 钩子 `use-*.ts`）；
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

- Rust stable（rustup，`x86_64-pc-windows-msvc` 工具链）+ MSVC Build Tools（C++ 工作负载）
  ——本机 2026-11-08 时点未装；装好后本地 `pnpm dev:desktop`。
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
