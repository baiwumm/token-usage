# 需求文档（v1 真源）

> 2026-10-25 范围修订（操作者指令）：在 v1 基础上补「上游 Dashboard 核心」与
> Sessions，设置新增外观偏好。上游 TokenTracker 的 Limits / Skills / Leaderboard /
> Achievements / Pet / Widgets / Cloud / IP check 仍不在范围内（见「边界」）。

需求的唯一真源：范围、边界、角色、验收都在本文维护；会话中的需求变更一律回写本文。
技术选型与执行计划见 `docs/rewrite-plan.md`；两者不一致时以本文为准，并同步修订计划。

## 一句话需求

给个人与小型团队的自托管 AI token 用量追踪：一个邮箱、多台设备，钉版 CLI 采集上报，
单应用聚合展示用量与成本；数据全部落在部署者自己的 Supabase 里。

## 范围（v1 做什么）

| 面 | 路由 | 内容 |
|---|---|---|
| 仪表盘 | `/` | 上游核心对齐：汇总与 rolling 7d/30d/日均、趋势图、活跃热力图、模型/来源/设备下钻、日/时/月明细表、成本分析、时间范围与时区切换、分享卡片 |
| Sessions | `/sessions` | 会话列表与详情：按时间/设备/来源/项目筛选，展示时长、token、成本、模型拆分；仅设备级来源 |
| 设置 | `/settings` | 账户资料、外观偏好（主题/语言/货币/Token 显示/单位/分组）、设备列表与吊销；退出登录在应用壳用户菜单 |
| wrapped | `/wrapped` | 年度回顾（功能对齐旧版，视觉简化） |
| 服务状态 | `/service-status` | 端点健康自查页 |
| 配对 | `/device` | 页面批准 CLI 配对码 |
| CLI API | `/api/functions/token-usage-*` | 10 个契约端点（`docs/cli-contract.md`） |
| 产品落地页 | token-usage.cc | **独立建站**（不在本应用内）：产品介绍、自部署入口（部署指南 / GitHub）、登录入口 |
| 开源自部署 | — | 中文部署指南、迁移脚本、Deploy to Vercel 按钮 |

路由约定（2026-10-24 二次修订）：仪表盘挂 `/` 且**需要登录**；**除 `/login`、`/auth/callback`
与 CLI API 外，所有页面未登录一律重定向到登录页**，重定向须保留原始路径与查询参数
（配对链接 `?user_code=` 不得因跳转丢失），登录成功进入原目标（无 `?next=` 时缺省 `/`）。
2026-10-25 新增 `/sessions`，同属登录后页面；设置分区用 `/settings?section=appearance|account|devices`
深链，不新增顶层路由。
产品落地页不在本应用内，使用 **token-usage.cc** 独立域名创建（开源自部署介绍站，与本
应用部署域相互独立）。CLI API 走 `docs/cli-contract.md` 自身的公开/鉴权规则，不受页面
守卫影响。路由表变更需回写本表。

## 边界（v1 不做什么）

排行榜、成就系统、pet/quota 桌面 widget、`/selfhost` 降级页、社区多实例管理面板、
数据导入导出工具、端点限流与防滥用（与旧系统行为保持一致，进 backlog）、桌面端托盘应用
（v1 后视情况，backlog，候选 Tauri）。

上游 TokenTracker 的 **Limits**（provider 配额）、**Skills**（本地技能市场）、**Cloud /
Leaderboard / Achievements / Pet / Widgets / IP check** 不移植：它们依赖云端、桌面端或
本地 CLI 文件，自托管 Web 没有独立数据源。

Sessions 只采集**用量元数据**：source、session_id、开始/结束时间、项目标签、token 拆分、
模型拆分。**不采集 prompt、对话正文、绝对路径、resume command、会话标题**；项目标签由
客户端取 basename，服务端再次清洗。Sessions 为空不影响仪表盘聚合，旧 CLI 继续可用。

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

2026-10-25 增量：新增 `token_sessions`（设备级会话明细，`models` JSONB）；ingest 增加
可选 `sessions` 数组，query 增加 `account-sessions` series。设计见 `docs/rewrite-plan.md`
§3.1 与 `docs/cli-contract.md` §2.4 / §2.7。

## 验收标准

全局（每个里程碑都适用）：

- `pnpm verify`（lint + tsc + build；test 自 M1 纳入）全绿；
- 涉及数据的里程碑：新系统聚合值 = `queue.jsonl`（采集机本地缓冲队列
  `$HOME/.tokenusage/tracker/queue.jsonl`）经 last-wins 去重后的总量；
- 浏览器网络面板零 Supabase **数据表**直连请求（RLS 全拒姿态下浏览器不可达表数据）；
  @supabase/ssr 的浏览器认证流量（token 刷新等）属认证链路，2026-10-24 裁决豁免。

分项验收线：`docs/rewrite-plan.md` §5 里程碑表。
上线与退役的放行条件：`docs/rewrite-plan.md` §7 闸门表。

2026-10-25 增量验收：

- **Dashboard 核心（A）**：rolling 7d/30d/日均、Top 模型、趋势图、热力图、模型/来源/设备、
  日/时/月明细表、成本分析全部可用；数值与契约端点对账一致；桌面与 375px 均无横向滚动；
  加载/空/错误三态齐全。
- **Sessions（B）**：旧 CLI 的 ingest 响应与行为不变；新 `sessions` 数组校验、幂等、乱序快照
  不覆盖新数据；吊销设备不出现在列表；分页/筛选/汇总以服务端为准；页面只展示用量元数据，
  不出现 prompt/路径/命令/标题；无会话数据时显示引导空态。
- **外观设置**：主题（浅/深/系统）、语言（系统/中文/English）、货币（USD/CNY 等）、
  Token 显示（紧凑/完整）、数字单位（K/M/B 或 万/亿）、数字分组（3 位/4 位）即时生效并
  跨刷新保留；`system` 语言由 Accept-Language 解析且 SSR 首帧正确；货币与数字格式在
  仪表盘、Sessions、Wrapped、设置中一致。
