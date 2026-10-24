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
- 浮层（Modal / Drawer / Popover / Tooltip / Toast）使用 HeroUI 内置组件及其触发器组件，
  受控用法遵循各组件文档，不自建浮层机制。
- 图标：`@gravity-ui/icons`（与 HeroUI v3 官方示例一致），尺寸对齐 HeroUI 插槽惯例。
- 图表：recharts（2026-10-24 裁决，替代原"手写 SVG"）；热力图无对应 recharts 类型，用
  主题 token 的 CSS grid 实现（`lib/dashboard` 对齐函数把 wire 的连续天切片对齐为周一列）。
- 动效：优先 CSS（零依赖）；确有必要时可用 `motion`（`motion/react`，2026-10-24 批准，按需
  安装；预算见 `docs/rewrite-plan.md` §4）。GSAP / Three.js 仍不移植。

## 三态与响应式

- 每个数据面必须设计 Loading（Skeleton / Spinner）、Empty、Error 三态；Error 态提供重试。
- 响应式：`lg` 以下使用抽屉导航（对齐旧系统行为）；关键页面在 375px 宽度可用。

## UI 基准

- M3 交付的仪表盘首页即视觉与行为基准：其余页面复用其模式，不自创；确需偏离时先回写本文。
- App Shell（2026-10-24 操作者要求，参照 better-admin 截图重做；2026-10-25 二轮调整）：
  - 桌面侧边栏自顶向下为品牌、胶囊导航、底部用户块（头像 + 名称 + 下拉：账户设置 /
    退出登录）；侧边栏无背景色与右边框，与页面共用底色。折叠态 76px 仅留图标，状态存
    localStorage。退出登录只保留用户块下拉一处（含确认对话框），不再有「帮助与信息」及
    独立的退出登录入口。
  - 顶栏持有页面标题（仪表盘为按时段的问候语，其余页面取菜单名），页面正文不再重复
    标题；顶栏无下边框，底色与页面一致；右侧固定为 GitHub / 语言 / 主题色 / 明暗切换 /
    配对设备主操作。明暗切换用 HeroUI `Tabs` 实现，整控件 32px 对齐图标按钮；语言为
    `Globe` 图标 ghost 按钮 + 单选下拉；主题色为 `Popover` + `ColorSwatchPicker` 色板
    （含随机切换），色板变量见 `apps/web/src/styles/theme-palettes.css`。
  - `lg` 以下侧边栏换为抽屉，结构与桌面侧边栏一致：导航在上，语言 / 主题色 / 明暗与
    用户块在下。
  - 语言偏好写 `token-usage.locale` cookie；根布局据此设置 `<html lang>` 并渲染首帧，
    切换即时生效、刷新不闪烁。
- 审查：UI 代码提交前用 web-design-guidelines Skill 对照最新 Web Interface Guidelines，
  输出 `file:line` 问题清单并修复。
