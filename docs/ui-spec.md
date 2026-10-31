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

## 组件规则（编码级）

- 选取顺序：HeroUI 内置（75+，`node scripts/list_components.mjs` 查清单）→ HeroUI 组合 →
  自研；自研组件沿用主题变量与 tailwind-variants。
- HeroUI 组件的交互回调统一 `onPress`；原生 `onClick` 仅用于非 HeroUI 元素。
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
   今天 / 7D / 30D / 90D / 总计 快捷按钮（`ToggleButtonGroup`，单选、
   `min-w-14` 最小宽度，活动预设高亮，点选关层）；在日历手动选取则写 `range=custom`
   + 具体日键）、时区、设备。设备下拉与 Sessions 共用 `DeviceFilterSelect`，选项前置
   `Display` 图标，“全部设备”用 `Layers`；触发器复显同一图标，名称单行省略不换行。
   时间范围筛选仅存组件内状态（2026-10-26 操作者裁定）：不写入 URL、加载时不回显，
   首帧把旧链接里的 `range` / `from` / `to` 清出地址栏，刷新回到默认近 30 天；
   URL 仅保留 `tz` / `device_id`；日期上限为仪表盘时区（`tz`）的今天，日历与日期输入
   均不接受未来日期；变更只重取数据，
   不整页刷新——各卡片保留旧内容并叠加模糊遮罩 + `Spinner`（仅首载无数据时出骨架屏，
   骨架屏圆角与卡片一致：`min(32px, var(--radius-3xl))`）。筛选条右侧固定「分享」
   （共享 `ShareCardButton`：`NodesRight` 图标 + `Tooltip`，打开分享卡 Modal）与「刷新」两个
   tertiary 图标按钮，刷新中图标自旋；
   刷新按钮的 `Tooltip`（带箭头）显示上次更新时间（未加载时显示「尚未加载数据」）。仪表盘自动刷新
   默认关闭（2026-10-27 操作者裁定，设置页「数据刷新」可控）：定时与切回刷新均为静默
   更新（不叠加模糊遮罩），手动刷新仍带遮罩；「时」视图下手动刷新同时重取小时明细。
   `from` / `to` 为所选时区的日键（`YYYY-MM-DD`），与契约的日粒度序列一致；「总计」以
   2000-01-01 为起点（服务端按 MAX_RANGE_DAYS 钳制）。
2. **总 Tokens 头卡**（独占一行、仪表盘首卡，参考上游 Broadsheet 视觉）：居中大号
   Token 总数、计费 Token / 会话数 / 活跃天数 / 日均（30 天）四个紧凑指标、成本行
   （存在未定价模型时加 `≥` 前缀 + ⓘ `Tooltip` 说明估算下限；行尾小字「全部时间」累计
   成本）、日期区间、按来源占比的堆叠色条、「全部 + 每来源」占比卡（`SourceIcon` 图标 +
   占比 `text-base` + 模型数；「全部」与每来源卡均可点击，打开模型明细
   `ModelListModal`——列 模型 / Token / 占比 / 成本，「全部」为跨来源同名模型合并，
   明细桶只有逐模型 Token、无成本列时成本列自动隐藏）。
   2026-10-26 二次精简（操作者裁定）：原 KPI 4 卡、成本卡与近期用量（rolling）卡全部
   移除——范围成本与全部时间成本在头卡，近期统计经筛选条可达，成本分析从 Top 模型
   「成本分析」按钮进入；口径：总 Token = `totals.total_tokens`，计费 =
   `totals.billable_total_tokens`，成本 = `totals.total_cost_usd`，会话数 =
   `totals.conversation_count`，活跃天数 = `days`，日均（30 天）=
   `rolling.last_30d.avg_per_active_day`（计费 Token ÷ 活跃天）。大数一律走统一 format
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
   `components/achievements/achievement-detail.tsx` 的 `AchievementDetail`：
   详情 + 分享一体，2026-10-31 操作者裁定，取代 2026-10-30 的只读裁定，瓦片不再画
   进度条）。「查看全部」入口保留。全部条目当前值为 0（空账号）时整条不渲染；
   数据失败走 Card 内 `SectionError` + 重试，加载中用同构的墙格骨架占位。该条与全局解锁
   watcher 共用 `fetchAchievementsShared` 的在途请求（同一时区参数下只算一次；仪表盘选了
   自定义时区时两者口径不同，各取一次）。
3. **活跃热力图**（独占一行，紧跟总 Tokens 头卡，`components/dashboard/heatmap-card.tsx`）：
   近 52 周 Mon-start 满宽网格（窄屏裁周、宽屏撑满格子，`ResizeObserver` 自适应）；
   月份标尺在上、周几单字标尺（一~日 / M~S）在左；右上「全部平台」多选筛选
   （`Dropdown.ItemIndicator` 勾选态，全部/清空，触发按钮显示已选状态），按来源过滤后
   等级客户端重算；共享 portal tooltip 显示当日总量与来源明细；左下时区标注
   （`UTC+08:00`），右下 少/多 图例；色阶 `--heatmap-0..4`（0 级 = `--default`，
   1–4 级为 accent 降饱和梯度，深浅主题各自定义于 `globals.css`）。
4. **趋势**：日/月切换（`Tabs`）+ 指标切换（Token / 成本），recharts；范围跟随筛选条。
5. **双栏**：Top 模型（`SourceIcon`、名称、Token、占比 `Meter`、成本，前 8 条 +
   「成本分析」按钮打开成本分析 Modal）；来源卡（`SourceIcon`、占比 + 成本，随设备筛选，
   取 `model-breakdown`）。
   来源/模型图标走 `components/source-icon.tsx`：`public/brand-logos/`（品牌商标，
   来源与许可登记在根 `THIRD_PARTY_NOTICES.md`）优先，source 全称映射 + 模型名
   前缀映射（deepseek/kimi/k3/gemini/grok/mimo/gpt/composer/claude/step/minimax/
   hy/nemotron/cline-free/opencode 隐身别名等），仍无映射时回落到该行的来源标
   （模型行传 `source` 属性；两者都无才退确定性色块）；新增品牌 = 放 logo 文件 +
   在 `SOURCE_LOGOS` / `MODEL_PREFIX_LOGOS` 登记。暗色变体：深色主题下
   看不清的深色标（如黑底 ChatGPT 形状的 codex 新标），放同扩展名的
   `<name>-dark.<ext>`（如 `codex-dark.svg`）并把浅色文件名加进 `sources.ts` 的
   `DARK_LOGO_FILES`，渲染层自动叠双图按 `.dark` 切换；未登记的 `-dark` 文件不生效。
6. **设备卡**（独占一行）：名称/平台/最后上报/Token/成本，取 `dashboard.devices`，
   仅活跃设备且不随设备筛选收窄；点击设备卡把 `device_id` 写入筛选条。
7. **明细**：`Tabs` 日 / 时 / 月；`Table` 列（时间、Token、计费 Token、成本、会话、
   模型数）；列头排序、`Pagination`（默认 10/页，可选 10/20/50/100）；时视图先选日期（默认今天）；时区
   切换即时重算日/时，月视图按契约固定 UTC；空窗口显示空态；模型数列可点击（桶内
   `models` 非空时），打开该桶的模型明细 Modal（同 `ModelListModal`）。
8. **成本分析**：从 Top 模型「成本分析」按钮打开 `Modal`；`Tabs` 按模型 / 按来源；
   总成本、日成本趋势、未定价模型提示；只读，不提供导出。
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
   跟随分组设置），与仪表盘的紧凑显示偏好解耦；其余风格沿用偏好格式。
   **成就分享卡**（2026-10-30 P3，`components/share-card/achievement.ts`）不属于上述四种风格：
   它是成就详情弹窗的独立分享入口，固定 **1080×1350** 深色卡（段位光晕 + 徽章 + 段位标签 +
   当前值 + 达成日），复用同一套 Canvas helpers（`roundRectPath` / `drawTracked` /
   `fitFontSize` / `truncateToWidth` / `loadShareImage`）与 `TIER_RAMPS` 色值，不新增依赖。

状态与可访问性：

- 首屏 `Skeleton` 按当前卡片栈逐块占位（Hero → 热力图 → 成就条 → 趋势 → 模型/来源双栏 →
  设备 → 明细），保持卡片/图表尺寸，避免布局跳动；无数据时给配对与 CLI 上报引导；
  筛选无结果时给“清除筛选”。
- 图表容器带 `aria-label` 与文本摘要；颜色不是唯一信息（模型占比同时显示数字）。
- 数字使用 `tabular-nums`；表格列头可排序并暴露 `aria-sort`。
- 动态数值统一用 `components/flow-number.tsx`（`FlowNumber`）包装：解析 format provider
  的成品串后交给 `@number-flow/react` 做数字滚动过渡；万进制 4 位分组与无法解析的占位符
  （`—`）自动退化为静态文本。明细表格单元格不加（整表切换）。
- `<lg`：KPI 两列、筛选条换行、图表高度约 220px；`Modal` 使用全屏尺寸；表格横向滚动
  只发生在 Card 内。

### Sessions（`/sessions`，B）

- 导航：侧边栏与抽屉在仪表盘后新增“Sessions”（`ListUl` 图标），页面标题取菜单名。
- 数据源：`account-sessions`。筛选条：时间范围为单一 `DateRangePicker`（弹层内置
  今天 / 7D / 30D / 90D 快捷按钮，活动预设高亮，点选关层；日历手动选取写 `custom`；
  控件形态与仪表盘一致，设备下拉同样复用 `DeviceFilterSelect`）、设备、来源；筛选条最
  右侧是与采集记录同款的刷新图标按钮（`ArrowsRotateRight`，刷新时图标 `animate-spin`，
  `Tooltip` 显示上次更新时间）；设备/来源选项来自响应的 `facets`，来源选项与触发器复显 `SourceIcon`
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
  Logo + 规范化显示名）、项目、设备、时长、Token、成本、模型（前 3 个 `Chip` + `+N`）、
  「详情」操作列（表头「详情」、行内按钮「查看」，`variant="tertiary"`，2026-10-26 操作者
  裁定）。v1 固定按
  结束时间倒序；服务端分页默认 20/页（可选 10/20/50/100），页脚走 `TablePagination`；不做列排序。
- 详情：行尾「查看」按钮打开 `Modal`（整行点击为增强，键盘焦点落在按钮上）；头部为来源
  （Logo `Chip`）、项目、设备三枚 `Chip`；meta 两列 结束时间（含相对时间小字）+ 时长；
  Token 拆分（input / cached / cache creation / output / reasoning /
  total / billable）；模型拆分为 `Table`（模型 Logo、Token、占比、成本，右对齐定宽列）；
  隐私提示“仅用量元数据，不含对话内容、路径或命令”；成本脚注“按模型定价估算，可能与
  仪表盘 provider 上报成本存在差异”。
  `session_id` 只作内部键，不在 UI 展示。
- 空态两分：
  - 无会话且无筛选 → “等待新版采集器”说明 + 配对设备 / 升级文档链接；不得从小时桶
    生成假会话。
  - 筛选无结果 → 清除筛选。
- 错误：401 跳登录并回跳 `/sessions`；其他错误在列表区重试。
- 隐私：页面不出现 prompt、正文、标题、绝对路径、resume command；项目列只显示 basename。

### 年度回顾（`/wrapped`）

- 页头：年份下拉只列**有数据的年份**（全历史月度桶去重、倒序；`aria-label` 为「选择
  年份」），默认当年，当年还没有数据时自动跳到最近有数据的一年；切换年份保留旧内容，
  加载中 `Select.Indicator` 渲染为 `Spinner`（触发箭头位置）；右上角是共享 `ShareCardButton`
  （与仪表盘同一按钮与 Modal，2026-10-30 操作者裁定：取代原先的页内分享卡面板）。
- 分享卡数据由 `wrapped/share-input.ts` 从年度 payload 投影，热力图条来自随页拉取的
  `account-heatmap`（52 周、窗口=所选年份，拉取失败静默降级，不阻塞页面）；「最常用来源」
  用 `sourceDisplayLabel`；分享卡输入在当年无数据（`hasData` 为假）时为 `null`，按钮禁用。
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
  名）、Tokens、成本、占比（`Meter` + 百分比）；切换年份保留旧行并罩刷新浮层，这一年没有
  模型明细时给「无模型明细」空态。
- 首载骨架：没有旧内容时整页画骨架（`components/wrapped/wrapped-skeleton.tsx`），按加载后的
  卡片栈逐块对齐——四张统计卡（保留卡壳与图标位）、成就卡（标题 + 六枚徽章行）、月度趋势、
  来源用量、模型表；灰条高度按真实排版取（`h4` 数字位 `h-7`、大数位 `h-8`），出数不跳高。
  页头随页面渲染，不画骨架。

### 成就（`/achievements`，M7；版式与徽章资产见 P4）

- 导航：侧边栏与抽屉在 wrapped 后新增「成就」（`Medal` 图标），页面标题取菜单名；
  受登录保护（`src/proxy.ts` 的受保护页面与 matcher 均包含 `/achievements`，未登录直接跳
  `/login?next=/achievements`；接口 401 也跳登录并回跳）。
- 数据源：`GET /api/app/achievements?tz=&tz_offset_minutes=`（cookie 会话鉴权；若 Vercel
  函数预算不足则页面改 Server Component 直出，响应形状不变，见 `docs/achievements-plan.md`
  P1.4）。**已读水位**由同一个 route 的 `POST`（body `{ seen_through: "YYYY-MM-DD" }`）
  推进，写失败静默，不影响页面。无筛选条；页头右侧放与 Sessions 同款的刷新图标按钮
  （`ArrowsRotateRight`，刷新中 `animate-spin`、按钮禁用并带 `aria-busy`，`Tooltip`
  显示上次更新时间）。手动刷新结束给 Toast 反馈：成功「成就已刷新」，失败显示加载失败
  原因；首次加载与 401 跳登录不弹。时区取浏览器时区，不写 URL。
- 摘要（页头，`achievements-summary.tsx`）：不再用「英雄带」大面板——标题（「已解锁成就」，
  `h2`）+ 副标题（「五档进阶，全部在读取时计算。」），右侧大号已解锁数 x/18（等宽数字）+
  一条细进度条（宽度按比例，`accent` 色）；五档段位计数（青铜 / 白银 / 黄金 / 钻石 / 王者）压成一行
  小字行（每档一个段位渐变色圆点 + 段位名 + 数量，字号 `text-xs`，数字 `text-sm`）。数字走
  统一 format provider，文案进 `lib/copy/achievements.ts`（zh / en）。窄屏时计数与进度条
  换行到标题下方。
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
  **尺寸归一化**：出图 QA 允许硬币占画幅 70–95 %，18 张资产的实际占幅差 22 %，直接展示会
  出现「有的徽章大、有的徽章小」；`lib/achievements/art-fit.ts` 记录每张图的实测硬币半径
  （占画幅半宽的比例），徽章按 `(1 + 裁切) ÷ 半径` 缩放，所有硬币在墙上同大、裁切一致。
  守卫测试 `tests/unit/achievement-art-fit.test.ts` 直接解 PNG 的 alpha 圆盘重测半径，
  资产重新生成后表对不上就会失败。未解锁态灰化 + 右下角锁标；图片加载失败时回退
  `achievement-art.tsx` 的参数化 SVG 徽章（`<img onError>` + 挂载后检查 `naturalWidth`，
  覆盖「SSR 首屏就已 404、onError 收不到事件」的情况），页面不得出现空徽章位。颜色不是
  唯一信息，段位同时以文字显示。`prefers-reduced-motion` 下无动效。段位金属、渐变坡道与
  色相集中在 `achievement-tiers.ts`（`achievement-art.tsx` 与徽章组件共用一份）。
- 详情：点击墙格打开 `Modal`（`achievement-dialog.tsx`）：头部为**可翻面的 3D 硬币**
  （`achievement-coin.tsx`，176px；正面 = 位图徽章，背面 = 段位金属盘 + 段位名 +
  达成日，未解锁显示「尚未解锁」+ 下一档阈值）。整枚硬币是原生 `button`，带 `aria-pressed`
  与「翻面 / 翻回」`Tooltip`，点击与 Enter / Space 均可翻；弹窗关闭或切换成就时复位正面；
  纯 CSS `perspective` + `rotateY`（不装 `motion`），`prefers-reduced-motion` 下无过渡。
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

### 服务状态（`/service-status`）

- 页头：副标题 + 右侧「重新检查」按钮（`isPending` 时图标位换成 `Spinner` 并禁用，
  同一个 `Spinner` 不另挂按钮外）。检查一开始就把四项探针以「检查中」占位整表重绘，
  重跑不折叠成单行再逐行回填。
- 实例信息卡三行：Supabase 项目 / 配对回调地址 / 会话，前置 `Database` / `Link` /
  `ShieldCheck` 图标（`text-accent/70`）；会话值按状态着色（success / danger / muted）。
- 探活表：不套 Card，直接渲染 `Table`（2026-10-28 操作者裁定），横向滚动只发生在
  `Table.ScrollContainer` 内。检查项列 = 图标（`Globe` / `ShieldCheck` / `ChartLine` / `Display`）+ 本地化
  名称 + 第二行 muted 明细（总计 tokens / 设备数 / 无会话 / 错误原文，异常时用 danger）；
  目标列显示探针目标；状态列 `Chip` soft（success / danger / default）；延迟列 ≤300ms
  用 `text-success`、>1500ms 用 `text-warning`，会话行不是网络探针显示 `—`。
- 明细与页脚冷启动提示（带 `{ms}` 占位）都在 `lib/copy/status.ts`，探针只返回数据
  （`{kind: "tokens" | "devices" | "no-session" | "raw"}`），渲染时才拼语言。

### 设置 · 账户设置（`/settings`）

设置页用 `Tabs` / 分段导航：账户 / 偏好 / 设备（tab 状态为组件内 state，不写 URL）；
各分区用 `Card` 复合结构。账户分区自上而下为个人信息卡（名称 + 只读邮箱）、头像卡
（更换走 `react-easy-crop` 裁剪弹窗：缩放滑杆 + ±90° 旋转，canvas 合成 256×256 WebP
后上传，更换/删除按钮并列）、预算卡（月度 USD 上限，`NumberField`：最小 0、最大
1,000,000、步长 1、整数美元，保存写本机 `token-usage.budget`，0 关闭）、密码卡
（设置/更新密码，≥8 位；
魔法链接账号在此开启密码登录）。登录页为 HeroUI `Tabs`（密码登录 `Lock` / 魔法链接
`Envelope`），密码 tab 提供「忘记密码」邮箱重置入口（resetPasswordForEmail，回跳设置页
设新密码）。
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
| Token 显示 | `ToggleButtonGroup` | 紧凑 / 完整 |
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
    独立的退出登录入口。导航项：仪表盘、Sessions、年度回顾、服务状态、设置；Sessions
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
- 审查：UI 代码提交前用 web-design-guidelines Skill 对照最新 Web Interface Guidelines，
  输出 `file:line` 问题清单并修复。
