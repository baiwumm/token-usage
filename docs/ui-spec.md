# UI 规范（v1）

写任何 UI 前先读本文。组件用法以项目 Skill `.agents/skills/heroui-react/` 的文档脚本为准
（HeroUI v3 API，勿按 v2 记忆书写）。

## Design Tokens

- 字体：Maple Mono CN，唯一配置处为 `styles/globals.css`（自托管 woff2 + unicode-range，
  子集外字符回退系统字体栈）。
- 颜色：一律使用 HeroUI 语义 variant（primary / secondary / tertiary / outline / ghost /
  danger / danger-soft）与主题 CSS 变量（`bg-background`、`text-foreground`、`bg-surface`）；
  组件代码零裸色值，品牌色定制走 HeroUI 主题变量。
- 深浅色：next-themes 的 class 策略（`.dark`），样式写语义 token，暗色映射由主题承担。
- 裸色值豁免清单（2026-11-07 操作者裁定，增补、不覆盖上文历史裁定）：下列固定视觉资产属于
  「组件代码零裸色值」的**合规例外**——它们是 Canvas 2D / SVG / 物理渲染的固定资产色板，
  不随 `.dark` 主题切换，故保留字面色值，但一律收口到单点常量文件、不散落在绘制逻辑里：
  (1) Canvas 2D 分享卡引擎（`components/share-card/` 绘制文件）与
  `components/share-card/palette.ts` 的 PAPER / INK / INK_SOFT / VERMILLION 及各风格
  HEATMAP_PALETTE；(2) `components/achievement-tiers.ts` 的段位金属色板（TIER_METALS /
  TIER_RAMPS / LOCKED_*，对齐上游 TokenTracker 五档段位）；(3) 3D 成就硬币
  （`achievement-coin.tsx` / `achievement-medallion.tsx` / `achievement-art.tsx`）的 rgba
  高光、描边与插画色（SVG gradient stops / inline background 无法响应主题 class）；
  (4) `components/source-icon.tsx` 的品牌回退色块（各来源品牌色、无 SVG 资源时的兜底）。
  **DOM 组件（HeroUI / Tailwind 渲染的常规界面）仍一律使用语义 token 与
  `var(--color-chart-N)` 等主题变量**，不得引用上述字面色值；新增例外须在本清单登记。

## 组件规则（编码级）

- 选取顺序：HeroUI 内置（75+，`node .agents/skills/heroui-react/scripts/list_components.mjs`
  查清单）→ HeroUI 组合 →
  自研；自研组件沿用主题变量与 tailwind-variants。
- HeroUI 组件的交互回调统一 `onPress`；原生 `onClick` 仅用于非 HeroUI 元素。
- 类名拼接统一 `cn`：凡 className 需要条件分支或多来源拼接，一律
  `import { cn } from "@heroui/react"`（HeroUI 对 tailwind-variants `cn` 的重导出，即
  `twMerge(clsx(...))`：自动滤掉 falsy 段、按 tailwind-merge 合并冲突类），不写模板字符串
  `` `a ${cond}` ``、`+` 拼接或 `.trim()` 补丁；纯静态类名保持字面量，不必包 `cn`
  （2026-11-03 操作者指令）。
- 复合结构优先：提供复合 anatomy 的组件（Card、TextField、Modal、Table、Tabs 等）一律使用
  其复合结构（如 `Card.Header / Card.Title / Card.Description / Card.Content / Card.Footer`），
  不手写等价 DOM 包裹（2026-10-24 操作者指令）。
- 裸标签换语义组件：标题/正文用 `Typography`，表单字段提示用 `Description`，错误用
  `ErrorMessage`（表单级）/ `FieldError`（字段级），不用裸 `h1`–`h6` / `p` 标签
  （2026-10-24 操作者指令）。
- 表格分页统一 `components/table-pagination.tsx`：左侧范围摘要、中间页码、右侧每页条数
  （最小尺寸 Select）；默认页大小由调用页传入（明细 10/页、Sessions 20/页）。
- 列表数据面统一 `components/data-table-card.tsx`（`DataTableCard`）：头部左侧标题 + 副标题、
  右侧 `extra` 槽（传入才渲染）、中部列配置表格（`columns: { id, header, cell, sortable?,
  className? }`）、底部 `TablePagination`，并由它接管 Loading（骨架行）/ Empty / Error
  三态与刷新浮层。`rows` 永远是当前页：排序与分页由调用方持有（列表页把偏移放 URL，
  仪表盘明细页本地排序），组件不自己取数。`<md` 的卡片列表走 `renderMobileRow`。
  刷新浮层只覆盖表格区（含移动端卡片列表），卡头标题/副标题与页脚分页保持可见
  （2026-10-28 操作者裁定）。
- **适用范围与刷新遮罩**：上条「只覆盖表格区、卡头/页脚保持可见」**只约束 `DataTableCard`
  列表卡**（`/sessions` / `/sync-runs` / 设置设备分区 / `/wrapped` 模型表等调用方）；仪表盘各
  卡片改用 `components/panel-overlay.tsx` 的 `PanelOverlay` **覆盖整卡**（含卡头），且**刷新遮罩
  必须 `pointer-events-none`**（`aria-hidden`、不拦截指针），刷新期间不阻塞卡内交互；`/wrapped`
  切年份的「旧数据护栏」（半透明 + 不可交互 + 加载提示）是有意阻塞交互的独立状态，不属常规
  刷新遮罩，按「年度回顾」节执行。
- 下拉框选项异步加载时，加载态放在触发器里：`Select.Indicator` 内渲染 `Spinner`
  （`<Select.Indicator><Spinner size="sm" /></Select.Indicator>`），加载完回落默认箭头；
  不另加触发器外的 Spinner。选项随页面数据一起到达的筛选下拉，只在首载（选项尚空）时
  进入加载态；选项按本控件重新拉取的下拉（如 `/wrapped` 年份）在每次拉取期间显示
  （2026-10-28 操作者指令）。
- 浮层（Modal / Drawer / Popover / Tooltip / Toast）使用 HeroUI 内置组件及其触发器组件，
  受控用法遵循各组件文档，不自建浮层机制。
- 图标：`@gravity-ui/icons`（与 HeroUI v3 官方示例一致），尺寸对齐 HeroUI 插槽惯例。
- 图表：recharts（2026-10-24 裁决，替代原"手写 SVG"）；热力图无对应 recharts 类型，用
  主题 token 的 CSS grid 实现（`lib/dashboard` 对齐函数把 wire 的连续天切片对齐为周一列）。
- 动效：优先 CSS（零依赖）；确有必要时可用 `motion`（`motion/react`，2026-10-24 批准，按需
  安装；预算见 `docs/rewrite-plan.md` §4）。GSAP / Three.js 仍不移植。

## 三态与响应式

- 每个数据面必须设计 Loading（Skeleton / Spinner）、Empty、Error 三态；Error 态提供重试。
- 列表卡在已有数据上刷新失败时，保留旧行并在卡顶给危险条 + 重试（不静默显示旧页），
  首次加载失败才整块换成错误态。
- 仪表盘按区块独立加载：单个区块失败不阻塞其他区块，失败区块在自己的 Card 内重试。
- 响应式：`lg` 以下使用抽屉导航（对齐旧系统行为）；关键页面在 375px 宽度可用。
- 页面级不得出现横向滚动；表格/代码块需要横向滚动时，滚动容器限定在组件自己的横向滚动
  容器内（Card 或 `Table.ScrollContainer`），不外溢到页面。

## 页面规范（2026-10-25 增量）

所有新增文案走 `lib/copy` 的 typed 字典（zh / en），不硬编码；Sessions 与外观各自建 copy
模块，错误码到文案的映射与现有设置页一致。

### 仪表盘（`/`，A：上游核心）

桌面自上而下；移动端单列：

1. **筛选条**：时间范围为单一 `DateRangePicker`（弹层日历上方内置
   今天 / 7D / 30D / 总计 快捷按钮（`ToggleButtonGroup`，单选、
   `min-w-14` 最小宽度，活动预设高亮，点选关层；2026-11-01 操作者裁定：去掉 90D）；
   在日历手动选取则写 `range=custom`
   + 具体日键）、时区、设备。设备下拉与 Sessions 共用 `DeviceFilterSelect`，选项前置
   `Display` 图标，“全部设备”用 `Layers`；触发器复显同一图标，名称单行省略不换行。
   时间范围筛选仅存组件内状态（2026-10-26 操作者裁定）：不写入 URL、加载时不回显，
   首帧把旧链接里的 `range` / `from` / `to` 清出地址栏，刷新回到默认「总计」
   （2026-11-01 操作者裁定，原默认近 30 天；清空筛选同样回到「总计」）；
   URL 仅保留 `tz` / `device_id`；日期上限为仪表盘时区（`tz`）的今天，日历与日期输入
   均不接受未来日期；变更只重取数据，
   不整页刷新——各卡片保留旧内容并叠加模糊遮罩 + `Spinner`（仅首载无数据时出骨架屏，
   骨架屏圆角与卡片一致：`min(32px, var(--radius-3xl))`）。筛选条右侧固定「分享」
   （共享 `ShareCardButton`：`NodesRight` 图标 + `Tooltip`，打开分享卡 Modal）与「刷新」两个
   tertiary 图标按钮，刷新中图标自旋；
   刷新按钮的 `Tooltip`（带箭头）显示上次更新时间（未加载时显示「尚未加载数据」）。仪表盘自动刷新
   默认关闭（2026-10-27 操作者裁定，设置页「数据刷新」可控）：定时与切回刷新均为静默
   更新（不叠加模糊遮罩），手动刷新仍带遮罩；「时」视图下手动刷新同时重取小时明细。
   **数据版本门**（2026-11-01 操作者批准，`docs/cli-contract.md` §2.14）：每次加载前先查
   `GET /api/app/data-version`（最新非空采集运行的服务端 `created_at`），与缓存签名一致则
   直接水合 sessionStorage 缓存（按 用户 + 范围/时区/设备 键，最多 4 组），**跳过七个重
   请求**——进入页面与自动刷新在数据未变时近零成本；签名不一致或查询失败照常全量拉取
   （fail-open），全量拉取成功且前后签名一致才回写缓存；手动「刷新」按钮永远绕过本门
   （兜 reconcile / replay 盲区）。
2. **总 Tokens 头卡**（独占一行、仪表盘首卡，参考上游 Broadsheet 视觉）：居中大号
   Token 总数、计费 Token / 会话数 / 活跃天数 / 日均（30 天）/ 单日峰值五个紧凑指标、成本行
   （存在未定价模型时加 `≥` 前缀 + ⓘ `Tooltip` 说明估算下限；行尾小字「全部时间」累计
   成本）、日期区间、按来源占比的堆叠色条、「全部 + 每来源」占比卡（`SourceIcon` 图标 +
   占比 `text-base` + 模型数；「全部」与每来源卡均可点击，打开模型明细
   `ModelListModal`——列 模型 / Token / 占比 / 成本，「全部」为跨来源同名模型合并，
   明细桶只有逐模型 Token、无成本列时成本列自动隐藏；数值列为定宽（Token `w-36`、
   成本 `w-28`）并给整表 `min-w-[26rem]` 保底——按完整显示的 14 位数字定尺寸，窄视口
   横向滚动而不是溢出到邻列（2026-11-02，Sessions 会话详情的模型表同款））。
   2026-10-26 二次精简（操作者裁定）：原 KPI 4 卡、成本卡与近期用量（rolling）卡全部
   移除——范围成本与全部时间成本在头卡，近期统计经筛选条可达，成本分析从 Top 模型
   「成本分析」按钮进入；口径：总 Token = `totals.total_tokens`，计费 =
   `totals.billable_total_tokens`，成本 = `totals.total_cost_usd`，会话数 =
   `totals.conversation_count`，活跃天数 = `days`，日均（30 天）=
   `rolling.last_30d.avg_per_active_day`（计费 Token ÷ 活跃天），单日峰值（2026-11-01
   操作者裁定新增）= 当前窗口逐日序列里 `total_tokens` 最大的一天（并列取最早一天，
   `aggregate.ts` 的 `peakDay` 纯函数，值随日期小字展示；默认「总计」下即全历史峰值，
   窄窗口为窗口内峰值，零新增请求）。五个 KPI 值一律走 `FlowNumber` 数字过渡
   （2026-11-02 操作者裁定）；`FlowNumber` 挂载即从 0 滚动到位（骨架屏结束后的首次加载
   与筛选刷新有同样的入场过渡），无法解析的文本回退纯文本。大数一律走统一 format
   provider，卡片内不自算格式。
   **成就条**（2026-10-30 P3，`components/dashboard/achievement-strip-section.tsx` +
   `achievement-strip.tsx`）：独占一行，放在**热力图之后、趋势之前**（2026-10-30 操作者
   裁定：从 Hero 与热力图之间下移）；Card 头部为标题「成就」+ 说明 + 右侧 `tertiary`「查看全部」
   （唯一的 `/achievements` 入口）。内容**上下两组、纵向排列**（2026-10-30 操作者裁定：
   取代原左右两栏）：「最近解锁」（最晚达成日降序）与「最接近解锁」（未满王者、有下一档、
   当前值 > 0，按当前值 ÷ 下一档阈值降序），各 ≤5 条。每组采用**成就页徽章墙的卡片形式**：
   居中徽章（80px，`md` 起 96px）+ 名称（单行截断）+ 段位渐变标签（已解锁；未解锁无
   徽章）；窄屏三列、`sm` 起五列一行（2026-10-30 操作者裁定：尺寸加大、间距收紧、每行
   5 个）。格子**可点击**，打开与 `/achievements` 一致的详情弹窗（复用
   `components/achievement-detail.tsx` 的 `AchievementDetail`：
   详情 + 分享一体，2026-10-31 操作者裁定，取代 2026-10-30 的只读裁定，瓦片不再画
   进度条）。「查看全部」入口保留。全部条目当前值为 0（空账号）时整条不渲染；
   数据失败走 Card 内 `SectionError` + 重试，加载中用同构的墙格骨架占位。该条与全局解锁
   watcher 共用 `fetchAchievementsShared`（`lib/achievements/api.ts`）：同一时区参数下
   **in-flight 去重**（并发在途请求合并）+ 对**已结算 payload 加 15 s 短 TTL**
   （`SHARED_TTL_MS`）——watcher 在挂载约 1.2 s 后才发请求，此时仪表盘请求通常已结算，
   单靠 in-flight 去重必然重复计算；`markAchievementsSeen` 写入已读水位后调用
   `invalidateAchievementsShared()` 立即失效缓存。**TTL 取短（15 s）是为了不延迟解锁 toast
   与已读水位的推进**（缓存过久会让新解锁 / 已读状态滞后）；仪表盘选了自定义时区时两者
   口径不同，各取一次（cache key 含 `tz` / `offsetMinutes`）。
3. **活跃热力图**（独占一行，紧跟总 Tokens 头卡，`components/heatmap-card.tsx`）：
   近 52 周 Mon-start 满宽网格（窄屏裁周、宽屏撑满格子，`ResizeObserver` 自适应）；
   月份标尺在上、周几单字标尺（一~日 / M~S）在左；右上「全部平台」多选筛选
   （`Dropdown.ItemIndicator` 勾选态，全部/清空，触发按钮显示已选状态），按来源过滤后
   等级客户端重算；共享 portal tooltip 显示当日总量与来源明细；左下时区标注
   （`UTC+08:00`），右下 少/多 图例；色阶 `--heatmap-0..4`（0 级 = `--default`，
   1–4 级为 accent 降饱和梯度，深浅主题各自定义于 `globals.css`）。
4. **趋势**：日/月切换（`Tabs`）+ 指标切换（Token / 成本），recharts；范围跟随筛选条。
5. **双栏**：Top 模型（`SourceIcon`、名称、Token、占比 `Meter`、成本，前 8 条 +
   「成本分析」按钮打开成本分析 Modal）；来源卡（`SourceIcon`、占比 + 成本，随设备筛选，
   取 `model-breakdown`）。来源卡本身（2026-11-02）为左侧甜甜圈 + 右侧前 5 行
   「来源 / Token / 占比」三列栅格：来源名单行截断省略，Token 与占比列常量宽
   `whitespace-nowrap`，长数字/长名称换行不再发生（数字列极端长度也以省略号收口）；
   行可点击隐藏/显示（隐藏来源从甜甜圈与占比分母中剔除）。甜甜圈尺寸随卡片自适应
   （`size-48 sm:size-52`，替代原固定 176px），内孔 64%，中心总 Token 单行
   `whitespace-nowrap` 收口，完整位数不再压到环上（2026-11-02）。「查看全部（N）」打开
   `Table` 形式的全量来源表（列：来源 / Token / 占比 / 积分——仅范围内有 credits 时
   显示该列），行首来源名可点击隐藏/显示，与卡内行同一开关。
   两卡下方为**积分消耗卡**（2026-10-31）：逐来源列出上报了 credits 的积分用量与占比
   （仅积分制来源如 Qoder 会携带；范围内无 credits 数据时整卡隐藏）——积分是独立维度，
   **永不并入 Token、计费 Token 或成本口径**。模型列表按 model 的小写折叠键聚合
   （大小写漂移不拆行，展示名取组内 token 份额最大的写法，2026-10-31 口径）。
   来源/模型图标走 `components/source-icon.tsx`：`public/brand-logos/`（品牌商标，
   来源与许可登记在根 `THIRD_PARTY_NOTICES.md`）优先，source 全称映射 + 模型名
   前缀映射（deepseek/kimi/k3/gemini/grok/mimo/gpt/composer/claude/step/minimax/
   hy/nemotron/ling（百灵 bailing.png）/cline-free/opencode 隐身别名等），仍无映射时回落到该行的来源标
   （模型行传 `source` 属性；两者都无才退确定性色块）；新增品牌 = 放 logo 文件 +
   在 `SOURCE_LOGOS` / `MODEL_PREFIX_LOGOS` 登记。暗色变体：深色主题下
   看不清的深色标（如黑底 ChatGPT 形状的 codex 新标），放同扩展名的
   `<name>-dark.<ext>`（如 `codex-dark.svg`）并把浅色文件名加进 `sources.ts` 的
   `DARK_LOGO_FILES`，渲染层自动叠双图按 `.dark` 切换；未登记的 `-dark` 文件不生效。
   名称/Token/占比/成本/积分这类明细表壳统一为 `components/dashboard/breakdown-table.tsx`
   （`BreakdownTable`，2026-11-02）：名称列单行截断（完整值在 `title`）、Token `w-36`、
   占比 `w-16`、成本与积分 `w-24`，数值列 `whitespace-nowrap` 不换行；成本/积分列按
   行数据是否携带自动出现（无则整列隐藏）；来源详情弹窗、「查看全部」来源表、成本分析
   两个 Tab 与 `ModelListModal` 共用同一表壳，行内名称单元格可按调用方覆盖（来源表用它
   做隐藏/显示开关），新增同类明细表不再手写 `Table` 壳。
6. **设备卡**（独占一行）：名称/平台/最后上报/Token/成本，取 `dashboard.devices`，
   仅活跃设备且不随设备筛选收窄；点击设备卡把 `device_id` 写入筛选条。
7. **明细**：`Tabs` 日 / 时 / 月；`Table` 列（时间、Token、输入、缓存、输出、成本、会话、
   模型数、积分——仅窗口内有 credit 上报才显示该列，2026-10-31 增量）；列头排序、`Pagination`（默认 10/页，可选 10/20/50/100）；时视图先选日期（默认今天）；时区
   切换即时重算日/时，月视图按契约固定 UTC；空窗口显示空态；模型数列可点击（桶内
   `models` 非空时），打开该桶的模型明细 Modal（同 `ModelListModal`）。
   「计费 Token」列于 2026-11-02 移除（操作者裁定）：读侧对未上报 billable 的行按
   `total_tokens` 计入、常用来源本身 `billable = total`，该列与 Token 重复；且
   输入 + 缓存 + 输出 = Token 已是库层约束，计费是唯一不参与该恒等式的列。聚合口径
   仍保留在头卡「计费 Tokens」KPI（`summary.totals.billable_total_tokens`），
   `SeriesPoint.billable_total_tokens` 与热力图分级不受影响。
8. **成本分析**：从 Top 模型「成本分析」按钮打开 `Modal`；`Tabs` 按模型 / 按来源；
   总成本、日成本趋势、未定价模型提示；只读，不提供导出。两个 Tab 内容均为 `Table`
   （2026-11-02，取代手写栅格，共用 `BreakdownTable` 表壳）：按模型 = 模型
   （第二行来源小字）/ Token / 占比 / 成本，按来源 = 来源 / Token / 占比 / 成本；
   `table-fixed` + 定宽数值列（Token `w-36`、
   占比 `w-16`、成本 `w-24`）与整表 `min-w-[26rem]`、`min-w-[30rem]` 保底，名称截断、
   数值列 `whitespace-nowrap` 不换行，窄视口横向滚动。
9. **分享卡片**：共享 `ShareCardButton`（`components/share-card-button.tsx`，`NodesRight` 图标 +
   `Tooltip`，打开 `ShareCardDialog`）——仪表盘放在筛选条右侧，`/wrapped` 放在页头右侧（2026-10-30
   操作者裁定：wrapped 从页内面板改为与仪表盘同一入口与交互）。`ShareCardDialog`
   （`components/share-card-dialog.tsx`）为左右两栏（<lg 上下堆叠）：左侧预览共享分享卡引擎
   （`components/share-card/`，Canvas 2D 手绘——html-to-image 在本栈挂起，只含聚合数字）
   的四种风格之一，右侧为设置与操作——显示名称 `TextField`（默认当前用户名，仅本次弹窗内生效、
   不持久化）、风格 `ToggleButtonGroup`（2×2 磁贴、单选、不允空选，每项图标在文案左侧：
   特刊 `SquareArticle`、小票 `Receipt`、霓虹 `Sparkles`、唱片 `MusicNote`；切换即重绘预览：
   旧帧留在上层淡出、新帧淡入并轻微回弹，`prefers-reduced-motion` 下直接切换）、复制图片 /
   保存图片双按钮与隐私说明。四种风格：**特刊**（Broadsheet：米白纸底 + 朱红，报头、署名、衬线大数
   （完整千分位数字）、数据金句、52 周热力图条、前五模型排行榜（序号 + 全量 token + 占比）、
   token-usage.cc 落款）、**小票**（热敏收据：Maple Mono 白纸黑字、模型行项目、装饰条形码、
   PAID 章、撕纸边）、**霓虹**（深色海报：程序化光晕+噪点、12 月热力图网格、连续天数/Top 模型
   事实条）、**唱片**（方形黑胶封面：热力图色环沟纹、纸标、曲目=模型榜）。预览即导出 PNG 本身
   （所见即所得）；卡片数据由 `dashboard/share-input.ts` 从当前 payload 投影，文案统一走
   `lib/copy/share-card.ts`。特刊的大数与模型榜固定使用完整千分位数字（`formatNumber`，
   跟随分组设置），与仪表盘的紧凑显示偏好解耦；其余风格沿用偏好格式。**关闭态不得重绘 Canvas**：
   `ShareCardDialog` 关闭/退出时保留最后一帧图像以支撑退出动画（不触发新的绘制），避免关闭瞬间
   重绘造成闪黑帧，退出动画结束后再释放。
   **成就分享卡**（2026-10-30 P3，`components/share-card/achievement.ts`）不属于上述四种风格：
   它是成就详情弹窗的独立分享入口，固定 **1080×1350** 深色卡（段位光晕 + 徽章 + 段位标签 +
   当前值 + 达成日），复用同一套 Canvas helpers（`roundRectPath` / `drawTracked` /
   `fitFontSize` / `truncateToWidth` / `loadShareImage`）与 `TIER_RAMPS` 色值，不新增依赖。

状态与可访问性：

- 首屏 `Skeleton` 按当前卡片栈逐块占位（Hero → 热力图 → 成就条 → 趋势 → 模型/来源双栏 →
  设备 → 明细），保持卡片/图表尺寸，避免布局跳动；无数据时给配对与 CLI 上报引导，并附
  「查看采集记录」跳转（2026-11-07：采集记录页承接链路健康，空态即排障入口）；
  筛选无结果时给“清除筛选”。
- 图表容器带 `aria-label` 与文本摘要；颜色不是唯一信息（模型占比同时显示数字）。
- 数字使用 `tabular-nums`；表格列头可排序并暴露 `aria-sort`。
- 动态数值统一用 `components/flow-number.tsx`（`FlowNumber`）包装：解析 format provider
  的成品串后交给 `@number-flow/react` 做数字滚动过渡；万进制 4 位分组与无法解析的占位符
  （`—`）自动退化为静态文本。明细表格单元格不加（整表切换）。公开页是唯一例外：
  传 `lib/badge/format.ts` 的固定口径串（不使用 `useFormat`），并补 `<noscript>` 与
  `aria-label` 兜底，见「公开页」节。
- `<lg`：KPI 两列、筛选条换行、图表高度约 220px；`Modal` 使用全屏尺寸；表格横向滚动
  只发生在 Card 内。
- **全局 `prefers-reduced-motion` 兜底**：用户开启「减少动态效果」时，所有装饰性动效必须
  可降级——`animate-spin` 的刷新/加载图标、`transition` 过渡、`FlowNumber` 数字滚动、分享卡
  旧帧淡出/新帧回弹、3D 硬币入场与怠速摆动等，一律用 `@media (prefers-reduced-motion: reduce)`
  或组件内判断关闭 / 改为静态呈现；用户驱动的非装饰交互（如水平拖拽翻面、纯点击）不受影响。
  本条覆盖全站各页，不只仪表盘。

### Sessions（`/sessions`，B）

- 导航：侧边栏与抽屉在仪表盘后新增“Sessions”（`ListUl` 图标），页面标题取菜单名。
- 数据源：`account-sessions`。筛选条：时间范围为单一 `DateRangePicker`（弹层内置
  今天 / 7D / 30D / 90D 快捷按钮，活动预设高亮，点选关层；日历手动选取写 `custom`；
  控件形态与仪表盘一致，设备下拉同样复用 `DeviceFilterSelect`）、设备、来源；筛选条最
  右侧依次是 CSV 导出图标按钮（`ArrowDownToLine`，导出当前筛选全集，2026-11-01 增量）与
  采集记录同款的刷新图标按钮（`ArrowsRotateRight`，刷新时图标 `animate-spin`，
  `Tooltip` 显示上次更新时间）；导出按钮在无结果或加载中禁用，导出中显示 `Spinner`；设备/来源选项来自响应的 `facets`，来源选项与触发器复显 `SourceIcon`
  品牌图标及 `sourceDisplayLabel`（与列表 `Chip` 同源，全部来源用 `Layers`）；设备/来源与分页偏移（`offset`）
  写入 URL；时间范围的预设（今天 / 7D / 30D / 90D）不写入 URL、加载不回显（2026-10-26
  裁定），自定义窗口——日历手选或热力格子跳转带来的 `from` / `to`——写入并回显，刷新与
  分享保持同一窗口（2026-10-28 裁定）；非法或顺序颠倒的 `from` / `to` 首帧清出地址栏；
  默认近 30 天、全部设备、全部来源；分页
  默认 20/页，可选 10 / 20 / 50 / 100（`page_size` 入 URL，切页大小保持当前页）。
  范围含
  今天（`to` 为明日 00:00 本地），按浏览器本地时区换算为 ISO 瞬时，服务端窗口为
  `[from, to)`；日期上限为浏览器时区的今天，日历与日期输入均不接受未来日期。
- 汇总卡：会话数、总 Token、成本、平均时长（`totals.duration_ms / totals.sessions`，
  0 会话显示 `—`）。首载时四张卡保留真实标题与图标，只有数字位是骨架（不整块闪骨架）；
  刷新时汇总卡不遮罩，数值变化由 `FlowNumber` 滚动过渡（2026-10-28 操作者裁定）。
- 列表：`DataTableCard`（标题「会话」+ 副标题说明），`≥md` 用 `Table`、`<md` 用 Card 列表
  都由组件承担（`renderMobileRow`）。列：结束时间、来源 `Chip`（`SourceIcon`
  Logo + 规范化显示名）、项目、设备、时长、Token、积分（仅积分制来源上报，2026-10-31
  增量；窗口内无 credits 数据时整列自动隐藏）、成本、模型（前 3 个 `Chip` + `+N`）、
  「详情」操作列（表头「详情」、行内按钮「查看」，`variant="tertiary"`，2026-10-26 操作者
  裁定）。列表固定按结束时间倒序，不做列排序；服务端分页默认 20/页（可选 10/20/50/100），
  页脚走 `TablePagination`。CSV 导出走当前筛选全集（非当前页）：10,000 行 / 约 4 MiB 双上限，
  截断时 toast 提示「共 N 条，已导出前 M 条」，成功时提示导出条数；下载由 `fetch` + Blob
  触发，以便读取 `X-Export-*` 响应头并处理 401。
- 详情：行尾「查看」按钮打开 `Modal`（整行点击为增强，键盘焦点落在按钮上）；头部为来源
  （Logo `Chip`）、项目、设备三枚 `Chip`；meta 两列 结束时间（含相对时间小字）+ 时长；
  Token 拆分（input / cached / cache creation / output / reasoning /
  total / billable；积分制来源额外有积分行，独立维度不计入上列各项）；模型拆分为 `Table`（模型 Logo、Token、占比、成本，右对齐定宽列）；
  隐私提示“仅用量元数据，不含对话内容、路径或命令”；成本脚注“按模型定价估算，可能与
  仪表盘 provider 上报成本存在差异”。
  `session_id` 只作内部键，不在 UI 展示。
- 空态两分：
  - 无会话且无筛选 → “等待新版采集器”说明 + 配对设备 / 升级文档链接；不得从小时桶
    生成假会话。
  - 筛选无结果 → 清除筛选。
- 错误：401 跳登录并回跳 `/sessions`；其他错误在列表区重试。
- 隐私：页面不出现 prompt、正文、标题、绝对路径、resume command；项目列只显示 basename。

### 项目（`/projects`）

- 导航：侧边栏与抽屉在 Sessions 之后新增「项目」；页面显式套 `AppShell`，metadata 走
  `createPageMetadata({key:"projects"})`。定位是按项目聚合 AI 编码会话的用量、费用与活跃度。
- **两套口径并存**：`sessions`（会话元数据聚合，默认）与 `hourly`（`token_usage_hourly`
  用量桶聚合），由构建期环境变量 `NEXT_PUBLIC_PROJECTS_CALIBER=hourly` 切换
  （`lib/dashboard/api.ts` `projectsCaliber()`；未设置或任何其他值一律回落 sessions）。
  这是部署级动作，回退 = 删环境变量后重新部署。
- 筛选条：数量（全部 / 前 3 / 5 / 10）、排序（按 Token / 按费用）、展示形态（列表 / 卡片）
  + 刷新按钮。**无时间范围、无设备、无来源筛选**——时间恒为「全部」（服务端夹到 3 年上限）。
  `sort` 与 `limit` 写 URL（`history.replaceState`），默认 `sort=tokens`、`limit=all`。
- 摘要卡四格：总 Token（已归因）/ 总费用（同一口径，只算已归因）/ 项目数（取 `attributed_projects`，
  不含未归因）/ 未归因 Token；副标题「全部时间 · {from} – {to}」。
- 列表**不是表格**：行与卡片是同一套信息层级——项目 Logo（无 Logo 时为首字母方块）+ 项目名
  （有仓库时名字旁带一枚**不可点击**的仓库标记：GitHub / Gitee 各自图标，其他主机为通用链接图标）、
  来源品牌图标（最多 5 个，多余显示 `+N`）、占窗口百分比、Token 数与相对最高项的量条、底部 meta
  （费用 / 会话数 / 最近活跃）。排序由服务端做（降序，同值按 key 字典序），前端只做 Top-N 切片。
- 「未归因」组：服务端恒单独拆出并沉底（即使为 0），行内是 warning `Chip` + 说明文案。
  **Top-N 切片会把它切掉**（它在数组末尾），只有 `limit=all` 或列表较短时可见；摘要卡的
  「未归因」Token 数不受影响，摘要卡的项目数与列表头的「共 N 个项目」也不计它。
- 详情弹窗：点击行/卡片打开，头部标题在左，右侧依次是项目资料的两个动作与上一个/下一个，
  关闭按钮由 HeroUI 绝对定位在弹窗右上角（`Modal.CloseTrigger`，尺寸与圆角对齐 `size="sm"` 图标按钮：
  `size-9! md:size-8!`、`rounded-3xl!`、`top-3!`），头部右侧留 `pe-14` 给它让位、不压住操作按钮：
  「在 GitHub / Gitee 打开」（其他主机为「打开仓库」；新标签页，`noopener,noreferrer`；有仓库时才出现）
  与「编辑」，两者都是纯图标（文案只留在 `aria-label`），再是上一个/下一个（范围是当前可见列表）；
  「未归因」与审阅演示数据不显示两个资料动作。正文无上内边距（去掉 `Modal.Body` 的 3px 内边距与 8px 上边距）；
  `lg` 及以上左栏固定（切换项目时随右栏一起重挂载、滚动复位）、右栏用 `ScrollShadow` 独立滚动，
  `<lg` 整段正文一起滚动。左栏是 Logo + 项目名
  （设了显示名时下方注明「目录名 {basename}」）、区间、`口径：{caliber}` 与 6 个指标（Token 总量 /
  占比 / 费用 / 会话数 / 活跃天数 / 日均活跃日）+ 三条脚注（费用按刊例价、积分是独立维度、仅用量
  元数据）；右栏三段——「其他字段」（日峰值 / 最近活跃 / 积分，只列左栏没有的，不重复 Token、
  费用、会话数）、「每日活跃」柱状图（点柱固定当天；标题右侧的日期 `Select` 是同一动作的键盘/
  触屏入口）+ Token 构成条（input / cached / cacheCreation / output / reasoning）、「按来源」
  逐来源明细。
- 口径说明：`Disclosure` 折叠卡（默认收起，标题 `scopeNoteTitle`），展开后是随口径切两段的固定
  文案（`scopeNote.sessions` / `scopeNote.hourly`）。
- 状态：加载走骨架（摘要 + 6 行/6 卡，镜像真实结构）；无旧数据时 `SectionError` 重试，
  有旧数据时顶部红条「刷新失败，当前显示的是上次成功加载的数据」；空态两分（无数据 /
  仅剩零用量被过滤），给「配对设备」与「刷新」；刷新中盖半透明层 + `Spinner`。
- **项目资料**（2026-11-06；数据来源与契约见下条 API）：
  - 项目名：`resolveProjectDisplayName()`（`components/projects/identity.ts`）= 手动显示名，否则
    目录 basename（服务端 `normalizeProjectKey` 剥离控制字符与路径、截断 120 字符）。显示名只作用于
    展示层，搜索、行 key 与接口仍用 basename；**无合并映射、无脱敏**。隐私脚注「仅展示用量元数据，
    不含对话内容、路径或命令」不变。
  - 仓库：手动地址（任意 https）→ 采集器检测到的地址（契约 v3，仅 github.com / gitee.com；多设备
    取未吊销设备中最近上报的非空值）→ 不显示；「不显示仓库」开关只屏蔽检测值，不屏蔽手动地址。
  - Logo：`components/projects/project-logo.tsx`，HeroUI `Avatar`（圆角沿用原首字母方块）——手填
    Logo 地址 → 上传的图片 → 首字母，图片加载失败自动换下一级；进入视口附近（200px）才请求，
    `referrerPolicy="no-referrer"`。
  - 编辑弹窗 `components/projects/project-profile-dialog.tsx`（由详情弹窗的「编辑」打开，与详情弹窗
    并列渲染）：显示名（可选，≤60 字符）、仓库地址（https；下方提示检测值并可「使用检测值」）、
    「不显示仓库」开关、Logo（实时预览；上传 / 更换 / 移除上传的图片；Logo 地址；有 GitHub 仓库时
    可「填入 GitHub 头像」）。文本字段点「保存」一起提交；上传与移除图片**即时生效**（同设置页头像）。
    「恢复默认」两段确认，清空手动设置并删除上传的图片，检测值保留。部署未建 `avatars` 存储桶时
    隐藏上传入口并给说明。字段校验与服务端共用 `lib/projects/profile.ts`。
  - 上传沿用头像的裁剪流程：共享组件 `components/image-crop-dialog.tsx`（react-easy-crop，缩放 +
    90° 旋转，输出 256×256 WebP，浏览器不支持时为 PNG），选图只收 PNG / JPEG / WebP。
- 演示审阅面板 `projects-review-panel.tsx` 仅在 `?review=1` 时渲染（默认演示数据 + 页顶
  「演示数据 · 非真实用量」标记），仓库内无链接指向它；动效候选目录在 `projects-effects.ts`。
- API：`/api/app/projects` 与 `/api/app/projects-hourly` 顶层同形
  （`from/to/days/total/attributed_projects/limit/offset/caliber/totals{...}/filtered_zero_usage_projects/projects[]`）：
  `total` 含未归因组，`attributed_projects` 只数真实项目；`totals.attributed_cost_usd` 与
  `attributed_tokens` 同口径，`total_cost_usd` 为整窗口费用。差异只在 `caliber` 与
  `projects[].session_count` 的含义（sessions = 会话行数；hourly = 各桶 conversations 求和，故
  hourly 口径下列表行、列头与详情统一写「会话条目」）；详情走
  `/api/app/projects-detail`。项目资料走独立的 `/api/app/project-profiles`（cookie 会话鉴权，
  service-role 读写；与窗口和口径无关，页面加载与刷新时各拉一次，保存后就地更新）：
  `GET` → `{ upload_enabled, profiles[] }`（每项含 `display_name`、生效 `repo_url` 与
  `repo_source: manual | detected`、`detected_repo_url`、`manual_repo_url`、`repo_hidden`、
  `logo_url`、`logo_upload_url`）；`PUT` 整体替换手动字段（可带 `clear_logo_upload`；全空即删行）；
  `POST ?project_key=` 原始字节上传裁剪后的 Logo（按文件头只收 WebP / PNG，≤512 KB，存
  `avatars/<user_id>/projects/<uuid>.<ext>`，公开地址不含项目名，替换时删除旧图）；`DELETE
  ?project_key=` 恢复默认。表结构见 `docs/rewrite-plan.md` §3，检测值的上报规则见
  `docs/cli-contract.md` §2.4。

### 年度回顾（`/wrapped`）

- 页头：年份下拉只列**有数据的年份**（全历史月度桶去重、倒序；`aria-label` 为「选择
  年份」），默认当年，当年还没有数据时自动跳到最近有数据的一年；**切年份（折中方案）**：
  保留上一年的内容不空白，但整页卡片（四张统计卡 / 成就卡 / 月度趋势 / 来源用量 / 模型表）
  叠加半透明遮罩、置为不可交互（`aria-busy`，防止对旧年份数字误操作）并给**明确的加载提示**
  （`Select.Indicator` 渲染 `Spinner`），仅首载无内容时才画骨架；分享卡输入用 `yearReady`
  （`payloadYear === year`）门控，新年份 payload 未就绪前不投影、按钮禁用。**硬约束：任何情况下
  不得用旧年份数据生成新年份分享卡，也不得把旧数字挂在新年份标题下且无加载提示。**
  右上角是共享 `ShareCardButton`（与仪表盘同一按钮与 Modal，2026-10-30 操作者裁定：
  取代原先的页内分享卡面板）。
- 分享卡数据由 `wrapped/share-input.ts` 从年度 payload 投影，热力图条来自随页拉取的
  `account-heatmap`（52 周、窗口=所选年份，拉取失败静默降级，不阻塞页面）；「最常用来源」
  用 `sourceDisplayLabel`；分享卡输入用 `yearReady` 门控：切年份在途（新年份 payload 未就绪）
  或当年无数据（`hasData` 为假）时均为 `null`、按钮禁用，**任何情况下不得用旧年份数据生成
  新年份分享卡**（见页头折中方案）。
- 四张统计卡：全年 Tokens / 成本 / 会话 / 活跃天数，右上角 `text-accent/70` 图标
  （`Hashtag` / `Wallet` / `Comments` / `Calendar`）。顶部只保留这四张（2026-10-30
  操作者裁定：加上成就计数后五卡过挤）。
- 成就卡（`components/wrapped/achievements-card.tsx`，独占一行、紧随四张统计卡）：标题
  「已解锁成就」+ 右侧「共 N 枚」；内容为**当前已获得的全部成就**（`tier ≥ 1`，不按所选
  年份过滤），按段位从高到低排列，同段位保持目录顺序；每条 = 小徽章（40px）+ 名称（单行
  截断）+ 段位渐变标签。窄屏 2 列、`md` 起每行 4 列，纯展示、不可点击，详情与分享在
  `/achievements`。成就请求是可选的第 4 个并行请求：失败或未返回时整卡隐藏（不误报
  「还没有解锁」）；请求成功但一枚未解锁时显示空态文案。
- 月度趋势：复用仪表盘 `TrendChart`，输入 / 缓存 / 输出三色堆叠（缓存 = 读 + 写）；
  按月补零到整年（当年截至当月），月份标签走 `formatMonth`（本地化）。数据来自
  `account-monthly` 的全历史月桶（`from=2000-01-01` 到 tz 今天，一次拉取后按年过滤，
  同时喂年份下拉），桶按 UTC 月切分，与页头 tz 年度汇总只在跨年边界可能微差。
  Tooltip 各行的标签必须互不相同（共用同一串会折叠图例/行），行 key 用序号。
- 来源用量：顶部一条按 `seriesColor` 的堆叠占比条；每行 `SourceIcon` 品牌 Logo +
  `sourceDisplayLabel` 显示名 + `Tokens · 占比 · 成本`，下方同色细占比条。
- 模型用量：`DataTableCard` 一次展示全部（不分页、不排序），列：模型（`SourceIcon` 厂商 Logo + 模型
  名）、Tokens、成本、占比（`Meter` + 百分比）；切换年份保留上一年的行，随整页叠加半透明
  遮罩 + 加载提示并置为不可交互（页头折中方案，仅首载画骨架），不单独罩 `DataTableCard`
  刷新浮层；这一年没有模型明细时给「无模型明细」空态。
- 首载骨架：没有旧内容时整页画骨架（`components/wrapped/wrapped-skeleton.tsx`），按加载后的
  卡片栈逐块对齐——四张统计卡（保留卡壳与图标位）、成就卡（标题 + 六枚徽章行）、月度趋势、
  来源用量、模型表；灰条高度按真实排版取（`h4` 数字位 `h-7`、大数位 `h-8`），出数不跳高。
  页头随页面渲染，不画骨架。骨架**仅用于首载无内容**；切年份在途按页头折中方案保留上一年
  内容（半透明 + 不可交互 + 加载提示），不画骨架、不清空。

### 成就（`/achievements`，M7；版式与徽章资产见 P4）

- 导航：侧边栏与抽屉在 wrapped 后新增「成就」（`Medal` 图标），页面标题取菜单名；
  受登录保护（`src/proxy.ts` 的受保护页面与 matcher 均包含 `/achievements`，未登录直接跳
  `/login?next=/achievements`；接口 401 也跳登录并回跳）。
- 数据源：`GET /api/app/achievements?tz=&tz_offset_minutes=`（cookie 会话鉴权；**不设**
  Server Component 直出分支——Vercel 现行文档不再列出每次部署的函数数量上限，
  `docs/rewrite-plan.md` §2 已复核，不再以 12 为硬约束）。**已读水位**由同一个 route 的
  `POST`（body `{ seen_through: "YYYY-MM-DD" }`）
  推进，写失败静默，不影响页面。无筛选条；刷新图标按钮（与 Sessions 同款：
  `ArrowsRotateRight`，刷新中 `animate-spin`、按钮禁用并带 `aria-busy`，`Tooltip`
  显示上次更新时间）放在摘要右块「段位进度」数字行的右端、与数字组垂直居中
  （2026-11-08 操作者裁定，取代独立页头行）。手动刷新结束给 Toast 反馈：成功「成就已刷新」，失败显示加载失败
  原因；首次加载与 401 跳登录不弹。时区取浏览器时区，不写 URL。
- 摘要（页头，`achievements-summary.tsx`）：不再用「英雄带」大面板——标题（「已解锁成就」，
  `h2`）+ 副标题（「五档进阶，全部在读取时计算。」），右侧为**双口径**（2026-11-08）：大号段位
  合计 x/100（每条成就按当前段位贡献 0–5，等宽数字，左侧同基线小字标签「段位进度」）+
  一条细进度条（宽度按段位比例，`accent` 色），右块与标题块同高、顶部对齐（2026-11-08 操作者
  校正）；五档段位计数（青铜 / 白银 / 黄金 / 钻石 / 王者）+「已解锁 y/20」压成一行小字行
  （每档一个段位渐变色圆点 + 段位名 + 数量，字号 `text-xs`，数字 `text-sm`；已解锁项无圆点，
  与段位项同构）。
  数字走统一 format provider，文案进 `lib/copy/achievements.ts`（zh / en）。窄屏时计数与
  进度条换行到标题下方。
- 分区栅格：仍按「里程碑 / 高峰 / 节奏 / 探索」四个分区渲染（`achievements-section.tsx`）：
  区块标题带色条与「已解锁 n/m」计数；栅格为徽章墙——375px 三列、md 四列、lg 五列、
  xl 六列（`grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6`，间距 `gap-2`）；
  同分区内按 `tier` 降序（已解锁在前，同档保持 catalog 顺序）。
- 墙格（`achievement-card.tsx`）：无卡片边框、无阴影的独立单元——徽章（96px 圆盘，
  ≥md 112px）+ 名称（单行截断）+ 段位徽章（已解锁，渐变标签）/ 细进度条（未解锁）。悬停
  效果与仪表盘成就条瓦片一致（整格轻微上浮 + 手型光标，2026-10-31 操作者裁定，取代原
  「徽章抬升 + 光晕」）。整格是一个按钮（单一 tab 停靠点，格内不再嵌交互元素）；描述、
  当前值、下一档差额、达成日期一律下沉到弹窗，不在墙上占位。「新」角标贴在徽章右上角。
- 段位标签（`achievement-tier-badge.tsx`）：段位用**金属渐变标签**呈现，段位名写全
  （青铜 / 白银 / 黄金 / 钻石 / 王者，英文 Bronze / Silver / Gold / Diamond / King）；
  渐变坡道定义在 `achievement-tiers.ts` 的 `TIER_METALS` / `TIER_RAMPS`，同一坡道同时刷
  徽章外环、段位标签、等级历程进度条与摘要圆点，全页一套「段位语言」。**色值与渐变角度
  对齐上游 TokenTracker 的 tier 色板**：每档 = 中间色 → 一条窄高光带 → 深色
  （外环 135° / 高光带 42 %，标签与进度条 120° / 55 %），配深色字（上游 `glyph` 色）+
  内高光阴影（`inset 0 1px 1px rgba(255,255,255,0.4)`）——窄高光带才是「金属感」的来源。
  上游只有四档，`王者` 是我们的第五档，按同一配方取紫水晶色。未解锁段位用中性灰坡道；
  颜色不是唯一信息，段位同时以文字显示。
- 徽章视觉（`achievement-medallion.tsx`）：位图插画 `public/achievements/<id>.png`
  （256×256 透明 PNG，自有生成资产；风格模板与生成脚本见
  `scripts/admin/achievement-assets/`）。插画本身与段位无关：段位由徽章外的金属外环表达
  （青铜 / 白银 / 黄金 / 钻石 / 王者五色，外环占徽章直径 6 %），同一张图复用五档；徽章内部
  几何全部按比例（外环 6 %、裁切 5 %），因此徽章尺寸由 CSS 决定（`w-24 md:w-28`）。
  **尺寸归一化**：出图 QA 允许硬币占画幅 70–95 %，首批 18 张资产的实际占幅差 22 %，直接展示会
  出现「有的徽章大、有的徽章小」；`lib/achievements/art-fit.ts` 记录每张图的实测硬币半径
  （占画幅半宽的比例），徽章按 `(1 + 裁切) ÷ 半径` 缩放，所有硬币在墙上同大、裁切一致。
  守卫测试 `tests/unit/achievement-art-fit.test.ts` 直接解 PNG 的 alpha 圆盘重测半径，
  资产重新生成后表对不上就会失败。未解锁态灰化 + 右下角锁标；图片加载失败时回退
  `achievement-art.tsx` 的参数化 SVG 徽章（`<img onError>` + 挂载后检查 `naturalWidth`，
  覆盖「SSR 首屏就已 404、onError 收不到事件」的情况），页面不得出现空徽章位。颜色不是
  唯一信息，段位同时以文字显示。`prefers-reduced-motion` 下无动效。段位金属、渐变坡道与
  色相集中在 `achievement-tiers.ts`（`achievement-art.tsx` 与徽章组件共用一份）。
- 详情：点击墙格打开 `Modal`（`achievement-dialog.tsx`）：头部为**可拖拽翻面的 3D 硬币**
  （`achievement-coin.tsx`，176px；正面 = 位图徽章，背面 = 段位金属盘 + 段位名 +
  达成日（单行不折行，2026-11-02 操作者裁定），未解锁显示「尚未解锁」+ 下一档阈值；
  币缘堆叠环、机刻纹、双面高光扫掠与
  地面投影，物理与视觉对齐上游 TokenTracker 的 `Badge3DCoin`）。2026-11-01 操作者裁定
  （参考上游实现）：弹窗打开时硬币**入场整旋一周**落位，随后小幅怠速摆动（首次交互后
  永久停止）；**水平拖拽 1:1 旋转**，松手按速度惯性甩动并弹簧吸附到最近一面（180° 整数倍，
  永不停在侧面）；纯点击 / Enter / Space 仍翻面（`aria-pressed` 报告当前面），←/→ 方向键
  ±30°；`touch-action: pan-y` 保移动端纵向滚动；`Tooltip` 提示「拖拽或点击翻面 / 翻回」。
  弹窗关闭或切换成就时复位正面并重放入场。物理用 `motion/react`（2026-10-24 批准按需安装，
  本次实际引入，见 `docs/rewrite-plan.md` §4）；`prefers-reduced-motion` 下无入场/摆动、
  松手短 tween 落位，拖拽本身保留（用户驱动非装饰）。
  硬币下方为一句话描述 + 数据覆盖说明（Sessions 类与 sync 类成就注明「自 … 起统计」）；
  已解锁时在**弹窗正文最底部**显示 `fullWidth` 的「分享成就」按钮（先关详情再开分享弹窗，
  避免嵌套 Modal；2026-10-30 操作者裁定：从数值区上方移到底部并通栏），未解锁不显示。
  弹窗正文排版参考上游 TokenTracker 的徽章详情（左侧标签、右侧数值）：
  1. 当前值（大号等宽数字）+ 右上角**段位渐变徽章** + 达成日期；
  2. `dl` 分隔线下：①「距{tier}进度」+ 当前值 → 下一档阈值 + 段位渐变进度条；
     进度比例 = 当前值 ÷ 下一档阈值（与上游 `badgeProgress` 一致，钳在 0–100 %，
     见 `catalog.ts` 的 `progressRatioForNext`）；②「等级历程」——五段渐变段位条（已达的
     段位刷金属渐变，未达的是中性条），**达成日期走 Tooltip**；
  3. 五档时间线：每档一个段位渐变徽章（已达=金属渐变，未达=中性灰）+ 该档阈值 + 达成日
     （徽章上的 Tooltip 给出「段位 · 达成日 / 阈值 · 未达成」）。五档时间线与数据覆盖块
     各自留出间距，标题与「等级历程」同为弱化的小字。
- 分享卡弹窗（`achievement-share-dialog.tsx`，2026-10-30 P3）：左右两栏（`<lg` 上下堆叠），
  左侧预览导出的同一张 PNG（所见即所得），右侧「复制图片 / 下载 PNG」与隐私说明；
  渲染中显示 `Spinner`，失败给「卡片渲染失败，请重新打开」并可重试。卡片由 Canvas 2D
  引擎 `components/share-card/achievement.ts` 绘制，尺寸 **1080×1350**：深色底 + 段位
  径向光晕、右上角显示名称、居中徽章（同源 `/achievements/<id>.png`，加载失败画金属盘 +
  首字母占位，导出不中断）、段位渐变标签、名称与描述、当前值、达成日、底部落款；
  等待 `document.fonts.ready` 后再画；只含聚合数据（名称 / 描述 / 段位 / 当前值 / 达成日 /
  handle），不含行级信息；文件名 `token-usage-<id>-<tier>.png`。
- 新解锁（2026-10-30 P3 改服务端水位）：水位来自 `GET` 的 `seen_through`（账号级，
  跨设备一致），`unlocksSince(rows, seenThrough)` 得出晚于水位的墙格并显示「新」角标；
  「新」在本次访问内保持可见，渲染后再把水位推进到最近一次达成日（`POST`）。
  `seen_through === null` 视为首次基线：静默写入「最近一次达成日 ?? 本地今天」，
  **不标任何「新」**（老账号升级后不会被历史成就刷屏）。
- 全局解锁 toast（`achievement-unlock-watcher.tsx`，挂在 `AppShell`，无 UI）：每次整页
  加载只检查一次（SPA 内导航不重复，刷新才重置），延迟约 1.2 s，`/achievements` 页与
  隐藏标签页直接跳过。发现晚于水位的新解锁时弹一条 `success` 聚合 toast（6 s，最多列
  2 个「名称 · 段位」，其余写「等 N 枚」），随后推进水位；无新解锁不写、不弹。
- 状态：首载骨架按页头摘要 + 四个分区的圆形徽章占位（`achievements-skeleton.tsx`，占位圆
  与真实徽章同尺寸 96px / ≥md 112px），不画跳高；无任何用量数据时显示锁定栅格 + 配对设备
  引导；错误态在页面内重试（401 跳登录）。
- 可访问性：进度条带 `aria-label` 与百分比文本；墙格可键盘聚焦（`aria-label` 含名称与
  段位，锁定时追加进度百分比），弹窗焦点管理走 HeroUI；达成日期用本地化日期格式。
- 响应式：375px 三列、无页面级横向滚动；弹窗在 `<lg` 走 HeroUI 全屏尺寸。
- wrapped：年度回顾顶部保持四张统计卡，成就单独做成占一行的卡片（`achievements-card.tsx`），
  列出**当前已获得的全部成就**并带段位标签（段位降序，同段位保持目录顺序）；不按年份过滤，
  不新增分享卡风格。请求失败时整卡隐藏，成功但零解锁时显示空态（2026-10-30 操作者裁定：
  取代原「今年解锁 N 枚」第五卡）。

> **服务状态页移除**（2026-11-07 信息架构调整）：`/service-status` 独立页撤销——四项探针
> 里三项被「能打开该页」本身证真（proxy 已验会话、页面渲染已走过同域接口），而本产品的高频
> 故障在写入链路（采集停摆），读取链路真挂时该页自身也无法到达。职责拆分归位：实例自检并入
> **设置 · 设备分区的「实例诊断」卡**（见下节），采集链路心跳并入 **采集记录页的「设备采集
> 状态」条**（见采集记录节）；上游式「AI 服务商状态卡」不采纳（浏览器侧探测状态页误报率高，
> 与产品数据零耦合）。

### 设置 · 账户设置（`/settings`）

设置页用 `Tabs` / 分段导航：账户 / 偏好 / 设备（**Tab 状态读写 `?section=`**：用
`history.replaceState` 回写，非法或缺失值回落 `account`）；分区取值遵循
`docs/requirements.md` 的 `appearance|account|devices` 真源（账户 = `account`、
偏好 = `appearance`、设备 = `devices`）；
各分区用 `Card` 复合结构。账户分区自上而下为个人信息卡（名称 + 只读邮箱）、头像卡
（更换走 `react-easy-crop` 裁剪弹窗：缩放滑杆 + ±90° 旋转，canvas 合成 256×256 WebP
后上传，更换/删除按钮并列；弹窗是与项目 Logo 共用的 `components/image-crop-dialog.tsx`，
文案与上传函数由调用方传入）、预算卡（月度 USD 上限，`NumberField`：最小 0、最大
1,000,000、步长 1、整数美元，保存写本机 `token-usage.budget`，0 关闭）、密码卡
（设置/更新密码，≥8 位；
魔法链接账号在此开启密码登录）。登录页规范见下节「登录页（`/login`）」。
偏好分区由「外观」与「数据刷新」两张 `Card` 组成；外观卡逐行 label + control +
`Description`（语言/货币/日期下拉 `variant="secondary"`，货币选项为本地化名称 + 窄符号，如
`人民币(￥)`）；分区内 `ToggleButtonGroup` 统一 `size="sm"`；`Select` 无 size 属性，
沿用默认尺寸：

| 行 | 控件 | 选项 / 行为 |
|---|---|---|
| 主题 | `ToggleButtonGroup`（Sun / Moon / Display） | 浅色 / 深色 / 跟随系统；next-themes，默认 system |
| 字体 | `ToggleButtonGroup` | Maple（默认，内置等宽中文字体）/ 系统字体；写 `preferences.font`（zustand persist），`Providers` 内同步组件把偏好映射到 `<html data-font>`，globals.css 按属性切换 `--font-sans`/`--font-mono` |
| 语言 | `Select` | 跟随系统 / 中文 / English；`system` 行内提示当前解析结果；写 locale cookie |
| 货币 | `Select` | USD / EUR / GBP / CNY / JPY / HKD；下方 `Description` 显示 `1 USD = 6.6849 CNY`（非 USD）与“参考汇率 · as_of” |
| 日期格式 | `Select` | 跟随语言（默认）/ `YYYY-MM-DD` / `MM/DD/YYYY` / `DD/MM/YYYY`；只改日期部分，时间仍按语言 12/24 小时制，图表月份标签保持语言格式 |
| Token 显示 | `ToggleButtonGroup` | 紧凑 / 完整（2026-11-01 操作者裁定：默认完整） |
| 数字单位 | `ToggleButtonGroup` | K/M/B / 万/亿；仅紧凑模式生效，完整模式置灰并提示 |
| 数字分组 | `ToggleButtonGroup` | 3 位 / 4 位；仅完整模式生效，紧凑模式置灰并提示 |

- 全部即时生效，无“保存”按钮；分区最底部为“恢复默认”（`AlertDialog` 二次确认），重置
  主题 system、语言 system、字体、货币 USD、日期格式跟随语言、紧凑、K/M/B、3 位，以及
  数据刷新两项回到关闭；只重置本机偏好，不影响账户与设备。
- 分区底部说明：“外观与刷新偏好只保存在本浏览器，不写入账户；换设备需重设。”
- 控件旁的示例数字使用当前格式实时预览；切换时容器宽度稳定，不抖动。

外观卡下方另有「数据刷新」卡（2026-10-27 操作者裁定），控制仪表盘自动刷新，同样只存
本浏览器（`token-usage.refresh`，zustand persist），两项默认关闭：

| 行 | 控件 | 选项 / 行为 |
|---|---|---|
| 切回页面时刷新 | `Switch`（默认尺寸，拇指内 Check / Xmark 图标） | 标签页重新可见时立即拉取；60 秒冷却内重复切回不重复请求 |
| 定时刷新 | `Slider`（0–60，步长 5） | 0 = 关闭，仅页面可见时计时；输出 `关闭` / `每 N 分钟` / `每 1 小时`，轨道两端标注「关闭 / 1 小时」；拖拽结束才落盘 |

手动刷新始终可用，不受这两项影响。仪表盘卡片里的说明文字必须写明「0 表示关闭」，
因为 Slider 的无障碍值标签只会读出数字。

设备分区用 `DataTableCard`（标题=分区名、副标题=分区说明，Loading / Empty / Error 三态由
卡片接管，不再另配加载卡与错误卡）。表格列为 设备 / 平台 / 接入时间 / 用量 / 操作。操作列三枚**图标按钮**
（`Button isIconOnly` + 底部带箭头 `Tooltip`，文案即动作名；`Pencil` 改名 / `ArrowRotateLeft`
恢复默认名称 / `TrashBin` 吊销）：

- 改名：`Modal` + `TextField`。
- 恢复默认名称：`AlertDialog`（`status="accent"`）二次确认，正文同时给出当前名与目标名，确认后
  复用改名接口，不新增写端点。按钮**始终占位**，只在 `default_device_name` 快照缺失或与当前名
  相同（2026-10-28 操作者裁定：按条件显隐会让操作列错位）时禁用。
- 吊销（敏感操作，2026-10-28 操作者裁定）：两步——第一步 `Modal` 说明后果，主按钮「继续」；
  第二步 `Modal` 展示后果并要求**逐字输入设备名**，输入与当前名完全一致前「确认吊销」禁用，
  不一致时给 `FieldError`。取消/关闭任一步都整体退出，不保留已输入内容。

恢复默认与吊销的文案都只承诺对设备名/令牌的影响，必须写明已上报用量不受影响。

设备分区表格下方为「实例诊断」卡（2026-11-07 信息架构调整，承接原 `/service-status`
页的自查职责）：`Card` 复合结构，头部标题 + 说明；内容区上部为两行实例事实（Supabase
项目 / 配对回调地址，前置 `Database` / `Link` 图标，取自 public-config 响应）；下部为
四项探针表（公开配置 / 会话 / 仪表盘数据 / 设备列表，`Table` + 滚动容器，检查项列 =
图标 + 本地化名称 + muted 明细，状态列 `Chip` soft，延迟列 ≤300ms `text-success` /
>1500ms `text-warning`，会话行显示 `—`）。会话行反映页面 bootstrap 的会话而非独立
探测；探针每次进入设备分区重跑。页脚左侧冷启动提示（`{ms}` 占位），右侧「重新检查」
按钮（`isPending` 时图标位换 `Spinner`）。探针注册表在 `components/settings/
diagnostics.ts`，runner 在 `use-diagnostics.ts`，文案在 `lib/copy/diagnostics.ts`。

账户分区最底部为「公开徽章」卡（2026-11-02 P3，规范见 `docs/badge.md` §7）：自取数
（`/api/app/badge`，cookie 会话），Loading 骨架 / Error 走共享 `SectionError` 重试。
行结构沿用外观卡：短控件用 `Row`（label + `Description` 左、控件右），长内容（白名单、
预览、README 片段）用卡内 `Block`（label + 说明在上、全宽内容在下），分隔节奏一致：

| 行 | 控件 | 选项 / 行为 |
|---|---|---|
| 公开展示 | `Switch`（拇指 Check / Xmark，同数据刷新卡） | 未生成令牌时禁用并提示先生成；切换即 PUT（带浏览器时区） |
| 访问令牌 | 文本「已生成 · 末四位 xxxx」+ 按钮 | 无令牌：主按钮「生成令牌」；有令牌：「重置令牌」→ `AlertDialog`（`status="warning"`，确认按钮 `variant="danger"`），正文写明旧链接立即失效、已上报用量不受影响 |
| 仓库白名单 | 多选 `Select`（`selectionMode="multiple"`）+「保存白名单」 | 选项 = `knownProjects` ∪ 已在白名单的项；有改动才可保存，>32 项禁用；下方两行说明：三项口径缺口（账户级来源不计、无项目名会话不计、同名合并）与「活跃天数按 {时区} 折算」 |
| 预览 | 三组 `ToggleButtonGroup size="sm"`（风格 / 主题 / 范围）+ 仓库单选 `Select` | 预览图走会话预览分支，切换即换参；换参到新图解码完成之间盖 `PanelOverlay` 遮罩（容器 `aria-busy`），不闪上一张图；白名单为空时「仓库」置灰并提示；600px 面板在卡内横向滚动容器里，不外溢页面 |
| README 片段 | `ToggleButtonGroup`（单主题 / 跟随 GitHub 明暗）+ 只读 `TextArea` + 复制 | 按当前预览参数生成，令牌以 `YOUR_BADGE_TOKEN` 占位 |

- 生成/重置成功后弹「保存你的徽章令牌」`Modal`（`size="lg"`）：`Alert status="warning"` 写明
  只显示这一次；只读令牌框 + 图标复制按钮；下方是已填好真实令牌的同款片段区。该弹窗
  `isDismissable={false}` + `isKeyboardDismissDisabled`，只能点「我已保存」关闭——误触背景
  或 Esc 会让明文永久丢失。
- 复制统一 `navigator.clipboard.writeText`，成功 `toast.success`，失败普通 `toast` 提示手动选择。

**深链筛选与回跳**：首帧从 `?section=` 读取并**筛选**取值，只接受 `appearance` / `account` /
`devices`，缺失或非法值一律回落 `account` 并用 `replaceState` 回写规范 URL（与 `popstate` 同步，
Tab 切换不新增 history 记录）。**密码重置邮件回跳**：登录页「忘记密码」的
`resetPasswordForEmail` 回跳 `/auth/callback?next=/settings`，最终落在 `/settings`（不带 `?section=`）；
按上述缺省回落 `account`，用户直接在账户分区的密码卡设新密码——该回跳不得被地址栏残留的
`?section=` 截到别的分区，也不得丢失原路径与查询参数（呼应路由守卫约定）。

### 登录页（`/login`）

> 2026-11-07 重构（操作者拍板）：从「裸背景 + 居中小卡」升级为双栏品牌版式；
> 全部 auth 逻辑冻结不变（密码 / 魔法链接 / 忘记密码、`?next=` 消毒、callback
> 错误码、已发送态），本轮只动版式与品牌层。

**定位**：公开页（不套 AppShell）、`noindex`、主题跟随系统（无明暗切换入口）、
文案随语言（`lib/copy/login.ts`）。组件文件：`components/login/` 下
`login-client.tsx`（编排：Suspense + `useSearchParams` + 全部 auth 状态与回调）、
`login-body.tsx`（右栏表单主体）、`login-brand-panel.tsx`（品牌区 + 纹样 + 移动端
品牌条）。

**布局（桌面 ≥ lg）**：`min-h-svh` 双栏 grid——左栏约 45% 为品牌视觉区，右栏表单
区垂直居中（HeroUI `Card` 卡片，内容 `max-w-md`，卡内 `p-6 sm:p-8`）。**< lg 单栏**：
顶部品牌条（Logo + 词标）+ 表单卡。**右上角快捷区**（2026-11-07 二轮）：复用
`components/top-actions.tsx` 的四枚顶栏图标按钮（GitHub 仓库 / 语言 / 主题色 /
明暗模式；**不含**「配对设备」主按钮），绝对定位页右上角并与品牌行**居中同带**
（2026-11-07 三轮：`top-8 right-6 h-8`，lg 起 `lg:top-10 lg:right-12 lg:h-9`——
top/height 镜像品牌行的 `pt-8`+自然行高 与 `lg:py-10`+`h-9`，两侧中心线重合）。

**品牌区（左栏）**，自上而下：

- Lockup：`/logo.svg` / `/logo-dark.svg` 明暗双份 + 「Token Usage」词标 + uppercase
  字距 tagline（同侧栏 `brand.tsx` 语言）；**静态展示不链接**（链 `/` 会触发
  `/login → / → /login` 循环）。
- 主标语 + 副标语（双语，操作者可改文案）。
- 「近一年热力图」抽象纹样：53×7 种子伪随机矩阵（确定性种子，无 `Math.random`，
  避免 hydration 漂移），单元格色 `var(--heatmap-1..4)` 内联（同仪表盘
  `heatmap-geometry.ts` 用法），整体透明度压低；容器淡出遮罩。呼吸动效纯 CSS 且
  `prefers-reduced-motion` 下关停。
- 底部页脚一行 muted 小字（`text-[10px]`）：`Token Usage · token-usage.cc`。
- 环境：`--accent` radial 光晕自左下极淡渗出（~10% 内混透明），全页 `pointer-events-none`，
  明暗主题随 token 自适应。

**表单区（右栏，HeroUI `Card` 复合结构，`p-6 sm:p-8`，2026-11-07 二轮由去卡片化
改为卡片）**：`Card.Header`（`Card.Title` + `Card.Description`）→ `Card.Content`
内 HeroUI `Tabs`（密码登录 `Lock` / 魔法链接 `Envelope`，沿用既有 Tabs 结构）→
表单（`TextField` + `InputGroup variant="secondary"`，前缀图标：邮箱 `Envelope` /
密码 `Lock`；密码 tab 提供「忘记密码」邮箱重置入口，resetPasswordForEmail 回跳
设置页设新密码）→ **OAuth 区**：`Separator` 细线 + 「或使用以下方式」divider 文案
+ GitHub / Google 两枚 `Button variant="secondary"` **各占一行全宽**（内联 SVG
图标，GitHub 用 `currentColor` 跟随主题）。

**OAuth 接入（2026-11-07，密钥配置完成后由占位替换为真实调用）**：GitHub / Google
按钮分别走 `signInWithOAuth({ provider, options: { redirectTo } })`，`redirectTo`
= 本站 `/auth/callback?next=<消毒后的目标>`（与魔法链接同一回调路由，PKCE 交换；
目标为缺省落点 `/` 时省略冗余 `?next=`，与 `/login` 跳转同规则——`urlWithNext`）。
**状态与防重复**（2026-11-07 操作者要求）：`oauthPending`（github / google / null）
驱动点击按钮的 `isPending` Spinner（图标位换 Spinner）并 `isDisabled` 锁住其余全部
登录控件（密码/魔法提交、忘记密码、另一枚 OAuth 按钮），handler 首行同步 guard
`busy || oauthPending` 使双击为 no-op；即便重复发起也只是 Supabase 会话替换，不产生
重复账号。**跳转由 `skipBrowserRedirect: true` + 手动 `location.href` 完成**（2026-11-07
操作者实测反馈"状态从不出现"）：自动跳转与状态更新同在一条微任务链，快网络下
导航抢在绘制前完成、pending 态永不可见；改为拿到授权 URL 后先画 150ms 再离页，
慢网络下 Spinner 则持续到 provider 页接管。provider 侧失败的回跳统一落
`/login?error=…` 由既有错误条渲染。
**错误码映射（2026-11-07）**：GoTrue 以 `?error=<code>` 弹回 `/auth/callback`，
路由转发为稳定码 `oauth_<code>`；登录页对已知码给专属文案——`oauth_signup_disabled`
（注册闸门关闭，"本站注册已关闭，仅限受邀账号登录"）与 `oauth_access_denied`
（取消授权），其余（含本地 `auth_code_missing` / `auth_exchange_failed`）回落
通用文案。按钮显隐
的口子（按部署者已配置 provider 下发）留作后续增强，当前两枚恒显；部署者未配置
provider 时点击会经 Supabase 回跳报错，不崩溃。

**验收**：桌面与 375px 无页面级横向滚动；明暗双套成立；`prefers-reduced-motion`
下无入场/呼吸动效；OAuth 按钮断言零网络请求；`pnpm verify` 全绿。

### 公开页（`/u/<token>`，徽章点击落地）

> **2026-11-05 二轮～六轮裁定（`docs/badge.md` §0）覆盖本节冲突描述**：头像、
> 两列各 5 行等高对齐（六轮把来源 `Meter` 移出文档流，两列共用同一居中基线）、
> 热力图改仪表盘同款近一年并上移且去卡片底色、成就全列放大
> 并复用成就页详情弹窗、删除设置开关与仓库模块、顶部品牌栏（Logo + GitHub
> outline Button）、Token 数值改随访客偏好格式、模型行加成本、删除成本说明、
> 口径行移到头像行右侧并精简为「全量数据 · 更新于 …」（起止日由 HeroUI
> `Tooltip` + `Tooltip.Trigger` 展示，不再用原生 `title`；裸 DOM 触发器无法
> 消费 `FocusableContext`，浮层不会打开。成就页三处同类触发器已一并修复，
> 由 `tests/contract/tooltip-trigger.test.ts` 统一守卫）。
> 组件优先 HeroUI（Button / Avatar / Typography），悬停抬升用 Tailwind
> `group-hover`。以下保留作决策沿革。

规范见 `docs/badge.md` §6（页面唯一规范）与 §4.7（数据口径）；2026-11-05 改版方向已由
操作者确认，实现按 `docs/badge.md` §10 的 P9–P11 推进。公开页面、无 AppShell
（同 `/login`）、`noindex`；主题跟随系统（无明暗切换入口，不做深色专属变体）；文案随
访客语言，数字沿用徽章的固定口径（`lib/badge/format.ts`，与 README 里的 SVG 一致，
不受访客本地偏好影响）。**不再展示近 30 天维度**，全页统一总数据口径。

- **现状**（2026-11-05 改版后）：口径行 → **唯一巨数**总 Tokens → 四列无边框指标带（成本 /
  活跃天数 / 来源数 / 模型数）→ 两枚全历史事实胶囊（最长连续天数 / 单日峰值）→ 来源 / 模型
  结构双栏 → **近一年热力图** → **成就墙** → 页脚；无 AppShell（同 `/login`）、`noindex`、
  主题跟随系统，文案随访客语言，全页统一总数据口径（**不再展示近 30 天维度**）。
- **规范以 `docs/badge.md` §6 为准**（页面唯一规范，数据口径见 §4.7；§6 中与 §0 的
  2026-11-05 裁定冲突的条目以 §0 为准）；本篇不重复展开版式与动效细则，避免两篇各说一套。
- UI 层面差异（相对仪表盘 / 成就页）：
  - **热力图**：复用 `components/heatmap-card.tsx` 的 `HeatmapCard bare hideFilter`
    ——近一年 52 周、Mon-start 周格、月份 / 周几标尺、共享 portal tooltip（含来源明细）、
    时区脚注与图例均与仪表盘同款；差异是**无平台来源筛选、无点击下钻、无卡片底色**，数字走
    `HeatmapCard` 默认的访客偏好格式。
  - **成就墙**：列出**全部已解锁成就**（`tier >= 1`，按目录顺序，3 / 5 / 6 列栅格，徽章
    放大），复用 `achievement-medallion.tsx` / `achievement-tiers.ts` 与既有 PNG；点击打开
    **共享的 `AchievementDialog`**（`apps/web/src/components/achievement-dialog.tsx`，
    经 `components/u/u-achievement-dialog.tsx` 转接），与 `/achievements` 是同一个弹窗
    （含当前值、阈值与五档历程）；公开页不传分享回调，故弹窗内隐藏「分享成就」入口。
  - **数字**：动态数值走 `components/flow-number.tsx`（`FlowNumber`），公开页指标传
    `lib/badge/format.ts` 的固定口径串（不使用登录态 `useFormat`），并补 `<noscript>` 与
    `aria-label` 兜底。
- 文件：`src/components/u/u-body.tsx` 编排，`u-hero.tsx` / `u-metrics.tsx` /
  `u-breakdown-section.tsx` / `u-heatmap.tsx` / `u-achievements.tsx` /
  `u-achievement-dialog.tsx` / `u-public-number.tsx`（按需）

### 采集记录（`/sync-runs`）

**沿用 Sessions 模式**：受登录保护、`useSessionBootstrap` 取会话、URL 筛选（`replaceState` 回写 +
`popstate` 同步，筛选变更只重取数据、不整页导航）、`DataTableCard` 列表（≥md `Table` / <md
`renderMobileRow` 卡片列表）、首载骨架保留卡壳与图标、汇总卡数值走 `FlowNumber`、筛选无结果的
「清除筛选」空态、刷新失败保留旧行并卡顶危险条 + 重试、401 跳登录并回跳原路径与查询参数、
仅聚合遥测（计数器 / 枚举 / 版本，不含路径或标题）、`lib/copy/sync-runs.ts`（zh / en）。数据源
`account-sync-runs`（`docs/cli-contract.md` §2.12），一行一轮 sync（含空轮，兼作采集器心跳）。

差异清单（相对 Sessions）：

- **trigger / result 筛选**：筛选条在时间范围（`DateRangePicker` + 今天 / 7D / 30D / 90D 预设；
  预设不写 URL、自定义 `from` / `to` 写并回显，窗口按浏览器本地时区换算 ISO `[from, to)`）
  与设备（`DeviceFilterSelect`，复用）之外，另有 **trigger**（scheduled / manual / watch / notify）
  与 **result**（ok / partial / error）两个 `Select`；`device_id` / `trigger` / `result` / `offset` /
  `page_size` 写 URL，默认近 30 天、20/页（可选 10/20/50/100）；任一非分页筛选变化把 `offset`
  归零，结果集缩到当前页以下时回跳到最后一页，「清除筛选」回到默认。无来源 / 项目筛选、
  无 CSV 导出、无详情弹窗。
- **汇总卡**：仅两张（今日运行数 / 最近一次运行），取当天窗口；当天无运行则回溯近 7 天最近
  一轮探针，今日空轮给提示，最近运行时间显示绝对 + 相对时间。首载保留真实标题与图标、只有
  数字/文本位骨架（同 Sessions），但**不是** Sessions 的四张（会话数 / 总 Token / 成本 / 平均时长）。
- **设备采集状态条**（2026-11-07 信息架构调整，承接原 `/service-status` 页的链路健康职责的
  写入侧）：汇总卡下方的 `Card`，每设备一行 = 状态 `Chip` soft（正常 success / 滞后 warning /
  中断与失败 danger / 无记录 default）+ 设备名 + muted 明细（「最后成功 {相对时间}」；失败行给
  错误码；无记录给「近 7 天没有运行记录」）+ 右侧等宽小字遥测（`cli_version · os`，暴露版本
  偏差）。状态 Chip 内前置活体圆点：两层 `bg-current`（颜色跟随 soft 变体文本色）——实心
  点 + `animate-ping` 扩散层（`motion-reduce:animate-none` 停扩散，全局 reduced-motion
  兜底仍在）；「无记录」态只有静态点（无信号不扩散）。阈值：≤24h 正常（机器夜间关机不算
  异常）、≤7 天滞后、>7 天中断；最近一次运行失败则
  整行「失败」（优先级最高，成功锚点仍显示）。规则纯函数在 `device-freshness.ts`（单测钉住）；
  数据 = 独立的近 7 天窗口（limit 200，随每次加载并行重取，失败降级为整条隐藏）与账户设备
  花名册的并集，**不随页面筛选收窄**（状态视图，非筛选视图）。首载骨架同汇总卡规则：卡壳与
  标题/说明为真实文案，仅行占位（Chip / 名称 / 明细 / 遥测四段圆条，2 行），随
  `SummaryCardsSkeleton` 一起渲染，避免数据落地后状态条突现。
- **刷新 Tooltip**：筛选条最右侧为与 Sessions 同款的刷新图标按钮（`ArrowsRotateRight`，刷新中
  `animate-spin`，`Tooltip` 显示上次更新时间、未加载时显示「尚未加载数据」）；刷新同时重取
  今日汇总、设备 facet 与列表。
- **列表列**：开始时间 / 设备 / trigger `Chip` / result（`RunResultCell`，error 带 `error_code`）/
  耗时 / 上报量（`RunVolumeCell`：解析文件数、上报桶数，空轮标「空」`Chip`）；按开始时间倒序、
  不做列排序、服务端分页、页脚 `TablePagination`。

### 配对（`/device`）

**沿用 Sessions 模式**：受登录保护（未登录跳 `/login?next=…` 并保留配对链接 `?user_code=`，
登录成功回跳原目标；见路由守卫约定）、`useSessionBootstrap` 取会话、HeroUI 复合结构与语义
组件（`Card.Header/Title/Description/Content`、`InputOTP`、`Label`）、`lib/copy/device.ts`
（zh / en）、三态与 375px 无横向滚动、错误态可重试、文案不硬编码。批准走冻结的
`device-flow-grant` 端点（`docs/cli-contract.md` §1.1 / §2.3），带浏览器会话 JWT；`user_code`
契约字母表不含 `0/1/I/L/O`（`^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$`），`useSearchParams`
置于 `Suspense` 边界内。

差异清单（相对 Sessions）：

- **`user_code` 五态流程**（`Phase = input | confirm | approving | success | error`）：① `input`——
  无合法 `?user_code=` 时手填 `InputOTP`（8 槽、4+4 分组，自动大写并过滤非法字符、格式化
  `XXXX-XXXX`）；② `confirm`——URL 带合法码或手填通过后展示大号等宽 `user_code`，点「批准」
  才发请求；③ `approving`——`Spinner` + 说明、禁用重复提交；④ `success`——成功卡；
  ⑤ `error`——404 码不存在/过期、400 码无效、其余通用错误，带「重试」（保留当前码）与
  「重新输入」（复位到 ①）。**无列表、无筛选、无 URL 分页、无汇总卡、无刷新按钮**；
  `user_code` 只从 `?user_code=` 读取、不回写 URL。
- **顶栏主操作复位语义**：顶栏固定「配对设备」主操作（`Plus`，`variant="primary"`）始终
  `router.push("/device")`（不带 `user_code`），语义是**新建一次配对**；当页面已带 `?user_code=`
  处于 confirm / approving / error 态时，点它必须清除 `user_code`、丢弃当前码与错误、复位回
  `input` 手填态，不得沿用旧码继续批准。其余顶栏控件（GitHub / 语言 / 主题色 / 明暗）行为不变。
- 页面为 `max-w-xl` 居中单列审批流（非数据面）：不套 `DataTableCard` / 汇总卡 /
  `DeviceFilterSelect` / CSV 导出；`min-h` 居中、无页面级横向滚动。

## 数字、货币与时间格式

- 唯一入口是统一 format provider（`useFormat`）；Dashboard、Sessions、Wrapped、Settings、
  分享卡片全部使用。组件内禁止散落 `toFixed` / `Intl.NumberFormat` / 手写单位。万/亿与
  4 位分组也在 provider 内实现，数字与分隔符仍取自 `Intl.NumberFormat` 的 locale 规则。
- 存储值始终是 USD 与原始整数；货币只改显示，不写回 API、不入库。
- Token 显示：
  - 紧凑 + K/M/B：<1000 原样；1e3 `K`、1e6 `M`、1e9 `B`、1e12 `T`；1 位小数，去掉
    尾随 `.0`；999.95 进位到下一单位。
  - 紧凑 + 万/亿：<1e4 原样；1e4 `万`、1e8 `亿`、1e12 `万亿`；1 位小数，去掉尾随 `.0`。
  - 完整 + 3 位：`1,234,567`；完整 + 4 位：`123,4567`（每 4 位一组，分隔符随 UI 语言）。
  - 单位只作用于紧凑，分组只作用于完整/明细整数；两者互斥提示。
- 成本：默认 2 位小数；`0 < |v| < 0.01` 显示 `<¥0.01`（或所选币种）；0 显示 `¥0.00`；
  负数符号在货币符号前（`-¥1.23`）。契约的 6dp 字符串只用于传输，UI 不直接展示 6dp。
- 汇率：`1 USD = <rate 4dp> <CODE>`；内置快照 + `TOKEN_USAGE_FX_RATES` 覆盖；UI 标注
  “参考汇率”和 `as_of`；不做实时刷新、不调用外部 API。
- 日期/时间：按 UI locale 与所选时区格式化；日期顺序可设为跟随语言 / `YYYY-MM-DD` /
  `MM/DD/YYYY` / `DD/MM/YYYY`，非跟随语言时时间部分仍按 UI 语言（12/24 小时制），中文以
  空格、英文以逗号连接；图表月份标签始终跟随语言。Sessions 详情显示绝对时间 + 相对时间；
  表格数字使用 `tabular-nums`。
- 空值：`null` / `undefined` / 空字符串显示 `—`，不显示 0；0 是有效值。

## 语言、主题与偏好持久化

- 语言 preference：`system | zh | en`；cookie `token-usage.locale`。缺省或 `system` 时
  服务端按 `Accept-Language` 的 q 值取首个受支持语言（zh / en），否则 en；显式 zh / en
  优先。SSR 用同一解析结果设置 `<html lang>` 与首帧字典；客户端切换写 cookie、更新
  provider 与 `<html lang>`，无需整页刷新。
- `system` 在设置页显示“跟随系统（当前：中文 / English）”；顶栏语言菜单不重复当前解析
  结果（只列 跟随系统 / 简体中文 / English）。两处共用同一偏好，切换互相同步。
- 主题：next-themes，`attribute="class"`、`enableSystem`，沿用默认 storageKey
  `theme`（不重置现有偏好）；默认 system；设置页与顶栏明暗切换共用。
- 货币 / Token 显示 / 单位 / 分组 / 日期格式：zustand persist（`stores/format-preferences-store.ts`，
  单键 `token-usage.format-preferences`，2026-10-25 起收编 zustand）；首次读取自动迁移并
  清除旧扁平键（`token-usage.currency` / `token-usage.token-format` /
  `token-usage.token-unit` / `token-usage.token-grouping`）；值分别为 ISO 4217 代码、
  `compact|full`、`kmb|wan`、`3|4`、`locale|iso|mdy|dmy`；只影响本浏览器，不写数据库。
- Hydration：locale cookie 保证 SSR 首帧；主题由 next-themes 首屏脚本避免闪烁；
  localStorage 显示偏好在挂载后读取，设置页可先渲染默认值；数字使用 `tabular-nums`
  且容器预留宽度，不允许明显跳动。仪表盘 / Sessions 数据本身客户端加载，不存在服务端
  数字与客户端不一致。
- 无偏好或存储损坏：回退 `system` / USD / 紧凑 / K-M-B / 3 位 / 日期跟随语言，不抛错。

## UI 基准

- M5.5 起以新版仪表盘为视觉与行为基准（M3 版仅历史参考）：其余页面复用其模式，不自创；
  确需偏离时先回写本文。
- App Shell（2026-10-24 操作者要求，参照 better-admin 截图重做；2026-10-25 二轮调整）：
  - 桌面侧边栏自顶向下为品牌、胶囊导航、底部用户块（头像 + 名称 + 下拉：账户设置 /
    退出登录）；侧边栏无背景色与右边框，与页面共用底色。折叠态 76px 仅留图标，状态存
    localStorage。退出登录只保留用户块下拉一处（含确认对话框），不再有「帮助与信息」及
    独立的退出登录入口。导航项：仪表盘、Sessions、项目、采集记录、年度回顾、成就、设置
    （2026-11-07 移除「服务状态」：自查并入设置设备分区的实例诊断卡，链路心跳并入采集
    记录页）；Sessions
    位于仪表盘之后，使用 `ListUl` 图标。
  - 顶栏持有页面标题（仪表盘为按时段的问候语，其余页面取菜单名），页面正文不再重复
    标题；顶栏无下边框，底色与页面一致；右侧固定为 GitHub / 语言 / 主题色 / 明暗切换 /
    配对设备主操作。四个图标控件均带 `Tooltip`（底部、带箭头）：GitHub 用 `Button`
    打开新标签（RAC `Link` 不消费 TooltipTrigger 的焦点上下文，挂不上 Tooltip），语言为
    图标按钮 + 单选下拉，主题色为 `Popover` + `ColorSwatchPicker` 色板（含随机切换），
    色板变量见 `apps/web/src/styles/theme-palettes.css`；仪表盘分享按钮同样带 `Tooltip`。
  - 明暗切换为单个按钮，循环 跟随系统 → 浅色 → 深色（2026-10-28 操作者裁定，参照桌面端
    `apps/desktop` 的 `ThemeToggle`）：图标与 Tooltip（「主题：{当前模式}」）始终显示
    当前模式；仪表盘以外保持 32px 图标按钮尺寸。
  - `lg` 以下侧边栏换为抽屉：导航在上，底部仅保留用户块；GitHub / 语言 / 主题色 /
    明暗切换 / 配对设备在移动端顶栏照常显示、与桌面一致（2026-10-28 修订 2026-10-26
    裁定：明暗切换常驻顶栏，抽屉不再提供）。抽屉面板底色取页面底色 `bg-background`，
    使选中导航项 `bg-surface` 胶囊与桌面侧边栏一样可见。
  - 语言偏好写 `token-usage.locale` cookie（`system | zh | en`，缺省 `system`）；根布局
    据此解析并设置 `<html lang>` 与首帧字典，切换即时生效、刷新不闪烁。
- 页面容器宽度三档（2026-11-08 固化为明文）：`AppShell` 只提供壳，内容宽度由各页
  `<main>` 自持，新页面按内容类型归档，不新增第四档——
  - **数据面 `max-w-6xl`**（表格 / 多列栅格 / 图表，越宽越利扫描）：仪表盘 `/`、Sessions、
    项目、采集记录、成就；
  - **卡片·叙事面 `max-w-5xl`**（表单卡 / 故事卡，行长短，拉宽阅读性反降）：设置、
    年度回顾、公开页 `/u/<token>`；
  - **聚焦流**（单列居中）：登录表单 `max-w-md`、配对审批 `max-w-xl`。
  壳与侧栏宽度恒定，切页时内容宽度按档位跳变属内容驱动的有意区分，不是待修的不一致。
- 审查：UI 代码提交前用 web-design-guidelines Skill 对照最新 Web Interface Guidelines，
  输出 `file:line` 问题清单并修复。
