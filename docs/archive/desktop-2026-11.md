# 桌面端验收记录（D1–D5 · desktop 0.1.0）

> 2026-11-13 从 `docs/desktop-plan.md` §10 拆分归档；0.2 起的迭代验收记录仍在
> 主文件 §12 各小节。
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
  `pnpm --filter @token-usage/desktop exec where tokenusage`。详见 `docs/archive/cli-releases.md` §十二。
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
  --days 7` 271 桶逐键匹配、计划任务 `LastTaskResult=0`），明细见 `docs/archive/cli-releases.md` §十三；
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
    `docs/archive/cli-releases.md` §十三「0.5.4 复验」。

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
  **上述 2026-11-13 改动未纳入 `desktop-v0.4.0` tag（tag 指向 `47a9f39`），已随
  `desktop-v0.4.1` 带走。** 该 draft Release 始终未发布，2026-11-13 被 0.4.1 取代并
  **删除**（tag 保留作构建记录，避免误 publish 把滚动清单覆盖回 0.4.0）。

- **0.4.1 设置改版（2026-11-13 立项、开发并验收通过，已发布）**：四项合并为同一版本——
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
  `TAURI_SIGNING_PRIVATE_KEY` 未生成 `.sig`（退出码 1，属预期）。
  **操作者 2026-11-13 安装验收通过后提交、推 main 并打 `desktop-v0.4.1`，CI 出
  draft Release，同日 publish（`--latest=false`，不抢 CLI 的 latest 标记），
  `desktop-latest/latest.json` 随 `release: published` 覆盖为 0.4.1**；
  `desktop-v0.4.0` draft 始终未发布，已被本版取代并于同日删除（tag 保留）。

- **0.4.1 同版复核修复（2026-11-13，随本地包一起验收）**：操作者问「今天会话数为 0」，
  只读排查确认属预期——当天 23 条小时桶来自 workbuddy / minimax-code / trae，均不在
  会话侧车 8 类扫描来源内；侧车 219 行、最新 `ended_at` 为 `2026-11-12T10:22Z`，
  7D / 30D 分别有 27 / 99 条。两项复核修复并入 0.4.1（随本版一并发布，重出本地包覆盖）：
  ① 会话空态由两分改三分（无会话元数据 / 当前时间范围没有会话 / 筛选无结果），
  **预设时间范围不再算筛选**，`hasNarrowingFilters` 只认来源 / 项目 / 模型（桌面）或
  自定义起止时间 / 设备 / 来源（web），同步回写 ui-spec 空态规范与 web 中英文案；
  桌面端以整份侧车解析行数区分「真没数据」与「窗口内没数据」，第三类给
  「查看全部会话」直达总计。② CLI 的 `session.queue.jsonl` 按 `ended_at` 降序全量
  重写（最新在文件头），而 >8 MiB 时原降级走 `read_tracker_tail` 读末尾会拿到最旧
  记录；新增 Rust 命令 `read_tracker_head`（同样的 canonical 守卫与 512 KiB 上限、
  丢弃被截断的末行），`use-sessions.ts` 降级改调它，`partial` 提示「仅显示最新部分」
  自此名实相符。§12.4 D7 的「只读尾部」口径已加复核注记。
