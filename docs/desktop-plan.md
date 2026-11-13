# 桌面端（`apps/desktop`）

Tauri 2 托盘伴生工具：**本机采集视角的实时监控台 + CLI 操作台**。依赖预算以
`docs/rewrite-plan.md` §4 为准，UI 规范仍先读 `docs/ui-spec.md`。里程碑与迭代的逐项验收记录见
`docs/archive/desktop-2026-11.md`。

## 1. 定位与分工

| | web（`apps/web`） | desktop（`apps/desktop`） |
| --- | --- | --- |
| 数据视角 | 账号级云端全景（所有设备） | 本机采集视角（`~/.tokenusage` 本地文件） |
| 数据面 | `/api/app/*` + 冻结契约端点 | 本地文件只读 + 子进程调 CLI，零网络 |
| 能力 | 趋势 / Sessions / 项目 / 成就 / 分享 | 今日用量、采集健康、一键 sync/doctor、通知、本机会话与分享卡 |
| 离线 | 不可用 | 可用（除跳转 web 外零网络依赖） |

技术栈：Tauri 2 + Vite + React 19 + HeroUI 3 + Tailwind 4（与 `apps/web` 同构）。主题浅/深/系统
三态，跟随 `prefers-color-scheme`，不引 `next-themes`；窗口内容 zh-CN 单语。

## 2. 架构硬边界

1. **CLI 是唯一采集与上传引擎**：desktop 对 `~/.tokenusage` 全只读（按字节偏移增量 tail，与 CLI
   自身读法一致），绝不写队列或配置，避免抢锁与语义分叉。
2. **动作一律子进程调 `tokenusage` 子命令**（sync / status / doctor / reconcile / pause / resume /
   device-login…），desktop 不重实现解析、对账或上传逻辑；CLI 未安装时引导
   `npm i -g tokenusage-cli`。
3. **零契约面**：desktop 不请求 `/api/functions/*`、不直连 Supabase、不把设备令牌带出 CLI 数据
   目录；云端全景 = 浏览器打开 web。这守住「CLI 版本 ↔ 服务端版本配对演进」不被新消费者破坏。
4. **成本只读时计算**：移植 web 同源的读时计价引擎（`lib/pricing.ts`），费用与 web 同口径；
   桌面不再展示账号成就页，只留 web 深链。

## 3. 数据面

| 文件 | 用途 |
| --- | --- |
| `~/.tokenusage/tracker/queue.jsonl` | 本机小时桶 last-wins 基线 → 今日/本周 tokens、来源构成（口径同 AGENTS 约束 8） |
| `…/project.queue.jsonl` / `…/session.queue.jsonl` | 项目构成与会话视图 |
| `…/queue.state.json` | 上传偏移 → 队列积压健康 |
| `…/logs/sync.log`（JSONL，1 MiB 滚动一代 `.1`） | 最近一轮 sync：`phase:"finished"` 行带 tokens / buckets / inserted / skipped / sessions_uploaded / pending_bytes / duration_ms；错误行带 `error` |

**永不读取**：设备令牌文件、provider key store、配对码。配对状态只认
`tokenusage status --json` 的 `device_token_set` 布尔（经 `run_cli` 子进程，CLI 自己的判定），
webview 用 localStorage 缓存「这台机器配过对」以免每次启动跑 status；CLI 不在 PATH 时由缓存
决定，只有 CLI 的回答能把它翻回未配对。

只读命令：`read_tracker_tail(rel, max_bytes)`（尾部 ≤512 KiB，canonical 目录守卫），用于最近会话。

## 4. UI 与命名

- 沿用 `docs/ui-spec.md` 的 Design Tokens、组件规则、三态与响应式、数字格式；窗口结构与托盘
  菜单规范见 ui-spec「桌面端」节。
- **组件命名与 web 同一登记制、同一后缀集合**（见 `AGENTS.md`「目录与命名」）；容器用记
  `-body` / `-skeleton` / `-strip` / `-card(s)` / `-section` / `-bar` / `-row` / `-table` /
  `-dialog` / `-header` / `-states` / `-icon` / `-note` / `-tooltip` / `-filter` / `-helpers` /
  `-filters` / `use-*`。新增后缀角色先回写本节再使用。跨页共享件放 `src/components/` 根，拆分
  目录用 `index.tsx` 收口。
- 入口件 `src/app.tsx`；`src/lib/` 与 `src/styles/` 为纯逻辑，不在后缀集合内。
- 字体复用 web 的 Maple Mono CN 自托管子集（复制到 `public/fonts/`，零新依赖）。

## 5. 依赖

**前端**：`react` / `react-dom` / `@heroui/react` / `@heroui/styles` / `@gravity-ui/icons` /
`clsx` / `recharts` / `@number-flow/react` / `@tauri-apps/api` /
`@tauri-apps/plugin-notification` / `@tauri-apps/plugin-autostart` /
`@tauri-apps/plugin-updater` / `@tauri-apps/plugin-process`。

**devDeps**：`vite` / `@vitejs/plugin-react` / `@tauri-apps/cli`；eslint / tailwind / prettier /
typescript / vitest 组与 web 同版本，Tailwind 走 `@tailwindcss/postcss`。

**Rust crate**（cargo，不进 pnpm lockfile，`Cargo.lock` 入库 + CI `--locked`）：`tauri` 2
（tray-icon）+ `tauri-build` 2 + `tauri-plugin-notification` / `autostart` / `single-instance` /
`updater` / `process` + `dialog` 2.8.4（导出时自选保存位置，仅在 Rust 侧驱动，webview 不开
`dialog:*` 权限）。

**不引入**：`next` / `next-themes` / `zustand` 等 web 独有名。

能力面（`capabilities/default.json`）只给主窗口 `notification:default`、`autostart:default`、
`updater:default`、`process:default`；托盘、窗口、CLI 子进程都在 Rust。

## 6. 环境前置

- Rust stable（rustup，`x86_64-pc-windows-msvc`）+ MSVC Build Tools（C++ 工作负载）；WebView2
  Evergreen（Windows 11 内置）。
- **1420 端口**（Tauri devUrl，`strictPort`）可能落进 Hyper-V/WinNAT 动态保留段（表现为
  `EACCES ::1:1420`）。一次性修复（管理员）：`net stop winnat` →
  `netsh interface ipv4 add excludedportrange protocol=tcp startport=1420 numberofports=1` →
  `net start winnat`。
- CI（Ubuntu）只跑 desktop 的 node 侧门禁（lint / tsc / test / build，并入根 `pnpm verify`）；
  Rust 编译在发版的 Windows runner 上跑。

## 7. 里程碑与状态

| 里程碑 | 内容 | 状态 |
| --- | --- | --- |
| D1 脚手架 | workspace 加 `apps/desktop`；托盘 + 主窗口骨架 + close-to-tray；`sync.log` 解析；图标与资产；根 `pnpm verify` 并入 desktop | 已验收 |
| D2 本地监控盘 | 托盘菜单（今日 tokens、采集状态、Sync now、暂停/恢复、打开 web）；主窗口三段（strip / 来源构成 / 操作条）；三态齐全 | 已验收 |
| D3 配对与引导 | 首启向导：检测 CLI → 引导安装 → `device-login` → 等待批准 → 首同步统计；复用 CLI 配对流，不碰令牌 | 已验收 |
| D4 通知与常驻 | 每日汇总、连败/积压提醒（阈值可配）、自启动、单实例、ThemeToggle 三态 | 已验收 |
| D5 发版 | Windows NSIS + tauri updater（Ed25519）、Rust 编译门禁进 CI | 已验收（`desktop-v0.1.0`） |
| D6–D11 | 用量构成、使用节奏、头部与统计卡、趋势与来源构成、会话与分享卡、窗口状态记忆、项目 / 模型筛选、设置目录入口、托盘周期切换 | 已验收（0.2–0.4 系列） |

桌面端依赖的 `project-profiles` 子命令随 `tokenusage-cli` 提供，其他机器升级 CLI 后即可同步 web
编辑的项目显示名与 logo。

## 8. 明确不做

跨端偏好同步；webview 嵌入云端登录态（另行立项）；云端探活；Projects 全页与全库筛选；账号
成就页与公开徽章（只留 web 深链）；pet/quota 类桌面 widget，以及任何改写本地队列、配置或新增
契约端点的改动。

## 9. 发版流程

发布流水线 `release-desktop.yml`，机制对齐 `release-cli.yml`：

- **tag 触发**：`desktop-v*`，tag 必须落在 main 上；三处版本强校验
  （`apps/desktop/package.json` = `src-tauri/tauri.conf.json` = `src-tauri/Cargo.toml` = tag）。
- **构建**：Windows runner + stable Rust；`tauri build`（NSIS + `createUpdaterArtifacts` 产出
  `.sig`）；Ed25519 私钥经 GitHub secrets 注入（`TAURI_SIGNING_PRIVATE_KEY` /
  `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`），公钥在 `tauri.conf.json`。**私钥文件是唯一本地副本，
  丢失后已装用户永远无法再收更新**（操作者持有，Agent 只代生成）。
- **发布**：`scripts/admin/desktop-release/assemble-updater-manifest.mjs` 组装 `latest.json`
  （安装包改名 `token-usage-desktop_<ver>_x64-setup.exe` 免 URL 空格编码，签名内联）；Release
  以 **draft** 创建、正文取 `CHANGELOG.md` 对应段。updater 端点读**专用滚动 Release**
  `releases/download/desktop-latest/latest.json`——本仓库同时发 CLI，`releases/latest` 会被
  `cli-v*` 占据且没有 latest.json。滚动清单由 `release-desktop-latest.yml` 维护：
  `release: published`（仅 `desktop-v*`）时把该版 `latest.json` 覆盖上传到 `desktop-latest`
  （`--latest=false`）。draft 不含可下载清单，**publish 即人工放行闸门**；
  `hooks/use-updater.ts` 把清单缺失降级为「尚未发布更新清单」。
- **日常步骤**：bump 三处 version + CHANGELOG 顶部补节 → push main（CI 全绿）→
  `git tag desktop-v0.x.y && git push origin desktop-v0.x.y` → CI 出 draft → 操作者 publish。

## 10. 已知问题与兜底

- **托盘注册**：充分条件是**应用进程完整性级别 ≥ 任务栏进程**。从 explorer 启动天然满足；
  手动对 exe 打 High 标签只是历史兜底手段，不是安装或升级后的必做步骤。只有应用被低完整性
  父进程拉起时才缺托盘，此时降级为「关窗只最小化」并在监控盘顶部显示 `TrayNote`。
- **系统通知**：依赖系统通知管道；验收时先确认系统通知总开关（UAC 关闭 + 管理员 shell 的机器
  上尤其容易整体关闭）。
- **macOS / Linux**：Tauri 可出包，但尚无真机验证。
