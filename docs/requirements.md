# 需求文档（v1 真源）

需求的唯一真源：范围、边界、角色、验收都在本文维护；会话中的需求变更一律回写本文。
技术选型与执行计划见 `docs/rewrite-plan.md`；两者不一致时以本文为准，并同步修订计划。

## 一句话需求

给个人与小型团队的自托管 AI token 用量追踪：一个邮箱、多台设备，钉版 CLI 采集上报，
单应用聚合展示用量与成本；数据全部落在部署者自己的 Supabase 里。

## 范围（v1 做什么）

| 面 | 路由 | 内容 |
|---|---|---|
| 仪表盘 | `/` | 汇总、日/时图表、模型/来源/设备下钻、时间范围与时区切换、分享卡片 |
| 设置 | `/settings` | 账户改名、设备列表与吊销、登出 |
| wrapped | `/wrapped` | 年度回顾（功能对齐旧版，视觉简化） |
| 服务状态 | `/service-status` | 端点健康自查页 |
| 配对 | `/device` | 页面批准 CLI 配对码 |
| CLI API | `/api/functions/token-usage-*` | 10 个契约端点（`docs/cli-contract.md`） |
| 开源自部署 | — | 中文部署指南、迁移脚本、Deploy to Vercel 按钮 |

路由约定：用量页直接挂 `/`，不设 `/dashboard` 别名；路由表变更需回写本表。

## 边界（v1 不做什么）

排行榜、成就系统、pet/quota 桌面 widget、`/selfhost` 降级页、社区多实例管理面板、
数据导入导出工具、端点限流与防滥用（与旧系统行为保持一致，进 backlog）、桌面端托盘应用
（v1 后视情况，backlog，候选 Tauri）。
讨论中出现的新想法一律记入 backlog，不进 v1。

## 角色与权限

- 单实例多用户：部署者即管理员，用 service-role 建号并发邀请；`token_allowed_emails`
  白名单表作为可选的自助注册开关（迁移单列，默认不启用）。
- 登录方式仅两种：邮箱密码、邮件魔法链接；公开注册关闭。
- 一账户多设备：设备令牌只存哈希、可即时吊销；跨设备数据按用户聚合、按设备可下钻。

## 数据模型

表清单、主键与约束的唯一规范：`docs/rewrite-plan.md` §3；迁移文件是其落地实现。
upsert 键与 last-wins 语义跨版本保持不变（对账基线）。
新系统使用**独立的 Supabase 项目**（与旧系统项目物理分离），迁移为跨项目 ETL。

## 验收标准

全局（每个里程碑都适用）：

- `pnpm verify`（lint + tsc + build；test 自 M1 纳入）全绿；
- 涉及数据的里程碑：新系统聚合值 = `queue.jsonl`（采集机本地缓冲队列
  `$HOME/.tokentracker/tracker/queue.jsonl`）经 last-wins 去重后的总量；
- 浏览器网络面板零 Supabase 直连请求。

分项验收线：`docs/rewrite-plan.md` §5 里程碑表。
上线与退役的放行条件：`docs/rewrite-plan.md` §7 闸门表。
