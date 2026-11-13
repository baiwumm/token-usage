# 需求文档

需求唯一真源：范围、边界、角色、验收都在本文维护，会话中的需求变更一律回写本文。技术选型与
执行计划见 `docs/rewrite-plan.md`（不一致时以本文为准，并同步修订计划）。

## 一句话需求

给个人与小型团队的自托管 AI token 用量追踪：一个邮箱、多台设备，钉版 CLI 采集上报，单应用聚合
展示用量与成本；数据全部落在部署者自己的 Supabase 里。

## 范围

| 面 | 路由 | 内容 |
| --- | --- | --- |
| 仪表盘 | `/` | 汇总与 rolling 7d/30d/日均、趋势图、活跃热力图、模型/来源/设备下钻、日/时/月明细表、成本分析、时间范围与时区切换、分享卡片 |
| Sessions | `/sessions` | 会话列表与详情：按时间/设备/来源/项目筛选，展示时长、token、成本、模型拆分；仅设备级来源；支持按当前筛选导出 CSV |
| 项目 | `/projects` | 项目维度用量：按工作目录 basename 归因；口径开关 `NEXT_PUBLIC_PROJECTS_CALIBER`（sessions / hourly），见 `docs/ui-spec.md`「项目（`/projects`）」节 |
| 采集记录 | `/sync-runs` | 每轮 sync 的运行记录（触发方式、结果、耗时、解析文件数与上报量） |
| 设置 | `/settings` | 账户资料、改密、头像、外观偏好（主题/语言/货币/Token 显示/单位/分组）、徽章配置、设备列表与吊销；退出登录在应用壳用户菜单 |
| wrapped | `/wrapped` | 年度回顾（功能对齐旧版，视觉简化） |
| 成就 | `/achievements` | 20 条成就 × 5 档（铜/银/金/钻/王者），账号级、只升不降；页头双口径（段位合计 x/{5×20} + 已解锁 y/20）；分类栅格、进度与达成日期、五档详情时间线、年度回顾独立成就卡；读时计算；仅 `token_achievement_seen` 存账号级已读水位 |
| 配对 | `/device` | 页面批准 CLI 配对码 |
| 公开页 | `/u/<token>` | **公开**（无需登录）：徽章令牌持有者可见的用量页，规范见 `docs/badge.md` |
| CLI API | `/api/functions/token-usage-*` | CLI 面 9 端点 + Dashboard 面若干端点（`docs/cli-contract.md` §0 索引） |
| 公开徽章 API | `/api/badge` | 公开 SVG 徽章端点（令牌即凭证），规范见 `docs/badge.md` |
| 仪表盘内部 API | `/api/app/*` | 应用自有接口（非契约面，随 UI 自由演进） |
| 产品落地页 | token-usage.cc | 仓库内 `apps/landing`：纯静态单页（产品介绍、自部署入口、公开页演示），暗色单主题、中文单语、`output: "export"`；托管于腾讯云 EdgeOne Pages，对外口径为 Vercel；接线见 `apps/landing/README.md` |
| 开源自部署 | — | 中文部署指南、迁移脚本、Deploy to Vercel 按钮 |

**路由约定**：仪表盘挂 `/` 且需要登录；除 `/login`、`/auth/callback`、公开页 `/u/<token>` 与
CLI API 外，所有页面未登录一律重定向到登录页，重定向须保留原始路径与查询参数（配对链接
`?user_code=` 不得因跳转丢失），登录成功进入原目标（无 `?next=` 时缺省 `/`）。设置分区用
`/settings?section=appearance|account|devices` 深链，不新增顶层路由。CLI API 走
`docs/cli-contract.md` 自身的公开/鉴权规则，不受页面守卫影响。路由表变更需回写本表。

## 边界

- **不做**：排行榜、上游云端成就（依赖排名与全局编号）、pet/quota 桌面 widget、`/selfhost` 降级页、
  社区多实例管理面板、数据导入导出工具、端点限流与防滥用（进 backlog）。
- **Sessions 只采集用量元数据**：source、session_id、开始/结束时间、项目标签、token 拆分、模型
  拆分。**不采集 prompt、对话正文、绝对路径、resume command、会话标题**；项目标签由客户端取
  basename，服务端再次清洗。Sessions 为空不影响仪表盘聚合，旧 CLI 继续可用。
- **上游不移植的功能**：Limits（provider 配额）、Skills（本地技能市场）、Cloud / Leaderboard /
  Pet / Widgets / IP check——它们依赖云端、桌面端或本地 CLI 文件，自托管 Web 没有独立数据源。
- **桌面端**只做本机采集视角监控与 CLI 操作台（`apps/desktop`），不复制 web 仪表盘，不做成本与
  账号成就。
- 讨论中出现的新想法一律记入 backlog，不进当前范围。

## 角色与权限

- 单实例多用户：部署者即管理员，用 service-role 建号并发邀请；`token_allowed_emails` 白名单表
  作为可选的自助注册开关（迁移单列，默认不启用）。
- 登录方式：邮箱密码、邮件魔法链接，可选 GitHub / Google OAuth（仅作已有账号的登录方式）；
  公开注册关闭。
- 一账号多设备：设备令牌只存哈希、可即时吊销；跨设备数据按用户聚合、按设备可下钻。
- 公开面：徽章令牌即凭证，可随时撤销；公开页与徽章只展示聚合数字，不暴露设备与账密信息。

## 数据模型

表清单、主键与约束的唯一规范：`docs/rewrite-plan.md` §3；迁移文件是其落地实现。upsert 键与
last-wins 语义跨版本保持不变（对账基线）。成就与段位不建表，读时计算；仅
`token_achievement_seen` 存已读水位。

## 验收标准

全局（任何改动都适用）：

- `pnpm verify`（lint + tsc + test + build）全绿；
- 涉及数据的改动：新系统聚合值 = `queue.jsonl`（采集机本地缓冲
  `$HOME/.tokenusage/tracker/queue.jsonl`）经 last-wins 去重后的总量；
- 浏览器网络面板零 Supabase **数据表**直连请求；@supabase/ssr 的认证流量（token 刷新等）属
  认证链路，不在其列。

分项验收：

- **仪表盘**：rolling 7d/30d/日均、Top 模型、趋势图、热力图、模型/来源/设备、日/时/月明细表、
  成本分析全部可用；数值与契约端点对账一致；桌面与 375px 均无横向滚动；加载/空/错误三态齐全。
- **Sessions**：旧 CLI 的 ingest 响应与行为不变；新 `sessions` 数组校验、幂等、乱序快照不覆盖
  新数据；吊销设备不出现在列表；分页/筛选/汇总以服务端为准；页面只展示用量元数据；无会话数据时
  显示引导空态。
- **外观设置**：主题、语言、货币、Token 显示、数字单位、数字分组即时生效并跨刷新保留；`system`
  语言由 `Accept-Language` 解析且 SSR 首帧正确；货币与数字格式在仪表盘、Sessions、Wrapped、设置中
  一致。
- **成就**：20 条 × 5 档全部可计算，指标只升不降；账号级口径（跨设备、含账户级来源、含已吊销
  设备历史）；日界/连续/周末/夜间按浏览器时区计算，`achieved_at` 可由历史回推且一致；Sessions
  类成就标注「自 Sessions 数据可用起统计」；三态齐全、中英文案完整、375px 无横向滚动；阈值唯一
  真源是 `apps/web/src/lib/achievements/catalog.ts`，改阈值必须同步该文件、守卫测试与
  `docs/achievements-plan.md` §2。
- **公开徽章与公开页**：SVG 输出确定、可缓存、无脚本；令牌可撤销；公开页无登录可用、noindex、
  no-JS 可读、375px 与深浅主题正常。细则见 `docs/badge.md`。
- **部署**：全新 Supabase / Vercel 账号按 `docs/deploy-guide.md` 从零跑通：建库 → 部署 → CLI
  配对 → 上报 → 仪表盘可见。
