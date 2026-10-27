# Web 端优化待办清单（2026-10-27 审计）

来源：2026-10-26/27 全量审计。P0/P1 已修复并推送（`3f191ac` 竞态与死锁、`85d1fb4`
快照缓存与格式化缓存，CI 绿）；本文件是**遗留拍板项与剩余任务**的唯一清单，做完一项勾一项，
全部完成后可删除本文件或在标题标注"已清"。

约定：动任何 §2.6/§2.7 冻结行为前，先改 `docs/cli-contract.md` 与 golden 测试 → 操作者确认 →
再改实现（AGENTS 硬性约束 1）。每次提交前跑 `pnpm verify`，conventional commits +
`Co-Authored-By: ZCode` trailer。

---

## 一、待拍板项（2026-10-27 操作者裁定：全部按建议执行，已落实）

- [x] **1. Sessions 的 DeepSeek 时间分段计价口径** → 选 (b)：维持现状，§2.7 已明示
      "sessions 每模型成本按峰值计"的口径差异（`9ea6102`）。
- [x] **2. 仓库行尾治理** → 已加 `.gitattributes`（`* text=auto` + 二进制标注）。
      renormalize 实测零变化：历史 blob 本就是 LF，假 M 是 stat 缓存噪声，attributes
      落地后消失。range-preset-buttons 残留已在 `78ad4e4` 提交。（提交归属注意：该文件
      被并行会话的 docs 提交 `844ee35` 带上远端。）
- [x] **3. ingest 信任面收紧**（`e72a8cf`）——两项与原建议有偏差，基于实现证据修正：
  - `total_cost_usd`：**钳制 ≤ $10/行**（原建议 $1 + 拒行）。改钳制：整批 400 会卡住
    已部署采集机的队列（CLI 侧 sanitize 不知道新规则）；放宽到 $10：一小时 API 成本
    超 $1 的重度使用真实存在，$1 会误伤。
  - `hour_start`：**明确接受非整点并在 §2.4 注明**（原建议拒整点）。证据：CLI 采集端
    大量使用半小时桶（`toUtcHalfHourStart`，`:00`/`:30`），golden 也有 `09:30:00Z`
    用例——强制整点会打断现网采集，"日桶重复计数"的前提不成立（读取侧是累加非 upsert）。
  - 头像 SVG：入口显式拒绝（`useAvatarUpload` + accept 白名单收紧为 PNG/JPEG/WebP）。
- [x] **4. 契约错误信息与限流**（`e72a8cf` + `9ea6102`）
  - 409：rename 的 update 竞态（预检后撞唯一约束）现在捕获 `SupabaseError(409)` 并返回
    稳定码 `device_name_taken`，不再透传 PostgREST 原文（契约 §2.8 本就定义了该码，
    属实现对齐）。
  - 限流：**部署侧**（新契约 §1.6）：serverless 下进程内计数不成立；user_code 猜解
    风险接受（32⁸ 空间 + 15 分钟过期 + 无枚举侧信道），部署时配平台速率规则即可。
- [x] **5. 热力图大偏移时区边缘天** → 接受现状：只影响 UTC+14 等极端时区的首尾各一天
      显示，等真实用户出现再修（修复是纯客户端网格外扩，不动契约）。
- [x] **6. 设备名兜底改名** → 已按冻结流程执行：§2.2 文本 + 单测断言先改（`9ea6102`），
      实现改 `Token Usage CLI`（`e72a8cf`）。仅影响更名后新配对的设备显示名。

---

## 二、任务清单（按组推进，A → B → C → D）

### A. 复用抽取包（可维护性）

- [x] A1 `useSessionBootstrap`：6 个页面重复的 `authBrowserClient → getSession → 401
      redirect` 引导 effect 收敛为一个 hook
      （dashboard / sessions / settings / wrapped / device / service-status 各 client）。
      注：device 与 service-status 是按需实时取 session（非引导 effect），保留原样；
      实际收敛 dashboard / sessions / settings / wrapped 四个引导 effect。
- [x] A2 `useUrlFilters`：dashboard-client 与 sessions-client 各一套
      `parseFilters / serializeFilters / applyFilters / popstate` 收敛为一个 hook。
- [x] A3 共享 UI 小件：`SectionSkeleton`（两处逐字重复）、`SectionError`（一处封装 +
      三处内联）、`pageItems` 分页省略号（detail-table 与 sessions-client 逐字重复）、
      `Loadable/LoadStatus` 三态（三处定义）、`PendingButton`（isPending+Spinner 六处）。
- [x] A4 canonical source 聚合：panels ×2 / cost-modal / heatmap-card 四份近似
      「遍历→canonicalSource→累加→排序」收敛为一个纯函数；同名模型合并两份
      （panels TopModels + cost-modal）一并收敛（`components/dashboard/aggregate.ts`）。
- [x] A5 裸 fetch 收编：settings / device / service-status 的手写 fetch+Bearer+401 分支
      改走 `lib/dashboard/api.ts` 的 `callContract`（含错误消息解析去重）。
- [x] A6 清理：`formatTokensExact` 纯别名删除（消费点改 `formatTokens`）；
      copy 死键清理（settings.ts 5 个、dashboard.ts 2 个，已 grep 验证 0 引用）；
      CORS 头 proxy.ts ← http.ts 单源；`pricing/matcher.ts` 归一化链条 4 处抽 helper；
      `numberOr0` 三份（series/handlers/usage 的 `number`）收敛；
      ~~`device-codes.ts` 兜底设备名 "TokenTracker CLI" 改 token-usage 并走 copy 体系~~
      **未做**：兜底名是冻结契约 §2.2 明文 + 单测断言，按硬性约束 1 需先改契约文档与
      golden 测试并经操作者确认，移交拍板项 6。

### B. 客户端性能

- [x] B1 sessions 搜索输入下沉子组件：`qInput` 在根组件受控，每击键重渲染整表
      （防抖只挡了 fetch 没挡渲染）→ `SessionSearchInput` 内聚 draft，外部提交经
      `committed` prop 同步回来。
- [x] B2 dashboard-client 传给 TopModels 的 `models={breakdown.flatMap(...)}` 与
      `daily={dashboard?.daily ?? []}` 内联数组移入 useMemo，恢复下游 useMemo 命中；
      HeatmapCard / DetailTable 加 React.memo。
      注：flatMap 已随 A4 消除（TopModels 直接收 sources）；useMemo 化的是
      daily/monthly/breakdown 三个 fallback 数组与 activeDevices；TopModels 同样
      memo 化。
- [x] B3 CostAnalysisModal 关闭后仍常驻挂载 → 内部数据 memo（选了方案二的变体：
      保留挂载以维持关闭动画，models/trend/sourceRows 全部 useMemo，关闭态引用
      不变时重渲染成本趋近零）。
- [x] B4 wrapped 年份切换：无竞态防护（对照 dashboard 新写法加 run-id）、切换整页
      回落 loading（改 keep-previous，header 内联 Spinner 指示）；年份目前固定
      UTC（`getUTCFullYear`），与 dashboard 的 tz 选择口径不一致 → 改浏览器时区。
- [x] B5 heatmap-card 同时挂 ResizeObserver 和 window resize，尺寸计算跑两遍 →
      留 ResizeObserver。
- [x] B6 `applyFilters` 在 setState updater 里调 `history.replaceState`
      （dashboard + sessions 两处）——副作用移出 updater（StrictMode 双调用风险）。
      注：随 A2 `useUrlFilters` 完成（URL 重写在 effect 中，updater 只做纯 merge）。

### C. 服务端性能与健壮性

- [x] C1 `hourly` 端点：先按请求日 ±1 天 UTC 窗口预过滤行再逐行算时区
      （现在对全历史逐行 `zonedParts`）→ `hourlySeriesForDay` 以 ±15h UTC 毫秒窗口
      粗滤（IANA 偏移极值 −12..+14），行内只 parse 一次 ms 并复用。
- [x] C2 `loadSessionRows` / sessions facets → 采 TTL 缓存方案（下推 q/device/source
      需要为 facets 再拉一遍，得不偿失）：按 (user, from, to) 单飞 + 10s TTL，与
      account 快照共用失效 revision（ingest/revoke/rename 自动击穿），
      `TOKEN_USAGE_SESSION_CACHE=off` 供测试关闭。
- [x] C3 契约 GET 端点加 ETag → 用协商缓存而非 max-age：account series（catch-all
      七个）+ account-summary + dashboard 的成功 GET 现在带强 ETag（payload sha256）
      和 `Cache-Control: private, no-cache`，If-None-Match 命中回 304——新鲜度永不
      被信任（ingest 随时写数据），省的是响应体传输。§1.2/§2.7 已回写，golden 加
      4 个用例。CLI 面端点保持冻结的 no-store。
- [x] C4 `readJsonBody` → Content-Length 预检（超限未读 body 即 413，读后仍验实际
      长度防谎报）；坏 JSON 归 `400 {"error":"invalid_json"}`（原 reference 的
      generic 500 对客户端错误语义不当，§1.2 已回写，golden 两个用例更新）。
- [x] C5 pricing `negativeCache` 上限 4096，满则清空（照 formatterCache 先例；
      注入名风暴只会重走表，不会无界增长）。
- [ ] C6 索引（数据量涨了再做）：hourly 若做 SQL 聚合需 `(user_id, source, hour_start)`
      类索引；`token_device_tokens` 缺 `(user_id)`（现按 user_id 拉取走 seq scan）。
      **保持待办**：当前量级（~20B tokens / 448 sessions）无感知，动迁移要走
      rewrite-plan §3/§6 流程。
- [x] C7 `react-hooks/exhaustive-deps` 已降为 `"warn"`：零警告——A/B 组的 hook 化
      重构后依赖数组全部规范，无历史欠账要还。

### D. 功能建议（产品，逐项独立可做）

- [x] D1 热力图 cell → `/sessions?from=day&to=day` 交叉跳转（cell 已带 day key），
      形成"异常高峰日 → 查当天会话"闭环。
      实现：cell 在传入 `onDaySelect` 时渲染为 button（hover 放大 + 焦点环）；
      sessions 的 `parseFilters` 接受一次性 from/to 初始窗（合法且顺序正确才采纳，
      自身筛选仍不回写 URL，符合 2026-10-26 裁定）。
- [ ] D2 Sessions 表列排序 + 导出当前过滤结果 CSV。**保留待办**：排序要给
      account-sessions 加 `order` 参数、CSV 要加 `format=csv`（§2.7 是 Dashboard 面
      可演进，但仍是契约变更：文档回写 + golden + 前端 UI 三块），体量相当于半个
      新功能，值得单独一批做并单独验收。
- [x] D3 仪表盘自动刷新：5 分钟 interval + `visibilitychange` 暂停 +
      PanelOverlay 静默更新（切回可见立即刷新并重置计时；loadAll run-id 保证
      叠加刷新安全）。
- [x] D4 趋势图下钻返回路径：hourly 视图头部加"{日期} · 返回日视图"按钮；
      TrendChart 新增 `selectedKey`，下钻期间日视图其余 bar 降透明度高亮来处。
- [x] D5 月度预算告警：`stores/budget-store.ts`（zustand persist，USD 数字，
      0=关闭）；settings 账户页新增预算卡；仪表盘按当月 UTC 月桶成本对比，超阈值
      hero 成本行变 danger + toast 每次跨越只提示一次。
- [ ] D6 采集记录页（功能，2026-10-27 新增）：契约草案已确认待实现——
      `docs/cli-contract.md` §2.11（`POST token-usage-sync-report`，CLI 每轮
      sync 上报，幂等 `run_id`、含空跑、best-effort、init 持久配置
      `--run-report` 默认开）与 §2.12（`GET token-usage-account-sync-runs`，
      §2.7 第 8 个 series）。**实现等本轮 web 大施工收尾后进行**（端点与页面
      均在 apps/web 侧）；web 侧要做：迁移表 `token_sync_runs`、路由、侧边栏
      "采集记录"菜单、列表页（设备/触发方式/结果筛选 + 空跑标记 + 分页）。

---

## 三、本轮已完成（存档，勿重复做）

- dashboard `loadAll` 竞态防护（run-id）+ 逐请求落位（`3f191ac`）。
- settings 设备 Tab 三请求 try/finally，解 busy 死锁（`3f191ac`）。
- `loadAccountUsage` 单飞 + 10s TTL 缓存；ingest / device-revoke / device-rename 失效
  钩子；测试经 `TOKEN_USAGE_USAGE_CACHE=off` 关闭（`85d1fb4`）。
- `computeRowCost` WeakMap 正缓存（`85d1fb4`）。
- Intl formatter 缓存：服务端 `zonedParts` 每时区一枚，客户端 `core.ts` memo 表
  （`85d1fb4`）。
- 无 tz 日桶回退统一为 UTC；`usage.ts` 的 `dayKey` 副本并入 `zonedDayKey`（`85d1fb4`）。
- `next.config.mjs` 开启 `optimizePackageImports`（`85d1fb4`）。
- 已知非问题：heatmap `streak_days: 0` 是契约文档化的占位字段（§2.7），不是 bug。
