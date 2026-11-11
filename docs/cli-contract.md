# API 契约（v1 · 两档制）

本文件是 Token Usage 后端的 HTTP 接口规范，分两档：

- **CLI 面（硬冻结）**：device-flow-authorize / device-flow-poll / device-flow-grant /
  ingest / public-config / device-rename / device-revoke / sync-report / reconcile。消费者是采集端 CLI——已配对的
  钉版 `tokentracker-cli@1.4.x` 把绝对 URL 存在本地 `config.json` 里，**不能随服务端升级而
  更新**，因此这一档的路径、字段名、语义一经发布即冻结。
- **Dashboard 面（可演进）**：account-summary、account-\<series\> ×8（含 `sessions` 与
  `sync-runs`）、dashboard。唯一消费者
  是本仓库的新仪表盘（旧 selfhost 降级页已裁撤），服务端与 UI 同仓同发、无外部钉版客户端，
  随 UI 版本演进；每次变更需回写本文并同步 golden 测试与前端，但不构成对外承诺。

> CLI 面冻结的含义：字段**不可改名、不可改类型、不可改变语义**；只允许**追加可选字段**。
> 任何破坏性变更都必须以新的 API 版本路径发布，且旧路径继续可用。

契约以旧实现为准逐端点核对过（来源：TokenTrackerSelfhost 仓库 `api/functions/*` 与
`api/_lib/*`，2026-10；该仓库已于 2026-10-29 删除）。本文件与实现冲突时，**以本文件 +
契约测试（`tests/contract/`）为准**修实现，而不是反过来。

## 1. 全局约定

### 1.1 路径与 Base URL

- CLI 的 base URL 配置为 `https://<部署域名>/api`，CLI 端 `functionUrlFor()` 解析为 `<base>/functions/<slug>`。
- 规范路径是 **`/api/functions/token-usage-<slug>`**，route handler 挂载于
  `app/api/functions/token-usage-<slug>/route.ts`（八个 account series 共用一个
  `[...slug]` catch-all，见 §2.7）。
- 旧路径 `/api/functions/tokentracker-<slug>` 的别名已于 **2026-11-03 退役**（破坏性
  变更，见 §1.5）：GET 落到路由层 404，写动词落到 `[...slug]` catch-all 的冻结 405
  信封——两者都无处理器、均为有声失败。钉版旧 CLI（tokentracker-cli@1.4.x）
  需升级到 `tokenusage-cli` 并改用规范路径。
- 配对页路径 **`/device`** 也是契约的一部分（CLI 打印并打开 `/device?user_code=XXXX-XXXX`）。

### 1.2 CORS 与通用行为

| 项 | 值 |
|---|---|
| `Access-Control-Allow-Origin` | `*` |
| `Access-Control-Allow-Methods` | `GET, POST, OPTIONS` |
| `Access-Control-Allow-Headers` | `Content-Type, Authorization, apikey, x-api-key` |
| `Access-Control-Max-Age` | `86400` |
| `OPTIONS` 预检 | `204`，无 body |
| 方法不匹配 | `405 {"error":"Method not allowed"}` |
| 所有 JSON 响应 | `Cache-Control: no-store`（例外：account series 成功 `GET` 为 `private, no-cache` + 强 ETag 协商缓存，见 §2.7，2026-10-27 起，Dashboard 面） |
| 请求体上限 | 1 MiB，超出 `413`；显式 `Content-Length` 超限时未读 body 即拒 |
| 畸形 JSON 请求体 | `400 {"error":"invalid_json"}`（2026-10-27 起；此前沿袭 reference 的 generic 500，对客户端错误返回 5xx 语义不当） |

### 1.3 错误格式

统一 JSON 信封 `{ "error": string }`：

- `4xx`：`error` 为稳定的机器可读短码或短句（见各端点）。
- `5xx`：一律 `{"error":"Internal server error"}`，**不泄露内部消息**；详情只进服务端日志。

### 1.4 鉴权（双重主体）

`Authorization: Bearer <token>`，服务端按顺序解析：

1. **设备令牌**：64 位十六进制字符串。服务端计算 `sha256(token)`，在 `token_device_tokens.token_hash` 中查找（且 `revoked_at is null`），并校验所属设备行 `revoked_at is null`。命中 → 主体 `{kind:"device", user_id, device_id}`。**明文令牌只在签发响应里出现一次，服务端只存哈希。**
2. **Supabase JWT**（三段式）：交给 Supabase Auth `/auth/v1/user` 校验，**绝不自行解析 sub 字段**。命中 → 主体 `{kind:"user", user_id, device_id:null}`。
3. 都不命中 → `401 {"error":"Unauthorized"}`。

标注"设备令牌专用"的端点跳过第 2 步；标注"设备令牌或 JWT"的端点两者皆可。**设备令牌只能操作自己那台设备**（`device_id` 不匹配 → `403`），JWT 可操作本账户任意设备。

### 1.5 旧路径别名（**已于 2026-11-03 退役**）

历史形态：钉版 `tokentracker-cli@1.4.x` 把 slug 硬编码为旧名 `tokentracker-*`，本契约曾由
`next.config.mjs` 的 rewrites 把 `/api/functions/tokentracker-<slug>` 逐字别名到规范路径。

**退役记录（破坏性变更，操作者 2026-11-03 拍板执行）**：
- 两条 rewrite（`tokentracker-account-:series`、`tokentracker-:slug`）已从
  `next.config.mjs` 移除；旧路径 **GET → 404**（路由无匹配），**POST 等写动词 → 405**
  （`/api/functions/*` 的 catch-all 只服务 account-series 族，其余 slug 的写请求由
  冻结的 405 信封拒绝——同样无处理器）。contract 测试
  `tests/contract/legacy-alias-removed.test.ts` 守护，防复活。
- 影响面：仅指向本后端（生产实例或自托管副本）的钉版旧 CLI。失败是**有声**的——上传
  报 404/405，本地 `queue.jsonl` 数据保留，升级 `tokenusage-cli` 后随下次 sync 补传，不丢历史。
- 上游 npm 包 `tokentracker-cli` 属上游作者持续发布的资产，与本契约无关，本仓库不做
  也不做任何停发动作。
- 前置清点：旧托管域名已于 2026-10-29 注销，本机两台采集机均已迁移到
  `tokenusage-cli`；操作者据此确认无存活依赖。

### 1.6 限流与滥用边界（部署侧，2026-10-27 裁定）

代码层**不做**速率限制：本服务部署在 serverless 平台，多实例下进程内计数器不成立。
限流与滥用防护由**部署平台**承担（如 Vercel Firewall 的速率规则），属于部署配置而非
本契约；公网部署应至少对 `/api/functions/*` 配置基础的 429 速率规则。

已评估并接受的风险：device-flow `user_code` 猜解——字母表 32 字符 × 8 位（≈1.1×10¹²
组合）、配对码 15 分钟过期、批准需账户持有人在 `/device` 交互确认，暴力猜解在过期窗口
内的可行概率可忽略；401/404 响应不区分"码不存在"与"码已过期"，无枚举侧信道。

## 2. 端点规范

### 2.1 `POST /api/functions/token-usage-device-flow-authorize`（公开｜CLI 面）

发起设备配对，生成配对码。

- 请求体：`{ "client_info?": string(≤200), "machine_id?": string(trim 后 ≥8 且 ≤64) }`
- 成功 `200`：

```json
{
  "device_code": "64位十六进制（32 随机字节）",
  "user_code": "XXXX-XXXX",
  "verification_uri": "<DASHBOARD_URL>/device",
  "verification_uri_complete": "<DASHBOARD_URL>/device?user_code=<user_code>",
  "expires_in": 900,
  "interval": 5
}
```

- 语义与不变量：
  - `user_code` 字母表 `ABCDEFGHJKMNPQRSTUVWXYZ23456789`（**无 0/1/I/L/O**），第 4 位后插 `-`。
  - 配对码 15 分钟过期（`expires_in` 固定 `900`，轮询间隔固定 `interval: 5` 秒）。
  - `user_code` 唯一冲突时重试（最多 5 次），仍冲突 → `503 {"error":"Could not allocate a device code"}`。
  - 环境变量 `TOKEN_USAGE_DASHBOARD_URL` 未配置 → `500`。

### 2.2 `POST /api/functions/token-usage-device-flow-poll`（凭 device_code 知识｜CLI 面）

CLI 轮询配对结果。请求体：`{ "device_code": string }`。

| 场景 | 响应 |
|---|---|
| `device_code` 非法格式（非 64 位 hex）或不存在 | `404 {"status":"unknown"}` |
| 仍是 pending | `200 {"status":"pending"}` |
| 已批准（签发令牌，见下） | `200 {"status":"approved","user_id","device_token","device_id","machine_id"}` |
| 已过期 / 已使用 | `410 {"status":"expired"}`（服务端同时把 pending 的过期码标记为 expired） |

签发语义（**必须逐条保留**）：

1. 设备名 = `<client_info 中的主机名> #<machine_id 前 8 位>`（client_info 缺失时主机名回退为 `Token Usage CLI`，machine_id 缺失无后缀），总长 ≤128，`platform` 固定 `"cli-device-flow"`。（2026-10-27 品牌更名：原回退值 `TokenTracker CLI` 仅影响更名后新配对的设备显示名，既有设备名不变。）
2. 按 `machine_id` → 精确 `device_name` 的顺序找**同账户**的活跃设备；找不到则新建（重名冲突自动追加 ` #<4位hex>` 重试，最多 5 次）。
3. 写入设备行的 `machine_cluster_id`（= `machine_id ?? device_id`；旧 `tokentracker_device_machine` 1:1 表已折叠为 `token_devices` 的列，已有值则幂等跳过）。
4. **吊销该设备名下所有仍活跃的旧令牌**，再签发新令牌（新明文只出现在本响应中）。
5. `machine_id` 缺失时响应中的 `machine_id` 回退为设备行上的值或 `null`。

> **本地可见性（CLI 0.4.7 起）**：CLI 用同一规则在本地重算这个默认名
> （`<主机名> #<machine_id 前 8 位>`），并在 `status` / `sync` / `upload` / `reconcile` /
> `doctor` / `init` 的输出里打印 `- Device: <默认名> (id <device_id>)`。注意它打印的是
> **默认名**，不是可被改名的 `device_name` 当前值——两台以上采集机时，默认名才是稳定标识
> （对照表见 `docs/launch-runbook.md` 的采集机清单）。CLI 输出不属于本契约面，
> 改动无需回写本文档；该批见 `docs/cli-release.md` §八。

### 2.3 `POST /api/functions/token-usage-device-flow-grant`（设备令牌或 JWT｜CLI 面）

用户在 `/device` 页面批准 CLI 的配对码。请求体：`{ "user_code": string }`（先 trim 再转大写）。

- 格式非法 → `400 {"error":"Invalid user_code format"}`。
- 按 `user_code + status=pending + expires_at > now` 定位并更新为 `approved`（记录 `user_id`、`approved_at`）；无匹配 → `404 {"error":"Code not found, expired, or already used"}`。
- 成功 `200 {"ok":true,"user_code":"<大写后的码>"}`。

### 2.4 `POST /api/functions/token-usage-ingest`（仅设备令牌｜CLI 面）

上报用量桶与会话元数据。请求体：

```json
{
  "hourly": [ /* 或别名 "buckets"，二者皆接受 */ ],
  "account_session_states": [ ],
  "sessions": [ /* 可选，≤200；旧 CLI 不传时行为逐字不变 */ ],
  "projects": [ /* 可选，≤200；契约 v3（2026-11-06）；旧 CLI 不传时行为逐字不变 */ ]
}
```

**usage bucket 字段**（全部必填，值必须是非负安全整数，否则整批 400）：

| 字段 | 说明 |
|---|---|
| `hour_start` | 可解析的 ISO 时间；**不要求整点对齐**——采集端的半小时桶（`:00` / `:30`）是既有合法形态（2026-10-27 注明），读取侧按 tz 日键聚合，非对齐起点不影响对账 |
| `source` | trim + 转小写，≤100 字符，空则 `"unknown"` |
| `model` | trim，≤200 字符，空则 `"unknown"` |
| `input_tokens` `cached_input_tokens` `cache_creation_input_tokens` `output_tokens` `reasoning_output_tokens` `total_tokens` | 非负整数 |
| `billable_total_tokens` | 非负整数或显式 `null` |
| `conversations`（别名 `conversation_count`） | 非负整数，默认 0 |
| `total_cost_usd` | 非负数，默认 0；**单行钳制 ≤ 10.0 USD**（2026-10-27 安全收紧，防设备令牌伪造天价成本扭曲仪表盘：超出按 10.0 计，不整批拒绝——避免卡住已部署采集机的队列） |
| `credits` | **可选**（2026-10-31 P1），非负数，默认 0。厂商积分/点数（如 Qoder Credits），浮点，服务端四舍五入到 6 位小数、单行钳制 ≤ 1,000,000，非法/负值按 0 计（对齐 `total_cost_usd` 的钳制哲学，不整批拒绝）。**独立维度**：永不并入任何 token 列、`total_tokens` 校验或成本；是否携带不影响请求合法性。机制背景见 `docs/sources-capture-audit.md` §2 |
| `project_key` | **可选**（2026-11-03 契约 v2，操作者放行）。字符串或显式 `null`/缺省；其余类型 → 整批 `400 {"error":"Invalid usage bucket"}`。清洗规则与 session 的 `project_key` **同一实现**：去尾部路径分隔符后取 basename（`/` 与 `\` 均视为分隔符）、去控制字符、截断 120；空、`.`、`..` 均记为未归因。语义 = 桶所属项目；缺省/空 = 未归因。旧客户端不传时行为与旧版逐字一致 |

**session 字段**（`sessions` 可选；除标注可选者外全部必填；任一非法 → 整批 `400 {"error":"Invalid session"}`）：

| 字段 | 说明 |
|---|---|
| `session_id` | trim，非空 ≤256，不含 `/`、`\` 与 Unicode Cc 控制字符（防止把路径当会话 ID） |
| `source` | trim + 转小写，≤100，空则 `"unknown"`；`cursor` / `trae-cn` 为账户级来源，整条跳过（不校验其余字段、不落库、计入 `sessions_skipped`） |
| `started_at` `ended_at` | 可解析的 ISO 时间；`ended_at >= started_at` |
| `project_key` | 可选；服务端去掉尾部路径分隔符后取 basename（`/` 与 `\` 均视为分隔符）、去控制字符、截断 120；空、`.`、`..` 均记为 `null` |
| `input_tokens` `cached_input_tokens` `cache_creation_input_tokens` `output_tokens` `reasoning_output_tokens` `total_tokens` | 非负安全整数；`total_tokens` 必须等于 `input + cached_input + cache_creation + output`（`reasoning_output_tokens` 单列，不计入 total） |
| `billable_total_tokens` | 非负安全整数或显式 `null` |
| `credits` | **可选**（2026-10-31 增量）。数值，四舍五入 6 位小数，缺省 0；非法/负值按 0 计（对齐桶字段的钳制哲学，不整批拒绝——避免卡住已部署采集机的队列）。会话级积分（仅积分制来源上报）；**不参与** `total_tokens` 恒等校验与 `models` 求和校验；老 CLI 不传行为逐字不变 |
| `models` | 可选数组，≤32 条；每条 `{model, input_tokens, cached_input_tokens, cache_creation_input_tokens, output_tokens, reasoning_output_tokens, total_tokens}`。`model` trim、≤200、空则 `"unknown"`；同名模型合并求和；每条 `total_tokens` 必须等于自身四项之和；数组非空时 `sum(models.total_tokens)` 必须等于会话 `total_tokens`。缺省或空数组允许，成本按 0 计 |

**project 条目字段**（`projects` 可选，≤200 条；2026-11-06 契约 v3，操作者放行。用途：仪表盘
项目页的仓库链接）。与桶 / 会话不同，**条目逐条丢弃、不整批 400**：不合规的条目（含非对象条目）
丢弃并计入 `projects_skipped`，同请求的桶、会话照常写入——仓库地址是附属元数据，不得卡住采集机
的上传队列（与 `total_cost_usd` / `credits` 钳制而非拒绝同一哲学）。

| 字段 | 说明 |
|---|---|
| `project_key` | 必填字符串；清洗规则与 session 的 `project_key` **同一实现**（去尾部路径分隔符后取 basename、去控制字符、截断 120）；非字符串，或清洗后为空、`.`、`..` → 该条丢弃 |
| `repo_url` | 必填，字符串或显式 `null`（缺省 → 该条丢弃）。字符串必须**逐字**是规范形态 `https://github.com/<owner>/<repo>` 或 `https://gitee.com/<owner>/<repo>`：主机名小写且完全一致（gitlab.com、自建 GitLab、GitHub 企业版等其他主机一律不收）；路径恰好两段，每段 1–100 个 `[A-Za-z0-9._-]` 字符且不为 `.` / `..`，仓库段不以 `.git` 结尾（不区分大小写）；不含凭据、端口、查询串、片段与尾部斜杠；全长 ≤200。服务端只校验、不改写（规范化由 CLI 完成），不合规 → 该条丢弃。`null` = 本设备已检测不到 GitHub / Gitee remote，清除**本设备**此前上报的值 |

**语义与不变量**：

- `hourly` / `account_session_states` 各 **≤500 条**，`sessions` 与 `projects` 各 **≤200 条**，超出 `400`（`projects` 为 `400 {"error":"Too many projects (max 200)"}`）；四者皆空 → `400 {"error":"No usage buckets provided"}`（仅带 `sessions` 或仅带 `projects` 的请求合法；契约 v3 之前是「三者皆空」，旧客户端无可观察差异）。
- `sessions` 缺省、`null` 或空数组均视为未提供；非数组 → `400 {"error":"Invalid session"}`。`models` 非数组、条目非对象同样按非法会话处理。
- `projects` 缺省、`null` 或空数组均视为未提供；非数组 → `400 {"error":"Invalid project"}`。非数组与超 200 条这两类**结构性**错误同样先于任何写入、整批拒绝；条目级不合规只丢该条（见上表）。
- 全局 1 MiB 请求体上限仍然适用（§1.2）；`sessions` 的 200 条上限与体积上限相互独立，超体积按 `413` 拒绝，CLI 需分批上报。
- 请求内去重：用量桶按 `hour_start|source|model|project_key` 分组（2026-11-03 契约 v2 起含 project_key；缺省/未归因按空串参与分组），**保留 `total_tokens` 最大的一条**；会话按 `source|session_id` 分组，**保留 `ended_at` 最大的一条**（同刻取 `total_tokens` 最大，再同取数组靠后者）；project 条目**先逐条校验、再去重**：在合格条目中按清洗后的 `project_key` 分组，**保留数组中靠后的一条**（被覆盖的计入 `projects_skipped`；不合规的靠后条目不会顶掉合格的靠前条目）。
- 落库 upsert 键：用量桶 `(user_id, device_id, hour_start, source, model, project_key)`（2026-11-03 契约 v2 起含 project_key，操作者放行；**桶粒度 last-wins**，这是全系统对账基线（本地 `queue.jsonl` last-wins 总数）的根基）。未归因桶的 `project_key` 在 `token_usage_hourly` 落为**空串 `''`**（主键列不可为 NULL 的工程约束；`token_sessions.project_key` 保持 `null`，两表空值形态不同属有意）。向后兼容承诺：旧客户端不携带 `project_key` 时全部落入未归因桶，键的其余部分与去重/响应行为逐字不变。
- **客户端归因覆盖（2026-11-03 批次 3）**：CLI 对能可靠取得项目路径的来源，在 hourly 行写入 `project_key`。写法是**同键拆行**：同一 `(source, model, hour)` 下按项目各出一条行，再加一条 `project_key: ''` 的「未归因余量」行（聚合值减去各项目桶，逐列 clamp 到 0），拆行合计恒等于原聚合值——不丢行、不改数值、不重复计。项目桶按 `(project, source, model, hour)` 记账；没有项目信息的用量一律留在空串桶。已覆盖（项目解析与增量解析在同一遍、模型可配对）：`claude`、`codex`、`opencode` / `zcode`（含 SQLite 增量）、`qoder` / `qoder-cn`、`grok`、`devin`、`droid`、`antigravity`、`command-code`、`omp`/`omo` 系列、`workbuddy` / `workbuddy-ai`（2026-11-06 CLI 0.5.0 起：项目 pass 与总量 pass 使用**同一模型表达式**，项目桶因此可参与同键拆行；升级后第一次同步只重扫 workbuddy 的项目游标以回填历史，总量游标与对账基线不变）。**未归因**：`gemini`（独立扫描无逐事件模型）、`dsh`（解析器只有用量增量，不建项目桶）、`kimi`（尚未建立项目桶）。**明确不做**：`cursor`、`trae-cn`、`kiro` —— 三者按估算/账户口径产出用量，没有可对应的项目路径，写任何推断值都会污染项目口径。
- 校验先于任何写入：任一条非法则整批拒绝（`400 {"error":"Invalid usage bucket"}` / `"Invalid account session state"` / `"Invalid session"`）。**例外**：账户级来源的会话按上表整条跳过，不触发 400；旧/等值 `ended_at` 快照在写入阶段跳过。
- `account_session_states` 条目：`source` 当前**必须是 `"trae-cn"`**，`session_id` 非空 ≤256，`total_tokens` 必须等于 `input + cached_input + cache_creation + output`；按 `user_id + source + session_id` upsert。
- 会话落库键 `(user_id, device_id, source, session_id)`；**last-wins 以 `ended_at` 严格大于现有值为准**。迁移提供原子 RPC `token_upsert_sessions` 做条件 upsert；旧快照或等值重放只计 `sessions_skipped`，不得覆盖新快照。
- **项目仓库落库（契约 v3）**：表 `token_project_repos`，键 `(user_id, device_id, project_key)`，**每台设备只维护自己的检测结果**——按请求 last-wins 覆盖本设备的值，`null` 同样落库，即只清本设备、不影响其他设备；`updated_at` 取服务端时钟。CLI 只上报相对本地「已确认状态」的变化，设备独占自己的行正是这种增量协议成立的前提（多台设备共用一行时，被另一台覆盖后本机无从得知、也不会重发）。ingest **永不写**仪表盘手动维护的项目资料表 `token_project_profiles`。读取侧属仪表盘自有接口（`/api/app/*`，规则见 `docs/ui-spec.md` 项目节）：手动设置优先；否则取**未吊销设备**中 `updated_at` 最新的非空检测值。
- **项目写入尽力而为（契约 v3）**：`projects` 在桶、会话之后写入；写入失败（例如自托管实例还没执行本次迁移、数据库瞬时错误）只记服务端日志，不影响同请求已提交的写入，响应仍为 `200`，但**省略** `projects_upserted` / `projects_skipped`（与旧服务端同形），CLI 视为未确认、下次同步重试。结构性错误（非数组、超 200 条）仍按上文整批 `400`。
- **credits 语义（2026-10-31 P1）**：credits-only 上报（六个 token 列全 0、`conversations ≥ 1`、仅 `credits` > 0）是合法桶；桶 upsert 是**整行覆盖**，重放自不携带 credits 的客户端会把既有行 credits 覆盖回 0——这是桶粒度 last-wins 的直接推论；credits 不参与请求内"取 `total_tokens` 最大"的去重比较。
- 服务端只持久化上表白名单字段；未知字段一律忽略。`project_key` 只保留 basename，`session_id` 拒绝路径分隔符；不存 prompt、正文、标题、绝对路径、resume command；`repo_url` 只存 github.com / gitee.com 的规范地址，不存本地路径、remote 原文与凭据。
- **隐私评审（2026-11-06，操作者放行）**：`projects` 只收 github.com / gitee.com 两个公共托管主机；gitlab.com、自建 GitLab、企业版主机由 CLI 与服务端双重过滤。托管在 GitHub / Gitee 上的**私有仓库**地址（owner/repo 名）仍会上报，CLI 因此提供关闭开关（默认开启；关闭后既不读取也不上报，已上报的值保留，可在仪表盘手动隐藏）。
- 成功 `200`：`{ "inserted": <桶数>, "skipped": 0, "upload_scope": "private" }`；仅带 `sessions` 时 `inserted` 为 0。请求携带 `sessions` 时追加可选字段 `sessions_upserted`（插入+更新条数）与 `sessions_skipped`（请求内去重丢弃 + 账户级来源 + 旧/等值快照）。旧 CLI 不传 `sessions` 时响应逐字不变。请求携带非空 `projects` 时追加 `projects_upserted`（落库条数）与 `projects_skipped`（条目级丢弃 + 请求内被覆盖），二者之和恒等于 `projects` 数组长度；仅带 `projects` 时 `inserted` 为 0；不传 `projects` 时响应逐字不变。
- **新 CLI × 旧服务端（契约 v3）**：旧服务端忽略 `projects`——带用量的请求照常 `200`，但响应没有 `projects_upserted`，CLI 视为未确认、下次同步重试；仅带 `projects` 的请求在旧服务端得到 `400 {"error":"No usage buckets provided"}`（新服务端对非空 `projects` 永不返回此码），CLI 据此判定服务端不支持，跳过而不算同步失败。上线顺序：服务端先于 CLI。
- 附带一次尽力而为的 `last_used_at` 更新（失败只记日志，**不影响已提交的写入**，响应仍 200）。

### 2.5 `GET /api/functions/token-usage-public-config`（公开｜CLI 面）

给新采集机的安装脚本用，只返回公开值：`200 { "supabase_url", "supabase_anon_key", "dashboard_url": string|null }`。未配置 → `503`。secret key 永不出现在此响应。（`supabase_anon_key` 字段名冻结；Supabase 新 key 体系下该字段的值是 publishable key，公开客户端值的语义不变。）

### 2.6 `GET /api/functions/token-usage-account-summary`（设备令牌或 JWT｜Dashboard 面）

Query：`from`、`to`（`YYYY-MM-DD`，缺省= 首日 / 调用方本地今天）、`tz`（IANA 名）或 `tz_offset_minutes`、`device_id`。

```json
{
  "from": "...", "to": "...", "days": 12,
  "scope": null, "excluded_sources": [],
  "totals": {
    "total_tokens": 0, "billable_total_tokens": 0,
    "input_tokens": 0, "output_tokens": 0,
    "cached_input_tokens": 0, "cache_creation_input_tokens": 0,
    "reasoning_output_tokens": 0, "conversation_count": 0,
    "credits": 0,
    "total_cost_usd": "0.000000"
  },
  "rolling": {
    "last_7d":  { "from","to","active_days", "totals": {"billable_total_tokens","conversation_count"} },
    "last_30d": { "...同上,", "avg_per_active_day": 0 }
  }
}
```

- `total_cost_usd` 为**字符串，固定 6 位小数**；滚动窗口始终以调用方时区的"今天"结尾。
- `totals.credits`（2026-10-31 增量）：厂商积分合计，数字类型。**独立维度**——不参与
  token/成本口径，机制见 `docs/sources-capture-audit.md` §2。

### 2.7 `GET /api/functions/token-usage-account-<series>`（设备令牌或 JWT｜Dashboard 面）

八个只读序列。前六个共享一套时区上下文参数（`tz` / `tz_offset_minutes`）与 `device_id` 过滤；
`sessions` 与 `sync-runs` 使用绝对瞬时窗口，不需要 `tz`。Next.js 实现为**一个**动态路由
（`app/api/functions/[...slug]/route.ts` catch-all 承接 `token-usage-account-<series>` slug，
App Router 的动态段必须独占整段，`token-usage-account-[series]` 形式的"半动态段"目录不成立），
静态兄弟路由优先解析不受影响；series 既可来自路径也可来自 `?series=`。
未知 series → `404 {"error":"Unknown account series: ...","series":[...]}`。

| series | 参数 | 响应顶层 |
|---|---|---|
| `daily` | `from`,`to` 必填；`from` 自动钳制使窗口 ≤1095 天 | `{from,to,data:[{day, total_tokens, billable_total_tokens, total_cost_usd, input_tokens, output_tokens, cached_input_tokens, cache_creation_input_tokens, reasoning_output_tokens, conversation_count, credits, models:{<model>:<tokens>}}]}` |
| `hourly` | `day`（默认今天 UTC） | `{day, data:[{hour:"<day>THH:00:00", …同 daily 行}]}` |
| `monthly` | `from`+`to`，或 `months`(1–24) | `{from,to,data:[{month, …同 daily 行}]}`（**月桶固定 UTC**） |
| `heatmap` | `weeks`(1–104，默认 52)、`to`、`week_starts_on`(sun/mon)、`format=compact` | 完整：`{from,to,week_starts_on,active_days,streak_days:0,weeks:[[cell]],total_cost_usd}`；cell=`{day,total_tokens,billable_total_tokens,level(0–4 按最大计费日四分),models|null,sources|null}`；`sources` 为该日按来源的 token 映射（2026-10-25 增量，可选字段，老客户端忽略）。compact：`{format:"compact",from,to,week_starts_on,active_days,streak_days,max_value,model_names:[],days:[[day,total_tokens,[modelIdx,tokens,…]]]}` |
| `model-breakdown` | `from`,`to` 必填 | `{from,to,days:0,sources:[{source,totals{…,total_cost_usd 字符串 6dp, credits},models:[{model,model_id,pricing,cost_source,totals}}]}],pricing:{model:"per-model",pricing_mode:"per_token_type",source:"litellm",effective_from}}` |
| `devices` | `from`,`to` 必填 | `{from,to,devices:[{id,device_name,platform,created_at,total_tokens,default_device_name}](仅活跃设备，按用量降序),account_sources:[{source,total_tokens}]}` |
| `sessions` | `from`,`to` 必填（ISO 瞬时，按 `ended_at` 落在 `[from,to)`）；`device_id`、`source`、`q`（项目标签子串）、`limit`(1–200，默认 50)、`offset`、`format`（`json` 默认 / `csv`，见下） | `{from,to,total,limit,offset,totals:{sessions,total_tokens,billable_total_tokens,total_cost_usd,credits,duration_ms},facets:{sources:[{source,sessions}],devices:[{device_id,device_name,sessions}]},sessions:[{device_id,device_name,session_id,source,project_key,started_at,ended_at,duration_ms,input_tokens,cached_input_tokens,cache_creation_input_tokens,output_tokens,reasoning_output_tokens,total_tokens,billable_total_tokens,credits,total_cost_usd,models:[{model,total_tokens,total_cost_usd,share}]}]}`；按 `ended_at` 倒序（同刻按 `source`、`session_id` 升序）；`format=csv` 时返回 CSV 附件（见下） |
| `sync-runs` | `from`,`to` 必填（ISO 瞬时，按 `started_at` 落在 `[from,to)`）；`device_id`（UUID）、`trigger`、`result`（枚举同 §2.11）、`limit`(1–200，默认 50)、`offset` | `{from,to,total,limit,offset,totals:{runs,empty_runs,tokens_ingested,sessions_uploaded,duration_ms},runs:[{device_id,device_name,run_id,started_at,ended_at,duration_ms,trigger,result,error_code,empty,parsed_files,buckets_uploaded,tokens_ingested,sessions_uploaded,sessions_skipped,queue_bytes,cli_version,os}]}`；按 `started_at` 倒序（同刻按 `run_id` 升序） |

聚合语义（移植时必须保持）：`source ∈ {cursor, trae-cn}` 是**账户级来源**——cursor 桶跨设备去重（同键取 total 最大/updated_at 最新/device_id 最小者），trae-cn 由会话状态聚合而来且忽略设备状态；带 `device_id` 过滤时账户级来源**整段剔除**；已吊销设备的机器级桶**不进入账户聚合**（行保留在库，重新配对后回来）；成本按读取时定价引擎计算（grok/cline 用 provider 上报值，未知模型/订阅/本地推理计 0）。

**credits 增量（2026-10-31）**：`daily` / `hourly` / `monthly` 行与 `model-breakdown` 的
`totals` 追加 `credits` 数字字段（§2.4 的可选字段透传，独立维度，不参与 token/成本聚合），
旧客户端忽略即可；`heatmap` / `devices` / `sessions` / `sync-runs` 不携带。

**模型名归一口径（2026-10-31）**：`models` 记录与 `model-breakdown` 的模型行按 model 的
**小写折叠键**聚合——采集端/版本间的大小写漂移（如 `GLM-5.3-Flash` vs `glm-5.3-flash`）
不再拆行；记录的键名为该组内 token 份额最大的原始写法。仅聚合口径变更：模型仍是桶
upsert 键的一部分，存储保持采集原串。

Devices 序列语义（2026-10-28 增量）：`default_device_name` 是 §2.2 签发时写入 `token_devices.default_device_name` 的**创建期名称快照**（`<主机名> #<machine_id 前 8 位>`，含重名退避后缀），此后任何改名都不再更新它；该列可空，缺失时响应里为 `null`。设置页的「恢复默认名称」= 客户端把本字段原值作为 `device_name` 提交给 §2.8，**不新增写接口**；重名由 §2.8 的 `409 device_name_taken` 承担。

Sessions 聚合语义（2026-10-25 新增）：仅设备级来源，`cursor` / `trae-cn` 永不出现；已吊销设备的会话行保留在库但**整段剔除**；`total` 是筛选全集计数，`totals` 是筛选全集汇总而非当前页；`billable_total_tokens` 为 `null` 时按 `total_tokens` 计入；`total_cost_usd` 读取时按定价引擎逐模型计算后求和（未知模型计 0），所有层级（`totals` / 会话 / 模型）均为固定 6 位小数字符串；`duration_ms = ended_at - started_at`（毫秒非负整数，`totals.duration_ms` 为筛选全集求和）；`models[].share = model.total_tokens / session.total_tokens`（0–1，保留 4 位小数；会话 total 为 0 时记 0）；跨窗口长会话按 `ended_at` 归属单一窗口，不按天切分（v1 无会话内桶）。`facets.sources` 基于 `from/to` + `device_id` + `q`（忽略 `source`），`facets.devices` 基于 `from/to` + `source` + `q`（忽略 `device_id`）；两者均剔除吊销设备与账户级来源，按 `sessions` 降序，供筛选下拉使用，不受 `limit` / `offset` 影响。参数：`from` / `to` 缺失或不可解析 → `400 {"error":"Missing from/to"}`；`from > to` → `400 {"error":"Invalid from/to"}`；窗口 >1095 天时把 `from` 钳制到 `to - 1095d`；`device_id` 非 UUID → `400 {"error":"Invalid device_id"}`；`source` trim + 转小写、≤100，`cursor` / `trae-cn` 按无结果处理（不 400）；`limit` 非数字按 50、钳制 1–200，`offset` 非数字或负数按 0；`q` trim、≤120、大小写不敏感子串，`%` / `_` / `\` 作为字面量转义。

**Sessions CSV 导出（2026-11-01 增量，Dashboard 面）**：`format=csv` 时响应改为
`text/csv; charset=utf-8` 附件（`Content-Disposition: attachment; filename="token-usage-sessions-<from YYYYMMDD>-<to YYYYMMDD>.csv"`），
沿用同一筛选与 `ended_at` 倒序，**忽略 `limit` / `offset`**，导出筛选全集。上限为
**10,000 行**与**响应体 4 MiB**，先到先截断；响应头 `X-Export-Total`（筛选全集条数）、
`X-Export-Rows`（实际导出条数）、`X-Export-Truncated`（`true` / `false`）。CSV 以 UTF-8 BOM
开头、CRLF 换行、RFC4180 引号转义；以 `= + - @` 或制表符开头的字符串单元格前置 `'`
防公式注入。列固定为：`ended_at,started_at,source,project_key,device_name,duration_ms,
input_tokens,cached_input_tokens,cache_creation_input_tokens,output_tokens,
reasoning_output_tokens,total_tokens,billable_total_tokens,credits,total_cost_usd,models`；
`billable_total_tokens` 为 `null` 时留空；`models` 是 `[{model,total_tokens,total_cost_usd}]`
的 JSON 字符串。不包含 `session_id`、对话内容或路径。`cursor` / `trae-cn` 与空结果返回仅
表头的 CSV；`from` / `to` / `device_id` 等参数错误仍返回 JSON 400，未授权仍返回 JSON 401；
`format` 缺省或非 `csv` 时行为与旧版逐字一致。CSV 响应使用 `Cache-Control: private, no-store`，
不参与 §2.7 的 ETag 协商。

**计价口径注记（2026-10-27）**：sessions 每模型行不带计价时间上下文，定价引擎一律按**峰值价**计算——DeepSeek 的峰谷/周末半价在 sessions 视图不生效，同一笔用量 sessions 的成本因此**可能高于**仪表盘（hourly 按 `hour_start` 走 `isDeepSeekOffPeak`）。这是已接受的口径差异：会话行只有单一 `ended_at`，按其近似计价会引入跨峰谷长会话的另一种误差，v1 保持按峰值计。

Sync-runs 聚合语义（2026-10-27 新增）：`from` / `to` 缺失或不可解析 → `400 {"error":"Missing from/to"}`；`from > to` → `400 {"error":"Invalid from/to"}`；窗口 > 366 天时把 `from` 钳制到 `to - 366d`（运行记录高频滚动，窗口比 sessions 的 1095 天短）；`device_id` 非 UUID → `400 {"error":"Invalid device_id"}`；`trigger` / `result` 非法值按无结果处理（不 400，对齐 sessions 对 `source` 的处理）；`limit` 非数字按 50、钳制 1–200，`offset` 非数字或负数按 0。已吊销设备的运行行保留在库但**整段剔除**（对齐 sessions）；`total` 是筛选全集计数，`totals` 是筛选全集汇总而非当前页；`empty` 为服务端派生布尔（规则同 §2.11），`duration_ms` 为服务端派生（`ended_at - started_at`）。

### 2.8 `POST /api/functions/token-usage-device-rename`（设备令牌=仅自身 / JWT=本账户任意设备｜CLI 面）

- 请求体：`{ "device_id", "device_name" }`；名称折叠空白、trim，长度 1–60。
- 错误码：`400 device_id_and_name_required`｜`400 device_name_length {min:1,max:60}`｜`400 invalid_json`｜`404 device_not_found`（含已吊销目标）｜`403 device_token_scoped_to_own_device`｜`409 device_name_taken`（同账户另一活跃设备同名）。
- 成功 `200 { "device_id", "device_name", "previous_name" }`。
- `default_device_name` 与 `name_customized` **不受本端点影响**（前者是创建期快照，后者 v1 未启用）；恢复默认名称由调用方把快照值当作普通新名字再走一次本端点（§2.7 Devices 序列语义）。

### 2.9 `POST /api/functions/token-usage-device-revoke`（设备令牌=仅自身 / JWT=本账户任意设备｜CLI 面）

- 请求体：`{ "device_id" }`；`400 device_id_required`｜`404 device_not_found`｜`403` 同上。
- 语义：软吊销（保留首个 `revoked_at`，幂等），同时吊销该设备名下所有仍活跃令牌（**响应只含数量，哈希永不出服务端**）；用量行保留在库，但账户聚合按活跃设备过滤。
- 成功 `200 { "device_id", "device_name", "revoked_at", "already_revoked": bool, "revoked_tokens": <count> }`。

### 2.10 `GET /api/functions/token-usage-dashboard`（设备令牌或 JWT｜Dashboard 面）

Query：`range`(≤20 字符，默认 `"custom"`)、`from`、`to`（ISO 时间，`to` 为**开区间**）、`tz`、`tz_offset_minutes`。时间解析失败 → `400 {"error":"Invalid from/to"}`。

响应（仪表盘主 payload，一次性包含筛选范围 + all-time 两个聚合）：

```json
{
  "user": {"id","email":null},
  "generated_at": "ISO",
  "range": {"key","from","to","timezone","offset_minutes"},
  "totals":   {"total_tokens","billable_total_tokens","total_cost_usd","conversations","buckets","active_days","credits","first_hour","last_hour"},
  "all_time": { "…同 totals" },
  "daily":   [{"date","total_tokens","billable_total_tokens","total_cost_usd","conversations","credits"}],
  "models":  [{"model","total_tokens","billable_total_tokens","total_cost_usd","buckets","share"}],  // 最多 24 条
  "sources": [{"source","total_tokens","total_cost_usd","buckets","credits"}],
  "devices": [{"device_id","device_name","platform","active","created_at","last_used_at","last_hour","total_tokens","billable_total_tokens","total_cost_usd","buckets"}],
  "shared_account_sources": {"sources":[…sources 子集],"total_tokens":0,"total_cost_usd":0}
}
```

设备列表排序：活跃设备在前，同状态按用量降序；`last_used_at` 取该设备所有令牌的 `last_used_at`/`created_at` 最大值。

### 2.11 `POST /api/functions/token-usage-sync-report`（仅设备令牌｜CLI 面）

> 2026-10-27 操作者确认设计后实现（0.2.0）；冻结条目见 §3 的 13/14。
> 客户端语义：CLI 每完成一轮 sync（**含空跑**）上报一条运行记录；仅在 init 持久配置
> run-report（默认开，`--run-report=off` 关闭）时发送；`pause` 期间不产生运行。
> 上报是 best-effort——失败只记本地日志，绝不影响当轮数据采集（ingest）。

请求体（单个 JSON 对象；字段白名单之外一律忽略）：

| 字段 | 说明 |
|---|---|
| `run_id` | 必填。客户端生成的运行幂等键（如 `<started_at epoch ms>-<4位hex>`）；trim 非空 ≤128，不含 `/`、`\` 与 Unicode Cc（对齐 `session_id` 的防路径哲学） |
| `started_at` `ended_at` | 必填。可解析 ISO；`ended_at >= started_at`；`duration_ms` 由服务端计算，客户端不上报 |
| `trigger` | 必填。枚举 `scheduled` \| `manual` \| `watch` \| `notify` |
| `result` | 必填。枚举 `ok` \| `partial` \| `error` |
| `error_code` | 可选。trim ≤64 的稳定短码；`result=ok` 时应省略 |
| `parsed_files` | 必填。非负安全整数，本轮扫描的会话文件数 |
| `buckets_uploaded` | 必填。非负安全整数，本轮放入 ingest 请求的桶数 |
| `tokens_ingested` | 必填。非负安全整数，上述桶的 `total_tokens` 之和。**客户端上报口径的遥测**：桶被更大的重放按 last-wins 覆盖时可能高于净增，**不参与对账**——对账基线仍是 §2.4 的桶 upsert 键与本地 queue last-wins 总数 |
| `credits_ingested` | **可选**（2026-10-31 增量）。非负数，四舍五入到 6 位小数，本轮放入 ingest 请求的桶的 `credits` 之和（§2.4）。与 `tokens_ingested` 同为客户端上报遥测口径，**不参与对账**；旧 CLI 不传（服务端按 0 计） |
| `sessions_uploaded` `sessions_skipped` | 必填。非负安全整数 |
| `queue_bytes` | 可选。非负整数或 `null`，本轮结束后本地待传队列字节数（离线/退避排障用） |
| `cli_version` | 必填。trim ≤32（如 `"0.1.0"`） |
| `os` | 可选。trim ≤64（如 `"win32 10.0.26200"`） |

- 校验失败 → `400 {"error":"invalid_sync_report"}`（单一稳定码，细节只进服务端日志）；畸形 JSON → `400 {"error":"invalid_json"}`（§1.2）；鉴权走 §1.4 设备令牌路径（401/403 语义一致）。
- 落库表 `token_sync_runs`：upsert 键 `(user_id, device_id, run_id)`——重放（响应丢失后的重试）返回 `200 {"ok":true,"duplicate":true}`，不产生重复行。RLS 对 anon/authenticated 保持零 policy，读取走 service-role。
- 服务端派生 `empty = tokens_ingested === 0 && sessions_uploaded === 0`，客户端不传该字段；派生规则属于本契约。
- 体量：每设备每小时至多数行，暂不设清理策略；设备"最近采集时间"由读侧 `max(started_at)` 派生，不新增设备列。
- 隐私白名单：只有聚合计数、枚举与版本字符串；不含路径、项目名、会话 ID、错误堆栈。
- 成功 `200 {"ok":true,"duplicate":false}`。

### 2.12 `GET /api/functions/token-usage-account-sync-runs`（设备令牌或 JWT｜Dashboard 面）

> §2.11 的读取面，作为 §2.7 catch-all 的**第 8 个 series**（不新增函数数目）；
> 分页与全集语义对齐 `sessions` series。

Query：`from`、`to`（ISO 瞬时，按 `started_at ∈ [from,to)`）、`device_id`（可选，UUID）、`trigger`（可选，枚举同 §2.11）、`result`（可选，枚举同 §2.11）、`limit`(1–200，默认 50)、`offset`(≥0)。

- 错误：`400 {"error":"Missing from/to"}`｜`400 {"error":"Invalid from/to"}`（`from > to`）｜`400 {"error":"Invalid device_id"}`；窗口 > 366 天时把 `from` 钳制到 `to - 366d`（运行记录高频滚动，窗口比 sessions 的 1095 天短）；`trigger` / `result` 非法值按无结果处理（不 400，对齐 sessions 对 `source` 的处理）。
- 排序 `started_at` 倒序（同刻按 `run_id` 升序）；已吊销设备的运行行保留在库但**整段剔除**（对齐 sessions）；`total` 是筛选全集计数，`totals` 是筛选全集汇总而非当前页。
- 响应：

```json
{
  "from": "...", "to": "...", "total": 0, "limit": 50, "offset": 0,
  "totals": { "runs": 0, "empty_runs": 0, "tokens_ingested": 0, "credits_ingested": 0, "sessions_uploaded": 0, "duration_ms": 0 },
  "runs": [ { "device_id", "device_name", "run_id", "started_at", "ended_at", "duration_ms",
              "trigger", "result", "error_code", "empty",
              "parsed_files", "buckets_uploaded", "tokens_ingested", "credits_ingested",
              "sessions_uploaded", "sessions_skipped", "queue_bytes", "cli_version", "os" } ]
}
```

- `empty` 为服务端派生布尔（规则同 §2.11），供 UI 打"空跑"标记与筛选，客户端无需自行推导。
- `credits_ingested`（2026-10-31 增量）：§2.11 可选遥测字段的读取面透传（行级与 `totals`
  求和，6 位小数）；旧 CLI 的运行行为 0。

### 2.13 `GET /api/functions/token-usage-reconcile`（仅设备令牌｜CLI 面）

> 2026-11-01 新增（`tokenusage reconcile` 的读取面）：采集端把本地 `queue.jsonl` 的 last-wins
> 基线与云端该设备的桶明细逐键比对（基线定义见 AGENTS 硬性约束 8）。只读，只回**令牌所属
> 设备**自己的行——这是"这台机器上报过什么"的对账视角，因此不复用账户聚合：不跨设备去重、
> 不剔除账户级来源、不计成本。

Query：`from`、`to`（ISO 瞬时，按 `hour_start ∈ [from,to)`）、`limit`(1–2000，默认 1000)、
`offset`(≥0)。

- 错误：`400 {"error":"Missing from/to"}`（缺失或不可解析）｜`400 {"error":"Invalid from/to"}`
  （`from > to`）；窗口 > 366 天时把 `from` 钳制到 `to - 366d`；`limit` 非数字按 1000、
  钳制 1–2000；`offset` 非数字或负数按 0。
- 鉴权走 §1.4 的**设备令牌路径**：JWT 不接受（`401`），未知/已吊销令牌 `401`，
  令牌对应设备已吊销 `403 {"error":"Device is revoked"}`；不提供 `device_id` 参数
  （设备恒为令牌所属设备）。
- 成功 `200`：

```json
{
  "from": "...", "to": "...", "device_id": "...", "limit": 1000, "offset": 0,
  "buckets": [ { "hour_start", "source", "model",
                 "project_key",
                 "input_tokens", "cached_input_tokens", "cache_creation_input_tokens",
                 "output_tokens", "reasoning_output_tokens", "total_tokens",
                 "billable_total_tokens", "conversations", "credits" } ]
}
```

- `project_key`（2026-11-03 契约 v2 起随桶返回）：空串 `''` = 未归因（同 §2.4）；
  逐键比对的键随之扩展为 `(hour_start, source, model, project_key)`。

- 排序：`hour_start` 升序 → `source` 升序 → `model` 升序，作为稳定分页依据。
- 行**原样返回**：不聚合、不去重（同一键每设备至多一行，upsert 语义已保证）、不剔除
  `cursor` / `trae-cn`（它们同样是本设备上报的行）。`billable_total_tokens` 可 `null`，
  `credits` 为 6 位小数数字（缺省 0），`conversations` 缺省 0。
- **不返回** `total_cost_usd`（成本是读取时派生，不参与对账），也不返回窗口总行数：
  客户端按末页 `buckets.length < limit` 判断翻页结束。
- `Cache-Control: no-store`（§1.2 默认），无 ETag；`limit=0` 等非法值按上表钳制，不报错。

### 2.14 `GET /api/app/data-version`（仅浏览器会话｜Dashboard 面，2026-11-01）

> 仪表盘数据版本门的变更信号（2026-11-01 操作者批准的缓存方案，非 CLI 面、不参与 §3
> 冻结；随 UI 版本演进，变更回写本文）。鉴权与 `/api/app/sync-runs` 同款（`@supabase/ssr`
> 会话 cookie），无参数、无设备令牌路径。

- 响应 `200 {"version": "<ISO>" | null}`，`Cache-Control: no-store`。
- `version` = 账号可观测状态的最新服务端时钟，取以下三者的最大值（2026-11-04 扩展）：
  1. `token_sync_runs` 中该用户**最新一条非空运行**（`empty = false`，服务端派生标志）的
     `created_at`；
  2. 该用户最新一条 `credits_ingested > 0` 运行的 `created_at`（纯积分上传按 §2.11 派生规则
     仍是 `empty`，但确实改变仪表盘数值）；
  3. 该用户 `token_devices.updated_at` 的最大值（改名/吊销会改变设备名与活跃设备集合，
     进而改变每个缓存 payload）。
  三者均为服务端时钟（`clock_timestamp` / 服务端 `new Date()`），与设备时钟无关；无符合行时
  为 `null`（新账号，客户端视为永不命中缓存）。每项都是 `order by … desc limit 1` 的单条索引读。
- 客户端契约（`dashboard-client` 的 loadAll 版本门）：version 与缓存一致 → 直接水合缓存
  跳过七个重请求；不一致或查询失败 → 正常全量拉取（fail-open）。手动刷新绕过本门
  （兜 reconcile / replay 这类不建 run 行的改数盲区）。payload 按
  `user(JWT sub) + range/tz/device` 键缓存在 sessionStorage（上限 4 组筛选键）。

### 2.13 `GET /api/functions/token-usage-account-project-profiles`（设备令牌或 JWT｜CLI 面 + Dashboard 面）

> 2026-11-11 新增（桌面 D10.1）：桌面「项目与仓库 / 项目详情」要显示 web 端编辑过的项目
> profile（显示名 / logo / repo），而桌面永不读取设备令牌文件（桌面 §3 边界 1）——由
> CLI 以自身持有的令牌代读：新增只读 CLI 子命令 `tokenusage project-profiles`
> （见本节末），本端点是其读取面。挂在 §2.7 catch-all 的 **第 9 个 series**
> （`token-usage-account-<series>`，不新增函数数目）。

Query：无（账号级全集；profile 数量以项目数计，天然有界，无需分页）。

- 鉴权：设备令牌（任意未吊销设备）或用户 JWT，经 `resolvePrincipal`；未带令牌、令牌
  无效或**设备已吊销**一律 `401 {"error":"Unauthorized"}`（§1.4 主链，与 §2.7 各 series
  一致）。
- 响应（200）：

```json
{
  "profiles": [
    {
      "project_key": "token-usage",
      "display_name": "Token Usage",
      "repo_url": "https://github.com/baiwumm/token-usage",
      "repo_source": "manual",
      "detected_repo_url": "https://github.com/baiwumm/token-usage",
      "manual_repo_url": "https://github.com/baiwumm/token-usage",
      "repo_hidden": false,
      "logo_url": "https://…/logo.png",
      "logo_upload_url": "https://…/storage/v1/object/public/avatars/….png"
    }
  ]
}
```

- 字段语义与 `/api/app/projects` 的 profile 完全一致（`loadProjectProfiles(userId)`
  同一读取路径）：`display_name` / `logo_url` 为 dashboard 手工编辑值；
  `logo_upload_url` 为上传 logo 的公共存储直链（webview 可直接 `<img>`，加载失败回落
  字母方块）；`repo_url` = `manual_repo_url ?? (repo_hidden ? null : detected_repo_url)`；
  无手工记录且无探测 repo 的 project_key 不出现在列表中。
- 只读：不写任何表；`Cache-Control: private, no-cache`（无 ETag 协商——profile 低频
  变化，桌面侧自带内存缓存）。
- **CLI 面**：`tokenusage project-profiles`（无参数；输出恒为单行 JSON 到 stdout，
  即上列 payload 原样）。未配对 / 令牌缺失报 `UsageError`（exit 2，hint 提示先
  `tokenusage device-login`）；HTTP 非 2xx 报 `UsageError`（携带状态码与响应体摘要）。
  桌面经 `run_cli` 捕获 stdout 解析，字段以本节为准。

## 3. 冻结不变量清单（逐条对应契约测试）

适用范围：涉及 §2.6–2.10 的条目（6、7 的字段形态与聚合规则，含 `sessions` series）属
Dashboard 档，随 UI 版本可演进（变更需回写本文并同步前端）；其余条目为 CLI 面硬冻结
（§2.4 的 `sessions` / `projects` ingest 校验与 upsert 语义属于 CLI 面）。

1. 规范路径（`token-usage-*`）行为逐字一致，`/device` 页面可达；旧 `tokentracker-*`
   路径已退役（§1.5）：GET 返回 404，写动词返回 405，均无处理器。
2. ingest 的桶粒度 last-wins upsert 键（2026-11-03 契约 v2 起含 `project_key`）与请求内"取 total 最大"去重（分组键同步含 `project_key`）。
3. `user_code` 字母表与 `XXXX-XXXX` 形态；`device_code` 64 位 hex；900 秒 / 5 秒。
4. 令牌只存 sha256，明文仅签发响应一次；吊销即时生效。
5. 错误信封 `{error}` 与 2.1–2.10 列出的全部稳定错误码。
6. 响应字段名与形态（含 `total_cost_usd` 字符串 6dp、`streak_days:0`、`upload_scope:"private"`、Dashboard `models` 截断 24、Sessions `models` ≤32 等细节）。
7. 账户级来源（cursor/trae-cn）的去重与"已吊销设备退出聚合"的规则。
8. CORS 行为、1 MiB 上限、`Cache-Control: no-store`、405/413 行为。
9. ingest `sessions` 的 ≤200 条上限、字段白名单、`total = input + cached + cache_creation + output`、模型求和校验、账户级来源整条跳过、`project_key` 仅 basename、`session_id` 拒绝路径分隔符。
10. `token_sessions` upsert 键 `(user_id, device_id, source, session_id)` 与 `ended_at` 严格 last-wins；旧/等值快照只计 `sessions_skipped`；请求内同键保留 `ended_at` 最大的一条。
11. `account-sessions` 的 `[from,to)` 过滤、`ended_at` 倒序、`total`/`totals` 全集语义、吊销设备剔除、成本读取时计算、`total_cost_usd` 6dp、分页钳制；`format=csv` 的全集导出（忽略分页）、10,000 行 / 4 MiB 截断与 `X-Export-*` 头、BOM/CRLF/RFC4180、公式前缀防护。
12. 旧 CLI 不携带 `sessions` 时请求与响应逐字不变；`sessions_upserted` / `sessions_skipped` 是可选追加字段。
13. sync-report 的逐字段校验（`run_id` ≤128 且拒绝 `/`、`\` 与 Unicode Cc、`trigger`/`result`
    枚举、非负安全整数、`ended_at >= started_at`、可选字段长度上限）与单一稳定码
    `400 invalid_sync_report`；落库键 `(user_id, device_id, run_id)` 幂等——重放返回
    `{"ok":true,"duplicate":true}` 且首写胜出（不覆盖既有行）；`duration_ms` 与
    `empty = tokens_ingested === 0 && sessions_uploaded === 0` 由服务端派生，客户端不传。
14. `account-sync-runs` 的 `[from,to)` 过滤、366 天窗口钳制、`started_at` 倒序（同刻按
    `run_id` 升序）、`total`/`totals` 全集语义、吊销设备剔除、`trigger`/`result` 非法值
    按无结果处理、分页钳制（limit 1–200）。
15. reconcile：`[from,to)` 过滤（按 `hour_start`）、366 天窗口钳制、`hour_start → source →
    model` 升序分页（limit 1–2000）、设备令牌专用鉴权（JWT `401`、吊销设备 `403`、不接受
    `device_id` 参数）、只回本设备行且**不聚合 / 不剔除账户级来源**、响应字段白名单
    （不含 `total_cost_usd`，`credits` 6 位小数、`billable_total_tokens` 可空）。
16. ingest `projects`（契约 v3）：非数组 `400 Invalid project`、超 200 条 `400 Too many projects
    (max 200)`（均先于任何写入）；条目级不合规只丢该条、不影响同批写入；`repo_url` 仅
    GitHub / Gitee 规范形态（主机白名单、恰好两段路径与字符集、每段 ≤100、全长 ≤200、拒
    `.git` 尾）或显式 `null`；`project_key` 与 session 同一清洗；先校验后去重、同键保留靠后
    条目；落库键 `(user_id, device_id, project_key)` 按设备 last-wins、`null` 只清本设备；
    落库列白名单；永不写 `token_project_profiles`；`projects_upserted + projects_skipped =
    projects.length`；写入失败尽力而为（响应省略 `projects_*` 计数，同批其他写入照常）；
    不携带时请求与响应逐字不变，仅带 `projects` 的请求合法。

> §2.11 / §2.12 已于 2026-10-27 随 0.2.0 实现转正式：golden 测试
> `tests/contract/sync-runs.test.ts` 覆盖两端点（校验、幂等重放、空跑派生、筛选分页、
> 吊销剔除、窗口钳制），冻结条目为 §3 的 13/14。

> `credits` 可选字段已于 2026-10-31 随 P1 落地（§2.4 新增可选请求字段，§4 规则允许）：
> 不改变任何既有字段、校验阈值与错误码，旧 CLI 不传时请求与响应逐字不变；golden 覆盖见
> `tests/contract/ingest.test.ts` 的 credits 分组，机制背景见
> `docs/sources-capture-audit.md` §2。

> `projects` 可选字段于 2026-11-06 随契约 v3 立项（§2.4 新增可选请求字段，§4 规则允许）：
> 不改变任何既有字段、校验阈值与错误码，旧 CLI 不传时请求与响应逐字不变；golden 覆盖见
> `tests/contract/ingest.test.ts` 的 projects 分组，冻结条目为 §3 的 16。

## 4. 兼容演进规则

- 只允许**追加可选响应字段**、**新增端点/series** 与**新增可选请求字段**。
- 修改/删除任何现有字段、修改校验阈值（如 500 条上限、`sessions` 200 条、`models` 32 条）、改变 upsert 键，均视为破坏性变更：禁止。
- `sessions` 是 ingest 的可选追加字段；旧 CLI 不传时行为逐字不变。`account-sessions` 是新增
  series，不改变既有六个 series 的响应；`sessions_upserted` / `sessions_skipped` 只在请求
  携带 `sessions` 时追加。
- `credits` 是 ingest 桶的可选追加字段（2026-10-31）；旧 CLI 不传时行为逐字不变，读取侧
  以 0 为缺省（独立维度，不参与 token/成本聚合）。
- `projects` 是 ingest 的可选追加字段（2026-11-06，契约 v3）；旧 CLI 不传时行为逐字不变，
  `projects_upserted` / `projects_skipped` 只在请求携带非空 `projects` 时追加；它把「全空即
  400」的判定从三者扩到四者，对旧客户端无可观察差异。仓库主机白名单（github.com /
  gitee.com）同属隐私白名单：只可收紧，放宽须先回写本文并过隐私评审。
- Sessions 的隐私白名单（不存 prompt、正文、标题、绝对路径、resume command）属于契约，
  不得以"调试字段"或"未来扩展"为名放宽；新增会话字段必须先回写本文并过隐私评审。
- 规范路径命名为 `token-usage-*`；旧 `tokentracker-*` 路径别名已于 2026-11-03 退役
  （§1.5）。未来发布新 CLI 时，新契约挂到 `/api/v2/...` 新路径。
- 冻结语义与客户端归属挂钩：自有 `tokenusage-cli` 上线后，本契约按「CLI 版本 ↔ 服务端
  版本」配对演进——服务端变更随新 CLI 版本发布，客户端与服务端同步升级。
