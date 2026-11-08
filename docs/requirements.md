# 需求文档（v1 真源）

> 2026-10-25 范围修订（操作者指令）：在 v1 基础上补「上游 Dashboard 核心」与
> Sessions，设置新增外观偏好。上游 TokenTracker 的 Limits / Skills / Leaderboard /
> Pet / Widgets / Cloud / IP check 仍不在范围内（见「边界」）。
>
> 2026-10-30 范围修订（操作者指令）：新增**成就系统**（M7）——自研、账号级、读时计算，
> 不移植上游的 Cloud / Leaderboard 成就（无排行榜与全局编号）。实施计划与进度见
> `docs/achievements-plan.md`。

需求的唯一真源：范围、边界、角色、验收都在本文维护；会话中的需求变更一律回写本文。
技术选型与执行计划见 `docs/rewrite-plan.md`；两者不一致时以本文为准，并同步修订计划。

## 一句话需求

给个人与小型团队的自托管 AI token 用量追踪：一个邮箱、多台设备，钉版 CLI 采集上报，
单应用聚合展示用量与成本；数据全部落在部署者自己的 Supabase 里。

## 范围（v1 做什么）

| 面 | 路由 | 内容 |
|---|---|---|
| 仪表盘 | `/` | 上游核心对齐：汇总与 rolling 7d/30d/日均、趋势图、活跃热力图、模型/来源/设备下钻、日/时/月明细表、成本分析、时间范围与时区切换、分享卡片 |
| Sessions | `/sessions` | 会话列表与详情：按时间/设备/来源/项目筛选，展示时长、token、成本、模型拆分；仅设备级来源，支持按当前筛选导出 CSV |
| 项目 | `/projects` | 项目维度用量：按工作目录 basename 归因；口径开关 `NEXT_PUBLIC_PROJECTS_CALIBER`（sessions / hourly），见 `docs/ui-spec.md`「项目（`/projects`）」节 |
| 采集记录 | `/sync-runs` | 每轮 sync 的运行记录（触发方式、结果、耗时、解析文件数与上报量） |
| 设置 | `/settings` | 账户资料、改密、头像、外观偏好（主题/语言/货币/Token 显示/单位/分组）、徽章配置、设备列表与吊销；退出登录在应用壳用户菜单 |
| wrapped | `/wrapped` | 年度回顾（功能对齐旧版，视觉简化） |
| 成就 | `/achievements` | 20 条成就 × 5 档（铜/银/金/钻/王者），账号级、只升不降；页头双口径（段位合计 x/{5×20} + 已解锁 y/20）；分类栅格、进度与达成日期、五档详情时间线、年度回顾独立成就卡（当前已获得成就 + 段位）；读时计算；仅 `token_achievement_seen` 存账号级已读水位（跨设备「新」标记与解锁 toast） |
| 配对 | `/device` | 页面批准 CLI 配对码 |
| 公开页 | `/u/<token>` | **公开**（无需登录）：徽章令牌的持有者可见的用量页，规范见 `docs/badge.md` |
| CLI API | `/api/functions/token-usage-*` | CLI 面 9 端点 + Dashboard 面 10 端点（`docs/cli-contract.md` §2） |
| 公开徽章 API | `/api/badge` | 公开 SVG 徽章端点（无需鉴权，令牌即凭证），规范见 `docs/badge.md` |
| 仪表盘内部 API | `/api/app/*` | 应用自有接口（非契约面，随 UI 自由演进） |
| 产品落地页 | token-usage.cc | **仓库内 `apps/landing` 独立部署**（2026-11-08 拍板，原"独立建站"措辞作废）：纯静态单页——产品介绍、自部署入口（部署指南 / GitHub）、公开页演示；暗色单主题、中文单语、`output: "export"`；**已交付并操作者验收**（2026-11-08，M-landing：单页八段 + 后台实拍轮播 + 分享卡放大预览，规范见 `docs/ui-spec.md`「落地页」节），静态产物实际托管腾讯云 EdgeOne Pages（对外口径仍为 Vercel，见路由约定与 `apps/landing/README.md`） |
| 开源自部署 | — | 中文部署指南、迁移脚本、Deploy to Vercel 按钮 |

路由约定：仪表盘挂 `/` 且**需要登录**；**除 `/login`、`/auth/callback`、公开页 `/u/<token>`
与 CLI API 外，所有页面未登录一律重定向到登录页**，重定向须保留原始路径与查询参数
（配对链接 `?user_code=` 不得因跳转丢失），登录成功进入原目标（无 `?next=` 时缺省 `/`）。
设置分区用 `/settings?section=appearance|account|devices` 深链，不新增顶层路由。
产品落地页为仓库内 **`apps/landing`** 纯静态 app（2026-11-08 拍板，原"独立建站"改为
monorepo 内独立部署），静态产物（`out/`）部署到 **token-usage.cc**——实际托管为腾讯云
EdgeOne Pages（Makers，运营细节不对外提及），对外口径仍为 Vercel（Deploy to Vercel
按钮与部署指南面向自部署用户，指向 `apps/web`，不受影响）；与本应用部署域相互独立；
实现与部署接线见 `apps/landing/README.md`。
CLI API 走 `docs/cli-contract.md` 自身的公开/鉴权规则，
不受页面守卫影响。路由表变更需回写本表。

## 边界（v1 不做什么）

排行榜、pet/quota 桌面 widget、`/selfhost` 降级页、社区多实例管理面板、
数据导入导出工具、端点限流与防滥用（与旧系统行为保持一致，进 backlog）。

2026-10-30 修订：**成就系统自本表移出**（操作者指令），进入范围（M7，`/achievements`）。
排行榜与上游云端成就（依赖 Leaderboard 排名、全局发行编号）仍不移植；本项目成就为账号级、
读时计算的自有实现，见下文与 `docs/achievements-plan.md`。

2026-11-08 修订：**桌面端托盘应用自本表移出**（操作者拍板立项，M-desktop）——仓库内
`apps/desktop` 托盘伴生工具（Tauri 2），只做本机采集视角监控与 CLI 操作台，不复制 web
仪表盘；定位与边界见 `docs/desktop-plan.md`。pet/quota 桌面 widget 仍不做。

上游 TokenTracker 的 **Limits**（provider 配额）、**Skills**（本地技能市场）、**Cloud /
Leaderboard / Pet / Widgets / IP check** 不移植：它们依赖云端、桌面端或本地 CLI 文件，
自托管 Web 没有独立数据源。上游成就的云端部分（排名依赖与全局编号）同样不移植；
M7 成就只使用本实例自身的用量与会话数据。

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

2026-10-30 增量：成就系统（M7）的**成就与段位仍不建表**——由现有
`token_usage_hourly` / `token_account_session_states` / `token_sessions` /
`token_sync_runs` / `token_devices` 读时计算；P3 仅新增 `token_achievement_seen`
（每用户单行的已读水位，不参与成就计算）。口径、单调性与阈值规则见
`docs/achievements-plan.md`。

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

2026-10-30 增量验收（成就 M7）：

- 18 条成就 × 5 档（铜/银/金/钻/王者）全部可计算，指标只升不降；账号级口径（跨设备、
  含账户级来源、含已吊销设备历史）；
- 日界 / 连续 / 周末 / 夜间按浏览器时区计算，`achieved_at` 可由历史回推且一致；
- Sessions 类成就明确标注「自 Sessions 数据可用起统计」，无会话数据不影响其余成就；
- 页面 Loading / Empty / Error 三态齐全，中英文案完整，375px 无横向滚动；
- 阈值经真实实例校准后定稿；守卫测试（阈值严格递增、指标单调白名单、文案完整性）全绿；
- 阈值唯一真源 `apps/web/src/lib/achievements/catalog.ts`（前端只读 payload 下发的值）；2026-10-30
  按真实实例校准定稿（15 个月 / 21.66B tokens / 94 活跃日 / 636 会话 / 16 个 source → 7 条钻石、
  0 条王者），改阈值必须同步 `catalog.ts`、守卫测试与 `docs/achievements-plan.md` §2 表格；
- 第 19 条候选 `deep_thinker`（累计 reasoning tokens）未上线：校准实例 reasoning 覆盖率 36.5%，
  低于 50% 门槛；阈值草案保留在 `docs/achievements-plan.md` §2.3，覆盖率提升后复议；
- `pnpm verify` 全绿；数据通路函数预算已核对（超限时改 Server Component 直出）。

2026-11-08 增量打磨（成就双口径 + 2 条新成就）：

- 页头摘要改双口径：大数字为**段位合计**（每条成就按当前段位贡献 0–5，分母 = 条数 × 5），
  「已解锁 y/20」降级为小字副口径——升段会持续推进总进度，解锁数封顶后进度条不再静止；
  升段触发全局 toast 的行为不变（`achieved_at` 五档时间线本就按档记录）；
- 新增 2 条成就：`early_bird` 晨型人（本地 06:00–08:59 活跃的不同日期数，节奏区，阈值镜像
  night_owl）与 `biggest_session` 鸿篇巨制（单会话累计 token 峰值，高峰区，Sessions 覆盖注记），
  阈值经真实实例校准（2026-11-08：16 个月 / 23.72B tokens / 102 活跃日 / 699 会话）；
- 两条新成就的插画 PNG 已生成入库（2026-11-08，MiniMax key 重配后出图；`biggest_session`
  首批主体跑题、收紧 subject 后重出合格），实测半径入 `art-fit.ts`，`PENDING_ARTWORK`
  白名单已从守卫测试移除；
- `deep_thinker` 复核：reasoning 覆盖率 31.4%（较 2026-10-30 的 36.5% 下降），继续冻结。
