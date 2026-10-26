# Web 端优化待办清单（2026-10-27 审计）

来源：2026-10-26/27 全量审计。P0/P1 已修复并推送（`3f191ac` 竞态与死锁、`85d1fb4`
快照缓存与格式化缓存，CI 绿）；本文件是**遗留拍板项与剩余任务**的唯一清单，做完一项勾一项，
全部完成后可删除本文件或在标题标注"已清"。

约定：动任何 §2.6/§2.7 冻结行为前，先改 `docs/cli-contract.md` 与 golden 测试 → 操作者确认 →
再改实现（AGENTS 硬性约束 1）。每次提交前跑 `pnpm verify`，conventional commits +
`Co-Authored-By: ZCode` trailer。

---

## 一、待拍板项（先决策，再动代码）

- [ ] **1. Sessions 的 DeepSeek 时间分段计价口径**
  Sessions 每模型成本合成的行没有 `hour_start`，DeepSeek 峰谷/周末半价一律不生效
  （`apps/web/src/lib/api/account-series-handlers.ts` `sessionModelsWire`），同一笔用量
  Sessions 视图成本**高于**仪表盘（hourly 按 `hour_start` 走 `isDeepSeekOffPeak`）。
  二选一：
  - (a) 给 session 模型行带计价时间戳（`ended_at` 近似，多时段会话有误差），与仪表盘对齐
        —— 动 §2.7 响应数值，按冻结流程走；
  - (b) 维持现状，在 §2.7 明示"sessions 每模型成本按峰值计"的口径差异（只改文档）。

- [ ] **2. 仓库行尾治理**
  `core.autocrlf=true` 且无 `.gitattributes`，工作区常年挂 39 个假 M 文件。建议加
  `* text=auto eol=lf` + `git add --renormalize .`（一次全仓库索引变更，需单独提交）。
  顺带处理：`apps/web/src/components/range-preset-buttons.tsx` 有一行非审计产生的
  `fullWidth` prop 排序改动未提交——提交或还原，二选一。

- [ ] **3. ingest 信任面收紧**（三项可一起拍）
  - grok/cline 的 `total_cost_usd` 客户端可信且无上限，持设备令牌者可伪造任意成本
    → 服务端加单行上限（如 ≤ $1/行，超限拒行或钳制）；
  - 头像上传 `useAvatarUpload` 只校验 `image/*`，会放行 SVG 而桶是公共读（存储型 XSS 面，
    UI 走 crop 转 WebP 只是缓解）→ 入口显式拒绝 `image/svg+xml`；
  - `hour_start` 不校验整点精度，非对齐值可造成日桶重复计数 → normalize 收紧为整点
    （或明确接受并在契约注明）。

- [ ] **4. 契约错误信息与限流**
  - 409 透传 PostgREST 原始 `error.message`（含约束名/键值）→ 收敛为稳定错误码；
  - `/api/functions/*` 对 401/404、device-flow `user_code` 猜解无速率限制 → 代码层限流
    或部署侧 WAF 二选一。

- [ ] **5. 热力图大偏移时区边缘天**
  网格按 UTC 日迭代、桶键是 tz-local 日键，UTC+14 等大偏移首尾天的数据落在网格外被丢弃。
  量级小；要修的话把网格首尾各外扩一天再裁剪显示层。

---

## 二、任务清单（按组推进，A → B → C → D）

### A. 复用抽取包（可维护性）

- [ ] A1 `useSessionBootstrap`：6 个页面重复的 `authBrowserClient → getSession → 401
      redirect` 引导 effect 收敛为一个 hook
      （dashboard / sessions / settings / wrapped / device / service-status 各 client）。
- [ ] A2 `useUrlFilters`：dashboard-client 与 sessions-client 各一套
      `parseFilters / serializeFilters / applyFilters / popstate` 收敛为一个 hook。
- [ ] A3 共享 UI 小件：`SectionSkeleton`（两处逐字重复）、`SectionError`（一处封装 +
      三处内联）、`pageItems` 分页省略号（detail-table 与 sessions-client 逐字重复）、
      `Loadable/LoadStatus` 三态（三处定义）、`PendingButton`（isPending+Spinner 六处）。
- [ ] A4 canonical source 聚合：panels ×2 / cost-modal / heatmap-card 四份近似
      「遍历→canonicalSource→累加→排序」收敛为一个纯函数；同名模型合并两份
      （panels TopModels + cost-modal）一并收敛。
- [ ] A5 裸 fetch 收编：settings / device / service-status 的手写 fetch+Bearer+401 分支
      改走 `lib/dashboard/api.ts` 的 `callContract`（含错误消息解析去重）。
- [ ] A6 清理：`formatTokensExact` 纯别名删除（消费点改 `formatTokens`）；
      copy 死键清理（settings.ts 5 个、dashboard.ts 2 个，已 grep 验证 0 引用）；
      CORS 头 proxy.ts ← http.ts 单源；`pricing/matcher.ts` 归一化链条 4 处抽 helper；
      `numberOr0` 三份（series/handlers/usage 的 `number`）收敛；
      `device-codes.ts` 兜底设备名 "TokenTracker CLI" 改 token-usage 并走 copy 体系。

### B. 客户端性能

- [ ] B1 sessions 搜索输入下沉子组件：`qInput` 在根组件受控，每击键重渲染整表
      （防抖只挡了 fetch 没挡渲染）。
- [ ] B2 dashboard-client 传给 TopModels 的 `models={breakdown.flatMap(...)}` 与
      `daily={dashboard?.daily ?? []}` 内联数组移入 useMemo，恢复下游 useMemo 命中；
      HeatmapCard / DetailTable 加 React.memo。
- [ ] B3 CostAnalysisModal 关闭后仍常驻挂载 → 条件渲染（或内部数据 memo）。
- [ ] B4 wrapped 年份切换：无竞态防护（对照 dashboard 新写法加 run-id）、切换整页回落
      loading（改 keep-previous）；年份目前固定 UTC（`getUTCFullYear`），与
      dashboard 的 tz 选择口径不一致。
- [ ] B5 heatmap-card 同时挂 ResizeObserver 和 window resize，尺寸计算跑两遍 → 留一个。
- [ ] B6 `applyFilters` 在 setState updater 里调 `history.replaceState`
      （dashboard + sessions 两处）——副作用移出 updater（StrictMode 双调用风险）。

### C. 服务端性能与健壮性

- [ ] C1 `hourly` 端点：先按请求日 ±1 天 UTC 窗口预过滤行再逐行算时区
      （现在对全历史逐行 `zonedParts`）。
- [ ] C2 `loadSessionRows` / sessions facets：facets 是无窗口全量拉 + JS 过滤，
      历史增长后是该端点慢查询来源 → q/device/source 下推 PostgREST 或加短 TTL 缓存。
- [ ] C3 契约 GET 端点加 ETag / `Cache-Control: private, max-age=N`
      （按账户 `max(updated_at)` 版本化；CLI 轮询与仪表盘刷新受益）。
- [ ] C4 `readJsonBody` 先整读 body 再验 1MiB 上限 → 先查 content-length 或流式累计；
      坏 JSON 现在返回 500，应归 400。
- [ ] C5 pricing `negativeCache` 无界增长（模型名可被设备注入）→ 设上限。
- [ ] C6 索引（数据量涨了再做）：hourly 若做 SQL 聚合需 `(user_id, source, hour_start)`
      类索引；`token_device_tokens` 缺 `(user_id)`（现按 user_id 拉取走 seq scan）。
- [ ] C7 `eslint.config.mjs` 的 `react-hooks/exhaustive-deps: "off"` 降为 `"warn"`，
      修暴露出的真问题（预期有少量）。

### D. 功能建议（产品，逐项独立可做）

- [ ] D1 热力图 cell → `/sessions?from=day&to=day` 交叉跳转（cell 已带 day key），
      形成"异常高峰日 → 查当天会话"闭环。
- [ ] D2 Sessions 表列排序（复用 DetailTable 的 SortDescriptor 实现）+ 导出当前过滤
      结果 CSV。
- [ ] D3 仪表盘自动刷新：5 分钟 interval + `visibilitychange` 暂停 +
      PanelOverlay 静默更新（loadAll 已逐请求落位，直接复用）。
- [ ] D4 趋势图下钻返回路径：hourly 视图加"YYYY-MM-DD · 返回日视图"并高亮对应 bar。
- [ ] D5 月度预算告警：设置存预算数字（zustand persist，与 format-preferences 同模式），
      超阈值 cost KPI 变 danger + toast。

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
