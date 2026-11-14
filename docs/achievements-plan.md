# 成就系统（Achievements）

账号级、只升不降、读时计算的成就系统：20 条成就 × 5 档（铜 / 银 / 金 / 钻 / 王者）。本文是
成就的决策、目录、口径与守卫真源；实施过程与分阶段验收记录见
`docs/archive/achievements-plan-2026-11.md`。页面版式见 `docs/ui-spec.md`「成就」节。

## 1. 已定决策

| # | 决策 | 结论 |
| --- | --- | --- |
| 1 | 界面范围 | 成就页 + 侧栏入口 + wrapped 年度成就卡 + 仪表盘成就条 + 全局解锁 toast + 详情 / 分享弹窗 |
| 2 | 王者稀有度 | 一年重度使用止步金 / 钻；王者需 2 年以上，个别成就终身稀有 |
| 3 | Sessions 类成就 | 4 条（`marathon_session` / `biggest_session` / `project_hopper` / `project_devotion`），UI 标注「自 Sessions 数据可用起统计」 |
| 4 | 阈值校准 | 用一次性只读脚本对真实实例跑完再定稿（§4） |
| 5 | 数据通路 | 同一 route 的 `GET`（计算）+ `POST`（推进已读水位），零新增函数；不设 Server Component 直出分支 |
| 6 | 视觉 | 每条成就一张 AI 生成插画徽章（256×256 透明 PNG）+ 徽章墙；段位由徽章外金属环表达，一张图复用五档；位图加载失败回退参数化 SVG |
| 7 | 3D 翻面硬币 | 详情弹窗头部为可翻面硬币，物理用 `motion/react`（`useMotionValue` / `useReducedMotion`），纯 CSS 无法表达松手惯性 |
| 8 | 徽章资产来源 | 自有 AI 生成（MiniMax `image-01`），不取上游素材或代码；脚本与 prompt 清单在 `scripts/admin/achievement-assets/` |
| 9 | 双语文案 | `lib/copy/achievements.ts` 同时提供 zh / en；英文段位名用 King |
| 10 | 不做 | 元成就（集齐 N 钻 → 专属徽章）、赛季 / 年度挑战、`token_achievements` 写穿缓存——需先满足各自的触发条件（见归档件 P3.6–P3.8） |

## 2. 成就目录

### 2.1 通用规则

- **段位**：`0 = 未解锁`，`1 青铜`、`2 白银`、`3 黄金`、`4 钻石`、`5 王者`。
- **指标单调白名单**（tier 只升不降的前提）：累计和、历史最大值、最长连续、去重计数、距首日
  天数。**禁止**平均值、比率（改写为「单日最佳 + 量门槛」）、成本（定价快照更新会让历史成本回缩）。
- **时间语义**：日界 / 周末 / 夜间一律按用户本地时区；`achieved_at` 为本地日期 `YYYY-MM-DD`。
- **数据口径**：账号级、跨设备、跨 source；含 `cursor` / `trae-cn`（经会话状态合并）；含已吊销
  设备历史（`canonicalizeUsage(hourly, sessionStates, null)`，与 Sessions 页「吊销即排除」的
  差异在代码注释写明）。Sessions 类成就天然不含账户级来源。
- **阈值唯一真源**：`apps/web/src/lib/achievements/catalog.ts`；前端不重复定义，阈值随 payload 下发。
- **校准目标**：一年重度使用 ≈ 金 / 钻；王者 2 年+；任何情况下不允许「首月全钻」。
- **文案基调**：个人编年史，不鼓励烧 token、不鼓励熬夜；健康相关成就带调侃。

### 2.2 20 条成就

| 分类 | id / 名称 | 指标口径 | 青铜 | 白银 | 黄金 | 钻石 | 王者 | 数据源 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 里程碑 | `token_titan` Token 巨擘 | 累计 `total_tokens` | 100M | 1B | 10B | 100B | 1T | 小时行 |
| 里程碑 | `wordsmith` 妙笔生花 | 累计 `output_tokens` | 5M | 25M | 50M | 100M | 300M | 小时行 |
| 里程碑 | `cachekeeper` 缓存藏家 | 累计 `cached_input_tokens` | 10M | 100M | 1B | 10B | 100B | 小时行 |
| 里程碑 | `veteran` 老兵 | 距首条记录所在本地日的天数 | 30d | 90d | 180d | 365d | 730d | 小时行 |
| 高峰 | `big_day` 高光之日 | 单日本地日最大 `total_tokens` | 10M | 100M | 500M | 3B | 10B | 日桶 |
| 高峰 | `cache_alchemy` 缓存炼金 | 单日最高缓存命中率（当日 `total_tokens ≥ 1M`） | 70% | 85% | 93% | 98% | 99.8% | 日桶 |
| 高峰 | `marathon_session` 马拉松会话 | 最长单会话时长（线程存活跨度） | 2h | 6h | 24h | 3d | 14d | sessions |
| 高峰 | `biggest_session` 鸿篇巨制 | 单会话累计 `total_tokens` 峰值 | 1M | 10M | 50M | 100M | 500M | sessions |
| 高峰 | `model_symphony` 模型交响 | 单日出现过的不同模型数 | 2 | 3 | 5 | 8 | 12 | 日桶 models |
| 节奏 | `streak` 火焰 | 最长连续活跃天数 | 3d | 7d | 30d | 100d | 365d | 日桶 |
| 节奏 | `marathoner` 长跑者 | 累计活跃天数 | 7d | 30d | 100d | 365d | 730d | 日桶 |
| 节奏 | `weekend_warrior` 周末战士 | 本地周六 / 周日的活跃天数 | 5 | 20 | 50 | 100 | 200 | 日桶 |
| 节奏 | `night_owl` 夜猫子 | 本地 00:00–05:59 有活跃小时桶的不同日期数 | 3 | 10 | 30 | 60 | 120 | 小时行 |
| 节奏 | `early_bird` 晨型人 | 本地 06:00–08:59 有活跃小时桶的不同日期数 | 3 | 10 | 30 | 60 | 120 | 小时行 |
| 探索 | `polyglot` 模型通 | 不同模型数 | 5 | 15 | 30 | 60 | 100 | 小时行 |
| 探索 | `multitool` 多面手 | 不同 `source` 数 | 2 | 4 | 6 | 12 | 20 | 小时行 |
| 探索 | `project_hopper` 项目游侠 | 不同 `project_key` 数（非空） | 3 | 5 | 12 | 25 | 60 | sessions |
| 探索 | `project_devotion` 专情项目 | 单项目累计 `total_tokens` 最大值 | 1M | 10M | 100M | 1B | 10B | sessions |
| 探索 | `fleet` 多设备舰队 | 曾出现过的不同 `device_id` 数（含已吊销） | 2 | 3 | 4 | 5 | 7 | 设备 / 小时行 |
| 探索 | `sync_diligence` 采集纪律 | 连续有成功 sync 的本地日数（`result ∈ {ok, partial}`） | 7d | 30d | 90d | 180d | 365d | sync_runs |

补充定义：

- **活跃日**：本地时区当天 `total_tokens > 0`。
- **缓存命中率**：`cached_input / (input + cached_input + cache_creation)`，输出不计。
- **模型数**：按小时桶 `model` 去重（不做别名归一）。
- **单项目 token**：按 `project_key` 聚合 `token_sessions.total_tokens` 后取最大。
- **采集纪律**：同一本地日至少一条成功 run 即算；断档归零，取历史最长。
- **`multitool` 上限**：王者阈值不得超过 CLI 真实可达 source 数（`AUTO_SYNC_SOURCES`），当前定为 20。
- **校准基线**：真实实例（16 个月 / 23.72B tokens / 102 活跃日 / 699 会话 / 17 个 source）最高
  7 条钻石、0 条王者，符合「王者需 2 年以上」。

数据覆盖说明（必须进 UI 文案）：4 条 Sessions 类成就自 `token_sessions` 开始采集起统计；
`sync_diligence` 自 `token_sync_runs`（CLI 0.2.0）起统计。

### 2.3 候选：`deep_thinker` 深度思考

累计 `reasoning_output_tokens`，阈值草案 1M / 10M / 100M / 1B / 10B。**暂不上线**：校准实例
reasoning 覆盖率 31.4%，低于 50% 门槛；覆盖率提升后复议，不影响现有 20 条。

备选 `conversationalist` 对话家（累计 `conversations`，100 / 500 / 2K / 10K / 50K）区分度较低，
除非操作者偏好。

## 3. 技术方案

### 3.1 数据通路

- **接口**：`GET /api/app/achievements?tz=<IANA>&tz_offset_minutes=<n>`；
  `POST /api/app/achievements`（body `{"seen_through":"YYYY-MM-DD"}`，同一 route，零新增函数）。
- **鉴权**：浏览器会话 cookie（复用 `sync-runs` route 的 `@supabase/ssr` 模式）；响应全部 `no-store`。
- **加载**：小时行 / 账户级会话状态复用 `loadAccountUsage(userId)`（10s TTL 快照）；会话与 sync
  runs 分别走 `loadSessionRows` / `loadSyncRunRows`，窗口从最早记录日（或 `2000-01-01`）到当日
  UTC 次日零点；设备行取 `usage.deviceRows`（含已吊销与从未产生用量的已配对设备）。
- **计算**：`lib/achievements/compute.ts` 纯函数；不建快照表、不 cron、不写库。
- **已读水位**：`token_achievement_seen` 每用户单行 `seen_through`（本地日，只前进）。`GET` 下发
  `seen_through`，`POST` 推进（400 非法日期 / 503 写失败；迁移缺失时 `GET` 自动降级为 `null`）。
- **缓存**：v1 不加结果缓存；若实测单次 > 300ms，再加按 `user + tz` 的 60s 内存缓存。

### 3.2 模块布局

```text
apps/web/public/achievement-art/  # 20 张徽章插画（URL 避开受保护页面前缀）
apps/web/src/lib/achievements/
  catalog.ts      # 阈值唯一真源、分类、指标 kind、文案 key、art 路径
  compute.ts      # 纯函数：输入数据 → 成就进度
  art-fit.ts      # 徽章尺寸归一化表（实测硬币半径）
  highlights.ts   # 新解锁 / 最近解锁 / 最接近解锁
  seen.ts         # 已读水位读写（服务端）
  share.ts        # 分享卡投影 + 文件名
  api.ts          # 客户端 fetch 封装 + 响应类型
apps/web/src/app/api/app/achievements/route.ts
apps/web/src/app/achievements/page.tsx
apps/web/src/components/achievements/     # client / body / summary / card / dialog / coin / medallion / art / tiers / share-dialog / skeleton / unlock-watcher / use-*
apps/web/src/components/dashboard/        # achievement-strip.tsx / achievement-strip-section.tsx
apps/web/src/components/share-card/achievement.ts
apps/web/src/lib/copy/achievements.ts
apps/web/tests/unit/achievements-*.test.ts
scripts/admin/achievements-calibrate.mjs
```

命名遵循 `AGENTS.md`：页面级 `<页名>-client/body/skeleton`、`<内容>-card/dialog`、`use-*.ts`；
跨页共享件放 `components/` 根。

### 3.3 响应形状

```json
{
  "generated_at": "2026-10-30T08:00:00.000Z",
  "seen_through": "2026-10-29",
  "achievements": [
    {
      "id": "token_titan",
      "category": "milestone",
      "unit": "tokens",
      "tier": 2,
      "value": 2345678901,
      "thresholds": [100000000, 1000000000, 10000000000, 100000000000, 1000000000000],
      "next_threshold": 10000000000,
      "achieved_at": {
        "bronze": "2025-01-03",
        "silver": "2025-06-11",
        "gold": null,
        "diamond": null,
        "king": null
      }
    }
  ]
}
```

- `unit ∈ {tokens, days, count, duration_ms, percent, ratio}`；`cache_alchemy` 的 value 与
  thresholds 用 0–1 小数（UI 格式化为 %）。
- `achieved_at` 键固定五档，未达成 `null`；日期为用户本地日。
- 前端按 `value` 与 `thresholds` 自行计算进度条；阈值只来自 payload。
- `POST` 只回 `{"seen_through":"<生效值>"}`，只前进不回退。

### 3.4 计算规则（`achieved_at` 回推）

| 指标类型 | 扫描逻辑 | 达成日 |
| --- | --- | --- |
| 累计型 | 日桶按日期升序 running sum | running sum 首次越过阈值的那天 |
| 峰值型 | 逐日维护历史最大值（比率型带当日量门槛） | 首个满足该档条件的日期 |
| 连续型 | 维护 current streak，断档归零，记录历史最长 | current streak 首次达到该档的那天 |
| 去重型 | 按时间顺序把模型 / source / 项目 / 设备加入 Set | Set 大小首次达到该档的日期 |
| 时间型 | 首条记录本地日 → now | 首条记录日 + N 天 |

实现细节：复用 `lib/account/series.ts` 的 `parseTzContext` / `zonedDayKey` / `zonedParts`，与
heatmap、sessions 的时区语义一致；`now` 由调用方注入（路由传 `new Date()`，测试传固定值）；
单遍扫描日桶（O(rows + days)），会话按 `project_key` 聚合为 Map，sync runs 按本地日归并；
单调性不变量由单测覆盖。

### 3.5 交互要点

- **页面**：摘要（段位合计 x/{条数×5} + 细进度条 + 段位计数行行尾「已解锁 y/20」）→ 四个分区
  （里程碑 / 高峰 / 节奏 / 探索）→ 徽章墙栅格；已解锁在前，锁定项显示当前值与下一档进度。
- **墙格**：位图徽章 + 名称 + 段位文字（或未解锁的细进度条）；整格是单一可聚焦按钮，数字与
  描述下沉到弹窗。
- **徽章**：段位金属外环叠在位图外（占直径 6%），未解锁灰化 + 锁标，加载失败回退 SVG。
- **新解锁标记**：游标是账号级 `seen_through`（跨设备一致）；「新」角标在本次访问内保持可见，
  渲染后把水位推进到 `maxAchievedDay`。`seen_through === null` 视为首次基线，静默写入、不标「新」。
- **全局 toast**：`achievement-unlock-watcher.tsx` 挂在 `AppShell`，每次整页加载跑一次（1.2s 延迟），
  跳过 `/achievements` 与隐藏页；一条聚合 toast 最多列 2 个名称，其余写「等 N 枚」。
- **仪表盘成就条**：位于 Heatmap 之后、趋势之前，上下两组各 ≤5 条（「最近解锁」与「最接近
  解锁」），点击打开与成就页一致的详情弹窗；全部无数据时整条隐藏。
- **wrapped**：独立成就卡，列出截至所选年份年末已解锁的成就（`achieved_at ≤ 12-31`，段位降序），
  成就请求全历史只拉一次，年份截断在展示层。
- **分享卡**：已解锁详情底部「分享成就」，Canvas 2D 绘制 1080×1350，只含聚合数据；文件名
  `token-usage-<id>-<tier>.png`。
- **3D 硬币**：原生 `button` + `aria-pressed`，Enter / Space 可翻，`Tooltip` 提示；背面为段位
  金属盘 + 段位名 + 达成日；关闭或切换成就时复位，`prefers-reduced-motion` 下无入场与摆动。

### 3.6 性能与安全

- 快照复用 10s TTL 缓存；成就只增加 CPU 遍历，不增加小时行查询。全历史 sessions 扫描是唯一
  新增 I/O；会话量级过大时先限制窗口并在文案说明，或改 SQL 聚合 RPC。
- 成就页、仪表盘条与全局 watcher 都走 `fetchAchievementsShared`，按 `tz|offset` 在途去重
  （settle 即清、无 TTL）。自定义时区与浏览器时区不同会各算一次（达成日口径不同，属预期）。
- 数据访问仅服务端 service-role；浏览器零直连；`anon` / `authenticated` 对所有 `token_*` 表零 policy。
- `token_achievement_seen`：RLS 开启且零 policy，`revoke all from public, anon, authenticated`、
  `grant all to service_role`；只存已读水位。
- 写路径用「条件更新 + 首写 insert（主键冲突 → 409 重读重试，最多 3 次）」保证只前进；写失败回
  503，读失败只记日志并降级为 `null`。
- 分享卡在浏览器内绘制，徽章图是同源静态 PNG（canvas 不被跨域污染）。

## 4. 阈值校准流程

1. 只读脚本：读 `SUPABASE_URL`、`SUPABASE_SECRET_KEY`、`ACHIEVEMENTS_USER_ID`，不写库、不打印
   token 明文。
2. 加载该用户全历史（小时行 + 账户级会话状态 + sessions + sync runs），按本地时区计算 20 条
   指标与五档命中。
3. 输出每条成就的当前值、按现行阈值命中的段位，以及一年重度使用的参考区间。
4. 校准原则：一年重度 ≈ 金 / 钻；王者 2 年+；无成就首月满级；不可达档位及时下调。
5. 定稿：更新 `catalog.ts` → 更新 §2 表格 → 守卫测试通过。读时计算下阈值变更会立即重算并可能
   追授段位，这是预期行为，不做历史冻结。

## 5. 测试与守卫

- **compute 单测**：五类指标边界值、时区日界、跨月 / 跨年 streak、周末 / 夜间计数、去重计数、
  吊销设备不清零、`achieved_at` 回推、单调性（追加数据 tier 不降）、固定 `now`。
- **catalog 守卫**：id 唯一；阈值长度 5 且严格递增；kind ∈ 单调白名单；每条有 zh/en 文案；
  图标 key 可解析；`art` 与资产文件一一对应；`art` 不落在任何受保护页面前缀下（匿名公开页
  可直取图片），且不存在遗留的 `public/achievements/` 目录。
- **highlights 单测**：排序与并列、`unlocksSince` 的 `null` / 新旧水位、`countUnlocked`、
  `isDayKey` 拒绝非法日期。
- **分享卡投影单测**：字段、zh/en 段位名、空 handle 回退、未解锁 / 未知 id → `null`、文件名。
- **路由测试**：未登录 401；非法 `tz`；响应字段类型与 `achieved_at` 键集合；GET 带
  `seen_through`；POST 的 401 / 400 / 首次插入 / 旧值不回退 / 新值前进 / 503，且全部 `no-store`。
- **代理守卫**：契约测试断言 `/achievements` 未登录跳 `/login?next=/achievements`。
- **文案守卫**：toast / 翻面 / 分享卡 key 在 zh/en 成对。
- **人工验收**：正常 / 空数据 / 锁定进度 / 时区切换 / 375px / 深色 / reduced-motion；仪表盘条、
  toast、翻面、分享卡、未登录直跳。

## 6. 风险与回滚

| 风险 | 应对 |
| --- | --- |
| Sessions 历史覆盖有限 | UI 明示「自 Sessions 数据可用起统计」 |
| 阈值定得不合理 | 校准脚本 + 守卫测试；读时计算可随时调，立即生效 |
| 数据被人工删改导致掉级 | 自部署场景接受；正常采集路径 append-only |
| 历史行数过大导致请求变慢 | 先加 60s 结果缓存；再改 SQL 聚合 RPC 或写穿表 |
| 健康类成就价值观风险 | 阈值保守 + 文案调侃；不做「当前连续」压力机制 |
| 插画风格漂移 | 统一风格模板 + 硬性 QA（纯黑虚空背景 / 正圆硬币居中占幅 70–95%），不合格换 seed |
| 资产体积 | 调色板量化后单张 17–30 KB，合计 ~420 KB；`sharp` 未安装时脚本跳过量化 |
| 全局 toast 刷屏 | 每次整页加载只检查一次；跳过成就页与隐藏页；首次基线静默；一条聚合 toast |
| 未执行迁移 | GET 降级 `seen_through: null`，页面正常，「新」标记与 toast 自动关闭；POST 回 503 |
| 已读水位并发 / 回退 | 条件更新只前进；首写 insert 冲突 409 后重读重试 |
| 分享卡字体 / 断图 | 绘制前 `await document.fonts.ready`；断图画金属盘占位，导出不中断 |
| 回滚 | 代码 `git revert`；新增表独立且只级联 `auth.users`，保留无副作用 |

## 7. 文档联动

- 阈值变更：`catalog.ts` + 守卫测试 + 本文 §2 表格。
- 版式变更：`docs/ui-spec.md`「成就」节。
- 新增成就：`apps/web/public/achievement-art/<id>.png` + `apps/web/public/achievement-art/README.md`
  的资产清单。资产 URL 不得落在 `src/proxy.ts` 的 `PROTECTED_PAGES` 前缀下——公开页
  `/u/<token>` 的匿名访客必须能直取图片；守卫测试见
  `apps/web/tests/unit/achievements-catalog.test.ts` 与 `tests/contract/route-guard.test.ts`。
- 需求范围变更：`docs/requirements.md`「范围」表。
