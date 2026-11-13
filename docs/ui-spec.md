# UI 规范

写任何 UI（`apps/web` / `apps/desktop` / `apps/landing`）前先读本文。组件 API 以项目内 Skill
`.agents/skills/heroui-react/` 的文档脚本为准（HeroUI v3，勿按 v2 记忆书写）；React / Next
约定见 `.agents/skills/vercel-react-best-practices/`，其余以 `node_modules` 内随版本安装的类型
为准。

本文是硬规则：Design Tokens、组件规则、三态与响应式、页面规范。数字格式、偏好持久化、
UI 基准与桌面端约定属可查阅事实，也收在文末。数据与业务口径不在本文：数据模型见
`docs/rewrite-plan.md` §3，公开页与徽章见 `docs/badge.md`，成就见 `docs/achievements-plan.md`。

## Design Tokens

- 字体：`Maple Mono CN` 单栈（`--font-sans` / `--font-mono` 同为等宽，数字天然对齐）；代码块
  与数值强调同字体，不引第二种字体。
- 颜色一律语义 token：`bg-surface`、`text-muted`、`border-separator`、`text-success`、
  `text-warning`、`text-danger`、`bg-accent-soft` 等；不写 `bg-zinc-800`、`#18181b` 一类裸值。
  深浅色由 HeroUI 主题变量切换，组件内不写 `dark:` 分支。
- 图表配色取 `--chart-*` 变量，heatmap 五档取 `--heatmap-0..4`；新增图形先加变量再用。
- 裸色值仅限以下位置（需要真实品牌色或物理材质，语义 token 表达不了），且必须收口在单点
  常量文件里（`palette.ts` / `achievement-tiers.ts` / `source-logos.ts` 等），DOM 组件仍走语义 token：
  - 分享卡 Canvas 引擎的 4 套视觉（`lib/share-card/`）与 `palette.ts`；
  - 成就等级金属色板（铜 / 银 / 金 / 白金）；
  - 成就卡 3D 硬币的材质高光与阴影；
  - 来源图标品牌回退色（`source-logos.ts`）；
  - 登录页 OAuth 品牌标（GitHub / Google 官方色）。

## 组件规则

- 选取顺序：HeroUI 内置 → HeroUI 组合 → 自研（沿用 HeroUI 主题体系）。已有组件够用时不
  手写替代实现。
- 交互统一 `onPress`（HeroUI / React Aria 语义），不写 `onClick`；需要原生事件的非交互元素
  除外（如 Canvas、`input` 的 `onChange`）。
- 条件类名统一 `cn()`（`clsx` + `tailwind-merge`），不拼字符串、不叠 `!` 与手写优先级。
- 复合结构优先：`Card.Header/Title/Description/Content/Footer`、`TextField` + `Label` +
  `Input`、`Modal` + `Modal.Header/Body/Footer`、`AlertDialog`、`Tabs`、`Table` 全套子组件。
  不手写等价 DOM。
- 文本用语义组件：标题 `Typography`（`type="h2"` 等）/ `Card.Title`，说明 `Description`，
  表单错误 `FieldError` / `ErrorMessage`，状态提示 `Alert`；不写裸 `h1`–`h6` / `p`。
- 分页列表统一 `DataTableCard` + `TablePagination`：
  - `DataTableCard` 承担标题、副标题、三态（Loading 骨架 / Empty / Error 重试）与刷新浮层；
    刷新浮层只覆盖表格区，不清空已显示的行，标题与筛选不闪。
  - `TablePagination` 固定页脚形态：左侧「共 N 条」，右侧页大小 `Select` + 上一页 / 页码 /
    下一页；页大小变化回到第 1 页。
  - `≥md` 用 `Table`、`<md` 用 Card 列表，由 `DataTableCard` 的 `renderMobileRow` 统一承担，
    页面不各写一套移动端列表。
- 覆盖式面板统一 `PanelOverlay`：仪表盘卡片重新取数时覆盖整卡（半透明 + `Spinner`），容器
  加 `aria-busy`，遮罩 `pointer-events-none`（不拦截滚动与筛选操作）；`/wrapped` 翻页横滑
  不适用该遮罩。
- `Select` 的加载态用 `isPending` + 触发器内 `Spinner`，不用禁用整个控件。
- 浮层（`Modal` / `AlertDialog` / `Popover` / `Dropdown`）只在需要时挂载；关闭后焦点回到触发
  元素。破坏性操作走 `AlertDialog`，主按钮 `variant="danger"`。
- `Tooltip`：`delay={0}` + `showArrow`，首个子元素必须是 `Tooltip.Arrow`；图标按钮必须带
  tooltip（文案即动作名），并在 `aria-label` 重复同一文案。底部弹出的 tooltip 加
  `placement="bottom"`。
- 图标统一 `@gravity-ui/icons`（`size` 16 / 18 / 20 三档），不引第二套图标库；来源与模型
  Logo 走 `SourceIcon` / `ModelIcon`（`source-logos.ts` 的品牌映射，未知来源回退首字母块）。
- 图表用 `recharts`（`ResponsiveContainer` + 主题变量）；热力图用 CSS grid 自绘（365 格，
  `aspect-square`），不引第二套图表库。图形必须带文字摘要或 `aria-label`，颜色不作为唯一
  信息通道（图例 + 数值 + tooltip）。
- 动效优先 CSS（`transition-*`、`animate-*`）；确有必要才用 `motion`（`motion/react`），
  且尊重 `prefers-reduced-motion`。数字滚动用 `FlowNumber`（`@number-flow/react` 封装），
  不用手写 `requestAnimationFrame`。

## 三态与响应式

- 每个取数区块必须实现 Loading / Empty / Error 三态：Loading 用骨架（形状对齐最终布局，避免
  跳版），Empty 给一句说明 + 下一步动作（清除筛选 / 去配对 / 读文档），Error 给原因摘要 +
  重试按钮（401 跳登录并回跳当前路径）。
- 刷新失败不清空已有内容：保留旧数据，在区块上方显示危险色提示条 + 重试；只有首载失败才整块
  显示错误态。
- 仪表盘各区块独立取数与独立三态，一个接口失败不拖垮整页；首载骨架按最终栅格排布。
- 响应式断点用 Tailwind 默认（`sm` 640 / `md` 768 / `lg` 1024 / `xl` 1280）；`lg` 以下侧边栏
  收进抽屉（`AppShell` 承担），顶栏保留主操作与主题切换。
- 顶栏右侧动作簇（`top-actions.tsx`）：GitHub / 公开页（`ChartLineArrowUp`，**恒显示**，
  2026-11-14：页面开关开时新标签页打开 `/u/<page_token>`，页面关（或配置不可用）时 toast
  提示先去设置开启；配置经 `GET /api/app/badge` 获取、读取顺带回填 page_token）/ 语言 /
  主题色 / 主题模式（按钮本体 SSR 渲染不迟现，水合后图标随存储值切换）/ 配对设备主按钮。
- 最小支持宽度 375px：页面级不出现横向滚动；宽表在卡内横向滚动容器里滚动，分享卡预览
  等固定宽度面板同理。
- 抽屉 / 弹窗打开时锁定背景滚动，关闭后恢复；移动端底部操作区留安全区内边距。

## 页面规范

页面文案一律走 `lib/copy/*` 的类型化字典（`zh` / `en` 同键），组件内不写中文字面量；日期、
数字、货币、时区文案同样从字典取，格式函数见「数字、货币与时间格式」。

### 仪表盘（`/`）

桌面自上而下、移动端单列。

1. **筛选条**
   - 时间范围为单一 `ToggleButtonGroup`：总计 / 今天 / 7D / 30D 四个快捷预设（总计在前），
     单选、`disallowEmptySelection`、活动预设高亮、`size="sm"`、裸分组不加外壳容器；默认
     「总计」，清空筛选同样回到总计。无日历与自定义区间入口。
   - 时区选择 + 设备下拉。设备下拉与 Sessions 共用 `DeviceFilterSelect`：选项前置 `Display`
     图标，「全部设备」用 `Layers` 且作为占位而非列表项，`Select.ClearButton` 清除回全部设备；
     触发器复显同一图标，名称单行省略不换行。
   - 控件不配顶部 `Label`，一律以 `aria-label` 供屏幕阅读器；筛选条不设「清除筛选」按钮。
   - 时间范围只存组件内状态：不写入 URL、加载不回显；首帧把旧链接里的 `range` / `from` /
     `to` 清出地址栏。URL 仅保留 `tz` / `device_id`。小时明细的日期上限为仪表盘时区（`tz`）的
     今天，不接受未来日期。
   - 变更只重取数据、不整页刷新：各卡片保留旧内容并叠加模糊遮罩 + `Spinner`（仅首载无数据时
     出骨架，圆角与卡片一致：`min(32px, var(--radius-3xl))`）。
   - 筛选条右侧固定「分享」（共享 `ShareCardButton`：`NodesRight` 图标 + `Tooltip`，打开分享卡
     Modal）与「刷新」两个 tertiary 图标按钮，刷新中图标自旋；刷新按钮的 `Tooltip`（带箭头）
     显示上次更新时间（未加载时「尚未加载数据」）。
   - 自动刷新默认关闭（设置页「数据刷新」可控）：定时与切回刷新均为静默更新（不叠加模糊遮罩），
     手动刷新仍带遮罩；「时」视图下手动刷新同时重取小时明细。
   - 数据版本门（契约 §2.14）：每次加载前先查 `GET /api/app/data-version`（最新非空采集运行的
     服务端 `created_at`），与缓存签名一致则直接水合 sessionStorage 缓存（按 用户 + 范围 / 时区 /
     设备 键，最多 4 组）并跳过七个重请求；签名不一致或查询失败照常全量拉取（fail-open），全量
     拉取成功且前后签名一致才回写缓存；手动「刷新」永远绕过本门。
2. **总 Tokens 头卡**（独占一行、仪表盘首卡，Broadsheet 视觉）
   - 居中大号 Token 总数；其下五个紧凑指标：计费 Token / 会话数 / 活跃天数 / 日均（30 天）/
     单日峰值；再下成本行（存在未定价模型时加 `≥` 前缀 + ⓘ `Tooltip` 说明估算下限，行尾小字
     「全部时间」累计成本）、日期区间、按来源占比的堆叠色条，以及「全部 + 每来源」占比卡
     （`SourceIcon` + 占比 `text-base` + 模型数）。
   - 「全部」与每来源卡均可点击，打开模型明细 `ModelListModal`（列 模型 / Token / 占比 / 成本；
     「全部」为跨来源同名模型合并；明细桶只有逐模型 Token、无成本时成本列自动隐藏）。数值列
     定宽（Token `w-36`、成本 `w-28`），整表 `min-w-[26rem]` 保底，窄视口横向滚动而不溢出到邻列。
   - 口径：总 Token = `totals.total_tokens`，计费 = `totals.billable_total_tokens`，成本 =
     `totals.total_cost_usd`，会话数 = `totals.conversation_count`，活跃天数 = `days`，日均
     （30 天）= `rolling.last_30d.avg_per_active_day`（计费 Token ÷ 活跃天），单日峰值 =
     当前窗口逐日序列里 `total_tokens` 最大的一天（并列取最早，`aggregate.ts` 的 `peakDay`
     纯函数，值随日期小字展示；默认「总计」下即全历史峰值）。
   - 五个 KPI 值一律走 `FlowNumber`（挂载即从 0 滚动到位，无法解析的文本回退纯文本）；大数一律
     走统一 format provider，卡片内不自算格式。
   - 成就条（`achievement-strip-section.tsx` + `achievement-strip.tsx`）：独占一行，位于热力图
     之后、趋势之前；Card 头部为标题「成就」+ 说明 + 右侧 tertiary「查看全部」（唯一的
     `/achievements` 入口）。内容上下两组、纵向排列：「最近解锁」（最晚达成日降序）与「最接近
     解锁」（未满王者、有下一档、当前值 > 0，按当前值 ÷ 下一档阈值降序），各 ≤5 条。
   - 每组用成就页徽章墙的卡片形式：居中徽章（80px，`md` 起 96px）+ 名称（单行截断）+ 段位渐变
     标签（已解锁）；窄屏三列、`sm` 起五列一行。格子可点击，打开与 `/achievements` 一致的详情
     弹窗（复用 `components/achievement-detail.tsx` 的 `AchievementDetail`）。
   - 全部条目当前值为 0 时整条不渲染；数据失败走 Card 内 `SectionError` + 重试，加载中用同构的
     墙格骨架占位。与全局解锁 watcher 共用 `fetchAchievementsShared`
     （`lib/achievements/api.ts`）：同一时区参数下 in-flight 去重 + 对已结算 payload 加 15 s 短
     TTL（`SHARED_TTL_MS`）；`markAchievementsSeen` 写入水位后调用
     `invalidateAchievementsShared()` 立即失效缓存（TTL 取短是为了不延迟解锁 toast 与已读水位
     推进）；仪表盘选了自定义时区时两者口径不同，各取一次（cache key 含 `tz` / `offsetMinutes`）。
3. **活跃热力图**（独占一行，紧跟头卡，`components/heatmap-card.tsx`）：近 52 周 Mon-start 满宽
   网格（窄屏裁周、宽屏撑满格子，`ResizeObserver` 自适应）；月份标尺在上、周几单字标尺（一~日 /
   M~S）在左；右上「全部平台」多选筛选（`Dropdown.ItemIndicator` 勾选态，全部 / 清空，触发按钮
   显示已选状态），按来源过滤后等级客户端重算；共享 portal tooltip 显示当日总量与来源明细；左下
   时区标注（`UTC+08:00`），右下 少 / 多 图例；色阶 `--heatmap-0..4`（0 级 = `--default`，1–4 级
   为 accent 降饱和梯度，深浅主题各自定义于 `globals.css`）。
4. **趋势**：日 / 月切换（`Tabs`）+ 指标切换（Token / 成本），recharts；范围跟随筛选条。
5. **双栏**
   - Top 模型：`SourceIcon`、名称、Token、占比 `Meter`、成本，前 8 条 + 「成本分析」按钮打开成本
     分析 Modal。模型列表按 model 的小写折叠键聚合（大小写漂移不拆行，展示名取组内 token 份额
     最大的写法）。
   - 来源卡：左侧甜甜圈（`size-48 sm:size-52`，内孔 64%，中心总 Token 单行 `whitespace-nowrap`）
     + 右侧前 5 行「来源 / Token / 占比」三列栅格（来源名单行截断，Token 与占比列常量宽
     `whitespace-nowrap`）；行可点击隐藏 / 显示（隐藏来源从甜甜圈与占比分母中剔除）；「查看全部
     （N）」打开 `Table` 全量来源表（列：来源 / Token / 占比 / 积分——仅范围内有 credits 时显示
     该列），行首来源名与卡内行同一开关。数据取 `model-breakdown`，随设备筛选。
   - 两卡下方为积分消耗卡：逐来源列出上报了 credits 的积分用量与占比（仅积分制来源会携带；
     范围内无 credits 数据时整卡隐藏）——积分是独立维度，永不并入 Token、计费 Token 或成本口径。
   - 来源 / 模型图标走 `components/source-icon.tsx`：`public/brand-logos/`（品牌商标，登记在根
     `THIRD_PARTY_NOTICES.md`）优先，source 全称映射 + 模型名前缀映射，仍无映射时回落到该行的
     来源标（模型行传 `source` 属性），两者都无才退 deterministic 色块；新增品牌 = 放 logo 文件 +
     在 `SOURCE_LOGOS` / `MODEL_PREFIX_LOGOS` 登记。暗色变体：深色主题下看不清的标放同扩展名的
     `<name>-dark.<ext>`，并把浅色文件名加进 `sources.ts` 的 `DARK_LOGO_FILES`（未登记的 `-dark`
     文件不生效）。
   - 名称 / Token / 占比 / 成本 / 积分这类明细表壳统一为
     `components/dashboard/breakdown-table.tsx`（`BreakdownTable`）：名称列单行截断（完整值在
     `title`）、Token `w-36`、占比 `w-16`、成本与积分 `w-24`，数值列 `whitespace-nowrap`；成本 /
     积分列按行数据是否携带自动出现（无则整列隐藏）。来源详情弹窗、「查看全部」来源表、成本分析
     两个 Tab 与 `ModelListModal` 共用同一表壳，行内名称单元格可按调用方覆盖。
6. **设备卡**（独占一行）：名称 / 平台 / 最后上报 / Token / 成本，取 `dashboard.devices`，仅活跃
   设备且不随设备筛选收窄；点击设备卡把 `device_id` 写入筛选条。
7. **明细**：`Tabs` 日 / 时 / 月；`Table` 列：时间 / Token / 输入 / 缓存 / 输出 / 成本 / 会话 /
   模型数 / 积分（仅窗口内有 credit 上报才显示该列）；列头排序、`Pagination`（默认 10/页，可选
   10/20/50/100）；时视图先选日期（默认今天）；时区切换即时重算日 / 时，月视图按契约固定 UTC；
   空窗口显示空态；模型数列可点击（桶内 `models` 非空时），打开该桶的模型明细 Modal（同
   `ModelListModal`）。
8. **成本分析**：从 Top 模型「成本分析」按钮打开 `Modal`；`Tabs` 按模型 / 按来源；总成本、日成本
   趋势、未定价模型提示；只读，不提供导出。两个 Tab 均为 `Table`（共用 `BreakdownTable`）：按
   模型 = 模型（第二行来源小字）/ Token / 占比 / 成本，按来源 = 来源 / Token / 占比 / 成本；
   `table-fixed` + 定宽数值列（Token `w-36`、占比 `w-16`、成本 `w-24`），整表 `min-w-[26rem]` /
   `min-w-[30rem]` 保底，名称截断、数值列 `whitespace-nowrap`，窄视口横向滚动。
9. **分享卡片**：共享 `ShareCardButton`（`components/share-card-button.tsx`，`NodesRight` 图标 +
   `Tooltip`，打开 `ShareCardDialog`）——仪表盘放在筛选条右侧，`/wrapped` 放在页头右侧。
   `ShareCardDialog` 为左右两栏（`<lg` 上下堆叠）：左侧预览共享分享卡引擎
   （`components/share-card/`，Canvas 2D 手绘，只含聚合数字）的四种风格之一，右侧为显示名称
   `TextField`（默认当前用户名，仅本次弹窗内生效、不持久化）、风格 `ToggleButtonGroup`（2×2
   磁贴、单选、不允空选，图标在文案左侧：特刊 `SquareArticle` / 小票 `Receipt` / 霓虹 `Sparkles` /
   唱片 `MusicNote`；切换即重绘预览：旧帧留在上层淡出、新帧淡入并轻微回弹，`prefers-reduced-
   motion` 下直接切换）、复制图片 / 保存图片双按钮与隐私说明。
   - 四种风格：**特刊**（Broadsheet：米白纸底 + 朱红，报头、署名、衬线大数（完整千分位数字）、
     数据金句、52 周热力图条、前五模型排行榜、token-usage.cc 落款）、**小票**（热敏收据：Maple
     Mono 白纸黑字、模型行项目、装饰条形码、PAID 章、撕纸边）、**霓虹**（深色海报：程序化光晕 +
     噪点、12 月热力图网格、连续天数 / Top 模型事实条）、**唱片**（方形黑胶封面：热力图色环沟纹、
     纸标、曲目 = 模型榜）。
   - 预览即导出 PNG 本身（所见即所得）；卡片数据由 `dashboard/share-input.ts` 从当前 payload
     投影，文案走 `lib/copy/share-card.ts`。特刊的大数与模型榜固定用完整千分位数字
     （`formatNumber`，跟随分组设置），与仪表盘的紧凑显示偏好解耦；其余风格沿用偏好格式。
   - 关闭态不得重绘 Canvas：`ShareCardDialog` 关闭 / 退出时保留最后一帧图像以支撑退出动画（不
     触发新的绘制），退出动画结束后再释放。
   - 成就分享卡（`components/share-card/achievement.ts`）不属于上述四种风格：固定 1080×1350
     深色卡（段位光晕 + 徽章 + 段位标签 + 当前值 + 达成日），复用同一套 Canvas helpers 与
     `TIER_RAMPS` 色值。

状态与可访问性：

- 首屏 `Skeleton` 按当前卡片栈逐块占位（Hero → 热力图 → 成就条 → 趋势 → 模型 / 来源双栏 →
  积分消耗 → 设备 → 明细），保持卡片 / 图表尺寸，避免布局跳动；无数据时给配对与 CLI 上报引导，
  并附「查看采集记录」跳转；筛选无结果时给「清除筛选」。
- 表格类卡片的骨架复用 `DataTableCard` 的加载态：真实标题 + 真实列头之下是单元格灰条（首列
  55%、其余 78%），行数取该表的每页行数。列按数据有无自动隐藏的列（明细的积分列）在骨架中
  无条件绘制。
- 图表容器带 `aria-label` 与文本摘要；颜色不是唯一信息（模型占比同时显示数字）。
- 数字使用 `tabular-nums`；表格列头可排序并暴露 `aria-sort`。
- 动态数值统一用 `components/flow-number.tsx`（`FlowNumber`）：解析 format provider 的成品串后
  交给 `@number-flow/react` 做滚动过渡；万进制 4 位分组与无法解析的占位符（`—`）退化为静态
  文本。明细表格单元格不加（整表切换）。公开页是唯一例外（固定口径串，见「公开页」节）。
- `<lg`：KPI 两列、筛选条换行、图表高度约 220px；`Modal` 使用全屏尺寸；表格横向滚动只发生在
  Card 内。
- 全局 `prefers-reduced-motion` 兜底：所有装饰性动效（`animate-spin`、`transition`、`FlowNumber`
  滚动、分享卡帧过渡、3D 硬币入场与怠速摆动等）一律关闭或改为静态呈现；用户驱动的非装饰交互
  （水平拖拽翻面、纯点击）不受影响。本条覆盖全站各页。

### Sessions（`/sessions`）

- 导航：侧边栏与抽屉在仪表盘后为「Sessions」（`ListUl` 图标），页面标题取菜单名。
- 数据源：`account-sessions`。筛选条与仪表盘同形态：时间范围为共享
  `RangePresetToolbar`（裸 `ToggleButtonGroup`，单选、`size="sm"`，总计 / 今天 / 7D / 30D，
  总计在前，无日历与自定义入口）、设备（复用 `DeviceFilterSelect` 的 `placeholderMode`）、
  来源（「全部来源」占位 + `Select.ClearButton`，触发器复显 `SourceIcon` 与显示名）。控件
  不带顶部 Label，一律以 `aria-label` 供屏幕阅读器；筛选条不设「清除筛选」按钮（仅表格空态
  保留引导按钮）。
- 筛选条最右依次为 CSV 导出图标按钮（`ArrowDownToLine`，导出当前筛选全集）与刷新图标按钮
  （`ArrowsRotateRight`，刷新时 `animate-spin`，`Tooltip` 显示上次更新时间）；无结果或加载中
  禁用导出，导出中显示 `Spinner`。
- 选项来自响应的 `facets`；来源项复显 `SourceIcon` 品牌图标与 `sourceDisplayLabel`（与列表
  `Chip` 同源，占位用 `Layers`）；设备 / 来源与分页偏移 `offset` 写入 URL。
- 时间预设不写入 URL、加载不回显；自定义窗口（仅热力格子跳转带来的 `from` / `to`）写入并
  回显，此时工具栏不亮任何预设，点任一预设即回到预设窗口；非法或顺序颠倒的 `from` / `to`
  首帧从地址栏清除。默认总计、全部设备、全部来源；分页默认 20/页（可选 10/20/50/100，
  `page_size` 入 URL，切页大小保持当前页）。范围含今天（`to` 为次日 00:00 本地），按浏览器
  时区换算为 ISO 瞬时，服务端窗口 `[from, to)`。
- 汇总卡：会话数、总 Token、成本、平均时长（`totals.duration_ms / totals.sessions`，0 会话
  显示 `—`）。首载保留真实标题与图标、只对数字位出骨架；刷新时不遮罩，数值变化由
  `FlowNumber` 滚动过渡。
- 列表：`DataTableCard`（标题「会话」+ 副标题说明），`≥md` 用 `Table`、`<md` 用 Card 列表
  （`renderMobileRow`）。列：结束时间、来源 `Chip`（`SourceIcon` + 规范化显示名）、项目、
  设备、时长、Token、积分（仅积分制来源上报；窗口内无 credits 时整列隐藏）、成本、模型
  （前 3 个 `Chip` + `+N`）、「详情」操作列（行内按钮「查看」，`variant="tertiary"`）。
  列表固定按结束时间倒序，不做列排序；页脚走 `TablePagination`。
- CSV 导出走 `fetch` + Blob（读取 `X-Export-*` 响应头并处理 401）：10,000 行 / 约 4 MiB 双
  上限，截断 toast「共 N 条，已导出前 M 条」，成功提示导出条数。
- 详情：行尾「查看」打开 `Modal`（整行点击为增强，键盘焦点落在按钮上）；头部为来源（Logo
  `Chip`）、项目、设备三枚 `Chip`；meta 两列：结束时间（含相对时间小字）+ 时长；Token 拆分
  （input / cached / cache creation / output / reasoning / total / billable；积分制来源另有
  积分行，独立维度不计入上列）；模型拆分为 `Table`（模型 Logo、Token、占比、成本，右对齐
  定宽列）；隐私提示「仅用量元数据，不含对话内容、路径或命令」；成本脚注「按模型定价估算，
  可能与仪表盘 provider 上报成本存在差异」。`session_id` 只作内部键，不在 UI 展示。
- 空态三分（web 与桌面同判据）：**预设时间范围不算筛选**，只有来源 / 项目 / 模型 / 设备 /
  自定义起止时间算「筛选」。
  - 完全没有会话元数据 → 「还没有会话元数据」说明 + 配对设备 / 采集器文档链接；不得从小时桶
    生成假会话。桌面端以整份侧车解析后 0 行为准，web 端以「总计且无筛选时 0 条」为准。
  - 有数据但当前时间范围内 0 条 → 「这个时间范围没有会话」+「查看全部会话」；不提示升级 CLI。
  - 筛选无结果 → 清除筛选。
- 错误：401 跳登录并回跳 `/sessions`；其他错误在列表区重试。
- 隐私：页面不出现 prompt、正文、标题、绝对路径、resume command；项目列只显示 basename。

### 项目（`/projects`）

- 导航：侧边栏与抽屉在 Sessions 之后为「项目」；页面显式套 `AppShell`，metadata 走
  `createPageMetadata({key:"projects"})`。定位是按项目聚合 AI 编码会话的用量、费用与活跃度。
- 两套口径并存：`sessions`（会话元数据聚合，默认）与 `hourly`（`token_usage_hourly` 用量桶
  聚合），由构建期环境变量 `NEXT_PUBLIC_PROJECTS_CALIBER=hourly` 切换（`lib/dashboard/api.ts`
  `projectsCaliber()`；未设置或任何其他值一律回落 sessions）。属部署级动作，回退 = 删环境变量
  后重新部署。
- 筛选条：数量（「全部项目」占位 + `Select.ClearButton`，列表项只有前 3 / 5 / 10，清除即回
  全部）、排序（按 Token / 按费用）、展示形态（列表 / 卡片）+ 刷新按钮。控件不带顶部 Label，
  一律以 `aria-label` 供屏幕阅读器；不设「清除筛选」按钮；排序与展示形态用裸
  `ToggleButtonGroup`（单选、`size="sm"`）。**无时间范围、无设备、无来源筛选**——时间恒为
  「全部」（服务端夹到 3 年上限）。`sort` 与 `limit` 写 URL（`history.replaceState`），默认
  `sort=tokens`、`limit=all`。
- 摘要卡四格：总 Token（已归因）/ 总费用（同一口径，只算已归因）/ 项目数（取
  `attributed_projects`，不含未归因）/ 未归因 Token；副标题「全部时间 · {from} – {to}」。
- 列表**不是表格**：行与卡片同一套信息层级——项目 Logo（无 Logo 时首字母方块）+ 项目名
  （有仓库时名字旁带一枚**不可点击**的仓库标记：GitHub / Gitee 各自图标，其他主机为通用链接
  图标）、来源品牌图标（最多 5 个，多余 `+N`）、占窗口百分比、Token 数与相对最高项的量条、
  底部 meta（费用 / 会话数 / 最近活跃）。排序由服务端做（降序，同值按 key 字典序），前端只做
  Top-N 切片。
- 「未归因」组：服务端恒单独拆出并沉底（即使为 0），行内是 warning `Chip` + 说明文案。Top-N
  切片会把它切掉（它在数组末尾），只有 `limit=all` 或列表较短时可见；摘要卡的「未归因」Token
  数不受影响，摘要卡项目数与列表头「共 N 个项目」也不计它。
- 详情弹窗：点击行 / 卡片打开。头部标题在左，右侧依次是项目资料的两个动作与上一个 / 下一个；
  关闭按钮由 HeroUI 绝对定位在右上角（`Modal.CloseTrigger`，`size-9! md:size-8!`、
  `rounded-3xl!`、`top-3!`），头部右侧留 `pe-14` 让位、不压住操作按钮：「在 GitHub / Gitee
  打开」（其他主机为「打开仓库」；新标签页，`noopener,noreferrer`；有仓库时才出现）与
  「编辑」，两者纯图标（文案只留 `aria-label`）；再是上一个 / 下一个（范围是当前可见列表）。
  「未归因」与演示数据不显示两个资料动作。正文无上内边距（去掉 `Modal.Body` 的 3px 内边距与
  8px 上边距）；`lg` 及以上左栏固定（切换项目时随右栏一起重挂载、滚动复位）、右栏用
  `ScrollShadow` 独立滚动，`<lg` 整段正文一起滚动。左栏：Logo + 项目名（设了显示名时下方注明
  「目录名 {basename}」）、区间、`口径：{caliber}` 与 6 个指标（Token 总量 / 占比 / 费用 /
  会话数 / 活跃天数 / 日均活跃日）+ 三条脚注（费用按刊例价、积分是独立维度、仅用量元数据）。
  右栏三段：「其他字段」（日峰值 / 最近活跃 / 积分，只列左栏没有的）、「每日活跃」柱状图
  （点柱固定当天；标题右侧日期 `Select` 是同一动作的键盘 / 触屏入口）+ Token 构成条（input /
  cached / cacheCreation / output / reasoning）、「按来源」逐来源明细。
- 口径说明：`Disclosure` 折叠卡（默认收起，标题 `scopeNoteTitle`），展开后是随口径切两段的
  固定文案（`scopeNote.sessions` / `scopeNote.hourly`）。
- 状态：加载走骨架（摘要 + 6 行 / 6 卡，镜像真实结构）；无旧数据时 `SectionError` 重试，有旧
  数据时顶部红条「刷新失败，当前显示的是上次成功加载的数据」；空态两分（无数据 / 仅剩零用量
  被过滤），给「配对设备」与「刷新」；刷新中盖半透明层 + `Spinner`。
- 项目资料：
  - 项目名：`resolveProjectDisplayName()`（`components/projects/identity.ts`）= 手动显示名，
    否则目录 basename（服务端 `normalizeProjectKey` 剥离控制字符与路径、截断 120 字符）。显示名
    只作用于展示层，搜索、行 key 与接口仍用 basename；无合并映射、无脱敏。隐私脚注「仅展示用量
    元数据，不含对话内容、路径或命令」不变。
  - 仓库：手动地址（任意 https）→ 采集器检测到的地址（契约 v3，仅 github.com / gitee.com；多
    设备取未吊销设备中最近上报的非空值）→ 不显示；「不显示仓库」开关只屏蔽检测值，不屏蔽手动
    地址。
  - Logo：`components/projects/project-logo.tsx`，HeroUI `Avatar`（圆角沿用首字母方块）——
    手填 Logo 地址 → 上传的图片 → 首字母，图片加载失败自动换下一级；进入视口附近（200px）才
    请求，`referrerPolicy="no-referrer"`。
  - 编辑弹窗 `project-profile-dialog.tsx`（由详情弹窗的「编辑」打开，与详情弹窗并列渲染）：
    显示名（可选，≤60 字符）、仓库地址（https；下方提示检测值并可「使用检测值」）、「不显示
    仓库」开关、Logo（实时预览；上传 / 更换 / 移除上传的图片；Logo 地址；有 GitHub 仓库时可
    「填入 GitHub 头像」）。文本字段点「保存」一起提交；上传与移除图片即时生效（同设置页头像）。
    「恢复默认」两段确认，清空手动设置并删除上传的图片，检测值保留。部署未建 `avatars` 存储桶
    时隐藏上传入口并给说明。字段校验与服务端共用 `lib/projects/profile.ts`。
  - 上传沿用头像的裁剪流程：共享 `components/image-crop-dialog.tsx`（react-easy-crop，缩放 +
    90° 旋转，输出 256×256 WebP，浏览器不支持时为 PNG），选图只收 PNG / JPEG / WebP。
- 演示审阅面板 `projects-review-panel.tsx` 仅在 `?review=1` 时渲染（默认演示数据 + 页顶「演示
  数据 · 非真实用量」标记），仓库内无链接指向它；动效候选目录在 `projects-effects.ts`。
- API：`/api/app/projects` 与 `/api/app/projects-hourly` 顶层同形（`from/to/days/total/
  attributed_projects/limit/offset/caliber/totals{...}/filtered_zero_usage_projects/projects[]`）：
  `total` 含未归因组，`attributed_projects` 只数真实项目；`totals.attributed_cost_usd` 与
  `attributed_tokens` 同口径，`total_cost_usd` 为整窗口费用。差异只在 `caliber` 与
  `projects[].session_count` 的含义（sessions = 会话行数；hourly = 各桶 conversations 求和，故
  hourly 口径下列表行、列头与详情统一写「会话条目」）；详情走 `/api/app/projects-detail`。
  项目资料走 `/api/app/project-profiles`（cookie 会话鉴权，service-role 读写；与窗口和口径
  无关，页面加载与刷新时各拉一次，保存后就地更新）：`GET` → `{ upload_enabled, profiles[] }`
  （每项含 `display_name`、生效 `repo_url` 与 `repo_source: manual | detected`、
  `detected_repo_url`、`manual_repo_url`、`repo_hidden`、`logo_url`、`logo_upload_url`）；
  `PUT` 整体替换手动字段（可带 `clear_logo_upload`；全空即删行）；`POST ?project_key=` 原始
  字节上传裁剪后的 Logo（按文件头只收 WebP / PNG，≤512 KB，存
  `avatars/<user_id>/projects/<uuid>.<ext>`，公开地址不含项目名，替换时删除旧图）；
  `DELETE ?project_key=` 恢复默认。表结构见 `docs/rewrite-plan.md` §3，检测值上报规则见
  `docs/cli-contract.md` §2.4。

### 年度回顾（`/wrapped`）

- 页头：年份下拉只列**有数据的年份**（全历史月度桶去重、倒序；`aria-label` 为「选择年份」），
  默认当年，当年无数据时自动跳到最近有数据的一年。
- 切年份：上一年的内容立即撤下，整页回到首载骨架（`wrapped-skeleton.tsx`），年份下拉触发器
  里的 `Select.Indicator` 渲染 `Spinner`（与「全部设备」下拉同一写法，新年份 payload 就绪后
  回落箭头），payload 就绪后整页出数；分享卡输入用 `yearReady`（`payloadYear === year`）门控，
  未就绪前不投影、按钮禁用。**硬约束：不得用旧年份数据生成新年份分享卡，也不得把旧数字挂在
  新年份标题下。**
- 右上角始终是共享 `ShareCardButton`（与仪表盘同一按钮与 Modal）。分享卡数据由
  `wrapped/share-input.ts` 从年度 payload 投影；热力图条来自随页拉取的 `account-heatmap`
  （52 周、窗口 = 所选年份，拉取失败静默降级，不阻塞页面）；「最常用来源」用
  `sourceDisplayLabel`；`yearReady` 为假或当年无数据时输入为 `null`、按钮禁用。
- 四张统计卡：全年 Tokens / 成本 / 会话 / 活跃天数，右上角 `text-accent/70` 图标（`Hashtag` /
  `Wallet` / `Comments` / `Calendar`）。顶部只保留这四张。
- 成就卡（`components/wrapped/achievements-card.tsx`，独占一行、紧随四张统计卡）：标题
  「截至 {year} 年已解锁」+ 右侧「共 N 枚」；内容为**截至所选年份年末已解锁的成就**——每条取
  `achieved_at ≤ {year}-12-31` 的最高段位（`lib/achievements/annual.ts`，段位 ≥ 1），按段位
  从高到低排列，同段位保持目录顺序；切到较早年份会自然少行、低段位。每条 = 小徽章（40px）+
  名称（单行截断）+ 段位渐变标签。窄屏 2 列、`md` 起 4 列，纯展示、不可点击，详情与分享在
  `/achievements`。成就请求是可选的第 4 个并行请求、与所选年份无关（全历史只拉一次）：失败或
  未返回时整卡隐藏（不误报「还没有解锁」）；该年结束前零解锁时显示空态文案。
- 月度趋势：复用仪表盘 `TrendChart`，输入 / 缓存 / 输出三色堆叠（缓存 = 读 + 写）；按月补零到
  整年（当年截至当月），月份标签走 `formatMonth`。数据来自 `account-monthly` 的全历史月桶
  （`from=2000-01-01` 到 tz 今天，一次拉取后按年过滤，同时喂年份下拉），桶按 UTC 月切分，与
  页头 tz 年度汇总只在跨年边界可能微差。Tooltip 各行标签必须互不相同（共用同一串会折叠图例 /
  行），行 key 用序号。
- 来源用量：顶部一条按 `seriesColor` 的堆叠占比条；每行 `SourceIcon` + `sourceDisplayLabel` +
  `Tokens · 占比 · 成本`，下方同色细占比条。
- 模型用量：`DataTableCard` 一次展示全部（不分页、不排序），列：模型（`SourceIcon` 厂商 Logo
  + 模型名）、Tokens、成本、占比（`Meter` + 百分比）；切年份随整页回到首载骨架，新年份就绪后
  重画，不单独罩刷新浮层；这一年无模型明细时给「无模型明细」空态。
- 骨架：整页骨架（`components/wrapped/wrapped-skeleton.tsx`），首载与切年份共用，按加载后的
  卡片栈逐块对齐——四张统计卡（保留卡壳与图标位）、成就卡（标题 + 六枚徽章行）、月度趋势、
  来源用量、模型表；灰条高度按真实排版取（`h4` 数字位 `h-7`、大数位 `h-8`），出数不跳高。
  模型表一块复用 `DataTableCard` 的加载态：真实标题与四列列头之下是单元格灰条。
  页头随页面渲染，不画骨架。

### 成就（`/achievements`）

- 导航：侧边栏与抽屉在 wrapped 后为「成就」（`Medal` 图标），页面标题取菜单名；受登录保护
  （`src/proxy.ts` 的受保护页面与 matcher 均含 `/achievements`，未登录跳
  `/login?next=/achievements`；接口 401 也跳登录并回跳）。
- 数据源：`GET /api/app/achievements?tz=&tz_offset_minutes=`（cookie 会话鉴权，无 Server
  Component 直出分支）。已读水位由同一 route 的 `POST`（body `{ seen_through: "YYYY-MM-DD" }`）
  推进，写失败静默，不影响页面。
- 无筛选条；刷新图标按钮（与 Sessions 同款：`ArrowsRotateRight`，刷新中 `animate-spin`、禁用并
  带 `aria-busy`，`Tooltip` 显示上次更新时间）放在摘要右块「段位进度」数字行右端、与数字组垂直
  居中。手动刷新结束给 Toast：成功「成就已刷新」，失败显示原因；首次加载与 401 跳登录不弹。
  时区取浏览器时区，不写 URL。
- 摘要（页头，`achievements-summary.tsx`）：标题「已解锁成就」（`h2`）+ 副标题「五档进阶，全部
  在读取时计算。」；右侧双口径——大号段位合计 x/100（每条成就按当前段位贡献 0–5，等宽数字，左侧
  同基线小字标签「段位进度」）+ 一条细进度条（宽度按段位比例，`accent` 色），右块与标题块同高、
  顶部对齐；五档段位计数（青铜 / 白银 / 黄金 / 钻石 / 王者）+「已解锁 y/20」压成一行小字（每档
  一个段位渐变色圆点 + 段位名 + 数量，字号 `text-xs`，数字 `text-sm`；已解锁项无圆点，与段位项
  同构）。数字走统一 format provider，文案进 `lib/copy/achievements.ts`（zh / en）。窄屏时计数与
  进度条换行到标题下方。
- 分区栅格：按「里程碑 / 高峰 / 节奏 / 探索」四个分区渲染（`achievements-section.tsx`）：区块
  标题带色条与「已解锁 n/m」计数；栅格为徽章墙——375px 三列、md 四列、lg 五列、xl 六列
  （`grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6`，间距 `gap-2`）；同分区内按 `tier`
  降序（已解锁在前，同档保持 catalog 顺序）。
- 墙格（`achievement-card.tsx`）：无边框、无阴影的独立单元——徽章（96px 圆盘，`≥md` 112px）+
  名称（单行截断）+ 段位徽章（已解锁，渐变标签）/ 细进度条（未解锁）。悬停时整格轻微上浮 + 手型
  光标。整格是一个按钮（单一 tab 停靠点，格内不再嵌交互元素）；描述、当前值、下一档差额、达成
  日期一律下沉到弹窗。「新」角标贴在徽章右上角。
- 段位标签（`achievement-tier-badge.tsx`）：段位用金属渐变标签呈现，段位名写全（青铜 / 白银 /
  黄金 / 钻石 / 王者，英文 Bronze / Silver / Gold / Diamond / King）；渐变坡道定义在
  `achievement-tiers.ts` 的 `TIER_METALS` / `TIER_RAMPS`，同一坡道同时刷徽章外环、段位标签、等级
  历程进度条与摘要圆点，全页一套「段位语言」。每档 = 中间色 → 窄高光带 → 深色（外环 135° / 高光
  带 42 %，标签与进度条 120° / 55 %），配深色字 + 内高光阴影
  （`inset 0 1px 1px rgba(255,255,255,0.4)`）——窄高光带才是「金属感」的来源。`王者` 为第五档，
  按同一配方取紫水晶色。未解锁段位用中性灰坡道；颜色不是唯一信息，段位同时以文字显示。
- 徽章视觉（`achievement-medallion.tsx`）：位图插画 `public/achievements/<id>.png`（256×256 透明
  PNG，自有生成资产；风格模板与生成脚本见 `scripts/admin/achievement-assets/`）。插画与段位无关：
  段位由徽章外的金属外环表达（五色，外环占徽章直径 6 %），同一张图复用五档；徽章内部几何全部按
  比例（外环 6 %、裁切 5 %），尺寸由 CSS 决定（`w-24 md:w-28`）。
- 尺寸归一化：出图 QA 允许硬币占画幅 70–95 %，现有资产实际占幅有差异，直接展示会大小不一；
  `lib/achievements/art-fit.ts` 记录每张图的实测硬币半径（占画幅半宽的比例），徽章按
  `(1 + 裁切) ÷ 半径` 缩放，所有硬币在墙上同大、裁切一致。守卫测试
  `tests/unit/achievement-art-fit.test.ts` 直接解 PNG 的 alpha 圆盘重测半径，资产重生成后表对不上
  就会失败。未解锁态灰化 + 右下角锁标；图片加载失败时回退 `achievement-art.tsx` 的参数化 SVG 徽章
  （`<img onError>` + 挂载后检查 `naturalWidth`，覆盖「SSR 首屏就已 404、onError 收不到事件」的
  情况），页面不得出现空徽章位。`prefers-reduced-motion` 下无动效。
- 详情：点击墙格打开 `Modal`（`achievement-dialog.tsx`）：头部为可拖拽翻面的 3D 硬币
  （`achievement-coin.tsx`，176px；正面 = 位图徽章，背面 = 段位金属盘 + 段位名 + 达成日（单行不
  折行），未解锁显示「尚未解锁」+ 下一档阈值；币缘堆叠环、机刻纹、双面高光扫掠与地面投影）。弹窗
  打开时硬币入场整旋一周落位，随后小幅怠速摆动（首次交互后永久停止）；水平拖拽 1:1 旋转，松手按
  速度惯性甩动并弹簧吸附到最近一面（180° 整数倍，永不停在侧面）；纯点击 / Enter / Space 翻面
  （`aria-pressed` 报告当前面），←/→ ±30°；`touch-action: pan-y` 保移动端纵向滚动；`Tooltip` 提示
  「拖拽或点击翻面 / 翻回」。关闭或切换成就时复位正面并重放入场。物理用 `motion/react`；
  `prefers-reduced-motion` 下无入场 / 摆动、松手短 tween 落位，拖拽本身保留。
- 详情正文：硬币下方为一句话描述 + 数据覆盖说明（Sessions 类与 sync 类成就注明「自 … 起统计」）：
  1. 当前值（大号等宽数字）+ 右上角段位渐变徽章 + 达成日期；
  2. `dl` 分隔线下：①「距{tier}进度」+ 当前值 → 下一档阈值 + 段位渐变进度条（进度 = 当前值 ÷
     下一档阈值，钳在 0–100 %，见 `catalog.ts` 的 `progressRatioForNext`）；②「等级历程」——五段
     渐变段位条（已达刷金属渐变，未达为中性条），达成日期走 Tooltip；
  3. 五档时间线：每档一个段位渐变徽章（已达 = 金属渐变，未达 = 中性灰）+ 该档阈值 + 达成日
     （徽章 Tooltip 给出「段位 · 达成日 / 阈值 · 未达成」）。五档时间线与数据覆盖块各自留间距，
     标题与「等级历程」同为弱化小字。
- 已解锁时在弹窗正文最底部显示 `fullWidth` 的「分享成就」按钮（先关详情再开分享弹窗，避免嵌套
  Modal），未解锁不显示。
- 分享卡弹窗（`achievement-share-dialog.tsx`）：左右两栏（`<lg` 上下堆叠），左侧预览导出的同一
  张 PNG（所见即所得），右侧「复制图片 / 下载 PNG」与隐私说明；渲染中显示 `Spinner`，失败给
  「卡片渲染失败，请重新打开」并可重试。卡片由 Canvas 2D 引擎
  `components/share-card/achievement.ts` 绘制，尺寸 1080×1350：深色底 + 段位径向光晕、右上角显示
  名称、居中徽章（同源 `/achievements/<id>.png`，加载失败画金属盘 + 首字母占位，导出不中断）、
  段位渐变标签、名称与描述、当前值、达成日、底部落款；等待 `document.fonts.ready` 后再画；只含
  聚合数据（名称 / 描述 / 段位 / 当前值 / 达成日 / handle），不含行级信息；文件名
  `token-usage-<id>-<tier>.png`。
- 新解锁（服务端水位）：水位来自 `GET` 的 `seen_through`（账号级，跨设备一致），
  `unlocksSince(rows, seenThrough)` 得出晚于水位的墙格并显示「新」角标；「新」在本次访问内保持
  可见，渲染后再把水位推进到最近一次达成日（`POST`）。`seen_through === null` 视为首次基线：
  静默写入「最近一次达成日 ?? 本地今天」，不标任何「新」。
- 全局解锁 toast（`achievement-unlock-watcher.tsx`，挂在 `AppShell`，无 UI）：每次整页加载只检查
  一次（SPA 内导航不重复，刷新才重置），延迟约 1.2 s，`/achievements` 页与隐藏标签页直接跳过。
  发现晚于水位的新解锁时弹一条 `success` 聚合 toast（6 s，最多列 2 个「名称 · 段位」，其余写
  「等 N 枚」），随后推进水位；无新解锁不写、不弹。
- 状态：首载骨架按页头摘要 + 四个分区的圆形徽章占位（`achievements-skeleton.tsx`，占位圆与真实
  徽章同尺寸 96px / ≥md 112px）；无任何用量数据时显示锁定栅格 + 配对设备引导；错误态在页面内
  重试（401 跳登录）。
- 可访问性：进度条带 `aria-label` 与百分比文本；墙格可键盘聚焦（`aria-label` 含名称与段位，锁定
  时追加进度百分比），弹窗焦点管理走 HeroUI；达成日期用本地化日期格式。
- 响应式：375px 三列、无页面级横向滚动；弹窗在 `<lg` 走 HeroUI 全屏尺寸。

### 设置 · 账户设置（`/settings`）

- 页面用 `Tabs` / 分段导航：账户 / 偏好 / 设备 / 公开徽章，Tab 状态读写 `?section=`
  （`history.replaceState` 回写，非法或缺失值回落 `account`）；分区取值为
  `appearance | account | devices | badges`（账户 = `account`、偏好 = `appearance`、设备 =
  `devices`、公开徽章 = `badges`），各分区用 `Card` 复合结构，图标依次 `Person` / `Palette` /
  `Display` / `Star`。
- 账户分区自上而下：
  - 个人信息卡：名称 + 只读邮箱。
  - 头像卡：更换走 `react-easy-crop` 裁剪弹窗（缩放滑杆 + ±90° 旋转），canvas 合成 256×256
    WebP 后上传，更换 / 删除按钮并列；弹窗是与项目 Logo 共用的
    `components/image-crop-dialog.tsx`，文案与上传函数由调用方传入。
  - 公开页卡（`public-page-card.tsx`，2026-11-14）：每账户一份的 `/u/<公开页令牌>` 用量页的
    开关与令牌轮换，自取数 `/api/app/badge`。行：「公开访问」`Switch`（关 = `/u/` 立即 404，
    徽章图片不受影响；切换即 `PUT {pageEnabled, timezone}`）+「公开页链接」重置按钮
    （`AlertDialog status="danger"` 确认后 `PUT {resetPageToken:true}`，旧链接全部失效）；
    加载失败 `SectionError` 重试。
  - 预算卡：月度 USD 上限，`NumberField`（最小 0、最大 1,000,000、步长 1、整数美元），保存写
    本机 `token-usage.budget`，0 关闭。
  - 密码卡：设置 / 更新密码，≥8 位；魔法链接账号在此开启密码登录。
- 偏好分区由「外观」与「数据刷新」两张 `Card` 组成；外观卡逐行 label + control + `Description`
  （语言 / 货币 / 日期下拉 `variant="secondary"`，货币选项为本地化名称 + 窄符号，如
  `人民币(￥)`）；分区内 `ToggleButtonGroup` 统一 `size="sm"`；`Select` 无 size 属性，用默认尺寸：

  | 行 | 控件 | 选项 / 行为 |
  |---|---|---|
  | 主题 | `ToggleButtonGroup`（Sun / Moon / Display） | 浅色 / 深色 / 跟随系统；next-themes，默认 system |
  | 字体 | `ToggleButtonGroup` | Maple（默认，内置等宽中文字体）/ 系统字体；写 `preferences.font`（zustand persist），`Providers` 内同步组件把偏好映射到 `<html data-font>`，globals.css 按属性切换 `--font-sans` / `--font-mono` |
  | 语言 | `Select` | 跟随系统 / 中文 / English；`system` 行内提示当前解析结果；写 locale cookie |
  | 货币 | `Select` | USD / EUR / GBP / CNY / JPY / HKD；下方 `Description` 显示 `1 USD = 6.6849 CNY`（非 USD）与「参考汇率 · as_of」 |
  | 日期格式 | `Select` | 跟随语言（默认）/ `YYYY-MM-DD` / `MM/DD/YYYY` / `DD/MM/YYYY`；只改日期部分，时间仍按语言 12/24 小时制，图表月份标签保持语言格式 |
  | Token 显示 | `ToggleButtonGroup` | 紧凑 / 完整（默认完整） |
  | 数字单位 | `ToggleButtonGroup` | K/M/B / 万/亿；仅紧凑模式生效，完整模式置灰并提示 |
  | 数字分组 | `ToggleButtonGroup` | 3 位 / 4 位；仅完整模式生效，紧凑模式置灰并提示 |

- 全部即时生效，无「保存」按钮；分区最底部「恢复默认」（`AlertDialog` 二次确认）重置主题
  system、语言 system、字体、货币 USD、日期格式跟随语言、完整、K/M/B、3 位，以及数据刷新两项
  回到关闭；只重置本机偏好，不影响账户与设备。
- 分区底部说明：「外观与刷新偏好只保存在本浏览器，不写入账户；换设备需重设。」
- 控件旁的示例数字用当前格式实时预览；切换时容器宽度稳定，不抖动。
- 「数据刷新」卡控制仪表盘自动刷新，只存本浏览器（`token-usage.refresh`，zustand persist），
  两项默认关闭：

  | 行 | 控件 | 选项 / 行为 |
  |---|---|---|
  | 切回页面时刷新 | `Switch`（默认尺寸，拇指内 Check / Xmark 图标） | 标签页重新可见时立即拉取；60 秒冷却内重复切回不重复请求 |
  | 定时刷新 | `Slider`（0–60，步长 5） | 0 = 关闭，仅页面可见时计时；输出 `关闭` / `每 N 分钟` / `每 1 小时`，轨道两端标注「关闭 / 1 小时」；拖拽结束才落盘 |

- 手动刷新始终可用，不受这两项影响。仪表盘卡片里的说明文字必须写明「0 表示关闭」，因为
  Slider 的无障碍值标签只会读出数字。
- 设备分区用 `DataTableCard`（标题 = 分区名、副标题 = 分区说明，三态由卡片接管）。表格列：
  设备 / 平台 / 接入时间 / 用量 / 操作。操作列三枚图标按钮（`Button isIconOnly` + 底部带箭头
  `Tooltip`，文案即动作名；`Pencil` 改名 / `ArrowRotateLeft` 恢复默认名称 / `TrashBin` 吊销）：
  - 改名：`Modal` + `TextField`。
  - 恢复默认名称：`AlertDialog`（`status="accent"`）二次确认，正文给出当前名与目标名，确认后
    复用改名接口，不新增写端点。按钮始终占位，只在 `default_device_name` 快照缺失或与当前名
    相同时禁用（按条件显隐会让操作列错位）。
  - 吊销：两步——第一步 `Modal` 说明后果，主按钮「继续」；第二步 `Modal` 展示后果并要求**逐字
    输入设备名**，输入与当前名完全一致前「确认吊销」禁用，不一致时给 `FieldError`。取消 / 关闭
    任一步都整体退出，不保留已输入内容。
- 恢复默认与吊销的文案都只承诺对设备名 / 令牌的影响，必须写明已上报用量不受影响。
- 设备表格下方为「实例诊断」卡：`Card` 复合结构，头部标题 + 说明；内容区上部为两行实例事实
  （Supabase 项目 / 配对回调地址，前置 `Database` / `Link` 图标，取自 public-config 响应）；
  下部为四项探针表（公开配置 / 会话 / 仪表盘数据 / 设备列表，`Table` + 滚动容器，检查项列 =
  图标 + 本地化名称 + muted 明细，状态列 `Chip` soft，延迟列 ≤300ms `text-success` /
  >1500ms `text-warning`，会话行显示 `—`）。会话行反映页面 bootstrap 的会话而非独立探测；
  探针每次进入设备分区重跑。页脚左侧冷启动提示（`{ms}` 占位），右侧「重新检查」按钮
  （`isPending` 时图标位换 `Spinner`）。探针注册表在 `components/settings/diagnostics.ts`，
  runner 在 `use-diagnostics.ts`，文案在 `lib/copy/diagnostics.ts`。
- 深链筛选与回跳：首帧从 `?section=` 读取并**筛选**取值，只接受 `appearance` / `account` /
  `devices` / `badges`，缺失或非法值一律回落 `account` 并用 `replaceState` 回写规范 URL（与
  `popstate` 同步，Tab 切换不新增 history 记录）。密码重置邮件回跳
  `/auth/callback?next=/settings`，最终落在 `/settings`（不带 `?section=`），按缺省回落
  `account`，用户直接在账户分区的密码卡设新密码——该回跳不得被地址栏残留的 `?section=` 截到
  别的分区，也不得丢失原路径与查询参数。

### 设置 · 公开徽章（`/settings?section=badges`）

规范化契约见 `docs/badge.md` §7。`badge-card.tsx` 是状态编排器（自取数 `/api/app/badge`，
cookie 会话；Loading 骨架按三卡结构逐块占位（账户设置行/列表行/参数·预览·片段，2026-11-14）/ Error 走共享 `SectionError` 重试），其下三张卡纯展示：

1. **账户设置卡**（`badge-settings-card.tsx`）——短控件用 `Row`（label + `Description` 左、
   控件右），名称与白名单用卡内 `Block`（label + 说明在上、全宽内容在下）：

   | 行 | 控件 | 选项 / 行为 |
   |---|---|---|
   | 公开展示 | `Switch`（拇指 Check / Xmark） | 没有徽章时禁用并提示先新增；切换即 `PUT {enabled, timezone}`；只管徽章图片，不触及公开页 |
   | 公开名称 | `TextField` +「保存名称」 | 输入框为 `InputGroup variant="secondary"`，`Suffix` 实时显示 `{n}/{30}` 字数（2026-11-14）；与个人信息名称解耦，清空保存后显示通用「AI Coding Usage」；有改动才可保存；行说明只留「留空显示 AI Coding Usage」，「与个人信息名独立 / 最多 30 字符」收进 ⓘ Tooltip |
   | 仓库白名单 | 多选 `Select` +「保存白名单」 | 选项 = `knownProjects` ∪ 已在白名单的项；有改动才可保存，>32 项禁用；保存触发 §7.1 级联回落时 toast 告知回落徽章数（无回落用常规成功 toast）；行说明只留「最多 32 个」，三项口径缺口（账户级来源不计、无项目名会话不计、同名合并）与「活跃天数按 {时区} 折算」收进 ⓘ Tooltip |

2. **徽章列表卡**（`badge-links-card.tsx`）——头部标题 + 说明在左，「新增徽章」（`Plus`
   图标，打开共用名称弹窗；到 10 枚禁用并在卡底给出上限说明）在右；空态一行居中 muted
   文案。每行
   `badge-link-row.tsx`：可点击文本块（名称 /「未命名徽章」+ 生效或已吊销
   `Chip` + 一行摘要「风格 · 主题 · 范围 · 仓库」，选中行底色 `bg-surface-secondary`）+ 右侧
   四枚图标按钮（`Button isIconOnly size="sm"` + 底部带箭头 `Tooltip`，文案即动作名）：
   - 编辑（`Pencil`）：打开共用名称弹窗（2026-11-14）。
   - 复制链接（`Copy`）：写完整 `/api/badge?token=…`，成功 `toast.success`。
   - 吊销 / 恢复（`Ban` / `ArrowRotateLeft`）：吊销**无**二次确认（可逆），恢复即同一链接；
     该按钮 PATCH 期间图标换成 `Spinner`（2026-11-14）；
     行内 `Chip` 从生效（success soft）切到已吊销（warning soft）。
   - 删除（`TrashBin`，`variant="danger-soft"`）：`AlertDialog status="danger"` 二次确认，
     正文写明不可恢复；成功后选中项落到剩余第一枚。

   **共用名称弹窗**（`badge-dialogs.tsx` 的 `BadgeNameDialog`，新增 / 编辑两态）：
   `Modal` 头部 `CloseTrigger` + `Heading`（新增徽章 / 编辑名称），`Form` 内单个
   `TextField isRequired`（名称，`InputGroup variant="secondary"` + `Suffix` 实时 `{n}/{20}`
   字数，`InputGroup.Input` 带 `maxLength`），
   空值禁用确认钮、有错显示 `FieldError`；名称用户内判重（trim、大小写不敏感、排除自身）——
   先用本地列表即时报「名称已存在」，服务端 409 回显同一内联错误；脚部「取消 / 新增（保存）」
   ——确认钮走 `PendingButton`；新增成功自动选中新徽章，失败 toast 且弹窗保留草稿。

3. **选中徽章卡**（`badge-detail-card.tsx`）——**无顶部标题**：名称与状态只在列表行出现，
   卡片直接从「展示参数」开始（2026-11-14）；无选中时显示一行空态文案。内容自上而下：
   - 展示参数：风格（折线居首，新徽章默认折线）/ 主题（跟随系统居首）/ 范围三组 `ToggleButtonGroup size="sm"`，
     仓库单选 `Select`
     （`Select.ClearButton` 回到账户徽章）；**改动即时 PATCH**，失败 `toast` 并由服务端返回值
     回写，无乐观回滚；白名单为空时仓库置灰并提示。
   - 预览：`<img>` 走会话鉴权预览（携带该行已保存的参数 + `v` 版本号），换参到新图解码完成
     之间盖 `PanelOverlay`（容器 `aria-busy`），不闪上一张图；徽章 `mx-auto` 水平居中（2026-11-14），
     宽面板溢出时 auto margin 归零左对齐、卡内横向滚动，不外溢
     页面。
   - README 片段：`ToggleButtonGroup`（单主题 / 跟随 GitHub 明暗）+ 只读 `TextArea` + 复制；
     片段**只带令牌**（`<a>` 用公开页令牌 `/u/<page_token>`，`<img>` 用徽章令牌；双主题额外带
     `theme`），说明写明「设置页改风格 / 主题 / 范围 / 仓库会
     即时作用于已嵌入徽章，README 不用改」。

- 次要说明统一收进 label 旁 `BadgeHint`（`CircleInfo` 图标按钮）+ `Tooltip`（`delay={0}` +
  `showArrow` + `placement="bottom"`，`aria-label` 为「…说明」）；行内 `Description` 只保留
  动作前必读的一句。
- 复制统一 `navigator.clipboard.writeText`，成功 `toast.success`，失败普通 `toast` 提示手动
  选择。

### 登录页（`/login`）

**定位**：公开页（不套 AppShell）、`noindex`、主题跟随系统（无明暗切换入口）、文案随语言
（`lib/copy/login.ts`）。组件在 `components/login/`：`login-client.tsx`（编排：Suspense +
`useSearchParams` + 全部 auth 状态与回调）、`login-body.tsx`（右栏表单主体）、
`login-brand-panel.tsx`（品牌区 + 纹样 + 移动端品牌条）。

**布局（桌面 `≥lg`）**：`min-h-svh` 双栏 grid——左栏约 45% 为品牌视觉区，右栏表单区垂直居中
（HeroUI `Card`，内容 `max-w-md`，卡内 `p-6 sm:p-8`）。**`<lg` 单栏**：顶部品牌条（Logo + 词标）
+ 表单卡。右上角快捷区复用 `components/top-actions.tsx` 的四枚顶栏图标按钮（GitHub 仓库 /
语言 / 主题色 / 明暗模式，不含「配对设备」主按钮），绝对定位页右上角并与品牌行居中同带
（`top-6 right-5 h-8`，`lg:top-8 lg:right-10 lg:h-9`）。

**品牌区（左栏）**，自上而下：

- Lockup：`/logo.svg` / `/logo-dark.svg` 明暗双份 + 「Token Usage」词标 + uppercase 字距
  tagline（同侧栏 `brand.tsx` 语言）；静态展示不链接（链 `/` 会触发 `/login → / → /login` 循环）。
- 主标语 + 副标语（双语）。
- 「近一年热力图」抽象纹样：36×7 种子伪随机矩阵（确定性种子，无 `Math.random`，避免 hydration
  漂移；`login-brand-panel.tsx` 的 `WEEKS = 36`），单元格色 `var(--heatmap-1..4)` 内联（同仪表盘
  `heatmap-geometry.ts` 用法），整体透明度压低；容器淡出遮罩。呼吸动效纯 CSS，`prefers-reduced-
  motion` 下关停。
- 底部页脚一行 muted 小字（`text-[10px]`）：`Token Usage · token-usage.cc`（`lg` 以上与右栏
  备案号同基线）。
- 右栏底部备案号：工信部 ICP（`NEXT_PUBLIC_BEIAN_ICP`）与公安网备
  （`NEXT_PUBLIC_BEIAN_POLICE`）两枚，部署级环境变量驱动——变量为空或缺省则整条不渲染，只配
  一个就只显示一条（构建期内联，改值需重新部署）；每条 = 官方图标（`/beian/icp.png` /
  `/beian/police.png`，`size-3.5`）+ `text-[10px]` muted 文本，链接分别指向 `beian.miit.gov.cn`
  与 `beian.mps.gov.cn` 查询页（公安号数字自动入参）；hover 无下划线、仅文本 300ms 淡入
  `--accent`；`lg` 起绝对定位 `lg:bottom-8`、居中一行且与左栏页脚同基线，`<lg` 时叠在
  `Token Usage · token-usage.cc` 之下。
- 环境：`--accent` radial 光晕自左下极淡渗出（约 10% 内混透明），全页 `pointer-events-none`，
  明暗主题随 token 自适应。

**表单区（右栏，`Card` 复合结构，`p-6 sm:p-8`）**：`Card.Header`（`Card.Title` +
`Card.Description`）→ `Card.Content` 内 `Tabs`（密码登录 `Lock` / 魔法链接 `Envelope`）→ 表单
（`TextField` + `InputGroup variant="secondary"`，前缀图标：邮箱 `Envelope` / 密码 `Lock`；
密码 tab 提供「忘记密码」邮箱重置入口，`resetPasswordForEmail` 回跳设置页设新密码）→
**OAuth 区**：`Separator` 细线 + 「或使用以下方式」divider 文案 + GitHub / Google 两枚
`Button variant="secondary"` 各占一行全宽（内联 SVG 图标，GitHub 用 `currentColor` 跟随主题）。

**OAuth 接入**：两枚按钮分别走 `signInWithOAuth({ provider, options: { redirectTo } })`，
`redirectTo` = 本站 `/auth/callback?next=<消毒后的目标>`（与魔法链接同一回调路由，PKCE 交换；
目标为缺省落点 `/` 时省略冗余 `?next=`，同 `urlWithNext` 规则）。

- 状态与防重复：`oauthPending`（github / google / null）驱动点击按钮的 `isPending` Spinner
  （图标位换 Spinner）并 `isDisabled` 锁住其余全部登录控件（密码 / 魔法提交、忘记密码、另一枚
  OAuth 按钮），handler 首行同步 guard `busy || oauthPending` 使双击为 no-op；重复发起只是
  Supabase 会话替换，不产生重复账号。
- 跳转由 `skipBrowserRedirect: true` + 手动 `location.href` 完成（自动跳转与状态更新同在一条
  微任务链，快网络下导航会抢在绘制前完成、pending 态永不可见）：拿到授权 URL 后先画 150ms 再
  离页，慢网络下 Spinner 持续到 provider 页接管。provider 侧失败的回跳统一落 `/login?error=…`
  由既有错误条渲染。
- 会话残留清理：登录页挂载即 `await auth.initialize()` 结算浏览器客户端的首次初始化，三个 PKCE
  流程（魔法链接 / 密码重置 / OAuth）发起前再结算一次。初始化会拆除 cookie 里残留的失效会话，
  而拆除同时清空所有待用 PKCE verifier——拆除落在 verifier 写入之后就使首次登录必失败
  （`/auth/callback` 回 `auth_exchange_failed`，即「令牌失效回登录页后首次登录报登录链接无效、
  再点一次才行」）。挂载时先清完，失效后首次点击不必再等一次失败续期。
- 错误码映射：GoTrue 以 `?error=<code>` 弹回 `/auth/callback`，路由转发为稳定码 `oauth_<code>`；
  登录页对已知码给专属文案——`oauth_signup_disabled`（「本站注册已关闭，仅限受邀账号登录」）与
  `oauth_access_denied`（取消授权），其余（含本地 `auth_code_missing` / `auth_exchange_failed`）
  回落通用文案。两枚按钮当前恒显；部署者未配置 provider 时点击会经 Supabase 回跳报错，不崩溃。

**验收**：桌面与 375px 无页面级横向滚动；明暗双套成立；`prefers-reduced-motion` 下无入场 /
呼吸动效；OAuth 按钮渲染不探测 provider（点击时仅在残留失效会话的情况下由初始化补一次 token
刷新）。

### 公开页（`/u/<token>`，徽章点击落地）

**规范以 `docs/badge.md` §6（页面唯一规范）与 §4.7（数据口径）为准，实现落点见其 §10**；本节
只描述版式与复用关系，不重复展开细则。

- 公开页面、无 AppShell（同 `/login`）、`noindex`；主题跟随系统（无明暗切换入口，不做深色专属
  变体）；文案随访客语言，数字沿用徽章的固定口径（`lib/badge/format.ts`，与 README 里的 SVG
  一致，不受访客本地偏好影响）。全页统一总数据口径，不展示近 30 天维度。
- 顺序：口径行（头像行右侧，精简为「全量数据 · 更新于 …」，起止日由 HeroUI `Tooltip` +
  `Tooltip.Trigger` 展示，不用原生 `title`——裸 DOM 触发器无法消费 `FocusableContext`，浮层
  不会打开）→ 唯一巨数总 Tokens → 四列无边框指标带（成本 / 活跃天数 / 来源数 / 模型数）→
  两枚全历史事实胶囊（最长连续天数 / 单日峰值）→ 来源 / 模型结构双栏 → 近一年热力图 → 成就墙
  → 页脚。两列各 5 行等高对齐（来源 `Meter` 移出文档流，两列共用同一居中基线）。
- UI 层面差异（相对仪表盘 / 成就页）：
  - 热力图：复用 `components/heatmap-card.tsx` 的 `HeatmapCard bare hideFilter`——近一年 52 周、
    Mon-start 周格、月份 / 周几标尺、共享 portal tooltip（含来源明细）、时区脚注与图例均与仪表盘
    同款；差异是无平台来源筛选、无点击下钻、无卡片底色，数字走 `HeatmapCard` 默认的访客偏好格式。
  - 成就墙：列出全部已解锁成就（`tier >= 1`，按目录顺序，3 / 5 / 6 列栅格，徽章放大），复用
    `achievement-medallion.tsx` / `achievement-tiers.ts` 与既有 PNG；点击打开共享的
    `AchievementDialog`（`apps/web/src/components/achievement-dialog.tsx`，经
    `components/u/u-achievement-dialog.tsx` 转接），与 `/achievements` 同一个弹窗（含当前值、
    阈值与五档历程）；公开页不传分享回调，故弹窗内隐藏「分享成就」入口。
  - 数字：动态数值走 `FlowNumber`，公开页指标传 `lib/badge/format.ts` 的固定口径串（不使用
    登录态 `useFormat`），并补 `<noscript>` 与 `aria-label` 兜底。
  - 模型行带成本；不设设置开关与仓库模块；顶部品牌栏（Logo + GitHub outline `Button`）。
- 组件优先 HeroUI（Button / Avatar / Typography），悬停抬升用 Tailwind `group-hover`。
- 文件：`src/components/u/u-body.tsx` 编排，`u-hero.tsx` / `u-metrics.tsx` /
  `u-breakdown-section.tsx` / `u-heatmap.tsx` / `u-achievements.tsx` /
  `u-achievement-dialog.tsx` / `u-brand.tsx`（品牌栏）/ `u-public-number.tsx`（按需）。

### 采集记录（`/sync-runs`）

沿用 Sessions 模式：受登录保护、`useSessionBootstrap` 取会话、URL 筛选（`replaceState` 回写 +
`popstate` 同步，筛选变更只重取数据、不整页导航）、`DataTableCard` 列表（`≥md` `Table` / `<md`
`renderMobileRow`）、首载骨架保留卡壳与图标、汇总卡数值走 `FlowNumber`、筛选无结果的「清除
筛选」空态、刷新失败保留旧行并卡顶危险条 + 重试、401 跳登录并回跳原路径与查询参数、仅聚合
遥测（计数器 / 枚举 / 版本，不含路径或标题）、`lib/copy/sync-runs.ts`（zh / en）。数据源
`account-sync-runs`（`docs/cli-contract.md` §2.12），一行一轮 sync（含空轮，兼作采集器心跳）。

相对 Sessions 的差异：

- 筛选条：时间范围为共享 `RangePresetToolbar`（裸 `ToggleButtonGroup`，单选、`size="sm"`，总计 /
  今天 / 7D / 30D，总计在前，无日历与自定义入口）、设备（复用 `DeviceFilterSelect` 的
  `placeholderMode`），另有 **trigger**（scheduled / manual / watch / notify，「全部方式」占位）
  与 **result**（ok / partial / error，「全部结果」占位）两个 `Select`，均以 `Select.ClearButton`
  清除；控件不带顶部 Label，一律 `aria-label`；筛选条不设「清除筛选」按钮（仅表格空态保留引导
  按钮）。预设不写 URL，旧日期书签带来的 `from` / `to` 仍解析为 custom 窗口并回显（此时工具栏
  不亮任何预设），窗口按浏览器时区换算 ISO `[from, to)`；`device_id` / `trigger` / `result` /
  `offset` / `page_size` 写 URL，默认总计、20/页（可选 10/20/50/100）；任一非分页筛选变化把
  `offset` 归零，结果集缩到当前页以下时回跳到最后一页。无来源 / 项目筛选、无 CSV 导出、无详情
  弹窗。
- 汇总卡：仅两张（今日运行数 / 最近一次运行），取当天窗口；当天无运行则回溯近 7 天最近一轮探针，
  今日空轮给提示，最近运行时间显示绝对 + 相对时间。首载保留真实标题与图标、只对数字 / 文本位
  出骨架。
- 设备采集状态条：汇总卡下方的 `Card`，每设备一行 = 状态 `Chip` soft（正常 success / 滞后
  warning / 中断与失败 danger / 无记录 default）+ 设备名 + muted 明细（「最后成功 {相对时间}」；
  失败行给错误码；无记录给「近 7 天没有运行记录」）+ 右侧等宽小字遥测（`cli_version · os`，
  暴露版本偏差）。状态 Chip 内前置活体圆点：两层 `bg-current`（颜色跟随 soft 变体文本色）——
  实心点 + `animate-ping` 扩散层（`motion-reduce:animate-none`）；「无记录」态只有静态点。
  阈值：≤24h 正常（机器夜间关机不算异常）、≤7 天滞后、>7 天中断；最近一次运行失败则整行
  「失败」（优先级最高，成功锚点仍显示）。规则纯函数在 `device-freshness.ts`（单测钉住）；
  数据 = 独立的近 7 天窗口（limit 200，随每次加载并行重取，失败降级为整条隐藏）与账户设备
  花名册的并集，**不随页面筛选收窄**（状态视图，非筛选视图）。首载骨架同汇总卡规则：卡壳与
  标题 / 说明为真实文案，仅行占位（Chip / 名称 / 明细 / 遥测四段圆条，2 行），随
  `SummaryCardsSkeleton` 一起渲染，避免数据落地后状态条突现。
- 刷新按钮：筛选条最右侧，与 Sessions 同款（`ArrowsRotateRight`，刷新中 `animate-spin`，
  `Tooltip` 显示上次更新时间、未加载时显示「尚未加载数据」）；刷新同时重取今日汇总、设备 facet
  与列表。
- 列表列：开始时间 / 设备 / trigger `Chip` / result（`RunResultCell`，error 带 `error_code`）/
  耗时 / 上报量（`RunVolumeCell`：解析文件数、上报桶数，空轮标「空」`Chip`）；按开始时间倒序、
  不做列排序、服务端分页、页脚 `TablePagination`。

### 配对（`/device`）

沿用 Sessions 模式：受登录保护（未登录跳 `/login?next=…` 并保留配对链接 `?user_code=`，登录
成功回跳原目标）、`useSessionBootstrap` 取会话、HeroUI 复合结构与语义组件
（`Card.Header/Title/Description/Content`、`InputOTP`、`Label`）、`lib/copy/device.ts`（zh / en）、
三态与 375px 无横向滚动、错误态可重试、文案不硬编码。批准走冻结的 `device-flow-grant` 端点
（`docs/cli-contract.md` §1.1 / §2.3），带浏览器会话 JWT；`user_code` 契约字母表不含
`0/1/I/L/O`（`^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$`），`useSearchParams` 置于 `Suspense`
边界内。

- `user_code` 三态流程（`Phase = input | confirm | success`）：
  1. `input`——无合法 `?user_code=` 时手填 `InputOTP`（8 槽、4+4 分组，自动大写并过滤非法字符、
     格式化为 `XXXX-XXXX`）；「批准配对」在 8 位填满前 `isDisabled`，填满后点按直接批准；
  2. `confirm`——URL 带合法码时展示大号等宽 `user_code` + 「批准配对」（深链不手填，始终显式
     确认一次）；
  3. `success`——成功卡。
- 按钮即状态：批准期间按钮自身 `isPending`（`PendingButton`：`Spinner` + 原文案），不整卡切换
  加载态，也不可重复提交；失败发生在当前卡内——`InputOTP` 置 `isInvalid` + 下方 `ErrorMessage`
  （`role="alert"`）直接给错误语（404 码不存在 / 过期、400 码无效、其余通用错误），保留已填
  内容，再次点按即重试；`input` 卡改码即清错，`confirm` 卡错误时额外给「输入其他配对码」（复位
  到 ①，顶栏主操作同名）。无列表、无筛选、无 URL 分页、无汇总卡、无刷新按钮；`user_code` 只从
  `?user_code=` 读取、不回写 URL。
- 顶栏主操作复位语义：顶栏固定「配对设备」主操作（`Plus`，`variant="primary"`）始终
  `router.push("/device")`（不带 `user_code`），语义是**新建一次配对**；当页面已带 `?user_code=`
  处于 confirm 态（含批准中、已出错）时，点它必须清除 `user_code`、丢弃当前码与错误、复位回
  `input` 手填态，不得沿用旧码继续批准。其余顶栏控件（GitHub / 语言 / 主题色 / 明暗）行为不变。
- 页面为 `max-w-xl` 居中单列审批流（非数据面）：不套 `DataTableCard` / 汇总卡 /
  `DeviceFilterSelect` / CSV 导出；`min-h` 居中、无页面级横向滚动。

### 落地页（`apps/landing`，token-usage.cc）

官方站落地页：仓库内独立纯静态 app，`output: "export"`，实际托管腾讯云 EdgeOne Pages（对外口径
仍为 Vercel，见 `apps/landing/README.md`）。写 landing UI 前先读本节与该 README。

- 暗色单主题：`html class="dark"` 写死，不引 `next-themes`，无主题切换器；仅引 `@heroui/styles`
  默认主题，不引 `theme-palettes.css`。
- 强调色 VERMILLION：`--accent` 覆盖为 Broadsheet 朱红（`#c2402a` → `oklch(0.5543 0.17 32.08)`）；
  热力图 `--heatmap-1..4` 由 `--accent` 派生的机制自动跟随；主 CTA 用 `variant="primary"`
  （HeroUI 3 Button 无 color prop）。
- 单页八段：导航（单行 logo + 标题锁定 + npm / GitHub / 公开页演示三枚纯图标 `outline` 按钮，
  公开页那枚用 `ChartLineArrowUp` 图标（对齐 web 端公开页入口）；三枚按钮均以 `<Tooltip delay={0}>`
  包裹并带箭头，`placement="bottom"`；logo 为指向根路径 `/` 的普通链接（回到顶部由右下角
  回到顶部按钮承担）；无副标题、无文字 CTA、无章节锚点）→ Hero（真实数据快照计数器 + 364 格年热力图纹样，
  热力图与左侧文案垂直居中，下方为 16 枚来源 logo 双行反向循环；双 CTA =「立即部署」滚动到
  自部署段 +「Deploy to Vercel」一键链接）→ 三步 terminal → 仪表盘静态重绘 + 后台实拍轮播 →
  功能网格（成就币 / 四风格分享卡放大预览；来源 logo 墙已移到 Hero）→ 数据自主 → 自部署（仅
  「部署指南」外链 + `BookOpen` 文档图标）→ Footer（亮 / 暗双版实时徽章并排 + ICP 备案号，公安
  网备接入位；文本链接 hover 主题色）。分节 hairline + 大间距，不堆卡片。
- 数据规则：快照（`src/data/snapshot.json`）只含聚合数字与日桶等级；来源端点、刷新时机（只在
  部署构建）、日期派生与失败降级见 `apps/landing/README.md`「数据快照」，此处不重复；实拍截图
  不得出现操作者姓名与邮箱（顶栏问候、侧栏用户菜单均需处理）；分享卡展示用 mock 数据导出的 PNG。
- 交互模式：轮播 6s 自动前进（悬停暂停、reduced-motion 停用）、交叉淡入、16:10 容器 + absolute
  叠放；放大预览为 HeroUI Modal + 三条确定性关闭路径（CloseTrigger / window 级 Escape /
  backdrop 自身点击——RAC 内建 dismiss 在本页不可靠）；Hero 眉标 / 标题 / 副标 / 两枚 CTA /
  统计条 / 事实条按 80ms 步进逐块 blur→clear 淡入（`.landing-reveal`：CSS keyframes + inline
  `animation-delay`，reduced-motion 全局规则关停）；来源 logo 循环为两行反向 CSS marquee
  （内容复制一份 + `-50%` 位移无缝衔接，悬停暂停，reduced-motion 停用）。
- 回到顶部：`components/landing/back-to-top.tsx` 固定右下 44px 圆盘，滚过 480px 浮出；滚动监听
  rAF 节流，显隐 / 悬停上浮 4px / 按压 95% 缩放全走 CSS 过渡
  （`ease-[cubic-bezier(0.22,1,0.36,1)]`，300ms），`visibility` 同列过渡项以免淡出被硬切，
  reduced-motion 下过渡关停、点击瞬时跳顶。
- 类名：Tailwind 任意值写法收敛到 canonical（`grid-cols-52`、`aspect-16/10`、`mask-[...]`）；
  圆角例外——`rounded-[2px]` 保留（canonical `rounded-sm` = 4px 会变值，同 AGENTS 约束 5）。
- 375px 可用、无页面级横向滚动；文案中文单语（`lib/copy.ts` 留 en 结构位）。

## 数字、货币与时间格式

- 唯一入口是统一 format provider（`useFormat`）；Dashboard、Sessions、Wrapped、Settings、分享卡片
  全部使用。组件内禁止散落 `toFixed` / `Intl.NumberFormat` / 手写单位。万/亿与 4 位分组也在
  provider 内实现，数字与分隔符仍取自 `Intl.NumberFormat` 的 locale 规则。
- 存储值始终是 USD 与原始整数；货币只改显示，不写回 API、不入库。
- Token 显示：
  - 紧凑 + K/M/B：<1000 原样；1e3 `K`、1e6 `M`、1e9 `B`、1e12 `T`；1 位小数，去掉尾随 `.0`；
    999.95 进位到下一单位。
  - 紧凑 + 万/亿：<1e4 原样；1e4 `万`、1e8 `亿`、1e12 `万亿`；1 位小数，去掉尾随 `.0`。
  - 完整 + 3 位：`1,234,567`；完整 + 4 位：`123,4567`（每 4 位一组，分隔符随 UI 语言）。
  - 单位只作用于紧凑，分组只作用于完整 / 明细整数；两者互斥提示。
- 成本：默认 2 位小数；`0 < |v| < 0.01` 显示 `<¥0.01`（或所选币种）；0 显示 `¥0.00`；负数符号
  在货币符号前（`-¥1.23`）。契约的 6dp 字符串只用于传输，UI 不直接展示 6dp。
- 汇率：`1 USD = <rate 4dp> <CODE>`；内置快照 + `TOKEN_USAGE_FX_RATES` 覆盖；UI 标注「参考汇率」
  和 `as_of`；不做实时刷新、不调用外部 API。
- 日期 / 时间：按 UI locale 与所选时区格式化；日期顺序可设为跟随语言 / `YYYY-MM-DD` /
  `MM/DD/YYYY` / `DD/MM/YYYY`，非跟随语言时时间部分仍按 UI 语言（12/24 小时制），中文以空格、
  英文以逗号连接；图表月份标签始终跟随语言。Sessions 详情显示绝对时间 + 相对时间；表格数字
  使用 `tabular-nums`。
- 空值：`null` / `undefined` / 空字符串显示 `—`，不显示 0；0 是有效值。

## 语言、主题与偏好持久化

- 语言 preference：`system | zh | en`；cookie `token-usage.locale`。缺省或 `system` 时服务端按
  `Accept-Language` 的 q 值取首个受支持语言（zh / en），否则 en；显式 zh / en 优先。SSR 用同一
  解析结果设置 `<html lang>` 与首帧字典；客户端切换写 cookie、更新 provider 与 `<html lang>`，
  无需整页刷新。
- `system` 在设置页显示「跟随系统（当前：中文 / English）」；顶栏语言菜单不重复当前解析结果
  （只列 跟随系统 / 简体中文 / English）。两处共用同一偏好，切换互相同步。
- 主题：next-themes，`attribute="class"`、`enableSystem`，沿用默认 storageKey `theme`；默认
  system；设置页与顶栏明暗切换共用。
- 货币 / Token 显示 / 单位 / 分组 / 日期格式：zustand persist（`stores/format-preferences-store.ts`，
  单键 `token-usage.format-preferences`）；首次读取自动迁移并清除旧扁平键
  （`token-usage.currency` / `token-usage.token-format` / `token-usage.token-unit` /
  `token-usage.token-grouping`）；值分别为 ISO 4217 代码、`compact|full`、`kmb|wan`、`3|4`、
  `locale|iso|mdy|dmy`；只影响本浏览器，不写数据库。
- Hydration：locale cookie 保证 SSR 首帧；主题由 next-themes 首屏脚本避免闪烁；localStorage
  显示偏好在挂载后读取，设置页可先渲染默认值；数字使用 `tabular-nums` 且容器预留宽度，不允许
  明显跳动。仪表盘 / Sessions 数据本身客户端加载，不存在服务端数字与客户端不一致。
- 无偏好或存储损坏：回退 `system` / USD / 紧凑 / K-M-B / 3 位 / 日期跟随语言，不抛错。

## UI 基准

- 以仪表盘为视觉与行为基准：其余页面复用其模式，不自创；确需偏离时先回写本文。
- App Shell：
  - 桌面侧边栏自顶向下为品牌、胶囊导航、底部用户块（头像 + 名称 + 下拉：账户设置 / 退出登录）；
    侧边栏无背景色与右边框，与页面共用底色。折叠态 76px 仅留图标，状态存 localStorage，经
    `useSyncExternalStore` 读取（`app-shell/collapse-state.ts`：服务端快照固定展开，客户端路由
    切换的首帧即取到真实值，菜单切换不闪展开态；硬刷新由 hydration 后校正，跨标签页由
    `storage` 事件同步）。退出登录只保留用户块下拉一处（含确认对话框），且只结束当前浏览器的
    会话（`signOut({ scope: "local" })`：supabase-js 默认 global 会吊销该账号的全部会话，与
    「退出登录」的字面语义不符；CLI 走设备令牌，不受影响）。导航项：仪表盘、
    Sessions、项目、采集记录、年度回顾、成就、设置；Sessions 位于仪表盘之后，使用 `ListUl`
    图标。
  - 侧栏用户块与顶栏问候语共用 `useProfile()`；profile 存在单例 store
    （`stores/profile-store.ts`）而非 hook 局部 state。`AppShell` 由各页面各自组合、菜单切换会
    整体重挂载，store 让头像 / 名称 / 邮箱直接命中缓存，不重放 `?` + `…` 占位，也不重复请求
    `auth.getUser()`；全应用只保留一个 `onAuthStateChange` 订阅（`USER_UPDATED` / `SIGNED_IN` /
    `SIGNED_OUT`）。
  - 导航 pending：点击导航项后，若目标路由持续 pending 超过 150ms，当前项图标淡出、同位换成
    `Spinner`（`useLinkStatus`，`nav-items.tsx`）；命中 prefetch 的瞬时切换不出现。图标位固定
    `size-4.5` 不产生位移，`prefers-reduced-motion` 下关闭淡入淡出与旋转。只覆盖 `Link` 导航，
    不覆盖筛选器的 `router.replace`。
  - 顶栏持有页面标题（仪表盘为按时段的问候语，其余页面取菜单名），页面正文不再重复标题；顶栏
    无下边框，底色与页面一致；右侧固定为 GitHub / 语言 / 主题色 / 明暗切换 / 配对设备主操作。
    四个图标控件均带 `Tooltip`（底部、带箭头）：GitHub 用 `Button` 打开新标签（RAC `Link` 不
    消费 TooltipTrigger 的焦点上下文，挂不上 Tooltip），语言为图标按钮 + 单选下拉，主题色为
    `Popover` + `ColorSwatchPicker` 色板（含随机切换），色板变量见
    `apps/web/src/styles/theme-palettes.css`；仪表盘分享按钮同样带 `Tooltip`。
  - 明暗切换为单个按钮，循环 跟随系统 → 浅色 → 深色：图标与 Tooltip（「主题：{当前模式}」）
    始终显示当前模式；仪表盘以外保持 32px 图标按钮尺寸。
  - `lg` 以下侧边栏换为抽屉：导航在上，底部仅保留用户块；GitHub / 语言 / 主题色 / 明暗切换 /
    配对设备在移动端顶栏照常显示。抽屉面板底色取页面底色 `bg-background`，使选中导航项
    `bg-surface` 胶囊与桌面侧边栏一样可见。
  - 内页右下角固定「回到顶部」浮钮（`components/back-to-top.tsx`）：圆形图标按钮（`ArrowUp`，
    `fixed right-6 bottom-6 z-20`），实底浮起式而非玻璃拟态——`bg-surface + border-border +
    shadow-md` 与页面背景明确分层；滚动超过 320px 出现（窗口 scroll 监听 + rAF 节流，每帧至多
    一次状态读取）；点击平滑回顶（`scrollTo behavior: smooth`，`prefers-reduced-motion` 下直接
    跳顶）；出现 / 隐藏为 200ms 的上移 + 淡入淡出 + `visibility`，悬停轻微上浮、阴影加深，按下
    微缩，`motion-reduce:transition-none` 全部关闭；隐藏态 `invisible` 不可聚焦不进无障碍树；
    不带 `Tooltip`，箭头图形即语义，名称走 `aria-label`（`NAV_COPY.backToTop`）。浮钮在顶栏
    同层（z-20），Modal / Drawer 等覆盖层照常压在其上。
  - 语言偏好写 `token-usage.locale` cookie（`system | zh | en`，缺省 `system`）；根布局据此解析
    并设置 `<html lang>` 与首帧字典，切换即时生效、刷新不闪烁。
- 页面容器宽度三档，`AppShell` 只提供壳，内容宽度由各页 `<main>` 自持，新页面按内容类型归档，
  不新增第四档：
  - 数据面 `max-w-6xl`（表格 / 多列栅格 / 图表）：仪表盘 `/`、Sessions、项目、采集记录、成就；
  - 卡片·叙事面 `max-w-5xl`（表单卡 / 故事卡）：设置、年度回顾、公开页 `/u/<token>`；
  - 聚焦流（单列居中）：登录表单 `max-w-md`、配对审批 `max-w-xl`。
  壳与侧栏宽度恒定，切页时内容宽度按档位跳变属内容驱动的有意区分，不是待修的不一致。
- 审查：UI 代码提交前用 web-design-guidelines Skill 对照最新 Web Interface Guidelines，输出
  `file:line` 问题清单并修复。

## 桌面端（`apps/desktop`）

沿用本文 Design Tokens、组件规则、三态与数字格式；定位、边界、里程碑与发版见
`docs/desktop-plan.md`。以下是窗口级约定。

### 窗口与页头

- 400×620（min 340×480），单页滚动无路由；主内容列 `mx-auto max-w-6xl` 定宽居中（同 web 仪表盘
  1152px），最大化窗口不满宽拉伸。卡片一律 `Card` 复合结构（`Header` / `Title` /
  `Description` + `Content` / `Footer`）。
- 页头左侧为周期筛选 `PeriodFilter`（连接式 `ToggleButtonGroup`「今日 / 7D / 30D / 总计」，
  `size` sm、默认今日、写 preferences）。右侧依次：暂停 chip、CLI 四枚图标按钮（立即同步 /
  暂停·恢复 / Doctor / 对账，`hidden sm:inline-flex`，<640px 由采集与同步卡内按钮兜底）、落地页
  （`Globe`，恒显，`token-usage.cc`）、仪表盘（`Display`，仅已配对时出现）、分享卡片
  （`NodesRight`，`hidden sm:inline-flex`，窗口无用量时禁用）、会话视图切换（`ListUl` ⇄
  `ChartColumn`，tooltip「会话」/「用量监控」）、GitHub、主题、设置。图标按钮一律
  `variant="tertiary"`；落地页与仪表盘在页头内部直接走 `open_in_browser`。右侧组
  `flex-wrap justify-end`、外层 `flex-wrap`，340 / 400 宽下自动换行而不产生横向滚动。
- 未配对且本次已跳过向导时显示 warning Alert「这台机器还没配对」+「去配对」；向导页头只保留
  repo / 主题 / 设置（筛选与 CLI 按钮都是可选 prop）；会话视图下页头周期筛选隐藏（它驱动构成
  卡，与会话无关），CLI 四钮照常可用。

### 监控盘

- **统计卡**四张：总 Tokens / 预计费用 / 会话数 / 缓存率，全部跟随页头筛选。每卡 = 标签 + 环比
  `Chip` + 数值 + recharts `Sparkline`（今日按小时、7D/30D 按日、总计按近 12 个月）；数值与徽章
  百分比经 `FlowNumber` 滚动过渡，切周期时卡片不重挂；无第三行说明文案。`grid-cols-2
  sm:grid-cols-4`，400 宽下标签单行、数值顶边对齐。
- 环比 = 前一等长窗口对比（今日 vs 昨日、7D vs 前 7 天、30D vs 前 30 天、总计无基线隐藏），
  `Chip size="sm" variant="soft"`，↑ `success` / ↓ `danger`；窗口无用量时环比与迷你图都不显示。
- 预计费用 = 读时计价（采集端恒写 `total_cost_usd: 0`，桌面用与 web 同源的 `lib/pricing.ts`
  快照，规则同 `computeRowCost`：权威上报值优先、免费 / 订阅源为 0、DeepSeek 时段价）。默认美元
  窄符号两位小数（`$11.98`，不足 1 分 `<$0.01`）；设置可切 USD / EUR / GBP / CNY / JPY / HKD，
  按 `lib/display-format.ts` 的内置离线 FX 快照换算后仍用 narrowSymbol，存储与计价始终以 USD
  为准。缓存率 = `(cached + cache_creation) / total`。
- 总计周期下「总 Tokens」标签旁挂 `CircleInfo`（`size-3.5`、`cursor-help`、`tabIndex=0`），用
  `Tooltip`（`showArrow`、placement top）说明口径（「本机采集器队列全历史」vs web「账号全部设备
  + 更早的服务器侧记录」）；其余周期无图标，任何周期都没有说明行。
- **活跃热力图**（`HeatmapSection`，web 同款移植）：364 天（52×7）锚定今天、未来日不渲染；
  `alignWeeks` 周一对齐（首列补 null、尾列 null 收口、null 占位防 auto-flow 漂移）；格子随卡片
  宽度自适应（满年优先、15 px 下限、放不下自左裁周）；月份标尺在上、周一–周日标尺在左；5 档色阶
  `--heatmap-0..4`。
- 跟随页头周期：`clipHeatmap` 按 `heatmapPeriodStartMs` 裁剪——网格仍固定 364 格（列数不变），
  只清空窗口外日期并按剩余数据重算活跃日与合计，标题后缀同步显示周期名。
- 右上「全部平台」多选筛选（全部 / 清空 / 已选 N 个平台；等级与合计按所选来源客户端重算，筛选
  后合计入描述行）；共享 portal tooltip（`createPortal` + fixed + clamp 定位、80 ms 延迟隐藏）显示
  日期、当日 tokens 与来源明细（`SourceIcon` + 规范名 + token · 占比 + 进度条，折日时已按
  `canonicalSource` 归并）；逐格 `role="img"` + `aria-label`，不给 364 格逐格设 Tab 焦点；左下
  本机时区（`UTC+08:00` 样式）、右下「少 → 多」图例；窗口内无用量显示「近一年暂无数据」。
- 日聚合与统计卡同一 last-wins 基线、同一本机时区；描述行以「仅本机数据」注明（web 为账号全
  设备口径，数字必然不同）。
- **用量趋势**（`trend-card.tsx`，web 同款）：Header 右两组 `Tabs`——「按日 / 按月」与「Token /
  成本」；Token 视 = recharts 堆叠柱（输入 / 缓存 / 输出，`--color-chart-1/3/2`）；成本视图 = 单列
  amber 柱；共享 tooltip 列 日期 / Token / 输入 / 缓存 / 输出 / 成本 / 会话数；图表包在 `figure`
  + sr-only `figcaption` 文字摘要里；数据为快照按周期折叠的 daily / monthly 序列（预设窗口零填充
  空日，总计只保有数据的桶；今日日视图为单柱）。`showTrend` 默认开。
- **Top 模型 + 来源构成**双栏（`grid gap-4 lg:grid-cols-2`）：
  - Top 模型（`top-models-card.tsx`）：前 8 行 `ModelIcon` + 模型名（截断 + `title`）+
    `tokens · 占比 · 成本` 右对齐 + `Meter` 条（`h-1.5`）；Header 右「成本分析」ghost 按钮打开
    `cost-dialog.tsx`——总成本 / 总 Tokens 头部、每日成本 `CostTrendChart` 面积图（amber 渐变）、
    按模型 / 按来源两组 `BreakdownTable`（名称列截断、数字列定宽不换行、占比 / 成本 / 积分列按
    有值才出现）。
  - 来源构成（`source-mix-card.tsx`）：`DonutChart`（内孔 64% / 外径 94%，中心「总 Tokens +
    可见合计」）+ 右侧前 5 行点击隐藏 / 显示（隐藏行 `opacity-40` + 删除线、占比分母重算、隐藏时
    显示「—」）+「查看全部（N）」打开同款表格 Modal +「恢复显示全部来源」；别名归并
    （trae-cn → Trae）走 `groupSourceUsage`，0 token 纯 credits 来源不进榜；成本列为采集端估算
    求和。
- **项目与仓库**（`components/monitor/`）：web `/projects` 列表行同款高密度行——logo（链接
  `logo_url` → 上传 `logo_upload_url` → 字母方块，`<img>` 失败逐级回落）+ 名称（web 编辑的显示
  名，队列 key 作副行）+ GitHub mark（profile `repo_url`，无则 CLI confirmed 映射）+「占窗口 X%」
  + 来源 icon 条（规范名去重，最多 5 个 +「+N」），右侧 tokens + 相对最大项目的 `Meter`；底边
  细线 = 成本 · 会话条目 · 最近活跃（相对时间，小时精度）。
- 行点击开详情 dialog（web 双栏版式）：左栏 identity（logo / 显示名 / 目录名 / 打开仓库）+
  「周期 · 口径：小时桶 · 仅本机数据」+ 六格 KPI（Token 总量 / 占窗口 / 费用（估算）/ 会话条目 /
  活跃天数 / 日均（活跃日））+ 三段脚注（估算偏差 / 积分独立 / 隐私边界）；右栏其他字段（日峰值 /
  最近活跃 / 积分）+ 每日活跃柱图（≤60 天，悬停含 tokens · 会话条目 · 成本）+ Token 构成条（输入
  / 缓存 / 输出 + 含推理）+ 按来源行。数据按需从同一去重行折叠（`lib/project-detail.ts`）；「打开
  仓库」走 `open_in_browser`，不推断 URL；编辑留在 web。
- profile 同步（契约 §2.13）：`tokenusage project-profiles`（CLI 持令牌代读，桌面不碰设备令牌
  文件）→ `lib/project-profiles.ts` 解析 → hook 挂载 + 5 分钟节流拉取；未配对 / 旧 CLI 静默降级
  为队列 key + 字母方块；Top 5 + 归因覆盖脚注 +「在 web 查看」。

### 采集与同步

- Header 左 = 标题「采集与同步」+「更新于 HH:mm:ss」；右 = 版本 Chip 组 + 刷新图标钮（读取期间
  图标位换 `Spinner`，手动刷新至少保持 400 ms 可见）。版本 Chip 显示 `tokenusage-cli vX.Y.Z`
  （`bareVersion` 去重 `v`；未检测到则 danger「未检测到 CLI」），它同时是唯一的 updater 探针：
  点击才请求 npm registry，结果以第二枚 Chip 落在旁边「检查中 / 最新 / 可更新 vX / 检查失败」，
  失败不外抛。
- Content = 待上传 / 队列体积（`formatBytes`）+ `logs/sync.log` 的 `phase:"finished"` 行 + 更新的
  `error` 行 + 四按钮行（立即同步 = `sync --auto` / Doctor / 对账 7 天 / 暂停·恢复，
  `flex sm:hidden`）+ CLI 运行输出块。
- 按钮交互：四枚一律 `PendingButton`——被点的那枚在按钮内渲染 current-color `Spinner`
  （`size="sm"`、`aria-hidden`），其余 `isDisabled`；有前置图标的按钮 pending 时 Spinner 顶替图标
  位（同一槽位 `isPending ? <Spinner /> : <Icon />`，图标经 `icon` prop 传入）。
- 运行结果：失败（exit≠0 或未能启动）渲染 danger `Alert`（标题 = `命令 · exit N`，描述 = CLI
  输出尾部，`font-mono` `whitespace-pre-wrap break-all`，`Alert.Content` 加 `min-w-0` 防 400 宽
  溢出）；标题行右侧 `isIconOnly` ghost 复制按钮（`Copy` / 已复制 `Check`，`aria-label` 随状态
  切换、输出为空时禁用），复制 CLI 原始输出尾部；成功用中性 `bg-default` 结果块 + `pre`（最多
  8 行）。
- 反馈 Toast（`hooks/use-monitor-toasts.ts`）：结果块保留 CLI 英文原文，另用 `toast` 汇报中文
  摘要——成功 `toast.success`（同步完成 / 采集已暂停·已恢复）、失败 `toast.danger`、需解释的中性
  结果用默认 `toast`（同步被跳过、暂停成功但计划任务未能关闭 → 补一句「暂停标志仍然生效」）。
  CLI 探测未完成时四钮全禁用，挂一个 `isLoading` 常驻 toast「正在检测本地 tokenusage-cli……」，
  落定后同一 toast `toast.update` 成「已就绪」或 danger「未检测到 tokenusage-cli：采集操作已
  禁用」。`Toast.Provider` 挂在 `app.tsx`（`placement="bottom end"`）。
- 设备身份脚注：主机名 #machineId 前 8 · © 2026 Token Usage；两段各自 `whitespace-nowrap`，只在
  `·` 处换行（CLI 版本在采集与同步卡 Chip，实例 host 在设置的相关分组）。

### 会话视图

- 页头图标切换的独立视图（监控盘 ⇄ 会话互斥）：`components/sessions/` 的 `sessions-body.tsx`
  （编排）+ `sessions-bar.tsx` + `sessions-summary-cards.tsx` + `sessions-table.tsx` +
  `sessions-detail-dialog.tsx` + `model-chips.tsx`，数据面 `lib/sessions.ts` +
  `hooks/use-sessions.ts`。
- 筛选条：周期预设连接式 `ToggleButtonGroup`（今天 / 7D / 30D / 总计，默认今天；总计 = 全量侧车
  `fromMs = 0`，其余为相对今天的日粒度半开窗口）+ 三个 facet `Select`（来源 / 项目 / 模型）。每张
  选项表按「时间窗 + 另外两个筛选」重算（选项目不会收窄自己的选项）；来源带 `SourceIcon`，项目 /
  模型纯文本、不带会话数；模型匹配走行的 `model_usage`。
- 三个 Select 统一形态：未选时显示「全部来源 / 全部项目 / 全部模型」占位（列表里不放「全部」
  项），选中后触发器右侧出现 `Select.ClearButton`（`X`，空态隐藏，键盘 Backspace / Delete 同效）；
  触发器自定义 `Select.Value`，文本 `truncate` + 触发器 `min-w-0`，并有全局
  `.select__value { min-w-0 truncate }` 覆盖。切换周期时已选 facet 不丢显示：选中值若不在新窗口
  选项表里，以 `sessions: 0` 置顶补进列表（`withSelectedFacet`），筛选仍生效。筛选条不设「清除
  筛选」按钮（仅表格空态保留引导按钮）；项目 / 模型弹层 `max-w-72`、选项文本 `truncate`；尾随
  CSV / 刷新图标簇（tooltip「上次更新 …」）。不做设备筛选与设备列（本机单设备）。
- 四汇总卡 = 会话数 / 总 Tokens / 成本 / 平均时长（`每会话`），首载保留真标签、只数字骨架。
- 列表固定 `ended_at` 倒序、无列排序；`≥md` 表格（结束时间 / 来源 `Chip` / 项目 / 时长 / Token /
  积分列（窗口内 credits>0 才出现）/ 成本 / 模型（前 3 `Chip` + `+N`）/ 详情钮，整行可点开详情），
  `<md` 堆叠 Card 行（400px 默认窗即此形态）；表格为自动布局（不 `table-fixed`），「详情」列给
  `w-24` 容下「查看」按钮；刷新时行区盖 `bg-surface/60` + `backdrop-blur-[2px]` + 居中 `Spinner`
  的遮罩（有行才盖）。
- 分页 = 共享 `table-pagination.tsx`（web `TablePagination` 单语移植）：左范围摘要 / 中页码
  `Pagination`（省略号窗口）/ 右固定 `w-36` 每页条数 `Select`；默认 20/页（10/20/50/100，切页
  大小锚定当前页）。
- 详情弹窗 = 来源 / 项目双 `Chip` + meta 两列（结束时间含相对时间 + 时长）+ Token 拆分（输入 /
  缓存读取 / 缓存写入 / 输出 / 推理 / 总计 / 计费 + 积分卡）+ 模型拆分 `BreakdownTable` + 隐私 /
  成本双脚注；`session_id` 不显示。
- 口径：整读 `session.queue.jsonl`（8 MiB 上限，超限降级 512 KiB 文件头并出「仅显示最新部分」
  提示条——CLI 按 `ended_at` 降序全量重写、最新在文件开头），解析规则同 CLI 上传映射（账户级
  来源剔除 / token 恒等门 / reasoning fold / last-wins 去重）；`duration_ms` 为墙钟；成本 =
  sessions 峰值价读时计价（与监控盘小时级峰谷计价的差异属契约 §2.11 已接受口径）。
- CSV = wire `format=csv` 同列名同形态（BOM + CRLF + RFC4180 + 公式注入防护），经 Rust
  `save_file_as` 弹系统保存对话框（默认目录 = 桌面；取消不报错），成功 toast 带落盘完整路径
  （「已导出 N 条会话：<路径>」）。
- 隐私：title / 绝对路径 / cache key 在解析层即丢，UI 零出现；空态三分沿用 Sessions 判据（预设
  时间范围不算筛选）。

### 分享卡片

- 入口 = 页头 `NodesRight` → `share-card-dialog.tsx` 左右两栏弹窗（`Modal.Dialog` 必须显式
  `max-w-none` 推翻 HeroUI 默认 `max-w-md` 帽，否则双栏塌成 28rem）：左预览 = 导出 PNG 本身
  （`<img>`，切风格交叉淡入淡出、reduced-motion 下直接切换），右栏 = 显示名称 `TextField`（默认
  本机名，仅本次弹窗生效、不持久化）+ 风格 `ToggleButtonGroup` 2×2 磁贴（特刊 / 小票 / 霓虹 /
  唱片，`SquareArticle` / `Receipt` / `Sparkles` / `MusicNote`）+ 复制图片 / 保存 PNG + 隐私说明
  「卡片只包含聚合数字与热力图，不含明细数据」；关闭态不得重绘 Canvas（最后一帧留状态过退场
  动画）。
- 四个画师为纯 Canvas 2D 手绘（`broadsheet.ts` 1200×1630 / `receipt.ts` 800×1240 / `neon.ts`
  1080×1620 / `vinyl.ts` 1080×1080），2x 导出；字体零新增（Maple Mono CN 随桌面打包 + Windows
  系统衬线栈）。
- 数据投影（`lib/share-input.ts`）：hero / 成本 / 来源榜 / 模型榜 / 峰值日 / 会话数取头部周期用量
  窗；热力图按桌面口径（本机、跟随周期裁剪、格级 = 窗口内最大日四分位、`streakDays` = 窗口内最长
  连续活跃日）；`periodLabel` 预设 = 日期区间、总计 = 年份；窗口无用量 → 投影 null、入口按钮
  禁用。
- 导出：复制走 WebView2 原生 ClipboardItem（失败 toast 引导保存）；保存走 Rust `save_to_downloads`
  （文件名白名单 + Downloads 目录 + 撞名自动序号，toast 播报路径）；CSV 走对话框版
  `save_file_as`。web 的 `<a download>` 在桌面无对应物，这两个命令就是 `lib/save-file.ts` 的全部
  出口（`tauri-plugin-dialog` 仅 Rust 侧驱动，webview 不开 dialog 权限）。

### 窗口生命周期

- 尺寸记忆：`hooks/use-window-geometry.ts` 挂 `app.tsx` 顶层——move / resize / 关闭 / 隐藏四路防抖
  300 ms 写 `tokenusage.desktop.window`（width / height 为 CSS 逻辑 px、x / y 为物理 px、maximized
  布尔）。窗口配置 `visible: false`，挂载时读档 → 位置校验落在任一可用显示器内（否则保持居中）→
  `setSize(LogicalSize)` + `setPosition`（或 `maximize()`）→ `show()`，无启动跳窗；Rust 侧 3 s
  看门狗兜底。capabilities 只为主窗开 set-size / set-position / show / maximize 四条权限。不做
  设置开关，纯自动行为。
- 应用图标：窗口与托盘图标用 `apps/desktop/public/logo-dark.svg`（深色界面变体，深色任务栏 16–32
  px 可辨）；`scripts/admin/desktop-assets/generate.mjs` 读该 SVG 渲染 1024 源图再走 `tauri icon`，
  品牌几何只维护一处。图标嵌在 exe 资源里：`src-tauri/build.rs` 对 `icons/icon.ico` / `icon.png`
  声明 `rerun-if-changed`，重启 dev 时 cargo 重编译；任务栏仍显旧图标时先看 exe 时间戳，再怀疑
  Windows 图标缓存。
- 托盘不可用：`tray-icon` 会吞掉被 Shell 拒绝的 `Shell_NotifyIcon`，应用进程 IL 低于任务栏 IL 时
  永远注册不上（判据是 IL 相对高低，不是 UAC 开关）。webview 调 `tray_status`（400 / 1200 /
  3000 ms 三次探测，任一 true 即可用）后，监控盘页头下方显示 warning Alert「托盘图标未注册」：
  说明任务栏权限高于本应用、用「以管理员身份运行」重启可恢复、关闭窗口会直接退出应用（托盘未
  注册时不拦截关闭）。托盘已注册时仍 `prevent_close()` + `hide()` 进托盘；说明块只在确认不可用
  时出现。
- 三态：Loading 骨架（pulse 块，含配对门控检测中）；错误态（桥接不可用，可重试）；空态（CLI 在
  但队列与 sync 记录皆空；CLI 缺失时文案改为重新安装提示）。

### 配对门控与向导

- 未配对（`status --json` 的 `device_token_set` 为假；localStorage 缓存「配过对」，CLI 暂缺时由
  缓存决定）→ 向导取代监控盘：品牌页头 +「接入这台机器」标题 + 三张步骤卡，标题前 `StepIcon`
  序号徽记（未开始 `bg-default` / 进行中 `bg-accent` / 完成 success 勾，`sr-only` 读出「第 N 步，
  状态」）：
  1. 安装 CLI：安装命令用 `Typography type="code"` + ghost 复制图标钮、「装好了，重新检测」、
     tertiary「安装指南」；
  2. 配对设备：配对码 `type="code"` 大字 + 复制、`等待批准 · 剩余 mm:ss`、secondary「重新打开
     批准页」+ ghost「取消」；失败 danger Alert +「重新配对」；tertiary「已配对？重新检测」逃生口；
  3. 首次同步（批准后自动跑）：三格 tokens / 会话 / 耗时（卡内格窄，标签须单行）+ 同轮上传错误
     warning Alert；失败或无新记录可「重试同步」。
- 「进入监控台」同步完成为 primary、进行中为 tertiary（可提前进入）；「稍后再说，先看本机数据」
  仅在流程外（未开始 / 失败）出现，跳过为会话级。装饰性 Spinner 一律 `aria-hidden`。

### 设置与偏好

- 主题：页头单个图标按钮循环 跟随系统 → 浅色 → 深色，图标与 tooltip（「主题：{当前模式}」）
  始终显示当前模式（跟随系统 = web 页头同款 sun-moon 内联 SVG，浅色 `Sun` / 深色 `Moon`）；选择写
  `tokenusage.desktop.preferences`，`index.html` 首帧前读同一 key 上 `dark` 类（无闪烁），系统模式
  监听 `prefers-color-scheme`。语言 zh-CN 单语（对齐 landing）。
- 设置面板（页头齿轮，向导页头同样可进）：`Modal` 复合结构，宽 `calc(100vw-1.5rem)`、最高 85vh、
  内部滚动；副标题「仅保存在本机，不随账号同步」。分组：
  - 通知（每日汇总 + 汇总时间 / 同步连败 + 连续次数 / 队列积压 + 阀值，均开关 + 按开关联动显示的
    下拉）、免打扰（开关 + 起止整点）、启动（开机自启）。
  - 卡片显示：单个 `ToggleButtonGroup selectionMode="multiple" size="sm"`（`selectedKeys` 为
    `Set<Key>`、子项独立 `<ToggleButton id>` 并带 `ToggleButtonGroup.Separator`）；顺序照监控盘
    渲染 = 活跃热力图 / 用量趋势 / Top 模型 / 来源构成 / 项目与仓库；与 `Label` 同行右对齐、窄窗
    换行；默认热力图关、其余开，即时生效并持久化；构成卡全关时双栏容器一并隐藏。
  - 显示格式：货币 `Select`（USD / EUR / GBP / CNY / JPY / HKD，标签为 CLDR 中文名 + 窄符号，
    非 USD 时下方给 `1 USD = x CODE` 与快照日期）+ Token 显示（紧凑 / 完整）/ 数字单位（K/M/B /
    万/亿，仅紧凑生效）/ 数字分组（3 位 / 4 位，仅完整生效）三项 `ToggleButtonGroup`，互斥项
    `isDisabled` 并给 `Description` 提示；每行 `Label` 左、控件右同行右对齐、窄窗换行。四项只写
    本机 `tokenusage.desktop.preferences`，不与 web 同步；规则由 `lib/display-format.ts` 提供、经
    `lib/format-tokens.ts` 的模块级偏好单例作用于所有数字与费用（含托盘文案与通知正文）；默认
    紧凑 / 万·亿 / USD。
  - 本机数据：2 列网格（数据目录 / 日志目录，`Folder` / `FileText`），走 Rust `open_tracker_dir`，
    白名单只允许 `tracker` 与 `logs`，目录不存在时 toast 提示先让采集器跑一次。
  - 更新：「当前版本」右侧 `Chip size="sm" variant="soft"`（不可点击）+「检查更新」
    `PendingButton`；启动期静默检查只播报中性 toast，安装永远走手动确认（点击即同意 下载 → 安装
    → 自动重启），检测 / 下载期 Spinner，失败 danger toast。
- 开关一律 `Switch` 复合结构（`Switch.Content / Control / Thumb` + `Label`），说明用
  `Description` 小字；数值 / 时段用 `Select` + `ListBox`（小时 00:00–23:00），Select 一律
  `variant="secondary"`。
- 通知规则：每日汇总（本地时间到点、每天一次）、同步连败（`finished` 分隔轮次，上传失败也计；
  达阀值报一次，恢复后重新武装）、队列积压（待上传超阀报一次，回落才重新武装）。免打扰时段只
  抑制发送、不标记已发（到期未发的顺延到时段结束后）。正文只用中文摘要（tokens / 会话 / 体积），
  不嵌 CLI 英文原文。

### 托盘

- 左键唤起主窗口；右键菜单 = 用量行（文案跟随当前周期：今日 / 近 7 天 / 近 30 天 / 总计 tokens）+
  采集状态两行只读信息 + 周期四项（`CheckMenuItem` 单选组，当前周期带勾；点击只在 Rust 发
  `tray-period`，webview 写 preferences 并即时重推用量行与勾选态，页头周期筛选随之同步）+ 立即
  同步（`sync --auto`，写 sync.log、尊重暂停旗标）+ 暂停 / 恢复采集 + 打开主窗口 + 打开 Web
  仪表盘 + 退出。菜单文案由 webview 每 10s 轮询推送（`update_tray`）。
- 托盘动作与窗口联动：Rust 派生 CLI 前发 `tray-cli-start`、子进程退出后发 `tray-cli-done`
  （`{command, exitCode}`），`use-monitor` 收到 start 即把对应按钮置为 pending、收到 done 清
  pending 并 `refreshCli` + 重读 tracker 文件，窗口里的按钮与数据同步跟随。

### 数据边界

- 窗口内容只读 `~/.tokenusage/tracker`（单文件 8 MiB 上限、canonicalize 前缀校验防穿越；另读
  `project.repos.state.json` 只取 `confirmed` 的 http(s) 映射，缺失 / 损坏按无链接降级）。
- 动作一律子进程调 CLI（`cmd /C tokenusage`，`CREATE_NO_WINDOW` 防闪黑窗）；本地聚合口径 =
  queue.jsonl last-wins（与 AGENTS 约束 8 同源）。
- 设备令牌与 anon key 永不出 Rust（config.json 只白名单返回 baseUrl / dashboardUrl / machineId）；
  配对只经 Rust 托管的 `device-login --json` 子进程（`device_code` 不出 Rust，取消与退出杀整棵
  进程树）。
- web 深链与仓库链接只在用户点击时交给系统浏览器，应用自身零网络请求。
