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

D1–D5（desktop 0.1.0）的逐项验收记录已归档到
[`docs/archive/desktop-2026-11.md`](archive/desktop-2026-11.md)；0.2 起的迭代验收见 §12 各小节。

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
  `desktop-v0.4.0` / `desktop-v0.4.1`。（2026-11-12 复核后，安装/升级不再需要给 exe 打
  完整性标签，见 §11。）

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
**0.4.1 设置改版（四项合并，见 §10）与同版复核修复（会话空态三分 + `read_tracker_head`）
已完成开发、操作者安装验收通过，并已随 `desktop-v0.4.1` 发布（2026-11-13）。**

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
